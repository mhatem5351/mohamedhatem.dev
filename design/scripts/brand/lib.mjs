// Shared helpers for the identity-asset build scripts in design/scripts/brand/.
//
// Dependencies (devDependencies once the site package.json exists):
//   sharp, playwright (chromium), svgo, fontkit (2.x), wawoff2 (2.x), potrace (2.x)
// Resolution order: the repo's own node_modules, then $BRAND_NODE_MODULES (colon-separated list of
// directories that contain node_modules), so the scripts run before and after phase 2 wiring.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DESIGN = path.resolve(HERE, "../..");            // design/
export const REPO = path.resolve(DESIGN, "..");               // repo root
export const INPUTS = path.join(REPO, "_inputs");
export const FONTS = path.join(DESIGN, "assets/fonts");
export const BRAND = path.join(DESIGN, "assets/brand");
export const PHOTO = path.join(DESIGN, "assets/photo");
export const LOGOS = path.join(DESIGN, "assets/logos");
export const SCREENS = path.join(DESIGN, "screens/assets");

// ---------------------------------------------------------------- module resolution
const ROOTS = [
  REPO,
  ...(process.env.BRAND_NODE_MODULES || "").split(":").filter(Boolean),
  // extra node_modules roots (colon-separated) until the tools are repo devDependencies:
  // BRAND_NODE_MODULES=/path/to/a/workspace:/another/workspace node design/scripts/brand/brand.mjs
];
export function need(name) {
  for (const root of ROOTS) {
    try { return createRequire(path.join(root, "package.json"))(name); } catch { /* next */ }
  }
  throw new Error(`Cannot resolve "${name}". Install it (npm i -D ${name}) or set BRAND_NODE_MODULES.`);
}
export async function needESM(name, entry) {
  for (const root of ROOTS) {
    const p = path.join(root, "node_modules", name, entry);
    if (fs.existsSync(p)) return import(pathToFileURL(p).href);
  }
  throw new Error(`Cannot resolve "${name}/${entry}".`);
}
export const sharp = need("sharp");

// ---------------------------------------------------------------- tokens
const TOK = JSON.parse(fs.readFileSync(path.join(DESIGN, "tokens.json"), "utf8"));
/** colour token by name: tok("teal-fill", "dark") */
export function tok(name, theme = "light") {
  const v = TOK.color[name];
  if (!v) throw new Error("missing token " + name);
  return v[theme === "dark" ? 1 : 0];
}
/** palette object { bg, ink, teal, tealF, ... } per theme */
export function palette(theme) {
  const t = n => tok(n, theme);
  return {
    bg: t("bg"), bg2: t("bg-subtle"), surface: t("surface"), surface2: t("surface-2"),
    line: t("line"), lineStrong: t("line-strong"),
    ink: t("ink"), ink2: t("ink-2"), muted: t("muted"), subtle: t("subtle"),
    teal: t("teal"), saffron: t("saffron"), coral: t("coral"), sky: t("sky"), sage: t("sage"), slate: t("slate"),
    tealF: t("teal-fill"), saffronF: t("saffron-fill"), coralF: t("coral-fill"), skyF: t("sky-fill"), sageF: t("sage-fill"), slateF: t("slate-fill"),
    tealT: t("teal-tint"), saffronT: t("saffron-tint"), coralT: t("coral-tint"), skyT: t("sky-tint"), sageT: t("sage-tint"), slateT: t("slate-tint"),
    tealTL: t("teal-tint-line"), saffronTL: t("saffron-tint-line"), coralTL: t("coral-tint-line"), skyTL: t("sky-tint-line"), sageTL: t("sage-tint-line"), slateTL: t("slate-tint-line"),
    edge: t("graph-edge"), grid: t("graph-grid"), node: t("graph-node"),
    glow1: t("glow-1"), glow2: t("glow-2"), glow3: t("glow-3"),
  };
}

// ---------------------------------------------------------------- fonts + text outlining (fontkit)
export const FONT_FILES = {
  display: path.join(FONTS, "space-grotesk-latin-wght.woff2"),
  sans: path.join(FONTS, "inter-latin-wght.woff2"),
  mono: path.join(FONTS, "jetbrains-mono-ascii-wght.woff2"),
  ar400: path.join(FONTS, "ibm-plex-sans-arabic-400.woff2"),
  ar500: path.join(FONTS, "ibm-plex-sans-arabic-500.woff2"),
  ar600: path.join(FONTS, "ibm-plex-sans-arabic-600.woff2"),
  ar700: path.join(FONTS, "ibm-plex-sans-arabic-700.woff2"),
};
const fontCache = new Map();
const ttfCache = new Map();
/** decompress the self-hosted WOFF2 files to TTF once (fontkit's own WOFF2 path breaks on variable fonts) */
export async function initFonts(keys = Object.keys(FONT_FILES)) {
  const woff2 = need("wawoff2");
  for (const k of keys) {
    if (!ttfCache.has(k)) ttfCache.set(k, Buffer.from(await woff2.decompress(fs.readFileSync(FONT_FILES[k]))));
  }
}
export function loadFont(key, wght) {
  const k = key + "@" + (wght ?? "");
  if (fontCache.has(k)) return fontCache.get(k);
  if (!ttfCache.has(key)) throw new Error(`font "${key}" not initialised: await initFonts() first`);
  const fontkit = need("fontkit");
  let f = fontkit.create(ttfCache.get(key));
  if (wght != null && f.fvar) f = f.getVariation({ wght });
  fontCache.set(k, f);
  return f;
}

