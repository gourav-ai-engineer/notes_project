import { mkdirSync } from "node:fs";
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { StudySet } from "../../shared/contract";
import { SAMPLE_NOTES, makeStudySet } from "../fixtures/study";

export const NOTES = SAMPLE_NOTES;

export async function mockGenerate(page: Page, studySet: StudySet = makeStudySet()) {
  await page.route("**/api/study/generate", (route) => route.fulfill({ status: 200, json: { studySet } }));
}

export async function mockError(page: Page, code: string, status: number, retryable = true) {
  await page.route("**/api/study/generate", (route) =>
    route.fulfill({
      status,
      json: { error: { code, message: "The study set could not be generated reliably. Please try again.", retryable, requestId: "e2e-req" } },
    }),
  );
}

export async function generate(page: Page, notes = NOTES) {
  await page.getByLabel("Your notes or topic").fill(notes);
  await page.getByRole("button", { name: "Generate study set" }).click();
}

/** The page must never scroll horizontally. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

export async function answer(page: Page, optionText: string, last = false) {
  await page.getByRole("radio", { name: new RegExp(optionText) }).check({ force: true });
  await page.getByRole("button", { name: "Check answer" }).click();
  await page.getByRole("button", { name: last ? "See results" : "Next question" }).click();
}

/** Only writes the committed README screenshots when asked (npm run test:e2e:screenshots), so normal runs leave the tree clean. */
export async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  if (!process.env.CAPTURE_SCREENSHOTS) return;
  mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({ path: `docs/screenshots/${info.project.name}-${name}.png`, fullPage });
}

const NOW = "2026-03-10T09:00:00.000Z";

/** A small library, optionally with very long names, to catch overflow on every screen. */
export function seedLibrary(longNames = false) {
  const long = (base: string) => (longNames ? base + "Z".repeat(80) : base);
  const card = (id: string, q: string, a: string, status = "new", starred = false) => ({
    id,
    question: q,
    answer: a,
    topic: "General",
    difficulty: "medium",
    starred,
    status,
  });
  const quiz = (id: string) => ({
    id,
    question: "Which organelle makes ATP?",
    options: ["Nucleus", "Mitochondrion", "Ribosome", "Golgi"],
    correctIndex: 1,
    explanation: "Mitochondria run cellular respiration.",
    topic: "Cells",
    difficulty: "easy",
  });
  return {
    version: 1,
    folders: [
      { id: "bio", name: long("Biology"), color: "green", createdAt: NOW },
      { id: "es", name: "Spanish", color: "rose", createdAt: NOW },
    ],
    sets: [
      {
        id: "s1",
        title: long("Cell biology"),
        summary: "Key organelles.",
        folderId: "bio",
        source: "ai",
        mode: "both",
        flashcards: [card("c1", "Powerhouse?", "Mitochondria", "known", true), card("c2", "Protein factory?", "Ribosome"), card("c3", "Stores DNA?", "Nucleus")],
        quiz: [quiz("q1"), quiz("q2"), quiz("q3")],
        createdAt: NOW,
        updatedAt: NOW,
        lastStudiedAt: NOW,
        quizBest: { correct: 2, total: 3 },
      },
      {
        id: "s2",
        title: "Spanish verbs",
        summary: "",
        folderId: "es",
        source: "manual",
        mode: "flashcards",
        flashcards: [card("c4", "Yo ___ estudiante", "soy"), card("c5", "Ella ___ cansada", "esta"), card("c6", "Nosotros ___ aqui", "estamos")],
        quiz: [],
        createdAt: NOW,
        updatedAt: NOW,
        lastStudiedAt: null,
        quizBest: null,
      },
    ],
    activity: [],
  };
}

/** Pre-loads localStorage before the app starts, once, so reloads keep the user's later changes. */
export async function seedStorage(page: Page, library: unknown) {
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
    },
    ["recall-studio:library:v1", JSON.stringify(library)] as const,
  );
}
