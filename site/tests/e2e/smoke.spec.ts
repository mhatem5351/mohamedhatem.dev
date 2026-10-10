import { NOT_FOUND, PAGES } from "./pages";
import { expect, test } from "./fixtures";

test.describe("every page loads cleanly", () => {
  for (const path of PAGES) {
    test(`${path} — 200, lang/dir, one H1, no console errors`, async ({ page, errors }) => {
      const res = await page.goto(path, { waitUntil: "networkidle" });
      expect(res?.status()).toBe(200);
      const ar = path.startsWith("/ar/");
      await expect(page.locator("html")).toHaveAttribute("lang", ar ? "ar" : "en");
      await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main#main")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
      // Scroll the whole page so lazy images, reveal observers and the hero graph all run.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
      });
      await page.waitForTimeout(300);
      expect(errors).toEqual([]);
    });
  }

  for (const path of NOT_FOUND) {
    test(`${path} — 404 page in the right language, noindex`, async ({ page, errors }) => {
      const res = await page.goto(path, { waitUntil: "networkidle" });
      expect(res?.status()).toBe(404);
      const ar = path.startsWith("/ar/");
      await expect(page.locator("html")).toHaveAttribute("lang", ar ? "ar" : "en");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
});
