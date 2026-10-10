/**
 * The assistant as a phone-native sheet (mobile audit, Phases 1–2: CHAT-01/02/03/05/06/07/08/09/10/11/12/13/14 and
 * the chat's touch feedback). Behaviours and measurements, not pixels, so a new palette or copy can't break them.
 *
 * Runs on the phone projects (Pixel 7: Chromium; iPhone 15: WebKit), with an iPhone SE (375 × 667, WebKit) group,
 * in English and Arabic (RTL). A few desktop counterparts run on chromium-desktop. /api/chat is mocked in every test
 * (fixtures.ts answers 503 unless a test routes it), and the on-screen keyboard is simulated with a visualViewport
 * stub: Playwright has no virtual keyboard, so a real-device check of the keyboard is still worth doing.
 */
import type { CDPSession, Page } from "@playwright/test";
import { ar } from "@content/i18n/ar.ts";
import { en } from "@content/i18n/en.ts";
import { expect, test, useTheme } from "./fixtures";

type Lang = "en" | "ar";
const PAGES: [path: string, lang: Lang][] = [["/", "en"], ["/ar/", "ar"]];
const copy = { en, ar };
/** The widget's own strings (chat-widget/src/i18n.ts) that the content doesn't override. */
const UI = { en: { close: "Close", undo: "Undo", cleared: "Conversation cleared." }, ar: { close: "إغلاق", undo: "تراجع", cleared: "تم مسح المحادثة." } };

const host = (page: Page) => page.locator("[data-mh-chat]");
const sheet = (page: Page) => host(page).getByRole("dialog");
const inShadow = (page: Page, sel: string) => host(page).locator(sel);
/** The focused element inside the widget, as its class name ("" when focus is outside it). */
const shadowFocus = (page: Page) => page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.activeElement?.className ?? "");
const historyState = (page: Page) => page.evaluate(() => ({ length: history.length, ours: !!(history.state as { mhChat?: number } | null)?.mhChat }));

/** One SSE answer in the Worker's protocol (worker/src/chat/protocol.ts). */
function sse(text: string, tools: [string, unknown][] = []): string {
  const ev = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;
  let out = ev("meta", { id: "m1", lang: "en", sessionExp: Date.now() + 30 * 60_000 });
  for (const t of text.match(/[\s\S]{1,40}/g) ?? []) out += ev("token", { t });
  for (const [name, args] of tools) out += ev("tool", { name, args });
  return out + ev("done", { finish: "stop", usage: { input: 1, output: 1, thoughts: 0, cached: 0 }, ms: { first: 1, total: 2 }, model: "mock" });
}
async function answerWith(page: Page, text: string, tools: [string, unknown][] = []) {
  await page.route("**/api/chat", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse(text, tools) }));
}
const LONG =
  "Hatem is an AI Team Lead at Globant. He leads the AI engineering of an agentic assistant for a national tourism authority, built with LangGraph, retrieval and human approval steps.\n\n- Built a 14-agent assistant for ArabsStock, in Arabic and English.\n- Serves open models with vLLM.\n- Ships evaluation suites with every agent.\n\nHe is open to senior AI engineering and team-lead roles, remote or relocation.";

/** The sheet has finished sliding in (or out). */
async function settled(page: Page) {
  await page.waitForFunction(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".pn")!.getAnimations().length === 0);
}
/**
 * A tap (phones) or click at the element's centre, without Playwright's scroll-into-view: for a sticky header button
 * it scrolls the page, which would hide what these tests check (the scroll position kept across open and close).
 */
