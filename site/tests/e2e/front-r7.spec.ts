/**
 * Round 7 front-end checks (visual audit R7-*; technical R7-RES-*, R7-A11Y-01, R7-PERF-01).
 *
 * 1. A layout smoke over 6 widths × 2 themes × 2 languages on key pages: the header's controls end on the container's
 *    inline end (R7-LEAD-01), "Ask AI" never wraps and the name is never cut (R7-HOME-01, A11Y-07), nothing scrolls
 *    sideways. Each run attaches the header and the first screen as images to the report for a visual look; there are
 *    no stored baselines (the checks are measurements, so a later round can't silently undo them).
 * 2. Behaviours: the reveal fails open (R7-RES-01), printing shows the work and hides the chrome (R7-RES-03), the chat
 *    offers email and WhatsApp when its code doesn't load (R7-RES-04), Escape dismisses the greeting (R7-A11Y-01), the
 *    ask bar types one example once (M-08), and Arabic periods read in order (A-02).
 */
import type { Browser, Page } from "@playwright/test";
import { expect, stubThirdParties, test } from "./fixtures";

const WIDTHS = [1440, 1024, 768, 390, 360, 320] as const;
const HEIGHT: Record<number, number> = { 1440: 900, 1024: 768, 768: 1024, 390: 844, 360: 740, 320: 568 };
const PAGES = ["/", "/work/sta-tourism-assistants/"] as const;

async function open(browser: Browser, width: number, theme: "dark" | "light", path: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const touch = width <= 768;
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width]! }, isMobile: touch, hasTouch: touch, colorScheme: theme });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("mh-theme", t);
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  await stubThirdParties(page);
  await page.goto(path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { page, close: () => ctx.close() };
}

/** The header's geometry: where its last visible control ends against the container's content edge, the name, Ask. */
const header = (page: Page) =>
  page.evaluate(() => {
    /** One line's height: the computed line-height, or the font size × 1.2 for "normal". */
    const lineBox = (el: Element) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    };
    const inner = document.querySelector<HTMLElement>(".nav__inner")!;
    const cs = getComputedStyle(inner);
    const box = inner.getBoundingClientRect();
    const rtl = document.dir === "rtl";
    const end = rtl ? box.left + parseFloat(cs.paddingLeft) : box.right - parseFloat(cs.paddingRight);
    const controls = [...document.querySelectorAll<HTMLElement>(".nav__actions > *")].filter((e) => e.getBoundingClientRect().width > 0);
    const last = controls.at(-1)!.getBoundingClientRect();
    const name = document.querySelector<HTMLElement>(".brand > span:not(.brand__mark)")!;
    const nr = name.getBoundingClientRect();
    const ask = document.querySelector<HTMLElement>(".nav__ask")!;
    const label = [...ask.querySelectorAll<HTMLElement>("span")].find((s) => s.getBoundingClientRect().width > 1);
    return {
      gap: Math.abs((rtl ? last.left : last.right) - end),
      nameShown: nr.width > 1,
      nameCut: nr.width > 1 && name.scrollWidth > name.clientWidth + 1,
      nameLines: Math.round(nr.height / lineBox(name)),
      labelLines: label ? Math.round(label.getBoundingClientRect().height / lineBox(label)) : 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

test.describe("layout smoke: header and first screen @desktop-only", () => {
  test.describe.configure({ mode: "parallel" });
  for (const path of PAGES)
    for (const locale of ["en", "ar"] as const)
      for (const theme of ["dark", "light"] as const)
        test(`${locale} ${theme} ${path}`, async ({ browser }, info) => {
          const url = locale === "ar" ? (path === "/" ? "/ar/" : `/ar${path}`) : path;
          for (const width of WIDTHS) {
            const { page, close } = await open(browser, width, theme, url);
            const h = await header(page);
            const at = `${url} at ${width}`;
            expect(h.overflow, `${at}: no sideways scroll`).toBeLessThanOrEqual(0);
            expect(h.gap, `${at}: the header's controls end on the container's end`).toBeLessThanOrEqual(1);
            expect(h.labelLines, `${at}: "Ask AI" on one line`).toBeLessThanOrEqual(1);
            expect(h.nameCut, `${at}: the name is never cut`).toBe(false);
            // From 360 px the whole name shows, on one line (Arabic keeps it at 320 too).
            if (width >= 360 || locale === "ar") expect(h.nameShown, `${at}: the name shows`).toBe(true);
            if (h.nameShown) expect(h.nameLines, `${at}: the name on one line`).toBeLessThanOrEqual(1);
            // The hero's availability line shows one form of the work arrangements, never both (H-22).
            if (path === "/")
              expect(await page.locator(".hero__open :is(.hero__arr-long, .hero__arr-short)").evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length), `${at}: one arrangements line`).toBeLessThanOrEqual(1);
            await info.attach(`header ${locale} ${theme} ${width}`, { body: await page.screenshot({ clip: { x: 0, y: 0, width, height: 80 } }), contentType: "image/png" });
            await info.attach(`first screen ${locale} ${theme} ${width}`, { body: await page.screenshot(), contentType: "image/png" });
            await close();
          }
        });
});

test.describe("resilience", () => {
  test("the work stays visible when the site script fails to load (the reveal fails open) @desktop-only", async ({ page }) => {
    await page.route(/\/_astro\/site\.[^/]*\.js$/, (r) => r.abort());
    await page.goto("/");
    await page.evaluate(() => document.querySelector("#work")!.scrollIntoView());
    await page.waitForTimeout(3500);
    const hidden = await page.locator("#work [data-reveal], #what [data-reveal], #projects [data-reveal]").evaluateAll((els) => els.filter((e) => Number(getComputedStyle(e).opacity) < 1).length);
    expect(hidden).toBe(0);
  });

  test("printing shows every card and none of the screen chrome @chromium-only @desktop-only", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-mh-chat]")).toBeAttached({ timeout: 10_000 });
    await page.emulateMedia({ media: "print" });
    const s = await page.evaluate(() => ({
      hidden: [...document.querySelectorAll("[data-reveal]")].filter((e) => Number(getComputedStyle(e).opacity) < 1).length,
      chrome: ["[data-mh-chat]", ".nav__actions", ".ask-bar", ".dock"].filter((sel) => {
        const el = document.querySelector(sel);
        return el && getComputedStyle(el).display !== "none";
      }),
      navPosition: getComputedStyle(document.querySelector(".nav")!).position,
    }));
    expect(s.hidden).toBe(0);
    expect(s.chrome).toEqual([]);
    expect(s.navPosition).toBe("static");
  });

  test("an Ask button offers email and WhatsApp when the chat's code doesn't load @desktop-only", async ({ page }) => {
    await page.route(/\/_astro\/ChatMount[^/]*\.js$/, (r) => r.abort());
    await page.goto("/");
    const ask = page.locator(".nav__ask");
    await ask.click();
    const card = page.locator("[data-chat-fallback]");
    await expect(card).toBeVisible({ timeout: 8_000 });
    await expect(card.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(card.locator('a[href*="wa.me"]')).toHaveCount(1);
    await expect(card).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(ask).toBeFocused();
  });

  test("the fallback stays away when the chat opens normally @desktop-only", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-mh-chat]")).toBeAttached({ timeout: 10_000 });
    await page.locator(".nav__ask").click();
    await expect(page.locator("[data-mh-chat]").locator('[role="dialog"]')).toBeVisible();
    await page.waitForTimeout(4500);
    await expect(page.locator("[data-chat-fallback]")).toBeHidden();
  });
});

