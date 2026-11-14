# Product Requirements Document (PRD)
## Study Assistant — AI Notes to Flashcards & Quiz

**Build target:** Claude Code working inside a user-provided local project folder  
**Assignment:** Frontend Internship Assignment — option 1, Study Assistant  
**Working product name:** Recall Studio (rename only if the existing folder already has a product name)  
**Primary objective:** Deliver a polished, reliable React application that converts pasted study notes or a topic into structured, interactive flashcards and quizzes.  
**Important constraint:** This is an internship assignment, not an open-ended SaaS build. Prioritise a small, complete, explainable product over unnecessary infrastructure.

---

# 1. Mission and success definition

Build a small React app where a student can paste unstructured notes or enter a topic, request AI-generated study material, and learn through interactive flashcards and quizzes. The AI must return structured data (JSON or provider-enforced structured output); the React app must validate that data and render real interactive components. This must **not** be implemented as a chatbot or as a chat interface that prints raw model text.

The most important engineering objective is dependable handling of unpredictable model output. Malformed JSON, a valid JSON object with the wrong shape, empty content, API errors, timeouts, and out-of-order responses must be handled explicitly. The app must remain usable and never crash because the model returned something unexpected.

The finished result should be understandable by an entry-level frontend engineer and easy to explain in an interview. Use clear code, small components, meaningful names, tests, and documented trade-offs.

## Definition of success

A user can:
1. Open the app on desktop or mobile.
2. Paste notes or enter a topic in a free-form input.
3. Select Flashcards, Quiz, or Both.
4. Generate a study set through a real LLM API called from the backend (never directly from the browser).
5. Flip and navigate flashcards.
6. Answer a multiple-choice quiz and receive immediate, understandable feedback and an explanation.
7. See a score and retest only the questions answered incorrectly.
8. Recover from malformed/empty/failed/slow AI responses using a clear error state and retry action.

The application is complete only when the core flow works, responsive states are checked in a real browser, and the README explains setup, AI use, limitations, and actual time spent.

---

# 2. Source assignment requirements — non-negotiable

The supplied assignment asks for:
- React with hooks and functional components.
- A free-form text input.
- A real LLM API from any provider.
- Structured model output which application code parses and renders as interactive, stateful UI.
- Robust handling of malformed JSON, wrong data shape, empty output, slow output, and failed requests.
- No crashes and no stale response overwriting a newer response.
- Loading, error, and empty states.
- Mobile support.
- A README containing setup, an AI-usage note, known limitations, and time spent.
- A public GitHub repository (or private repository with access), meaningful commits, a short screen recording, and local run instructions. Deployment is preferred but optional.

The assignment explicitly says this must not be a chatbot, and that handling failure well is a major evaluation signal. Its evaluation weights are: React/frontend architecture 25%, AI integration/data handling 25%, bad AI output handling 20%, UI/UX/product sense 15%, and communication/understanding 15%. The stated target is approximately eight hours of actual work; stop feature expansion when the core is reliable and document sensible next steps.

**Follow these requirements even if a plugin, agent, or model suggests adding unrelated features.**

---

# 3. Product scope and priorities

## P0 — required for submission

- Responsive single-page study workspace.
- Notes/topic input with client-side validation and character count.
- Generation mode: Flashcards, Quiz, or Both.
- Real backend-mediated LLM request.
- Structured output contract and runtime validation.
- Flashcard deck with flip, next/previous, and progress.
- Quiz flow with answer selection, submit/check, feedback, explanation, and final score.
- Wrong-answer collection and a Retest Wrong Answers flow.
- Loading, initial empty, success, recoverable error, and retry states.
- Request cancellation or equivalent latest-request protection.
- Unit/component/API tests for the critical paths.
- Mobile and keyboard-accessible interactions.
- README and `.env.example`.

## P1 — add only after every P0 acceptance criterion passes

- Save the most recent study set and progress in localStorage, with a clear “saved on this device” explanation.
- Regenerate a study set from the same notes.
- Shuffle flashcards or quiz order, while preserving correct-answer mapping.
- Dark mode, only if it can be implemented without destabilising the UI.
- Small motion details for card flips and state transitions, respecting reduced-motion preferences.

## P2 — stretch ideas, not required

- Multiple saved study sessions.
- Follow-up refinement of an existing study set.
- Streaming generation.
- Charts, checklists, or other dynamic block types.
- Accounts, cloud sync, database, analytics, billing, social features, admin panels, or a full LMS.

