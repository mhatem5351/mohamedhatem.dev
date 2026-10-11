/**
 * The chat launcher dressed as Hatem's avatar (src/scripts/chat-avatar.ts): its name and description, the panel,
 * the comic speech bubble (the greeting: after the first scroll, once per session, only over empty page, never on the
 * CV or the 404; × for the session, keyboard, Escape), reduced motion and the site's pause control, RTL, the steps
 * aside for [data-chat-avoid] and the hero on phones, the launcher's close state, focus back into the open panel, the
 * header avatar talking while an answer streams, and axe with the bubble showing (EN/AR, light/dark, 1440/390/320).
 *
 * Behaviour tests show the greeting on an empty stage (the page's content hidden, so any rest is a clear spot); the
 * placement tests scroll real pages and check what lies under the bubble.
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
/** The page's content hidden, so the greeting finds a clear spot at the next rest (behaviour tests). */
async function emptyStage(page: Page) {
  await page.evaluate(() => {
    const s = new CSSStyleSheet();
    s.replaceSync("main, body > footer { visibility: hidden !important; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
  });
}
/** A visitor's scroll (the greeting waits for the first one); on phones, past the hero, where the launcher comes in. */
async function scrollOnce(page: Page, isMobile: boolean) {
  if (isMobile) await pastHero(page);
  else await page.evaluate(() => scrollBy({ top: 400, behavior: "instant" }));
}
/** The greeting on an empty stage, after a scroll and a rest. */
async function greet(page: Page, isMobile: boolean) {
  await emptyStage(page);
  await scrollOnce(page, isMobile);
  await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
}
/** Text lines, controls and pictures of the page under the showing bubble (and its balls). */
const underBubble = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector("[data-mh-chat]")!;
    const rs = [...host.shadowRoot!.querySelectorAll(".bub, .ball")].map((e) => e.getBoundingClientRect());
    const hit = (q: DOMRect) => q.width > 1 && q.height > 1 && rs.some((r) => q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom);
    const out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent?.trim() || !el || host.contains(n) || el.closest("[hidden], .sr-only, noscript") || getComputedStyle(el).visibility !== "visible") continue;
      range.selectNodeContents(n);
      if ([...range.getClientRects()].some(hit)) out.push(n.textContent.trim().slice(0, 40));
    }
    for (const el of document.querySelectorAll("a[href], button, input, textarea, select, summary, img, svg, figure"))
      if (!host.contains(el) && getComputedStyle(el).visibility === "visible" && hit(el.getBoundingClientRect())) out.push(`<${el.tagName.toLowerCase()}>`);
    return out;
  });
