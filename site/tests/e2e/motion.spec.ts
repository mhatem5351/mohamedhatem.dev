import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Running animations in the document, as "property list" per animation (comets, landings, pings, entrances). */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => {
        const props = new Set<string>();
        for (const k of (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [])
          for (const p of Object.keys(k)) if (!["offset", "computedOffset", "easing", "composite"].includes(p)) props.add(p);
        const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return { props: [...props].sort(), cls: t?.getAttribute("class") ?? "", chart: !!t?.closest("[data-motion], [data-motion-once]") };
      }),
  );
/** Brings a chart to the middle of the viewport at once (the page scrolls smoothly otherwise). */
const centre = (page: Page, sel: string) => page.evaluate((s) => document.querySelector(s)!.scrollIntoView({ block: "center", behavior: "instant" }), sel);

test.describe("motion", () => {
  test("hero graph is a still frame under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    const svg = page.locator(".hero .hg-svg");
    await expect(svg).toBeVisible();
    await page.waitForTimeout(1200);
    const a = await svg.evaluate((el) => el.innerHTML);
    await page.waitForTimeout(1500);
    const b = await svg.evaluate((el) => el.innerHTML);
    expect(b).toBe(a);
    await expect(page.locator(".hero .hg-btn")).toBeHidden();
  });

  test("hero graph animates otherwise, and its pause button works and persists", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer/idle timing differs on mobile emulation; covered on desktop");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/", { waitUntil: "networkidle" });
    const btn = page.locator(".hero .hg-btn");
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".hero .hg-btn")).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  });

  test("no CSS transform animation runs under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const kf = (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
        return a.playState === "running" && kf.some((k) => "transform" in k || "translate" in k || "scale" in k || "rotate" in k);
      }).length,
    );
    expect(running).toBe(0);
  });

  test("the hero graph's pause button now pauses every living chart, and the choice persists", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer/idle timing differs on mobile emulation; covered on desktop");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator(".hero .hg-btn").click();
    await centre(page, "#work .work-list");
    await expect(page.locator("#work [data-motion].dg-play")).toHaveCount(0);
    for (const b of await page.locator("#work [data-motion-toggle]").all()) await expect(b).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("living charts", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("diagrams move only while on screen, and only with transform and opacity (off the main thread)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // Nothing plays while the work cards are below the fold.
    await expect(page.locator("#work [data-motion].dg-play")).toHaveCount(0);
    await centre(page, "#work .work-list");
    await expect(page.locator("#work [data-motion].dg-play").first()).toBeVisible();
    // A request travels: comets ride the drawing, the nodes they reach light up.
    await expect(page.locator("#work svg.dg-comets .dg-cm").first()).toBeAttached();
    await expect.poll(async () => (await running(page)).filter((a) => /dg-cm|dg-hl/.test(a.cls)).length).toBeGreaterThan(4);
    const props = new Set((await running(page)).filter((a) => a.chart).flatMap((a) => a.props));
    expect([...props].filter((p) => !["opacity", "transform"].includes(p))).toEqual([]);
    // Scrolled away, it stops: no comet animation runs.
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator("#work [data-motion].dg-play")).toHaveCount(0);
    await expect.poll(async () => (await running(page)).filter((a) => /dg-cm|dg-hl|dg-bgp/.test(a.cls)).length).toBe(0);
  });

  test("a case-study figure animates the drawing that shows, not its hidden twin", async ({ page }) => {
    await page.goto("/work/arabsstock-assistant/", { waitUntil: "networkidle" });
    await centre(page, "figure.fig");
    await expect(page.locator("figure.fig [data-motion]").first()).toHaveClass(/dg-play/);
    await expect.poll(async () => (await running(page)).filter((a) => /dg-cm/.test(a.cls)).length).toBeGreaterThan(0);
    const hiddenRunning = await page.evaluate(() =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target as SVGElement | null;
        return a.playState === "running" && t?.ownerSVGElement && t.ownerSVGElement.getClientRects().length === 0;
      }).length,
    );
    expect(hiddenRunning).toBe(0);
  });

  test("a hidden tab stops the charts", async ({ page }) => {
    await page.goto("/work/arabsstock-assistant/", { waitUntil: "networkidle" });
    await centre(page, "figure.fig");
    await expect(page.locator("figure.fig [data-motion]").first()).toHaveClass(/dg-play/);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator("figure.fig [data-motion]").first()).not.toHaveClass(/dg-play/);
  });

  test("one pause control for all of them: visible, named, keyboard operable, shared and persistent (WCAG 2.2.2)", async ({ page, isMobile }) => {
    await page.goto("/work/wakeb-bilingual-chatbot/", { waitUntil: "networkidle" });
    await centre(page, "#fig-hybrid-rag");
    const btn = page.locator("#fig-hybrid-rag [data-motion-toggle]");
    await expect(btn).toBeVisible();
    await expect(page.locator("#fig-hybrid-rag [data-motion]")).toHaveClass(/dg-play/);
    await expect(btn).toHaveAccessibleName("Pause animations");
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    if (isMobile) await btn.tap();
    else {
      await btn.focus();
      await page.keyboard.press("Enter");
    }
    // Every chart's button agrees, every chart is still (the static drawing).
    for (const b of await page.locator("[data-motion-toggle]").all()) await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-motion].dg-play")).toHaveCount(0);
    await expect(page.locator("#fig-hybrid-rag .dg-cm").first()).toHaveCSS("opacity", "0");
    await page.reload({ waitUntil: "networkidle" });
    await centre(page, "#fig-hybrid-rag");
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-motion].dg-play")).toHaveCount(0);
    // Play again.
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#fig-hybrid-rag [data-motion]")).toHaveClass(/dg-play/);
  });

  test("the experience trace grows in once and pings 'now' on the current role", async ({ page, isMobile }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const trace = page.locator(".trace");
    await expect(trace).toHaveAttribute("data-armed", "");
    if (isMobile) {
      // Phones show each role's dates and duration instead of the lane (no bars, so nothing grows or pings there).
      await expect(trace.locator(".span__lane").first()).toBeHidden();
      await centre(page, ".trace");
      await expect(trace).toHaveClass(/is-in/);
      await expect(trace.locator(".span__dur").first()).toBeVisible();
      expect((await running(page)).some((a) => /span__bar/.test(a.cls))).toBe(false);
      return;
    }
    const bar = trace.locator(".span__bar").nth(2);
    expect(await bar.evaluate((b) => getComputedStyle(b).transform)).toMatch(/^matrix\(0(\.0+)?, /);
    await centre(page, ".trace");
    await expect(trace).toHaveClass(/is-in/);
    await expect.poll(() => bar.evaluate((b) => getComputedStyle(b).transform), { timeout: 4000 }).toBe("none");
    await expect(trace).toHaveClass(/is-live/);
    await expect.poll(async () => (await running(page)).some((a) => /span__bar--live/.test(a.cls))).toBe(true);
  });

  test("reduced motion: the charts are the still drawings, with no pause buttons", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/", "/work/arabsstock-assistant/"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
      });
      await expect(page.locator("[data-motion].dg-play, [data-motion].is-live, [data-armed]")).toHaveCount(0);
      await expect(page.locator(".dg-cm, .dg-bgp")).toHaveCount(0);
      for (const b of await page.locator("[data-motion-toggle]").all()) await expect(b).toBeHidden();
      expect((await running(page)).filter((a) => a.chart)).toEqual([]);
    }
  });
});
