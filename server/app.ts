/**
 * Express app factory. Separate from `listen()` so tests can inject a fake provider.
 */
import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import {
  ERROR_META,
  LIMITS,
  generateRequestSchema,
  type ApiErrorBody,
  type ApiErrorCode,
  type GenerateStudyResponse,
} from "../shared/contract.ts";
import { generateStudySet, type Logger } from "./services/ai/studyService.ts";
import { AppError, type AiProvider } from "./services/ai/types.ts";

export interface AppDeps {
  provider: AiProvider;
  aiTimeoutMs: number;
  logger?: Logger;
}

type ServerErrorCode = keyof typeof ERROR_META;

const consoleLogger: Logger = {
  info: (m, meta) => console.log(`[info] ${m}`, meta ?? ""),
  warn: (m, meta) => console.warn(`[warn] ${m}`, meta ?? ""),
  error: (m, meta) => console.error(`[error] ${m}`, meta ?? ""),
};

function errorBody(code: ServerErrorCode, requestId: string): { status: number; body: ApiErrorBody } {
  const meta = ERROR_META[code];
  return {
    status: meta.status,
    body: { error: { code: code as ApiErrorCode, message: meta.message, retryable: meta.retryable, requestId } },
  };
}

export function createApp({ provider, aiTimeoutMs, logger = consoleLogger }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");

  // Correlation ID on every request.
  app.use(((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId as string);
    next();
  }) as RequestHandler);

  // 20k chars can be ~80KB in UTF-8, so 256kb leaves headroom without being unbounded.
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/study/generate", async (req, res) => {
    const requestId = res.locals.requestId as string;

    const parsed = generateRequestSchema.safeParse(req.body);
    const notes = parsed.success ? parsed.data.notes.trim() : "";
    if (!parsed.success || notes.length < LIMITS.notesMin || notes.length > LIMITS.notesMax) {
      const { status, body } = errorBody("INVALID_REQUEST", requestId);
      res.status(status).json(body);
      return;
    }

    // Abort the provider call if the client disconnects (e.g. superseded request).
    const clientGone = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) clientGone.abort();
    });

    try {
      const studySet = await generateStudySet({
        provider,
        notes,
        mode: parsed.data.mode,
        requestId,
        signal: clientGone.signal,
        timeoutMs: aiTimeoutMs,
        logger,
      });
      const body: GenerateStudyResponse = { studySet };
      res.json(body);
    } catch (err) {
      if (clientGone.signal.aborted) return; // nobody is listening
      const code: ServerErrorCode = err instanceof AppError && err.code in ERROR_META ? (err.code as ServerErrorCode) : "INTERNAL_ERROR";
      // Log the safe category only — no notes, no raw model output, no stack in the response.
      logger.error("generate failed", { requestId, code });
      const { status, body } = errorBody(code, requestId);
      res.status(status).json(body);
    }
  });

  // Unknown routes -> JSON, not an HTML page.
  app.use(((_req, res) => {
    const { status, body } = errorBody("NOT_FOUND", res.locals.requestId as string);
    res.status(status).json(body);
  }) as RequestHandler);

  // Body-parser failures (malformed JSON, too large) and anything unexpected -> typed JSON.
  app.use(((err, _req, res, _next) => {
    const requestId = res.locals.requestId as string;
    const type = (err as { type?: string }).type;
    const code: ServerErrorCode =
      type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : type === "entity.parse.failed" ? "INVALID_REQUEST" : "INTERNAL_ERROR";
    if (code === "INTERNAL_ERROR") logger.error("unhandled error", { requestId });
    const { status, body } = errorBody(code, requestId);
    res.status(status).json(body);
  }) as ErrorRequestHandler);

  return app;
}
