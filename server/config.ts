import { createGeminiProvider } from "./services/ai/geminiProvider.ts";
import { ProviderError, type AiProvider } from "./services/ai/types.ts";

export interface ServerConfig {
  port: number;
  geminiApiKey: string | undefined;
  geminiModel: string;
  /** Timeout for each provider call (initial + at most one repair). */
  aiTimeoutMs: number;
  /** Generate calls allowed per client IP per minute. 0 disables the limit (the development default). */
  rateLimitPerMin: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const timeout = Number(env.AI_TIMEOUT_MS);
  const limit = Number(env.RATE_LIMIT_PER_MIN);
  return {
    rateLimitPerMin: env.RATE_LIMIT_PER_MIN?.trim() && Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : env.NODE_ENV === "production" ? 10 : 0,
    port: Number(env.API_PORT) || 8787,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    geminiModel: env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
    aiTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
  };
}

/**
 * The server must boot without a key (so `npm start` works on a fresh clone).
 * Without one, every generate call fails with a typed AI_NOT_CONFIGURED error.
 */
export function createProviderFromConfig(config: ServerConfig): AiProvider {
  if (!config.geminiApiKey) {
    return {
      async generate() {
        throw new ProviderError("not_configured");
      },
    };
  }
  return createGeminiProvider(config.geminiApiKey, config.geminiModel);
}
