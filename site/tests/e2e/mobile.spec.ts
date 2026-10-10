/**
 * Phone acceptance checks (the mobile round; the plan and findings are kept with the audit). Every check is a behaviour
 * or a measurement, never a screenshot match, so later rounds can't silently undo it. Runs on iPhone SE (375×667,
 * WebKit), iPhone 15 (WebKit) and Pixel 7 (Chromium); the chat's own checks live with the widget.
 * Items: HERO-01..03, ERGO-01..04, NAV-01..04, CONTACT-01..06, CV-01..03, CASE-01/02, READ-01..05, PWA-01/02,
 * PERF-01/02/08/09, A11Y-02/03.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test, useTheme } from "./fixtures";

const LOCALES = [
  ["en", "/"],
  ["ar", "/ar/"],
] as const;
const THEMES = ["dark", "light"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Safari's visible height on a 375 × 667 iPhone SE with its toolbars showing. */
const SE_SAFARI_VISIBLE = 548;

async function load(page: Page, path: string, theme: "dark" | "light" = "dark") {
  if (theme === "light") await useTheme(page, "light");
  await page.goto(path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

/** Scrolls an element to the top of the viewport (instantly) and waits for the page's scroll handlers. */
async function scrollToEl(page: Page, selector: string, block: ScrollLogicalPosition = "start") {
  await page.evaluate(
    ([sel, b]) => {
      document.documentElement.style.scrollBehavior = "auto";
      document.querySelector(sel!)!.scrollIntoView({ block: b as ScrollLogicalPosition });
    },
    [selector, block],
  );
  await page.waitForTimeout(350);
}

/**
 * Taps where an element is, without the test runner scrolling it into view first (it scrolls a sticky header's static
 * position into view, which a person never does).
 */
async function tapAt(page: Page, selector: string) {
  const r = (await page.locator(selector).first().boundingBox())!;
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
}

/**
 * Content that runs past the screen's edges (and so is cut off or would scroll the page), outside deliberate sideways
 * scrollers (the "What I build" row, a table region). Hidden and visually hidden elements are left out.
 */
const cutOff = (page: Page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll("header *, main *, body > footer *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest(".sr-only, .hp, [hidden], template, dialog")) continue;
      if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) out.push(`${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} ${Math.round(r.left)}–${Math.round(r.right)}`);
    }
    return out.slice(0, 10);
  });

const box = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  }, selector);

