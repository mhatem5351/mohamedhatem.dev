/**
 * Arabic direction (round 6: A-01, A-02, A-04). A localized label takes the page's direction and isolates only its
 * Latin runs (`<bdi dir="ltr">`, components/ui/BidiText.astro), so an Arabic phrase that starts with a Latin word
 * ("vLLM يخدم Qwen") never becomes a left-to-right paragraph that reads backwards, and a Latin-only label sits at the
 * start (right) of its Arabic card. Year ranges stay left to right; TOC numbers keep their gap from the label.
 * Checked on the rendered page (DOM order against x positions and computed direction), so it holds whatever the copy.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const CASES = ["/ar/work/wakeb-bilingual-chatbot/", "/ar/work/empoweromics-ml/", "/ar/work/logic-controls-website/", "/ar/work/tabaqat-gis/", "/ar/work/sta-tourism-assistants/"];
/** Localized labels of the architecture lists, the component views and the skills section. */
const LABELS = [
  ".arch-list__items > li",
  ".cv-node__t",
  ".cv-node__s",
  ".cv-edges__end",
  ".matrix-list__skill",
  ".matrix th > span",
  ".toolbox .tool > span:first-child",
  ".toolbox__also > bdi",
].join(", ");

interface Label {
  text: string;
  dir: string;
  /** Latin runs (in logical order) that, on one line, sit to the right of the run before them. */
  reversed: boolean;
  /** A Latin-only label: does its run sit at the start (right edge) of a block label? */
  latinOnlyAtStart: boolean | null;
}

const audit = (page: Page) =>
  page.evaluate((sel): Label[] => {
    const out: Label[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (!el.getClientRects().length) continue;
      const runs = [...el.querySelectorAll<HTMLElement>('bdi[dir="ltr"]')].filter((b) => /[A-Za-z]/.test(b.textContent ?? ""));
      const rects = runs.map((b) => b.getBoundingClientRect());
      let reversed = false;
      for (let i = 1; i < rects.length; i++) if (Math.abs(rects[i]!.top - rects[i - 1]!.top) < 4 && rects[i]!.left > rects[i - 1]!.left) reversed = true;
      const text = (el.textContent ?? "").trim();
      const block = getComputedStyle(el).display === "block";
      const latinOnly = runs.length === 1 && runs[0]!.textContent!.trim() === text;
      out.push({ text, dir: getComputedStyle(el).direction, reversed, latinOnlyAtStart: block && latinOnly ? el.getBoundingClientRect().right - rects[0]!.right < 3 : null });
    }
    return out;
  }, LABELS);

test.describe("Arabic labels read in the page's direction (A-01)", () => {
  for (const path of CASES)
    test(`${path}: no label is auto-directed, and no Latin run reads backwards`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator("main [dir=auto]").count(), "dir=auto in main").toBe(0);
      expect(await page.locator("main bdi:not([dir])").count(), "bare <bdi> in main").toBe(0);
      const labels = await audit(page);
      expect(labels.length, "labels found").toBeGreaterThan(3);
      for (const l of labels) {
        expect(l.dir, l.text).toBe("rtl");
        expect(l.reversed, l.text).toBe(false);
        if (l.latinOnlyAtStart !== null) expect(l.latinOnlyAtStart, `${l.text} starts at the right`).toBe(true);
      }
    });

  test("Wakeb: in the model row, the first Latin name (in reading order) is the rightmost", async ({ page }) => {
    await page.goto("/ar/work/wakeb-bilingual-chatbot/");
    const row = page.locator(".arch-list__items > li", { hasText: "Qwen" }).filter({ hasText: "vLLM" }).first();
    const order = await row.evaluate((li) => {
      const runs = [...li.querySelectorAll<HTMLElement>('bdi[dir="ltr"]')].filter((b) => /Qwen|vLLM/.test(b.textContent ?? ""));
      return runs.map((b) => b.getBoundingClientRect().left);
    });
    expect(order.length).toBe(2);
    expect(order[0]!).toBeGreaterThan(order[1]!);
  });

  test("/ar/ skills: every skill takes the page's direction, the Latin ones aligned right", async ({ page }) => {
    await page.goto("/ar/");
    expect(await page.locator("#skills [dir=auto]").count()).toBe(0);
    expect(await page.locator("#skills bdi:not([dir])").count()).toBe(0);
    const labels = await audit(page);
    expect(labels.length).toBeGreaterThan(10);
    for (const l of labels) {
      expect(l.dir, l.text).toBe("rtl");
      expect(l.reversed, l.text).toBe(false);
      if (l.latinOnlyAtStart !== null) expect(l.latinOnlyAtStart, `${l.text} starts at the right`).toBe(true);
    }
  });
});

test.describe("ranges and numbers in Arabic (A-02, A-04)", () => {
  test("/ar/: every year range in the experience reads left to right (2023 – 2027, never 2027 – 2023)", async ({ page }) => {
    await page.goto("/ar/");
    const pairs = await page.evaluate(() => {
      const out: { text: string; ok: boolean }[] = [];
      for (const root of document.querySelectorAll("#experience, #education")) {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n: Node | null; (n = walk.nextNode()); ) {
          const t = n as Text;
          if (!(t.parentElement?.getClientRects().length ?? 0)) continue;
          const m = /(\d{4})\s*[–-]\s*(\d{4})/.exec(t.data);
          if (!m) continue;
          const at = (i: number, len: number) => {
            const r = document.createRange();
            r.setStart(t, i);
            r.setEnd(t, i + len);
            return r.getBoundingClientRect();
          };
          const a = at(m.index, 4);
          const b = at(m.index + m[0].length - 4, 4);
          // A bare year range reads left to right; a month range ("سبتمبر 2023 – 2027 (متوقع)") reads right to left
          // like every other month range, its start month and year first (round 7, A-02).
          const monthRange = /[؀-ۿ]\s+$/.test(t.data.slice(0, m.index));
          if (Math.abs(a.top - b.top) < 4) out.push({ text: m[0], ok: monthRange ? a.left > b.left : a.left < b.left });
        }
      }
      return out;
    });
    expect(pairs.length).toBeGreaterThan(2);
    for (const p of pairs) expect(p.ok, p.text).toBe(true);
  });

  test("/ar/ case study: the TOC numbers keep a gap from their labels @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ar/work/sta-tourism-assistants/");
    const gaps = await page.locator(".toc-rail .toc__list a").evaluateAll((links) =>
      links.map((a) => {
        const num = a.querySelector(".toc__num")!;
        const label = a.querySelector(".toc__num + span")!;
        const range = (el: Element) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return r.getBoundingClientRect();
        };
        // right to left: the number at the right, its label to the left of it
        return range(num).left - range(label).right;
      }),
    );
    expect(gaps.length).toBeGreaterThan(3);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(8);
  });
});
