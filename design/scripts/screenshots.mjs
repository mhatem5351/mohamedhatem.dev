#!/usr/bin/env node
// Renders every prototype at 1440 / 768 / 390, light and dark, into design/screens/.
//   node design/scripts/screenshots.mjs                      -> all pages, all widths, both themes (full page)
//   node design/scripts/screenshots.mjs index case-study     -> only these pages
//   a page may carry extra query params after "@": 404@lang=ar  -> renders 404.html?lang=ar as "404-ar-*.png"
//   flags: --widths=1440,390  --themes=dark  --sections (also one PNG per <section>/<header>/<footer>)
//          --top (viewport-only "above the fold" shots)  --notes (annotation overlay on)
// Needs: playwright (a devDependency, or PLAYWRIGHT_PATH pointing at its index.mjs) with chromium installed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = process.env.PLAYWRIGHT_PATH
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_PATH).href)
  : await import("playwright").catch(() => { console.error("playwright not found: npm i -D playwright, or set PLAYWRIGHT_PATH"); process.exit(1); });

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split("=")[1] : d; };
const has = n => args.includes(`--${n}`);
const pages = args.filter(a => !a.startsWith("--"));
const ALL = fs.readdirSync(path.join(DIR, "prototypes")).filter(f => f.endsWith(".html")).map(f => f.replace(/\.html$/, ""));
const PAGES = pages.length ? pages : ALL;
const WIDTHS = flag("widths", "1440,768,390").split(",").map(Number);
const THEMES = flag("themes", "light,dark").split(",");
const HEIGHT = { 1440: 900, 768: 1024, 390: 844 };
const OUT = path.join(DIR, "screens");
fs.mkdirSync(OUT, { recursive: true });

// tiny static server rooted at design/ (fonts and <use> need http, not file://)
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const p = path.join(DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const made = [];
for (const page of PAGES) for (const theme of THEMES) for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: HEIGHT[w] || 900 }, deviceScaleFactor: w <= 390 ? 2 : 1, colorScheme: theme, reducedMotion: has("motion") ? "no-preference" : "reduce" });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", e => errors.push(e.message));
  const [file, extra] = page.split("@");
  const q = `?theme=${theme}&shots=1${has("notes") ? "&notes=1" : ""}${extra ? "&" + extra : ""}`;
  await pg.goto(`${base}/prototypes/${file}.html${q}`, { waitUntil: "networkidle" });
  await pg.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = "eager"; });
    await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    await document.fonts.ready;
  });
  await pg.waitForTimeout(400);
  const tag = page.includes("@") ? page.split("@")[0] + "-" + page.split("@")[1].split("=").pop() : page;
  const stem = `${tag}-${w}-${theme}${has("notes") ? "-notes" : ""}`;
  if (has("top")) { const f = path.join(OUT, `${stem}-top.png`); await pg.screenshot({ path: f }); made.push(f); }
  if (!has("top") || has("full")) { const f = path.join(OUT, `${stem}.png`); await pg.screenshot({ path: f, fullPage: true }); made.push(f); }
  if (has("sections")) {
    const dir = path.join(OUT, "sections"); fs.mkdirSync(dir, { recursive: true });
    // element shots: keep the sticky nav and floating launcher from overlapping section tops
    await pg.addStyleTag({ content: ".nav{position:relative!important}.chat-launcher{display:none!important}" });
    const els = await pg.$$("main > section, body > header, body > footer, [data-shot]");
    let i = 0;
    for (const el of els) {
      const id = (await el.getAttribute("id")) || (await el.getAttribute("data-shot")) || (await el.evaluate(e => e.tagName.toLowerCase()));
      const f = path.join(dir, `${stem}-${String(i++).padStart(2, "0")}-${id}.png`);
      await el.screenshot({ path: f }); made.push(f);
    }
  }
  if (errors.length) console.warn(`  ! ${page} ${theme} ${w}: ${errors.join(" | ")}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(made.map(f => path.relative(DIR, f)).join("\n"));
