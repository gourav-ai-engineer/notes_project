/** Gemini adapter. The only file that imports the provider SDK. */
import { ApiError, GoogleGenAI } from "@google/genai";
import { ProviderError, type AiProvider, type ProviderRequest } from "./types.ts";

export interface GeminiOptions {
  /** Override the API origin. Used by tests to point the real SDK at a local mock server. */
  baseUrl?: string;
}

export function createGeminiProvider(apiKey: string, model: string, options: GeminiOptions = {}): AiProvider {
  const client = new GoogleGenAI({
    apiKey,
    ...(options.baseUrl ? { httpOptions: { baseUrl: options.baseUrl } } : {}),
  });

  return {
    async generate({ systemInstruction, prompt, jsonSchema, signal }: ProviderRequest): Promise<string> {
      try {
        const response = await client.models.generateContent({
          model,
          contents: prompt,
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
        if (err instanceof ApiError) {
          if (err.status === 429) throw new ProviderError("rate_limited", undefined, 429);
          // Other 4xx (bad key, retired model, rejected schema) will not fix themselves on retry.
          const isConfig = err.status >= 400 && err.status < 500 && err.status !== 408;
          throw new ProviderError(isConfig ? "config" : "unavailable", `status ${err.status}`, err.status);
        }
        throw new ProviderError("unavailable");
      }
    },
  };
}
