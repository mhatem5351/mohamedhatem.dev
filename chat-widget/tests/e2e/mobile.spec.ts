import { expect, test, type Page } from "@playwright/test";
import { STRINGS } from "../../src/i18n";
import { answer, ask, bubble, dialog, log, mock, openDemo, requests, setup, shadowFocus } from "./helpers";

test.beforeEach(async ({ page }) => setup(page));

test("full-screen modal sheet: page inert and unscrollable, focus trapped, Escape closes @mobile", async ({ page }) => {
  await openDemo(page);
  await expect(page.locator("[data-mh-chat] .l")).toBeHidden(); // icon-only bubble on phones
  await expect(bubble(page)).toHaveAccessibleName("Ask my AI assistant");
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
  // Full screen once the slide-in transition has settled.
  await expect.poll(async () => Object.values((await dialog(page).boundingBox()) ?? {})).toEqual([0, 0, 390, 844]);
  expect(await page.evaluate(() => (document.querySelector("main") as HTMLElement).inert)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  // Tab past the last control wraps to the first, Shift+Tab before the first wraps to the last.
  await page.locator("[data-mh-chat] textarea").fill("Hi");
  await page.locator("[data-mh-chat] textarea").focus();
  await page.keyboard.press("Tab"); // → Send
  expect(await shadowFocus(page)).toBe("button.go");
  await page.keyboard.press("Tab"); // wraps → New chat
  expect(await shadowFocus(page)).toBe("button.ib");
  await page.keyboard.press("Shift+Tab"); // wraps → Send
  expect(await shadowFocus(page)).toBe("button.go");

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => (document.querySelector("main") as HTMLElement).inert)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  expect(await shadowFocus(page)).toMatch(/^button\.b/);
});

test("phones show the first 4 starter suggestions @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(page.locator("[data-mh-chat] .chip")).toHaveCount(4);
});

test("a jump link closes the sheet and scrolls to the section @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await mock(page, answer("His experience:", [["open_section", { id: "projects" }]]));
  await ask(page, "Projects?");
  await page.getByRole("link", { name: "Go to Projects" }).tap();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("projects")!.getBoundingClientRect().top))).toBeLessThan(120);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("projects");
});

test("Enter on a chip in the sheet keeps focus in the sheet, on the textarea @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  await mock(page, answer("Sure."));
  await expect(page.locator("[data-mh-chat] .chip").first()).toBeVisible();
  await page.locator("[data-mh-chat] .chip").first().focus();
  await page.keyboard.press("Enter");
  expect(await shadowFocus(page)).toBe("textarea");
  await expect(log(page)).toContainText("Sure.");
  expect(await shadowFocus(page)).toBe("textarea");
});

test("a tapped chip keeps focus in the sheet without raising the keyboard (the log) @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await mock(page, answer("Sure."));
  await page.locator("[data-mh-chat] .chip").first().tap();
  await expect(log(page)).toContainText("Sure.");
  expect(await shadowFocus(page)).toBe("div.log");
  // The sheet asks the Worker for shorter answers.
  expect((await requests(page))[0]!.device).toBe("phone");
});

test("the sheet is not reopened on the next page (it would cover it) @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("mh-chat:open"))).toBeNull();
  await page.reload();
  await expect(bubble(page)).toHaveAttribute("aria-expanded", "false");
  await expect(dialog(page)).toHaveCount(0);
});

test("opening the sheet focuses the conversation, not the textarea: no keyboard over the suggestions @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  expect(await shadowFocus(page)).toBe("div.log");
  // A draft to edit still goes to the textarea.
  await page.evaluate(() => (window as unknown as { MHChat: { open(o: unknown): void } }).MHChat.open({ question: "Draft", send: false }));
  expect(await shadowFocus(page)).toBe("textarea");
});

test("Back closes the sheet (its history entry), × takes the entry back @mobile", async ({ page }) => {
  await openDemo(page);
  const start = await page.evaluate(() => history.length);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => (history.state as { mhChat?: number } | null)?.mhChat)).toBe(1);
  await page.goBack();
  await expect(dialog(page)).toBeHidden();
  expect(await shadowFocus(page)).toMatch(/^button\.b/); // what opened it
  for (let i = 0; i < 3; i++) {
    await bubble(page).tap();
    await expect(dialog(page)).toBeVisible();
    await page.getByRole("button", { name: STRINGS.en.close }).tap();
    await expect(dialog(page)).toBeHidden();
    await expect.poll(() => page.evaluate(() => !!(history.state as { mhChat?: number } | null)?.mhChat)).toBe(false);
  }
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(start + 1);
});

/** A touch drag of `dy` px on the sheet's header title (Chromium touch input → pointer events). */
async function drag(page: Page, dy: number): Promise<void> {
  const b = (await page.locator("[data-mh-chat] .hx").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const at = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: b.x + 8, y }] });
  await at("touchStart", b.y + 10);
  for (let i = 1; i <= 8; i++) {
    await at("touchMove", b.y + 10 + (dy * i) / 8);
    await page.waitForTimeout(40);
  }
  await at("touchEnd");
  await cdp.detach();
}

