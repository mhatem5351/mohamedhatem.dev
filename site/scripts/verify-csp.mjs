#!/usr/bin/env node
/**
 * Checks the Content-Security-Policy against the REAL third-party scripts (needs the network): Cloudflare Turnstile
 * (contact form and chat) and the Web Analytics beacon, in Chromium and WebKit. tests/e2e/csp.spec.ts runs the same
 * check hermetically with stubs; this one proves the stubbed origins are the ones the real scripts use.
 *
 *   node scripts/verify-csp.mjs              serves ../dist on a free port
 *   node scripts/verify-csp.mjs --base URL   checks a running server (e.g. wrangler dev)
 *
 * The production Turnstile key only works on mohamedhatem.dev, so the pages' key is swapped for Cloudflare's
 * always-pass test key (1x00000000000000000000AA) on the way in; the widget then loads and solves for real.
 * /api/* is answered locally (503), so nothing reaches the Worker or Gemini. Exits 1 on any violation.
 */
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { startServer } from "./serve.mjs";

const args = process.argv.slice(2);
const baseArg = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
const server = baseArg ? null : await startServer({ dir: fileURLToPath(new URL("../../dist", import.meta.url)), port: 0, quiet: true });
const BASE = baseArg ?? `http://127.0.0.1:${server.address().port}`;
const TEST_KEY = "1x00000000000000000000AA";
const PATHS = ["/", "/ar/", "/work/arabsstock-assistant/", "/cv/", "/privacy/"];

let failures = 0;
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"error":"unavailable"}' }));
  await ctx.route(`${BASE}/**`, async (r) => {
    if (r.request().resourceType() !== "document") return r.continue();
    const res = await r.fetch();
    const body = (await res.text()).replace(/0x4AAAAAA[A-Za-z0-9_-]+/g, TEST_KEY);
    return r.fulfill({ response: res, body });
  });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`), true);
  });
  for (const path of PATHS) {
    const page = await ctx.newPage();
    const thirdParty = new Set();
    page.on("request", (q) => {
      const u = new URL(q.url());
      if (!u.href.startsWith(BASE) && u.protocol.startsWith("http")) thirdParty.add(u.hostname);
    });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    await page.evaluate(() => window.MHChat?.open());
    await page.waitForTimeout(4000); // Turnstile loads its iframe and solves with the test key
    const solved = await page.evaluate(() => [...document.querySelectorAll("input[name='cf-turnstile-response']")].some((i) => i.value.length > 0));
    const hasSelect = await page.locator("select").count();
    const found = (await page.evaluate(() => window.__csp)).filter((v) => !(name === "webkit" && hasSelect && /^style-src-attr inline :\d+:\d+$/.test(v)));
    console.log(`${name} ${path}: ${found.length ? `VIOLATIONS ${JSON.stringify(found)}` : "no violations"}; third-party hosts: ${[...thirdParty].sort().join(", ") || "none"}; Turnstile token: ${solved ? "yes" : "no"}`);
    if (found.length) failures++;
    await page.close();
  }
  await browser.close();
}
server?.close();
process.exit(failures ? 1 : 0);
