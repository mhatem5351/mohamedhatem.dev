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

  test("experience trace: the agent roles open on desktop; arrow keys move between rows; opening one closes the others", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flows are desktop");
    await page.goto("/#experience");
    const rows = page.locator("[data-trace] details.span");
    const count = await rows.count();
    expect(count).toBeGreaterThan(5);
    // Globant (current), Wakeb Data and ArabsStock open by default on desktop (audit HM-30).
    for (const id of ["globant", "wakeb", "arabsstock"]) await expect(page.locator(`[data-trace] details.span--${id}`)).toHaveAttribute("open", "");
    expect(await page.locator("[data-trace] details.span[open]").count()).toBe(3);
    const first = rows.nth(0).locator("summary");
    await first.focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1).locator("summary")).toBeFocused();
    await page.keyboard.press("End");
    await expect(rows.nth(count - 1).locator("summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(rows.nth(count - 1)).toHaveAttribute("open", "");
    expect(await page.locator("[data-trace] details.span[open]").count()).toBe(1);
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

test.describe("the header between 64 and 80rem (audit L-03) @desktop-only", () => {
  for (const path of ["/", "/ar/", "/work/arabsstock-assistant/", "/ar/work/arabsstock-assistant/"])
    test(`${path}: the name is whole, the links sit on one line, the header keeps its height`, async ({ page }) => {
      for (const width of [1024, 1100, 1180, 1280, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const r = await page.evaluate(() => {
          const nav = document.querySelector<HTMLElement>("[data-nav]")!;
          const name = document.querySelector<HTMLElement>(".nav .brand > span:not(.brand__mark):not(.brand__role)")!;
          const role = document.querySelector<HTMLElement>(".nav .brand__role");
          // Lines per link: the distinct line boxes of its text.
          const links = [...document.querySelectorAll<HTMLElement>(".nav__links a")].map((a) => {
            const range = document.createRange();
            range.selectNodeContents(a);
            return new Set([...range.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top))).size;
          });
          return {
            height: Math.round(nav.getBoundingClientRect().height),
            nameCut: name.scrollWidth > name.clientWidth + 1,
            role: role ? getComputedStyle(role).display !== "none" && role.scrollWidth <= role.clientWidth + 1 : false,
            roleCut: role ? getComputedStyle(role).display !== "none" && role.scrollWidth > role.clientWidth + 1 : false,
            tallest: Math.max(...links),
          };
        });
        expect(r.height, `${width}px`).toBeLessThanOrEqual(66);
        expect(r.nameCut, `${width}px: the name is never ellipsised`).toBe(false);
        expect(r.roleCut, `${width}px: the role shows whole or not at all`).toBe(false);
        expect(r.role, `${width}px: the role shows from 80rem`).toBe(width >= 1280);
        expect(r.tallest, `${width}px: one line per link`).toBe(1);
      }
    });
});

test.describe("home: section order (audit HM-05)", () => {
  for (const path of ["/", "/ar/"])
    test(`${path}: Selected work (01) comes right after the hero, before What I build (02)`, async ({ page }) => {
      await page.goto(path);
      const ids = await page.evaluate(() => [...document.querySelectorAll("main > section[id]")].map((s) => s.id));
      expect(ids.slice(0, 4)).toEqual(["top", "work", "what", "experience"]);
      await expect(page.locator("#work .sec-head__index")).toHaveText("01");
      await expect(page.locator("#what .sec-head__index")).toHaveText("02");
    });
});

test.describe("work cards (audit H-01, H-02) @desktop-only", () => {
  test("every drawing fits its card's media box, at every width", async ({ page }) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const out = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("#work .work__media")].flatMap((m) => {
          const box = m.getBoundingClientRect();
          const svg = m.querySelector(":scope > svg");
          if (!svg) return [];
          // The drawing as painted: the viewBox letterboxed into the svg's box (preserveAspectRatio meet).
          const s = svg.getBoundingClientRect();
          const vb = (svg as SVGSVGElement).viewBox.baseVal;
          const k = Math.min(s.width / vb.width, s.height / vb.height);
          const w = vb.width * k;
          const h = vb.height * k;
          const left = s.left + (s.width - w) / 2;
          const top = s.top + (s.height - h) / 2;
          const inside = left >= box.left - 0.5 && top >= box.top - 0.5 && left + w <= box.right + 0.5 && top + h <= box.bottom + 0.5;
          return inside ? [] : [`${m.closest("article")?.querySelector(".work__title")?.textContent?.slice(0, 30)}: ${Math.round(top + h - box.bottom)} px below`];
        }),
      );
      expect(out, `${width}px`).toEqual([]);
    }
  });

  test("a card title never splits a domain or a hyphenated compound", async ({ page }) => {
    for (const path of ["/", "/ar/"])
      for (const width of [390, 768, 1024, 1180, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const split = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("#work .work__title .nowrap")]
            .filter((n) => {
              const r = document.createRange();
              r.selectNodeContents(n);
              return new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top))).size > 1;
            })
            .map((n) => n.textContent),
        );
        expect(split, `${path} ${width}px`).toEqual([]);
      }
  });
});
