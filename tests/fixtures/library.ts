import { emptyLibrary, toLibrarySet, type Folder, type Library, type LibrarySet } from "../../src/features/library/model";
import { STORAGE_KEY } from "../../src/features/library/storage";
import { makeStudySet } from "./study";

const NOW = "2026-03-10T09:00:00.000Z";

export const folder = (id: string, name: string, color: Folder["color"] = "blue"): Folder => ({ id, name, color, createdAt: NOW });

/** An AI set with the standard 3 cards + 3 quiz questions from makeStudySet. */
export const aiSet = (id: string, title: string, folderId: string | null = null, extra: Partial<LibrarySet> = {}): LibrarySet => ({
  ...toLibrarySet(makeStudySet({ id, title }), folderId, NOW),
  ...extra,
});

export function manualSet(id: string, title: string, folderId: string | null = null): LibrarySet {
  return {
    id,
    title,
    summary: "",
    folderId,
    source: "manual",
    mode: "flashcards",
    flashcards: [
      { id: `${id}-1`, question: "Capital of France?", answer: "Paris", topic: "General", difficulty: "medium", starred: false, status: "new" },
      { id: `${id}-2`, question: "Capital of Spain?", answer: "Madrid", topic: "General", difficulty: "medium", starred: false, status: "new" },
      { id: `${id}-3`, question: "Capital of Italy?", answer: "Rome", topic: "General", difficulty: "medium", starred: false, status: "new" },
    ],
    quiz: [],
    createdAt: NOW,
    updatedAt: NOW,
    lastStudiedAt: null,
    quizBest: null,
  };
}

export const library = (parts: Partial<Library> = {}): Library => ({ ...emptyLibrary(), ...parts });

export const seedStorage = (storage: Storage, lib: Library) => storage.setItem(STORAGE_KEY, JSON.stringify(lib));
export const readLibrary = (storage: Storage): Library => JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Library;
