/**
 * Case-study pages (audits VUX-03, VUX-10): brief case studies are compact and say so; full ones keep a 2-4 fact
 * strip that doesn't stretch, and bold lead-ins on the figure notes. Home: brief work sits in "More work".
 */
import { profile } from "@content/profile.ts";
import { en } from "@content/i18n/en.ts";
import { ar } from "@content/i18n/ar.ts";
import { expect, test } from "./fixtures";

const brief = profile.caseStudies.filter((c) => c.depth === "brief");
const full = profile.caseStudies.filter((c) => c.depth === "full");

test.describe("brief case studies", () => {
  for (const cs of brief)
    for (const [prefix, m] of [["", en], ["/ar", ar]] as const)
      test(`${prefix}/work/${cs.slug}/: compact, labelled brief, with the note card and no facts strip`, async ({ page }) => {
        await page.goto(`${prefix}/work/${cs.slug}/`);
        await expect(page.locator(".cs-hero .eyebrow .cs-hero__brief")).toHaveText(m.work.page.briefTag);
        await expect(page.locator(".cs-facts")).toHaveCount(0);
        for (const id of ["problem", "approach", "outcome"]) await expect(page.locator(`section#${id} h2`)).toBeVisible();
        const note = page.locator(".cs-brief__note");
        await expect(note).toContainText(m.work.briefNote);
        await expect(note.getByRole("button", { name: m.work.page.ask })).toBeVisible();
        // A capability view of five boxes or fewer (users, assistant, model…) adds nothing to the text: no figure, no
        // link to one (HM-22).
        const figure = cs.architecture.nodes.length > 5;
        await expect(page.locator("#architecture")).toHaveCount(figure ? 1 : 0);
        await expect(page.getByRole("link", { name: m.work.page.seeArchitecture })).toHaveCount(figure ? 1 : 0);
      });

  test("the note card sits beside the text from 64rem, not under an empty half @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work/aip-semantic-search/");
    const main = await page.locator(".cs-brief__main").boundingBox();
    const aside = await page.locator(".cs-brief__aside").boundingBox();
    expect(aside!.x).toBeGreaterThan(main!.x + main!.width);
    expect(Math.abs(aside!.y - main!.y)).toBeLessThan(40);
  });
});

