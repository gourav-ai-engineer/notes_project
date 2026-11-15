/** Gemini adapter. The only file that imports the provider SDK. */
import { ApiError, GoogleGenAI, createPartFromBase64 } from "@google/genai";
import { ProviderError, type AiProvider, type ProviderRequest } from "./types.ts";

/** Waits before each retry on the same model. Two retries ride out the short "model is overloaded" blips. */
export const DEFAULT_RETRY_DELAYS_MS = [700, 1500];

export interface RetryEvent {
  /** The model that just failed. */
  model: string;
  /** Which retry on this model this is (1-based). Always 1 for a fallback switch. */
  attempt: number;
  /** Safe failure label, e.g. "ApiError/UNAVAILABLE". Never message text, notes or keys. */
  reason: string;
  status?: number;
  /** What happens next: try the same model again, or move to the fallback model. */
  next: "retry" | "fallback";
}

export interface GeminiOptions {
  /** Override the API origin. Used by tests to point the real SDK at a local mock server. */
  baseUrl?: string;
  /**
   * A second model to try when the main one keeps failing for reasons that are not the caller's fault: overload (503),
   * other 5xx, a network failure, or an exhausted quota (429; quotas are per model). Never used for bad keys or bad requests.
   */
  fallbackModel?: string;
  /** Waits before each retry on the same model; `[]` turns retries off. Default `[700, 1500]`. */
  retryDelaysMs?: number[];
  /** Called when a call is retried or moved to the fallback, so the server can log it. */
  onRetry?: (event: RetryEvent) => void;
}

/**
 * A short, safe label for logs: the error type plus any network code (ENOTFOUND, ECONNRESET, ...), or the API's
 * status name (e.g. "UNAVAILABLE"). Deliberately never includes the error message, which can echo request details.
 */
export function describeFailure(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.name);
    const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
    if (typeof code === "string" && /^[A-Z0-9_]{3,40}$/.test(code)) parts.push(code);
    // The SDK's ApiError carries Google's status label ("UNAVAILABLE", "PERMISSION_DENIED", ...) inside its JSON message.
    // Only that label is extracted, so none of the message text is ever logged.
    const label = /"status"\s*:\s*"([A-Z_]{3,40})"/.exec(err.message)?.[1];
    if (label) parts.push(label);
  } else {
    parts.push(typeof err);
  }
  return parts.join("/");
}

const isQuota = (err: unknown) => err instanceof ApiError && err.status === 429;
/** Worth trying again: Google is overloaded or broken (5xx, 408), or the connection failed. Bad keys and bad requests are not. */
const isTransient = (err: unknown) => (err instanceof ApiError ? err.status >= 500 || err.status === 408 : true);

/** Sleeps, but wakes immediately (and rejects) if the request is cancelled or times out. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error("aborted"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Maps the SDK error to the adapter's stable failure kinds. */
function toProviderError(err: unknown, hasFiles: boolean): ProviderError {
  const reason = describeFailure(err);
  if (err instanceof ApiError) {
    if (err.status === 429) return new ProviderError("rate_limited", undefined, 429, reason);
    // With files attached, a plain 400 usually means a corrupt, encrypted or unsupported file,
    // not a bad key. 401/403/404 still point at the key or model.
    if (hasFiles && err.status === 400) return new ProviderError("bad_input", "status 400", 400, reason);
    // Other 4xx (bad key, retired model, rejected schema) will not fix themselves on retry.
    const isConfig = err.status >= 400 && err.status < 500 && err.status !== 408;
    return new ProviderError(isConfig ? "config" : "unavailable", `status ${err.status}`, err.status, reason);
  }
  return new ProviderError("unavailable", undefined, undefined, reason);
}

export function createGeminiProvider(apiKey: string, model: string, options: GeminiOptions = {}): AiProvider {
  const client = new GoogleGenAI({
    apiKey,
    ...(options.baseUrl ? { httpOptions: { baseUrl: options.baseUrl } } : {}),
  });
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const models = options.fallbackModel && options.fallbackModel !== model ? [model, options.fallbackModel] : [model];

  async function callOnce(modelName: string, { systemInstruction, prompt, jsonSchema, signal, attachments }: ProviderRequest): Promise<string> {
    const response = await client.models.generateContent({
      model: modelName,
      // Files are sent inline (base64) alongside the text; nothing is uploaded to or stored by the Files API.
      contents: attachments?.length
        ? [{ role: "user", parts: [{ text: prompt }, ...attachments.map((a) => createPartFromBase64(a.data.toString("base64"), a.mimeType))] }]
        : prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.4,
        abortSignal: signal,
      },
    });
    return response.text ?? "";
  }

  return {
    async generate(request: ProviderRequest): Promise<string> {
      const { signal } = request;
      const hasFiles = Boolean(request.attachments?.length);
      let lastError: unknown;

      for (let m = 0; m < models.length; m++) {
        const current = models[m];
        const hasFallback = m < models.length - 1;
        // The fallback gets a shorter second chance: it is already the plan B.
        const delays = m === 0 ? retryDelays : retryDelays.slice(0, 1);
        for (let attempt = 0; ; attempt++) {
          try {
            return await callOnce(current, request);
          } catch (err) {
            // Aborts propagate unchanged so the service can tell timeout from provider failure.
            if (signal.aborted) throw err;
            lastError = err;
            const status = err instanceof ApiError ? err.status : undefined;
            const transient = !isQuota(err) && isTransient(err);

            if (transient && attempt < delays.length) {
              options.onRetry?.({ model: current, attempt: attempt + 1, reason: describeFailure(err), status, next: "retry" });
              // A little jitter so many users hitting the same overload do not all retry in lockstep.
              await sleep(Math.round(delays[attempt] * (0.85 + Math.random() * 0.3)), signal);
              continue;
            }
            if ((transient || isQuota(err)) && hasFallback) {
              options.onRetry?.({ model: current, attempt: 1, reason: describeFailure(err), status, next: "fallback" });
              break; // on to the fallback model
            }
            throw toProviderError(err, hasFiles);
          }
        }
      }
      throw toProviderError(lastError, hasFiles); // not reachable: the loop above always returns or throws
    },
  };
}
