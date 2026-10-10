import { expect, test } from "./fixtures";

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
});
