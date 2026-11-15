/**
 * Pure state transitions for the library. Ids and timestamps are passed IN (never generated here),
 * so every action is deterministic and unit-testable, and StrictMode double-invocation is harmless.
 */
import {
  emptyLibrary,
  mergeLibraries,
  type CardStatus,
  type Folder,
  type FolderColor,
  type Library,
  type LibraryCard,
  type LibrarySet,
} from "./model";

export type LibraryAction =
  | { type: "folder/create"; folder: Folder }
  | { type: "folder/update"; id: string; name?: string; color?: FolderColor }
  /** `deleteSets: false` moves the folder's sets to "Unsorted" instead of deleting them. */
  | { type: "folder/delete"; id: string; deleteSets: boolean }
  /** Idempotent on `set.id`: saving the same generated set twice leaves one entry. */
  | { type: "set/add"; set: LibrarySet }
  | { type: "set/update"; id: string; patch: Partial<Pick<LibrarySet, "title" | "summary" | "folderId" | "flashcards" | "quiz" | "mode">>; now: string }
  | { type: "set/delete"; id: string }
  | { type: "set/duplicate"; id: string; newId: string; cardIds: string[]; now: string }
  | { type: "card/toggleStar"; setId: string; cardId: string }
  | { type: "card/setStatus"; setId: string; cardId: string; status: CardStatus }
  | { type: "set/resetProgress"; setId: string }
  /** `day` is the learner's local YYYY-MM-DD; passed in so the reducer stays pure. */
  | { type: "study/record"; setId: string; at: string; day: string }
  | { type: "quiz/record"; setId: string; correct: number; total: number }
  | { type: "library/replace"; library: Library }
  | { type: "library/merge"; library: Library; makeId: () => string };

const mapSet = (state: Library, id: string, fn: (s: LibrarySet) => LibrarySet): Library => ({
  ...state,
  sets: state.sets.map((s) => (s.id === id ? fn(s) : s)),
});

const mapCard = (set: LibrarySet, cardId: string, fn: (c: LibraryCard) => LibraryCard): LibrarySet => ({
  ...set,
  flashcards: set.flashcards.map((c) => (c.id === cardId ? fn(c) : c)),
});

/** Drops references to folders that don't exist (e.g. after an import). */
export function sanitizeLibrary(library: Library): Library {
  const ids = new Set(library.folders.map((f) => f.id));
  const dangling = library.sets.some((s) => s.folderId !== null && !ids.has(s.folderId));
  if (!dangling) return library;
  return { ...library, sets: library.sets.map((s) => (s.folderId !== null && !ids.has(s.folderId) ? { ...s, folderId: null } : s)) };
}

export function libraryReducer(state: Library, action: LibraryAction): Library {
  switch (action.type) {
    case "folder/create":
      return state.folders.some((f) => f.id === action.folder.id) ? state : { ...state, folders: [...state.folders, action.folder] };

    case "folder/update":
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.id ? { ...f, ...(action.name !== undefined ? { name: action.name } : {}), ...(action.color ? { color: action.color } : {}) } : f,
        ),
      };

    case "folder/delete":
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.id),
        sets: action.deleteSets
          ? state.sets.filter((s) => s.folderId !== action.id)
          : state.sets.map((s) => (s.folderId === action.id ? { ...s, folderId: null } : s)),
      };

    case "set/add":
      return state.sets.some((s) => s.id === action.set.id) ? state : { ...state, sets: [action.set, ...state.sets] };

    case "set/update":
      return mapSet(state, action.id, (s) => ({ ...s, ...action.patch, updatedAt: action.now }));

    case "set/delete":
      return { ...state, sets: state.sets.filter((s) => s.id !== action.id) };

    case "set/duplicate": {
      const source = state.sets.find((s) => s.id === action.id);
      if (!source) return state;
      const copy: LibrarySet = {
        ...source,
        id: action.newId,
        title: `${source.title} (copy)`.slice(0, 120),
        // Fresh ids and no progress: a copy is its own study set.
        flashcards: source.flashcards.map((c, i) => ({ ...c, id: action.cardIds[i] ?? `${action.newId}-${i}`, starred: false, status: "new" as const })),
        createdAt: action.now,
        updatedAt: action.now,
        lastStudiedAt: null,
        quizBest: null,
      };
      return { ...state, sets: [copy, ...state.sets] };
    }

    case "card/toggleStar":
      return mapSet(state, action.setId, (s) => mapCard(s, action.cardId, (c) => ({ ...c, starred: !c.starred })));

    case "card/setStatus":
      return mapSet(state, action.setId, (s) => mapCard(s, action.cardId, (c) => ({ ...c, status: action.status })));

    case "set/resetProgress":
      return mapSet(state, action.setId, (s) => ({
        ...s,
        flashcards: s.flashcards.map((c) => ({ ...c, status: "new" as const })),
        quizBest: null,
      }));

    case "study/record": {
      const day = action.day;
      const withSet = mapSet(state, action.setId, (s) => ({ ...s, lastStudiedAt: action.at }));
      return withSet.activity.includes(day) ? withSet : { ...withSet, activity: [...withSet.activity, day].sort().slice(-800) };
    }

    case "quiz/record":
      return mapSet(state, action.setId, (s) => {
        const better = !s.quizBest || action.correct / action.total > s.quizBest.correct / s.quizBest.total;
        return better ? { ...s, quizBest: { correct: action.correct, total: action.total } } : s;
      });

    case "library/replace":
      return sanitizeLibrary(action.library);

    case "library/merge":
      return sanitizeLibrary(mergeLibraries(state, action.library, action.makeId));
  }
}

export { emptyLibrary };
