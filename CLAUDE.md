# CLAUDE.md — Recall Studio

Study-assistant take-home: React app that turns notes into flashcards + quiz via an LLM called **only from the backend**. Scope is deliberately small (P0 first). See `PRD.md` for requirements, `docs/ARCHITECTURE.md` for design.

## Commands

- `npm start` (alias `npm run dev`) — client (Vite :5173) + API (Express :8787)
- `npm run lint` · `npm run typecheck` (`tsc -b`, 4 projects) · `npm test` · `npm run build` · `npm run test:e2e`
- Env: copy `.env.example` → `.env`; only `GEMINI_API_KEY` is needed. Server boots without it (returns `AI_NOT_CONFIGURED`).

## Layout

- `shared/contract.ts` — Zod schemas, limits, types, error-code table (imported by client AND server)
- `server/` — `app.ts` factory (`createApp({ provider })`), `services/ai/` (service, Gemini adapter, prompts), `validation/studySet.ts`
- `src/` — `lib/api/studyApi.ts`, `hooks/useStudyGenerator.ts`, `features/study/`, `components/`
- `tests/unit`, `tests/components`, `tests/e2e`, `tests/fixtures`

## Rules to keep

- Never call the model from the browser; never put secrets in `VITE_*`; never log notes, raw model output or keys.
- Always validate model output at runtime (Zod); IDs are server-issued; at most ONE repair call.
- The UI branches on stable error `code`, not message text.
- Latest-request-wins: only the newest generation may update state (request id + AbortController). Keep the stale-response test's fake ignoring the abort signal.
- Render model text as plain React text. Long tokens: use `.wrap-anywhere`; verify no horizontal overflow at 320 px.
- No `maxLength` on the notes textarea (it would silently truncate pasted text).
- Use `API_PORT`, not a generic `PORT` (collides with dev tooling).
- Quiz scoring is app logic (`quizSession.ts`), never model-provided.
- Tests must not call a live model. Use the fake provider / mock server / `page.route`.
- Do not push to GitHub or deploy unless asked.
- Windows: npm scripts run in cmd.exe — no `VAR=x cmd` or `rm -rf` in scripts.