Do not start P1/P2 work while any P0 test is failing. Do not build a database or authentication system for this assignment.

---

# 4. Users, user needs, and primary journey

## Primary user

A student preparing for an exam who has lecture notes, textbook excerpts, or a topic outline and wants to turn it into active-recall practice quickly.

## User needs

- “I want to paste my notes without formatting them first.”
- “I want study material that is useful, not a wall of AI text.”
- “I need to know whether an answer is right and why.”
- “I want to focus again on questions I got wrong.”
- “When generation fails, I need to know what happened and what I can do next.”

## Primary journey

1. **Input:** A clear title and short explanation introduce the product. The user pastes notes or enters a topic in a labelled textarea. Show character count and minimum/maximum guidance. Provide a few example-topic chips only as input helpers; they must not look like chatbot suggestions.
2. **Choose format:** Segmented control or similarly clear selector for Flashcards / Quiz / Both. Default to Both if this does not overwhelm the first-time experience.
3. **Generate:** The primary CTA starts one request. Disable or clearly guard duplicate submissions. Show a purposeful loading state and status text; do not display fake progress percentages.
4. **Study workspace:** Replace the input-first view or transition to a results workspace. Show generated title, concise summary, counts, and tabs/segments for Flashcards, Quiz, and Retest Wrong.
5. **Flashcards:** One card at a time. The question/front is visible first; click/tap/Space flips it to reveal the answer. Previous/Next controls and a progress indicator are available. Support keyboard navigation without trapping focus.
6. **Quiz:** Show one question at a time with selectable options. Submit/check the answer before moving on. Clearly indicate correct/incorrect, show an explanation, and provide Next. Avoid revealing the correct answer before submission.
7. **Results:** Show score, correct/incorrect counts, and a clear Retest Wrong Answers action. Also allow a restart of the full quiz.
8. **Retest:** Present only previously incorrect questions. If there are no wrong answers, show a positive, useful empty state rather than an empty panel.
9. **Recovery:** If generation fails, retain the user's notes and chosen mode. Show a concise explanation, retry action, and a way to edit the input. Never lose the pasted text on an ordinary request failure.

---

# 5. Functional requirements

## FR-01 — Notes/topic input

- Use a real `<textarea>` with a visible label and accessible description.
- Accept free-form notes and short topic descriptions.
- Trim leading/trailing whitespace before submission.
- Reject empty input and input below a modest minimum (suggest 20 characters); explain what is needed.
- Set a sensible maximum (suggest 20,000 characters) to control latency and cost. Show the limit and prevent accidental overflow.
- Retain the original input when generation fails.
- Do not silently truncate text.

## FR-02 — Study mode selection

- Support `flashcards`, `quiz`, and `both` modes.
- The selected mode must be part of the API request and model prompt.
- Do not show a tab for a content type that was not requested or generated.

## FR-03 — AI generation

- Call the LLM only from a backend route/server function.
- Use one provider for the MVP. Prefer a provider with an accessible developer tier, subject to the user's available API credentials and current official API documentation. A Gemini integration is a reasonable default; do not assume Claude Code login gives the app an Anthropic API key.
- Keep provider code behind a small adapter/service so a provider can be swapped later without rewriting UI components.
- Use provider-enforced JSON/schema output if the selected provider supports it. Regardless, validate the response at runtime.
- Tell the model to generate content only from the supplied notes/topic, avoid inventing unsupported facts, use clear concise language, and make distractors plausible but unambiguous.
- Do not ask the model to emit HTML, CSS, React code, Markdown UI, or arbitrary component names.

## FR-04 — Flashcards

- Display one flashcard at a time.
- Front: a concise question or recall prompt.
- Back: the answer, with enough detail to be useful but no unrelated essay.
- Include topic/tag and difficulty when available.
- Include flip, previous, next, and “Card X of Y” progress.
- Handle first/last-card boundaries correctly.
- Make the card usable on touch screens and by keyboard.

## FR-05 — Quiz

- Display one multiple-choice question at a time.
- Selecting an option must not immediately advance the quiz.
- Provide a Check Answer action.
- After checking, show correct/incorrect state and the explanation.
- Prevent changing an answer after it has been checked, unless the user explicitly restarts the question/quiz.
- Provide Next and a final results screen.
- Calculate score from the user's submitted answers in application code, not from a model-provided score.

## FR-06 — Retest wrong answers

- Track question IDs answered incorrectly in the current study session.
- Retest must contain only incorrect questions from the completed attempt.
- Preserve the original correct answer and explanation.
- Recalculate the retest score independently.
- If the user got everything right, show a congratulatory state and no broken/disabled retest experience.