/**
 * Interactive elements whose hit area is under 44 × 44 px. Each one is scrolled to the middle of the screen and the
 * 44 px square around its centre is probed with elementFromPoint, so a hit area grown by padding or a pseudo-element
 * counts, and a stretched link counts as its card. Links inside running text (WCAG 2.5.8's inline exception) and the
 * printable CV sheet's own links are left out.
 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const SEL = "a[href], button, summary, input:not([type=hidden]), select, textarea, [role=button], [tabindex='0']";
    const out: string[] = [];
    const inProse = (el: Element) => {
      const parent = el.parentElement;
      if (!parent) return false;
      const rest = (parent.textContent ?? "").replace(el.textContent ?? "", "");
      return /\p{L}{2}/u.test(rest);
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 2).join(".")} "${(el.textContent ?? "").trim().slice(0, 30) || el.getAttribute("aria-label") || ""}"`;
    for (const el of document.querySelectorAll<HTMLElement>(SEL)) {
      if (el.closest("[inert], dialog:not([open]), template, noscript, .sr-only, .hp, .sheet")) continue;
      if (el.matches(".skip-link, [tabindex='-1'], input[type=hidden]")) continue;
      const details = el.closest("details");
      if (details && !details.open && !(el.matches("summary") && el.parentElement === details)) continue;
      if (!el.getClientRects().length || getComputedStyle(el).visibility !== "visible") continue;
      if (el.matches("a") && inProse(el)) continue;
      const target = el.matches(".stretched") ? (el.closest(".card, .channel") as HTMLElement) ?? el : el;
      let r = target.getBoundingClientRect();
      if (r.width >= 43.5 && r.height >= 43.5) continue;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const pts: [number, number][] = [];
      if (r.height < 43.5) pts.push([cx, cy - 21], [cx, cy + 21]);
      if (r.width < 43.5) pts.push([cx - 21, cy], [cx + 21, cy]);
      const ok = pts.every(([x, y]) => {
        const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, x)), Math.min(innerHeight - 1, Math.max(0, y)));
        return !!hit && (hit === el || el.contains(hit) || target.contains(hit));
      });
      if (!ok) out.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
}

test.describe("phones: the first screen (HERO-01..03, HERO-02)", () => {
  for (const [locale, path] of LOCALES)
    for (const theme of THEMES)
      test(`${locale} ${theme}: ask bar, both buttons and "Open to new roles" are on the first screen`, async ({ page, isMobile }) => {
        test.skip(!isMobile, "phones");
        await load(page, path, theme);
        const h = await page.evaluate(() => innerHeight);
        const status = await box(page, ".hero__status-link");
        expect(status?.height, "availability above the headline").toBeGreaterThan(0);
        expect(status!.bottom).toBeLessThanOrEqual(h);
        const ask = (await box(page, ".ask-bar"))!;
        expect(ask.bottom).toBeLessThanOrEqual(h);
        const viewport = page.viewportSize()!;
        if (viewport.width === 375 && viewport.height === 667) expect(ask.bottom, "ask bar inside Safari's visible area").toBeLessThanOrEqual(SE_SAFARI_VISIBLE);
        const buttons = await page.locator(".hero__actions .btn:visible").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
        expect(buttons).toHaveLength(2);
        for (const b of buttons) expect(b).toBeLessThanOrEqual(h);
        // The short lede (no repeated role) and a 2rem headline.
        await expect(page.locator(".hero__lede--short")).toBeVisible();
        await expect(page.locator(".hero__lede--long")).toBeHidden();
        expect(parseFloat(await page.locator(".hero__title").evaluate((e) => getComputedStyle(e).fontSize))).toBeLessThanOrEqual(32.5);
        // The proof (metrics, "Shipped at") before the graph, starting within the second screen.
        const metrics = (await box(page, ".metrics"))!;
        const art = (await box(page, ".hero__art"))!;
        expect(metrics.top).toBeLessThan(art.top);
        expect(metrics.top).toBeLessThan(2 * h);
      });

  test("the hero doesn't shift while it loads (CLS < 0.01)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await load(page, "/");
    await page.waitForTimeout(1500);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThan(0.01);
  });

  test("every text field is at least 16 px, so iOS never zooms into it (HERO-02)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    for (const path of ["/", "/ar/", "/cv/", "/ar/cv/"]) {
      await load(page, path);
      const sizes = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("input:not([type=hidden]), textarea, select")]
          .filter((el) => !el.closest(".hp"))
          .map((el) => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)] as const),
      );
      for (const [id, px] of sizes) expect(px, `${path} #${id}`).toBeGreaterThanOrEqual(16);
    }
  });

  test("the typed examples run one pass on a touch screen, then rest (PERF-04)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    test.setTimeout(90_000);
    await load(page, "/");
    await expect(page.locator(".ask-bar")).toHaveClass(/is-typing/, { timeout: 8000 });
    await expect(page.locator(".ask-bar")).not.toHaveClass(/is-typing/, { timeout: 70_000 });
  });
});

test.describe("the desktop hero is unchanged @desktop-only", () => {
  test("long lede, availability in the meta line, the CV button downloads the PDF", async ({ page }) => {
    await load(page, "/");
    await expect(page.locator(".hero__status")).toBeHidden();
    await expect(page.locator(".hero__lede--long")).toBeVisible();
    await expect(page.locator(".hero__lede--short")).toBeHidden();
    await expect(page.locator(".hero__meta .hero__open")).toBeVisible();
    await expect(page.locator(".hero__cv--pdf")).toBeVisible();
    await expect(page.locator(".hero__cv--pdf")).toHaveAttribute("download", /\.pdf$/);
    await expect(page.locator(".hero__cv--page")).toBeHidden();
    await expect(page.locator(".dock")).toBeHidden();
    const copy = (await box(page, ".hero__copy"))!;
    const art = (await box(page, ".hero__art"))!;
    expect(art.left).toBeGreaterThan(copy.right - 1);
  });

  test("hover still lifts a card with a mouse", async ({ page }) => {
    await load(page, "/");
    await scrollToEl(page, "#work", "start");
    const card = page.locator(".work-list > .work").nth(1);
    await card.hover();
    await expect.poll(() => card.evaluate((e) => getComputedStyle(e).transform)).not.toBe("none");
  });
});

test.describe("phones: touch targets and feedback (ERGO-02, CONTACT-04, A11Y-02, PWA-01, A11Y-03)", () => {
  for (const path of ["/", "/ar/", "/cv/", "/work/sta-tourism-assistants/", "/work/arabsstock-assistant/", "/ar/work/sta-tourism-assistants/", "/privacy/"])
    test(`no tap target under 44 px on ${path}`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phones");
      test.setTimeout(90_000);
      await load(page, path);
      await page.waitForTimeout(1200); // the chat launcher, the graph's pause button
      expect(await smallTargets(page)).toEqual([]);
    });

  test("a tapped card doesn't stay lifted (no sticky hover)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/");
    await scrollToEl(page, "#work", "start");
    const card = page.locator(".work-list > .work").nth(1);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000); // the card's reveal on scroll (a transform) has finished
    await card.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault(), true));
    await card.locator(".work__title").tap();
    await page.waitForTimeout(400);
    expect(await card.evaluate((e) => getComputedStyle(e).transform)).toBe("none");
  });

  test("a card shows a pressed state while it is held", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/");
    await scrollToEl(page, ".channels", "center");
    const card = page.locator(".channels a.channel").first();
    await card.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault(), true));
    const rest = await card.evaluate((e) => getComputedStyle(e).backgroundColor);
    const r = (await card.boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    const pressed = await card.evaluate((e) => getComputedStyle(e).backgroundColor);
    await page.mouse.up();
    expect(pressed).not.toBe(rest);
  });

  test("the Email card's main area is one link, with the copy button and the Gmail link beside it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/");
    await scrollToEl(page, ".channels", "center");
    const card = (await box(page, ".channel--split"))!;
    const main = (await box(page, ".channel__main"))!;
    expect(main.width).toBeGreaterThan(0.65 * card.width);
    expect(main.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".channel__main")).toHaveAttribute("href", /^mailto:/);
    await expect(page.locator(".channel__copy")).toBeVisible();
    await expect(page.locator(".channel--split .channel__alt a")).toHaveAttribute("href", /^mailto:/);
  });
});

test.describe("safe areas (ERGO-03) @desktop-only", () => {
  test("gutters, the menu sheet, the TOC bar, the footer and the dock pad for the device's safe areas", async ({ page }) => {
    const rules = async () =>
      page.evaluate(() => {
        const texts: string[] = [];
        const walk = (list: CSSRuleList) => {
          for (const r of list) {
            if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
            if (r instanceof CSSStyleRule) texts.push(r.cssText);
          }
        };
        for (const s of document.styleSheets) {
          try {
            walk(s.cssRules);
          } catch {
            /* cross-origin */
          }
        }
        return texts;
      });
    const has = (texts: string[], selector: RegExp, inset: string) => texts.some((t) => selector.test(t.split("{")[0]!) && t.includes(`safe-area-inset-${inset}`));
    await load(page, "/");
    let t = await rules();
    expect(has(t, /(^|,\s*)\.container\b/, "left") && has(t, /(^|,\s*)\.container\b/, "right"), ".container").toBe(true);
    expect(has(t, /\.menu-sheet\b/, "bottom") && has(t, /\.menu-sheet\b/, "left"), ".menu-sheet").toBe(true);
    expect(has(t, /\.footer\b/, "bottom"), ".footer").toBe(true);
    expect(has(t, /\.dock\b/, "bottom"), ".dock").toBe(true);
    await load(page, "/work/arabsstock-assistant/");
    t = await rules();
    expect(has(t, /\.toc-m\b/, "left"), ".toc-m").toBe(true);
  });
});

