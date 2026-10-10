import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the chat widget (`npm run test:widget`). The demo page is served by scripts/serve.mjs and the
 * Worker is never contacted: /api/chat is mocked inside the page (tests/e2e/helpers.ts) and every request that
 * leaves localhost is aborted, so the suite runs offline.
 */
const PORT = Number(process.env.WIDGET_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", grepInvert: /@mobile/, use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", grep: /@mobile/, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: `http://localhost:${PORT}/chat-widget/demo.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});
