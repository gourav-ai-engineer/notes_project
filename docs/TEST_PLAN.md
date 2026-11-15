# Test plan

Run everything: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`.
Automated tests never call a live model: they use a scripted fake provider, a local mock HTTP server, or `page.route` fixtures.

## Layers

| Layer | Tool | Files |
|---|---|---|
| Schema / validation / normalisation | Vitest | `tests/unit/studySet.test.ts` |
| API (supertest, fake provider) | Vitest | `tests/unit/api.test.ts` |
| Provider adapter (real SDK ↔ mock server) | Vitest | `tests/unit/geminiProvider.test.ts` |
| Client API module | Vitest | `tests/unit/studyApi.test.ts` |
| Quiz logic / scoring / wrong answers | Vitest | `tests/unit/quizSession.test.ts` |
| Stale-response guard | Vitest + RTL | `tests/components/staleResponse.test.tsx` |
| UI flows | Vitest + RTL | `tests/components/app.test.tsx` |
| File uploads: sniffing, DOCX extraction, limits, multipart API, repair re-sends files, no-leak logs | Vitest + supertest | `tests/unit/uploads.test.ts` |
| Gemini inline file parts and 400 mapping (real SDK ↔ mock server) | Vitest | `tests/unit/geminiProvider.test.ts` |
| Upload UI: pick/remove/announce, validation, files-only submit, Retry keeps files | Vitest + RTL | `tests/components/uploads.test.tsx` |
| Library model, reducer, storage, backup parsing, streaks, merge | Vitest | `tests/unit/library.test.ts`, `tests/unit/libraryHelpers.test.ts` |
| App shell, create menu, library, folders, set page, editor, settings, persistence, storage failures | Vitest + RTL | `tests/components/library.test.tsx` |
| Shell + library flows, persistence across reload, overflow on all 14 screens, theme, export/import | Playwright (Edge) | `tests/e2e/library.spec.ts` |
| Browser smoke, 1280 px and 320 px | Playwright (Edge) | `tests/e2e/study.spec.ts` |

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| Malformed JSON, wrong shape, missing fields, bad types | `studySet.test.ts` (parse/shape cases); `api.test.ts` "bad model output" |
| Empty output | `studySet.test.ts` EMPTY cases; `api.test.ts` `AI_EMPTY_OUTPUT` |
| Quiz needs 4 distinct options; bad `correctIndex`; over-limit; duplicates | `studySet.test.ts` |
| Server-issued IDs (model IDs ignored) | `studySet.test.ts` `normalizeStudySet` (this test caught a real ordering bug) |
| At most one repair; repair succeeds; still-invalid → controlled error | `api.test.ts` asserts provider call count ≤ 2 |
| Timeout, provider failure, rate limit, missing key, rejected key/model | `api.test.ts` (504 / 503 / 429 / `AI_NOT_CONFIGURED` / non-retryable `AI_CONFIG_ERROR` with upstream status logged) |
| Malformed request JSON → JSON 400; oversize → JSON 413; 404 JSON | `api.test.ts` |
| No secrets / notes / raw output / stack traces in responses or logs | `api.test.ts` "secrets and privacy" |
| Real SDK sends schema-mode config, key, model; maps 429 / other 4xx (config) / 5xx; abort | `geminiProvider.test.ts` |
| Client maps network / timeout / bad body / typed errors | `studyApi.test.ts` |
| **Late response A cannot overwrite newer B** (B resolves first) | `staleResponse.test.tsx`; fake `generate` ignores the abort signal so the ID guard is what's tested; also covers late failure, AbortError, cancel, unmount |
| Focus moves to loading panel → new title → notes field after Cancel/Edit | `app.test.tsx` "focus management" |
| Notes validation + character limit (no silent truncation) | `app.test.tsx` "input form" |
| Failure preserves notes + mode; Retry; non-retryable has no Retry | `app.test.tsx`, `study.spec.ts` |
| Flashcard flip, next/prev boundaries, keyboard | `app.test.tsx`, `study.spec.ts` |
| Quiz: select ≠ advance; check → feedback + explanation; answer locks | `app.test.tsx`, `quizSession.test.ts`, `study.spec.ts` |
| Score from user answers; wrong list only has failed questions | `quizSession.test.ts`, `app.test.tsx`, `study.spec.ts` |
| Perfect score → positive state, no broken retest | `app.test.tsx`, `study.spec.ts` |
| Model text rendered as text (no HTML injection) | `app.test.tsx` "long unbroken model text" |
| Files: type from bytes (lying extension ignored), DOCX text extracted, TXT/MD strict UTF-8, over-limit text rejected | `uploads.test.ts` (real in-memory DOCX built with jszip) |
| Files: oversize / too many / unsupported / corrupt / empty return typed non-retryable errors (never 500) and never call the model | `uploads.test.ts` |
| Files-only submissions accepted; notes still required (20+) without files | `uploads.test.ts`, `uploads.test.tsx` |
| Attachments sent as inline base64 parts and re-sent on the repair call; provider 400 with files = `FILE_UNREADABLE`, 403 stays config | `geminiProvider.test.ts`, `uploads.test.ts` |
| File names, contents and extracted text never appear in logs or responses | `uploads.test.ts` |
| Multipart request has no manual Content-Type; JSON path unchanged | `studyApi.test.ts`, `study.spec.ts` |
| Long file names don't overflow at 320 px | `study.spec.ts` (attach files) |
| No horizontal overflow at 320 px (incl. long unbroken tokens) | `study.spec.ts` `expectNoHorizontalOverflow` on both projects |

## Library and shell: requirement to evidence

| Requirement | Evidence |
|---|---|
| Generated set is saved once, into the chosen or a new folder; StrictMode does not duplicate it | `library.test.tsx` "saving generated sets" |
| A response that arrives after leaving the page is never saved; failures save nothing | same |
| Reducer is pure/idempotent; folder delete keeps or deletes sets as chosen | `library.test.ts`, `library.test.tsx` "Folders" |
| Stars/known/shuffle/filters; a deck does not shrink under you while reviewing | `library.test.tsx` "Set page: studying" |
| Editing keeps progress on untouched cards (ids), demotes reworded ones | `library.test.ts` (`draftToCards`), `library.test.tsx` "Editor" |
| Corrupt storage is backed up, quota/blocked storage is reported, reload keeps data | `library.test.ts`, `library.test.tsx` "persistence and storage problems", `library.spec.ts` |
| Invalid/oversized backups are rejected without changing data; replace needs confirmation | `library.test.ts`, `library.test.tsx` "Settings" |
| Every screen fits at 320 px with very long folder/set names; bottom bar never covers the last control | `library.spec.ts` |

## Manual checks performed (real browser)

Initial, validation error, over-limit (20,024 chars kept, Generate disabled), loading + cancel, real `AI_NOT_CONFIGURED` error through the full stack (browser → Vite proxy → Express), flashcard flip/navigate, quiz incorrect/correct feedback, results, retest, tab bar at 320 px. Five layout bugs were found this way and fixed (see git log).

## Not covered / known gaps

- Real `localStorage` quota limits and multi-tab sync are only simulated (in-memory store, `storage` event handler untested).
- No automated keyboard-only walkthrough of the dialogs; native `<dialog>` focus trapping is relied on (jsdom uses a minimal stand-in).
- Live Gemini call (needs a key): manual smoke test in README. This includes the real model reading a scanned PDF/photo and legacy `.doc` pass-through; these are verified only against a mock server.
- No test for decompression bombs inside DOCX, encrypted PDFs, or PPTX/XLSX (unsupported).
- No automated screen-reader pass; semantics are native (fieldset/legend, radios, button, tablist) and checked via accessible-name assertions only.
- Cross-browser: Playwright runs on Edge/Chromium only.
- One intermittent Vitest worker crash (Windows exit code `0xC0000409`) was seen once during development on `api.test.ts` and did not recur in repeated runs; cause not identified.
