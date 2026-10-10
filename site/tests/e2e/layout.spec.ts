import { KEY_PAGES, NOT_FOUND } from "./pages";
import { expect, test } from "./fixtures";

const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440, 1920];

test.describe("no horizontal overflow from 320 to 1920 @desktop-only", () => {
  for (const path of [...KEY_PAGES, "/work/wakeb-bilingual-chatbot/", "/ar/work/logic-controls-website/", ...NOT_FOUND]) {
    test(path, async ({ page }) => {
      const overflow: string[] = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path, { waitUntil: "networkidle" });
        const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        if (scroll > client) overflow.push(`${width}px: scrollWidth ${scroll} > ${client}`);
      }
      expect(overflow).toEqual([]);
    });
  }
});

test.describe("keyboard", () => {
  test("the skip link is the first tab stop and moves focus to main", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flows are desktop");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.locator(".skip-link");
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("experience trace: arrow keys move between rows, one open at a time", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flows are desktop");
    await page.goto("/#experience");
    const rows = page.locator("[data-trace] details.span");
    const count = await rows.count();
    expect(count).toBeGreaterThan(5);
    const first = rows.nth(0).locator("summary");
    await first.focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1).locator("summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(rows.nth(1)).toHaveAttribute("open", "");
    await expect(rows.nth(0)).not.toHaveAttribute("open", "");
    await page.keyboard.press("End");
    await expect(rows.nth(count - 1).locator("summary")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
  });

  test("hero graph is one tab stop with arrow-key navigation and an accessible text alternative", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flows are desktop");
    await page.goto("/");
    const graph = page.locator(".hero [data-hero-graph], .hero .hg").first();
    await expect(graph).toBeVisible();
    // The figure carries a text description of the flow (figcaption / sr text / svg desc).
    const described = await graph.evaluate((el) => {
      const svg = el.querySelector("svg");
      return !!(el.closest("figure")?.querySelector("figcaption") || svg?.querySelector("desc") || svg?.getAttribute("aria-label"));
    });
    expect(described).toBe(true);
    const focusable = graph.locator('[tabindex="0"]');
    await expect(focusable).toHaveCount(1);
    await focusable.focus();
    const before = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent);
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent);
    expect(after).not.toBe(before);
  });
});
