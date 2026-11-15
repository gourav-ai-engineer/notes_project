# CLAUDE.md — Recall Studio

Study-assistant take-home: React app that turns notes into flashcards + quiz via an LLM called **only from the backend**. Scope is deliberately small (P0 first). See `PRD.md` for requirements, `docs/ARCHITECTURE.md` for design.

## Commands

- `npm start` (alias `npm run dev`) — client (Vite :5173) + API (Express :8787)
- `npm run lint` · `npm run typecheck` (`tsc -b`, 4 projects) · `npm test` · `npm run build` · `npm run test:e2e`
- Env: copy `.env.example` → `.env`; only `GEMINI_API_KEY` is needed. Server boots without it (returns `AI_NOT_CONFIGURED`).

## Layout

- `shared/contract.ts` — Zod schemas, limits, types, error-code table (imported by client AND server)
- `server/` — `app.ts` factory (`createApp({ provider })`), `services/ai/` (service, Gemini adapter, prompts), `validation/studySet.ts`
- `src/` — `lib/api/studyApi.ts`, `hooks/useStudyGenerator.ts`, `features/study/`, `features/library/` (model, reducer, storage, provider), `features/create/`, `pages/` (routes), `components/`
- `tests/unit`, `tests/components`, `tests/e2e`, `tests/fixtures`

## Rules to keep

- Never call the model from the browser; never put secrets in `VITE_*`; never log notes, uploaded file names/contents/extracted text, raw model output or keys.
- Always validate model output at runtime (Zod); IDs are server-issued; at most ONE repair call.
- The UI branches on stable error `code`, not message text.
- Latest-request-wins: only the newest generation may update state (request id + AbortController). Keep the stale-response test's fake ignoring the abort signal.
- Render model text as plain React text. Long tokens: use `.wrap-anywhere`; verify no horizontal overflow at 320 px.
- No `maxLength` on the notes textarea (it would silently truncate pasted text).
- Use `API_PORT`, not a generic `PORT` (collides with dev tooling).
- Uploads: file type comes from the bytes (sniffing), never the client MIME type or name. Keep files in memory (no disk). Notes are optional only when a file is attached. Don't clip extracted text silently. Re-send attachments on the repair call. Multer limit errors must map to typed codes, not 500.
- Library: all saved data goes through the Zod-validated `storage.ts` and the pure `libraryReducer.ts` (ids/timestamps are passed in). Save generated sets idempotently on the server-issued id. Keep card ids stable across edits (progress is keyed by id). Never store uploaded files. Use `accent-ink` (not `accent-strong`) for accent-coloured text. Test with `renderApp()` and an in-memory storage, never real `localStorage`.
- Quiz scoring is app logic (`quizSession.ts`), never model-provided.
- Tests must not call a live model. Use the fake provider / mock server / `page.route`.
- Production is one process: `NODE_ENV=production` makes the server also serve `dist/` (`staticDir`); `/api/*` must stay JSON. Deploy config is `render.yaml`; `GEMINI_API_KEY` is set in the host dashboard, never committed.
- PWA: `public/sw.js` must never cache or intercept `/api` (notes and generated sets), only GET, same-origin. It is registered in production only. `sw.js` is served `no-cache`; `/.well-known/assetlinks.json` is served as JSON (never the SPA fallback). Android packaging is in `docs/PLAY_STORE.md`.
- Do not push to GitHub or deploy unless asked.
- Windows: npm scripts run in cmd.exe — no `VAR=x cmd` or `rm -rf` in scripts.
