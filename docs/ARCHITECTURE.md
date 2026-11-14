# Architecture

Recall Studio turns pasted notes (or a topic) into flashcards and a quiz. The LLM returns **structured JSON**; the server validates it; React renders real components from the validated data. It is not a chat interface.

```
Browser (React)                    Node (Express)                         Provider
─────────────────                  ──────────────────────                 ────────
InputPanel ──┐
             ▼
useStudyGenerator ── POST /api/study/generate ──▶ route: validate request
  (request id +                                    │
   AbortController)                                ▼
             ▲                              studyService.generateStudySet
             │                                 │  1. provider.generate()  ───────▶ Gemini (JSON schema mode)
   typed ApiClientError                        │  2. parseModelOutput()  (Zod + semantic checks)
   or validated StudySet ◀── JSON ─────────────│  3. on failure: ONE repair call
                                               │  4. normalizeStudySet() (server-issued IDs)
                                               ▼
                                        typed error | StudySet
```

## Folder map

| Path | Responsibility |
|---|---|
| `shared/contract.ts` | Single source of truth: Zod schemas, limits, TypeScript types, error codes + HTTP status/retry table. Imported by both sides. |
| `server/app.ts` | `createApp({ provider })` factory (no `listen`), JSON body limit, request-ID header, JSON error middleware. |
| `server/services/ai/studyService.ts` | Orchestration: timeout per call, bounded repair, error translation. Knows nothing about HTTP or a specific provider. |
| `server/services/ai/geminiProvider.ts` | The only file importing the provider SDK. Swap providers by implementing `AiProvider`. |
| `server/services/ai/prompts.ts` | System instruction, generation prompt, repair prompt. |
| `server/validation/studySet.ts` | Pure functions: parse → validate → mode-filter → normalise. |
| `src/lib/api/studyApi.ts` | The only HTTP code in the UI. Maps every failure to `ApiClientError { code, retryable }`. |
| `src/hooks/useStudyGenerator.ts` | Reducer + request-ID guard + `AbortController`. |
| `src/features/study/quizSession.ts` | Pure quiz reducer, scoring and wrong-answer collection. |
| `src/features/study/StudyWorkspace.tsx` | Tabs, retest wiring. |
| `src/components/**` | Presentational pieces (input, flashcards, quiz, states, ui). |

## Key decisions and trade-offs

**Validation at the boundary, twice.** The server validates model output (untrusted); the client validates the server response (never trust the network). Both use the same Zod schemas from `shared/`. TypeScript types alone are not runtime checks.

**Zod → JSON Schema.** The schema sent to Gemini (`responseJsonSchema`) is generated from the same Zod object that validates the response, so they cannot drift apart. Quiz `options` is `array(string).length(4)` in the provider schema (tuples emit `prefixItems`, which provider schema subsets handle poorly); distinctness and the tuple type are enforced app-side.

**One bounded repair.** On invalid/empty output the service makes exactly one more call containing the safe validation issue text plus the previous output (clipped to 6,000 chars) and asks for a corrected object. Still invalid → typed `AI_INVALID_OUTPUT` / `AI_EMPTY_OUTPUT` (HTTP 502, retryable). Tests assert the provider is called at most twice.

**Latest-request-wins.** Each `run()` takes an increasing ID and aborts the previous controller. Results for any ID other than the latest are dropped — *including errors* — so an old failure cannot replace a newer success. The ID guard is the real guarantee (a response can already be in flight when abort is called); `AbortController` saves cost and connections. Tests use a fake `generate` that **ignores the abort signal** so they exercise the guard itself.

**Timeouts.** Server: 30 s per provider call (`AI_TIMEOUT_MS`), so ≤ 60 s total with a repair. Client: 75 s, deliberately larger, so the server's typed `AI_TIMEOUT` reaches the UI instead of a generic client timeout. If the browser disconnects, the server aborts the provider call.

**Server boots without a key.** Missing `GEMINI_API_KEY` logs a warning and every generate call returns `503 AI_NOT_CONFIGURED` (non-retryable). `npm start` therefore always works on a fresh clone.

**Privacy.** Logs contain only request ID and safe category — never notes, raw model output, or keys. The key is read from server env only (never `VITE_`-prefixed). Model text is rendered as ordinary React text (no `dangerouslySetInnerHTML`).

**Scoring is application code.** The model never returns a score; correctness is computed from `correctIndex` and the user's submitted answers.

**Not built (by design):** database, auth, streaming, saved sessions, shadcn/ui (native controls were enough and keep the dependency surface small).

## Design system ("paper & ink")

A calm study-desk look chosen to feel unlike a chatbot or SaaS dashboard. Tokens live in `src/index.css` (`@theme`).

| Token | Value | Use |
|---|---|---|
| `paper` / `surface` | `#f6f2ea` / `#fffdf8` | page / cards |
| `ink` / `ink-muted` | `#1c2430` / `#556070` | text (muted ≈ 5.5:1 on paper) |
| `accent` / `accent-strong` / `accent-soft` | `#0b6e5f` / `#08574b` / `#dff1ec` | primary actions, selection, answer face |
| `warm` | `#a8480a` | small labels ("Question", retest badge) |
| `good` / `bad` (+ `-soft`) | `#14683a` / `#a11d2c` | correct / incorrect — always paired with an icon and text, never colour alone |
| Display font | Iowan Old Style → Palatino → Georgia | headings, question text |
| Body font | system-ui stack | everything else (no external font requests) |

Motion: card flip (0.45 s) and a 6 px entrance rise; both disabled under `prefers-reduced-motion`. One focus ring (3 px accent, 2 px offset) for every interactive element.

> Tooling note: the UI/UX Pro Max and `frontend-design` skills were not available in this environment, so the direction above was chosen directly and verified in a real browser. See README → AI-use note.