## FR-07 — Loading and error states

Create explicit UI states for at least:
- Idle/initial.
- Client validation error.
- Loading/generating.
- Success.
- Empty or unusable AI result.
- Invalid JSON.
- Valid JSON with invalid schema/wrong shape.
- Provider/API failure.
- Timeout.
- Network failure.
- Request cancelled or superseded.

Show user-friendly error messages. Include a Retry action where retrying makes sense. Keep technical details in server logs/developer diagnostics, not in the main UI. Never display secrets, provider keys, stack traces, or raw unsafe model output.

## FR-08 — Out-of-order response protection

- Use `AbortController` on the client where possible.
- Give each generation request a monotonically increasing request ID or equivalent identity.
- Only the latest active request may update visible application state.
- Abort or ignore an older request when the user submits a newer one or leaves the generation flow.
- A late response from an earlier request must never replace a newer study set.
- Add a deterministic automated test that simulates request B resolving before request A and confirms A cannot overwrite B.

## FR-09 — Responsive and accessible UI

- Support narrow mobile screens (minimum target 320px width), tablet, and desktop.
- No horizontal page overflow.
- Use semantic headings, buttons, forms, labels, and live status announcements.
- Visible keyboard focus indicators.
- Logical tab order and keyboard operation for cards and quiz options.
- Sufficient contrast and touch targets.
- Honour `prefers-reduced-motion`.
- Do not rely on colour alone to communicate correctness.

---

# 6. Structured AI data contract

The following is the canonical application contract. Adapt provider-specific JSON Schema syntax as needed, but do not weaken application-side validation.

## Request

```ts
type StudyMode = "flashcards" | "quiz" | "both";

interface GenerateStudyRequest {
  notes: string;
  mode: StudyMode;
}
```

## Model output before server normalization

```ts
type Difficulty = "easy" | "medium" | "hard";

interface GeneratedStudyContent {
  title: string;
  summary: string;
  flashcards: Array<{
    question: string;
    answer: string;
    topic: string;
    difficulty: Difficulty;
  }>;
  quiz: Array<{
    question: string;
    options: [string, string, string, string];
    correctIndex: 0 | 1 | 2 | 3;
    explanation: string;
    topic: string;
    difficulty: Difficulty;
  }>;
}
```

## Normalized application types

The server should validate the model payload and assign stable IDs itself; do not rely on the model to generate unique IDs.

```ts
interface Flashcard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: Difficulty;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  topic: string;
  difficulty: Difficulty;
}

interface StudySet {
  id: string;
  title: string;
  summary: string;
  mode: StudyMode;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  createdAt: string;
}
```

## Validation rules

- `title` and `summary` must be non-empty strings within sensible length limits.
- All question, answer, option, explanation, and topic fields must be non-empty strings and have length caps.
- Each quiz question must contain exactly four distinct, non-empty options.
- `correctIndex` must be an integer from 0 to 3.
- Difficulty must be one of the three enum values; normalise only safe, unambiguous casing differences if desired.
- Arrays must be bounded (suggest 3–15 items for each requested content type; never accept an unbounded model response).
- Validate mode/content consistency: flashcards mode needs flashcards; quiz mode needs quiz; both needs both. Unrequested content may be an empty array.
- Reject duplicate/empty questions if they make the set unusable.
- Do not trust model-generated IDs, HTML, URLs, or component types.
- Use Zod or an equivalent runtime schema library at the API boundary. TypeScript types alone are not runtime validation.

## Recovery strategy for invalid model output

1. Request structured output using the provider's schema mode when available.
2. Parse the response and validate it with the runtime schema.
3. If JSON parsing or validation fails, make at most one bounded repair attempt, explicitly telling the model to return only a corrected object conforming to the exact schema and giving it the validation issue plus the previous output. Do not reveal secrets or unrelated context.
4. Parse and validate the repaired response again.
5. If it still fails, return a typed, retryable API error. Do not loop indefinitely, fabricate content, or quietly render partial invalid data.
6. Log a request/correlation ID and safe error category. Avoid logging API keys or full private notes by default.

---

# 7. Backend API contract

Implement one small backend endpoint:

`POST /api/study/generate`

Request body:

```json
{
  "notes": "User-provided study notes...",
  "mode": "both"
}
```

Success response:

```json
{
  "studySet": {
    "id": "server-generated-id",
    "title": "Example topic",
    "summary": "A concise summary",
    "mode": "both",
    "flashcards": [],
    "quiz": [],
    "createdAt": "ISO-8601 timestamp"
  }
}
```

