import { expect, test } from "./fixtures";

/** Pages in a Chromium PDF: one "/Type /Page" object per page (the page tree node is "/Type /Pages"). */
const countPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

test.describe("CV", () => {
  for (const path of ["/cv/", "/ar/cv/"]) {
    test(`${path} prints to at most two A4 pages @chromium-only`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "page.pdf() is Chromium-only");
      await page.goto(path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      const pages = countPages(pdf);
      expect(pages).toBeGreaterThanOrEqual(1);
      expect(pages).toBeLessThanOrEqual(2);
    });
  }

  test("the generated PDFs are served", async ({ request }) => {
    for (const file of ["/cv/Mohamed-Hatem-CV.pdf", "/cv/Mohamed-Hatem-CV-ar.pdf"]) {
      const res = await request.get(file);
      expect(res.status(), file).toBe(200);
      expect(res.headers()["content-type"]).toContain("application/pdf");
      const pages = countPages(Buffer.from(await res.body()));
      expect(pages, file).toBeLessThanOrEqual(2);
    }
  });

  test("hides the site chrome in print", async ({ page }) => {
    await page.goto("/cv/");
    await page.emulateMedia({ media: "print" });
    for (const sel of [".nav", ".footer", "[data-mh-chat]"]) {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) await expect(el).toBeHidden();
    }
  });
});
