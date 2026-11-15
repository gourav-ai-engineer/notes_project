import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LibraryContext, type LibraryApi } from "./LibraryContext";
import { libraryReducer, type LibraryAction } from "./libraryReducer";
import { draftToCards, emptyLibrary, inferMode, localDayKey, newId, toLibrarySet, FOLDER_COLORS, type Library } from "./model";
import { STORAGE_KEY, getDefaultStorage, loadLibrary, parseBackup, saveLibrary, serializeBackup, type StorageProblem } from "./storage";

interface Props {
  children: ReactNode;
  /** Injectable for tests. `null` means "no storage available". Defaults to window.localStorage. */
  storage?: Storage | null;
}

interface State {
  library: Library;
  recovered: boolean;
  problem: StorageProblem | null;
}

/**
 * Holds the library in memory and writes every change straight to storage.
 * The reducer is pure; this component adds ids, timestamps and persistence around it.
 */
export function LibraryProvider({ children, storage: storageProp }: Props) {
  const [storage] = useState<Storage | null>(() => (storageProp === undefined ? getDefaultStorage() : storageProp));
  const [state, setState] = useState<State>(() => {
    const { library, recovered } = loadLibrary(storage);
    return { library, recovered, problem: null };
  });
  // Latest library for event handlers (read at call time, never during render).
  const latest = useRef(state.library);

  const apply = useCallback(
    (action: LibraryAction) => {
      const next = libraryReducer(latest.current, action);
      if (next === latest.current) return;
      latest.current = next;
      const problem = saveLibrary(storage, next);
      setState((s) => ({ ...s, library: next, problem }));
    },
    [storage],
  );

  // Another tab changed the library: adopt it instead of overwriting it later.
  useEffect(() => {
    if (!storage) return;
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== storage || (e.key !== STORAGE_KEY && e.key !== null)) return;
      const { library } = loadLibrary(storage);
      latest.current = library;
      setState((s) => ({ ...s, library }));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storage]);

  const api = useMemo<LibraryApi>(() => {
    const now = () => new Date().toISOString();
    const folderIdOk = (id: string | null) => id === null || latest.current.folders.some((f) => f.id === id);

    return {
      library: state.library,
      recovered: state.recovered,
      storageProblem: state.problem,
      dismissNotices: () => setState((s) => ({ ...s, recovered: false, problem: null })),

      createFolder(name, color) {
        const id = newId();
        const pick = color ?? FOLDER_COLORS[latest.current.folders.length % FOLDER_COLORS.length];
        apply({ type: "folder/create", folder: { id, name: name.trim(), color: pick, createdAt: now() } });
        return id;
      },
      updateFolder: (id, patch) => apply({ type: "folder/update", id, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.color ? { color: patch.color } : {}) }),
      deleteFolder: (id, deleteSets) => apply({ type: "folder/delete", id, deleteSets }),

      saveGeneratedSet(studySet, folderId) {
        apply({ type: "set/add", set: toLibrarySet(studySet, folderIdOk(folderId) ? folderId : null, now()) });
        return studySet.id;
      },
      createManualSet({ title, summary, folderId, cards }) {
        const id = newId();
        const flashcards = draftToCards(cards);
        const stamp = now();
        apply({
          type: "set/add",
          set: {
            id,
            title: title.trim(),
            summary: summary.trim(),
            folderId: folderIdOk(folderId) ? folderId : null,
            source: "manual",
            mode: inferMode(flashcards, []),
            flashcards,
            quiz: [],
            createdAt: stamp,
            updatedAt: stamp,
            lastStudiedAt: null,
            quizBest: null,
          },
        });
        return id;
      },
      editSet(id, { title, summary, folderId, cards }) {
        const existing = latest.current.sets.find((s) => s.id === id);
        if (!existing) return;
        const flashcards = draftToCards(cards, existing.flashcards);
        apply({
          type: "set/update",
          id,
          now: now(),
          patch: {
            title: title.trim(),
            summary: summary.trim(),
            folderId: folderIdOk(folderId) ? folderId : null,
            flashcards,
            mode: inferMode(flashcards, existing.quiz),
          },
        });
      },
      moveSet: (id, folderId) => apply({ type: "set/update", id, now: now(), patch: { folderId: folderIdOk(folderId) ? folderId : null } }),
      setQuiz(id, quiz) {
        const existing = latest.current.sets.find((s) => s.id === id);
        if (!existing || quiz.length === 0) return;
        apply({ type: "set/update", id, now: now(), patch: { quiz, mode: inferMode(existing.flashcards, quiz) } });
      },
      deleteSet: (id) => apply({ type: "set/delete", id }),
      duplicateSet(id) {
        const source = latest.current.sets.find((s) => s.id === id);
        if (!source) return null;
        const copyId = newId();
        apply({ type: "set/duplicate", id, newId: copyId, cardIds: source.flashcards.map(() => newId()), now: now() });
        return copyId;
      },

      toggleStar: (setId, cardId) => apply({ type: "card/toggleStar", setId, cardId }),
      setCardStatus: (setId, cardId, status) => apply({ type: "card/setStatus", setId, cardId, status }),
      resetProgress: (setId) => apply({ type: "set/resetProgress", setId }),
      recordStudy: (setId) => apply({ type: "study/record", setId, at: now(), day: localDayKey() }),
      recordQuiz(setId, correct, total) {
        if (total > 0) apply({ type: "quiz/record", setId, correct, total });
      },

      exportBackup: () => serializeBackup(latest.current),
      importBackup(text, mode) {
        const result = parseBackup(text);
        if (!result.ok) return result;
        apply(mode === "replace" ? { type: "library/replace", library: result.library } : { type: "library/merge", library: result.library, makeId: newId });
        return result;
      },
      clearAll: () => apply({ type: "library/replace", library: emptyLibrary() }),
    };
  }, [state, apply]);

  return <LibraryContext.Provider value={api}>{children}</LibraryContext.Provider>;
}