test.describe("phones: the menu and the header (NAV-01..04)", () => {
  test("the open menu is modal: the page can't scroll or be reached behind it, and it closes three ways", async ({ page, isMobile, browserName }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/");
    const menu = page.locator("[data-menu-button]");
    const sheet = page.locator("[data-menu-sheet]");
    await page.evaluate(() => scrollTo(0, 1500));
    await page.evaluate(() => scrollBy(0, -40)); // the header comes back on a scroll up
    await page.waitForTimeout(400);
    await tapAt(page, "[data-menu-button]");
    await expect(sheet).toBeVisible();
    const y = await page.evaluate(() => scrollY);
    expect(await page.evaluate(() => document.querySelector("main")!.inert)).toBe(true);
    expect(await page.evaluate(() => document.querySelector<HTMLElement>("body > footer")!.inert)).toBe(true);
    await expect(page.locator("[data-menu-scrim]")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    if (browserName === "chromium") {
      const cdp = await page.context().newCDPSession(page);
      const vp = page.viewportSize()!;
      await cdp.send("Input.synthesizeScrollGesture", { x: vp.width / 2, y: vp.height - 60, yDistance: -300, gestureSourceType: "touch" });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => scrollY), "a drag on the scrim doesn't scroll the page").toBe(y);
    }
    // Escape
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(menu).toBeFocused();
    expect(await page.evaluate(() => document.querySelector("main")!.inert)).toBe(false);
    // the scrim
    await tapAt(page, "[data-menu-button]");
    await expect(sheet).toBeVisible();
    const vp = page.viewportSize()!;
    await page.touchscreen.tap(vp.width / 2, vp.height - 40);
    await expect(sheet).toBeHidden();
    await expect(menu).toBeFocused();
    // a link
    await tapAt(page, "[data-menu-button]");
    await sheet.getByRole("link").nth(1).tap();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/#experience$/);
  });

  for (const [locale, path] of LOCALES)
    test(`${locale}: a menu jump lands the section title near the top, below the header`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phones");
      await load(page, path);
      await tapAt(page, "[data-menu-button]");
      await page.locator("[data-menu-sheet]").getByRole("link").nth(1).tap();
      await expect(page).toHaveURL(/#experience$/);
      await page.waitForTimeout(1200);
      const h2 = (await box(page, "#exp-title"))!;
      const nav = (await box(page, "[data-nav]"))!;
      expect(h2.top).toBeLessThanOrEqual(140);
      expect(h2.top).toBeGreaterThanOrEqual(nav.bottom);
    });

  test("switching language mid-page lands on the same section", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    for (const [from, to] of [
      ["/", "/ar/"],
      ["/ar/", "/"],
    ] as const) {
      await load(page, from);
      await scrollToEl(page, "#experience", "start");
      await page.evaluate(() => scrollBy(0, -40));
      await page.waitForTimeout(300);
      await tapAt(page, "[data-menu-button]");
      await page.locator("[data-menu-sheet] .lang-switch").tap();
      await page.waitForURL(new RegExp(`${to.replace(/\//g, "\\/")}#experience$`));
      await page.waitForTimeout(800);
      const h2 = (await box(page, "#exp-title"))!;
      const h = await page.evaluate(() => innerHeight);
      expect(h2.top).toBeGreaterThan(0);
      expect(h2.bottom).toBeLessThan(h);
    }
  });

  test("the header slides away on scroll down and back on scroll up; the case study's TOC bar follows it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/work/arabsstock-assistant/");
    await scrollToEl(page, "#approach", "start");
    await page.evaluate(() => scrollBy(0, 300));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-nav-hidden"))).toBe(true);
    expect((await box(page, "[data-nav]"))!.bottom).toBeLessThanOrEqual(1);
    const toc = (await box(page, ".toc-m"))!;
    expect(toc.top).toBeLessThanOrEqual(1);
    expect(toc.height).toBeLessThan(60);
    await page.evaluate(() => scrollBy(0, -10));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-nav-hidden"))).toBe(false);
    expect((await box(page, "[data-nav]"))!.top).toBeGreaterThanOrEqual(-1);
  });
});

