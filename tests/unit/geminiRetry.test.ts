/**
 * Retry and fallback behaviour of the Gemini adapter, exercised with the real SDK against a local mock server.
 * Delays are a few milliseconds so the suite stays fast.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.ts";
import { DEFAULT_AI_TIMEOUT_MS, DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, loadConfig } from "../../server/config.ts";
import { createGeminiProvider, DEFAULT_RETRY_DELAYS_MS, type RetryEvent } from "../../server/services/ai/geminiProvider.ts";
import { CLIENT_TIMEOUT_MS, CLIENT_TIMEOUT_WITH_FILES_MS } from "../../src/lib/api/studyApi.ts";
import { SAMPLE_NOTES, makeContent } from "../fixtures/study.ts";

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
  servers = [];
});

type Reply = [status: number, body?: unknown];
const err = (status: number, label: string): Reply => [status, { error: { code: status, message: "x private notes y", status: label } }];
const ok = (text = "{}"): Reply => [200, { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] }];

/** Mock Gemini: `script` maps a model name to the replies it gives, in order (the last one repeats). */
async function mock(script: Record<string, Reply[]>) {
  const calls: string[] = [];
  const seen: Record<string, number> = {};
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const model = /models\/([^:/]+):generateContent/.exec(req.url ?? "")?.[1] ?? "?";
      calls.push(model);
      const replies = script[model] ?? [err(404, "NOT_FOUND")];
      const [status, body] = replies[Math.min(seen[model] ?? 0, replies.length - 1)];
      seen[model] = (seen[model] ?? 0) + 1;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body ?? {}));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls };
}

const req = (signal = new AbortController().signal) => ({ systemInstruction: "S", prompt: "P", jsonSchema: { type: "object" }, signal });
const fast = { retryDelaysMs: [5, 5] };

describe("retrying a overloaded model", () => {
  it("retries a 503 on the same model and returns the answer when it recovers", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE"), err(503, "UNAVAILABLE"), ok('{"a":1}')] });
    const events: RetryEvent[] = [];
    const text = await createGeminiProvider("k", "main", { baseUrl, ...fast, onRetry: (e) => events.push(e) }).generate(req());
    expect(text).toBe('{"a":1}');
    expect(calls).toEqual(["main", "main", "main"]);
    expect(events.map((e) => [e.attempt, e.next, e.status])).toEqual([[1, "retry", 503], [2, "retry", 503]]);
    expect(events[0].reason).toBe("ApiError/UNAVAILABLE");
  });

  it("recovers from a single 503 with one retry", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE"), ok("{}")] });
    await createGeminiProvider("k", "main", { baseUrl, ...fast }).generate(req());
    expect(calls).toEqual(["main", "main"]);
  });

  it("gives up after the retries when nothing else is configured, as an 'unavailable' error", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE")] });
    const e = await createGeminiProvider("k", "main", { baseUrl, ...fast }).generate(req()).catch((x) => x);
    expect(e).toMatchObject({ kind: "unavailable", httpStatus: 503 });
    expect(calls).toHaveLength(3); // the first try plus two retries
  });

  it("also retries other 5xx errors and a dropped connection", async () => {
    const a = await mock({ main: [err(500, "INTERNAL"), ok()] });
    await createGeminiProvider("k", "main", { baseUrl: a.baseUrl, ...fast }).generate(req());
    expect(a.calls).toHaveLength(2);

    // Nothing is listening on port 1: every attempt fails at the network level.
    const events: RetryEvent[] = [];
    const e = await createGeminiProvider("k", "main", { baseUrl: "http://127.0.0.1:1", ...fast, onRetry: (x) => events.push(x) }).generate(req()).catch((x) => x);
    expect(e).toMatchObject({ kind: "unavailable" });
    expect(events).toHaveLength(2);
  });

  it("retries are switched off with an empty delay list", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE"), ok()] });
    await expect(createGeminiProvider("k", "main", { baseUrl, retryDelaysMs: [] }).generate(req())).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toHaveLength(1);
  });
});

