/**
 * Shared fixtures: every test page gets
 *  - third-party stubs: the Cloudflare Web Analytics beacon (empty script) and Turnstile (a fake api.js whose
 *    render() calls back with a test token), so tests are hermetic and deterministic;
 *  - /api/chat answered with 503 "unavailable" unless a test routes it (the widget then shows its offline state);
 *  - a console/pageerror collector (`errors`), asserted empty by the page sweep.
 */
import { test as base, expect, type Page } from "@playwright/test";

export const TURNSTILE_STUB = `
  (function () {
    const widgets = {};
    const issue = (id) => setTimeout(() => { const o = widgets[id]; o && o.callback && o.callback("test-token"); }, 30);
    window.turnstile = {
      render(el, opts) {
        const id = "ts-" + Math.random().toString(36).slice(2);
        const box = typeof el === "string" ? document.querySelector(el) : el;
        if (box) box.setAttribute("data-turnstile-stub", id);
        widgets[id] = opts || {};
        issue(id);
        return id;
      },
      reset(id) { if (id && widgets[id]) issue(id); else Object.keys(widgets).forEach(issue); },
      remove(id) { delete widgets[id]; },
      getResponse() { return "test-token"; },
      execute(id) { issue(id); },
      ready(cb) { cb && cb(); },
    };
    const s = document.currentScript; const u = s && s.src ? new URL(s.src) : null;
    const onload = u && u.searchParams.get("onload");
    if (onload && typeof window[onload] === "function") window[onload]();
  })();
`;

export async function stubThirdParties(page: Page): Promise<void> {
  await page.route("https://static.cloudflareinsights.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route("https://cloudflareinsights.com/**", (r) => r.fulfill({ status: 204, body: "" }));
  await page.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: TURNSTILE_STUB }));
  await page.route("**/api/chat", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable", message: "offline in tests" }) }),
  );
}

/** Messages that are expected and harmless in tests (e.g. the mocked API's status codes). */
const IGNORED = [/status of 503/, /status of 404 \(Not Found\)/, /Failed to load resource.*\/api\//];
/**
 * WebKit engine quirk: any <select> on a page whose style-src has no 'unsafe-inline' logs this, because WebKit
 * applies its own user-agent stylesheet inside the select's shadow tree and checks it against the page CSP. The
 * select still renders and works (verified on the contact form); it is not a stylesheet of ours.
 */
const WEBKIT_IGNORED = [/^Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive/];

export const test = base.extend<{ errors: string[] }>({
  // auto: every test gets the stubs and the collector, even when it doesn't read `errors`.
  errors: [
    async ({ page, browserName }, use) => {
    const errors: string[] = [];
    const ignored = browserName === "webkit" ? [...IGNORED, ...WEBKIT_IGNORED] : IGNORED;
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (!ignored.some((re) => re.test(text))) errors.push(text);
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await stubThirdParties(page);
    await use(errors);
    },
    { auto: true },
  ],
});

export { expect };

/** Sets the stored theme before any script runs. */
export async function useTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("mh-theme", t);
    } catch {}
  }, theme);
}
