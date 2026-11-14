/**
 * Turns raw (untrusted) model text into a validated, normalized StudySet.
 * Pure functions only — no I/O — so every failure mode is unit-testable.
 */
import { randomUUID } from "node:crypto";
import {
  LIMITS,
  generatedContentSchema,
  type CorrectIndex,
  type Flashcard,
  type GeneratedStudyContent,
  type Option4,
  type QuizQuestion,
  type StudyMode,
  type StudySet,
} from "../../shared/contract.ts";

export type ParseFailureKind = "EMPTY" | "INVALID_JSON" | "INVALID_SHAPE";

export type ParseResult =
  | { ok: true; content: GeneratedStudyContent }
  | { ok: false; kind: ParseFailureKind; issues: string };

const wantsFlashcards = (mode: StudyMode) => mode === "flashcards" || mode === "both";
const wantsQuiz = (mode: StudyMode) => mode === "quiz" || mode === "both";

/** Models sometimes wrap JSON in ```json fences even in JSON mode. Stripping them is safe. */
function stripCodeFence(raw: string): string {
  const match = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : raw.trim();
}

function summariseIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Semantic checks that a structural schema can't express. Returns issue text or null. */
function semanticIssues(content: GeneratedStudyContent, mode: StudyMode): string | null {
  const problems: string[] = [];

  if (wantsFlashcards(mode)) {
    const n = content.flashcards.length;
    if (n < LIMITS.itemsMin) problems.push(`flashcards: need ${LIMITS.itemsMin}-${LIMITS.itemsMax} items, got ${n}`);
    const seen = new Set<string>();
    for (const [i, c] of content.flashcards.entries()) {
      if (seen.has(norm(c.question))) problems.push(`flashcards.${i}.question: duplicate`);
      seen.add(norm(c.question));
    }
  }

  if (wantsQuiz(mode)) {
    const n = content.quiz.length;
    if (n < LIMITS.itemsMin) problems.push(`quiz: need ${LIMITS.itemsMin}-${LIMITS.itemsMax} items, got ${n}`);
    const seen = new Set<string>();
    for (const [i, q] of content.quiz.entries()) {
      if (seen.has(norm(q.question))) problems.push(`quiz.${i}.question: duplicate`);
      seen.add(norm(q.question));
      if (new Set(q.options.map(norm)).size !== 4) problems.push(`quiz.${i}.options: must be 4 distinct options`);
    }
  }

  return problems.length ? problems.slice(0, 8).join("; ") : null;
}

/** Parse + validate model text for the requested mode. Unrequested content is stripped. */
export function parseModelOutput(raw: string | null | undefined, mode: StudyMode): ParseResult {
  if (!raw || raw.trim() === "") {
    return { ok: false, kind: "EMPTY", issues: "The response was empty." };
  }

  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, kind: "INVALID_JSON", issues: "The response was not valid JSON." };
  }

  const parsed = generatedContentSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, kind: "INVALID_SHAPE", issues: summariseIssues(parsed.error) };
  }

  const content: GeneratedStudyContent = {
    ...parsed.data,
    flashcards: wantsFlashcards(mode) ? parsed.data.flashcards : [],
    quiz: wantsQuiz(mode) ? parsed.data.quiz : [],
  };

  const problems = semanticIssues(content, mode);
  if (problems) {
    const noRequestedContent =
      (!wantsFlashcards(mode) || content.flashcards.length === 0) &&
      (!wantsQuiz(mode) || content.quiz.length === 0);
    return { ok: false, kind: noRequestedContent ? "EMPTY" : "INVALID_SHAPE", issues: problems };
  }

  return { ok: true, content };
}

/** Assign server-generated IDs and timestamps. Never trusts model-provided IDs. */
export function normalizeStudySet(content: GeneratedStudyContent, mode: StudyMode, now = new Date()): StudySet {
  const flashcards: Flashcard[] = content.flashcards.map((c) => ({ ...c, id: randomUUID() }));
  const quiz: QuizQuestion[] = content.quiz.map((q) => ({
    ...q,
    id: randomUUID(),
    options: q.options as Option4,
    correctIndex: q.correctIndex as CorrectIndex,
  }));
  return {
    id: randomUUID(),
    title: content.title,
    summary: content.summary,
    mode,
    flashcards,
    quiz,
    createdAt: now.toISOString(),
  };
}
