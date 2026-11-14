import type { ApiErrorCode } from "../../../shared/contract.ts";

/** What the service asks any provider to do. Swap providers by implementing this. */
export interface AiProvider {
  /** Returns the model's raw text. Must reject (not hang) when `signal` aborts. */
  generate(request: ProviderRequest): Promise<string>;
}

export interface ProviderRequest {
  systemInstruction: string;
  prompt: string;
  /** JSON Schema describing the expected output, for provider-enforced structured output. */
  jsonSchema: Record<string, unknown>;
  signal: AbortSignal;
}

/** Error with a stable code. The route maps it to an HTTP response. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  /** Upstream HTTP status, kept for server logs only (never sent to the client). */
  readonly providerStatus?: number;
  constructor(code: ApiErrorCode, detail?: string, providerStatus?: number) {
    super(detail ?? code);
    this.providerStatus = providerStatus;
    this.name = "AppError";
    this.code = code;
  }
}

/** Thrown by provider adapters, translated into an AppError by the service. */
export type ProviderFailureKind = "rate_limited" | "unavailable" | "not_configured" | "config";
export class ProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly httpStatus?: number;
  constructor(kind: ProviderFailureKind, detail?: string, httpStatus?: number) {
    super(detail ?? kind);
    this.httpStatus = httpStatus;
    this.name = "ProviderError";
    this.kind = kind;
  }
}
