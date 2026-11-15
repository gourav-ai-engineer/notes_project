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
  /** Built client folder (`dist`). When set, the API also serves the app, so one process hosts everything. */
  staticDir?: string;
  /** Per-client cap on generate calls (each one spends model quota). Omit or set max 0 to disable. */
  rateLimit?: { max: number; windowMs: number };
  /** Number of reverse proxies in front of the app (e.g. 1 on Render) so the real client IP is used. */
  trustProxyHops?: number;
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

/** Fixed-window counter per client key. In memory, so it resets on restart and is per instance: a cost guard, not a security boundary. */
function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    if (hits.size > 5_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k); // bound memory
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

export function createApp({ provider, aiTimeoutMs, logger = consoleLogger, staticDir, rateLimit, trustProxyHops = 0 }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  const allow = rateLimit && rateLimit.max > 0 ? createRateLimiter(rateLimit) : null;

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

  // Runs before the body is parsed, so a client over its limit never gets to upload files.
  const limit: RequestHandler = (req, res, next) => {
    if (!allow || allow(req.ip ?? "unknown")) return next();
    const { status, body } = errorBody("AI_RATE_LIMITED", res.locals.requestId as string);
    res.setHeader("Retry-After", String(Math.ceil((rateLimit?.windowMs ?? 60_000) / 1000)));
    res.status(status).json(body);
  };

  app.post("/api/study/generate", limit, parseUploads, async (req, res) => {
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

  if (staticDir) {
    // Hashed build assets never change, so they can be cached for a year; index.html must always be revalidated.
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders(res, filePath) {
          const hashed = /[\\/]assets[\\/]/.test(filePath);
          res.setHeader("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "public, max-age=3600");
          res.setHeader("X-Content-Type-Options", "nosniff");
        },
      }),
    );
    // Client-side routes (/library, /sets/abc...) all get the app shell. Anything under /api stays JSON.
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res, next) => {
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.sendFile("index.html", { root: staticDir }, (err) => err && next(err));
    });
  }

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
