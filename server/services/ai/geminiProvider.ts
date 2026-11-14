/** Gemini adapter. The only file that imports the provider SDK. */
import { ApiError, GoogleGenAI } from "@google/genai";
import { ProviderError, type AiProvider, type ProviderRequest } from "./types.ts";

export function createGeminiProvider(apiKey: string, model: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });

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
          if (err.status === 429) throw new ProviderError("rate_limited");
          throw new ProviderError("unavailable", `status ${err.status}`);
        }
        throw new ProviderError("unavailable");
      }
    },
  };
}