Error response:

```json
{
  "error": {
    "code": "AI_INVALID_OUTPUT",
    "message": "The study set could not be generated reliably. Please try again.",
    "retryable": true,
    "requestId": "correlation-id"
  }
}
```

Use appropriate HTTP status codes (400 invalid request, 429 rate limit if implemented, 502 invalid provider output, 503 provider unavailable, 504 timeout, 500 unexpected internal error). The frontend should branch on stable error codes, not parse free-text error messages. Do not return provider secrets or stack traces.

---

# 8. Technical architecture and implementation choices

Use a deliberately small architecture. A suggested stack is:

- Frontend: React + TypeScript + Vite.
- Styling: Tailwind CSS and a small set of shadcn/ui or accessible headless components where they improve consistency.
- Icons: Lucide React.
- Backend: Node.js + Express (or an equally small Node server compatible with the chosen Vite setup).
- Runtime validation: Zod shared between frontend/backend where practical.
- AI: one provider SDK, called only on the server; choose the current supported low-cost/free-tier model based on official docs and the available key.
- Tests: Vitest + React Testing Library for unit/component tests; Playwright for a small browser end-to-end smoke suite.

Use current stable versions and current official documentation. Do not invent APIs or copy deprecated setup examples. Use Context7 or the official docs for version-sensitive configuration.

## Suggested project layout

```text
project-root/
  public/
  src/
    app/
    components/
      input/
      flashcards/
      quiz/
      states/
      layout/
    features/study/
    hooks/
    lib/
      api/
      validation/
    styles/
    types/
  server/
    routes/
    services/ai/
    validation/
    middleware/
  tests/
    unit/
    components/
    e2e/
    fixtures/
  docs/
    IMPLEMENTATION_PLAN.md
    ARCHITECTURE.md
    TEST_PLAN.md
  .claude/
  .env.example
  .gitignore
  CLAUDE.md
  README.md
  package.json
  PRD.md
```

Adapt this layout if the folder already contains a working structure. Do not overwrite existing user files without inspecting and preserving them.

## Separation of concerns

- UI components render typed data; they do not call the model directly.
- A frontend API module owns HTTP calls and response parsing.
- A backend route validates input and maps errors to stable API codes.
- An AI service owns provider calls, system/user prompts, timeouts, and one repair attempt.
- A schema module owns model-output validation and normalization.
- Quiz scoring and wrong-answer tracking are deterministic frontend/application logic, not AI-generated results.

---

# 9. Visual and interaction design direction

Use the installed design skills before writing UI code. The product should feel like a carefully designed study workspace, not a generic AI dashboard, chatbot, or template landing page.

## Desired qualities

- Calm, focused, credible, and modern.
- Strong hierarchy: user input and the primary action are obvious; study content receives the most visual attention after generation.
- Thoughtful typography, spacing, rhythm, contrast, and responsive composition.
- A distinct visual identity selected using UI/UX Pro Max recommendations and refined using the Anthropic frontend-design skill.
- Reusable tokens for colour, typography, spacing, radius, elevation, and focus states.
- Clear component states: default, hover, focus, disabled, loading, selected, correct, incorrect, and empty.
- Purposeful motion only. Card flip can be animated; other transitions should be subtle and brief. Respect reduced-motion settings.

## Avoid

- A chat-bubble layout or chat input/output history.
- Generic purple/blue gradient hero sections and cookie-cutter dashboard cards.
- Too many bordered cards nested inside other cards.
- Tiny low-contrast text, decorative-only controls, emoji used as a substitute for icons, or excessive animation.
- Placeholder buttons that do nothing.
- Fake progress indicators or fabricated usage metrics.

Before coding, ask the design skills to recommend one cohesive visual direction, palette, type pairing, and component style for a student study tool. Record the chosen tokens in `docs/ARCHITECTURE.md` or a small design-system file. Then build the actual screens, not only a mockup.

---

# 10. Reliability, security, and privacy requirements

- API keys must exist only in server environment variables. Never use `VITE_`-prefixed variables for secrets.
- Commit `.env.example`, never `.env`; check `.gitignore` before adding files.
- Do not expose provider prompts, raw stack traces, or private server configuration in browser errors.
- Render model strings as ordinary React text. Do not use `dangerouslySetInnerHTML` for model output.
- Validate request type, mode, and text length on both client and server.
- Add a sensible provider timeout and ensure pending requests are cleaned up.
- Avoid unnecessary storage of pasted notes. If localStorage session saving is implemented, explain that data remains on the current device and provide a clear clear-session action.
- No authentication or database is required.
- Do not transmit user notes to analytics or third-party services other than the chosen LLM provider.
- Never add secrets to screenshots, logs, commits, or the final report.

