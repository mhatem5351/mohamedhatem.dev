/**
 * Round 7, the document pages (CV screen view, privacy, 404): layout invariants for the fixes of D-02, D-12, D-18,
 * D-21, D-23, R7-DOC-03, R7-DOC-04, R7-DOC-05 and R7-DOC-06 / A-27. Viewport-specific, so they run once (desktop
 * project) with explicit sizes.
 */
import { expect, test } from "./fixtures";

const box = async (page: import("@playwright/test").Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test.describe("CV on screen (round 7) @desktop-only", () => {
  for (const path of ["/cv/", "/ar/cv/"])
    test(`${path} at 320: each role's dates sit on their own line under the role, aligned with it (D-02)`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const heads = await page.locator(".job__head--logo").evaluateAll((els) =>
        els.map((h) => {
          const name = h.querySelector(".job__name")!.getBoundingClientRect();
          const when = h.querySelector(".job__when")!.getBoundingClientRect();
          const rtl = getComputedStyle(h).direction === "rtl";
          return { below: when.top >= name.bottom - 1, aligned: Math.abs(rtl ? when.right - name.right : when.left - name.left) <= 1, nameH: name.height };
        }),
      );
      expect(heads.length).toBeGreaterThan(3);
      for (const h of heads) {
        expect(h.below, "dates under the role").toBe(true);
        expect(h.aligned, "dates start with the role's text").toBe(true);
      }
      // The role and its company take at most two lines now that the dates no longer share the row.
      const lineH = await page.locator(".job__role").first().evaluate((e) => parseFloat(getComputedStyle(e).lineHeight) || 20);
      for (const h of heads) expect(h.nameH, "role · company in at most two lines").toBeLessThanOrEqual(lineH * 2 + 4);
    });

  for (const path of ["/cv/", "/ar/cv/"])
    test(`${path} at 390: the title line never ends on a separator; the focus starts its own line (R7-DOC-05)`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const r = await page.locator(".cv-title").evaluate((p) => {
        const seps = p.querySelectorAll(".sep");
        const last = seps[seps.length - 1] as HTMLElement;
        const b = p.querySelector("b")!.getBoundingClientRect();
        const focus = document.createRange();
        focus.setStart(p.lastChild!, Math.max(0, (p.lastChild!.textContent ?? "").search(/\S/)));
        focus.setEnd(p.lastChild!, (p.lastChild!.textContent ?? "").length);
        return { lastSepShown: getComputedStyle(last).display !== "none", focusTop: focus.getClientRects()[0]!.top, employerBottom: b.bottom };
      });
      expect(r.lastSepShown, "the second separator is hidden").toBe(false);
      expect(r.focusTop, "the focus starts below the employer").toBeGreaterThanOrEqual(r.employerBottom - 1);
    });

  test("tablet: the sidebar's two columns end within a skill group of each other (R7-DOC-04)", async ({ page }) => {
    for (const [path, width] of [["/cv/", 768], ["/ar/cv/", 834]] as const) {
      await page.setViewportSize({ width, height: 1100 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const gap = await page.locator(".cv-side").evaluate((side) => {
        const secs = [...side.querySelectorAll<HTMLElement>(":scope > .cv-sec")];
        const parts = secs.flatMap((s) => [...s.getClientRects()]);
        const lefts = [...new Set(parts.map((r) => Math.round(r.left)))].sort((a, b) => a - b);
        const bottom = (l: number) => Math.max(...parts.filter((r) => Math.round(r.left) === l).map((r) => r.bottom));
        return lefts.length === 2 ? Math.abs(bottom(lefts[0]!) - bottom(lefts[1]!)) : -1;
      });
      expect(gap, `${path} ${width}: two columns`).toBeGreaterThanOrEqual(0);
      expect(gap, `${path} ${width}: the columns end close together`).toBeLessThan(160);
    }
  });

  test("wide screens: the toolbar's first and last buttons line up with the sheet's edges (D-18)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/cv/", "/ar/cv/"]) {
      await page.goto(path);
      const sheet = await box(page, ".sheet");
      const edges = await page.locator(".cv-bar__inner").evaluate((bar) => {
        const vis = [...bar.children].filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0 && !e.classList.contains("cv-bar__spacer"));
        const rs = vis.map((e) => e.getBoundingClientRect());
        return { min: Math.min(...rs.map((r) => r.left)), max: Math.max(...rs.map((r) => r.right)) };
      });
      expect(Math.abs(edges.min - sheet.x), `${path}: start edge`).toBeLessThanOrEqual(2);
      expect(Math.abs(edges.max - (sheet.x + sheet.width)), `${path}: end edge`).toBeLessThanOrEqual(2);
    }
  });
});

