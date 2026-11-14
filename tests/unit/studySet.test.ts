import { describe, expect, it } from "vitest";
import { LIMITS, validateNotes } from "../../shared/contract.ts";
import { normalizeStudySet, parseModelOutput } from "../../server/validation/studySet.ts";
import { makeContent, makeContentFor } from "../fixtures/study.ts";

const json = (v: unknown) => JSON.stringify(v);

describe("parseModelOutput", () => {
  it("accepts valid output for each mode", () => {
    for (const mode of ["flashcards", "quiz", "both"] as const) {
      const r = parseModelOutput(json(makeContentFor(mode)), mode);
      expect(r.ok).toBe(true);
    }
  });

  it("accepts output wrapped in a code fence", () => {
    const r = parseModelOutput("```json\n" + json(makeContent()) + "\n```", "both");
    expect(r.ok).toBe(true);
  });

  it("rejects blank output as EMPTY", () => {
    for (const raw of ["", "   \n", null, undefined]) {
      const r = parseModelOutput(raw, "both");
      expect(r).toMatchObject({ ok: false, kind: "EMPTY" });
    }
  });

  it("rejects malformed JSON", () => {
    expect(parseModelOutput('{"title": "x", ', "both")).toMatchObject({ ok: false, kind: "INVALID_JSON" });
    expect(parseModelOutput("Sure! Here are your flashcards:", "both")).toMatchObject({ ok: false, kind: "INVALID_JSON" });
  });

  it("rejects missing required fields", () => {
    const { summary: _summary, ...noSummary } = makeContent();
    expect(parseModelOutput(json(noSummary), "both")).toMatchObject({ ok: false, kind: "INVALID_SHAPE" });
  });

  it("rejects wrong types and wrong array shapes", () => {
    expect(parseModelOutput(json({ ...makeContent(), flashcards: "none" }), "both")).toMatchObject({ ok: false });
    expect(parseModelOutput(json([1, 2, 3]), "both")).toMatchObject({ ok: false, kind: "INVALID_SHAPE" });
    expect(parseModelOutput("null", "both")).toMatchObject({ ok: false, kind: "INVALID_SHAPE" });
    const bad = makeContent();
    (bad.quiz[0] as unknown as { options: unknown }).options = "A, B, C, D";
    expect(parseModelOutput(json(bad), "both")).toMatchObject({ ok: false });
  });

  it("treats empty requested arrays as EMPTY", () => {
    const r = parseModelOutput(json({ ...makeContent(), flashcards: [], quiz: [] }), "both");
    expect(r).toMatchObject({ ok: false, kind: "EMPTY" });
    expect(parseModelOutput(json({ ...makeContent(), flashcards: [] }), "flashcards")).toMatchObject({ ok: false, kind: "EMPTY" });
  });

  it("requires content only for the requested mode and strips the rest", () => {
    const r = parseModelOutput(json(makeContent()), "flashcards");
    expect(r.ok && r.content.quiz).toEqual([]);
    const q = parseModelOutput(json({ ...makeContent(), flashcards: [] }), "quiz");
    expect(q.ok).toBe(true);
  });

  it("rejects fewer than the minimum items", () => {
    const c = makeContent();
    expect(parseModelOutput(json({ ...c, flashcards: c.flashcards.slice(0, 2) }), "flashcards")).toMatchObject({ ok: false });
  });

  it("rejects quiz options that are not four distinct non-empty strings", () => {
    const wrongCount = makeContent();
    wrongCount.quiz[0].options = ["a", "b", "c"] as never;
    expect(parseModelOutput(json(wrongCount), "quiz")).toMatchObject({ ok: false });

    const dupes = makeContent();
    dupes.quiz[0].options = ["Same", "same ", "Other", "Another"];
    expect(parseModelOutput(json(dupes), "quiz")).toMatchObject({ ok: false, kind: "INVALID_SHAPE" });

    const blank = makeContent();
    blank.quiz[0].options = ["a", " ", "c", "d"];
    expect(parseModelOutput(json(blank), "quiz")).toMatchObject({ ok: false });
  });

  it("rejects an invalid correct-answer index", () => {
    for (const idx of [-1, 4, 1.5, "1", null]) {
      const c = makeContent();
      (c.quiz[0] as unknown as { correctIndex: unknown }).correctIndex = idx;
      expect(parseModelOutput(json(c), "quiz")).toMatchObject({ ok: false });
    }
  });

  it("rejects invalid difficulty but tolerates casing", () => {
    const bad = makeContent();
    (bad.flashcards[0] as unknown as { difficulty: string }).difficulty = "impossible";
    expect(parseModelOutput(json(bad), "flashcards")).toMatchObject({ ok: false });

    const cased = makeContent();
    (cased.flashcards[0] as unknown as { difficulty: string }).difficulty = " Hard ";
    const r = parseModelOutput(json(cased), "flashcards");
    expect(r.ok && r.content.flashcards[0].difficulty).toBe("hard");
  });

  it("rejects over-limit content and unbounded arrays", () => {
    const long = makeContent();
    long.flashcards[0].answer = "x".repeat(LIMITS.answer + 1);
    expect(parseModelOutput(json(long), "flashcards")).toMatchObject({ ok: false });

    const c = makeContent();
    const many = Array.from({ length: LIMITS.itemsMax + 1 }, (_, i) => ({ ...c.flashcards[0], question: `Q${i}` }));
    expect(parseModelOutput(json({ ...c, flashcards: many }), "flashcards")).toMatchObject({ ok: false });
  });

  it("rejects duplicate questions", () => {
    const c = makeContent();
    c.flashcards[1].question = c.flashcards[0].question.toUpperCase();
    expect(parseModelOutput(json(c), "flashcards")).toMatchObject({ ok: false });
  });

  it("issue summaries never echo the raw model text", () => {
    const r = parseModelOutput(json({ title: "SECRET-MARKER" }), "both");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).not.toContain("SECRET-MARKER");
  });
});

describe("normalizeStudySet", () => {
  it("assigns unique server-side IDs and ignores model-supplied ones", () => {
    const content = makeContent();
    (content.flashcards[0] as unknown as { id: string }).id = "model-id";
    const set = normalizeStudySet(content, "both", new Date("2026-01-01T00:00:00Z"));
    const ids = [set.id, ...set.flashcards.map((f) => f.id), ...set.quiz.map((q) => q.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("model-id");
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(set.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(set.mode).toBe("both");
  });
});

describe("validateNotes", () => {
  it("enforces min and max length after trimming", () => {
    expect(validateNotes("   ")).toMatch(/Paste some notes/);
    expect(validateNotes("too short")).toMatch(/at least 20/);
    expect(validateNotes("x".repeat(LIMITS.notesMax + 1))).toMatch(/too long/);
    expect(validateNotes("  " + "x".repeat(LIMITS.notesMin) + "  ")).toBeNull();
    expect(validateNotes("x".repeat(LIMITS.notesMax))).toBeNull();
  });
});