test.describe("phones: the contact form (CONTACT-01..03, -05, -06, PERF-09)", () => {
  async function toForm(page: Page) {
    await load(page, "/");
    await scrollToEl(page, "[data-contact-form]", "start");
  }
  const fill = async (page: Page) => {
    await page.locator("#cf-name").fill("Test Recruiter");
    await page.locator("#cf-email").fill("recruiter@example.com");
    await page.locator("#cf-company").fill("Example");
    await page.locator("#cf-subject").selectOption({ index: 1 });
    await page.locator("#cf-message").fill("Hello Hatem, this is a test message about a role.");
  };

  test("after an error, one tap on Send sends (WebKit dispatched it to the section behind)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    let posts = 0;
    await page.route("**/api/contact", (r) => {
      posts++;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ref: "MH-000000-TEST0" }) });
    });
    await toForm(page);
    await page.locator("[data-submit]").tap();
    await expect(page.locator("[data-summary]")).toBeVisible();
    await fill(page);
    await page.locator("#cf-message").focus();
    await page.locator("[data-submit]").tap();
    await expect(page.locator("[data-success]")).toBeVisible({ timeout: 15_000 });
    expect(posts).toBe(1);
  });

  test("the error summary is scrolled into view under the header, and errors show above their fields", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await toForm(page);
    await scrollToEl(page, "[data-submit]", "center");
    await page.locator("[data-submit]").tap();
    const summary = page.locator("[data-summary]");
    await expect(summary).toBeFocused();
    await expect
      .poll(async () => {
        const s = (await box(page, "[data-summary]"))!;
        const nav = (await box(page, "[data-nav]"))!;
        const h = await page.evaluate(() => innerHeight);
        return s.top >= Math.max(0, nav.bottom) - 1 && s.top <= 0.4 * h;
      })
      .toBe(true);
    const err = (await box(page, "#cf-email-err"))!;
    const input = (await box(page, "#cf-email"))!;
    expect(err.bottom).toBeLessThanOrEqual(input.top + 1);
    expect(parseFloat(await page.locator("#cf-email-err").evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(13.5);
  });

  test("the keyboard's return key moves to the next field instead of submitting", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await toForm(page);
    for (const id of ["name", "email", "company"]) await expect(page.locator(`#cf-${id}`)).toHaveAttribute("enterkeyhint", "next");
    await expect(page.locator("#cf-name")).toHaveAttribute("autocapitalize", "words");
    await expect(page.locator("#cf-company")).toHaveAttribute("autocapitalize", "words");
    for (const id of ["name", "email"]) {
      await expect(page.locator(`#cf-${id}`)).toHaveAttribute("autocorrect", "off");
      await expect(page.locator(`#cf-${id}`)).toHaveAttribute("spellcheck", "false");
    }
    await page.locator("#cf-name").focus();
    await page.keyboard.type("Test");
    await page.keyboard.press("Enter");
    await expect(page.locator("#cf-email")).toBeFocused();
    await expect(page.locator("[data-summary]")).toBeHidden();
    await page.locator("#cf-company").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#cf-subject")).toBeFocused();
  });

  test("Turnstile loads when the form is used, not when it scrolls by, with its height reserved", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    let loads = 0;
    page.on("request", (r) => r.url().startsWith("https://challenges.cloudflare.com/") && loads++);
    await toForm(page);
    await page.waitForTimeout(1000);
    expect(loads).toBe(0);
    const slot = page.locator("[data-turnstile-slot]");
    const size = await slot.getAttribute("data-size");
    expect(size === "compact" || size === "flexible").toBe(true);
    expect((await slot.boundingBox())!.height).toBeGreaterThanOrEqual(size === "compact" ? 140 : 65);
    await page.locator("#cf-name").tap();
    await expect.poll(() => loads).toBeGreaterThan(0);
  });
});

