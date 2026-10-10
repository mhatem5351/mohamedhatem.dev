/**
 * The pages run under a hash-only Content-Security-Policy (astro.config.mjs + integrations/csp-hashes.mjs) with only
 * the third-party origins they need: Turnstile (script + frame) and the Web Analytics beacon (script, and connect for
 * its reports). Any `securitypolicyviolation` fails the test, in Chromium and WebKit: on load, after scrolling the whole
 * page (lazy Turnstile in the contact form, reveal, hero graph) and with the chat panel open.
 * Third parties are stubbed (fixtures.ts); scripts/verify-csp.mjs runs the same check against the real scripts.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PATHS = ["/", "/ar/", "/work/arabsstock-assistant/", "/ar/work/wakeb-bilingual-chatbot/", "/cv/", "/ar/cv/", "/privacy/"];

async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`), true);
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test.describe("CSP: no violations", () => {
  for (const path of PATHS) {
    test(path, async ({ page, browserName }) => {
      await recordViolations(page);
      await page.goto(path, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
      });
      // Open the assistant (no message is sent): the lazy panel module, its constructed stylesheet and Turnstile.
      await page.evaluate(() => (window as unknown as { MHChat?: { open(): void } }).MHChat?.open());
      await expect(page.locator("[data-mh-chat]").locator('[role="dialog"]')).toBeVisible();
      await page.waitForTimeout(300);
      const found = await violations(page);
      // WebKit quirk (see fixtures.ts): a <select> makes WebKit check the inline style of its own user-agent shadow
      // tree against the page policy, reported as "style-src-attr inline" with no source file (a bare <select> added to
      // a page without one reproduces it). It is not a style of ours; Chromium, which runs the same pages, reports none.
      const hasSelect = (await page.locator("select").count()) > 0;
      const ours = found.filter((v) => !(browserName === "webkit" && hasSelect && /^style-src-attr inline :\d+:\d+$/.test(v)));
      expect(ours).toEqual([]);
    });
  }

  test("the policy lists only the origins the pages use", async ({ page }) => {
    await page.goto("/");
    const policy = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute("content");
    expect(policy).toContain("connect-src 'self' https://cloudflareinsights.com;");
    expect(policy).toContain("frame-src https://challenges.cloudflare.com");
    expect(policy).not.toContain("child-src");
    expect(policy).not.toMatch(/worker-src[^;]*blob:/);
    expect(policy).not.toMatch(/'unsafe-inline'/);
  });
});
