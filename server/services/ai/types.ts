import type { ApiErrorCode } from "../../../shared/contract.ts";

/** What the service asks any provider to do. Swap providers by implementing this. */
export interface AiProvider {
  /** Returns the model's raw text. Must reject (not hang) when `signal` aborts. */
  generate(request: ProviderRequest): Promise<string>;
}

/** A file the provider reads directly (PDF, image, ...). `mimeType` comes from sniffing the bytes. */
export interface ProviderAttachment {
  mimeType: string;
  data: Buffer;
}

export interface ProviderRequest {
  systemInstruction: string;
  prompt: string;
  /** Files sent alongside the prompt. Absent for text-only requests. */
  attachments?: ProviderAttachment[];
  /** JSON Schema describing the expected output, for provider-enforced structured output. */
  jsonSchema: Record<string, unknown>;
  signal: AbortSignal;
}

/** Error with a stable code. The route maps it to an HTTP response. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  /** Upstream HTTP status, kept for server logs only (never sent to the client). */
  readonly providerStatus?: number;
  /** Safe failure label for server logs only, e.g. "TypeError/ENOTFOUND". Never message text, notes or keys. */
  readonly reason?: string;
  constructor(code: ApiErrorCode, detail?: string, providerStatus?: number, reason?: string) {
    super(detail ?? code);
    this.providerStatus = providerStatus;
    this.reason = reason;
    this.name = "AppError";
    this.code = code;
  }
}

/** Thrown by provider adapters, translated into an AppError by the service. */
export type ProviderFailureKind = "rate_limited" | "unavailable" | "not_configured" | "config" | "bad_input";
export class ProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly httpStatus?: number;
  /** See AppError.reason. */
  readonly reason?: string;
  constructor(kind: ProviderFailureKind, detail?: string, httpStatus?: number, reason?: string) {
    super(detail ?? kind);
    this.httpStatus = httpStatus;
    this.reason = reason;
    this.name = "ProviderError";
    this.kind = kind;
  }
}
