import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { LIMITS } from "../../shared/contract.ts";
import { createApp } from "../../server/app.ts";
import { ProviderError, type AiProvider, type ProviderRequest } from "../../server/services/ai/types.ts";
import type { Logger } from "../../server/services/ai/studyService.ts";
import { SAMPLE_NOTES, makeContent, makeContentFor } from "../fixtures/study.ts";

type Step = string | Error | ((req: ProviderRequest) => Promise<string>);

/** Scripted provider: each call consumes the next step. Records every request. */
function fakeProvider(steps: Step[]) {
  const calls: ProviderRequest[] = [];
  const provider: AiProvider = {
    async generate(req) {
      calls.push(req);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      if (typeof step === "function") return step(req);
      return step;
    },
  };
  return { provider, calls };
}

const silentLogger = (): Logger & { lines: string[] } => {
  const lines: string[] = [];
  const push = (m: string, meta?: Record<string, unknown>) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`);
  return { info: push, warn: push, error: push, lines };
};

const json = (v: unknown) => JSON.stringify(v);
const body = { notes: SAMPLE_NOTES, mode: "both" };

function setup(steps: Step[], aiTimeoutMs = 1000) {
  const f = fakeProvider(steps);
  const logger = silentLogger();
  const app = createApp({ provider: f.provider, aiTimeoutMs, logger });
  return { app, logger, ...f };
}

describe("POST /api/study/generate — success", () => {
  it("returns a normalized StudySet", async () => {
    const { app, calls } = setup([json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(200);
    expect(res.body.studySet).toMatchObject({ title: "Photosynthesis", mode: "both" });
    expect(res.body.studySet.flashcards).toHaveLength(3);
    expect(res.body.studySet.quiz[0].id).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("sends the mode, a JSON schema, and the notes to the provider", async () => {
    const { app, calls } = setup([json(makeContentFor("quiz"))]);
    await request(app).post("/api/study/generate").send({ notes: SAMPLE_NOTES, mode: "quiz" });
    expect(calls[0].prompt).toContain("Mode: quiz");
    expect(calls[0].prompt).toContain(SAMPLE_NOTES);
    expect(calls[0].jsonSchema).toHaveProperty("properties.quiz");
    expect(calls[0].jsonSchema).not.toHaveProperty("$schema");
  });

  it("strips content that was not requested", async () => {
    const { app } = setup([json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send({ notes: SAMPLE_NOTES, mode: "flashcards" });
    expect(res.status).toBe(200);
    expect(res.body.studySet.quiz).toEqual([]);
  });
});

describe("POST /api/study/generate — request validation", () => {
  it.each([
    ["missing body", undefined],
    ["empty notes", { notes: "", mode: "both" }],
    ["short notes", { notes: "tiny", mode: "both" }],
    ["whitespace-only notes", { notes: " ".repeat(50), mode: "both" }],
    ["too-long notes", { notes: "x".repeat(LIMITS.notesMax + 1), mode: "both" }],
    ["bad mode", { notes: SAMPLE_NOTES, mode: "essay" }],
    ["non-string notes", { notes: 42, mode: "both" }],
  ])("rejects %s with 400 INVALID_REQUEST", async (_name, payload) => {
    const { app, calls } = setup([json(makeContent())]);
    const req = request(app).post("/api/study/generate");
    const res = await (payload === undefined ? req : req.send(payload));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
    expect(res.body.error.requestId).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("returns JSON 400 for malformed request JSON (not an HTML stack trace)", async () => {
    const { app } = setup([json(makeContent())]);
    const res = await request(app).post("/api/study/generate").set("Content-Type", "application/json").send('{"notes": ');
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns JSON 413 for an oversized body", async () => {
    const { app } = setup([json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send({ notes: "x".repeat(300_000), mode: "both" });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns JSON 404 for unknown routes", async () => {
    const { app } = setup([]);
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("serves a health check", async () => {
    const { app } = setup([]);
    expect((await request(app).get("/api/health")).body).toEqual({ ok: true });
  });
});

describe("POST /api/study/generate — bad model output", () => {
  it("repairs malformed JSON with exactly one extra call", async () => {
    const { app, calls } = setup(['{"title": "oops', json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("previous response was rejected");
    expect(calls[1].prompt).toContain('{"title": "oops');
  });

  it("repairs a wrong-shaped object", async () => {
    const { app, calls } = setup([json({ title: "x" }), json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("summary");
  });

  it("returns 502 AI_INVALID_OUTPUT when the repair is also invalid — never more than 2 calls", async () => {
    const { app, calls } = setup(["not json", "still not json", json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: "AI_INVALID_OUTPUT", retryable: true });
    expect(calls).toHaveLength(2);
  });

  it("returns 502 AI_EMPTY_OUTPUT when output stays empty", async () => {
    const { app, calls } = setup(["", "  "]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("AI_EMPTY_OUTPUT");
    expect(calls).toHaveLength(2);
  });

  it("returns AI_EMPTY_OUTPUT when valid JSON contains no usable items", async () => {
    const empty = json({ ...makeContent(), flashcards: [], quiz: [] });
    const { app } = setup([empty, empty]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.body.error.code).toBe("AI_EMPTY_OUTPUT");
  });
});

describe("POST /api/study/generate — provider failures", () => {
  it("maps provider unavailability to 503 AI_PROVIDER_ERROR without retrying", async () => {
    const { app, calls } = setup([new ProviderError("unavailable", "status 500 secret-detail")]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: "AI_PROVIDER_ERROR", retryable: true });
    expect(JSON.stringify(res.body)).not.toContain("secret-detail");
    expect(calls).toHaveLength(1);
  });

  it("maps unknown exceptions (e.g. network) to AI_PROVIDER_ERROR", async () => {
    const { app } = setup([new TypeError("fetch failed")]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_PROVIDER_ERROR");
  });

  it("maps a rejected key/model (4xx) to a non-retryable AI_CONFIG_ERROR and logs the upstream status", async () => {
    vi.stubEnv("GEMINI_API_KEY", "sk-SUPER-SECRET");
    const { app, logger, calls } = setup([new ProviderError("config", "status 403", 403)]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: "AI_CONFIG_ERROR", retryable: false });
    expect(res.body.error.message).toMatch(/GEMINI_API_KEY/);
    const logged = logger.lines.join("\n");
    expect(logged).toContain('"providerStatus":403');
    expect(logged).not.toContain("sk-SUPER-SECRET");
    expect(calls).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it("maps rate limiting to 429", async () => {
    const { app } = setup([new ProviderError("rate_limited")]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("AI_RATE_LIMITED");
  });

  it("maps a missing API key to 503 AI_NOT_CONFIGURED (non-retryable)", async () => {
    const { app } = setup([new ProviderError("not_configured")]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: "AI_NOT_CONFIGURED", retryable: false });
  });

  it("returns 504 AI_TIMEOUT when the provider hangs, honouring the abort signal", async () => {
    const hang = (req: ProviderRequest) =>
      new Promise<string>((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const { app, calls } = setup([hang], 50);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(504);
    expect(res.body.error).toMatchObject({ code: "AI_TIMEOUT", retryable: true });
    expect(calls).toHaveLength(1);
  });

  it("times out on a hung repair call too", async () => {
    const hang = (req: ProviderRequest) =>
      new Promise<string>((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    const { app, calls } = setup(["garbage", hang], 50);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.status).toBe(504);
    expect(calls).toHaveLength(2);
  });
});

describe("secrets and privacy", () => {
  it("never leaks notes, raw model output, or stack traces in responses or logs", async () => {
    const secretNotes = "PRIVATE-NOTES-MARKER " + "x".repeat(40);
    const { app, logger } = setup(["RAW-MODEL-GARBAGE-MARKER", "RAW-MODEL-GARBAGE-MARKER"]);
    const res = await request(app).post("/api/study/generate").send({ notes: secretNotes, mode: "both" });
    const everything = JSON.stringify(res.body) + logger.lines.join("\n");
    expect(everything).not.toContain("PRIVATE-NOTES-MARKER");
    expect(everything).not.toContain("RAW-MODEL-GARBAGE-MARKER");
    expect(everything).not.toMatch(/at .*\.ts:\d+/);
  });

  it("does not echo the API key from the environment", async () => {
    vi.stubEnv("GEMINI_API_KEY", "sk-SUPER-SECRET");
    const { app, logger } = setup([new ProviderError("unavailable")]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(JSON.stringify(res.body) + logger.lines.join("")).not.toContain("sk-SUPER-SECRET");
    vi.unstubAllEnvs();
  });

  it("attaches a request ID header that matches the error body", async () => {
    const { app } = setup([new ProviderError("unavailable")]);
    const res = await request(app).post("/api/study/generate").send(body);
    expect(res.headers["x-request-id"]).toBe(res.body.error.requestId);
  });
});
