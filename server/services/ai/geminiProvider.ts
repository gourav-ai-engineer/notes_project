/** Gemini adapter. The only file that imports the provider SDK. */
import { ApiError, GoogleGenAI, createPartFromBase64 } from "@google/genai";
import { ProviderError, type AiProvider, type ProviderRequest } from "./types.ts";

export interface GeminiOptions {
  /** Override the API origin. Used by tests to point the real SDK at a local mock server. */
  baseUrl?: string;
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

export function createGeminiProvider(apiKey: string, model: string, options: GeminiOptions = {}): AiProvider {
  const client = new GoogleGenAI({
    apiKey,
    ...(options.baseUrl ? { httpOptions: { baseUrl: options.baseUrl } } : {}),
  });

  return {
    async generate({ systemInstruction, prompt, jsonSchema, signal, attachments }: ProviderRequest): Promise<string> {
      const hasFiles = Boolean(attachments?.length);
      try {
        const response = await client.models.generateContent({
          model,
          // Files are sent inline (base64) alongside the text; nothing is uploaded to or stored by the Files API.
          contents: hasFiles
            ? [{ role: "user", parts: [{ text: prompt }, ...attachments!.map((a) => createPartFromBase64(a.data.toString("base64"), a.mimeType))] }]
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
      } catch (err) {
        // Aborts propagate unchanged so the service can tell timeout from provider failure.
        if (signal.aborted) throw err;
        const reason = describeFailure(err);
        if (err instanceof ApiError) {
          if (err.status === 429) throw new ProviderError("rate_limited", undefined, 429, reason);
          // With files attached, a plain 400 usually means a corrupt, encrypted or unsupported file,
          // not a bad key. 401/403/404 still point at the key or model.
          if (hasFiles && err.status === 400) throw new ProviderError("bad_input", "status 400", 400, reason);
          // Other 4xx (bad key, retired model, rejected schema) will not fix themselves on retry.
          const isConfig = err.status >= 400 && err.status < 500 && err.status !== 408;
          throw new ProviderError(isConfig ? "config" : "unavailable", `status ${err.status}`, err.status, reason);
        }
        throw new ProviderError("unavailable", undefined, undefined, reason);
      }
    },
  };
}
