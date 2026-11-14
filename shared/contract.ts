/**
 * Shared contract between the React client and the Node server.
 *
 * - `generatedContentSchema` validates what the LLM returns (untrusted).
 * - `StudySet` is the normalized shape the UI renders (IDs assigned by the server).
 * - `ApiErrorCode` is the stable set of codes the client branches on.
 */
import { z } from "zod";

// ---------- Limits ----------
export const LIMITS = {
  notesMin: 20,
  notesMax: 20_000,
  itemsMin: 3,
  itemsMax: 15,
  title: 120,
  summary: 600,
  question: 400,
  answer: 800,
  option: 200,
  explanation: 600,
  topic: 80,
} as const;

// ---------- Request ----------
export const STUDY_MODES = ["flashcards", "quiz", "both"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const generateRequestSchema = z.object({
  notes: z.string(),
  mode: z.enum(STUDY_MODES),
});
export type GenerateStudyRequest = z.infer<typeof generateRequestSchema>;

/** Returns a user-facing message if the notes are unusable, otherwise null. */
export function validateNotes(raw: string): string | null {
  const length = raw.trim().length;
  if (length === 0) return "Paste some notes or describe a topic to get started.";
  if (length < LIMITS.notesMin)
    return `Add a little more detail — at least ${LIMITS.notesMin} characters (you have ${length}).`;
  if (length > LIMITS.notesMax)
    return `Notes are too long. The limit is ${LIMITS.notesMax.toLocaleString()} characters (you have ${length.toLocaleString()}).`;
  return null;
}

// ---------- Model output (untrusted) ----------
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

/** Only safe, unambiguous casing/whitespace differences are normalised. */
const difficulty = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(DIFFICULTIES),
);

const flashcardSchema = z.object({
  question: text(LIMITS.question),
  answer: text(LIMITS.answer),
  topic: text(LIMITS.topic),
  difficulty,
});

const quizQuestionSchema = z.object({
  question: text(LIMITS.question),
  options: z.array(text(LIMITS.option)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: text(LIMITS.explanation),
  topic: text(LIMITS.topic),
  difficulty,
});

/**
 * Structural schema. Mode-specific rules (which arrays must be non-empty,
 * distinct options, duplicate questions) live in `validateForMode`.
 * Also used to derive the JSON Schema sent to the provider.
 */
export const generatedContentSchema = z.object({
  title: text(LIMITS.title),
  summary: text(LIMITS.summary),
  flashcards: z.array(flashcardSchema).max(LIMITS.itemsMax),
  quiz: z.array(quizQuestionSchema).max(LIMITS.itemsMax),
});
export type GeneratedStudyContent = z.infer<typeof generatedContentSchema>;

// ---------- Normalized application types ----------
export type Option4 = [string, string, string, string];
export type CorrectIndex = 0 | 1 | 2 | 3;

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  topic: string;
  difficulty: Difficulty;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: Option4;
  correctIndex: CorrectIndex;
  explanation: string;
  topic: string;
  difficulty: Difficulty;
}

export interface StudySet {
  id: string;
  title: string;
  summary: string;
  mode: StudyMode;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  createdAt: string;
}

// ---------- API ----------
export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "NOT_FOUND",
  "AI_NOT_CONFIGURED",
  "AI_RATE_LIMITED",
  "AI_PROVIDER_ERROR",
  "AI_TIMEOUT",
  "AI_EMPTY_OUTPUT",
  "AI_INVALID_OUTPUT",
  "INTERNAL_ERROR",
  // Produced only on the client:
  "NETWORK_ERROR",
  "CLIENT_TIMEOUT",
  "BAD_RESPONSE",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
  };
}

export interface GenerateStudyResponse {
  studySet: StudySet;
}

/** HTTP status and retry policy for each server-side error code. */
export const ERROR_META: Record<
  Exclude<ApiErrorCode, "NETWORK_ERROR" | "CLIENT_TIMEOUT" | "BAD_RESPONSE">,
  { status: number; retryable: boolean; message: string }
> = {
  INVALID_REQUEST: { status: 400, retryable: false, message: "That request wasn't valid. Check your notes and try again." },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false, message: "That request was too large to process." },
  NOT_FOUND: { status: 404, retryable: false, message: "That endpoint doesn't exist." },
  AI_NOT_CONFIGURED: { status: 503, retryable: false, message: "The AI service isn't configured on the server yet. Add a GEMINI_API_KEY and restart." },
  AI_RATE_LIMITED: { status: 429, retryable: true, message: "The AI service is busy right now. Wait a moment and try again." },
  AI_PROVIDER_ERROR: { status: 503, retryable: true, message: "The AI service is unavailable right now. Please try again." },
  AI_TIMEOUT: { status: 504, retryable: true, message: "The AI took too long to respond. Please try again." },
  AI_EMPTY_OUTPUT: { status: 502, retryable: true, message: "The AI didn't return any study material. Try again, or add more detail to your notes." },
  AI_INVALID_OUTPUT: { status: 502, retryable: true, message: "The study set could not be generated reliably. Please try again." },
  INTERNAL_ERROR: { status: 500, retryable: true, message: "Something went wrong on our side. Please try again." },
};
