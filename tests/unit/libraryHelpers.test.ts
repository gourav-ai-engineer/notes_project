import { describe, expect, it } from "vitest";
import { LIMITS } from "../../shared/contract";
import { parseBulkCards } from "../../src/features/library/bulkImport";
import { cardsToNotes } from "../../src/features/library/cardsToNotes";
import { resolveFolderTarget, NEW_FOLDER } from "../../src/features/library/folderTarget";
import { localDayKey } from "../../src/features/library/model";
import { formatRelativeDay, plural } from "../../src/lib/format";

describe("parseBulkCards", () => {
  it("accepts tab, ' :: ', spaced dashes and ': ' separators", () => {
    const { cards, skipped } = parseBulkCards("a\tb\nc :: d\ne - f\ng – h\ni — j\nk: l");
    expect(cards.map((c) => [c.question, c.answer])).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
      ["i", "j"],
      ["k", "l"],
    ]);
    expect(skipped).toBe(0);
  });

  it("prefers a tab over other separators and splits only on the first one", () => {
    expect(parseBulkCards("well-known\tit is - quite: known").cards).toEqual([{ question: "well-known", answer: "it is - quite: known" }]);
    expect(parseBulkCards("a - b - c").cards).toEqual([{ question: "a", answer: "b - c" }]);
  });

  it("ignores blank lines, handles CRLF, and counts lines it cannot split", () => {
    const { cards, skipped } = parseBulkCards("a - b\r\n\r\njust words\r\n - no question\r\nterm - ");
    expect(cards).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it("does not split hyphenated words", () => {
    expect(parseBulkCards("well-being").skipped).toBe(1);
  });
});

describe("cardsToNotes", () => {
  it("formats Q/A blocks separated by blank lines", () => {
    expect(cardsToNotes([{ question: "Q1", answer: "A1" }, { question: "Q2", answer: "A2" }])).toEqual({ text: "Q: Q1\nA: A1\n\nQ: Q2\nA: A2", used: 2 });
  });

  it("stops before the notes limit without cutting a card in half", () => {
    const big = { question: "q", answer: "a".repeat(9_000) };
    const out = cardsToNotes([big, big, big]);
    expect(out.used).toBe(2);
    expect(out.text.length).toBeLessThanOrEqual(LIMITS.notesMax);
    expect(out.text.endsWith("a")).toBe(true);
  });

  it("returns nothing for no cards", () => {
    expect(cardsToNotes([])).toEqual({ text: "", used: 0 });
  });
});

describe("resolveFolderTarget", () => {
  const create = (name: string) => `new:${name}`;
  it("maps Unsorted, an existing folder, and a new folder", () => {
    expect(resolveFolderTarget("", "", create)).toBeNull();
    expect(resolveFolderTarget("bio", "ignored", create)).toBe("bio");
    expect(resolveFolderTarget(NEW_FOLDER, "  Chem  ", create)).toBe("new:Chem");
  });
  it("falls back to Unsorted when 'new folder' has no name", () => {
    expect(resolveFolderTarget(NEW_FOLDER, "   ", create)).toBeNull();
  });
});

describe("dates and wording", () => {
  it("localDayKey uses the local calendar day", () => {
    expect(localDayKey(new Date(2026, 2, 5, 23, 59))).toBe("2026-03-05");
    expect(localDayKey(new Date(2026, 11, 1, 0, 1))).toBe("2026-12-01");
  });

  it("formatRelativeDay", () => {
    const now = new Date(2026, 2, 10, 15, 0);
    expect(formatRelativeDay(null, now)).toBe("Never");
    expect(formatRelativeDay(new Date(2026, 2, 10, 1, 0).toISOString(), now)).toBe("Today");
    expect(formatRelativeDay(new Date(2026, 2, 9, 23, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatRelativeDay(new Date(2026, 2, 6, 12, 0).toISOString(), now)).toBe("4 days ago");
    expect(formatRelativeDay(new Date(2026, 1, 24, 12, 0).toISOString(), now)).toBe("2 weeks ago");
    expect(formatRelativeDay("garbage", now)).toBe("Unknown");
  });

  it("plural", () => {
    expect(plural(1, "set")).toBe("1 set");
    expect(plural(0, "set")).toBe("0 sets");
    expect(plural(1200, "card")).toBe("1,200 cards");
  });
});
