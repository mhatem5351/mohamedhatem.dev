/**
 * "Skills, with receipts" on phones (audit VUX-09): below 40rem the seven-column table becomes a list (each skill
 * followed by the places it was used, from the same data), and the full toolbox sits behind a disclosure. The
 * desktop keeps the table and the open toolbox.
 */
import { expect, test } from "./fixtures";

const tableReceipts = () =>
  [...document.querySelectorAll<HTMLTableRowElement>(".matrix tbody tr:not(.grp)")].map((tr) => {
    const heads = [...document.querySelectorAll(".matrix thead th")].map((th) => th.textContent!.trim());
    const cells = [...tr.querySelectorAll("td")];
    return { skill: tr.querySelector("th")!.textContent!.trim(), where: cells.flatMap((td, i) => (td.querySelector(".y") ? [heads[i + 1]] : [])) };
  });
const listReceipts = () =>
  [...document.querySelectorAll(".matrix-list__row")].map((li) => ({
    skill: li.querySelector(".matrix-list__skill")!.textContent!.trim(),
    where: [...li.querySelectorAll(".matrix-list__place")].map((p) => p.firstChild!.textContent!.trim()),
  }));

test.describe("skills on phones", () => {
  for (const path of ["/", "/ar/"])
    test(`${path}: a list with the same receipts as the table, no sideways scrolling @desktop-only`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${path}#skills`);
      await expect(page.locator(".matrix-wrap")).toBeHidden();
      await expect(page.locator(".matrix-list")).toBeVisible();
      const table = await page.evaluate(tableReceipts);
      const list = await page.evaluate(listReceipts);
      expect(table.length).toBeGreaterThan(10);
      expect(list).toEqual(table);
      // Every row shows at least one place, as a chip.
      for (const row of list) expect(row.where.length, row.skill).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });

  test("the full toolbox is behind a disclosure on phones @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#skills");
    const toggle = page.locator("[data-toolbox-toggle]");
    const body = page.locator("#toolbox-body");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(body).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(body).toBeVisible();
    await expect(body.locator(".toolbox__group").first()).toBeVisible();
    await toggle.click();
    await expect(body).toBeHidden();
  });

  test("desktop keeps the table and the open toolbox @desktop-only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#skills");
    await expect(page.locator(".matrix-wrap")).toBeVisible();
    await expect(page.locator(".matrix-list")).toBeHidden();
    await expect(page.locator("[data-toolbox-toggle]")).toBeHidden();
    await expect(page.locator("#toolbox-body")).toBeVisible();
  });

  test("without JavaScript the toolbox is shown on phones too @desktop-only", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/#skills");
    await expect(page.locator("#toolbox-body")).toBeVisible();
    await expect(page.locator("[data-toolbox-toggle]")).toBeHidden();
    await ctx.close();
  });
});
