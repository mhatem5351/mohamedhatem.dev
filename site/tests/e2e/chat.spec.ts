import type { Page } from "@playwright/test";
import { en } from "@content/i18n/en.ts";
import { expect, test } from "./fixtures";

/** Records every window.MHChat.open() call (the widget defines MHChat when it mounts). */
async function spyOnChat(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opens: unknown[]; MHChat?: { open: (o?: unknown) => void } };
    w.__opens = [];
    let api: { open: (o?: unknown) => void } | undefined;
    Object.defineProperty(window, "MHChat", {
      configurable: true,
      get: () => api,
      set: (v: { open: (o?: unknown) => void }) => {
        const open = v.open.bind(v);
        api = { ...v, open: (o?: unknown) => (w.__opens.push(o ?? {}), open(o)) };
      },
    });
  });
}
const opens = (page: Page) => page.evaluate(() => (window as unknown as { __opens: { question?: string }[] }).__opens);
const panel = (page: Page) => page.locator("[data-mh-chat]").locator('[role="dialog"]');
/** "visible" / "hidden": the bubble as rendered (the host fades out and gets visibility: hidden when it steps aside). */
const bubbleVisibility = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector("[data-mh-chat]")!;
    const b = host.shadowRoot!.querySelector("button")!;
    return getComputedStyle(b).visibility === "hidden" || Number(getComputedStyle(host).opacity) === 0 ? "hidden" : "visible";
  });
/** True while the avatar's speech bubble (above the launcher) is showing over the element. */
const speechCovers = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const bub = document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".bub");
    if (!bub || getComputedStyle(bub).visibility !== "visible") return false;
    const r1 = bub.getBoundingClientRect();
    const r2 = document.querySelector(sel)!.getBoundingClientRect();
    return r1.left < r2.right && r1.right > r2.left && r1.top < r2.bottom && r1.bottom > r2.top;
  }, selector);
/** True when the launcher, 12 px around it, would overlap the element horizontally (it then has to step aside). */
const sideBySide = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const b = document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector("button")!.getBoundingClientRect();
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return b.left - 12 < r.right && b.right + 12 > r.left;
  }, selector);
/** True while the visible bubble overlaps the element. */
const coveredBy = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const host = document.querySelector("[data-mh-chat]")!;
    const b = host.shadowRoot!.querySelector("button")!;
    const visible = getComputedStyle(b).visibility !== "hidden" && Number(getComputedStyle(host).opacity) > 0;
    const r1 = b.getBoundingClientRect();
    const r2 = document.querySelector(sel)!.getBoundingClientRect();
    return visible && r1.left < r2.right && r1.right > r2.left && r1.top < r2.bottom && r1.bottom > r2.top;
  }, selector);

