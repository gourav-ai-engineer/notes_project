import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, generate, mockGenerate, seedLibrary, seedStorage, shot } from "./helpers";

const primaryNav = (page: Page) => page.getByRole("navigation", { name: "Primary" });

test("create, save to a new folder, browse the library, and keep it all after a reload", async ({ page }, testInfo) => {
  await mockGenerate(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await primaryNav(page).getByRole("link", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Create a study set" })).toBeVisible();
  await shot(page, testInfo, "7-create-menu", true);
  await page.getByRole("link", { name: /Paste text/ }).click();

  await page.getByLabel("Save to folder").selectOption({ label: "+ New folder…" });
  await page.getByLabel("New folder name").fill("Biology");
  await generate(page);

  await expect(page.getByRole("heading", { level: 1, name: "Photosynthesis" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your library" })).toContainText("Biology");
  await shot(page, testInfo, "8-saved-set");

  await primaryNav(page).getByRole("link", { name: "Library" }).click();
  await expect(page.getByRole("link", { name: /Photosynthesis/ })).toBeVisible();
  await page.getByRole("tab", { name: /Folders/ }).click();
  await expect(page.getByRole("link", { name: /Biology/ })).toContainText("1 set");
  await shot(page, testInfo, "9-library-folders");
  await page.getByRole("link", { name: /Biology/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Biology/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.getByRole("link", { name: /Photosynthesis/ })).toBeVisible();
});

test("a manual set can be created offline, starred, and remembered after reload", async ({ page }) => {
  await page.goto("/create/manual");
  await page.getByLabel("Title").fill("Capitals");
  await page.getByLabel(/question for card 1/i).fill("Capital of Japan?");
  await page.getByLabel(/answer for card 1/i).fill("Tokyo");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Capitals" })).toBeVisible();

  await page.getByRole("button", { name: "Star this card" }).click();
  await page.getByRole("button", { name: "I know it" }).click();
  await expect(page.getByTestId("known-summary")).toHaveText("1 of 1 known");

  await page.reload();
  await expect(page.getByTestId("known-summary")).toHaveText("1 of 1 known");
  await expect(page.getByRole("button", { name: "Unstar this card" })).toHaveAttribute("aria-pressed", "true");
});

test("every screen fits without horizontal scrolling, even with very long names", async ({ page }) => {
  test.setTimeout(120_000); // visits 14 screens
  await seedStorage(page, seedLibrary(true));
  const paths = [
    "/",
    "/create",
    "/create/ai/text",
    "/create/ai/images",
    "/create/ai/topic",
    "/create/manual",
    "/library",
    "/library?tab=folders",
    "/folders/bio",
    "/folders/unsorted",
    "/sets/s1",
    "/sets/s1/edit",
    "/sets/s2",
    "/settings",
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("the bottom bar never covers the last control on a page", async ({ page }) => {
  await seedStorage(page, seedLibrary());
  await page.goto("/create/ai/text");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const button = await page.getByRole("button", { name: "Generate study set" }).boundingBox();
  const nav = await primaryNav(page).boundingBox();
  expect(button).toBeTruthy();
  expect(nav).toBeTruthy();
  // A wide-and-short nav is the phone's bottom bar; on desktop it is a tall sidebar and cannot overlap.
  if (nav && button && nav.width > nav.height) expect(button.y + button.height).toBeLessThanOrEqual(nav.y + 1);
});

test("theme choice applies immediately and survives a reload", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Light").check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("export then import round-trips a library", async ({ page }) => {
  await seedStorage(page, seedLibrary());
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^recall-studio-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.getByRole("button", { name: "Delete all my data" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByText(/0 sets, 0 folders/)).toBeVisible();

  await page.getByLabel("Choose backup file").setInputFiles(path!);
  await expect(page.getByText(/2 sets, 2 folders/)).toBeVisible();
});
