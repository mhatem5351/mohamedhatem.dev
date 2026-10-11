/**
 * Case-study pages, round 7: the Arabic breadcrumb keeps its marks and its Latin names whole (R7-AR-02, R7-AR-04),
 * the enlarge view covers the whole window without shifting the page (C-24), pans with a mouse and fits the whole
 * drawing on demand (R7-CASE-03), the figure bar speaks Arabic in an Arabic face (A-22), captions keep every Latin run
 * isolated (R7-AR-01), the launcher waits for the hero's own actions on phones (R7-LEAD-02), print gives the article
 * rather than the screen (R7-CASE-02), the notes point at the drawing (C-50) and the next case says where it sits in
 * the series (C-49).
 */
import { profile } from "@content/profile.ts";
import { expect, test } from "./fixtures";
import { CASE_SLUGS } from "./pages";

// Scrollbars drawn (the default launch hides them; overlay scrollbars still take no space unless a test styles them).
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const DESIGNED = ["sta-tourism-assistants", "arabsstock-assistant", "wakeb-bilingual-chatbot", "empoweromics-ml"];

test.describe("breadcrumbs (R7-AR-02, R7-AR-04)", () => {
  for (const slug of ["gov-bilingual-assistant", "aip-semantic-search", "empoweromics-ml", "tabaqat-gis", "logic-controls-website"])
    test(`/ar/work/${slug}/: the current crumb shows all of its text's height, and no Latin name is cut`, async ({ page }) => {
      await page.goto(`/ar/work/${slug}/`);
      const r = await page.locator(".crumbs [aria-current=page]").evaluate((el) => {
        const box = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = [...range.getClientRects()].filter((q) => q.top < box.bottom - 1);
        const cut = [...el.querySelectorAll("bdi")].filter((b) => {
          const q = b.getBoundingClientRect();
          const visible = q.top < box.bottom - 1; // a clamped line (below the box) is hidden whole
          return visible && (q.left < box.left - 1 || q.right > box.right + 1);
        });
        // Every Latin name is an isolate (so an ellipsis can drop it whole)…
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const loose: string[] = [];
        for (let n: Node | null; (n = walker.nextNode()); ) if (!(n.parentElement as Element).closest("bdi") && /[A-Za-z]/.test(n.textContent ?? "")) loose.push(n.textContent!);
        // …and the clip box leaves room under the line for Arabic marks (the dots under a final ي): a 1.3 line box cut them.
        const cs = getComputedStyle(el);
        const room = (parseFloat(cs.lineHeight) + parseFloat(cs.paddingBottom)) / parseFloat(cs.fontSize);
        return { inside: lines.every((q) => q.bottom <= box.bottom + 0.5 && q.top >= box.top - 0.5), cut: cut.map((b) => b.textContent), loose, room };
      });
      expect(r.inside).toBe(true);
      expect(r.cut).toEqual([]);
      expect(r.loose).toEqual([]);
      expect(r.room).toBeGreaterThanOrEqual(1.6);
    });
});

test.describe("figures", () => {
  test("Arabic figure bars name the figure in the Arabic face, not a monospace fallback (A-22)", async ({ page }) => {
    await page.goto("/ar/work/sta-tourism-assistants/");
    const font = await page.locator("#architecture .fig-panel__id").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toMatch(/Plex Sans Arabic/i);
    expect(font).not.toMatch(/^"?JetBrains/i);
  });

  for (const slug of DESIGNED)
    test(`/ar/work/${slug}/: every Latin run in a figure caption and its notes is isolated (R7-AR-01)`, async ({ page }) => {
      await page.goto(`/ar/work/${slug}/`);
      const loose = await page.evaluate(() => {
        const out: string[] = [];
        for (const box of document.querySelectorAll(".fig--dg .fig__caption-text, .fig--dg .callouts li")) {
          const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
          for (let n: Node | null; (n = walker.nextNode()); ) {
            if ((n.parentElement as Element).closest("bdi, .fig__note")) continue;
            if (/[A-Za-z]/.test(n.textContent ?? "")) out.push(n.textContent!.trim());
          }
        }
        return out;
      });
      expect(loose).toEqual([]);
    });

  test("the figure bar title wraps instead of cutting a word (C-31)", async ({ page }) => {
    for (const path of ["/work/empoweromics-ml/", "/ar/work/empoweromics-ml/", "/work/sta-tourism-assistants/"]) {
      await page.goto(path);
      const titles = await page.locator(".fig-panel__title").evaluateAll((els) =>
        els.filter((t) => t.getClientRects().length).map((t) => t.scrollHeight <= t.clientHeight + 2),
      );
      for (const ok of titles) expect(ok, path).toBe(true);
    }
  });

  test("the notes and the drawing point at each other (C-50) @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work/arabsstock-assistant/");
    const note = page.locator("#architecture .callouts > li").first();
    await note.scrollIntoViewIfNeeded();
    await note.hover();
    await expect(note).toHaveClass(/is-on/);
    const lit = await page.evaluate(() => [...document.querySelectorAll("#architecture .dg-on .dg-t")].map((t) => t.textContent));
    expect(lit).toEqual(["Orchestrator"]);
    await page.mouse.move(2, 2);
    await expect(note).not.toHaveClass(/is-on/);
  });
});

