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
| Browser smoke, 1280 px and 320 px | Playwright (Edge) | `tests/e2e/study.spec.ts` |

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| Malformed JSON, wrong shape, missing fields, bad types | `studySet.test.ts` (parse/shape cases); `api.test.ts` "bad model output" |
| Empty output | `studySet.test.ts` EMPTY cases; `api.test.ts` `AI_EMPTY_OUTPUT` |
| Quiz needs 4 distinct options; bad `correctIndex`; over-limit; duplicates | `studySet.test.ts` |
| Server-issued IDs (model IDs ignored) | `studySet.test.ts` `normalizeStudySet` (this test caught a real ordering bug) |
| At most one repair; repair succeeds; still-invalid → controlled error | `api.test.ts` asserts provider call count ≤ 2 |
| Timeout, provider failure, rate limit, missing key | `api.test.ts` (504 / 503 / 429 / `AI_NOT_CONFIGURED`) |
| Malformed request JSON → JSON 400; oversize → JSON 413; 404 JSON | `api.test.ts` |
| No secrets / notes / raw output / stack traces in responses or logs | `api.test.ts` "secrets and privacy" |
| Real SDK sends schema-mode config, key, model; maps 429/5xx; abort | `geminiProvider.test.ts` |
| Client maps network / timeout / bad body / typed errors | `studyApi.test.ts` |
| **Late response A cannot overwrite newer B** (B resolves first) | `staleResponse.test.tsx`; fake `generate` ignores the abort signal so the ID guard is what's tested; also covers late failure, AbortError, cancel, unmount |
| Notes validation + character limit (no silent truncation) | `app.test.tsx` "input form" |
| Failure preserves notes + mode; Retry; non-retryable has no Retry | `app.test.tsx`, `study.spec.ts` |
| Flashcard flip, next/prev boundaries, keyboard | `app.test.tsx`, `study.spec.ts` |
| Quiz: select ≠ advance; check → feedback + explanation; answer locks | `app.test.tsx`, `quizSession.test.ts`, `study.spec.ts` |
| Score from user answers; wrong list only has failed questions | `quizSession.test.ts`, `app.test.tsx`, `study.spec.ts` |
| Perfect score → positive state, no broken retest | `app.test.tsx`, `study.spec.ts` |
| Model text rendered as text (no HTML injection) | `app.test.tsx` "long unbroken model text" |
| No horizontal overflow at 320 px (incl. long unbroken tokens) | `study.spec.ts` `expectNoHorizontalOverflow` on both projects |

## Manual checks performed (real browser)

Initial, validation error, over-limit (20,024 chars kept, Generate disabled), loading + cancel, real `AI_NOT_CONFIGURED` error through the full stack (browser → Vite proxy → Express), flashcard flip/navigate, quiz incorrect/correct feedback, results, retest, tab bar at 320 px. Five layout bugs were found this way and fixed (see git log).

## Not covered / known gaps

- Live Gemini call (needs a key): manual smoke test in README.
- No automated screen-reader pass; semantics are native (fieldset/legend, radios, button, tablist) and checked via accessible-name assertions only.
- Cross-browser: Playwright runs on Edge/Chromium only.
- One intermittent Vitest worker crash (Windows exit code `0xC0000409`) was seen once during development on `api.test.ts` and did not recur in repeated runs; cause not identified.
