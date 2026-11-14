import { defineConfig } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Edge that ships with Windows, so no browser download is needed.
    // On a machine without Edge, run `npx playwright install chromium` and change this to "chromium".
    channel: process.env.PW_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile-320", use: { viewport: { width: 320, height: 700 }, hasTouch: true } },
  ],
  // Only the Vite client is needed: every /api call is mocked in the tests.
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
