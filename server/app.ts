/**
 * Express app factory. Separate from `listen()` so tests can inject a fake provider.
 */
import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import multer from "multer";
import {
  ERROR_META,
  LIMITS,
  generateRequestSchema,
  type ApiErrorBody,
  type ApiErrorCode,
  type GenerateStudyResponse,
} from "../shared/contract.ts";
import { prepareSources } from "./services/files/attachments.ts";
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

  // Uploads stay in memory (never written to disk) and are bounded by count, per-file size and field size.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: LIMITS.maxFiles, fileSize: LIMITS.maxFileBytes, fieldSize: 256 * 1024, fields: 4, parts: LIMITS.maxFiles + 4 },
  });
  // JSON requests (text only) skip multer entirely.
  const parseUploads: RequestHandler = (req, res, next) =>
    req.is("multipart/form-data") ? upload.array("files")(req, res, next) : next();

  app.post("/api/study/generate", parseUploads, async (req, res) => {
    const requestId = res.locals.requestId as string;
    const reject = (code: ServerErrorCode) => {
      const { status, body } = errorBody(code, requestId);
      res.status(status).json(body);
    };

    const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];
    const isMultipart = Boolean(req.is("multipart/form-data"));
    const raw = req.body as Record<string, unknown> | undefined;
    // Multipart notes may be omitted when files carry the material; JSON requests still require them.
    const parsed = generateRequestSchema.safeParse(isMultipart ? { notes: raw?.notes ?? "", mode: raw?.mode } : raw);
    const notes = parsed.success ? parsed.data.notes.trim() : "";
    const notesOk = files.length > 0 ? notes.length <= LIMITS.notesMax : notes.length >= LIMITS.notesMin && notes.length <= LIMITS.notesMax;
    if (!parsed.success || !notesOk) return reject("INVALID_REQUEST");
    if (files.reduce((sum, f) => sum + f.size, 0) > LIMITS.maxTotalBytes) return reject("FILE_TOO_LARGE");

    // Abort the provider call if the client disconnects (e.g. superseded request).
    const clientGone = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) clientGone.abort();
    });

    try {
      const sources = await prepareSources(files.map((f) => ({ originalname: f.originalname, buffer: f.buffer })));
      // Counts only: never log file names, contents or extracted text.
      if (files.length > 0) logger.info("generate with files", { requestId, files: files.length });
      const studySet = await generateStudySet({
        provider,
        notes,
        attachments: sources.attachments,
        extractedText: sources.extractedText,
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
      const providerStatus = err instanceof AppError ? err.providerStatus : undefined;
      logger.error("generate failed", { requestId, code, ...(providerStatus ? { providerStatus } : {}) });
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
    let code: ServerErrorCode =
      type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : type === "entity.parse.failed" ? "INVALID_REQUEST" : "INTERNAL_ERROR";
    if (err instanceof multer.MulterError) {
      code =
        err.code === "LIMIT_FILE_SIZE"
          ? "FILE_TOO_LARGE"
          : err.code === "LIMIT_FILE_COUNT"
            ? "TOO_MANY_FILES"
            : err.code === "LIMIT_FIELD_VALUE"
              ? "PAYLOAD_TOO_LARGE"
              : "INVALID_REQUEST";
    } else if (code === "INTERNAL_ERROR" && /multipart|boundary|unexpected end of form/i.test((err as Error).message ?? "")) {
      code = "INVALID_REQUEST"; // malformed multipart body from the client
    }
    if (code === "INTERNAL_ERROR") logger.error("unhandled error", { requestId });
    const { status, body } = errorBody(code, requestId);
    res.status(status).json(body);
  }) as ErrorRequestHandler);

  return app;
}