test.describe("full case studies", () => {
  for (const cs of full)
    test(`/work/${cs.slug}/: 2-4 sourced facts, never stretched across the page`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/work/${cs.slug}/`);
      const cells = page.locator(".cs-facts .metric");
      await expect(cells).toHaveCount(Math.min(4, cs.figures.length));
      expect(cs.figures.length).toBeGreaterThanOrEqual(2);
      // Each fact keeps at most a quarter of the content width, and the strip (its hairlines) ends with its last fact
      // instead of running under an empty fourth cell (C-14).
      const content = await page.locator(".cs-hero > .container").evaluate((el) => {
        const cs = getComputedStyle(el);
        return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      });
      for (const box of await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width)))
        expect(box).toBeLessThanOrEqual(content / 4 + 1);
      const strip = (await page.locator(".cs-facts").boundingBox())!;
      const last = (await cells.last().boundingBox())!;
      expect(Math.abs(strip.x + strip.width - (last.x + last.width))).toBeLessThanOrEqual(1);
    });

  test("ArabsStock: the design's four facts, with the unit set small", async ({ page }) => {
    await page.goto("/work/arabsstock-assistant/");
    const values = await page.locator(".cs-facts .metric__value").allInnerTexts();
    expect(values.map((v) => v.replace(/\s+/g, " ").trim())).toEqual(["14", "5", "Millions", "21 months"]);
    await expect(page.locator(".cs-facts .metric__value small")).toHaveText("months");
  });

  test("figure notes start with a bold term, in English and Arabic", async ({ page }) => {
    for (const path of ["/work/arabsstock-assistant/", "/ar/work/arabsstock-assistant/", "/work/wakeb-bilingual-chatbot/"]) {
      await page.goto(path);
      const notes = page.locator(".fig .callouts li");
      const count = await notes.count();
      expect(count, path).toBeGreaterThan(3);
      await expect(page.locator(".fig .callouts li b")).toHaveCount(count);
    }
    await page.goto("/work/arabsstock-assistant/");
    await expect(page.locator(".fig .callouts li").first().locator("b")).toHaveText("Orchestrator.");
  });
});

test.describe("home: selected work", () => {
  test("featured case studies are in the grid, the rest (the briefs, then logic-controls.com) in More work; /#craft lands on the logic-controls.com card", async ({ page, isMobile }) => {
    await page.goto("/");
    const more = page.locator(".more-work");
    // Phones: More work waits behind its "Show more work" button.
    if (isMobile) {
      const toggle = more.locator("[data-disclose-toggle]");
      await expect(toggle).toBeVisible();
      await toggle.tap();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }
    const rx = (t: string) => new RegExp(t.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    for (const cs of brief) await expect(more.getByRole("link", { name: cs.title.en })).toBeVisible();
    // Round 6 (HM-14): the freelance site is a full case study but no longer in the featured grid.
    for (const cs of full.filter((c) => c.featured)) await expect(page.locator(".work-list").getByRole("link", { name: rx(cs.title.en) })).toBeVisible();
    for (const cs of full.filter((c) => !c.featured)) {
      await expect(more.getByRole("link", { name: rx(cs.title.en) })).toBeVisible();
      await expect(page.locator(".work-list").getByRole("link", { name: rx(cs.title.en) })).toHaveCount(0);
    }
    await expect(more).toContainText(en.work.readBrief);
    await expect(page.locator("#craft")).toContainText("logic-controls.com");
    await expect(page.locator("#craft a.stretched")).toHaveAttribute("href", "/work/logic-controls-website/");
  });

  test("cards in a row line up: eyebrows, titles and the Read cue @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#work");
    // Per card: its own top (its row), then the tops of its eyebrow, title and Read cue.
    const lists = await page.evaluate(() =>
      [".work-list > .work:not(.work--feature)", ".more-work__list > .work"].map((sel) =>
        [...document.querySelectorAll(sel)].map((c) => [c, ...["eyebrow", "work__title", "work__cta"].map((k) => c.querySelector(`.${k}`)!)].map((e) => Math.round(e.getBoundingClientRect().top))),
      ),
    );
    expect(lists[0]!.length).toBe(3);
    expect(lists[1]!.length).toBe(profile.caseStudies.filter((c) => !c.featured).length);
    for (const cards of lists) {
      // Cards that share a row line up their eyebrows, titles and Read cues; each list has a row of two or more.
      const rows = new Map<number, number[][]>();
      for (const c of cards) rows.set(c[0]!, [...(rows.get(c[0]!) ?? []), c]);
      expect(Math.max(...[...rows.values()].map((r) => r.length))).toBeGreaterThanOrEqual(2);
      for (const row of rows.values()) for (const c of row) expect(c).toEqual(row[0]);
    }
  });

  test("one eyebrow pattern: Company / years (Wakeb's shared role: during …)", async ({ page }) => {
    await page.goto("/");
    const eyebrows = await page.locator(".work-list > .work:not(.work--feature) .eyebrow, .more-work .eyebrow").allInnerTexts();
    for (const e of eyebrows.slice(0, 3)) expect(e.replace(/\s+/g, " ")).toMatch(/^[^/]+ \/ (during )?\d{4}(–\d{4})?$/i);
    expect(eyebrows.join(" ")).not.toMatch(/\bAt Wakeb/i);
  });
});

test.describe("figures (round 6: C-01, C-04, C-05, C-07, C-08, C-24)", () => {
  const DESIGNED = ["/work/sta-tourism-assistants/", "/work/arabsstock-assistant/", "/work/wakeb-bilingual-chatbot/", "/work/empoweromics-ml/"];
  /** Rendered size of every visible diagram label (CSS px) and the fill of every visible pill behind a tab or label. */
  const measure = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const sizes: number[] = [];
      const pills: string[] = [];
      for (const svg of document.querySelectorAll<SVGSVGElement>(".fig-panel svg.dg")) {
        if (!svg.getClientRects().length) continue;
        const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        for (const t of svg.querySelectorAll("text")) if (t.getClientRects().length && t.textContent?.trim()) sizes.push(parseFloat(getComputedStyle(t).fontSize) * k);
        for (const r of svg.querySelectorAll(".dg-tabbg, .dg-elbg")) pills.push(getComputedStyle(r).fill);
      }
      return { sizes, pills, bg: getComputedStyle(document.querySelector(".fig-panel__canvas")!).backgroundColor };
    });

  for (const width of [1440, 1280, 1024])
    test(`at ${width} px every diagram label reads at 11 px or more, on a filled pill (C-07, C-08) @desktop-only`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of DESIGNED) {
        await page.goto(path);
        const { sizes, pills, bg } = await measure(page);
        expect(sizes.length, path).toBeGreaterThan(10);
        expect(Math.min(...sizes), path).toBeGreaterThanOrEqual(10.95);
        // The pill takes the canvas colour, so no group border or edge runs through the text.
        for (const fill of pills) expect(fill, path).toBe(bg);
      }
    });

  test("Wakeb's in-article figures get the hero's width from 73.5rem, and the TOC rail steps aside while one passes @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work/wakeb-bilingual-chatbot/");
    const hero = (await page.locator("#architecture .fig-panel").boundingBox())!;
    const fig = page.locator("#fig-hybrid-rag");
    const panel = (await fig.locator(".fig-panel").boundingBox())!;
    expect(Math.abs(panel.width - hero.width)).toBeLessThanOrEqual(1);
    await fig.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(page.locator(".toc-rail__inner")).toHaveAttribute("data-covered", "");
    await expect(page.locator(".toc-rail__inner")).toBeHidden();
    await page.locator("#outcome").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(page.locator(".toc-rail__inner")).toBeVisible();
  });

  for (const [path, end] of [["/work/sta-tourism-assistants/", "right"], ["/ar/work/sta-tourism-assistants/", "left"]] as const)
    test(`${path}: Enlarge fills the window, draws the figure larger than the page does, closes from the ${end} corner @desktop-only`, async ({ page }) => {
      for (const [width, height] of [[1440, 900], [1024, 768]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(path);
        const inline = await page.locator("#architecture svg.dg").evaluateAll((svgs) => {
          const s = (svgs as SVGSVGElement[]).find((x) => x.getClientRects().length)!;
          return s.getBoundingClientRect().width / s.viewBox.baseVal.width;
        });
        const btn = page.locator("#architecture [data-zoom-figure]");
        await btn.scrollIntoViewIfNeeded();
        const y = await page.evaluate(() => scrollY);
        await btn.click();
        const dialog = page.locator("dialog[data-zoom-dialog]");
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        // The whole window (a classic scrollbar's gutter stays reserved while the page is locked).
        expect(box.width, `${width}: dialog width`).toBeGreaterThanOrEqual(width - 16);
        expect(box.height, `${width}: dialog height`).toBeGreaterThanOrEqual(height - 1);
        const scale = await dialog.locator("[data-zoom-body] > svg").evaluate((s) => {
          const svg = s as SVGSVGElement;
          return (svg.getBoundingClientRect().width - 32) / svg.viewBox.baseVal.width;
        });
        expect(scale, `${width}: enlarged`).toBeGreaterThanOrEqual(1.1);
        expect(scale, `${width}: larger than the page's own`).toBeGreaterThan(inline);
        const close = (await dialog.locator("[data-zoom-close]").boundingBox())!;
        if (end === "right") expect(box.x + box.width - (close.x + close.width)).toBeLessThanOrEqual(16);
        else expect(close.x - box.x).toBeLessThanOrEqual(16);
        // Panning shows its hint; the page behind doesn't move under the wheel.
        const pans = await dialog.evaluate((d) => d.hasAttribute("data-pans"));
        await expect(dialog.locator("[data-zoom-hint]")).toBeVisible({ visible: pans });
        await page.mouse.move(4, height - 4);
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(150);
        expect(await page.evaluate(() => scrollY)).toBe(y);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(btn).toBeFocused();
      }
    });

  test("the reading-progress hairline grows as the page scrolls (C-01)", async ({ page }) => {
    await page.goto("/work/sta-tourism-assistants/");
    await page.evaluate(() => scrollTo(0, 2000));
    await expect.poll(() => page.locator(".read-progress i").evaluate((i) => i.getBoundingClientRect().width)).toBeGreaterThan(10);
  });
});
