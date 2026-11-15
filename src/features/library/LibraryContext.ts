import { createContext, useContext } from "react";
import type { QuizQuestion, StudySet } from "../../../shared/contract";
import type { CardStatus, DraftCard, Folder, FolderColor, Library, LibrarySet } from "./model";
import type { ImportResult, StorageProblem } from "./storage";

export interface SetFields {
  title: string;
  summary: string;
  folderId: string | null;
  cards: DraftCard[];
}

export interface LibraryApi {
  library: Library;
  /** Stored data was unreadable: it was backed up and the library started empty. */
  recovered: boolean;
  /** Last save failed (full or blocked storage): changes live in memory only. */
  storageProblem: StorageProblem | null;
  dismissNotices: () => void;

  createFolder: (name: string, color?: FolderColor) => string;
  updateFolder: (id: string, patch: { name?: string; color?: FolderColor }) => void;
  deleteFolder: (id: string, deleteSets: boolean) => void;

  /** Idempotent on the server-issued id. */
  saveGeneratedSet: (studySet: StudySet, folderId: string | null) => string;
  createManualSet: (fields: SetFields) => string;
  editSet: (id: string, fields: SetFields) => void;
  moveSet: (id: string, folderId: string | null) => void;
  /** Attach a generated quiz to an existing set (used by "make a quiz from these cards"). */
  setQuiz: (id: string, quiz: QuizQuestion[]) => void;
  deleteSet: (id: string) => void;
  duplicateSet: (id: string) => string | null;

  toggleStar: (setId: string, cardId: string) => void;
  setCardStatus: (setId: string, cardId: string, status: CardStatus) => void;
  resetProgress: (setId: string) => void;
  recordStudy: (setId: string) => void;
  recordQuiz: (setId: string, correct: number, total: number) => void;

  exportBackup: () => string;
  importBackup: (text: string, mode: "merge" | "replace") => ImportResult;
  clearAll: () => void;
}

export const LibraryContext = createContext<LibraryApi | null>(null);

export function useLibrary(): LibraryApi {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return ctx;
}

// ---------- selectors ----------
export const findSet = (library: Library, id: string | undefined): LibrarySet | undefined => library.sets.find((s) => s.id === id);
export const findFolder = (library: Library, id: string | undefined): Folder | undefined => library.folders.find((f) => f.id === id);
export const setsInFolder = (library: Library, folderId: string | null): LibrarySet[] => library.sets.filter((s) => s.folderId === folderId);