/** After a scroll and a rest on an empty stage, the greeting doesn't come (used up, dismissed, or a quiet page). */
async function greetAgainNever(page: Page, isMobile: boolean) {
  await emptyStage(page);
  await scrollOnce(page, isMobile);
  await page.evaluate(() => scrollBy({ top: 200, behavior: "instant" }));
  await page.waitForTimeout(3500);
  expect(await shown(page)).toBe(false);
}
/** Scrolls on like a reader (a screen at a time, with a rest) until the greeting shows; false at the end of the page. */
async function readUntilGreeted(page: Page) {
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => scrollBy({ top: Math.round(innerHeight * 0.55), behavior: "instant" }));
    await page.waitForTimeout(1100);
    if (await shown(page)) return true;
    if (await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2)) return false;
  }
  return false;
}
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
      // The default disc: lapis night in the gold rim.
      expect(await btn.locator(".av-disc").evaluate((c) => getComputedStyle(c).fill)).toBe("rgb(19, 29, 54)");
      expect(await btn.locator(".av-rim").evaluate((c) => getComputedStyle(c).stroke)).toBe("rgb(228, 173, 75)");
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

  test("waits for the visitor's first scroll, then greets once per session for about 5 s", async ({ page, isMobile }) => {
    await page.goto("/");
    await ready(page);
    await emptyStage(page);
    // The first screen keeps one motion of its own: no greeting before a scroll, however long the visitor reads.
    await page.waitForTimeout(isMobile ? 3000 : 5000);
    expect(await shown(page)).toBe(false);
    expect(await greetFlag(page)).toBeNull();
    await scrollOnce(page, isMobile);
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    expect(await greetFlag(page)).toBe("1");
    const t0 = Date.now();
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(false);
    expect(Date.now() - t0).toBeLessThan(5800);
    // Once per session: the next page doesn't greet again.
    await page.reload();
    await ready(page);
    await greetAgainNever(page, isMobile);
  });

  test("its × hides the greeting for the rest of the session", async ({ page, isMobile }) => {
    await page.goto("/");
    await ready(page);
    await greet(page, isMobile);
    await expect(page.locator("[data-mh-chat] .bub")).toContainText(en.chat.avatar.text);
    await page.getByRole("button", { name: en.chat.avatar.hide }).click();
    await expect.poll(() => shown(page)).toBe(false);
    expect(await greetFlag(page)).toBe("x");
    await page.reload();
    await ready(page);
    await greetAgainNever(page, isMobile);
  });

  test("a scroll while it shows ends the greeting", async ({ page, isMobile }) => {
    await page.goto("/");
    await ready(page);
    await greet(page, isMobile);
    await page.waitForTimeout(1200);
    await page.evaluate(() => scrollBy({ top: 300, behavior: "instant" }));
    await expect.poll(() => shown(page)).toBe(false);
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

  for (const [how, still] of [
    ["reduced motion", (page: Page) => page.emulateMedia({ reducedMotion: "reduce" })],
    ["the site's pause control", (page: Page) => page.addInitScript(() => localStorage.setItem("hero-graph:paused", "1"))],
  ] as const)
    test(`${how}: a still avatar and a still bubble`, async ({ page, isMobile }) => {
      await still(page);
      await page.goto("/");
      await ready(page);
      await greet(page, isMobile);
      if (!isMobile) await launcher(page, en).hover();
      await page.waitForTimeout(300);
      expect(await running(page)).toEqual([]);
      const words = await page.evaluate(() => [...document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelectorAll(".w")].map((w) => getComputedStyle(w).opacity));
      expect(new Set(words)).toEqual(new Set(["1"]));
    });

  test("pausing from the page stops the avatar at once, and playing lets it move again on hover @desktop-only", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await greet(page, false);
    expect(await running(page)).toContain("mhfl");
    await page.locator("[data-motion-toggle]").first().evaluate((b) => (b as HTMLElement).click());
    await expect.poll(() => running(page)).toEqual([]);
    await launcher(page, en).hover();
    await page.waitForTimeout(400);
    expect(await running(page)).toEqual([]);
    await page.mouse.move(10, 10);
    await page.locator("[data-motion-toggle]").first().evaluate((b) => (b as HTMLElement).click());
    await page.waitForTimeout(1700);
    await launcher(page, en).hover();
    await expect.poll(() => running(page)).toContain("mhwv");
  });

  test("the first screen keeps one motion: a quiet fade-in, then nothing until the visitor scrolls; the greeting moves and rests; hover waves @desktop-only", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await emptyStage(page);
    await page.waitForTimeout(1500);
    expect(await running(page)).toEqual([]);
    await scrollOnce(page, false);
    await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    const first = await running(page);
    expect(first).toContain("mhfl");
    expect(first).toContain("mhtk");
    // WCAG 2.2.2: the burst is over within 5 s, and nothing more moves on its own.
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
    if (isMobile) await emptyStage(page);
    else await greet(page, false);
    if (isMobile) {
      await page.evaluate(() => scrollBy({ top: 200, behavior: "instant" }));
      await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
    }
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
    await emptyStage(page);
    await expect(host(page)).toHaveAttribute("data-dodge", "");
    await page.evaluate(() => scrollBy({ top: 40, behavior: "instant" }));
    await page.waitForTimeout(3000);
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
          await launcher(page, lang === "en" ? en : ar).hover(); // the bubble on demand
          await expect.poll(() => shown(page), { timeout: 8000 }).toBe(true);
          const { violations } = await new AxeBuilder({ page })
            .include("[data-mh-chat]")
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
            .analyze();
          expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
          // Best practice: the bubble's words are a visual teaser (aria-hidden), never content outside a landmark.
          const region = await new AxeBuilder({ page }).withRules(["region"]).analyze();
          expect(region.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" >> "))).filter((t) => t.includes("mh"))).toEqual([]);
        });
});

