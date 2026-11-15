/**
 * Orchestrates one generation: prompt -> provider -> validate -> (one repair) -> StudySet.
 * Knows nothing about HTTP or about which provider is in use.
 */
import { z } from "zod";
import { generatedContentSchema, type StudyMode, type StudySet } from "../../../shared/contract.ts";
import { normalizeStudySet, parseModelOutput, type ParseResult } from "../../validation/studySet.ts";
import { buildPrompt, buildRepairPrompt, SYSTEM_INSTRUCTION } from "./prompts.ts";
import { AppError, ProviderError, type AiProvider, type ProviderAttachment } from "./types.ts";

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface GenerateOptions {
  provider: AiProvider;
  /** May be empty when the study material comes from uploaded files. */
  notes: string;
  /** Files the provider reads directly. Re-sent on the repair call so it sees the same source. */
  attachments?: ProviderAttachment[];
  /** Text already extracted from DOCX/TXT/MD uploads. */
  extractedText?: string[];
  mode: StudyMode;
  requestId: string;
  /** Abort when the HTTP client goes away. */
  signal?: AbortSignal;
  /** Per provider call. The total budget is at most 2x (initial + one repair). */
  timeoutMs: number;
  logger: Logger;
}

const fullSchema = z.toJSONSchema(generatedContentSchema, { io: "input" }) as Record<string, unknown>;
delete fullSchema.$schema; // not part of what the provider accepts
const jsonSchema = fullSchema;

async function callProvider(opts: GenerateOptions, prompt: string): Promise<string> {
  // Reading PDFs and images takes the model noticeably longer than short text.
  const timeoutSignal = AbortSignal.timeout(opts.attachments?.length ? opts.timeoutMs * 2 : opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await opts.provider.generate({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      jsonSchema,
      signal,
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    });
  } catch (err) {
    if (timeoutSignal.aborted) throw new AppError("AI_TIMEOUT");
    if (opts.signal?.aborted) throw new AppError("INTERNAL_ERROR", "client_disconnected");
    if (err instanceof AppError) throw err;
    if (err instanceof ProviderError) {
      if (err.kind === "rate_limited") throw new AppError("AI_RATE_LIMITED", undefined, err.httpStatus);
      if (err.kind === "not_configured") throw new AppError("AI_NOT_CONFIGURED");
      if (err.kind === "config") throw new AppError("AI_CONFIG_ERROR", undefined, err.httpStatus);
      if (err.kind === "bad_input") throw new AppError("FILE_UNREADABLE", undefined, err.httpStatus);
      throw new AppError("AI_PROVIDER_ERROR", undefined, err.httpStatus);
    }
    throw new AppError("AI_PROVIDER_ERROR");
  }
}

function failureToError(result: Extract<ParseResult, { ok: false }>): AppError {
  return new AppError(result.kind === "EMPTY" ? "AI_EMPTY_OUTPUT" : "AI_INVALID_OUTPUT", result.issues);
}

export async function generateStudySet(opts: GenerateOptions): Promise<StudySet> {
  const { notes, mode, requestId, logger } = opts;

  const sources = { attachedFiles: opts.attachments?.length ?? 0, extractedText: opts.extractedText ?? [] };

  const firstRaw = await callProvider(opts, buildPrompt(notes, mode, sources));
  const first = parseModelOutput(firstRaw, mode);
  if (first.ok) return normalizeStudySet(first.content, mode);

  // Never log notes or raw model output — only the safe failure category.
  logger.warn("model output rejected, attempting one repair", { requestId, kind: first.kind });

  // Exactly one bounded repair attempt.
  const repairedRaw = await callProvider(opts, buildRepairPrompt(notes, mode, firstRaw ?? "", first.issues, sources));
  const second = parseModelOutput(repairedRaw, mode);
  if (second.ok) {
    logger.info("repair succeeded", { requestId });
    return normalizeStudySet(second.content, mode);
  }

  logger.error("repair failed", { requestId, kind: second.kind });
  throw failureToError(second);
}
