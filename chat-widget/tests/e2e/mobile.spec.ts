import { expect, test } from "@playwright/test";
import { answer, ask, bubble, dialog, log, mock, openDemo, setup, shadowFocus } from "./helpers";

test.beforeEach(async ({ page }) => setup(page));

test("full-screen modal sheet: page inert and unscrollable, focus trapped, Escape closes @mobile", async ({ page }) => {
  await openDemo(page);
  await expect(page.locator("[data-mh-chat] .l")).toBeHidden(); // icon-only bubble on phones
  await expect(bubble(page)).toHaveAccessibleName("Ask my AI assistant");
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
  // Full screen once the slide-in transition has settled.
  await expect.poll(async () => Object.values((await dialog(page).boundingBox()) ?? {})).toEqual([0, 0, 390, 844]);
  expect(await page.evaluate(() => (document.querySelector("main") as HTMLElement).inert)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  // Tab past the last control wraps to the first, Shift+Tab before the first wraps to the last.
  await page.locator("[data-mh-chat] textarea").fill("Hi");
  await page.locator("[data-mh-chat] textarea").focus();
  await page.keyboard.press("Tab"); // → Send
  expect(await shadowFocus(page)).toBe("button.go");
  await page.keyboard.press("Tab"); // wraps → New chat
  expect(await shadowFocus(page)).toBe("button.ib");
  await page.keyboard.press("Shift+Tab"); // wraps → Send
  expect(await shadowFocus(page)).toBe("button.go");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => (document.querySelector("main") as HTMLElement).inert)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  expect(await shadowFocus(page)).toMatch(/^button\.b/);
});

test("phones show the first 4 starter suggestions @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(page.locator("[data-mh-chat] .chip")).toHaveCount(4);
});

test("a jump link closes the sheet and scrolls to the section @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await mock(page, answer("His experience:", [["open_section", { id: "projects" }]]));
  await ask(page, "Projects?");
  await page.getByRole("link", { name: "Go to Projects" }).tap();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("projects")!.getBoundingClientRect().top))).toBeLessThan(120);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("projects");
});

test("Enter on a chip in the sheet keeps focus in the sheet, on the textarea @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  await mock(page, answer("Sure."));
  await expect(page.locator("[data-mh-chat] .chip").first()).toBeVisible();
  await page.locator("[data-mh-chat] .chip").first().focus();
  await page.keyboard.press("Enter");
  expect(await shadowFocus(page)).toBe("textarea");
  await expect(log(page)).toContainText("Sure.");
  expect(await shadowFocus(page)).toBe("textarea");
});

test("a tapped chip keeps focus in the sheet without raising the keyboard (the log) @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await mock(page, answer("Sure."));
  await page.locator("[data-mh-chat] .chip").first().tap();
  await expect(log(page)).toContainText("Sure.");
  expect(await shadowFocus(page)).toBe("div.log");
});

test("the sheet is not reopened on the next page (it would cover it) @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mh-chat:open"))).toBeNull();
  await page.reload();
  await expect(bubble(page)).toHaveAttribute("aria-expanded", "false");
  await expect(dialog(page)).toHaveCount(0);
});