async function press(page: Page, sel: string) {
  const b = (await page.locator(sel).boundingBox())!;
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  if (test.info().project.use.isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function openFromHeader(page: Page) {
  await press(page, ".nav__ask");
  await expect(sheet(page)).toBeVisible();
  await settled(page);
}
/** On phones the launcher waits until the hero's ask bar has scrolled past, and steps aside while the page scrolls. */
async function pastHero(page: Page) {
  await page.locator("[data-hero-ask]").evaluate((el) => scrollBy(0, el.getBoundingClientRect().bottom + 40));
  await expect(host(page)).not.toHaveAttribute("data-dodge", "");
  await expect(host(page)).not.toHaveAttribute("data-aside", "", { timeout: 4000 });
}
async function ready(page: Page) {
  await expect(host(page)).toHaveAttribute("data-art", "on", { timeout: 10_000 });
}

/** A vertical touch drag on the sheet's header (on its title, not a button), `dy` px over `ms`. */
async function dragHeader(page: Page, browserName: string, dy: number, { ms = 320, hold }: { ms?: number; hold?: (at: number) => Promise<void> } = {}) {
  const box = (await inShadow(page, ".hx").boundingBox())!;
  const x = box.x + 8;
  const y = box.y + box.height / 2;
  const steps = 8;
  if (browserName === "chromium") {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", yy?: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: yy === undefined ? [] : [{ x, y: yy }] });
    await touch("touchStart", y);
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", y + (dy * i) / steps);
      if (i === steps / 2) await hold?.(dy / 2);
      await page.waitForTimeout(ms / steps);
    }
    await touch("touchEnd");
    await cdp.detach();
    return;
  }
  // WebKit (no touch-move input in Playwright): the pointer events a touch drag produces.
  const fire = (type: string, yy: number) =>
    page.evaluate(
      ([type, x, yy]) => {
        const el = document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".hx")!;
        el.dispatchEvent(new PointerEvent(type as string, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x as number, clientY: yy as number, bubbles: true, composed: true }));
      },
      [type, x, yy] as const,
    );
  await fire("pointerdown", y);
  for (let i = 1; i <= steps; i++) {
    await fire("pointermove", y + (dy * i) / steps);
    if (i === steps / 2) await hold?.(dy / 2);
    await page.waitForTimeout(ms / steps);
  }
  await fire("pointerup", y + dy);
}

/**
 * The on-screen keyboard, simulated: window.visualViewport is replaced by a stand-in whose height shrinks by `px`
 * (and, with `pan`, whose top moves down by `px`, as iOS Safari pans the page to the focused field). Call
 * window.__keyboard(px, pan) in the page; 0 closes it.
 */
async function stubKeyboard(page: Page) {
  await page.addInitScript(() => {
    const real = window.visualViewport;
    if (!real) return;
    const fake = new EventTarget();
    let kb = 0;
    let pan = false;
    for (const k of ["width", "offsetLeft", "pageLeft", "pageTop", "scale"] as const) Object.defineProperty(fake, k, { get: () => real[k] });
    Object.defineProperty(fake, "height", { get: () => real.height - kb });
    Object.defineProperty(fake, "offsetTop", { get: () => (pan ? kb : 0) });
    real.addEventListener("resize", () => fake.dispatchEvent(new Event("resize")));
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
    (window as unknown as { __keyboard(px: number, panned: boolean): void }).__keyboard = (px, panned) => {
      kb = px;
      pan = panned;
      fake.dispatchEvent(new Event("resize"));
      fake.dispatchEvent(new Event("scroll"));
    };
  });
}
const keyboard = (page: Page, px: number, pan: boolean) =>
  page.evaluate(([px, pan]) => (window as unknown as { __keyboard(px: number, panned: boolean): void }).__keyboard(px, pan), [px, pan] as const);
/** Top and bottom of the sheet's parts, in layout-viewport px. */
const parts = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector("[data-mh-chat]")!.shadowRoot!;
    const box = (s: string) => {
      const b = r.querySelector(s)!.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
    };
    return { sheet: box(".pn"), header: box(".hd"), close: box(".hd .ib:last-of-type"), composer: box(".cp"), log: box(".log") };
  });

