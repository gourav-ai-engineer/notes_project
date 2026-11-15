/**
 * The only place the UI talks HTTP. Turns every failure into a typed ApiClientError
 * so components can branch on `code`, never on message text.
 */
import {
  apiErrorBodySchema,
  generateResponseSchema,
  type ApiErrorCode,
  type GenerateStudyRequest,
  type StudySet,
} from "../../../shared/contract";

/**
 * Must exceed the server's worst case (initial call + one repair, 30s each),
 * otherwise the server's typed AI_TIMEOUT would never reach the UI.
 */
export const CLIENT_TIMEOUT_MS = 75_000;
/** With attachments the server allows 60s per call (initial + one repair), plus upload time. */
export const CLIENT_TIMEOUT_WITH_FILES_MS = 150_000;

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly retryable: boolean;
  readonly requestId?: string;
  constructor(code: ApiErrorCode, message: string, retryable: boolean, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

export interface GenerateOptions {
  /** Caller-owned cancellation. Aborting rejects with an AbortError (not an ApiClientError). */
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** What the UI submits: the validated request plus any uploaded files. */
export interface GenerateInput extends GenerateStudyRequest {
  files?: File[];
}

export type GenerateFn = (request: GenerateInput, options?: GenerateOptions) => Promise<StudySet>;

function buildFormData({ notes, mode, files = [] }: GenerateInput): FormData {
  const form = new FormData();
  form.append("notes", notes);
  form.append("mode", mode);
  for (const file of files) form.append("files", file);
  return form;
}

export const generateStudy: GenerateFn = async (request, options = {}) => {
  const hasFiles = Boolean(request.files?.length);
  const { signal, timeoutMs = hasFiles ? CLIENT_TIMEOUT_WITH_FILES_MS : CLIENT_TIMEOUT_MS, fetchImpl = fetch } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetchImpl("/api/study/generate", {
      method: "POST",
      ...(hasFiles
        ? // Multipart: do NOT set Content-Type; the browser adds the boundary.
          { body: buildFormData(request) }
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: request.notes, mode: request.mode }) }),
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // user/superseded cancel: surface as AbortError, not as an error state
    if (timeoutSignal.aborted) {
      throw new ApiClientError("CLIENT_TIMEOUT", "This is taking longer than expected. Please try again.", true);
    }
    throw new ApiClientError("NETWORK_ERROR", "Couldn't reach the server. Check your connection and try again.", true);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    if (signal?.aborted) throw err;
    payload = undefined;
  }

  if (!response.ok) {
    const parsedError = apiErrorBodySchema.safeParse(payload);
    if (parsedError.success) {
      const { code, message, retryable, requestId } = parsedError.data.error;
      throw new ApiClientError(code, message, retryable, requestId);
    }
    throw new ApiClientError("BAD_RESPONSE", "The server returned an unexpected response. Please try again.", true);
  }

  const parsed = generateResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError("BAD_RESPONSE", "The server returned an unexpected response. Please try again.", true);
  }
  return parsed.data.studySet as StudySet;
};

export const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === "AbortError";
