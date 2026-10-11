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
        // A capability view of three boxes or fewer adds nothing to the text: no figure, no link to one.
        const figure = cs.architecture.nodes.length > 3;
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
      const strip = (await page.locator(".cs-facts").boundingBox())!;
      for (const box of await cells.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width)))
        expect(box).toBeLessThanOrEqual(strip.width / 4 + 1);
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
