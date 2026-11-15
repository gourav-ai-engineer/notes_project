import { useCallback, useEffect, useReducer, useRef } from "react";
import type { StudySet } from "../../shared/contract";
import { ApiClientError, generateStudy, isAbortError, type GenerateFn, type GenerateInput } from "../lib/api/studyApi";

export type GeneratorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; studySet: StudySet }
  | { status: "error"; error: ApiClientError };

type Action =
  | { type: "start" }
  | { type: "success"; studySet: StudySet }
  | { type: "failure"; error: ApiClientError }
  | { type: "reset" };

export function generatorReducer(_state: GeneratorState, action: Action): GeneratorState {
  switch (action.type) {
    case "start":
      return { status: "loading" };
    case "success":
      return { status: "success", studySet: action.studySet };
    case "failure":
      return { status: "error", error: action.error };
    case "reset":
      return { status: "idle" };
  }
}

const UNEXPECTED = new ApiClientError("INTERNAL_ERROR", "Something went wrong. Please try again.", true);

/**
 * Owns generation. Guarantees only the latest request may update state:
 *  1. each call takes a new, increasing id; results for any other id are dropped, and
 *  2. the previous request's AbortController is aborted (saves cost; also frees the connection).
 * (1) is the real guarantee — (2) alone is not enough, since a response can already be in flight.
 */
export function useStudyGenerator(generate: GenerateFn = generateStudy) {
  const [state, dispatch] = useReducer(generatorReducer, { status: "idle" });
  const latestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    latestId.current += 1; // invalidate anything in flight
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "reset" });
  }, []);

  const run = useCallback(
    async (request: GenerateInput) => {
      const id = ++latestId.current;
      controller.current?.abort();
      const ctl = new AbortController();
      controller.current = ctl;
      dispatch({ type: "start" });

      try {
        const studySet = await generate(request, { signal: ctl.signal });
        if (id === latestId.current) dispatch({ type: "success", studySet });
      } catch (err) {
        if (id !== latestId.current) return; // superseded or cancelled: say nothing
        if (isAbortError(err)) return;
        dispatch({ type: "failure", error: err instanceof ApiClientError ? err : UNEXPECTED });
      }
    },
    [generate],
  );

  // Leaving the flow aborts any pending request.
  useEffect(
    () => () => {
      latestId.current += 1;
      controller.current?.abort();
    },
    [],
  );

  return { state, run, cancel };
}