const R = n => Math.round(n * 100) / 100;
/**
 * Outline a run of text to an SVG path (y-down, baseline at y=0, origin at x=0).
 * opts: { font: "display"|"ar600"|..., wght, size, tracking (em), features, direction }
 * Returns { d, width, ascent, descent, capHeight, xHeight, bbox:{x0,y0,x1,y1} }.
 * Arabic is shaped by fontkit's OpenType engine (init/medi/fina/liga, RTL glyph order).
 */
export function outline(text, { font = "display", wght, size = 100, tracking = 0, features, direction, script, language } = {}) {
  const f = loadFont(font, wght);
  const s = size / f.unitsPerEm;
  const run = f.layout(text, features, script, language, direction);
  let x = 0; const parts = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const trk = tracking * f.unitsPerEm;
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const gx = x + pos.xOffset, gy = pos.yOffset;
    const cmds = g.path.commands;
    let d = "";
    const P = (px, py) => { const X = (gx + px) * s, Y = -(gy + py) * s; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); return `${R(X)} ${R(Y)}`; };
    for (const c of cmds) {
      const a = c.args;
      if (c.command === "moveTo") d += "M" + P(a[0], a[1]);
      else if (c.command === "lineTo") d += "L" + P(a[0], a[1]);
      else if (c.command === "quadraticCurveTo") d += "Q" + P(a[0], a[1]) + " " + P(a[2], a[3]);
      else if (c.command === "bezierCurveTo") d += "C" + P(a[0], a[1]) + " " + P(a[2], a[3]) + " " + P(a[4], a[5]);
      else if (c.command === "closePath") d += "Z";
    }
    parts.push(d);
    x += pos.xAdvance + (i < run.glyphs.length - 1 ? trk : 0);
  });
  return {
    d: parts.join(""), width: x * s,
    ascent: f.ascent * s, descent: -f.descent * s,
    capHeight: (f.capHeight || 0) * s, xHeight: (f.xHeight || 0) * s,
    bbox: { x0, y0, x1, y1 },
  };
}
/** translate an outlined path string by (dx, dy) and scale k (applied before translate) */
export function transformPath(d, dx = 0, dy = 0, k = 1) {
  let i = 0;
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, m => { const v = parseFloat(m) * k + (i++ % 2 === 0 ? dx : dy); return String(R(v)); });
}

// ---------------------------------------------------------------- browser
let _browser = null;
export async function browser() {
  if (_browser) return _browser;
  const { chromium } = await needESM("playwright", "index.mjs");
  _browser = await chromium.launch();
  return _browser;
}
export async function closeBrowser() { if (_browser) { await _browser.close(); _browser = null; } }
/** render an HTML string to PNG. opts: { width, height, scale, transparent, colorScheme, fullPage, selector } */
export async function shoot(html, out, { width = 1200, height = 630, scale = 1, transparent = false, colorScheme = "light", selector, baseURL } = {}) {
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (baseURL) {
    const tmp = path.join(baseURL, `.__shoot-${process.pid}-${Date.now()}.html`);
    fs.writeFileSync(tmp, html);
    try { await page.goto(pathToFileURL(tmp).href); } finally { fs.rmSync(tmp, { force: true }); }
  } else {
    await page.setContent(html, { waitUntil: "load" });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
  const opts = { path: out, omitBackground: transparent, type: "png" };
  if (selector) await page.locator(selector).screenshot(opts); else await page.screenshot(opts);
  await ctx.close();
  return out;
}

// ---------------------------------------------------------------- misc
export function write(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; }
export function kb(p) { return (fs.statSync(p).size / 1024).toFixed(1) + " KB"; }
export function fontFaceCSS(rel = "") {
  // @font-face rules pointing at the self-hosted files (absolute file URLs unless rel is given)
  const u = f => rel ? rel + path.basename(f) : pathToFileURL(f).href;
  return `
@font-face{font-family:"Space Grotesk Variable";font-weight:300 700;font-display:block;src:url("${u(FONT_FILES.display)}") format("woff2")}
@font-face{font-family:"Inter Variable";font-weight:100 900;font-display:block;src:url("${u(FONT_FILES.sans)}") format("woff2")}
@font-face{font-family:"JetBrains Mono Variable";font-weight:100 800;font-display:block;src:url("${u(FONT_FILES.mono)}") format("woff2")}
@font-face{font-family:"IBM Plex Sans Arabic";font-weight:400;font-display:block;src:url("${u(FONT_FILES.ar400)}") format("woff2")}
@font-face{font-family:"IBM Plex Sans Arabic";font-weight:500;font-display:block;src:url("${u(FONT_FILES.ar500)}") format("woff2")}
@font-face{font-family:"IBM Plex Sans Arabic";font-weight:600;font-display:block;src:url("${u(FONT_FILES.ar600)}") format("woff2")}
@font-face{font-family:"IBM Plex Sans Arabic";font-weight:700;font-display:block;src:url("${u(FONT_FILES.ar700)}") format("woff2")}`;
}
export function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
export { R as round };