test.describe("privacy (round 7) @desktop-only", () => {
  for (const [path, w, h] of [
    ["/privacy/", 1024, 768],
    ["/ar/privacy/", 1024, 768],
    ["/privacy/", 1440, 900],
    ["/ar/privacy/", 1440, 900],
  ] as const)
    test(`${path} at ${w} × ${h}: the table of contents loads with its first section current (R7-DOC-06, A-27)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(path);
      const toc = page.locator(".doc__toc a");
      await expect(toc.first()).toHaveAttribute("aria-current", "true");
      await expect(page.locator('.doc__toc a[aria-current="true"]')).toHaveCount(1);
    });

  test("laptops: the text column ends clear of the chat launcher's corner (R7-DOC-03)", async ({ page }) => {
    for (const [path, w] of [["/privacy/", 1024], ["/ar/privacy/", 1024], ["/privacy/", 1100]] as const) {
      await page.setViewportSize({ width: w, height: 768 });
      await page.goto(path);
      const body = await box(page, ".doc__body");
      // The launcher: a 56 px disc 16 px from the inline-end edge (chat-widget), plus 12 px of air.
      if (path.startsWith("/ar/")) expect(body.x, `${path} ${w}`).toBeGreaterThanOrEqual(16 + 56 + 12);
      else expect(body.x + body.width, `${path} ${w}`).toBeLessThanOrEqual(w - 16 - 56 - 12);
    }
  });

  test("the way back ends the text column; the email link is just the address (D-12, D-21)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/privacy/", "/ar/privacy/"]) {
      await page.goto(path);
      await expect(page.locator(".doc__body > .doc__back")).toHaveCount(1);
      const body = await box(page, ".doc__body");
      const back = await box(page, ".doc__back .btn");
      const rtl = path.startsWith("/ar/");
      expect(Math.abs(rtl ? back.x + back.width - (body.x + body.width) : back.x - body.x), `${path}: back starts with the text`).toBeLessThanOrEqual(1);
      const mail = page.locator('.doc__sec a[href^="mailto:"]');
      const text = await mail.evaluate((a) => a.textContent ?? "");
      expect(text, `${path}: no space inside the link`).toBe(text.trim());
    }
  });

  test("a hyphenated compound or a short product name never splits across lines (D-27, A-20)", async ({ page }) => {
    for (const [path, w] of [["/privacy/", 768], ["/privacy/", 390], ["/ar/privacy/", 320], ["/ar/privacy/", 390]] as const) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      // Each unit is one inline block (it moves to the next line whole), never an inline run split over two lines.
      const split = await page
        .locator(".doc .nb-unit")
        .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 1 || getComputedStyle(e).display !== "inline-block").map((e) => e.textContent));
      expect(await page.locator(".doc .nb-unit").count(), `${path}: units present`).toBeGreaterThan(2);
      expect(split, `${path} ${w}`).toEqual([]);
    }
  });
});

test.describe("404 (round 7) @desktop-only", () => {
  for (const width of [1440, 1024, 390, 320])
    test(`at ${width}: the two links sit on their own row, flush with the buttons (D-23)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/does-not-exist/", "/ar/does-not-exist/"]) {
        await page.goto(path);
        const r = await page.locator(".nf__actions").evaluate((a) => {
          const rtl = getComputedStyle(a).direction === "rtl";
          const start = (e: Element) => (rtl ? e.getBoundingClientRect().right : e.getBoundingClientRect().left);
          const btn = a.querySelector(".nf__buttons > *")!;
          const link = [...a.querySelectorAll(".nf__links > *")].find((e) => e.getBoundingClientRect().width > 0)!;
          return { delta: Math.abs(start(btn) - start(link)), below: link.getBoundingClientRect().top >= a.querySelector(".nf__buttons")!.getBoundingClientRect().bottom - 1 };
        });
        expect(r.delta, `${path}: flush`).toBeLessThanOrEqual(1);
        expect(r.below, `${path}: own row`).toBe(true);
      }
    });
});

test.describe("no sideways scroll on the document pages (round 7) @desktop-only", () => {
  for (const theme of ["dark", "light"] as const)
    test(`${theme}: 320-1440, both languages`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("mh-theme", t), theme);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of ["/cv/", "/ar/cv/", "/privacy/", "/ar/privacy/", "/does-not-exist/", "/ar/does-not-exist/"]) {
          await page.goto(path);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          expect(over, `${path} at ${width}`).toBeLessThanOrEqual(0);
        }
      }
    });
});
