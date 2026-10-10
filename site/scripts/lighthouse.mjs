#!/usr/bin/env node
/**
 * Lighthouse on the built site, mobile and desktop, with Chrome for Testing from Playwright's cache.
 *
 *   node scripts/lighthouse.mjs                               ../dist, default pages, mobile + desktop
 *   node scripts/lighthouse.mjs --dist <dir> --pages /,/ar/ --presets mobile --port 4500
 *
 * Serves the build with scripts/serve.mjs (same routing as Workers static assets, public/_headers applied) behind a
 * Brotli/gzip proxy (scripts/lib/compress-proxy.mjs: Cloudflare compresses text assets, plain Node doesn't) and
 * writes site/lighthouse/<page>-<preset>.json plus a summary table (scores; LCP, CLS, TBT). /api/* is the Worker
 * and isn't served locally, so the chat and contact form make no requests during the runs (they don't on load).
 * Analytics: production builds embed the Cloudflare Web Analytics beacon. From a localhost origin its report is
 * refused by CORS (a console error that the live site doesn't have) and Cloudflare's own script trips the
 * legacy-JavaScript insight, so runs block *cloudflareinsights.com* by default to measure the site itself.
 * --with-analytics keeps it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { chromium } from "playwright";
import { startCompressedServer } from "./lib/compress-proxy.mjs";

const args = process.argv.slice(2);
const arg = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const DIST = resolve(arg("dist", fileURLToPath(new URL("../../dist", import.meta.url))));
const PORT = Number(arg("port", 4500));
const PAGES = arg("pages", "/,/ar/,/work/arabsstock-assistant/,/cv/").split(",");
const PRESETS = arg("presets", "mobile,desktop").split(",");
const BLOCKED = args.includes("--with-analytics") ? [] : ["*cloudflareinsights.com*"];
const OUT = fileURLToPath(new URL("../lighthouse/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const server = await startCompressedServer({ dir: DIST, port: PORT });
const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"] });
const name = (p) => (p.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "index").replace(/^ar$/, "index-ar").replace(/^ar-/, "ar-");
const rows = [];
try {
  for (const preset of PRESETS) {
    for (const page of PAGES) {
      const url = `http://localhost:${PORT}${page}`;
      const result = await lighthouse(
        url,
        { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"], blockedUrlPatterns: BLOCKED },
        preset === "desktop" ? desktopConfig : undefined,
      );
      if (!result) throw new Error(`no result for ${url}`);
      const lhr = result.lhr;
      writeFileSync(`${OUT}${name(page)}-${preset}.json`, typeof result.report === "string" ? result.report : JSON.stringify(lhr));
      const score = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
      const audit = (k) => lhr.audits[k]?.displayValue ?? "";
      const failing = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "notApplicable" && a.scoreDisplayMode !== "manual")
        .map((a) => a.id);
      rows.push({
        page,
        preset,
        perf: score("performance"),
        a11y: score("accessibility"),
        bp: score("best-practices"),
        seo: score("seo"),
        lcp: audit("largest-contentful-paint"),
        cls: audit("cumulative-layout-shift"),
        tbt: audit("total-blocking-time"),
        failing,
      });
      console.log(`${preset.padEnd(8)} ${page.padEnd(32)} perf ${score("performance")} · a11y ${score("accessibility")} · bp ${score("best-practices")} · seo ${score("seo")} · LCP ${audit("largest-contentful-paint")} · CLS ${audit("cumulative-layout-shift")} · TBT ${audit("total-blocking-time")}`);
    }
  }
} finally {
  await chrome.kill();
  server.close();
}

const md = [
  "| page | preset | perf | a11y | best practices | SEO | LCP | CLS | TBT | audits < 0.9 |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.page} | ${r.preset} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${r.lcp} | ${r.cls} | ${r.tbt} | ${r.failing.join(", ") || "none"} |`),
].join("\n");
writeFileSync(`${OUT}summary.md`, `${md}\n`);
console.log(`\n${md}\n\nReports: ${OUT}`);
const low = rows.filter((r) => Math.min(r.perf, r.a11y, r.bp, r.seo) < 95);
if (low.length) {
  console.error(`lighthouse: ${low.length} run(s) below 95 in a category`);
  process.exitCode = 1;
}
