import { PDFDocument } from "pdf-lib";
import { profile } from "@content/profile.ts";
import { contains, letters, pdfPagesText, sectionBreakProblems } from "../../scripts/lib/pdf-text.mjs";
import { expect, test } from "./fixtures";

/** Pages in a Chromium PDF: one "/Type /Page" object per page (the page tree node is "/Type /Pages"). */
const countPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

const PDFS = [
  ["/cv/", "/cv/Mohamed-Hatem-CV.pdf", "en"],
  ["/ar/cv/", "/cv/Mohamed-Hatem-CV-ar.pdf", "ar"],
] as const;
/** The Wakeb Data role's client line, exactly as approved. */
const CLIENT_LINE = { en: "Client: Saudi Ministry of Defense (GADD)", ar: "العميل: وزارة الدفاع السعودية (GADD)" } as const;
/** The section the CV no longer has. */
const PROJECTS = /Selected projects|مشروعات مختارة/i;

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
      expect(profile.cv.openTo.roles[0]!.en).toMatch(/Team Lead/);
      expect((await openTo.innerText()).split("\n")[0]).toBe(profile.cv.openTo.roles[0]![locale]);
    });
  }

  for (const [path, , locale] of PDFS) {
    test(`${path}: no "Selected projects" section`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator(".sheet #cv-projects, .sheet .cv-projects")).toHaveCount(0);
      for (const h of await page.locator(".sheet h2").allInnerTexts()) expect(h).not.toMatch(PROJECTS);
      expect(await page.locator(".sheet").innerText()).not.toMatch(PROJECTS);
    });

    test(`${path}: every role has its logo tile, loaded and decorative, on the role's line (mirrored in Arabic)`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".sheet img.cv-logo")].every((i) => i.complete));
      // One row per role: the main roles (with Tabaqat, which overlaps them) and the condensed "Earlier roles".
      const rows = page.locator(".sheet .job:not(.job--brief), .sheet .earlier__row");
      await expect(rows).toHaveCount(profile.experience.length);
      const logos = await rows.evaluateAll((els) =>
        els.map((row) => {
          const img = row.querySelector<HTMLImageElement>(":scope > .job__head > img.cv-logo, :scope > img.cv-logo");
          const title = row.querySelector(".job__role, :scope > span > b")!.getClientRects()[0]!;
          if (!img) return { title: row.textContent?.trim().slice(0, 40) };
          const r = img.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          return {
            loaded: img.complete && img.naturalWidth > 0,
            decorative: img.getAttribute("alt") === "" || img.getAttribute("aria-hidden") === "true",
            square: Math.abs(r.width - r.height) < 0.5,
            height: r.height,
            onTitleLine: mid > title.top && mid < title.bottom,
            side: r.right <= title.left ? "left" : r.left >= title.right ? "right" : "overlap",
            position: getComputedStyle(img).position,
          };
        }),
      );
      for (const l of logos) {
        expect(l, JSON.stringify(l)).toMatchObject({ loaded: true, decorative: true, square: true, onTitleLine: true, position: "static" });
        // About 4 mm on paper: 14-18 px at print scale, a little more on screens (the sheet is zoomed there).
        expect(l.height!).toBeGreaterThanOrEqual(13);
        expect(l.height!).toBeLessThanOrEqual(24);
        expect(l.side).toBe(locale === "ar" ? "right" : "left");
      }
    });

    test(`${path}: the Wakeb Data role names its client on its own line, after the head and before the bullets`, async ({ page }) => {
      await page.goto(path);
      expect(profile.experience.filter((r) => r.client).map((r) => r.id)).toEqual(["wakeb"]);
      const line = page.locator(".sheet .job__client");
      await expect(line).toHaveCount(1);
      expect((await line.innerText()).trim()).toBe(CLIENT_LINE[locale]);
      expect(
        await line.evaluate((el) => ({
          org: el.closest(".job")?.querySelector(".job__org")?.textContent?.trim(),
          inBullet: !!el.closest("li"),
          afterHead: !!el.previousElementSibling?.classList.contains("job__head"),
          beforeBullets: el.nextElementSibling?.tagName === "UL",
        })),
      ).toEqual({ org: "Wakeb Data", inBullet: false, afterHead: true, beforeBullets: true });
      // No bullet carries the client: the government assistant's client stays unnamed.
      for (const li of await page.locator(".sheet .job li").allInnerTexts()) expect(li).not.toMatch(/GADD|Ministry of Defense|وزارة الدفاع/);
    });

    test(`${path}: Open to lists the two roles in order, then the three work arrangements`, async ({ page }) => {
      await page.goto(path);
      // One list everywhere (round 6, HM-13): the site's About uses the same roles.
      expect(profile.cv.openTo.roles.map((r) => r.en)).toEqual(["AI/ML Team Lead", "Senior AI / LLM Engineer"]);
      expect(profile.basics.openTo.roles).toEqual(profile.cv.openTo.roles);
      expect(profile.cv.openTo.arrangements.map((a) => a.en)).toEqual(["Remote", "Relocation to the Gulf or Europe", "Hybrid in Cairo"]);
      const block = page.locator(".cv-side .cv-sec").last();
      await expect(block).toHaveAttribute("aria-labelledby", "cv-open");
      expect(await block.locator(".open-to__roles > span").allInnerTexts()).toEqual(profile.cv.openTo.roles.map((r) => r[locale]));
      expect(await block.locator(".open-to__ways > span").allInnerTexts()).toEqual(profile.cv.openTo.arrangements.map((a) => a[locale]));
      // One item per line.
      const tops = await block.locator(".open-to span").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
      for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
    });
  }

  test("both PDFs: exactly two pages, the Wakeb client line right after its role head, no Selected projects @desktop-only", async ({ page, request }) => {
    for (const [, file, locale] of PDFS) {
      const pages = await pdfPagesText(Buffer.from(await (await request.get(file)).body()));
      expect(pages.length, file).toBe(2);
      expect(pages.some((p) => contains(p, CLIENT_LINE[locale])), file).toBe(true);
      for (const p of pages) for (const x of ["Selected projects", "مشروعات مختارة"]) expect(contains(p, x), `${file}: ${x}`).toBe(false);
      // Every role head is intact in the text layer (a logo adds no text), and Open to has its roles.
      for (const r of profile.experience) expect(pages.some((p) => contains(p, `${r.title[locale]} ${r.company[locale].split(" · ")[0]}`)), `${file}: ${r.id}`).toBe(true);
      for (const r of profile.cv.openTo.roles) expect(pages.some((p) => contains(p, r[locale])), `${file}: ${r.en}`).toBe(true);
      if (locale === "en") {
        // Reading order (the English text layer reads in order): head, period and where line, client, first bullet.
        await page.goto("/cv/");
        const head = page.locator(".job", { has: page.locator(".job__client") }).locator(".job__head");
        const headText = letters(`${await head.locator(".job__name").innerText()} ${await head.locator(".job__when").innerText()} ${await head.locator(".job__where").innerText()}`);
        const text = letters(pages.join("\n"));
        const wakeb = profile.experience.find((r) => r.id === "wakeb")!;
        const at = text.indexOf(headText);
        expect(at, "the Wakeb role head").toBeGreaterThanOrEqual(0);
        expect(text.indexOf(letters(CLIENT_LINE.en)), "the client line follows the head").toBe(at + headText.length);
        expect(text.indexOf(letters(wakeb.cvBullets[0].text.en)), "the first bullet follows the client line").toBe(at + headText.length + letters(CLIENT_LINE.en).length);
      }
    }
  });

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

  test("each main role links its featured case study in the CV's language (the STA case study on the Globant role), in the page and the PDFs", async ({ page, request }) => {
    for (const [path, file, locale] of PDFS) {
      await page.goto(path);
      const prefix = locale === "ar" ? "/ar" : "";
      const featured = profile.experience
        .map((r) => ({ r, cs: profile.caseStudies.find((c) => r.caseStudies.includes(c.slug) && c.featured && c.depth === "full") }))
        .filter((x) => x.cs);
      expect(featured.find((x) => x.r.id === "globant")?.cs?.slug).toBe("sta-tourism-assistants");
      const links = page.locator(".job__where a.job__case");
      await expect(links).toHaveCount(featured.length);
      for (const [i, { cs }] of featured.entries()) {
        await expect(links.nth(i)).toHaveAttribute("href", `https://mohamedhatem.dev${prefix}/work/${cs!.slug}/`);
        await expect(links.nth(i)).toHaveAccessibleName(new RegExp(cs!.title[locale].slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      // The PDF keeps the links (URI annotations) to every featured case study.
      const pdf = Buffer.from(await (await request.get(file)).body()).toString("latin1");
      for (const { cs } of featured) expect(pdf, `${file}: ${cs!.slug}`).toContain(`${prefix}/work/${cs!.slug}/`);
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
