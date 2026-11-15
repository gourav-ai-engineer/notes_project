import { describe, expect, it } from "vitest";
import { libraryReducer, sanitizeLibrary } from "../../src/features/library/libraryReducer";
import {
  cardProgress,
  computeStreak,
  draftToCards,
  emptyLibrary,
  mergeLibraries,
  toLibrarySet,
  type Library,
  type LibrarySet,
} from "../../src/features/library/model";
import { BACKUP_KEY, MAX_IMPORT_BYTES, STORAGE_KEY, loadLibrary, parseBackup, saveLibrary, serializeBackup } from "../../src/features/library/storage";
import { makeStudySet } from "../fixtures/study";
import { memoryStorage } from "../fixtures/storage";

const NOW = "2026-03-10T09:00:00.000Z";

const aiSet = (folderId: string | null = null) => toLibrarySet(makeStudySet(), folderId, NOW);
const withSet = (set: LibrarySet = aiSet()): Library => ({ ...emptyLibrary(), sets: [set] });
const folder = (id: string, name = id) => ({ id, name, color: "blue" as const, createdAt: NOW });

describe("libraryReducer: sets", () => {
  it("adds a generated set once: saving the same server id twice (StrictMode) leaves one entry", () => {
    const set = aiSet();
    let state = libraryReducer(emptyLibrary(), { type: "set/add", set });
    state = libraryReducer(state, { type: "set/add", set });
    expect(state.sets).toHaveLength(1);
  });

  it("converts a generated StudySet with new, unstarred cards", () => {
    const set = aiSet();
    expect(set.source).toBe("ai");
    expect(set.flashcards.every((c) => c.status === "new" && c.starred === false)).toBe(true);
    expect(set.quiz.length).toBeGreaterThan(0);
  });

  it("updates, moves and deletes", () => {
    const set = aiSet();
    let s = libraryReducer({ ...withSet(set), folders: [folder("f1")] }, { type: "set/update", id: set.id, now: "later", patch: { title: "New", folderId: "f1" } });
    expect(s.sets[0]).toMatchObject({ title: "New", folderId: "f1", updatedAt: "later" });
    s = libraryReducer(s, { type: "set/delete", id: set.id });
    expect(s.sets).toEqual([]);
  });

  it("duplicates with new ids, no progress, and a copy title", () => {
    const set = aiSet();
    let s = libraryReducer(withSet(set), { type: "card/toggleStar", setId: set.id, cardId: set.flashcards[0].id });
    s = libraryReducer(s, { type: "card/setStatus", setId: set.id, cardId: set.flashcards[0].id, status: "known" });
    s = libraryReducer(s, { type: "set/duplicate", id: set.id, newId: "copy", cardIds: set.flashcards.map((_, i) => `c${i}`), now: "t2" });
    const copy = s.sets.find((x) => x.id === "copy")!;
    expect(copy.title).toBe(`${set.title} (copy)`);
    expect(copy.flashcards.map((c) => c.id)).toEqual(set.flashcards.map((_, i) => `c${i}`));
    expect(copy.flashcards.every((c) => !c.starred && c.status === "new")).toBe(true);
    // The original keeps its progress.
    expect(s.sets.find((x) => x.id === set.id)!.flashcards[0]).toMatchObject({ starred: true, status: "known" });
  });
});

describe("libraryReducer: folders", () => {
  const base = (): Library => ({ ...emptyLibrary(), folders: [folder("bio"), folder("chem")], sets: [aiSet("bio"), { ...aiSet("chem"), id: "x2" }] });

  it("deleting a folder can keep its sets (moved to Unsorted)", () => {
    const s = libraryReducer(base(), { type: "folder/delete", id: "bio", deleteSets: false });
    expect(s.folders.map((f) => f.id)).toEqual(["chem"]);
    expect(s.sets).toHaveLength(2);
    expect(s.sets.find((x) => x.id !== "x2")!.folderId).toBeNull();
  });

  it("deleting a folder can also delete its sets, and only its sets", () => {
    const s = libraryReducer(base(), { type: "folder/delete", id: "bio", deleteSets: true });
    expect(s.sets.map((x) => x.id)).toEqual(["x2"]);
  });

  it("renames and recolours; ignores duplicate ids on create", () => {
    let s = libraryReducer(base(), { type: "folder/update", id: "bio", name: "Biology", color: "rose" });
    expect(s.folders[0]).toMatchObject({ name: "Biology", color: "rose" });
    s = libraryReducer(s, { type: "folder/create", folder: folder("bio", "dupe") });
    expect(s.folders).toHaveLength(2);
  });
});