---

# 11. Testing and quality gates

Do not declare completion based only on successful compilation. Implement tests for the actual risks in this assignment.

## Unit/schema tests

- Valid model output parses.
- Malformed JSON is rejected.
- Missing required fields are rejected.
- Wrong types and wrong array shapes are rejected.
- Empty arrays are rejected when required by the selected mode.
- Quiz options must be four distinct non-empty strings.
- Invalid correct-answer index is rejected.
- Over-limit content is rejected.
- Duplicate/empty identifiers are not accepted if IDs are included after normalization.

## Backend/API tests

- Valid request returns a normalized StudySet.
- Invalid request returns HTTP 400 with a stable error code.
- Provider timeout returns a typed timeout error.
- Provider/network failure returns a typed provider error.
- Malformed output triggers no more than one repair call.
- Repaired valid output succeeds.
- Still-invalid output returns a controlled error, not a crash.
- Secrets are not present in responses or logs.

Use a mocked provider in automated tests so the test suite does not require a paid API key or make live model calls. Keep a separate manual smoke-test instruction for the real provider integration.

## Frontend/component tests

- Notes validation and character limit.
- Loading and retry state.
- Flashcard flip and next/previous boundaries.
- Quiz selection, check answer, explanation, and score calculation.
- Wrong-answer list contains only failed questions.
- Perfect score shows the no-wrong-answers state.
- Failure preserves the notes and selected mode.
- Older request resolving after newer request cannot overwrite newer results.

## Playwright smoke tests

- Launch app and confirm the initial view loads.
- Enter sample notes and generate using a deterministic test/mock API fixture.
- Flip a flashcard and navigate.
- Complete a quiz with a mix of right and wrong answers.
- Open Retest Wrong and verify only wrong questions appear.
- Test a narrow viewport and confirm there is no horizontal overflow.
- Capture screenshots of desktop and mobile views for final review.

## Quality gates before completion

