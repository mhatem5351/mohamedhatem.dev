import { PDFDocument } from "pdf-lib";
import { profile } from "@content/profile.ts";
import { contains, pdfPagesText, sectionBreakProblems } from "../../scripts/lib/pdf-text.mjs";
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

  for (const [path, locale] of [["/cv/", "en"], ["/ar/cv/", "ar"]] as const) {
    test(`${path}: the receipts are bold (summary and bullets), and Open to leads with the team-lead role`, async ({ page }) => {
      await page.goto(path);
      const bold = await page.locator(".sheet strong").allInnerTexts();
      const phrases = [
        ...profile.cv.summaryStrong.map((x) => x[locale]),
        ...profile.experience.flatMap((r) => r.cvBullets.flatMap((f) => (f.strong ? [f.strong[locale]] : []))),
      ];
      expect(phrases.length).toBeGreaterThan(10);
      // Every phrase is set in bold, whole words only (an Arabic prefix joined to the phrase is bold with it).
      for (const p of phrases) expect(bold.some((b) => b.includes(p)), p).toBe(true);
      for (const b of bold) expect(b, b).not.toMatch(/^\s|\s$/);
      const openTo = page.locator(".cv-side .cv-sec").last().locator(".side-list li").first();
      expect((await openTo.innerText()).split("\n")[0]).toBe(profile.basics.openTo.roles[0]![locale]);
    });
  }

  test("names and dash pairs never break inside a line (Umm Al-Qura University, Learning – Specialty)", async ({ page }) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/cv/", "/ar/cv/"]) {
        await page.goto(path);
        const runs = await page.locator(".sheet .nb").evaluateAll((els) =>
          els.map((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            // Line boxes of the run: rects whose tops differ by more than a few pixels (Latin and Arabic glyph runs on
            // one line can sit a pixel or two apart).
            const tops = [...r.getClientRects()].filter((x) => x.width > 0).map((x) => x.top).sort((a, b) => a - b);
            const lines = tops.reduce((n, t, i) => (i > 0 && t - tops[i - 1]! > 6 ? n + 1 : n), tops.length ? 1 : 0);
            return { text: el.textContent ?? "", lines, ws: getComputedStyle(el).whiteSpace };
          }),
        );
        expect(runs.length, path).toBeGreaterThan(5);
        for (const r of runs) expect([r.text, r.lines, r.ws], `${path} at ${width}`).toEqual([r.text, 1, "nowrap"]);
        if (path === "/cv/") {
          expect(runs.map((r) => r.text)).toContain("Umm Al-Qura University");
          expect(runs.map((r) => r.text)).toContain("Learning – Specialty");
        }
      }
    }
  });

  test("the PDFs keep Education whole and every sidebar heading with its first entry, with plain searchable text @desktop-only", async ({ page, request }) => {
    for (const [path, file] of [
      ["/cv/", "/cv/Mohamed-Hatem-CV.pdf"],
      ["/ar/cv/", "/cv/Mohamed-Hatem-CV-ar.pdf"],
    ] as const) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".cv-side .cv-sec")].map((sec) => ({
          heading: sec.querySelector("h2")?.innerText ?? "",
          first: (sec.querySelector(".side-list > li, .skill-g") as HTMLElement | null)?.innerText ?? "",
          all: sec.innerText,
          keep: sec.classList.contains("cv-sec--keep"),
        })),
      );
      expect(sections.find((s) => s.all.includes(profile.education[2]!.degree[path === "/cv/" ? "en" : "ar"]))?.keep, path).toBe(true);
      const pages = await pdfPagesText(Buffer.from(await (await request.get(file)).body()));
      expect(pages.length, file).toBe(2);
      expect(sectionBreakProblems(pages, sections), file).toEqual([]);
      // The text layer has the plain text (no no-break or zero-width characters from the line-break handling).
      expect(pages.join("")).not.toMatch(/[\u00A0\u2011\u2060\u200B]/);
      if (path === "/cv/") {
        expect(pages.some((p) => contains(p, "Umm Al-Qura University"))).toBe(true);
        expect(pages.some((p) => contains(p, "AWS Certified Machine Learning – Specialty"))).toBe(true);
      }
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
