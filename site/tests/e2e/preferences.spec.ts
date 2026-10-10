import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function openMenuIfMobile(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  await page.locator("[data-menu-button]").click();
  await expect(page.locator("[data-menu-sheet]")).toBeVisible();
}

test.describe("language switch", () => {
  test("goes to the same page in the other language, with lang/dir and hreflang", async ({ page, isMobile }) => {
    await page.goto("/work/arabsstock-assistant/");
    await openMenuIfMobile(page, isMobile);
    const sw = page.locator(isMobile ? "[data-menu-sheet] .lang-switch" : ".nav .lang-switch");
    await expect(sw).toHaveAttribute("hreflang", "ar");
    await sw.click();
    await expect(page).toHaveURL(/\/ar\/work\/arabsstock-assistant\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await openMenuIfMobile(page, isMobile);
    await page.locator(isMobile ? "[data-menu-sheet] .lang-switch" : ".nav .lang-switch").click();
    await expect(page).toHaveURL(/\/work\/arabsstock-assistant\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("home ↔ /ar/", async ({ page, isMobile }) => {
    await page.goto("/");
    await openMenuIfMobile(page, isMobile);
    await page.locator(isMobile ? "[data-menu-sheet] .lang-switch" : ".nav .lang-switch").click();
    await expect(page).toHaveURL(/\/ar\/$/);
  });
});

test.describe("theme", () => {
  test("toggle cycles system → light → dark and persists", async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    if (isMobile) {
      await openMenuIfMobile(page, true);
      await page.locator('[data-set-theme="dark"]').click();
      await expect(page.locator('[data-set-theme="dark"]')).toHaveAttribute("aria-pressed", "true");
    } else {
      const toggle = page.locator(".nav [data-theme-toggle]");
      await expect(toggle).toHaveAttribute("data-mode", "system");
      await toggle.click();
      await expect(toggle).toHaveAttribute("data-mode", "light");
      await expect(html).toHaveAttribute("data-theme", "light");
      await toggle.click();
      await expect(toggle).toHaveAttribute("data-mode", "dark");
    }
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    // Persists across pages and languages too.
    await page.goto("/ar/cv/");
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("system mode follows the OS preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("mobile menu", () => {
  test("opens, closes with Escape and returns focus @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "small screens only");
    await page.goto("/");
    const btn = page.locator("[data-menu-button]");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-menu-sheet]")).toBeHidden();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(btn).toBeFocused();
  });
});