test.describe("phones: the CV (CV-01..03)", () => {
  test("the hero's CV button opens the CV page, not a download", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    let downloads = 0;
    page.on("download", () => downloads++);
    for (const [locale, path] of LOCALES) {
      await load(page, path);
      const cv = page.locator(".hero__actions a:visible", { has: page.locator("svg") }).last();
      await expect(cv).not.toHaveAttribute("download");
      await cv.tap();
      await page.waitForURL(locale === "ar" ? /\/ar\/cv\/$/ : /\/cv\/$/);
    }
    expect(downloads).toBe(0);
  });

  test("on the CV page the PDF opens in the viewer; saving is a separate link", async ({ page, isMobile, browserName }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/cv/");
    const open = page.locator(".cv-pdf--open");
    await expect(open).toBeVisible();
    await expect(open).not.toHaveAttribute("download");
    await expect(page.locator(".cv-pdf--save")).toBeHidden();
    await expect(page.locator(".cv-after__save")).toBeVisible();
    await expect(page.locator(".cv-after__save")).toHaveAttribute("download", /\.pdf$/);
    await expect(page.locator(".cv-after a[data-open-on-touch]")).not.toHaveAttribute("download");
    // (A test browser has no PDF viewer, so where the tap leads isn't checked here: no `download` is what decides it.)
    void browserName;
  });

  test("Share shows only where the browser can share, and shares this CV", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/cv/");
    const native = await page.evaluate(() => typeof navigator.share === "function");
    await expect(page.locator("[data-share]")).toBeVisible({ visible: native });
    await expect(page.locator('.cv-bar [data-copy="url"]')).toBeVisible({ visible: !native });
    // With a (recorded) share sheet: the button shares the page's link, or the PDF where files can be shared.
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: ShareData[] };
      w.__shared = [];
      Object.defineProperty(navigator, "share", { configurable: true, value: async (d: ShareData) => void w.__shared.push(d) });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
    });
    await load(page, "/cv/");
    await page.locator("[data-share]").tap();
    const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.url).toMatch(/\/cv\/$/);
  });

  test("Add to contacts: the vCard is served as a contact card and linked from the CV and Contact", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "phones");
    const res = await request.get("/mohamed-hatem.vcf");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/vcard");
    const text = await res.text();
    expect(text.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(text).toContain("FN:Mohamed Hatem");
    await load(page, "/cv/");
    await expect(page.locator('.cv-bar a[href="/mohamed-hatem.vcf"]')).toBeVisible();
    await load(page, "/");
    await expect(page.locator('.channels a[href="/mohamed-hatem.vcf"]')).toHaveCount(1);
  });
});