test.describe("Ask my AI", () => {
  test("the hero input opens the assistant with the typed question", async ({ page }) => {
    await spyOnChat(page);
    await page.goto("/", { waitUntil: "networkidle" });
    const input = page.locator("[data-hero-ask] input");
    await input.fill("What did he build at ArabsStock?");
    await input.press("Enter");
    await expect.poll(() => opens(page)).toContainEqual(expect.objectContaining({ question: "What did he build at ArabsStock?" }));
    await expect(panel(page)).toBeVisible();
  });

  test("buttons with data-open-chat open the assistant", async ({ page, isMobile }) => {
    await spyOnChat(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator(".nav__ask").click();
    await expect.poll(async () => (await opens(page)).length).toBeGreaterThan(0);
    await expect(panel(page)).toBeVisible();
    test.skip(isMobile, "keyboard shortcut is desktop");
  });

  test('"/" opens the assistant from anywhere outside a text field', async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcut is desktop");
    await spyOnChat(page);
    await page.goto("/work/arabsstock-assistant/", { waitUntil: "networkidle" });
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("/");
    await expect.poll(async () => (await opens(page)).length).toBeGreaterThan(0);
  });

  test("the case-study page asks about that project", async ({ page }) => {
    await spyOnChat(page);
    await page.goto("/work/arabsstock-assistant/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: en.work.page.ask }).first().click();
    await expect.poll(() => opens(page)).toContainEqual(expect.objectContaining({ question: expect.stringContaining("ArabsStock") }));
  });

  test("the page tells the panel where its sticky header ends (--mh-chat-top)", async ({ page }) => {
    await page.goto("/");
    // The value is a calc() over the header's height (components.css; site.ts writes it only for a taller header):
    // resolve it as a length.
    const { top, header } = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.height = "var(--mh-chat-top)";
      document.body.append(probe);
      const top = probe.getBoundingClientRect().height;
      probe.remove();
      return { top, header: Math.round(document.querySelector("[data-nav]")!.getBoundingClientRect().height) };
    });
    expect(top).toBe(header + 12);
  });

  test("the bubble never covers the contact form's Send button @desktop-only", async ({ page }) => {
    for (const [w, h] of [[1280, 900], [1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/", { waitUntil: "networkidle" });
      const send = page.locator("#contact [data-submit]");
      const host = page.locator("[data-mh-chat]");
      await expect(host).toHaveAttribute("data-art", "on", { timeout: 10_000 }); // the avatar launcher is in
      // Scroll so the button sits where the bubble is (bottom inline-end corner).
      await send.evaluate((el) => {
        const r = el.getBoundingClientRect();
        scrollBy(0, r.bottom - (innerHeight - 24));
      });
      const overlap = async () =>
        page.evaluate(() => {
          const b = document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector("button")!;
          const visible = getComputedStyle(b).visibility !== "hidden" && Number(getComputedStyle(document.querySelector("[data-mh-chat]")!).opacity) > 0;
          const r1 = b.getBoundingClientRect();
          const r2 = document.querySelector("#contact [data-submit]")!.getBoundingClientRect();
          const hit = r1.left < r2.right && r1.right > r2.left && r1.top < r2.bottom && r1.bottom > r2.top;
          return visible && hit;
        });
      await expect.poll(overlap).toBe(false);
      await expect.poll(() => speechCovers(page, "#contact [data-submit]")).toBe(false);
      // At 1280 the launcher sits above the button's end and steps aside; at 1440 the 64 px avatar clears it.
      if (await sideBySide(page, "#contact [data-submit]")) await expect(host).toHaveAttribute("data-dodge", "");
      // Scrolled away from the form, the bubble is back.
      await page.evaluate(() => scrollTo(0, 0));
      await expect(host).not.toHaveAttribute("data-dodge", "");
    }
  });

  test("on phones the bubble waits until the hero's ask bar has scrolled past, and the header still opens the chat", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones only");
    await page.goto("/", { waitUntil: "networkidle" });
    const host = page.locator("[data-mh-chat]");
    await expect(host).toBeAttached();
    // Over the hero: stepped aside, out of the tab order and the accessibility tree.
    await expect(host).toHaveAttribute("data-dodge", "");
    await expect.poll(() => bubbleVisibility(page)).toBe("hidden");
    await expect(page.getByRole("button", { name: /AI assistant/ }).filter({ has: page.locator("svg.g") })).toHaveCount(0);
    // Past the ask bar: back.
    await page.locator("[data-hero-ask]").evaluate((el) => scrollBy(0, el.getBoundingClientRect().bottom + 40));
    await expect(host).not.toHaveAttribute("data-dodge", "");
    await expect.poll(() => bubbleVisibility(page)).toBe("visible");
    // Back to the top, the header's Ask AI still opens the chat, focused inside the sheet (on the conversation, so
    // the keyboard stays down: mobile-chat.spec.ts).
    await page.evaluate(() => scrollTo(0, 0));
    await expect(host).toHaveAttribute("data-dodge", "");
    await page.locator(".nav__ask").click();
    await expect(panel(page)).toBeVisible();
    await expect(host).not.toHaveAttribute("data-dodge", "");
    await expect.poll(() => page.evaluate(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.activeElement?.className)).toBe("log");
  });

  test("the bubble never covers a case study's 'Ask my AI about this project' button @desktop-only", async ({ page }) => {
    for (const path of ["/work/arabsstock-assistant/", "/ar/work/arabsstock-assistant/"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path, { waitUntil: "networkidle" });
      const host = page.locator("[data-mh-chat]");
      await expect(host).toHaveAttribute("data-art", "on", { timeout: 10_000 }); // the avatar launcher is in
      // Scroll so the rail's ask button sits where the bubble is (the audit's 1440 × 900 view).
      await page.locator(".toc-rail [data-open-chat]").evaluate((el) => scrollBy(0, el.getBoundingClientRect().bottom - (innerHeight - 14)));
      await expect.poll(() => coveredBy(page, ".toc-rail [data-open-chat]")).toBe(false);
      await expect.poll(() => speechCovers(page, ".toc-rail [data-open-chat]")).toBe(false);
      if (await sideBySide(page, ".toc-rail [data-open-chat]")) await expect(host).toHaveAttribute("data-dodge", "");
      await page.evaluate(() => scrollTo(0, 0));
      await expect(host).not.toHaveAttribute("data-dodge", "");
    }
  });

  test("on phones the bubble never covers the hero ask bar's send button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones only");
    for (const path of ["/", "/ar/"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("[data-mh-chat]")).toBeAttached();
      await expect.poll(() => coveredBy(page, "[data-hero-ask] button")).toBe(false);
    }
  });

  test("without JavaScript a contact fallback is offered", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("details.chat-noscript")).toBeAttached();
    await ctx.close();
  });
});