test("a grab bar; swiping the header down past 80 px closes the sheet, a short drag springs back @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  expect(await page.locator("[data-mh-chat] .hd").evaluate((el) => getComputedStyle(el, "::before").content)).not.toBe("none");
  await drag(page, 30);
  await expect(dialog(page)).toBeVisible();
  await expect.poll(() => dialog(page).evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  await drag(page, 120);
  await expect(dialog(page)).toBeHidden();
});

test("with the keyboard up (visualViewport), the sheet fits above it: header, Close and composer in view @mobile", async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.visualViewport!;
    const fake = new EventTarget();
    let kb = 0;
    for (const k of ["width", "offsetLeft", "pageLeft", "pageTop", "scale"] as const) Object.defineProperty(fake, k, { get: () => real[k] });
    Object.defineProperty(fake, "height", { get: () => real.height - kb });
    Object.defineProperty(fake, "offsetTop", { get: () => kb });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
    (window as unknown as { __kb(px: number): void }).__kb = (px) => {
      kb = px;
      fake.dispatchEvent(new Event("resize"));
    };
  });
  await openDemo(page);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  await page.waitForFunction(() => document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelector(".pn")!.getAnimations().length === 0);
  await page.evaluate(() => (window as unknown as { __kb(px: number): void }).__kb(336));
  const box = (s: string) => page.locator(`[data-mh-chat] ${s}`).first().evaluate((el) => [el.getBoundingClientRect().top, el.getBoundingClientRect().bottom].map(Math.round));
  for (const s of [".hd", `[aria-label="${STRINGS.en.close}"]`, ".cp"]) {
    const [top, bottom] = await box(s);
    expect(top).toBeGreaterThanOrEqual(336 - 1);
    expect(bottom).toBeLessThanOrEqual(844 + 1);
  }
  await page.evaluate(() => (window as unknown as { __kb(px: number): void }).__kb(0));
  await expect.poll(() => box(".pn")).toEqual([0, 844]);
});

test("44 px targets in the sheet: chips, header buttons, contact card, copy (hit area) and jump link @mobile", async ({ page }) => {
  await openDemo(page);
  await bubble(page).tap();
  await mock(page, answer("Reach him here.", [["show_contact_card", { reason: "general" }], ["open_section", { id: "projects" }]]));
  await ask(page, "Contact?");
  await expect(page.getByRole("link", { name: "WhatsApp" })).toBeVisible();
  const small = await page.evaluate(() =>
    [...document.querySelector("[data-mh-chat]")!.shadowRoot!.querySelectorAll<HTMLElement>(".pn button:not([hidden]), .pn a.btn, .pn a.jump, .pn textarea")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hit = getComputedStyle(el, "::after");
        const extra = hit.content !== "none" ? -(parseFloat(hit.top) + parseFloat(hit.bottom)) : 0;
        return { el: el.className, h: Math.round(r.height + extra) };
      })
      .filter((x) => x.h < 44),
  );
  expect(small).toEqual([]);
});

test("small phones (320 px): a one-line header and a one-line placeholder; the subtitle still describes the dialog @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const query of ["", "lang=ar"]) {
    await openDemo(page, query);
    await bubble(page).tap();
    await expect(dialog(page)).toBeVisible();
    // Audit M-11: the header was 106 px (title and subtitle on two lines each); the subtitle goes below 375 px.
    await expect(page.locator("[data-mh-chat] #mhc-sub")).toBeHidden();
    await expect(dialog(page)).toHaveAccessibleDescription(/LinkedIn/);
    const title = page.locator("[data-mh-chat] .ti");
    expect(await title.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))).toBe(1);
    expect(await page.locator("[data-mh-chat] .hd").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(80);
    // The placeholder stays on one line instead of wrapping into a second, cut-off line.
    const ta = page.locator("[data-mh-chat] textarea");
    expect(await ta.evaluate((el) => getComputedStyle(el, "::placeholder").whiteSpace)).toBe("nowrap");
    expect(await ta.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  }
});

test("the sheet slides in from the bottom edge, opaque: the page never shows through it (audit M-12) @mobile", async ({ page }) => {
  await openDemo(page);
  // The panel is built on the first intent (warm), closed: parked below the screen at full opacity.
  await page.evaluate(() => (window as unknown as { MHChat: { warm(): void } }).MHChat.warm());
  const pn = page.locator("[data-mh-chat] .pn");
  await expect(pn).toBeAttached();
  expect(await pn.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transform])).toEqual(["1", "matrix(1, 0, 0, 1, 0, 844)"]);
  await bubble(page).tap();
  await expect(dialog(page)).toBeVisible();
  await expect.poll(() => pn.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  expect(await pn.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
});
