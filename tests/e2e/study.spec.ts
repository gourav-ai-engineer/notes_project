import { expect, test } from "@playwright/test";
import { makeStudySet } from "../fixtures/study";
import { answer, expectNoHorizontalOverflow, generate, mockError, mockGenerate } from "./helpers";

const SHOTS = "docs/screenshots";

test("initial view loads with the input form", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "What are you studying?" })).toBeVisible();
  await expect(page.getByLabel("Your notes or topic")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Both/ })).toBeChecked();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-1-input.png` });
});

test("generate, flip and navigate flashcards", async ({ page }, info) => {
  await mockGenerate(page);
  await page.goto("/");
  await generate(page);

  await expect(page.getByRole("heading", { name: "Photosynthesis" })).toBeVisible();
  const card = page.getByTestId("flashcard");
  await expect(page.getByTestId("card-progress")).toHaveText("Card 1 of 3");
  await expect(page.getByRole("button", { name: /Previous/ })).toBeDisabled();

  await card.click();
  await expect(card).toHaveAttribute("data-flipped", "true");
  await expect(card).toHaveAccessibleName(/In the chloroplasts/);
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-2-flashcard-flipped.png` });

  await page.getByRole("button", { name: /Next/ }).click();
  await expect(page.getByTestId("card-progress")).toHaveText("Card 2 of 3");
  await expect(card).toHaveAttribute("data-flipped", "false");
  await expectNoHorizontalOverflow(page);
});

test("keyboard: Space flips the focused card and arrows navigate", async ({ page }) => {
  await mockGenerate(page);
  await page.goto("/");
  await generate(page);
  const card = page.getByTestId("flashcard");
  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("data-flipped", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("card-progress")).toHaveText("Card 2 of 3");
});

test("quiz with mixed answers, then retest shows only the wrong ones", async ({ page }, info) => {
  await mockGenerate(page);
  await page.goto("/");
  await generate(page);
  await page.getByRole("tab", { name: "Quiz" }).click();

  // Selecting alone must not reveal anything or advance.
  await page.getByRole("radio", { name: /Nucleus/ }).check({ force: true });
  await expect(page.getByTestId("feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByTestId("feedback")).toContainText("Incorrect");
  await expect(page.getByTestId("feedback")).toContainText("Chloroplasts contain chlorophyll");
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-3-quiz-feedback.png` });
  await page.getByRole("button", { name: "Next question" }).click();

  await answer(page, "Oxygen"); // right
  await answer(page, "Stores glucose", true); // wrong

  await expect(page.getByTestId("score")).toHaveText("1 / 3");
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-4-results.png` });

  await page.getByRole("button", { name: "Retest wrong answers" }).click();
  const panel = page.getByRole("tabpanel", { name: /Retest wrong/ });
  await expect(panel.getByTestId("question-progress")).toHaveText("Question 1 of 2");
  await expect(panel.getByText("Which organelle hosts photosynthesis?")).toBeVisible();
  await expect(panel.getByText("Which gas is released?")).toHaveCount(0); // answered correctly, so excluded
  await expectNoHorizontalOverflow(page);
});

test("perfect score shows the no-wrong-answers state", async ({ page }) => {
  await mockGenerate(page);
  await page.goto("/");
  await generate(page);
  await page.getByRole("tab", { name: "Quiz" }).click();
  await answer(page, "Chloroplast");
  await answer(page, "Oxygen");
  await answer(page, "Absorbs light", true);
  await expect(page.getByText(/perfect score/i)).toBeVisible();
  await page.getByRole("tab", { name: /Retest wrong/ }).click();
  await expect(page.getByRole("heading", { name: /No wrong answers/ })).toBeVisible();
});

test("a failed request keeps the notes, shows a retry, and recovers", async ({ page }, info) => {
  let calls = 0;
  await page.route("**/api/study/generate", (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({
          status: 502,
          json: { error: { code: "AI_INVALID_OUTPUT", message: "The study set could not be generated reliably. Please try again.", retryable: true, requestId: "e2e-req" } },
        })
      : route.fulfill({ status: 200, json: { studySet: makeStudySet() } });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: /^Quiz/ }).check({ force: true });
  await generate(page);

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("couldn't be used");
  await expect(page.getByLabel("Your notes or topic")).not.toBeEmpty();
  await expect(page.getByRole("radio", { name: /^Quiz/ })).toBeChecked();
  await page.screenshot({ path: `${SHOTS}/${info.project.name}-5-error.png` });

  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Photosynthesis" })).toBeVisible();
  expect(calls).toBe(2);
});

test("non-retryable error offers editing but no retry", async ({ page }) => {
  await mockError(page, "AI_NOT_CONFIGURED", 503, false);
  await page.goto("/");
  await generate(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit my notes" })).toBeVisible();
});

test("loading state appears while waiting and can be cancelled", async ({ page }) => {
  await page.route("**/api/study/generate", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ status: 200, json: { studySet: makeStudySet() } }).catch(() => {});
  });
  await page.goto("/");
  await generate(page);
  await expect(page.getByRole("status")).toContainText("Writing your study set");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Your notes or topic")).not.toBeEmpty();
});

test("long unbroken model text never causes horizontal overflow", async ({ page }) => {
  const set = makeStudySet();
  set.title = "T".repeat(90);
  set.flashcards[0].question = "Q".repeat(300);
  set.flashcards[0].answer = "A".repeat(400);
  set.quiz[0].options = ["O".repeat(150), "P".repeat(150), "R".repeat(150), "S".repeat(150)];
  set.quiz[0].explanation = "E".repeat(500);
  await mockGenerate(page, set);
  await page.goto("/");
  await generate(page);

  await expectNoHorizontalOverflow(page);
  await page.getByTestId("flashcard").click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("tab", { name: "Quiz" }).click();
  await page.getByRole("radio", { name: /OOOO/ }).check({ force: true });
  await page.getByRole("button", { name: "Check answer" }).click();
  await expectNoHorizontalOverflow(page);
});