test.describe("the chat sheet on phones", () => {
  test.beforeEach(async ({ isMobile }) => test.skip(!isMobile, "phones"));

  test("the viewport resizes for the keyboard on Android (interactive-widget), never blocking zoom", async ({ page }) => {
    await page.goto("/");
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).toContain("interactive-widget=resizes-content");
    expect(content).not.toMatch(/maximum-scale|user-scalable/);
  });

  for (const [path, lang] of PAGES)
    test(`CHAT-01 ${lang}: with the keyboard up, the header, Close and the composer stay in the visible area`, async ({ page }) => {
      await stubKeyboard(page);
      await page.goto(path);
      await answerWith(page, LONG, [["show_contact_card", { reason: "general" }]]);
      await openFromHeader(page);
      await inShadow(page, "textarea").fill(lang === "ar" ? "ما خبرته؟" : "What has he built?");
      await inShadow(page, "textarea").press("Enter");
      await expect(inShadow(page, ".card")).toBeVisible();
      // The visitor reads to the end, then taps the composer.
      await inShadow(page, ".log").evaluate((l) => (l.scrollTop = l.scrollHeight));
      await inShadow(page, "textarea").focus();
      const H = page.viewportSize()!.height;
      const KB = Math.round(H * 0.45); // ≈ 336 px on an iPhone 15, 290 on a 360 px Android

      // iOS Safari: the visual viewport shrinks and pans down by the keyboard's height.
      await keyboard(page, KB, true);
      await expect(host(page)).toHaveAttribute("data-kb", "");
      let p = await parts(page);
      const visible = { top: KB, bottom: H };
      for (const part of [p.sheet, p.header, p.close, p.composer]) {
        expect(part.top).toBeGreaterThanOrEqual(visible.top - 1);
        expect(part.bottom).toBeLessThanOrEqual(visible.bottom + 1);
      }
      expect(p.log.bottom - p.log.top).toBeGreaterThan(60);
      // The log stayed on its last lines.
      expect(await inShadow(page, ".log").evaluate((l) => l.scrollHeight - l.scrollTop - l.clientHeight)).toBeLessThan(4);
      // No home-indicator padding under the composer while the keyboard is up.
      expect(await inShadow(page, ".pn").evaluate((el) => getComputedStyle(el).paddingBottom)).toBe("0px");

      // Chrome on Android without a pan: the layout viewport itself shrinks (resizes-content) or the visual one does.
      await keyboard(page, KB, false);
      p = await parts(page);
      for (const part of [p.header, p.close, p.composer]) {
        expect(part.top).toBeGreaterThanOrEqual(-1);
        expect(part.bottom).toBeLessThanOrEqual(H - KB + 1);
      }

      // Keyboard down: full height again, nothing left over.
      await keyboard(page, 0, false);
      await expect(host(page)).not.toHaveAttribute("data-kb", "");
      p = await parts(page);
      expect(p.sheet).toEqual({ top: 0, bottom: H });
    });

  for (const [path, lang] of PAGES)
    test(`CHAT-02 ${lang}: opening doesn't raise the keyboard (no focused textarea) and the 4 suggestions stay in view`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      // From the header's Ask AI.
      await openFromHeader(page);
      expect(await shadowFocus(page)).toBe("log");
      await expect(inShadow(page, ".chip")).toHaveCount(4);
      for (const chip of await inShadow(page, ".chip").all()) await expect(chip).toBeInViewport({ ratio: 1 });
      await inShadow(page, `[aria-label="${UI[lang].close}"]`).click();
      await expect(sheet(page)).toBeHidden();

      // From the launcher.
      await pastHero(page);
      await page.getByRole("button", { name: copy[lang].chat.avatar.name, exact: true }).click();
      await expect(sheet(page)).toBeVisible();
      expect(await shadowFocus(page)).toBe("log");
      await inShadow(page, `[aria-label="${UI[lang].close}"]`).click();

      // From the hero's ask bar, with a question: the answer streams in without a keyboard over it.
      await page.evaluate(() => scrollTo(0, 0));
      await answerWith(page, LONG);
      await page.locator("#hero-ask").fill(lang === "ar" ? "ما خبرته؟" : "What has he built?");
      await page.locator("#hero-ask").press("Enter");
      await expect(sheet(page)).toBeVisible();
      await expect(inShadow(page, ".msg.a .md").last()).toContainText("Globant");
      expect(await shadowFocus(page)).not.toBe("");
      expect(await shadowFocus(page)).not.toContain("textarea");
      expect(await page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.activeElement?.tagName)).not.toBe("TEXTAREA");
    });

  for (const [path, lang] of PAGES)
    test(`CHAT-03 ${lang}: Back closes the sheet, keeps the URL and the scroll position; a second Back leaves the page`, async ({ page }) => {
      const other = lang === "ar" ? "/ar/privacy/" : "/privacy/";
      await page.goto(other);
      await page.goto(path);
      await ready(page);
      await page.evaluate(() => scrollTo(0, 900));
      await page.waitForTimeout(200);
      const y = await page.evaluate(() => Math.round(scrollY));
      await openFromHeader(page);
      expect((await historyState(page)).ours).toBe(true);

      await page.goBack();
      await expect(sheet(page)).toBeHidden();
      expect(new URL(page.url()).pathname).toBe(path);
      expect(new URL(page.url()).hash).toBe("");
      expect(await page.evaluate(() => Math.round(scrollY))).toBe(y);
      expect(await page.evaluate(() => (document.querySelector("main") as HTMLElement).inert)).toBe(false);

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${other}$`));
    });

  test("CHAT-03: closing with × takes the history entry back, so repeated open/close never grows history", async ({ page }) => {
    await page.goto("/privacy/");
    await page.goto("/");
    await ready(page);
    const start = (await historyState(page)).length;
    for (let i = 0; i < 4; i++) {
      await openFromHeader(page);
      await inShadow(page, `[aria-label="${UI.en.close}"]`).click();
      await expect(sheet(page)).toBeHidden();
      await expect.poll(async () => (await historyState(page)).ours).toBe(false);
    }
    expect((await historyState(page)).length).toBeLessThanOrEqual(start + 1);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy\/$/);
  });

  test("CHAT-03: a section link in an answer closes the sheet first, then scrolls there; Back then leaves the page", async ({ page }) => {
    await page.goto("/privacy/");
    await page.goto("/");
    await ready(page);
    await answerWith(page, "His experience is below.", [["open_section", { id: "experience" }]]);
    await openFromHeader(page);
    await inShadow(page, "textarea").fill("Experience?");
    await inShadow(page, "textarea").press("Enter");
    await inShadow(page, ".jump").click();
    await expect(sheet(page)).toBeHidden();
    await expect(page).toHaveURL(/\/#experience$/);
    await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("experience")!.getBoundingClientRect().top)), { timeout: 5000 }).toBeLessThan(200);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("experience");
    expect((await historyState(page)).ours).toBe(false);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy\/$/);
  });

  test("CHAT-03: the language switch still works after the sheet was open, and Back returns without a sheet", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await openFromHeader(page);
    await inShadow(page, `[aria-label="${UI.en.close}"]`).click();
    await expect(sheet(page)).toBeHidden();
    await page.locator("[data-menu-button]").click();
    await page.locator(".menu-sheet .lang-switch").click();
    await expect(page).toHaveURL(/\/ar\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(sheet(page)).toBeHidden();
  });

  test("CHAT-07: focus returns to what opened the chat (header Ask AI, the hero's ask bar), and the launcher stays aside over the hero", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await openFromHeader(page);
    await inShadow(page, `[aria-label="${UI.en.close}"]`).click();
    await expect(sheet(page)).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.classList.contains("nav__ask"))).toBe(true);

    // The hero's ask bar: focus goes back to the bar (its send button, so the keyboard doesn't pop up again).
    await answerWith(page, "He leads an AI team at Globant.");
    await page.locator("#hero-ask").fill("What does he do?");
    await page.locator("#hero-ask").press("Enter");
    await expect(sheet(page)).toBeVisible();
    await expect(inShadow(page, ".msg.a .md").last()).toContainText("Globant");
    await page.goBack(); // Back, this time
    await expect(sheet(page)).toBeHidden();
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-hero-ask]"))).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
    await expect(host(page)).toHaveAttribute("data-dodge", "");
    expect(await host(page).evaluate((h) => getComputedStyle(h).visibility)).toBe("hidden");
  });

  test("CHAT-08: every target in the open sheet is at least 44 × 44 px (inline answer links aside)", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await answerWith(page, "He is open to new roles. See [his CV](/cv/).", [
      ["show_contact_card", { reason: "general" }],
      ["open_section", { id: "experience" }],
      ["suggest_followups", { questions: ["What did he build at ArabsStock?", "How does he evaluate agents?"] }],
    ]);
    await openFromHeader(page);
    const small = () =>
      page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelectorAll<HTMLElement>(".pn button, .pn a[href], .pn textarea")) {
          if (el.closest(".md")) continue; // links inside an answer's text
          const r = el.getBoundingClientRect();
          if (!r.width || el.closest("[hidden]")) continue;
          let { width: w, height: h } = r;
          const hit = getComputedStyle(el, "::after"); // a larger hit area than the drawn box
          if (hit.content !== "none" && hit.position === "absolute") {
            h -= parseFloat(hit.top) + parseFloat(hit.bottom);
            w -= parseFloat(hit.left) + parseFloat(hit.right);
          }
          if (w < 43.5 || h < 43.5) out.push(`${el.className || el.tagName}: ${Math.round(w)}×${Math.round(h)}`);
        }
        return out;
      });
    expect(await small()).toEqual([]); // welcome chips, header buttons, composer
    await inShadow(page, "textarea").fill("Is he open to roles?");
    await inShadow(page, "textarea").press("Enter");
    await expect(inShadow(page, ".card")).toBeVisible();
    await expect(inShadow(page, ".chip")).toHaveCount(2);
    expect(await small()).toEqual([]); // contact card, copy buttons, jump link, follow-ups
    // An error with Retry, then New chat's Undo.
    await page.route("**/api/chat", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"internal"}' }));
    await inShadow(page, "textarea").fill("Again?");
    await inShadow(page, "textarea").press("Enter");
    await expect(inShadow(page, ".rt")).toBeVisible();
    expect(await small()).toEqual([]);
    await inShadow(page, `[aria-label="${en.chat.newChat}"]`).click();
    await expect(inShadow(page, ".ud .rt")).toBeVisible();
    expect(await small()).toEqual([]);
  });

  for (const [path, lang] of PAGES)
    test(`CHAT-09 ${lang}: a grab bar; swiping the header down 120 px closes the sheet, 30 px springs back`, async ({ page, browserName }) => {
      await page.goto(path);
      await ready(page);
      await openFromHeader(page);
      const bar = await inShadow(page, ".hd").evaluate((el) => {
        const s = getComputedStyle(el, "::before");
        return { content: s.content, w: parseFloat(s.width), h: parseFloat(s.height) };
      });
      expect(bar.content).not.toBe("none");
      expect(bar.w).toBeGreaterThanOrEqual(32);
      expect(bar.h).toBeGreaterThanOrEqual(4);

      // A short drag follows the finger, then springs back.
      let mid = "";
      await dragHeader(page, browserName, 30, { hold: async () => void (mid = await inShadow(page, ".pn").evaluate((el) => getComputedStyle(el).transform)) });
      expect(mid).toMatch(/^matrix\(1, 0, 0, 1, 0, 1[0-9](\.\d+)?\)$/);
      await settled(page);
      await expect(sheet(page)).toBeVisible();
      expect(await inShadow(page, ".pn").evaluate((el) => getComputedStyle(el).transform)).toBe("none");

      // Past 80 px: closed, and its history entry is gone.
      await dragHeader(page, browserName, 120);
      await expect(sheet(page)).toBeHidden();
      await expect.poll(async () => (await historyState(page)).ours).toBe(false);
      // It opens normally again (no leftover offset).
      await openFromHeader(page);
      expect(await inShadow(page, ".pn").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
      expect((await sheet(page).boundingBox())!.y).toBe(0);
    });

  for (const theme of ["dark", "light"] as const)
    test(`${theme} theme: the grab bar and the pressed state read against the sheet (tokens, both themes)`, async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/");
      await ready(page);
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      await openFromHeader(page);
      const c = await inShadow(page, ".hd").evaluate((el) => ({ bar: getComputedStyle(el, "::before").backgroundColor, sheet: getComputedStyle(el).backgroundColor }));
      expect(c.bar).not.toBe(c.sheet);
      expect(c.bar).not.toBe("rgba(0, 0, 0, 0)");
      const close = inShadow(page, `[aria-label="${UI.en.close}"]`);
      const box = (await close.boundingBox())!;
      const rest = await close.evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect.poll(() => close.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(rest);
      await page.mouse.up(); // closes it
      await expect(sheet(page)).toBeHidden();
    });

  test("CHAT-09: under reduced motion the sheet doesn't follow the finger and closes without animating", async ({ page, browserName }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await ready(page);
    await openFromHeader(page);
    let mid = "";
    await dragHeader(page, browserName, 120, { hold: async () => void (mid = await inShadow(page, ".pn").evaluate((el) => getComputedStyle(el).transform)) });
    expect(mid).toBe("none");
    await expect(sheet(page)).toBeHidden();
    expect(await inShadow(page, ".pn").evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
  });

  test("CHAT-10: the panel is built on idle after load, after the avatar (its header shows it)", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => !!document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".pn")), { timeout: 12_000 }).toBe(true);
    await expect(inShadow(page, ".hd .avh svg")).toHaveCount(1);
    await expect(sheet(page)).toBeHidden();
  });

  test("CHAT-10: with Save-Data nothing is prefetched; the intent to open (pointerdown) builds the panel before the tap ends", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ saveData: true, effectiveType: "4g" }) }));
    const chunks: string[] = [];
    page.on("request", (r) => /\/_astro\/panel\./.test(r.url()) && chunks.push(r.url()));
    await page.goto("/");
    await ready(page);
    await page.waitForTimeout(4500);
    expect(chunks).toEqual([]);
    expect(await page.evaluate(() => !!document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".pn"))).toBe(false);
    await page.locator(".nav__ask").dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
    await expect.poll(() => page.evaluate(() => !!document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".pn"))).toBe(true);
    await expect(sheet(page)).toBeHidden(); // built, not opened
  });

  test("CHAT-05: the launcher steps aside while a form field has focus, while it is over the contact form, and while the page scrolls down", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await pastHero(page);
    await expect.poll(() => host(page).evaluate((h) => getComputedStyle(h).visibility)).toBe("visible");
    // Reading: a scroll down hides it, a pause brings it back, so does a scroll up.
    await page.evaluate(() => scrollBy(0, 300));
    await expect(host(page)).toHaveAttribute("data-aside", "");
    await expect(host(page)).not.toHaveAttribute("data-aside", "", { timeout: 3000 });
    await page.evaluate(() => scrollBy(0, 300));
    await expect(host(page)).toHaveAttribute("data-aside", "");
    await page.evaluate(() => scrollBy(0, -120));
    await expect(host(page)).not.toHaveAttribute("data-aside", "");

    // A focused field (the keyboard is up): aside, wherever it is.
    await page.locator("#cf-name").focus();
    await expect(host(page)).toHaveAttribute("data-aside", "");
    await expect.poll(() => host(page).evaluate((h) => getComputedStyle(h).visibility)).toBe("hidden"); // after its fade
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    // Over the contact form (any of its controls, not only Send): still aside once the scroll has settled.
    await page.locator("#cf-message").evaluate((el) => scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 20));
    await page.waitForTimeout(1500);
    await expect(host(page)).toHaveAttribute("data-aside", "");
    // Back up to the experience section: back.
    await page.locator("#experience").evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
    await expect(host(page)).not.toHaveAttribute("data-aside", "", { timeout: 3000 });
  });

  test("CHAT-06: the greeting says hello once per session, hides on scroll (800 px) and after 5 s; its × is a 44 px target", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await pastHero(page);
    const shown = () =>
      page.evaluate(() => {
        const r = document.querySelector("[data-mh-chat]")!.shadowRoot!;
        return r.querySelector(".mhb")!.getAttribute("data-s") === "on" && getComputedStyle(r.querySelector(".bub")!).visibility === "visible";
      });
    await expect.poll(shown, { timeout: 8000 }).toBe(true);
    // × hit area: 8 px above its drawn 24 px circle (outside the bubble) still hits it.
    const hit = await page.evaluate(() => {
      const r = document.querySelector("[data-mh-chat]")!.shadowRoot!;
      const x = r.querySelector<HTMLElement>(".bx")!;
      const b = x.getBoundingClientRect();
      const at = r.elementFromPoint(b.left + b.width / 2, b.top - 8);
      return { size: Math.round(b.width), hits: at === x || x.contains(at) };
    });
    expect(hit.hits).toBe(true);
    expect(hit.size).toBeLessThan(30); // drawn at 24 px (25 with the bubble's tilt)
    await page.waitForTimeout(1600);
    await page.evaluate(() => scrollBy(0, 800));
    await expect.poll(shown).toBe(false);
    expect(await page.evaluate(() => sessionStorage.getItem("mh-chat:greet"))).toBe("1");

    // A new page in the same session: no second greeting on a phone.
    await page.reload();
    await ready(page);
    await pastHero(page);
    await page.waitForTimeout(4500);
    expect(await shown()).toBe(false);

    // A fresh session: the greeting leaves on its own after 5 s.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await ready(page);
    await pastHero(page);
    await expect.poll(shown, { timeout: 8000 }).toBe(true);
    const t0 = Date.now();
    await expect.poll(shown, { timeout: 7000 }).toBe(false);
    expect(Date.now() - t0).toBeLessThan(5600);
  });

  test("CHAT-12: a finished answer that overflows keeps its question and first line in view", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await answerWith(page, LONG, [["show_contact_card", { reason: "general" }], ["suggest_followups", { questions: ["What did he build?", "Is he a fit?"] }]]);
    await openFromHeader(page);
    await inShadow(page, "textarea").fill("Tell me about Hatem");
    await inShadow(page, "textarea").press("Enter");
    await expect(inShadow(page, ".chip")).toHaveCount(2);
    const view = await page.evaluate(() => {
      const r = document.querySelector("[data-mh-chat]")!.shadowRoot!;
      const log = r.querySelector(".log")!.getBoundingClientRect();
      const q = [...r.querySelectorAll(".msg.u")].at(-1)!.getBoundingClientRect();
      const a = [...r.querySelectorAll(".msg.a .md")].at(-1)!.getBoundingClientRect();
      return { logTop: log.top, logBottom: log.bottom, q: q.top, a: a.top };
    });
    expect(view.q).toBeGreaterThanOrEqual(view.logTop - 1);
    expect(view.a).toBeLessThan(view.logBottom);
  });

  test("CHAT-14: New chat offers Undo for a few seconds, which brings the conversation back", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await answerWith(page, "He leads an AI team at Globant.");
    await openFromHeader(page);
    await inShadow(page, "textarea").fill("Who is Hatem?");
    await inShadow(page, "textarea").press("Enter");
    await expect(inShadow(page, ".msg.a .md").last()).toContainText("Globant");
    await inShadow(page, `[aria-label="${en.chat.newChat}"]`).click();
    await expect(inShadow(page, ".msg.u")).toHaveCount(0);
    await expect(inShadow(page, ".ud")).toContainText(UI.en.cleared);
    await inShadow(page, ".ud").getByRole("button", { name: UI.en.undo }).click();
    await expect(inShadow(page, ".msg.u")).toHaveText("Who is Hatem?");
    await expect(inShadow(page, ".msg.a .md").last()).toContainText("Globant");
    expect(await shadowFocus(page)).toBe("log"); // still no keyboard
    // Cleared again, the offer goes away on its own.
    await inShadow(page, `[aria-label="${en.chat.newChat}"]`).click();
    await expect(inShadow(page, ".ud")).toBeVisible();
    await expect(inShadow(page, ".ud")).toHaveCount(0, { timeout: 8000 });
  });

  test("touch feedback: a pressed state while pressed, and no hover state left behind after a tap", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await openFromHeader(page);
    const newChat = inShadow(page, `[aria-label="${en.chat.newChat}"]`);
    const bg = () => newChat.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rest = await bg();
    // Pressed (:active; emulated touch doesn't set it in headless browsers, a pressed mouse button does).
    const box = (await newChat.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(bg).not.toBe(rest);
    await page.mouse.up();
    await expect.poll(bg).toBe(rest);
    // Tapped: no hover look sticks (iOS keeps :hover on the last tapped element).
    await newChat.tap();
    await expect.poll(bg).toBe(rest);
    // The chips too: tapped, then back to their resting look (no sticky :hover tint).
    await answerWith(page, "Sure.");
    const chip = inShadow(page, ".chip").first();
    const chipRest = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.route("**/api/chat", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse("Sure.", [["suggest_followups", { questions: ["And then?"] }]]) }));
    await chip.tap();
    await expect(inShadow(page, ".chip")).toHaveText(["And then?"]);
    expect(await inShadow(page, ".chip").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(chipRest);
  });
});

test.describe("CHAT-11: Turnstile follows the site's theme", () => {
  for (const theme of ["dark", "light"] as const)
    test(`${theme} site on a light OS → Turnstile ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      if (theme === "light") await useTheme(page, "light"); // dark is the default
      await page.route("https://challenges.cloudflare.com/**", (r) =>
        r.fulfill({ contentType: "text/javascript", body: "window.turnstile={render:(el,o)=>{window.__ts=o;return 'w1'},remove(){}};" }),
      );
      await page.goto("/");
      await ready(page);
      await openFromHeader(page);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __ts?: { theme?: string } }).__ts?.theme)).toBe(theme);
    });
});

