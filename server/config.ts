import { createGeminiProvider } from "./services/ai/geminiProvider.ts";
import { ProviderError, type AiProvider } from "./services/ai/types.ts";

export interface ServerConfig {
  port: number;
  geminiApiKey: string | undefined;
  geminiModel: string;
  /** Tried when the main model keeps failing from overload or quota. `undefined` means no fallback. */
  geminiFallbackModel: string | undefined;
  /** Timeout for each provider call (initial + at most one repair). */
  aiTimeoutMs: number;
  /** Generate calls allowed per client IP per minute. 0 disables the limit (the development default). */
  rateLimitPerMin: number;
}

/** Per provider call, retries included. Gemini can take 20+ s when busy, so this leaves room for a slow answer plus a retry. */
export const DEFAULT_AI_TIMEOUT_MS = 45_000;
export const DEFAULT_MODEL = "gemini-3.5-flash";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";

/** `GEMINI_FALLBACK_MODEL=none` turns the fallback off. Unset picks the sibling model so it is never the same as the main one. */
function resolveFallback(raw: string | undefined, primary: string): string | undefined {
  const value = raw?.trim();
  if (value && /^(none|off|false)$/i.test(value)) return undefined;
  const chosen = value || (primary === DEFAULT_FALLBACK_MODEL ? DEFAULT_MODEL : DEFAULT_FALLBACK_MODEL);
  return chosen === primary ? undefined : chosen;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const timeout = Number(env.AI_TIMEOUT_MS);
  const limit = Number(env.RATE_LIMIT_PER_MIN);
  const geminiModel = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return {
    geminiFallbackModel: resolveFallback(env.GEMINI_FALLBACK_MODEL, geminiModel),
    rateLimitPerMin: env.RATE_LIMIT_PER_MIN?.trim() && Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : env.NODE_ENV === "production" ? 10 : 0,
    port: Number(env.API_PORT) || 8787,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    geminiModel,
    aiTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_AI_TIMEOUT_MS,
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
  return createGeminiProvider(config.geminiApiKey, config.geminiModel, {
    fallbackModel: config.geminiFallbackModel,
    // Counts and labels only: never notes, file data or keys.
    onRetry: ({ model, attempt, reason, status, next }) =>
      console.warn(`[warn] gemini ${next === "retry" ? `retry ${attempt}` : "switching to fallback"}`, { model, reason, ...(status ? { status } : {}) }),
  });
}
