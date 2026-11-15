import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.ts";
import { createGeminiProvider, describeFailure } from "../../server/services/ai/geminiProvider.ts";
import { ProviderError } from "../../server/services/ai/types.ts";
import { SAMPLE_NOTES } from "../fixtures/study.ts";

const SECRET_NOTES = "my private biology notes about mitochondria and ribosomes " + SAMPLE_NOTES;

describe("describeFailure", () => {
  it("names the error type and a network code, never the message", () => {
    const err = new TypeError("fetch failed: https://x.example/?key=SECRET-KEY-123", { cause: Object.assign(new Error("boom"), { code: "ENOTFOUND" }) });
    const out = describeFailure(err);
    expect(out).toBe("TypeError/ENOTFOUND");
    expect(out).not.toMatch(/SECRET|x\.example/);
  });

  it("extracts only Google's status label from an API error body", () => {
    const err = Object.assign(new Error('{"error":{"code":503,"message":"The model is overloaded. my private notes","status":"UNAVAILABLE"}}'), { name: "ApiError" });
    expect(describeFailure(err)).toBe("ApiError/UNAVAILABLE");
    expect(describeFailure(err)).not.toMatch(/private|overloaded/);
  });

  it("handles things that are not errors", () => {
    expect(describeFailure("nope")).toBe("string");
  });
});

describe("a provider outage is explained in the server log without leaking anything", () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  async function gemini(status: number, body: string) {
    const server = createServer((_req, res) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body);
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async function generateAndGetLog(provider: ReturnType<typeof createGeminiProvider>) {
    const lines: string[] = [];
    const push = (m: string, meta?: Record<string, unknown>) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`);
    const app = createApp({ provider, aiTimeoutMs: 5000, logger: { info: push, warn: push, error: push } });
    const res = await request(app).post("/api/study/generate").send({ notes: SECRET_NOTES, mode: "both" });
    return { res, log: lines.join("\n") };
  }

  it("a Google 503 is logged with its status and label, and answered as AI_PROVIDER_ERROR", async () => {
    const baseUrl = await gemini(503, JSON.stringify({ error: { code: 503, message: "overloaded " + SECRET_NOTES, status: "UNAVAILABLE" } }));
    const { res, log } = await generateAndGetLog(createGeminiProvider("test-key-SECRET", "m", { baseUrl }));
    expect(res.body.error.code).toBe("AI_PROVIDER_ERROR");
    expect(log).toContain('"providerStatus":503');
    expect(log).toContain("ApiError/UNAVAILABLE");
    expect(log).not.toMatch(/private biology|mitochondria|test-key-SECRET/);
  });

  it("a connection that cannot be made is logged with the network error, not silently", async () => {
    const { res, log } = await generateAndGetLog(createGeminiProvider("test-key-SECRET", "m", { baseUrl: "http://127.0.0.1:1" }));
    expect(res.body.error.code).toBe("AI_PROVIDER_ERROR");
    expect(log).toMatch(/"reason":"[A-Za-z]+(\/[A-Z_]+)*"/);
    expect(log).not.toMatch(/private biology|test-key-SECRET/);
  });

  it("ProviderError keeps its reason for the service to log", () => {
    expect(new ProviderError("unavailable", undefined, undefined, "TypeError/ECONNRESET").reason).toBe("TypeError/ECONNRESET");
  });
});