test.describe("phones: the action dock (ERGO-01)", () => {
  /** The dock and the chat launcher: the dock's edge and the launcher's, horizontally (8 px apart at least). */
  const gap = (page: Page) =>
    page.evaluate(() => {
      const d = document.querySelector("[data-dock]")!.getBoundingClientRect();
      const b = document.querySelector("[data-mh-chat]")?.shadowRoot?.querySelector("button")?.getBoundingClientRect();
      if (!b?.width) return Infinity;
      return document.dir === "rtl" ? d.left - b.right : b.left - d.right;
    });
  const shown = (page: Page) => page.locator("[data-dock]").evaluate((d) => !(d as HTMLElement).hidden && !d.hasAttribute("data-away") && getComputedStyle(d).visibility === "visible");

  for (const [locale, path] of LOCALES)
    for (const theme of THEMES)
      test(`${locale} ${theme}: CV, WhatsApp and email one tap away from Work, Experience and Skills`, async ({ page, isMobile }) => {
        test.skip(!isMobile, "phones");
        await load(page, path, theme);
        expect(await shown(page), "not over the hero's own buttons").toBe(false);
        for (const id of ["#work", "#experience", "#skills"]) {
          await scrollToEl(page, id, "start");
          await expect.poll(() => shown(page), id).toBe(true);
          const links = page.locator("[data-dock] a");
          await expect(links).toHaveCount(3);
          await expect(links.nth(0)).toHaveAttribute("href", locale === "ar" ? "/ar/cv/" : "/cv/");
          await expect(links.nth(1)).toHaveAttribute("href", /^https:\/\/wa\.me\//);
          await expect(links.nth(2)).toHaveAttribute("href", /^mailto:/);
          for (const r of await links.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
            expect(r.height).toBeGreaterThanOrEqual(44);
            expect(r.width).toBeGreaterThanOrEqual(44);
          }
          expect(await gap(page), "beside the launcher, never over it").toBeGreaterThanOrEqual(8);
        }
        // Away while the contact section (same actions) is on screen, and while the menu is open.
        await scrollToEl(page, "#contact", "start");
        await expect.poll(() => shown(page)).toBe(false);
        await scrollToEl(page, "#experience", "start");
        await expect.poll(() => shown(page)).toBe(true);
        await page.evaluate(() => scrollBy(0, -40));
        await page.waitForTimeout(300);
        await tapAt(page, "[data-menu-button]");
        await expect.poll(() => shown(page)).toBe(false);
        await page.keyboard.press("Escape");
        await expect.poll(() => shown(page)).toBe(true);
        // axe with the dock showing
        const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
      });
});

test.describe("phones: case studies (CASE-01, CASE-02)", () => {
  for (const path of ["/work/sta-tourism-assistants/", "/work/arabsstock-assistant/", "/work/wakeb-bilingual-chatbot/", "/work/empoweromics-ml/", "/ar/work/sta-tourism-assistants/"])
    test(`${path}: every diagram label reads at 11 px or more`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phones");
      await load(page, path);
      const sizes = await page.evaluate(() => {
        const out: number[] = [];
        for (const svg of document.querySelectorAll<SVGSVGElement>(".dg-variant--compact svg")) {
          if (!svg.getClientRects().length) continue;
          const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
          for (const t of svg.querySelectorAll("text")) if (t.getClientRects().length && t.textContent?.trim()) out.push(parseFloat(getComputedStyle(t).fontSize) * k);
        }
        return out;
      });
      expect(sizes.length).toBeGreaterThan(10);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10.95);
    });

  test("the first figure is cut on a phone, and shows whole with its callouts on request", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    for (const path of ["/work/sta-tourism-assistants/", "/work/arabsstock-assistant/"]) {
      await load(page, path);
      const h = await page.evaluate(() => innerHeight);
      const canvas = page.locator(".fig--hero .fig-panel__canvas");
      const cut = (await canvas.boundingBox())!.height;
      expect(cut).toBeLessThanOrEqual(0.72 * h);
      await expect(page.locator(".fig--hero .callouts")).toBeHidden();
      // The story starts much sooner (it was 5–6 screens down on an iPhone SE).
      const story = await page.evaluate(() => document.querySelector("#problem")!.getBoundingClientRect().top + scrollY);
      expect(story / h).toBeLessThan(4);
      const more = page.locator("[data-fig-more]");
      await more.scrollIntoViewIfNeeded();
      await more.tap();
      expect((await canvas.boundingBox())!.height).toBeGreaterThan(cut + 100);
      await expect(page.locator(".fig--hero .callouts")).toBeVisible();
    }
  });

  for (const path of ["/work/sta-tourism-assistants/", "/ar/work/arabsstock-assistant/"])
    test(`${path}: Enlarge opens the full drawing; Back, Escape and Close close it; focus returns`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phones");
      await load(page, path);
      const btn = page.locator("#architecture [data-zoom-figure]");
      const dialog = page.locator("dialog[data-zoom-dialog]");
      const box44 = (await btn.boundingBox())!;
      expect(Math.min(box44.width, box44.height)).toBeGreaterThanOrEqual(44);
      const before = await page.evaluate(() => history.length);
      await btn.tap();
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute("data-kind", "figure");
      // The wide drawing at its design size: wider than the phone, to pan.
      const w = await dialog.locator("[data-zoom-body] > svg").evaluate((s) => s.getBoundingClientRect().width);
      expect(w).toBeGreaterThan(page.viewportSize()!.width);
      // The living charts rest while it is open.
      expect(await page.locator(".dg-play").count()).toBe(0);
      expect((await new AxeBuilder({ page }).include("dialog[data-zoom-dialog]").withTags(TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
      await page.goBack();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(btn).toBeFocused();
      for (const close of ["Escape", "button"] as const) {
        await btn.tap();
        await expect(dialog).toBeVisible();
        if (close === "Escape") await page.keyboard.press("Escape");
        else await dialog.locator("[data-zoom-close]").tap();
        await expect(dialog).toBeHidden();
        await expect(btn).toBeFocused();
      }
      await page.waitForTimeout(300);
      // Each open adds one entry and closing takes it back: the count never grows past the first open (going back
      // leaves its forward entry, which the next open replaces).
      expect(await page.evaluate(() => history.length), "history doesn't grow").toBeLessThanOrEqual(before + 1);
    });
});

