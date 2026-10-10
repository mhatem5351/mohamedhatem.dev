import type { Page } from "@playwright/test";
import { expect, stubThirdParties, test, useTheme } from "./fixtures";

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
  const DARK_BG = "rgb(12, 21, 29)"; // --color-bg, dark (#0C151D)
  const LIGHT_BG = "rgb(251, 248, 243)"; // --color-bg, light (#FBF8F3)
  const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  for (const os of ["light", "dark"] as const) {
    test(`a first visit is dark whatever the OS setting (${os} OS)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await page.goto("/");
      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-theme", "dark");
      expect(await bodyBg(page)).toBe(DARK_BG);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0C151D");
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
      // A later OS change doesn't override the site's default.
      await page.emulateMedia({ colorScheme: os === "light" ? "dark" : "light" });
      await expect(html).toHaveAttribute("data-theme", "dark");
      expect(await bodyBg(page)).toBe(DARK_BG);
    });
  }

  test("the toggle flips dark ↔ light, names the current theme, and the choice persists", async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    if (isMobile) {
      await openMenuIfMobile(page, true);
      await expect(page.locator('[data-set-theme="dark"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("[data-set-theme]")).toHaveCount(2);
      await page.locator('[data-set-theme="light"]').click();
      await expect(page.locator('[data-set-theme="light"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('[data-set-theme="dark"]')).toHaveAttribute("aria-pressed", "false");
    } else {
      // Every click changes what you see: dark (default) → light → dark → light.
      const toggle = page.locator(".nav [data-theme-toggle]");
      await expect(toggle).toHaveAttribute("data-mode", "dark");
      await expect(toggle).toHaveAttribute("aria-label", "Theme: Dark");
      await toggle.click();
      await expect(toggle).toHaveAttribute("data-mode", "light");
      await expect(toggle).toHaveAttribute("aria-label", "Theme: Light");
      await expect(html).toHaveAttribute("data-theme", "light");
      await toggle.click();
      await expect(html).toHaveAttribute("data-theme", "dark");
      expect(await page.evaluate(() => localStorage.getItem("mh-theme"))).toBe("dark");
      await toggle.click();
    }
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    expect(await page.evaluate(() => localStorage.getItem("mh-theme"))).toBe("light");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#FBF8F3");
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
    // Persists across pages and languages too, with each page's own chrome colour (the CV's band).
    await page.goto("/ar/cv/");
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#F4EFE6");
  });

  test("a visitor who chose light gets light before first paint (boot script, metas)", async ({ page }) => {
    await useTheme(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    // Read the state the boot script left before any module script ran.
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState !== "interactive" || (window as Window & { __boot?: unknown }).__boot) return;
        (window as Window & { __boot?: unknown }).__boot = {
          theme: document.documentElement.dataset.theme,
          chrome: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
          scheme: document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content,
        };
      });
    });
    await page.goto("/work/arabsstock-assistant/");
    expect(await page.evaluate(() => (window as Window & { __boot?: unknown }).__boot)).toEqual({ theme: "light", chrome: "#FBF8F3", scheme: "light" });
    expect(await bodyBg(page)).toBe(LIGHT_BG);
  });

  test("without JavaScript the page is dark too @desktop-only", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
    const page = await context.newPage();
    await stubThirdParties(page);
    await page.goto("/");
    expect(await bodyBg(page)).toBe(DARK_BG);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
    await context.close();
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