describe("falling back to a second model", () => {
  it("moves to the fallback after the main model keeps failing, and returns its answer", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE")], backup: [ok('{"from":"backup"}')] });
    const events: RetryEvent[] = [];
    const text = await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "backup", onRetry: (e) => events.push(e) }).generate(req());
    expect(text).toBe('{"from":"backup"}');
    expect(calls).toEqual(["main", "main", "main", "backup"]);
    expect(events.at(-1)).toMatchObject({ model: "main", next: "fallback" });
  });

  it("goes straight to the fallback on an exhausted quota (429), because quotas are per model", async () => {
    const { baseUrl, calls } = await mock({ main: [err(429, "RESOURCE_EXHAUSTED")], backup: [ok()] });
    await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "backup" }).generate(req());
    expect(calls).toEqual(["main", "backup"]); // no pointless retries on a model with no quota left
  });

  it("reports rate_limited when both models are out of quota", async () => {
    const { baseUrl, calls } = await mock({ main: [err(429, "RESOURCE_EXHAUSTED")], backup: [err(429, "RESOURCE_EXHAUSTED")] });
    const e = await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "backup" }).generate(req()).catch((x) => x);
    expect(e).toMatchObject({ kind: "rate_limited", httpStatus: 429 });
    expect(calls).toEqual(["main", "backup"]);
  });

  it("reports the failure when the fallback fails too (with one retry on the fallback)", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE")], backup: [err(503, "UNAVAILABLE")] });
    const e = await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "backup" }).generate(req()).catch((x) => x);
    expect(e).toMatchObject({ kind: "unavailable", httpStatus: 503 });
    expect(calls).toEqual(["main", "main", "main", "backup", "backup"]);
  });

  it("does not use a fallback that is the same as the main model", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE")] });
    await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "main" }).generate(req()).catch(() => {});
    expect(calls).toHaveLength(3);
  });
});

describe("failures that must NOT be retried or rerouted", () => {
  it.each([
    [400, "INVALID_ARGUMENT", "config"],
    [401, "UNAUTHENTICATED", "config"],
    [403, "PERMISSION_DENIED", "config"],
    [404, "NOT_FOUND", "config"],
  ])("a %i is reported at once: no retry, no fallback (a wrong key or model name must stay visible)", async (status, label, kind) => {
    const { baseUrl, calls } = await mock({ main: [err(status, label)], backup: [ok()] });
    const e = await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "backup" }).generate(req()).catch((x) => x);
    expect(e).toMatchObject({ kind, httpStatus: status });
    expect(calls).toEqual(["main"]);
  });

  it("a 400 with files attached is a file problem, reported at once", async () => {
    const { baseUrl, calls } = await mock({ main: [err(400, "INVALID_ARGUMENT")], backup: [ok()] });
    const e = await createGeminiProvider("k", "main", { baseUrl, ...fast, fallbackModel: "backup" })
      .generate({ ...req(), attachments: [{ mimeType: "application/pdf", data: Buffer.from("%PDF-") }] })
      .catch((x) => x);
    expect(e).toMatchObject({ kind: "bad_input" });
    expect(calls).toEqual(["main"]);
  });
});

