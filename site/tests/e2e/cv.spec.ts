import { PDFDocument } from "pdf-lib";
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

  test("the PDFs carry title, author, subject and language metadata @desktop-only", async ({ request }) => {
    for (const [file, lang, author] of [
      ["/cv/Mohamed-Hatem-CV.pdf", "en", "Mohamed Hatem"],
      ["/cv/Mohamed-Hatem-CV-ar.pdf", "ar", "محمد حاتم"],
    ] as const) {
      const buf = Buffer.from(await (await request.get(file)).body());
      const doc = await PDFDocument.load(buf, { updateMetadata: false });
      expect(doc.getAuthor(), file).toBe(author);
      expect(doc.getSubject(), file).toBeTruthy();
      expect(doc.getTitle(), file).toBeTruthy();
      expect(doc.getKeywords(), file).toContain("Mohamed Hatem");
      expect(buf.toString("latin1"), file).toContain(`/Lang (${lang})`);
      expect(buf.toString("latin1"), file).toContain("/StructTreeRoot");
    }
  });

  test("the Arabic CV links to the Arabic site", async ({ page }) => {
    await page.goto("/ar/cv/");
    await expect(page.locator(".cv-contact a").first()).toHaveAttribute("href", "https://mohamedhatem.dev/ar/");
    await expect(page.locator(".cv-foot a")).toHaveAttribute("href", "https://mohamedhatem.dev/ar/");
  });

  test("Arabic CV: the in-progress degree's years read like the others, with (expected) on its own line", async ({ page }) => {
    await page.goto("/ar/cv/");
    const rows = await page.locator(".cv-side .side-list").first().locator("li").evaluateAll((lis) =>
      lis.map((li) => {
        const bdi = li.querySelector("em bdi")!;
        const t = bdi.firstChild as Text;
        const x = (s: string) => {
          const r = document.createRange();
          const i = t.data.indexOf(s);
          r.setStart(t, i);
          r.setEnd(t, i + s.length);
          return r.getBoundingClientRect();
        };
        const [start, end] = t.data.match(/\d{4}/g)!;
        const ems = li.querySelectorAll("em");
        return { startLeft: x(start!).left < x(end!).left, qualifierBelow: ems.length > 1 ? ems[1]!.getBoundingClientRect().top >= ems[0]!.getBoundingClientRect().bottom - 1 : null };
      }),
    );
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.startLeft).toBe(true);
    expect(rows[0]!.qualifierBelow).toBe(true);
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
