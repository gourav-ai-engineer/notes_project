/**
 * The saved library: folders (subjects), study sets, per-card progress and study activity.
 * Everything here is plain data + pure functions so it is easy to validate, test and migrate.
 * Only generated/typed content is stored — uploaded files are never kept.
 */
import { z } from "zod";
import { LIMITS, STUDY_MODES, studySetSchema, type Flashcard, type QuizQuestion, type StudyMode, type StudySet } from "../../../shared/contract";

export const LIBRARY_VERSION = 1;
export const MAX_CARDS_PER_SET = 200;
export const MAX_FOLDER_NAME = 60;
export const FOLDER_COLORS = ["blue", "violet", "teal", "green", "amber", "rose"] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];
export const CARD_STATUSES = ["new", "learning", "known"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

// ---------- Schemas ----------
const cardBase = studySetSchema.shape.flashcards.element;
const quizBase = studySetSchema.shape.quiz.element;

export const libraryCardSchema = cardBase.extend({
  starred: z.boolean().default(false),
  status: z.enum(CARD_STATUSES).default("new"),
});

const isoString = z.string().min(1).max(40);

export const librarySetSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(LIMITS.title),
  summary: z.string().max(LIMITS.summary),
  folderId: z.string().min(1).nullable(),
  source: z.enum(["ai", "manual"]),
  mode: z.enum(STUDY_MODES),
  flashcards: z.array(libraryCardSchema).max(MAX_CARDS_PER_SET),
  quiz: z.array(quizBase).max(MAX_CARDS_PER_SET),
  createdAt: isoString,
  updatedAt: isoString,
  lastStudiedAt: isoString.nullable().default(null),
  quizBest: z.object({ correct: z.number().int().min(0), total: z.number().int().min(1) }).nullable().default(null),
});

export const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(MAX_FOLDER_NAME),
  color: z.enum(FOLDER_COLORS),
  createdAt: isoString,
});

export const librarySchema = z.object({
  version: z.literal(LIBRARY_VERSION),
  folders: z.array(folderSchema).max(500),
  sets: z.array(librarySetSchema).max(2000),
  /** Days (YYYY-MM-DD) on which something was studied. Drives the streak. */
  activity: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(800),
});

export type LibraryCard = z.infer<typeof libraryCardSchema>;
export type LibrarySet = z.infer<typeof librarySetSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type Library = z.infer<typeof librarySchema>;

export const emptyLibrary = (): Library => ({ version: LIBRARY_VERSION, folders: [], sets: [], activity: [] });

// ---------- Helpers ----------
/** crypto.randomUUID needs a secure context; fall back so it never throws on plain-http LAN testing. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The learner's LOCAL calendar day (YYYY-MM-DD), so a streak rolls over at their midnight, not UTC's. */
export function localDayKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLibrarySet(studySet: StudySet, folderId: string | null, now = new Date().toISOString()): LibrarySet {
  return {
    id: studySet.id,
    title: studySet.title,
    summary: studySet.summary,
    folderId,
    source: "ai",
    mode: studySet.mode,
    flashcards: studySet.flashcards.map((c) => ({ ...c, starred: false, status: "new" as const })),
    quiz: studySet.quiz,
    createdAt: studySet.createdAt || now,
    updatedAt: now,
    lastStudiedAt: null,
    quizBest: null,
  };
}

export interface DraftCard {
  id?: string;
  question: string;
  answer: string;
}

/** Normalises editor rows into stored cards, keeping existing ids (and so progress) where there is one. */
export function draftToCards(drafts: DraftCard[], previous: LibraryCard[] = []): LibraryCard[] {
  const prev = new Map(previous.map((c) => [c.id, c]));
  return drafts
    .map((d) => ({ ...d, question: d.question.trim(), answer: d.answer.trim() }))
    .filter((d) => d.question && d.answer)
    .map((d) => {
      const old = d.id ? prev.get(d.id) : undefined;
      if (old) {
        // Changing the wording invalidates "known", but starring is the learner's own marker.
        const changed = old.question !== d.question || old.answer !== d.answer;
        return { ...old, question: d.question, answer: d.answer, status: changed ? ("learning" as const) : old.status };
      }
      return { id: newId(), question: d.question, answer: d.answer, topic: "General", difficulty: "medium" as const, starred: false, status: "new" as const };
    });
}

export function inferMode(flashcards: unknown[], quiz: unknown[]): StudyMode {
  if (flashcards.length && quiz.length) return "both";
  return quiz.length ? "quiz" : "flashcards";
}

export const toFlashcards = (cards: LibraryCard[]): Flashcard[] =>
  cards.map(({ id, question, answer, topic, difficulty }) => ({ id, question, answer, topic, difficulty }));

export interface Progress {
  total: number;
  known: number;
  learning: number;
  fresh: number;
  /** 0-100, rounded. 0 when there are no cards. */
  percent: number;
}

export function cardProgress(cards: LibraryCard[]): Progress {
  const known = cards.filter((c) => c.status === "known").length;
  const learning = cards.filter((c) => c.status === "learning").length;
  const total = cards.length;
  return { total, known, learning, fresh: total - known - learning, percent: total ? Math.round((known / total) * 100) : 0 };
}

/** Consecutive study days ending today (or yesterday, so the streak isn't lost before you study today). */
export function computeStreak(activity: string[], today: string): number {
  const days = new Set(activity);
  const step = (d: string, delta: number) => {
    const date = new Date(`${d}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  };
  let cursor = days.has(today) ? today : step(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = step(cursor, -1);
  }
  return streak;
}

export function mergeLibraries(current: Library, incoming: Library, makeId: () => string = newId): Library {
  const folderIds = new Set(current.folders.map((f) => f.id));
  const setIds = new Set(current.sets.map((s) => s.id));
  const folderRemap = new Map<string, string>();

  const folders = incoming.folders.map((f) => {
    if (!folderIds.has(f.id)) return f;
    const id = makeId();
    folderRemap.set(f.id, id);
    return { ...f, id };
  });
  const sets = incoming.sets.map((s) => {
    const folderId = s.folderId ? (folderRemap.get(s.folderId) ?? s.folderId) : null;
    return setIds.has(s.id) ? { ...s, id: makeId(), folderId } : { ...s, folderId };
  });
  return {
    version: LIBRARY_VERSION,
    folders: [...current.folders, ...folders],
    sets: [...current.sets, ...sets],
    activity: [...new Set([...current.activity, ...incoming.activity])].sort(),
  };
}

export type { QuizQuestion };
