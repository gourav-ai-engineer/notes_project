import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app.ts";
import { loadConfig } from "../../server/config.ts";
import type { AiProvider } from "../../server/services/ai/types.ts";
import { SAMPLE_NOTES } from "../fixtures/study.ts";

const failing: AiProvider = {
  async generate() {
    throw new Error("boom"); // any outcome counts as a used call; we only care about the limiter
  },
};
const quiet = { info() {}, warn() {}, error() {} };
const post = (app: ReturnType<typeof createApp>, ip?: string) => {
  const r = request(app).post("/api/study/generate");
  return (ip ? r.set("X-Forwarded-For", ip) : r).send({ notes: SAMPLE_NOTES, mode: "both" });
};

describe("generate rate limit", () => {
  it("allows the configured number of calls, then answers 429 with a typed, retryable error", async () => {
    const app = createApp({ provider: failing, aiTimeoutMs: 1000, logger: quiet, rateLimit: { max: 2, windowMs: 60_000 } });
    expect((await post(app)).status).not.toBe(429);
    expect((await post(app)).status).not.toBe(429);
    const blocked = await post(app);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: "AI_RATE_LIMITED", retryable: true });
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("does not count health checks or static requests", async () => {
    const app = createApp({ provider: failing, aiTimeoutMs: 1000, logger: quiet, rateLimit: { max: 1, windowMs: 60_000 } });
    for (let i = 0; i < 5; i++) expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await post(app)).status).not.toBe(429);
  });

  it("keeps separate counts per client behind a trusted proxy", async () => {
    const app = createApp({ provider: failing, aiTimeoutMs: 1000, logger: quiet, rateLimit: { max: 1, windowMs: 60_000 }, trustProxyHops: 1 });
    expect((await post(app, "203.0.113.1")).status).not.toBe(429);
    expect((await post(app, "203.0.113.1")).status).toBe(429);
    expect((await post(app, "203.0.113.2")).status).not.toBe(429);
  });

  it("is off when max is 0 or no limit is given", async () => {
    for (const rateLimit of [{ max: 0, windowMs: 60_000 }, undefined]) {
      const app = createApp({ provider: failing, aiTimeoutMs: 1000, logger: quiet, rateLimit });
      for (let i = 0; i < 4; i++) expect((await post(app)).status).not.toBe(429);
    }
  });

  it("rejects an over-limit client before reading its upload", async () => {
    const app = createApp({ provider: failing, aiTimeoutMs: 1000, logger: quiet, rateLimit: { max: 1, windowMs: 60_000 } });
    await post(app);
    const res = await request(app)
      .post("/api/study/generate")
      .attach("files", Buffer.from("%PDF-1.4 hello"), "a.pdf");
    expect(res.status).toBe(429);
  });
});

describe("rate limit config", () => {
  it("defaults to 10/min in production and off elsewhere", () => {
    expect(loadConfig({ NODE_ENV: "production" }).rateLimitPerMin).toBe(10);
    expect(loadConfig({}).rateLimitPerMin).toBe(0);
  });
  it("honours RATE_LIMIT_PER_MIN, including 0 to disable, and ignores junk", () => {
    expect(loadConfig({ NODE_ENV: "production", RATE_LIMIT_PER_MIN: "30" }).rateLimitPerMin).toBe(30);
    expect(loadConfig({ NODE_ENV: "production", RATE_LIMIT_PER_MIN: "0" }).rateLimitPerMin).toBe(0);
    expect(loadConfig({ NODE_ENV: "production", RATE_LIMIT_PER_MIN: "abc" }).rateLimitPerMin).toBe(10);
    expect(loadConfig({ NODE_ENV: "production", RATE_LIMIT_PER_MIN: "-5" }).rateLimitPerMin).toBe(10);
  });
});
