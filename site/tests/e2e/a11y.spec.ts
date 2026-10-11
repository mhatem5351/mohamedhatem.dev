import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { NOT_FOUND, PAGES } from "./pages";
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
  // Dark is every visitor's default (no stored choice, as on a first visit); light is the visitor's choice.
  for (const theme of ["dark", "light"] as const) {
    for (const path of [...PAGES, ...NOT_FOUND]) {
      test(`${path} (${theme})`, async ({ page }) => {
        if (theme === "light") await useTheme(page, "light");
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await revealAll(page);
        expect(await axe(page)).toEqual([]);
      });
    }
  }

  for (const theme of ["dark", "light"] as const)
    test(`mobile menu open (${theme}) @mobile`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "menu sheet is for small screens");
      if (theme === "light") await useTheme(page, "light");
      await page.goto("/", { waitUntil: "networkidle" });
      await page.locator("[data-menu-button]").click();
      await expect(page.locator("[data-menu-sheet]")).toBeVisible();
      // The sheet fades in (240 ms): measure contrast on its final colours, not mid-transition.
      await expect.poll(() => page.locator("[data-menu-sheet]").evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length)).toBe(0);
      await page.waitForTimeout(100);
      expect(await axe(page)).toEqual([]);
    });
});
