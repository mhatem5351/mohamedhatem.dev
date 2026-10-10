import type { Page, Request } from "@playwright/test";
import { en } from "@content/i18n/en.ts";
import { ar } from "@content/i18n/ar.ts";
import { expect, test } from "./fixtures";

const form = (page: Page) => page.locator("#contact form").first();
/** The inline error under a field (the same text also appears in the error summary). */
const inline = (page: Page, text: string) => form(page).locator("[id$='-err']").getByText(text, { exact: true });

async function fill(page: Page, m: typeof en, values: Partial<Record<"name" | "email" | "company" | "message", string>> & { topic?: string }) {
  const f = form(page);
  if (values.name !== undefined) await f.getByLabel(m.contact.form.name.label).fill(values.name);
  if (values.email !== undefined) await f.getByLabel(m.contact.form.email.label, { exact: false }).first().fill(values.email);
  if (values.company !== undefined) await f.getByLabel(m.contact.form.company.label, { exact: false }).fill(values.company);
  if (values.topic !== undefined)
    await f.getByLabel(m.contact.form.topic.label).selectOption({ label: m.contact.form.topic.options[values.topic as keyof typeof m.contact.form.topic.options] });
  if (values.message !== undefined) await f.getByLabel(m.contact.form.message.label).fill(values.message);
}

test.describe("contact form", () => {
  test("validates on the client and announces errors", async ({ page }) => {
    let posted = 0;
    await page.route("**/api/contact", (r) => {
      posted++;
      return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"ref":"MH-TEST"}' });
    });
    await page.goto("/#contact");
    await form(page).getByRole("button", { name: en.contact.form.submit }).click();
    expect(posted).toBe(0);
    const summary = page.getByText(/Please fix \d+ fields? below\./);
    await expect(summary).toBeVisible();
    await expect(form(page).getByLabel(en.contact.form.name.label)).toHaveAttribute("aria-invalid", "true");
    // Each error shows inline (linked to its field) and in the summary.
    await expect(inline(page, en.contact.errors.nameRequired)).toBeVisible();
    await expect(inline(page, en.contact.errors.emailRequired)).toBeVisible();
    await expect(inline(page, en.contact.errors.topicRequired)).toBeVisible();
    await expect(inline(page, en.contact.errors.messageRequired)).toBeVisible();
    // Focus moves to the error summary on a failed submit.
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[data-summary]"))).toBe(true);

    await fill(page, en, { email: "sara@" });
    await form(page).getByRole("button", { name: en.contact.form.submit }).click();
    await expect(inline(page, en.contact.errors.emailInvalid)).toBeVisible();
    // The error is linked to the field.
    const email = form(page).getByLabel(en.contact.form.email.label, { exact: false }).first();
    const describedBy = (await email.getAttribute("aria-describedby")) ?? "";
    const ids = describedBy.split(/\s+/).filter(Boolean);
    const texts = await Promise.all(ids.map((id) => page.locator(`#${id}`).textContent()));
    expect(texts.join(" ")).toContain(en.contact.errors.emailInvalid);
  });

  test("sends the Worker's contract and shows the success state", async ({ page }) => {
    let request: Request | undefined;
    await page.route("**/api/contact", (r) => {
      request = r.request();
      return r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"ref":"MH-261010-TEST1"}' });
    });
    await page.goto("/#contact");
    await fill(page, en, { name: "Sara Recruiter", email: "sara@example.com", company: "Acme AI", topic: "role", message: "We have a Senior AI Engineer role that fits your profile." });
    await expect(page.locator("#contact [data-turnstile-stub], #contact .turnstile-slot").first()).toBeAttached();
    await form(page).getByRole("button", { name: en.contact.form.submit }).click();
    await expect(page.getByRole("heading", { name: en.contact.success.title })).toBeVisible();
    await expect(page.getByRole("heading", { name: en.contact.success.title })).toBeFocused();
    expect(request).toBeDefined();
    const body = request!.postDataJSON() as Record<string, string>;
    expect(body).toMatchObject({ name: "Sara Recruiter", email: "sara@example.com", company: "Acme AI", subject: "hiring", lang: "en", mh_hp: "" });
    expect(body).not.toHaveProperty("website");
    await expect(page.getByText("Reference: MH-261010-TEST1")).toBeVisible();
    expect(body.message).toContain("Senior AI Engineer");
    expect(body.turnstileToken).toBe("test-token");
  });

  test("maps API errors to messages (429, 502, offline)", async ({ page }) => {
    let status = 429;
    await page.route("**/api/contact", (r) =>
      status === 0 ? r.abort("internetdisconnected") : r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: false, error: status === 429 ? "rate_limited" : "send_failed" }) }),
    );
    await page.goto("/#contact");
    await fill(page, en, { name: "Sara", email: "sara@example.com", topic: "project", message: "A project I would like to discuss with you." });
    const submit = form(page).getByRole("button", { name: en.contact.form.submit });
    await submit.click();
    await expect(page.getByText(en.contact.errors.rateLimited).first()).toBeVisible();
    status = 502;
    await submit.click();
    await expect(page.getByText(/Something went wrong and your message wasn't sent/).first()).toBeVisible();
    // The direct channels are one tap away from the error.
    await expect(form(page).locator("[data-status-links]")).toBeVisible();
    status = 0;
    await submit.click();
    await expect(page.getByText(en.contact.errors.network).first()).toBeVisible();
  });

  test("a non-JSON 429 or 5xx (Cloudflare answering, not the Worker) shows the form as unavailable, with the channels", async ({ page }) => {
    let status = 429;
    await page.route("**/api/contact", (r) => r.fulfill({ status, contentType: "text/plain", body: "error code: 1027" }));
    await page.goto("/#contact");
    await fill(page, en, { name: "Sara", email: "sara@example.com", topic: "project", message: "A project I would like to discuss with you." });
    const submit = form(page).getByRole("button", { name: en.contact.form.submit });
    for (status of [429, 503]) {
      await submit.click();
      const alert = form(page).locator("[data-status]");
      await expect(alert).toContainText(en.contact.errors.unavailable);
      await expect(alert).not.toContainText(en.contact.errors.rateLimited);
      const links = alert.locator("[data-status-links] a");
      await expect(links).toHaveCount(2);
      await expect(links.nth(0)).toHaveAttribute("href", /^mailto:hatem@mohamedhatem\.dev/);
      await expect(links.nth(1)).toHaveAttribute("href", /^https:\/\/wa\.me\/201142070946/);
    }
  });

  test("the error summary is an alert, named by its heading", async ({ page }) => {
    await page.goto("/#contact");
    await form(page).getByRole("button", { name: en.contact.form.submit }).click();
    const summary = form(page).locator("[data-summary]");
    await expect(summary).toHaveAttribute("role", "alert");
    await expect(page.getByRole("alert", { name: /Please fix \d+ fields? below\./ })).toBeVisible();
  });

  test("works in Arabic with Arabic messages", async ({ page }) => {
    await page.goto("/ar/#contact");
    await form(page).getByRole("button", { name: ar.contact.form.submit }).click();
    await expect(inline(page, ar.contact.errors.nameRequired)).toBeVisible();
  });
});

