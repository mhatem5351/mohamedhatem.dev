/**
 * The chat launcher dressed as Hatem's avatar (src/scripts/chat-avatar.ts): its name and description, the panel,
 * the comic speech bubble (auto greeting, × for the session, keyboard, Escape), reduced motion, RTL, the steps aside
 * for [data-chat-avoid] and the hero on phones, the header avatar talking while an answer streams, and axe with the
 * bubble showing (EN/AR, light/dark, 1440/390/320).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { ar } from "@content/i18n/ar.ts";
import { en, type Messages } from "@content/i18n/en.ts";
import { expect, test, useTheme } from "./fixtures";

type M = Messages;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const host = (page: Page) => page.locator("[data-mh-chat]");
const launcher = (page: Page, m: M) => page.getByRole("button", { name: m.chat.avatar.name, exact: true });

/** The avatar module has loaded and dressed the launcher. */
async function ready(page: Page) {
  await expect(host(page)).toHaveAttribute("data-art", "on", { timeout: 10_000 });
}
/** On phones the launcher waits until the hero's ask bar has scrolled past. */
async function pastHero(page: Page) {
  await page.locator("[data-hero-ask]").evaluate((el) => scrollBy(0, el.getBoundingClientRect().bottom + 40));
  await expect(host(page)).not.toHaveAttribute("data-dodge", "");
}
/** The speech bubble as rendered (it inherits the host's visibility while the launcher steps aside). */
const shown = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector("[data-mh-chat]")!.shadowRoot!;
    const bub = r.querySelector(".bub");
    return !!bub && r.querySelector(".mhb")!.getAttribute("data-s") === "on" && getComputedStyle(bub).visibility === "visible";
  });
const greetFlag = (page: Page) => page.evaluate(() => sessionStorage.getItem("mh-chat:greet"));
/** Running animations in the widget's shadow root, by keyframes name. */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .querySelector("[data-mh-chat]")!
      .shadowRoot!.getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => (a as CSSAnimation).animationName),
  );

