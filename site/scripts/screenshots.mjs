#!/usr/bin/env node
/**
 * Screenshots of the built site for visual review (compare with ../design/screens/).
 *
 *   node scripts/screenshots.mjs                       every page × 1440/768/390 × light/dark (npm run serve -- --port 4380)
 *   node scripts/screenshots.mjs --base http://localhost:4400 --pages /,/ar/ --widths 1440 --themes dark --top
 *
 * Writes screenshots/<page>-<width>-<theme>[-top].png (page "/" = index, "/ar/" = index-ar, "/work/x/" = work-x …).
 * Reduced motion is emulated so reveal-on-scroll content is visible and the hero graph shows its still frame;
 * the Cairo clock and the hero's typed examples are frozen for stable images.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { caseSlugs } from "./lib/pages.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:4380");
const OUT = arg("out", new URL("../screenshots/", import.meta.url).pathname);
const WIDTHS = arg("widths", "1440,768,390").split(",").map(Number);
const THEMES = arg("themes", "light,dark").split(",");
const TOP_ONLY = args.includes("--top");
const FULL_ONLY = args.includes("--full");
const slugs = await caseSlugs();
const DEFAULT_PAGES = ["/", "/ar/", ...slugs.flatMap((s) => [`/work/${s}/`, `/ar/work/${s}/`]), "/cv/", "/ar/cv/", "/privacy/", "/ar/privacy/", "/missing-page/", "/ar/missing-page/"];
const PAGES = arg("pages", DEFAULT_PAGES.join(",")).split(",");

const name = (p) => {
  const ar = p.startsWith("/ar/");
  const rest = (ar ? p.slice(3) : p).replace(/^\/|\/$/g, "").replace(/\//g, "-") || "index";
  return ar ? `${rest}-ar` : rest;
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let n = 0;
for (const theme of THEMES) {
  const context = await browser.newContext({ reducedMotion: "reduce", colorScheme: theme, deviceScaleFactor: 1 });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("mh-theme", t);
      localStorage.setItem("mh-chat:seen", "1");
    } catch {}
  }, theme);
  const page = await context.newPage();
  for (const p of PAGES) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w >= 1024 ? 900 : w >= 600 ? 1024 : 844 });
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      if (!TOP_ONLY) {
        // Scroll through once so lazy images decode and reveal observers fire, then back to the top.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.75) {
            scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          scrollTo(0, 0);
        });
        await page.waitForTimeout(700);
      }
      const base = `${OUT}${name(p)}-${w}-${theme}`;
      if (!FULL_ONLY) await page.screenshot({ path: `${base}-top.png` });
      if (!TOP_ONLY) await page.screenshot({ path: `${base}.png`, fullPage: true });
      n++;
    }
  }
  await context.close();
}
await browser.close();
console.log(`screenshots: ${n} page renders → ${OUT}`);