/**
 * Turnstile's own sizes, as a stub: "normal" 300 × 65, "flexible" 100% wide with a 300 px minimum, "compact" 150 × 140.
 * The fixtures' stub draws nothing, so it could never show a too-wide widget.
 */
const SIZED_TURNSTILE = `(() => {
  window.turnstile = {
    render(el, o) {
      const box = document.createElement("div");
      box.setAttribute("data-ts-size", o.size || "normal");
      box.style.cssText = o.size === "compact" ? "width:150px;height:140px" : o.size === "flexible" ? "width:100%;min-width:300px;height:65px" : "width:300px;height:65px";
      el.append(box);
      setTimeout(() => o.callback && o.callback("test-token"), 30);
      return "ts-" + Math.random().toString(36).slice(2);
    },
    reset() {}, remove() {}, getResponse() { return "test-token"; }, ready(cb) { cb && cb(); },
  };
})();`;

test.describe("contact form on narrow screens (audit VUX-07)", () => {
  for (const width of [320, 360, 375])
    test(`at ${width} px Turnstile fits the card and the page never scrolls sideways @desktop-only`, async ({ page }) => {
      await page.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: SIZED_TURNSTILE }));
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/#contact", { waitUntil: "networkidle" });
      await form(page).locator("#cf-name").focus();
      const widget = form(page).locator("[data-ts-size]");
      await expect(widget).toBeAttached();
      const m = await page.evaluate(() => {
        const slot = document.querySelector<HTMLElement>("[data-turnstile-slot]")!;
        const card = document.querySelector<HTMLElement>("#contact .contact-card")!;
        const pad = parseFloat(getComputedStyle(card).paddingInlineEnd);
        return {
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          formRight: Math.round(document.querySelector("#contact form")!.getBoundingClientRect().right),
          cardInner: Math.round(card.getBoundingClientRect().right - pad),
          slot: slot.clientWidth,
          size: slot.querySelector("[data-ts-size]")!.getAttribute("data-ts-size"),
        };
      });
      expect(m.scroll).toBeLessThanOrEqual(m.client);
      expect(m.formRight).toBeLessThanOrEqual(m.cardInner);
      expect(m.size).toBe(m.slot < 300 ? "compact" : "flexible");
    });

  test("wide screens keep the flexible widget @desktop-only", async ({ page }) => {
    await page.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: SIZED_TURNSTILE }));
    await page.goto("/#contact", { waitUntil: "networkidle" });
    await form(page).locator("#cf-name").focus();
    await expect(form(page).locator("[data-ts-size]")).toHaveAttribute("data-ts-size", "flexible");
  });
});
