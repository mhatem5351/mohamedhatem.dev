import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { KEY_PAGES, NOT_FOUND, PAGES } from "./pages";
import { expect, test, useTheme } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function revealAll(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    scrollTo(0, 0);
  });
  // Reveal transitions are 640 ms; wait them out so contrast is measured on the final colours.
  await page.waitForTimeout(800);
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(" | ")}`);
}

test.describe("axe: zero WCAG 2.2 AA violations", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of theme === "light" ? [...PAGES, ...NOT_FOUND] : KEY_PAGES) {
      test(`${path} (${theme})`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto(path, { waitUntil: "networkidle" });
        await revealAll(page);
        expect(await axe(page)).toEqual([]);
      });
    }
  }

  test("mobile menu open (light) @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "menu sheet is for small screens");
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("[data-menu-button]").click();
    await expect(page.locator("[data-menu-sheet]")).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
});
