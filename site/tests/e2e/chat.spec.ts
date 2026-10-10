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
    await expect.poll(() => opens(page)).toContainEqual(expect.objectContaining({ question: expect.stringContaining("Arabsstock") }));
  });

  test("without JavaScript a contact fallback is offered", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("details.chat-noscript")).toBeAttached();
    await ctx.close();
  });
});
