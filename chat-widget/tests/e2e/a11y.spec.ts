import AxeBuilder from "@axe-core/playwright";
import { STRINGS } from "../../src/i18n";
import { expect, test, type Page } from "@playwright/test";
import { answer, ask, bubble, dialog, log, mock, openDemo, setup } from "./helpers";

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