Run and fix all applicable checks:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e` (if the Playwright suite is configured)

If one command is not implemented, either implement it or explicitly document why. Never claim a check passed unless it was actually executed and passed.

---

# 12. Claude Code plugins, skills, and MCP tools

You are expected to use the tools that materially improve this project. Do not install every available plugin. Use a small, complementary set, check whether a tool is already installed before installing it, inspect the source/permissions of community tools, and verify successful activation. If a plugin is unavailable or installation requires an interactive approval you cannot complete, state that and continue with the best safe fallback. Never claim a plugin was used if it was not available.

Recommended core plugins (Anthropic's official marketplace): `frontend-design`, `superpowers`, `context7`, `playwright`, `code-review`, `code-simplifier`, `security-guidance`, `typescript-lsp`.

UI/UX Pro Max (community skill, `nextlevelbuilder/ui-ux-pro-max-skill`) for design-system recommendations, paired with `frontend-design`. shadcn/ui MCP only if shadcn components are used. Defer GitHub, Vercel, Figma, Supabase and unrelated plugins to later phases or not at all.

Tool hygiene: prefer verified marketplace entries and official docs; treat third-party plugin code and MCP servers as executable software and inspect before installing; keep the smallest useful set; verify activation (`/mcp`).

*(Abridged in this copy; see the original brief for the full install commands and reference links.)*

---

# 13. Autonomous execution plan

Work from the supplied project folder. Do not ask the user to choose architecture, libraries, component names, or minor design details. Make sensible, reversible engineering decisions and document them. Ask the user only when a genuinely required secret, permission, or irreversible external action is missing. Do not push to GitHub or deploy.

- **Phase 0 — inspect and plan:** inspect the folder, read the assignment if present, preserve existing work, check tools, write PRD/CLAUDE/plan/architecture/test-plan docs.
- **Phase 1 — foundation:** React + TS + Vite, styling and tokens, small Node backend with Vite proxy, env validation, `.env.example`, `.gitignore`, scripts incl. a root `npm start`.
- **Phase 2 — design and core UI:** choose and document one design system; build input, mode selection, workspace, flashcards, quiz, results, retest using typed fixtures; confirm responsive/keyboard behaviour.
- **Phase 3 — real AI integration:** consult current provider docs; backend-only adapter with structured output; Zod validation, semantic checks, normalisation, one bounded repair, timeouts, typed errors; wire the frontend API module.
- **Phase 4 — resilience and tests:** latest-request protection and cancellation; tests for malformed JSON, wrong shape, empty output, timeout, provider failure, stale responses; flashcard/quiz/retest tests; Playwright smoke tests.
- **Phase 5 — visual/browser QA:** inspect desktop and mobile in a real browser across all states; review accessibility, spacing, contrast, focus, overflow, motion.
- **Phase 6 — review and documentation:** code-review and security passes; simplify only after behaviour is stable; remove dead code; complete the README; demo script; confirm GitHub-ready locally without pushing.
- **Phase 7 — final audit:** map each assignment requirement to file/test/evidence; report anything incomplete honestly.

---

# 14. Deliverables expected inside the folder

Working source; backend LLM integration with server-side secrets; structured schema and validation; unit/component/API tests and a small Playwright suite; `.env.example` and a correct `.gitignore`; `README.md` (including the exact `npm install` and `npm start` workflow); `PRD.md`; `CLAUDE.md`; `docs/IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md`; a short screen-recording script/checklist. No secrets, no unnecessary build artefacts committed, no remote deployment during this phase.

---

# 15. Acceptance criteria — completion gate

The project is done only when all applicable P0 criteria are demonstrably true:

- [ ] React functional components and hooks are used.
- [ ] User can paste free-form notes/topic.
- [ ] A real LLM API is called from the backend, not the browser.
- [ ] Model output is structured and parsed; raw model prose is not rendered as a chat response.
- [ ] Runtime validation rejects malformed JSON and wrong-shaped data.
- [ ] Empty output, slow responses, timeouts, network/provider failures, and invalid output have controlled UI/API states.
- [ ] One bounded repair attempt is implemented or a clearly documented alternative is justified.
- [ ] A stale response cannot overwrite a newer request.
- [ ] Flashcards flip and navigate correctly.
- [ ] Quiz answers, feedback, explanations, and score work correctly.
- [ ] Retest contains only wrong answers; perfect-score state works.
- [ ] Loading, error, empty, and success states exist.
- [ ] Mobile layout has no horizontal overflow.
- [ ] Keyboard navigation and visible focus work for core controls.
- [ ] Tests cover the risky paths and all quality commands are run.
- [ ] README includes setup, AI-use note, limitations, and actual time spent.
- [ ] Screen-recording instructions and local run instructions are present.
- [ ] No API key is exposed in the frontend or committed.
- [ ] No unrequested external publishing/deployment has been performed.

---

# 16. Assignment rubric mapping

| Evaluation area | What this project must demonstrate |
|---|---|
| React & frontend architecture (25%) | Functional components, hooks, clear component boundaries, typed state, responsive UI, reusable controls. |
| AI integration & data handling (25%) | Real backend-mediated LLM call, schema-constrained output, parsing, normalization, runtime validation, typed API contract. |
| Handling bad AI output (20%) | Malformed/wrong-shape/empty output handling, one bounded repair attempt, timeout/provider/network states, no crash, stale-request protection, tests. |
| UI/UX & product sense (15%) | Clear study-first flow, interactive flashcards and quiz, wrong-answer retest, mobile, accessibility, polished visual hierarchy. |
| Communication & understanding (15%) | README, architecture notes, honest AI-use note, known limitations, actual time spent, demo script, understandable code. |

---

# 17–19. README content, final response format, start instruction

The README must cover: name and description; features and real screenshots; stack and architecture; prerequisites and exact setup; environment variables and `.env.example`; how to run frontend and backend (`npm start` from the root); how to run lint/typecheck/tests/build/e2e; the schema and validation approach; error-handling and stale-request strategy; an honest AI-usage note; known limitations and next steps; actual time spent (never invented); a short screen-recording checklist.

The final handoff must report: what was built; architecture decisions; files changed; plugins/MCP tools actually used (and any that could not be activated); install/run/test commands; real test results; whether a live LLM call was tested and the single env var needed; limitations and remaining P1/P2 work; how to record the demo; confirmation that nothing was pushed or deployed.

Start: inspect the folder, check tools, then execute the phases in order, autonomously, and deliver a working, tested local Study Assistant — not merely a plan or mockup. GitHub push and deployment are a separate later phase.

> **Note on this copy:** sections 12 and 13 and 17–19 are condensed from the original brief; all functional, contract, API, testing and acceptance requirements (sections 1–11, 14–16) are reproduced in full.