test.describe("iPhone SE (375 × 667)", () => {
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
  test.beforeEach(async ({ isMobile, browserName }) => test.skip(!isMobile || browserName !== "webkit", "WebKit phone project"));

  for (const [path, lang] of PAGES)
    test(`CHAT-13 ${lang}: the contact card's three buttons share one row`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      await answerWith(page, "You can reach him here.", [["show_contact_card", { reason: "general" }]]);
      await openFromHeader(page);
      await inShadow(page, "textarea").fill("Contact?");
      await inShadow(page, "textarea").press("Enter");
      await expect(inShadow(page, ".card")).toBeVisible();
      const tops = await inShadow(page, ".acts .btn").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(tops).toHaveLength(3);
      expect(new Set(tops).size).toBe(1);
      // And nothing spills out of its button.
      expect(await inShadow(page, ".acts .btn").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
    });

  test("CHAT-05: the launcher covers interactive elements at no more than 2 steps of a home-page scroll (it was 7)", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const covering = () =>
      page.evaluate(() => {
        const h = document.querySelector<HTMLElement>("[data-mh-chat]")!;
        const b = h.shadowRoot!.querySelector("button.b")!.getBoundingClientRect();
        if (getComputedStyle(h).visibility === "hidden" || getComputedStyle(h).opacity === "0") return false;
        return [...document.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex='0']")].some((el) => {
          if (h.contains(el)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom && getComputedStyle(el).visibility !== "hidden";
        });
      });
    const vh = page.viewportSize()!.height;
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    let steps = 0;
    let covered = 0;
    for (let y = Math.round(vh * 0.5); y < H; y += Math.round(vh * 0.6)) {
      await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y);
      await page.waitForTimeout(350);
      steps++;
      if (await covering()) covered++;
    }
    expect(steps).toBeGreaterThan(20);
    expect(covered).toBeLessThanOrEqual(2);
  });

  test("CHAT-02: on a small iPhone the 4 suggestions are all in view after opening", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await openFromHeader(page);
    expect(await shadowFocus(page)).toBe("log");
    for (const chip of await inShadow(page, ".chip").all()) await expect(chip).toBeInViewport({ ratio: 1 });
  });
});

test.describe("desktop counterparts", () => {
  test.beforeEach(async ({ isMobile }) => test.skip(isMobile, "desktop"));

  test("CHAT-07: closing returns focus to the hero's input (the panel is non-modal: no history entry)", async ({ page }) => {
    await page.goto("/");
    await answerWith(page, "He leads an AI team at Globant.");
    const before = await page.evaluate(() => history.length);
    await page.locator("#hero-ask").fill("What does he do?");
    await page.locator("#hero-ask").press("Enter");
    await expect(sheet(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.activeElement?.tagName)).toBe("TEXTAREA");
    expect(await page.evaluate(() => history.length)).toBe(before);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("hero-ask");
  });

  test("CHAT-08 / A11Y-03: the desktop panel keeps its compact controls and its hover states", async ({ page }) => {
    await page.goto("/");
    await openFromHeader(page);
    const chip = inShadow(page, ".chip").first();
    expect((await chip.boundingBox())!.height).toBeLessThan(40);
    const rest = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    await chip.hover();
    await expect.poll(() => chip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(rest);
  });
});