describe("libraryReducer: study progress", () => {
  it("toggles stars and sets status per card", () => {
    const set = aiSet();
    const id = set.flashcards[1].id;
    let s = libraryReducer(withSet(set), { type: "card/toggleStar", setId: set.id, cardId: id });
    expect(s.sets[0].flashcards[1].starred).toBe(true);
    s = libraryReducer(s, { type: "card/toggleStar", setId: set.id, cardId: id });
    expect(s.sets[0].flashcards[1].starred).toBe(false);
    s = libraryReducer(s, { type: "card/setStatus", setId: set.id, cardId: id, status: "known" });
    expect(cardProgress(s.sets[0].flashcards)).toMatchObject({ known: 1, total: 3, percent: 33 });
    s = libraryReducer(s, { type: "set/resetProgress", setId: set.id });
    expect(cardProgress(s.sets[0].flashcards).known).toBe(0);
  });

  it("records study days once per day and sets lastStudiedAt", () => {
    const set = aiSet();
    let s = libraryReducer(withSet(set), { type: "study/record", setId: set.id, at: "2026-03-10T08:00:00Z", day: "2026-03-10" });
    s = libraryReducer(s, { type: "study/record", setId: set.id, at: "2026-03-10T21:00:00Z", day: "2026-03-10" });
    expect(s.activity).toEqual(["2026-03-10"]);
    expect(s.sets[0].lastStudiedAt).toBe("2026-03-10T21:00:00Z");
  });

  it("keeps only the best quiz score", () => {
    const set = aiSet();
    let s = libraryReducer(withSet(set), { type: "quiz/record", setId: set.id, correct: 2, total: 3 });
    s = libraryReducer(s, { type: "quiz/record", setId: set.id, correct: 1, total: 3 });
    expect(s.sets[0].quizBest).toEqual({ correct: 2, total: 3 });
    s = libraryReducer(s, { type: "quiz/record", setId: set.id, correct: 3, total: 3 });
    expect(s.sets[0].quizBest).toEqual({ correct: 3, total: 3 });
  });
});

describe("draftToCards", () => {
  const stored = aiSet().flashcards.map((c) => ({ ...c, status: "known" as const, starred: true }));

  it("keeps ids, stars and status for untouched cards", () => {
    const out = draftToCards(stored.map((c) => ({ id: c.id, question: c.question, answer: c.answer })), stored);
    expect(out.map((c) => c.id)).toEqual(stored.map((c) => c.id));
    expect(out.every((c) => c.starred && c.status === "known")).toBe(true);
  });

  it("demotes known to learning when the wording changes, but keeps the star", () => {
    const [first] = stored;
    const [out] = draftToCards([{ id: first.id, question: first.question, answer: "A different answer" }], stored);
    expect(out).toMatchObject({ id: first.id, status: "learning", starred: true, answer: "A different answer" });
  });

  it("creates new cards with fresh ids, trims text, and drops blank rows", () => {
    const out = draftToCards([
      { question: "  Capital of France?  ", answer: " Paris " },
      { question: "", answer: "orphan answer" },
      { question: "orphan question", answer: "   " },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ question: "Capital of France?", answer: "Paris", status: "new", starred: false });
    expect(out[0].id).toBeTruthy();
  });
});