test.describe("phones: reading (READ-01, READ-03..05)", () => {
  for (const [locale, path] of LOCALES)
    test(`${locale}: under 10 % of the text is below 13 px, none below 12 px`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phones");
      await load(page, path);
      const r = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let total = 0;
        let under13 = 0;
        const under12: string[] = [];
        for (let n: Node | null; (n = walker.nextNode()); ) {
          const t = (n.textContent ?? "").replace(/\s+/g, "");
          const el = n.parentElement;
          if (!t || !el || el.closest("svg, script, style, template, noscript, .sr-only, .hp")) continue;
          if (!el.getClientRects().length || getComputedStyle(el).visibility !== "visible") continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          total += t.length;
          if (fs < 13) under13 += t.length;
          if (fs < 11.95) under12.push(`${el.className} ${fs}`);
        }
        return { share: under13 / total, under12 };
      });
      expect(r.under12).toEqual([]);
      expect(r.share).toBeLessThan(0.1);
    });

  test("the home page is shorter: What I build is one swipeable row, More work and the smaller repositories wait behind a button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/");
    const h = await page.evaluate(() => innerHeight);
    const bento = page.locator(".bento");
    expect(await bento.evaluate((b) => b.scrollWidth > b.clientWidth + 100)).toBe(true);
    expect((await page.locator("#what").boundingBox())!.height).toBeLessThan(1.3 * h);
    await expect(page.locator(".feature-art")).toBeHidden();
    for (const [toggle, hidden] of [
      ["#work [data-disclose-toggle]", ".more-work__list"],
      ["#projects .repos__toggle", ".repo--small"],
    ] as const) {
      const btn = page.locator(toggle);
      await expect(page.locator(hidden).first()).toBeHidden();
      await expect(btn).toHaveAttribute("aria-expanded", "false");
      await btn.scrollIntoViewIfNeeded();
      await btn.tap();
      await expect(btn).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(hidden).first()).toBeVisible();
    }
    // Work thumbnails: no labels too small to read.
    expect(await page.locator(".work__media svg text").evaluateAll((ts) => ts.filter((t) => t.getClientRects().length).length)).toBe(0);
  });

  test("the experience trace shows each role's dates and duration (no unlabelled lane)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await load(page, "/");
    await expect(page.locator(".span__lane").first()).toBeHidden();
    await expect(page.locator(".trace__head")).toBeHidden();
    await expect(page.locator(".span__dur").first()).toBeVisible();
    await expect(page.locator(".span__dur").first()).toHaveText(/\d/);
  });
});