test.describe("avatar launcher", () => {
  test("is a real button named for Hatem's assistant, described by the greeting, in both languages", async ({ page, isMobile }) => {
    for (const [path, m] of [["/", en], ["/ar/", ar]] as const) {
      await page.goto(path);
      await ready(page);
      if (isMobile) await pastHero(page);
      const btn = launcher(page, m);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute("aria-haspopup", "dialog");
      // The 👋 is aria-hidden, which only counts while the bubble shows (on phones it greets once per session, so not
      // on the second page here); hidden, the whole bubble is the description.
      await expect(btn).toHaveAccessibleDescription(new RegExp(`${esc(m.chat.avatar.hi)}\\s+(👋\\s+)?${esc(m.chat.avatar.text)}`));
      await expect(btn.locator("svg.mh-av")).toHaveCount(1);
      // The default disc: deep ink with the teal rim.
      expect(await btn.locator(".av-disc").evaluate((c) => getComputedStyle(c).fill)).toBe("rgb(20, 33, 43)");
      expect(await btn.locator(".av-rim").evaluate((c) => getComputedStyle(c).stroke)).toBe("rgb(44, 194, 176)");
    }
  });

  test("opens the chat; the panel header shows the same avatar", async ({ page, isMobile }) => {
    await page.goto("/");
    await ready(page);
    if (isMobile) await pastHero(page);
    await launcher(page, en).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("[data-mh-chat] .hd .avh svg.mh-av")).toHaveCount(1);
    await expect.poll(() => shown(page)).toBe(false);
    expect(await greetFlag(page)).toBe("x"); // opening the chat ends the greeting for the session
  });

  test("greets a few seconds after load; its × hides it for the rest of the session", async ({ page, isMobile }) => {
    await page.goto("/");
    await ready(page);
    if (isMobile) await pastHero(page);
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    await expect(page.getByText(en.chat.avatar.text)).toBeVisible();
    await page.getByRole("button", { name: en.chat.avatar.hide }).click();
    await expect.poll(() => shown(page)).toBe(false);
    expect(await greetFlag(page)).toBe("x");
    await page.reload();
    await ready(page);
    if (isMobile) await pastHero(page);
    await page.waitForTimeout(4000);
    expect(await shown(page)).toBe(false);
  });

  test("keyboard: focus shows the bubble, Escape hides it, its × returns focus to the launcher @desktop-only", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("mh-chat:greet", "2")); // no automatic greeting here
    await page.goto("/");
    await ready(page);
    const focused = () => page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.activeElement?.className ?? "");
    await page.locator("body").focus();
    await page.keyboard.press("Shift+Tab"); // the launcher is the last tab stop
    await expect.poll(focused).toMatch(/\bav\b/);
    await expect.poll(() => shown(page)).toBe(true);
    await page.keyboard.press("Escape"); // WCAG 1.4.13: dismissible without moving focus
    await expect.poll(() => shown(page)).toBe(false);
    expect(await focused()).toMatch(/\bav\b/);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect.poll(() => shown(page)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await focused()).toBe("bx");
    await page.keyboard.press("Enter");
    await expect.poll(() => shown(page)).toBe(false);
    expect(await focused()).toMatch(/\bav\b/);
    expect(await greetFlag(page)).toBe("x");
  });

  test("reduced motion: a still avatar and a still bubble", async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await ready(page);
    if (isMobile) await pastHero(page);
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    if (!isMobile) await launcher(page, en).hover();
    await page.waitForTimeout(300);
    expect(await running(page)).toEqual([]);
    const words = await page.evaluate(() => [...document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelectorAll(".w")].map((w) => getComputedStyle(w).opacity));
    expect(new Set(words)).toEqual(new Set(["1"]));
  });

  test("moves on first appearance (float, the mouth talking as the bubble writes), then rests; hover waves again @desktop-only", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    const first = await running(page);
    expect(first).toContain("mhfl");
    expect(first).toContain("mhtk");
    // WCAG 2.2.2: every automatic burst is over within 5 s (the next one, a single wave, comes 13 s after the first).
    await page.waitForTimeout(5500);
    expect(await running(page)).toEqual([]);
    await launcher(page, en).hover();
    await expect.poll(() => running(page)).toContain("mhwv");
    expect(await running(page)).toContain("mhfl");
  });

  test("RTL: bottom-left, mirrored, the bubble on the page side", async ({ page, isMobile }) => {
    await page.goto("/ar/");
    await ready(page);
    if (isMobile) await pastHero(page);
    const box = (await launcher(page, ar).boundingBox())!;
    expect(box.x).toBeLessThan(40);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".ava svg")!).transform)).toBe("matrix(-1, 0, 0, 1, 0, 0)");
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    const bub = await page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".bub")!.getBoundingClientRect().toJSON() as DOMRect);
    expect(bub.left).toBeGreaterThanOrEqual(0);
    expect(bub.left).toBeLessThan(box.x + box.width);
    expect(bub.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test("the bubble steps aside from [data-chat-avoid] (contact Send, a case study's ask button) @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [path, sel] of [["/", "#contact [data-submit]"], ["/work/arabsstock-assistant/", ".toc-rail [data-open-chat]"], ["/ar/work/arabsstock-assistant/", ".toc-rail [data-open-chat]"]] as const) {
      await page.goto(path);
      await ready(page);
      // Put the marked element where the bubble sits (above the launcher).
      await page.evaluate((s) => {
        const bub = document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".bub")!.getBoundingClientRect();
        const el = document.querySelector(s)!.getBoundingClientRect();
        scrollBy(0, el.top - (bub.top + 10));
      }, sel);
      await expect(host(page)).toHaveAttribute("data-hush", "");
      await expect.poll(() => shown(page)).toBe(false);
      await page.evaluate(() => scrollTo(0, 0));
      await expect(host(page)).not.toHaveAttribute("data-hush", "");
    }
  });

  test("phones: no greeting while the launcher waits for the hero to scroll past", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones only");
    await page.goto("/");
    await ready(page);
    await expect(host(page)).toHaveAttribute("data-dodge", "");
    await page.waitForTimeout(4500);
    expect(await shown(page)).toBe(false);
    expect(await greetFlag(page)).toBeNull(); // nothing was shown, so nothing was counted
    await pastHero(page);
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
  });

  test("the panel header's avatar talks while an answer streams, then stops @desktop-only", async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes("/api/chat")) return real(input, init);
        const enc = new TextEncoder();
        const send = (c: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            send(c, "meta", { id: "t1", lang: "en" });
            send(c, "token", { t: "Hatem leads an AI team at Globant" });
            setTimeout(() => {
              send(c, "token", { t: "." });
              send(c, "done", { finish: "stop", usage: { input: 1, output: 1, thoughts: 0, cached: 0 }, ms: { first: 1, total: 2 }, model: "mock" });
              c.close();
            }, 2500);
          },
        });
        return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
      };
    });
    await page.goto("/");
    await ready(page);
    await launcher(page, en).click();
    await page.locator("[data-mh-chat] textarea").fill("What does he do?");
    await page.locator("[data-mh-chat] textarea").press("Enter");
    await expect(page.locator("[data-mh-chat] .cursor")).toBeVisible();
    await expect.poll(() => running(page)).toContain("mhtk");
    await expect(page.locator("[data-mh-chat] .cursor")).toHaveCount(0, { timeout: 8000 });
    await expect.poll(() => running(page)).not.toContain("mhtk");
  });

  test("forced colors: the launcher keeps an edge and the drawing keeps its colours @desktop-only", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await ready(page);
    const btn = launcher(page, en);
    expect(await btn.evaluate((b) => getComputedStyle(b).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(await btn.locator("svg.mh-av").evaluate((s) => getComputedStyle(s).forcedColorAdjust)).toBe("none");
  });
});

test.describe("avatar launcher: axe with the bubble showing @desktop-only", () => {
  for (const [w, h] of [[1440, 900], [390, 844], [320, 700]] as const)
    for (const [path, lang] of [["/", "en"], ["/ar/", "ar"]] as const)
      for (const theme of ["light", "dark"] as const)
        test(`${lang} ${theme} ${w}px`, async ({ page }) => {
          await page.setViewportSize({ width: w, height: h });
          await page.emulateMedia({ reducedMotion: "reduce" }); // final colours, no mid-animation frames
          await useTheme(page, theme);
          await page.goto(path);
          await ready(page);
          if (w < 640) await pastHero(page);
          await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
          const { violations } = await new AxeBuilder({ page })
            .include("[data-mh-chat]")
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
            .analyze();
          expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
        });
});