test.describe("motion and dismissal", () => {
  test("Escape dismisses the launcher's greeting while the pointer still hovers it @desktop-only", async ({ page }) => {
    await page.goto("/");
    const host = page.locator("[data-mh-chat]");
    await expect(host).toHaveAttribute("data-art", "on", { timeout: 10_000 });
    await page.evaluate(() => scrollTo(0, 2600));
    await page.waitForTimeout(400);
    await host.locator("button").first().hover();
    const shown = () => host.evaluate((h) => h.shadowRoot!.querySelector<HTMLElement>("[data-s]")?.dataset.s === "on");
    await expect.poll(shown).toBe(true);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Escape");
    await expect.poll(shown).toBe(false);
  });

  test("the ask bar types one example once, then rests on its placeholder @desktop-only", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator("[data-hero-ask]");
    await expect(bar).toHaveClass(/is-typing/, { timeout: 8_000 });
    await expect(bar).not.toHaveClass(/is-typing/, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(bar).not.toHaveClass(/is-typing/);
  });

  test("the live dot under the hero graph doesn't loop @desktop-only", async ({ page }) => {
    await page.goto("/");
    const running = await page.locator(".hero__caption .dot--live").evaluate((d) => d.getAnimations({ subtree: true }).length + getComputedStyle(d, "::after").animationName.replace("none", "").length);
    expect(running).toBe(0);
  });
});

test.describe("Arabic periods (A-02)", () => {
  test("the M.Sc. row reads «سبتمبر 2023 – 2027», the coursework range 2021–2022 @desktop-only", async ({ page }) => {
    await page.goto("/ar/");
    const order = await page.evaluate(() => {
      const xOf = (root: Element, word: string) => {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const i = n.textContent!.indexOf(word);
          if (i < 0) continue;
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + word.length);
          const box = r.getBoundingClientRect();
          if (box.width) return box.left;
        }
        return NaN;
      };
      const label = [...document.querySelectorAll(".span__dates")].find((e) => /متوقع/.test(e.textContent!) && e.getBoundingClientRect().width)!;
      const archive = [...document.querySelectorAll(".repos__archive p")].find((e) => /2021/.test(e.textContent!))!;
      return { month: xOf(label, "سبتمبر"), start: xOf(label, "2023"), end: xOf(label, "2027"), a: xOf(archive, "2021"), b: xOf(archive, "2022") };
    });
    // Right to left: the month, then its year, then the end year.
    expect(order.month).toBeGreaterThan(order.start);
    expect(order.start).toBeGreaterThan(order.end);
    // A bare year range reads left to right.
    expect(order.a).toBeLessThan(order.b);
  });
});
