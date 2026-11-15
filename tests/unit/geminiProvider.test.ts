/**
 * Exercises the REAL @google/genai SDK against a local mock HTTP server, so we verify the
 * request shape and response/error handling of our adapter without a live key or network.
 * (A live-key smoke test is a separate manual step — see README.)
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createGeminiProvider } from "../../server/services/ai/geminiProvider.ts";
import { generateStudySet } from "../../server/services/ai/studyService.ts";
import { ProviderError } from "../../server/services/ai/types.ts";
import { SAMPLE_NOTES, makeContent } from "../fixtures/study.ts";

interface Captured {
  url: string;
  headers: IncomingMessage["headers"];
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

async function startMock(handler: (cap: Captured, respond: (status: number, json: unknown) => void, raw: IncomingMessage) => void) {
  const captured: Captured[] = [];
  server = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const cap: Captured = { url: req.url ?? "", headers: req.headers, body: data ? JSON.parse(data) : {} };
      captured.push(cap);
      handler(cap, (status, json) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      }, req);
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { baseUrl, captured };
}

const geminiReply = (text: string) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });
const request = (signal = new AbortController().signal) => ({
  systemInstruction: "SYS",
  prompt: "PROMPT",
  jsonSchema: { type: "object", properties: { a: { type: "string" } } },
  signal,
});

describe("createGeminiProvider (real SDK, mock server)", () => {
  it("sends structured-output config, model, key and prompt; returns the text", async () => {
    const { baseUrl, captured } = await startMock((_c, respond) => respond(200, geminiReply('{"ok":true}')));
    const provider = createGeminiProvider("test-key-123", "gemini-test-model", { baseUrl });
    const text = await provider.generate(request());

    expect(text).toBe('{"ok":true}');
    const c = captured[0];
    expect(c.url).toContain("gemini-test-model:generateContent");
    expect(c.headers["x-goog-api-key"]).toBe("test-key-123");
    expect(JSON.stringify(c.body)).toContain("PROMPT");
    expect(c.body.systemInstruction.parts[0].text).toBe("SYS");
    expect(c.body.generationConfig.responseMimeType).toBe("application/json");
    expect(c.body.generationConfig.responseJsonSchema).toEqual({ type: "object", properties: { a: { type: "string" } } });
  });

  it("maps HTTP 429 to a rate_limited ProviderError and 5xx to unavailable", async () => {
    const { baseUrl } = await startMock((_c, respond) => respond(429, { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }));
    await expect(createGeminiProvider("k", "m", { baseUrl }).generate(request())).rejects.toMatchObject({ kind: "rate_limited" });
    await new Promise<void>((r) => server!.close(() => r()));

    const second = await startMock((_c, respond) => respond(500, { error: { code: 500, message: "boom", status: "INTERNAL" } }));
    const err = await createGeminiProvider("k", "m", { baseUrl: second.baseUrl }).generate(request()).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("unavailable");
  });

  it.each([
    [403, "config"],
    [404, "config"],
    [400, "config"],
    [408, "unavailable"],
    [503, "unavailable"],
  ])("classifies HTTP %i as %s and keeps the status", async (status, kind) => {
    const { baseUrl } = await startMock((_c, respond) => respond(status, { error: { code: status, message: "x", status: "X" } }));
    const err = await createGeminiProvider("k", "m", { baseUrl }).generate(request()).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ kind, httpStatus: status });
  });

  it("sends attachments as inline base64 parts after the text, with the sniffed MIME type", async () => {
    const { baseUrl, captured } = await startMock((_c, respond) => respond(200, geminiReply('{"ok":true}')));
    const pdf = Buffer.from("%PDF-1.4 hello");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await createGeminiProvider("k", "m", { baseUrl }).generate({
      ...request(),
      attachments: [
        { mimeType: "application/pdf", data: pdf },
        { mimeType: "image/png", data: png },
      ],
    });
    const parts = captured[0].body.contents[0].parts;
    expect(parts[0]).toEqual({ text: "PROMPT" });
    expect(parts[1]).toEqual({ inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } });
    expect(parts[2]).toEqual({ inlineData: { mimeType: "image/png", data: png.toString("base64") } });
    expect(captured[0].body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("keeps the plain-text request shape when there are no attachments", async () => {
    const { baseUrl, captured } = await startMock((_c, respond) => respond(200, geminiReply("{}")));
    await createGeminiProvider("k", "m", { baseUrl }).generate({ ...request(), attachments: [] });
    expect(captured[0].body.contents[0].parts).toEqual([{ text: "PROMPT" }]);
  });

  it("treats a 400 as a file problem only when files were sent; 401/403 stay config", async () => {
    const files = [{ mimeType: "application/pdf", data: Buffer.from("%PDF-") }];
    const a = await startMock((_c, respond) => respond(400, { error: { code: 400, message: "bad pdf", status: "INVALID_ARGUMENT" } }));
    const withFiles = await createGeminiProvider("k", "m", { baseUrl: a.baseUrl }).generate({ ...request(), attachments: files }).catch((e) => e);
    expect(withFiles).toMatchObject({ kind: "bad_input", httpStatus: 400 });
    await new Promise<void>((r) => server!.close(() => r()));

    const b = await startMock((_c, respond) => respond(403, { error: { code: 403, message: "key", status: "PERMISSION_DENIED" } }));
    const forbidden = await createGeminiProvider("k", "m", { baseUrl: b.baseUrl }).generate({ ...request(), attachments: files }).catch((e) => e);
    expect(forbidden).toMatchObject({ kind: "config", httpStatus: 403 });
  });

  it("returns an empty string (not a crash) when Gemini returns no candidates", async () => {
    const { baseUrl } = await startMock((_c, respond) => respond(200, { candidates: [] }));
    expect(await createGeminiProvider("k", "m", { baseUrl }).generate(request())).toBe("");
  });

  it("rejects promptly when the abort signal fires mid-request", async () => {
    const { baseUrl } = await startMock(() => {
      /* never respond */
    });
    const ctl = new AbortController();
    const p = createGeminiProvider("k", "m", { baseUrl }).generate(request(ctl.signal));
    setTimeout(() => ctl.abort(), 30);
    await expect(p).rejects.toBeDefined();
  });

  it("works end-to-end through the study service: valid output on the first call", async () => {
    const { baseUrl, captured } = await startMock((_c, respond) => respond(200, geminiReply(JSON.stringify(makeContent()))));
    const set = await generateStudySet({
      provider: createGeminiProvider("k", "m", { baseUrl }),
      notes: SAMPLE_NOTES,
      mode: "both",
      requestId: "t",
      timeoutMs: 2000,
      logger: { info() {}, warn() {}, error() {} },
    });
    expect(set.flashcards).toHaveLength(3);
    expect(captured).toHaveLength(1);
  });
});