test.describe("phones: zoom and text size (ERGO-04)", () => {
  test("200 % text: the header wraps, nothing scrolls sideways, the menu button stays on screen", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    for (const path of ["/", "/ar/"]) {
      await load(page, path);
      await page.evaluate(() => {
        const s = new CSSStyleSheet();
        s.replaceSync("html { font-size: 200% !important; }");
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
      });
      await page.waitForTimeout(300);
      const m = (await box(page, "[data-menu-button]"))!;
      const vw = await page.evaluate(() => document.documentElement.clientWidth);
      expect(m.right).toBeLessThanOrEqual(vw + 0.5);
      expect(m.left).toBeGreaterThanOrEqual(-0.5);
      expect(await cutOff(page), path).toEqual([]);
      expect(await page.evaluate(() => (scrollTo(400, scrollY), scrollX)), `${path}: can't scroll sideways`).toBe(0);
    }
  });

  test("175 % page zoom on an iPhone SE (214 px wide): no sideways scroll", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones");
    await page.setViewportSize({ width: 214, height: 381 });
    for (const path of ["/", "/ar/", "/work/sta-tourism-assistants/", "/work/arabsstock-assistant/"]) {
      await load(page, path);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0);
      expect(await cutOff(page), path).toEqual([]);
    }
  });
});

test.describe("phones: images sized for the screen (PERF-08)", () => {
  for (const path of ["/", "/work/logic-controls-website/", "/work/sta-tourism-assistants/"])
    test(`${path}: no image is more than twice what the screen shows`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "phones");
      test.setTimeout(90_000);
      await load(page, path);
      await page.evaluate(async () => {
        document.documentElement.style.scrollBehavior = "auto";
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForTimeout(800);
      const over = await page.evaluate(() => {
        const dpr = Math.min(3, devicePixelRatio);
        return [...document.images]
          // Raster images only (an SVG has no pixel size to over-fetch).
          .filter((i) => i.complete && i.naturalWidth && i.getClientRects().length && !i.closest("dialog") && !/\.svg(\?|$)/.test(i.currentSrc))
          .map((i) => ({ src: i.currentSrc.split("/").pop(), natural: i.naturalWidth, need: i.getBoundingClientRect().width * dpr }))
          .filter((x) => x.need > 0 && x.natural > 2 * x.need + 2);
      });
      expect(over).toEqual([]);
    });
});

test.describe("the installed app's shortcut (PWA-02)", () => {
  test("/?ask=1 opens the assistant once and drops the parameter", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __opens: unknown[] };
      w.__opens = [];
      let api: { open: (o?: unknown) => void } | undefined;
      Object.defineProperty(window, "MHChat", {
        configurable: true,
        get: () => api,
        set: (v: { open: (o?: unknown) => void }) => {
          const open = v.open.bind(v);
          api = { ...v, open: (o?: unknown) => (w.__opens.push(o ?? {}), open(o)) };
        },
      });
    });
    await page.goto("/?ask=1#work");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opens: unknown[] }).__opens.length)).toBe(1);
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).hash).toBe("#work");
  });
});