test.describe("the greeting lands only on empty page (audit L-04) @desktop-only", () => {
  for (const [path, w, h] of [
    ["/", 1440, 900],
    ["/ar/", 1440, 900],
    ["/", 1024, 768],
    ["/work/arabsstock-assistant/", 1440, 900],
    ["/privacy/", 1024, 768],
  ] as const)
    test(`${path} at ${w} × ${h}: it waits for a clear spot and never covers text, a control or a picture`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(path);
      await ready(page);
      expect(await readUntilGreeted(page), "a clear spot somewhere on the page").toBe(true);
      expect(await underBubble(page)).toEqual([]);
    });
});

test.describe("quiet pages: no greeting on the CV or the 404 (audit HM-12, L-05)", () => {
  for (const path of ["/cv/", "/ar/cv/", "/does-not-exist/", "/ar/does-not-exist/"])
    test(`${path}`, async ({ page, isMobile }) => {
      await page.goto(path);
      await ready(page);
      await emptyStage(page);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => scrollBy({ top: 150, behavior: "instant" }));
        await page.waitForTimeout(isMobile ? 2200 : 1000);
      }
      expect(await shown(page)).toBe(false);
      expect(await greetFlag(page)).toBeNull();
    });

  test("the 404 keeps the launcher out of its corner; its own Ask button opens the chat, and the launcher is there while it is open", async ({ page, isMobile }) => {
    await page.goto("/does-not-exist/");
    await ready(page);
    await expect(host(page)).toHaveAttribute("data-dodge", "");
    await page.locator(".nf__actions [data-open-chat]").click();
    await expect(page.locator("[data-mh-chat]").getByRole("dialog")).toBeVisible();
    if (!isMobile) await expect(host(page)).not.toHaveAttribute("data-dodge", "");
  });

  test("tablet: the launcher steps aside from the CV's last links (the other language's PDF)", async ({ page, isMobile }) => {
    test.skip(isMobile, "a tablet viewport on the desktop project");
    await page.setViewportSize({ width: 768, height: 1024 });
    for (const path of ["/cv/", "/ar/cv/"]) {
      await page.goto(path);
      await ready(page);
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(600);
      const covered = await page.evaluate(() => {
        const h = document.querySelector<HTMLElement>("[data-mh-chat]")!;
        if (h.matches("[data-dodge],[data-aside]")) return [];
        const b = h.shadowRoot!.querySelector("button")!.getBoundingClientRect();
        return [...document.querySelectorAll(".cv-after a")]
          .filter((a) => {
            const r = a.getBoundingClientRect();
            return r.width > 0 && r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
          })
          .map((a) => a.textContent);
      });
      expect(covered, path).toEqual([]);
    }
  });
});

test.describe("the launcher as the open panel's close button (audit M-01) @desktop-only", () => {
  for (const theme of ["dark", "light"] as const)
    test(`${theme}: its × is drawn in ivory on the lapis disc, laid out as before`, async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/");
      await ready(page);
      await page.locator(".nav__ask").click();
      await expect(page.locator("[data-mh-chat]").getByRole("dialog")).toBeVisible();
      const b = launcher(page, en);
      await expect(b).toHaveAttribute("aria-expanded", "true");
      expect(await b.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).display, getComputedStyle(el).backgroundColor])).toEqual([
        "rgb(247, 246, 243)",
        "flex",
        "rgb(19, 29, 54)",
      ]);
      expect(await b.locator("svg.x").evaluate((x) => getComputedStyle(x).display)).toBe("block");
    });
});

test.describe("back into the open panel from the page (audit A11Y-01) @desktop-only", () => {
  test('the header\'s Ask button and "/" move focus to the composer of the panel that is already open', async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const ask = page.locator(".nav__ask");
    const inComposer = () => page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.activeElement?.tagName ?? "");
    await ask.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-mh-chat]").getByRole("dialog")).toBeVisible();
    await expect.poll(inComposer).toBe("TEXTAREA");
    await expect(ask).toHaveAttribute("aria-expanded", "true");
    // The panel is non-modal: the keyboard user moves on into the page, then asks again.
    await ask.focus();
    expect(await inComposer()).toBe("");
    await page.keyboard.press("Enter");
    await expect.poll(inComposer).toBe("TEXTAREA");
    await page.locator(".skip-link").focus();
    await page.keyboard.press("/");
    await expect.poll(inComposer).toBe("TEXTAREA");
    await expect(page.locator("[data-mh-chat]").getByRole("dialog")).toBeVisible();
    // Closed, the page's openers say so.
    await page.keyboard.press("Escape");
    await expect(ask).toHaveAttribute("aria-expanded", "false");
  });
});