describe("cancelling and timing out", () => {
  it("stops waiting between retries the moment the request is cancelled", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE")] });
    const ctl = new AbortController();
    const started = Date.now();
    const p = createGeminiProvider("k", "main", { baseUrl, retryDelaysMs: [5_000, 5_000] }).generate(req(ctl.signal)).catch((x) => x);
    setTimeout(() => ctl.abort(), 150);
    await p;
    expect(Date.now() - started).toBeLessThan(2_000); // not the 5 s back-off
    expect(calls).toHaveLength(1);
  });

  it("the overall time limit still bounds the retries", async () => {
    const { baseUrl } = await mock({ main: [err(503, "UNAVAILABLE")] });
    const started = Date.now();
    const e = await createGeminiProvider("k", "main", { baseUrl, retryDelaysMs: [5_000] })
      .generate(req(AbortSignal.timeout(200)))
      .catch((x) => x);
    expect(e).toBeDefined();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("the default back-off is short enough to fit inside the server's 30 s limit", () => {
    expect(DEFAULT_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThan(5_000);
  });
});

describe("through the API", () => {
  it("a user sees a normal study set when Gemini blips once", async () => {
    const { baseUrl, calls } = await mock({ main: [err(503, "UNAVAILABLE"), ok(JSON.stringify(makeContent()))] });
    const app = createApp({ provider: createGeminiProvider("k", "main", { baseUrl, ...fast }), aiTimeoutMs: 5000, logger: { info() {}, warn() {}, error() {} } });
    const res = await request(app).post("/api/study/generate").send({ notes: SAMPLE_NOTES, mode: "both" });
    expect(res.status).toBe(200);
    expect(res.body.studySet.flashcards.length).toBeGreaterThan(0);
    expect(calls).toEqual(["main", "main"]);
  });

  it("retry log events carry only labels, never the notes or the key", async () => {
    const { baseUrl } = await mock({ main: [err(503, "UNAVAILABLE")], backup: [ok(JSON.stringify(makeContent()))] });
    const events: RetryEvent[] = [];
    const provider = createGeminiProvider("SECRET-KEY-VALUE", "main", { baseUrl, ...fast, fallbackModel: "backup", onRetry: (e) => events.push(e) });
    const app = createApp({ provider, aiTimeoutMs: 5000, logger: { info() {}, warn() {}, error() {} } });
    await request(app).post("/api/study/generate").send({ notes: SAMPLE_NOTES, mode: "both" });
    const logged = JSON.stringify(events);
    expect(events.length).toBeGreaterThan(0);
    expect(logged).not.toMatch(/SECRET-KEY|private notes|Photosynthesis/);
  });
});

describe("timeouts", () => {
  it("the browser always waits longer than the server's worst case, so the server's own typed error reaches the user", () => {
    expect(loadConfig({}).aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
    // Worst case: the first call and one repair, each using its whole limit (doubled when files are attached).
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(2 * DEFAULT_AI_TIMEOUT_MS);
    expect(CLIENT_TIMEOUT_WITH_FILES_MS).toBeGreaterThan(2 * 2 * DEFAULT_AI_TIMEOUT_MS);
  });
  it("AI_TIMEOUT_MS still overrides, and junk falls back to the default", () => {
    expect(loadConfig({ AI_TIMEOUT_MS: "12000" }).aiTimeoutMs).toBe(12000);
    expect(loadConfig({ AI_TIMEOUT_MS: "abc" }).aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(loadConfig({ AI_TIMEOUT_MS: "-5" }).aiTimeoutMs).toBe(DEFAULT_AI_TIMEOUT_MS);
  });
});

describe("model configuration", () => {
  it("defaults to the steadier model with the lighter one as the fallback", () => {
    const c = loadConfig({});
    expect(c.geminiModel).toBe(DEFAULT_MODEL);
    expect(c.geminiFallbackModel).toBe(DEFAULT_FALLBACK_MODEL);
  });
  it("swaps the default fallback when the main model is the light one", () => {
    expect(loadConfig({ GEMINI_MODEL: DEFAULT_FALLBACK_MODEL }).geminiFallbackModel).toBe(DEFAULT_MODEL);
  });
  it("honours GEMINI_FALLBACK_MODEL, and 'none' turns it off", () => {
    expect(loadConfig({ GEMINI_FALLBACK_MODEL: "gemini-x" }).geminiFallbackModel).toBe("gemini-x");
    expect(loadConfig({ GEMINI_FALLBACK_MODEL: "none" }).geminiFallbackModel).toBeUndefined();
    expect(loadConfig({ GEMINI_FALLBACK_MODEL: "OFF" }).geminiFallbackModel).toBeUndefined();
  });
  it("never lets the fallback equal the main model", () => {
    expect(loadConfig({ GEMINI_MODEL: "m", GEMINI_FALLBACK_MODEL: "m" }).geminiFallbackModel).toBeUndefined();
  });
});
