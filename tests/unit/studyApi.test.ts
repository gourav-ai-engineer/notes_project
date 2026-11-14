import { describe, expect, it } from "vitest";
import { ApiClientError, generateStudy } from "../../src/lib/api/studyApi";
import { SAMPLE_NOTES, makeStudySet } from "../fixtures/study";

const request = { notes: SAMPLE_NOTES, mode: "both" as const };
const reply = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

async function failure(fetchImpl: typeof fetch, extra: Parameters<typeof generateStudy>[1] = {}) {
  return generateStudy(request, { fetchImpl, ...extra }).then(
    () => {
      throw new Error("expected rejection");
    },
    (e: unknown) => e as ApiClientError,
  );
}

describe("generateStudy (client API module)", () => {
  it("returns a validated StudySet", async () => {
    const set = makeStudySet();
    const result = await generateStudy(request, { fetchImpl: reply(200, { studySet: set }) });
    expect(result.title).toBe(set.title);
  });

  it("maps typed server errors to ApiClientError with the server's code and retryability", async () => {
    const err = await failure(
      reply(502, { error: { code: "AI_INVALID_OUTPUT", message: "Bad output", retryable: true, requestId: "r1" } }),
    );
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: "AI_INVALID_OUTPUT", retryable: true, requestId: "r1" });
  });

  it("treats a 200 with the wrong shape as BAD_RESPONSE", async () => {
    expect(await failure(reply(200, { studySet: { title: "x" } }))).toMatchObject({ code: "BAD_RESPONSE" });
    expect(await failure(reply(200, { nope: true }))).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("treats a quiz with a bad correctIndex in a 200 as BAD_RESPONSE", async () => {
    const set = makeStudySet();
    (set.quiz[0] as unknown as { correctIndex: number }).correctIndex = 9;
    expect(await failure(reply(200, { studySet: set }))).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("treats non-JSON bodies (HTML error pages, empty) as BAD_RESPONSE", async () => {
    expect(await failure(reply(500, "<html>boom</html>"))).toMatchObject({ code: "BAD_RESPONSE" });
    expect(await failure(reply(200, ""))).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    const down = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await failure(down)).toMatchObject({ code: "NETWORK_ERROR", retryable: true });
  });

  it("maps a client-side timeout to CLIENT_TIMEOUT", async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))))) as unknown as typeof fetch;
    expect(await failure(hang, { timeoutMs: 20 })).toMatchObject({ code: "CLIENT_TIMEOUT" });
  });

  it("surfaces caller cancellation as an AbortError, not an API error", async () => {
    const ctl = new AbortController();
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))))) as unknown as typeof fetch;
    const p = generateStudy(request, { fetchImpl: hang, signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
