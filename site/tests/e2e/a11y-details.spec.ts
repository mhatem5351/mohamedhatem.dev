/**
 * Accessibility details beyond the axe sweep (a11y.spec.ts): the 320 px sweep, names that only exist at narrow
 * widths, user text spacing (WCAG 1.4.12), forced colors, headings in the experience trace, the skills table's
 * scroll region, the mobile menu and bidi isolation of Latin/number runs on Arabic pages.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { profile } from "@content/profile.ts";
import { NOT_FOUND, PAGES } from "./pages";
import { expect, test, useTheme } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TEXT_SPACING = "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }";

async function revealAll(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

/** The page's CSP blocks inline <style>, so user CSS is added as a constructed stylesheet (as extensions do). */
async function userCss(page: Page, css: string) {
  await page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, css);
}

test.describe("axe at 320 px @desktop-only", () => {
  for (const theme of ["dark", "light"] as const)
    for (const path of [...PAGES, ...NOT_FOUND])
      test(`${path} (${theme})`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 700 });
        if (theme === "light") await useTheme(page, "light");
        await page.goto(path, { waitUntil: "networkidle" });
        await revealAll(page);
        const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`)).toEqual([]);
      });
});

test.describe("narrow screens @desktop-only", () => {
  test("the home link keeps its accessible name when only the monogram shows (320 px)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const [path, locale] of [["/", "en"], ["/ar/", "ar"]] as const) {
      await page.goto(path);
      await expect(page.locator("header a.brand")).toHaveAccessibleName(new RegExp(profile.basics.name[locale]));
    }
  });
});

test.describe("text spacing (WCAG 1.4.12) @desktop-only", () => {
  for (const width of [1440, 390, 320])
    test(`no text is clipped in the work cards or the experience trace at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "networkidle" });
      await userCss(page, TEXT_SPACING);
      await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>("[data-trace] details").forEach((d) => (d.open = true)));
      await page.waitForTimeout(100);
      const clipped = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(".work, .work *, [data-trace] *")) {
          const cs = getComputedStyle(el);
          const clips = cs.overflowX !== "visible" || cs.webkitLineClamp !== "none";
          if (clips && el.clientWidth > 1 && el.clientHeight > 1 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && !el.matches("svg *, .work__media, .work__media *"))
            out.push(`${el.className}: ${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}`);
        }
        return out;
      });
      expect(clipped).toEqual([]);
    });
});

test.describe("forced colors @chromium-only", () => {
  test("the hero ask field and the form fields show a focus outline (box-shadow rings are dropped)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "forced-colors emulation");
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await page.locator("#hero-ask").focus();
    const bar = await page.locator("#hero-ask").evaluate((el) => {
      const cs = getComputedStyle(el.closest("form, .ask-bar")!);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect(bar.style).toBe("solid");
    expect(bar.width).toBeGreaterThanOrEqual(2);
    await page.locator("#cf-name").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const field = await page.locator("#cf-name").evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    expect(field.style).toBe("solid");
    expect(field.width).toBeGreaterThanOrEqual(2);
  });
});

test.describe("structure", () => {
  test("each role in the experience trace is a heading", async ({ page }) => {
    await page.goto("/");
    for (const r of profile.experience.filter((x) => x.primary)) await expect(page.getByRole("heading", { level: 3, name: new RegExp(r.title.en.replace(/[&]/g, "\\$&")) }).first()).toBeAttached();
  });

  test("the skills table is a focusable scroll region only while it scrolls sideways @desktop-only", async ({ page }) => {
    await page.goto("/");
    const wrap = page.locator(".matrix-wrap");
    await expect(wrap).not.toHaveAttribute("tabindex", "0");
    await expect(wrap).not.toHaveAttribute("role", "region");
    // Between 40rem and the table's 46rem width it scrolls sideways (phones get the list instead, see skills.spec).
    await page.setViewportSize({ width: 700, height: 844 });
    await expect(wrap).toHaveAttribute("tabindex", "0");
    await expect(wrap).toHaveAttribute("role", "region");
    await expect(wrap).toHaveAccessibleName(/./);
    // Empty cells say "no" to screen readers instead of nothing.
    expect(await page.locator(".matrix td .sr-only").count()).toBeGreaterThan(50);
  });

  test("the mobile menu keeps language and theme in a landmark and closes when focus leaves it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "menu sheet is for small screens");
    await page.goto("/");
    await page.locator("[data-menu-button]").click();
    const sheet = page.locator("[data-menu-sheet]");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("nav .segmented")).toHaveCount(1);
    await expect(sheet.locator("nav .lang-switch")).toHaveCount(1);
    await sheet.locator('[data-set-theme="dark"]').focus();
    await page.keyboard.press("Tab");
    await expect(sheet).toBeHidden();
    await expect(page.locator("[data-menu-button]")).toHaveAttribute("aria-expanded", "false");
  });

  test("Latin and number runs keep their order on Arabic pages (365 Data Science, CV degree dates)", async ({ page }) => {
    await page.goto("/ar/#education");
    // The label sits in the page direction; its Latin run is the isolated left-to-right part (lib/bidi.ts).
    const issuer = page.locator('#education .edu__sub bdi[dir="ltr"]', { hasText: "365 Data Science" });
    const order = await issuer.evaluate((el) => {
      const t = el.firstChild as Text;
      const at = (s: string) => {
        const r = document.createRange();
        const i = t.data.indexOf(s);
        r.setStart(t, i);
        r.setEnd(t, i + s.length);
        return r.getBoundingClientRect().left;
      };
      return at("365") < at("Data");
    });
    expect(order).toBe(true);
  });
});
