/**
 * The Saudi Tourism Authority case study (Globant): the first featured case study, kept light (one agent, the one
 * approved figure "96 tools, 27 visible to visitors", accepted in the client's UAT), with a gallery of product screens
 * (lazy, responsive, 1x captures never upscaled, enlargeable), in English and Arabic, with its JSON-LD; and its place
 * on the home page (the feature card, the Globant role in the trace).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { profile } from "@content/profile.ts";
import { en } from "@content/i18n/en.ts";
import { ar } from "@content/i18n/ar.ts";
import { expect, test, useTheme } from "./fixtures";

const SLUG = "sta-tourism-assistants";
const cs = profile.caseStudies.find((c) => c.slug === SLUG)!;
const PAGES = [
  ["en", `/work/${SLUG}/`, en],
  ["ar", `/ar/work/${SLUG}/`, ar],
] as const;

/** Scrolls the gallery into view so its lazy images load, then waits for them. */
async function loadScreens(page: Page) {
  const shots = page.locator(".screens .shot__img");
  const n = await shots.count();
  for (let i = 0; i < n; i++) await shots.nth(i).scrollIntoViewIfNeeded();
  await expect.poll(() => shots.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

test.describe("STA case study", () => {
  for (const [locale, path, m] of PAGES) {
    test(`${path}: title, light facts and the one approved figure`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveText(cs.title[locale]);
      const values = await page.locator(".cs-facts .metric__value").allInnerTexts();
      expect(values.map((v) => v.replace(/\s+/g, " ").trim())).toEqual(cs.figures.map((f) => [f.value[locale], f.unit?.[locale]].filter(Boolean).join(" ")));
      const main = await page.locator("main").innerText();
      // One agent, never multi-agent; accepted in UAT, never "in production" or launched.
      expect(main).not.toMatch(locale === "en" ? /multi-agent|in production|launched/i : /متعدد(ة)? الوكلاء|بيئة الإنتاج/);
      for (const id of ["problem", "approach", "screens", "components", "outcome", "stack"]) await expect(page.locator(`section#${id} h2`)).toBeVisible();
      await expect(page.locator("section#screens")).toContainText(m.work.page.screensCredit);
      // The company is the employer (Globant), and the client is named in the context.
      await expect(page.locator(".cs-hero")).toContainText("Globant");
    });

    test(`${path}: the screens gallery, grouped, captioned, lazy and responsive; every image loads`, async ({ page }) => {
      await page.goto(path);
      const groups = page.locator(".screens__group");
      await expect(groups).toHaveCount(2);
      await expect(groups.locator("h3")).toHaveText([...new Set(cs.screens!.map((s) => s.product[locale]))]);
      const imgs = page.locator(".screens .shot__img");
      await expect(imgs).toHaveCount(cs.screens!.length);
      for (const [i, s] of cs.screens!.entries()) {
        const img = imgs.nth(i);
        await expect(img).toHaveAttribute("alt", s.alt[locale]);
        await expect(img).toHaveAttribute("loading", "lazy");
        await expect(img).toHaveAttribute("sizes", /\S/);
        expect(await img.getAttribute("srcset")).toMatch(/\.webp \d+w/);
        await expect(page.locator(".screens .shot__cap").nth(i)).toHaveText(s.caption[locale]);
      }
      await loadScreens(page);
    });
  }

  for (const width of [1440, 390, 320])
    test(`1x captures are never shown wider than they were captured, and nothing overflows (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/work/${SLUG}/`);
      await loadScreens(page);
      const shots = await page.locator(".screens .shot__img").evaluateAll((imgs) =>
        imgs.map((i) => ({ shown: i.getBoundingClientRect().width, natural: (i as HTMLImageElement).naturalWidth, src: (i as HTMLImageElement).currentSrc })),
      );
      for (const [i, s] of cs.screens!.entries()) {
        const shot = shots[i]!;
        expect(shot.shown, s.file).toBeGreaterThan(100);
        // A 1x capture's only rendition is its native width: shown at most that wide (never upscaled).
        if (s.density === 1) expect(shot.shown, s.file).toBeLessThanOrEqual(shot.natural + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

  test("desktop: the phone screen sits beside the stacked desktop screens; the dialog beside the staff screen @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/work/${SLUG}/`);
    await loadScreens(page);
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const lead = await box(".shot--lead");
    const phone = await box(".shot--phone");
    const main = await box(".screens__group >> nth=0 >> .shot--main");
    expect(phone.x).toBeGreaterThan(main.x + main.width - 1);
    expect(phone.y).toBeGreaterThan(lead.y + lead.height - 1);
    const panel = await box(".shot--panel");
    const staff = await box(".screens__group >> nth=1 >> .shot--main");
    expect(panel.x).toBeGreaterThan(staff.x + staff.width - 1);
  });

  test("a screen enlarges in a dialog (as large as the window allows; natural size on phones); Escape closes it and focus returns", async ({ page }) => {
    await page.goto(`/work/${SLUG}/`);
    const link = page.locator(".screens a[data-zoom]").first();
    await link.scrollIntoViewIfNeeded();
    await expect(link).toHaveAccessibleName(`Enlarge: ${cs.screens![0]!.alt.en}`);
    await link.click();
    const dialog = page.locator("dialog[data-zoom-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName(cs.screens![0]!.caption.en);
    const img = dialog.locator("img");
    await expect(img).toHaveAttribute("alt", cs.screens![0]!.alt.en);
    await expect.poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000);
    const { shown, natural, shownH } = await img.evaluate((i) => ({ shown: i.getBoundingClientRect().width, shownH: i.getBoundingClientRect().height, natural: (i as HTMLImageElement).naturalWidth }));
    const inline = (await link.locator("img").boundingBox())!.width;
    const vp = page.viewportSize()!;
    if (vp.width >= 768) {
      // Wide screens: larger than on the page, wholly in view, never beyond the capture's own pixels.
      expect(shown).toBeGreaterThan(inline);
      expect(shown).toBeLessThanOrEqual(natural + 0.5);
      expect(shownH).toBeLessThanOrEqual(vp.height);
    } else {
      // Phones: a 2x capture at half its pixels (its natural size), larger than the page shows it, to pan and zoom.
      expect(Math.round(shown)).toBe(Math.round(natural / 2));
      expect(shown).toBeGreaterThan(inline);
    }
    await expect(dialog.getByRole("button", { name: en.work.page.closeScreen })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(link).toBeFocused();
    // The close button closes it too.
    await link.click();
    await dialog.getByRole("button", { name: en.work.page.closeScreen }).click();
    await expect(dialog).toBeHidden();
  });

  test("without JavaScript the screen links open the full-size image", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`/work/${SLUG}/`);
    const href = await page.locator(".screens a[data-zoom]").first().getAttribute("href");
    expect(href).toMatch(/^\/_astro\/.+\.webp$/);
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/webp");
    await ctx.close();
  });

  for (const theme of ["dark", "light"] as const)
    for (const width of [1440, 390, 320])
      test(`axe: no violations with the gallery and the enlarged screen (${theme}, ${width} px) @desktop-only`, async ({ page }) => {
        if (theme === "light") await useTheme(page, "light");
        await page.setViewportSize({ width, height: 900 });
        for (const [locale, path] of PAGES) {
          await page.goto(path, { waitUntil: "networkidle" });
          await loadScreens(page);
          await page.waitForTimeout(800);
          const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
          expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations.map((v) => v.id), `${path} ${locale}`).toEqual([]);
          await page.locator(".screens a[data-zoom]").nth(1).click();
          await expect(page.locator("dialog[data-zoom-dialog]")).toBeVisible();
          expect((await new AxeBuilder({ page }).include("dialog[data-zoom-dialog]").withTags(tags).analyze()).violations.map((v) => v.id), `${path} dialog`).toEqual([]);
          await page.keyboard.press("Escape");
        }
      });

  test("JSON-LD: an Article about the work, by Globant for the Saudi Tourism Authority, in both languages", async ({ page }) => {
    for (const [locale, path] of PAGES) {
      await page.goto(path);
      const nodes = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((t) => {
        const j = JSON.parse(t);
        return Array.isArray(j) ? j : [j];
      });
      const article = nodes.find((n) => n["@type"] === "Article");
      expect(article.headline).toBe(cs.title[locale]);
      expect(article.inLanguage).toBe(locale);
      expect(article.about.producer.name).toBe("Globant");
      expect(article.about.sponsor.name).toBe(cs.client!.name[locale]);
      // The card in 16:9, 4:3 and 1:1 (SEO-05).
      expect(article.image).toHaveLength(3);
      for (const [i, re] of [/\.png\?v=/, /-4x3\.jpg\?v=/, /-1x1\.jpg\?v=/].entries()) {
        expect(article.image[i]).toContain(`/og/work-${SLUG}-${locale}`);
        expect(article.image[i]).toMatch(re);
        expect((await page.request.get(new URL(article.image[i]).pathname)).status()).toBe(200); // the local build, not production
      }
    }
  });
});

test.describe("home and trace", () => {
  for (const [locale, prefix] of [["en", ""], ["ar", "/ar"]] as const)
    test(`${prefix || "/"}: the STA case study is the feature card with the Globant tile; ArabsStock leads the grid`, async ({ page }) => {
      await page.goto(`${prefix}/`);
      const feature = page.locator(".work-list > .work").first();
      await expect(feature).toHaveClass(/work--feature/);
      await expect(feature.locator("a.stretched")).toHaveAttribute("href", `${prefix}/work/${SLUG}/`);
      await expect(feature.locator(".work__logo")).toHaveAttribute("src", /globant/);
      await expect(feature.locator(".work__meta .eyebrow")).toContainText("Globant");
      const second = page.locator(".work-list > .work").nth(1);
      await expect(second.locator("a.stretched")).toHaveAttribute("href", `${prefix}/work/arabsstock-assistant/`);
      // The Globant role in the experience trace links to the case study.
      await expect(page.locator(`#experience a[href="${prefix}/work/${SLUG}/"]`)).toHaveCount(1);
      // About mentions the work for the Saudi Tourism Authority.
      await expect(page.locator("#about")).toContainText(locale === "en" ? "Saudi Tourism Authority" : "الهيئة السعودية للسياحة");
    });
});
