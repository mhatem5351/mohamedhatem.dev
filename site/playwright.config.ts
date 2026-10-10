/**
 * End-to-end tests against the production build (../dist), served the way Cloudflare Workers static assets serve
 * it (scripts/serve.mjs: trailing-slash redirects, nearest 404.html, public/_headers). /api/* belongs to the Worker
 * and is mocked per test. Set E2E_SERVER=astro to run against `astro preview` instead, or E2E_BASE_URL to point at a
 * running server (e.g. `wrangler dev` once the Worker is integrated).
 *
 *   npm run build && npm run test:e2e
 *   npx playwright test --project=chromium-desktop tests/e2e/contact.spec.ts
 *
 * Projects: Chromium desktop (1440×900), Pixel 7 (Chromium), iPhone 15 (WebKit); iPhone SE (3rd gen, WebKit, 375×667)
 * runs the phone acceptance checks only (tests/e2e/mobile.spec.ts).
 * Tags: @desktop-only runs once (viewport-independent sweeps), @chromium-only needs page.pdf().
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4600);
const CI = !!process.env.CI;
const external = process.env.E2E_BASE_URL;
const server = process.env.E2E_SERVER === "astro" ? `npx astro preview --port ${PORT}` : `node scripts/serve.mjs --port ${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: CI ? [["github"], ["list"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] }, grepInvert: /@desktop-only|@chromium-only/ },
    { name: "iphone-15", use: { ...devices["iPhone 15"] }, grepInvert: /@desktop-only|@chromium-only/ },
    { name: "iphone-se", use: { ...devices["iPhone SE (3rd gen)"] }, testMatch: /mobile\.spec\.ts/, grepInvert: /@desktop-only|@chromium-only/ },
  ],
  webServer: external
    ? undefined
    : { command: server, url: `http://localhost:${PORT}/`, reuseExistingServer: !CI, timeout: 60_000, stdout: "ignore", stderr: "pipe" },
});
