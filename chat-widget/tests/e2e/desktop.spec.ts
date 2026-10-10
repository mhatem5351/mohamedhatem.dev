import { expect, test, type Page } from "@playwright/test";
import { answer, ask, bubble, input, log, mock, setup, shadowFocus } from "./helpers";

/**
 * The non-modal desktop panel on a page shaped like mohamedhatem.dev (tests/fixtures/site.html: 64 px sticky header,
 * contact form in the right column), at the laptop size from the audit.
 */
test.use({ viewport: { width: 1440, height: 807 } });
test.beforeEach(async ({ page }) => setup(page));

const SITE = "/chat-widget/tests/fixtures/site.html";
const panel = (page: Page) => page.locator("#mhc-panel");
const panelTop = (page: Page) => panel(page).evaluate((el) => Math.round(el.getBoundingClientRect().top));
const pageFocus = (page: Page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName.toLowerCase());
const states = (page: Page) => page.evaluate(() => (window as unknown as { __chatState: boolean[] }).__chatState);

async function openSite(page: Page, path = SITE): Promise<void> {
  await page.goto(path);
  await expect(bubble(page)).toBeVisible();
}
async function openPanel(page: Page): Promise<void> {
  await bubble(page).click();
  await expect(panel(page)).toBeVisible();
  await expect.poll(() => panelTop(page)).toBeGreaterThan(0); // slide-in settled enough to measure
}
const scrollTo = (page: Page, id: string) =>
  page.evaluate((id) => document.getElementById(id)!.scrollIntoView({ block: "start", behavior: "instant" }), id);

test("the panel sits below the sticky header (header bottom + 0.75rem) and follows its height", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await expect.poll(() => panelTop(page)).toBe(64 + 12);
  expect(await page.locator("[data-mh-chat]").evaluate((el) => el.style.getPropertyValue("--mh-chat-top"))).toBe("76px");
  const box = (await panel(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(807 - 88 + 1); // still clear of the bubble

  // A taller header (measured again on resize).
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-nav]")!.style.height = "100px";
    dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => panelTop(page)).toBe(112);

  // A header that scrolls away (not fixed or sticky) isn't measured: the default 4.75rem applies.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-nav]")!.style.position = "static";
    dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => page.locator("[data-mh-chat]").evaluate((el) => el.style.getPropertyValue("--mh-chat-top"))).toBe("");
  await expect.poll(() => panelTop(page)).toBe(76);
});

test("Go to Contact closes the panel when it would cover the form, and focus moves to the section", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await mock(page, answer("Here is how to reach him.", [["open_section", { id: "contact" }]]));
  await ask(page, "How do I contact him?");
  await page.getByRole("link", { name: "Go to Contact" }).click();
  await expect(panel(page)).toBeHidden();
  await expect(bubble(page)).toHaveAttribute("aria-expanded", "false");
  expect(await pageFocus(page)).toBe("contact");
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("contact")!.getBoundingClientRect().top))).toBeLessThan(120);
  // The form is no longer under anything.
  await expect(page.locator("#email")).toBeInViewport();
  expect(await states(page)).toEqual([true, false]);
  // Closed by the jump: the next page of this tab doesn't reopen it.
  expect(await page.evaluate(() => sessionStorage.getItem("mh-chat:open"))).toBeNull();
});

test("a jump to a section the panel barely overlaps keeps it open", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await mock(page, answer("His experience:", [["open_section", { id: "experience" }]]));
  await ask(page, "Experience?");
  await page.getByRole("link", { name: "Go to Experience" }).click();
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("experience")!.getBoundingClientRect().top))).toBeLessThan(120);
  await expect(panel(page)).toBeVisible();
  expect(await shadowFocus(page)).toMatch(/^a\.jump/);
});

test("Shift+Tab out of the panel onto a control it hides closes it, and focus stays on that control", async ({ page }) => {
  await openSite(page);
  await scrollTo(page, "contact");
  await openPanel(page);
  await expect.poll(() => shadowFocus(page)).toBe("textarea");
  for (let i = 0; i < 20 && (await page.evaluate(() => document.activeElement?.hasAttribute("data-mh-chat"))); i++) await page.keyboard.press("Shift+Tab");
  expect(await pageFocus(page)).toBe("send-message"); // the last control of the page, under the panel
  await expect(panel(page)).toBeHidden();
  expect(await pageFocus(page)).toBe("send-message");
});

test("focus moved to an input the panel hides closes it; focus elsewhere on the page doesn't", async ({ page }) => {
  await openSite(page);
  await scrollTo(page, "contact");
  await openPanel(page);
  await page.locator("#mail-link").focus(); // left column: not under the panel
  await page.waitForTimeout(100);
  await expect(panel(page)).toBeVisible();
  await page.locator("#email").focus();
  await expect(panel(page)).toBeHidden();
  expect(await pageFocus(page)).toBe("email");
});

test("Escape closes the panel from the page and leaves focus there; a page dialog gets Escape first", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await page.locator("#nav-about").focus(); // top left: not under the panel
  await page.waitForTimeout(100);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  expect(await pageFocus(page)).toBe("nav-about");

  await openPanel(page);
  await page.evaluate(() => (document.getElementById("page-dialog") as HTMLDialogElement).showModal());
  await page.keyboard.press("Escape");
  await expect(page.locator("#page-dialog")).toBeHidden();
  await expect(panel(page)).toBeVisible();
  expect(await states(page)).toEqual([true, false, true]);
});

test("the open panel comes back after a reload, without taking focus or scrolling the page; closing forgets it", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await mock(page, answer("Persisted answer."));
  await ask(page, "Remember me");
  await expect(log(page)).toContainText("Persisted answer.");
  await scrollTo(page, "experience");
  const y = await page.evaluate(() => scrollY);

  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(bubble(page)).toHaveAttribute("aria-expanded", "true");
  await expect(log(page)).toContainText("Persisted answer.");
  expect(await shadowFocus(page)).toBeNull();
  expect(await pageFocus(page)).toBe("body");
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await input(page).fill("typing still works");

  await page.locator("[data-mh-chat]").getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(bubble(page)).toBeVisible();
  await page.waitForTimeout(300);
  await expect(panel(page)).toHaveCount(0); // the panel code isn't even loaded
});

test("following a link from an answer to another page keeps the panel open there", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await mock(page, answer("His CV is [here](/chat-widget/demo.html?turnstile=off)."));
  await ask(page, "CV?");
  await page.getByRole("link", { name: "here" }).click();
  await expect(page).toHaveURL(/demo\.html/);
  await expect(panel(page)).toBeVisible();
  await expect(log(page)).toContainText("His CV is here.");
  expect(await shadowFocus(page)).toBeNull();
});

test("a link to a section of another page closes the panel first, so it doesn't cover that section there", async ({ page }) => {
  await openSite(page);
  await openPanel(page);
  await mock(page, answer("Use the [contact form](/chat-widget/demo.html?turnstile=off#contact)."));
  await ask(page, "Form?");
  await page.getByRole("link", { name: "contact form" }).click();
  await expect(page).toHaveURL(/demo\.html.*#contact$/);
  await expect(bubble(page)).toHaveAttribute("aria-expanded", "false");
  await page.waitForTimeout(300);
  await expect(panel(page)).toHaveCount(0);
});
