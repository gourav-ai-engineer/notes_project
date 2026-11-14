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
export async function shot(page: Page, info: TestInfo, name: string) {
  if (!process.env.CAPTURE_SCREENSHOTS) return;
  mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({ path: `docs/screenshots/${info.project.name}-${name}.png` });
}
