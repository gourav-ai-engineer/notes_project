// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudySet } from "../../shared/contract";
import { useStudyGenerator } from "../../src/hooks/useStudyGenerator";
import { ApiClientError } from "../../src/lib/api/studyApi";
import { SAMPLE_NOTES, makeStudySet } from "../fixtures/study";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const req = { notes: SAMPLE_NOTES, mode: "both" as const };
const setA = makeStudySet({ id: "A", title: "Set A" });
const setB = makeStudySet({ id: "B", title: "Set B" });

/**
 * The fake `generate` deliberately IGNORES the abort signal. That means these tests
 * exercise the request-id guard itself, not just AbortController behaviour.
 */
function setup() {
  const a = deferred<StudySet>();
  const b = deferred<StudySet>();
  const generate = vi.fn().mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
  const hook = renderHook(() => useStudyGenerator(generate));
  act(() => void hook.result.current.run(req)); // request A
  act(() => void hook.result.current.run(req)); // request B (supersedes A)
  return { a, b, hook, generate };
}

describe("useStudyGenerator — stale response protection", () => {
  it("a late response from request A cannot overwrite request B (B resolves first)", async () => {
    const { a, b, hook } = setup();

    await act(async () => b.resolve(setB));
    expect(hook.result.current.state).toEqual({ status: "success", studySet: setB });

    await act(async () => a.resolve(setA));
    expect(hook.result.current.state).toEqual({ status: "success", studySet: setB });
  });

  it("A resolving before B is also ignored; B still lands", async () => {
    const { a, b, hook } = setup();

    await act(async () => a.resolve(setA));
    expect(hook.result.current.state.status).toBe("loading");

    await act(async () => b.resolve(setB));
    expect(hook.result.current.state).toEqual({ status: "success", studySet: setB });
  });

  it("a late failure from A cannot replace B's success with an error", async () => {
    const { a, b, hook } = setup();
    await act(async () => b.resolve(setB));
    await act(async () => a.reject(new ApiClientError("AI_TIMEOUT", "slow", true)));
    expect(hook.result.current.state).toEqual({ status: "success", studySet: setB });
  });

  it("an AbortError from the superseded request never shows an error state", async () => {
    const { a, hook } = setup();
    await act(async () => a.reject(new DOMException("aborted", "AbortError")));
    expect(hook.result.current.state.status).toBe("loading"); // still waiting on B
  });

  it("aborts the previous request's signal when a new one starts", () => {
    const signals: AbortSignal[] = [];
    const generate = vi.fn().mockImplementation((_r, o) => {
      signals.push(o.signal);
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useStudyGenerator(generate));
    act(() => void result.current.run(req));
    act(() => void result.current.run(req));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("cancel() returns to idle and ignores a response that arrives afterwards", async () => {
    const a = deferred<StudySet>();
    const { result } = renderHook(() => useStudyGenerator(() => a.promise));
    act(() => void result.current.run(req));
    act(() => result.current.cancel());
    expect(result.current.state.status).toBe("idle");

    await act(async () => a.resolve(setA));
    expect(result.current.state.status).toBe("idle");
  });

  it("unmounting aborts the pending request and never updates state", async () => {
    let signal!: AbortSignal;
    const a = deferred<StudySet>();
    const generate = vi.fn().mockImplementation((_r, o) => {
      signal = o.signal;
      return a.promise;
    });
    const { result, unmount } = renderHook(() => useStudyGenerator(generate));
    act(() => void result.current.run(req));
    unmount();
    expect(signal.aborted).toBe(true);
    await expect(Promise.resolve(a.resolve(setA))).resolves.toBeUndefined();
  });

  it("turns an unexpected exception into a controlled error state", async () => {
    const { result } = renderHook(() =>
      useStudyGenerator(() => Promise.reject(new Error("kaboom: stack trace here"))),
    );
    await act(async () => void result.current.run(req));
    const s = result.current.state;
    expect(s.status).toBe("error");
    if (s.status === "error") expect(s.error.message).not.toContain("kaboom");
  });
});