test.describe("the enlarge view (C-24, R7-CASE-03, R7-CASE-04) @desktop-only", () => {
  test.use({ bypassCSP: true });

  test("with a classic scrollbar the dialog covers the whole window and the page doesn't shift", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work/sta-tourism-assistants/");
    // A space-taking scrollbar, as on Windows and Linux.
    await page.addStyleTag({ content: "::-webkit-scrollbar{width:15px;background:#888}" });
    const btn = page.locator("#architecture [data-zoom-figure]");
    await btn.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => ({ cw: document.documentElement.clientWidth, nav: document.querySelector(".nav__inner")!.getBoundingClientRect().right }));
    test.skip(before.cw === 1440, "this engine draws overlay scrollbars only");
    await btn.click();
    const dialog = page.locator("dialog[data-zoom-dialog]");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    expect((await dialog.boundingBox())!.width).toBe(1440);
    const nav = await page.evaluate(() => document.querySelector(".nav__inner")!.getBoundingClientRect().right);
    expect(Math.abs(nav - before.nav)).toBeLessThanOrEqual(0.5);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.body.style.paddingRight || getComputedStyle(document.body).paddingRight)).toBe("0px");
  });

  test("a mouse drags the drawing; the toggle shows the whole of it; a pointer open focuses the dialog, a keyboard open its close button", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/work/arabsstock-assistant/");
    const btn = page.locator("#architecture [data-zoom-figure]");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const dialog = page.locator("dialog[data-zoom-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(dialog).toHaveAttribute("data-pans", "");
    const body = dialog.locator("[data-zoom-body]");
    const b = (await body.boundingBox())!;
    const start = await body.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 120, b.y + b.height / 2 - 60, { steps: 5 });
    await page.mouse.up();
    const end = await body.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    expect(end[0]! - start[0]!).toBeGreaterThan(60);
    expect(end[1]! - start[1]!).toBeGreaterThan(30);
    expect(await page.evaluate(() => String(getSelection()))).toBe("");
    await expect(dialog).toBeVisible();
    // The whole drawing at once, then back to the readable zoom.
    const fit = dialog.locator("[data-zoom-fit]");
    await expect(fit).toBeVisible();
    await expect(fit).toHaveAttribute("aria-pressed", "false");
    await fit.click();
    await expect(fit).toHaveAttribute("aria-pressed", "true");
    await expect(dialog).not.toHaveAttribute("data-pans", "");
    const whole = await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
    expect(whole).toBe(true);
    await fit.click();
    await expect(dialog).toHaveAttribute("data-pans", "");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(btn).toBeFocused();
    await btn.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-zoom-close]")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("a laptop that can show the whole drawing at its design size opens it fitted", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work/arabsstock-assistant/");
    const btn = page.locator("#architecture [data-zoom-figure]");
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const dialog = page.locator("dialog[data-zoom-dialog]");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    const r = await dialog.locator("[data-zoom-body]").evaluate((el) => {
      const svg = el.querySelector("svg")!;
      return { scale: (svg.getBoundingClientRect().width - 32) / svg.viewBox.baseVal.width, whole: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 };
    });
    expect(r.scale).toBeGreaterThanOrEqual(1);
    expect(r.whole).toBe(true);
  });
});

test.describe("phones and print", () => {
  test("every case hero marks its actions for the launcher to wait on (R7-LEAD-02)", async ({ page }) => {
    for (const slug of CASE_SLUGS) {
      await page.goto(`/work/${slug}/`);
      await expect(page.locator(".cs-hero__actions[data-chat-after]")).toHaveCount(1);
      // The first [data-chat-after] on the page is the hero's (site.ts reads the first one).
      expect(await page.evaluate(() => document.querySelector("[data-chat-after]")?.classList.contains("cs-hero__actions"))).toBe(true);
    }
  });

  test("the next case says where it sits in the series (C-49)", async ({ page }) => {
    const order = [...profile.caseStudies].sort((a, b) => a.order - b.order).map((c) => c.slug);
    await page.goto(`/work/${order[0]}/`);
    await expect(page.locator(".next-case__pos")).toHaveText(`2 / ${order.length}`);
  });

  test("printed, a case study is the article: no screen chrome, the first figure whole with its notes (R7-CASE-02) @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.goto("/work/arabsstock-assistant/");
    await page.emulateMedia({ media: "print" });
    for (const sel of [".read-progress", ".toc-m", ".cs-hero__actions", ".fig-panel__zoom", ".fig-panel__more", ".back-btn"])
      await expect(page.locator(sel).first(), sel).toBeHidden();
    const fig = page.locator("#architecture");
    expect(await fig.locator(".fig-panel__canvas").evaluate((el) => getComputedStyle(el).maxHeight)).toBe("none");
    await expect(fig.locator(".dg-variant--wide")).toBeVisible();
    await expect(fig.locator(".dg-variant--compact")).toBeHidden();
    await expect(fig.locator(".callouts")).toBeVisible();
    // The CTA band prints as ink on paper, not as a dark slab.
    const band = await page.locator(".cta-band").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(band).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });
});
