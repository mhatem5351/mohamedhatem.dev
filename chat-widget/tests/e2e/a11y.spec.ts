import AxeBuilder from "@axe-core/playwright";
import { STRINGS } from "../../src/i18n";
import { expect, test, type Page } from "@playwright/test";
import { answer, ask, bubble, dialog, input, log, mock, openDemo, setup } from "./helpers";

/** WCAG 2.0–2.2 A/AA rules, scoped to the widget (the demo page itself is not under test). */
async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .include("[data-mh-chat]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa", "best-practice"])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test.beforeEach(async ({ page }) => {
  // Static frames for colour checks (no mid-animation opacity).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
});

test("axe: closed bubble (EN, light)", async ({ page }) => {
  await openDemo(page, "theme=light");
  expect(await axe(page)).toEqual([]);
});

test("axe: closed bubble (AR, dark)", async ({ page }) => {
  await openDemo(page, "lang=ar&theme=dark");
  expect(await axe(page)).toEqual([]);
});

test("axe: open panel with starter chips (EN, light)", async ({ page }) => {
  await openDemo(page, "theme=light");
  await bubble(page).click();
  await expect(dialog(page)).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("axe: answer with contact card, jump link and follow-ups (EN, light)", async ({ page }) => {
  await openDemo(page, "theme=light");
  await bubble(page).click();
  await mock(
    page,
    answer("Hatem is an **AI Team Lead** at Globant.\n\n- One\n- Two\n\n[GitHub](https://github.com/mhatem5351)", [
      ["show_contact_card", { reason: "hiring" }],
      ["open_section", { id: "experience" }],
      ["suggest_followups", { questions: ["Is he open to new roles?"] }],
    ]),
  );
  await ask(page, "How do I hire him?");
  await expect(page.getByRole("group", { name: "Get in touch with Hatem" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("axe: Arabic answer with contact card (AR, dark)", async ({ page }) => {
  await openDemo(page, "lang=ar&theme=dark");
  await bubble(page).click();
  await mock(page, answer("يعمل حاتم **قائد فريق** في Globant.", [["show_contact_card", { reason: "hiring" }], ["suggest_followups", { questions: ["ما مهاراته؟"] }]]));
  await ask(page, "كيف أتواصل معه؟");
  await expect(page.getByRole("group", { name: "تواصل مع حاتم" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("axe: error state with Retry (EN, dark)", async ({ page }) => {
  await openDemo(page, "theme=dark");
  await bubble(page).click();
  await mock(page, { events: [["error", { code: "timeout", message: "t", retryable: true }]] });
  await ask(page, "Hi");
  await expect(log(page).getByRole("button", { name: STRINGS.en.retry })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("axe: mobile sheet @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).click();
  await expect(dialog(page)).toBeVisible();
  await mock(page, answer("Sure.", [["show_contact_card", { reason: "general" }]]));
  await ask(page, "Contact?");
  await expect(page.getByRole("group", { name: "Get in touch with Hatem" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("axe: over-limit notice, counter and the trimmed note (EN, dark)", async ({ page }) => {
  await openDemo(page, "theme=dark");
  await bubble(page).click();
  await input(page).fill("x".repeat(6100));
  await expect(page.locator("[data-mh-chat] .ln")).not.toBeEmpty();
  expect(await axe(page)).toEqual([]);
  await mock(page, answer("Ok."));
  await input(page).press("Enter");
  await expect(page.locator("[data-mh-chat] .msg.u .note")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test.describe("forced colors (Windows High Contrast)", () => {
  const edge = (el: Element) => {
    const s = getComputedStyle(el);
    return { width: s.borderTopWidth, style: s.borderTopStyle, transparent: s.borderTopColor === "rgba(0, 0, 0, 0)" };
  };
  const ring = (el: Element) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle };
  };

  test("the bubble and the panel's borderless controls get a painted edge; focus shows an outline", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await openDemo(page);
    expect(await bubble(page).evaluate(edge)).toEqual({ width: "1px", style: "solid", transparent: false });
    await bubble(page).focus();
    expect(await bubble(page).evaluate(ring)).toEqual({ width: "2px", style: "solid" });

    await bubble(page).click();
    await expect(dialog(page)).toBeVisible();
    for (const sel of ["button.ib", "button.go"]) {
      expect(await page.locator(`[data-mh-chat] ${sel}`).first().evaluate(edge)).toEqual({ width: "1px", style: "solid", transparent: false });
    }
    await input(page).focus();
    await page.keyboard.type("Hi");
    expect(await input(page).evaluate(ring)).toEqual({ width: "2px", style: "solid" });
    expect(await input(page).evaluate(edge)).toMatchObject({ width: "1px", transparent: false });
    await mock(page, answer("Hello."));
    await input(page).press("Enter");
    await expect(log(page)).toContainText("Hello.");
    expect(await page.locator("[data-mh-chat] .ub").evaluate(edge)).toEqual({ width: "1px", style: "solid", transparent: false });
  });

  test("without forced colors the new borders stay invisible", async ({ page }) => {
    await openDemo(page);
    expect(await bubble(page).evaluate(edge)).toMatchObject({ transparent: true });
  });
});