describe("computeStreak", () => {
  it.each([
    [[], "2026-03-10", 0],
    [["2026-03-10"], "2026-03-10", 1],
    [["2026-03-08", "2026-03-09", "2026-03-10"], "2026-03-10", 3],
    // Not studied yet today: yesterday still counts, so the streak is not shown as lost mid-day.
    [["2026-03-08", "2026-03-09"], "2026-03-10", 2],
    [["2026-03-07"], "2026-03-10", 0],
    [["2026-03-10", "2026-03-08"], "2026-03-10", 1],
    [["2026-02-28", "2026-03-01"], "2026-03-01", 2], // month boundary
  ])("%j on %s -> %i", (activity, today, expected) => {
    expect(computeStreak(activity as string[], today as string)).toBe(expected);
  });
});

describe("mergeLibraries / sanitize", () => {
  it("regenerates colliding ids and remaps folder references", () => {
    const a: Library = { ...emptyLibrary(), folders: [folder("f")], sets: [{ ...aiSet("f"), id: "s" }], activity: ["2026-03-01"] };
    const b: Library = { ...emptyLibrary(), folders: [folder("f", "Imported")], sets: [{ ...aiSet("f"), id: "s" }], activity: ["2026-03-02", "2026-03-01"] };
    let n = 0;
    const merged = mergeLibraries(a, b, () => `new${++n}`);
    expect(merged.folders.map((f) => f.id)).toEqual(["f", "new1"]);
    expect(merged.sets.map((s) => s.id)).toEqual(["s", "new2"]);
    expect(merged.sets[1].folderId).toBe("new1"); // points at the imported folder, not the existing one
    expect(merged.activity).toEqual(["2026-03-01", "2026-03-02"]);
  });

  it("sets dangling folder references to Unsorted", () => {
    const lib = { ...emptyLibrary(), sets: [aiSet("ghost")] };
    expect(sanitizeLibrary(lib).sets[0].folderId).toBeNull();
  });
});

describe("storage", () => {
  it("returns an empty library when nothing is stored", () => {
    expect(loadLibrary(memoryStorage())).toEqual({ library: emptyLibrary(), recovered: false });
    expect(loadLibrary(null)).toEqual({ library: emptyLibrary(), recovered: false });
  });

  it("round-trips through save and load", () => {
    const storage = memoryStorage();
    const lib = withSet();
    expect(saveLibrary(storage, lib)).toBeNull();
    expect(loadLibrary(storage)).toEqual({ library: lib, recovered: false });
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["the wrong shape", JSON.stringify({ version: 1, folders: "nope", sets: [], activity: [] })],
    ["a future version", JSON.stringify({ version: 99, folders: [], sets: [], activity: [] })],
  ])("backs up %s instead of crashing or silently discarding it", (_n, raw) => {
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    const result = loadLibrary(storage);
    expect(result).toEqual({ library: emptyLibrary(), recovered: true });
    expect(storage.getItem(BACKUP_KEY)).toBe(raw);
  });

  it("reports a full or blocked store instead of throwing", () => {
    expect(saveLibrary(memoryStorage({}, { failWith: "QuotaExceededError" }), withSet())).toBe("quota");
    expect(saveLibrary(memoryStorage({}, { failWith: "SecurityError" }), withSet())).toBe("unavailable");
    expect(saveLibrary(null, withSet())).toBe("unavailable");
  });
});

describe("parseBackup", () => {
  it("accepts a valid export", () => {
    const lib = withSet();
    const result = parseBackup(serializeBackup(lib));
    expect(result).toEqual({ ok: true, library: lib });
  });

  it.each([
    ["garbage", "hello"],
    ["a different JSON file", JSON.stringify({ name: "package", version: "1.0.0" })],
    ["a set with a bad quiz", JSON.stringify({ ...withSet(), sets: [{ ...aiSet(), quiz: [{ id: "q" }] }] })],
    ["an oversized file", "x".repeat(MAX_IMPORT_BYTES + 1)],
  ])("rejects %s with a message, without throwing", (_n, text) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(5);
  });
});
