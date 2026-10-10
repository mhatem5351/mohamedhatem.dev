#!/usr/bin/env node
/**
 * Performance budgets on the built site (run after `npm run build`; part of `npm test`).
 *
 *   node scripts/check-budgets.mjs                 checks ../dist
 *   node scripts/check-budgets.mjs --dist <dir>    checks another build
 *
 * Per page (all pages; the home pages are the ones that matter most):
 *   JS    gzip of every script the page runs on first load: its <script src> modules plus their static imports,
 *         followed through the built chunks. Dynamic import() targets (the chat widget's panel, loaded on the first
 *         hover / focus of the bubble; the launcher's avatar, loaded after load on idle; the hero graph's lazy renderer)
 *         are excluded. Budget: 60 KB.
 *   CSS   gzip of the stylesheets the page links. Budget: 40 KB.
 *   HTML  gzip size, reported (warning above 60 KB).
 * Fonts: every @font-face source is a self-hosted .woff2; the English home preloads Space Grotesk (its H1 face) and
 * nothing else; the Arabic home preloads the three IBM Plex Sans Arabic weights (≈53 KB after
 * scripts/subset-fonts.mjs: preloading only 700 let 400/600 swap in late and shift the page) and no Latin face.
 * LCP: an image marked fetchpriority="high" must be preloaded (the design's LCP is the H1 text, so normally none).
 * Third-party scripts (Cloudflare Web Analytics, Turnstile) are listed but not counted: they load deferred / on use.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { elements, tags, walk } from "./lib/html.mjs";

const args = process.argv.slice(2);
const DIST = resolve(args.includes("--dist") ? args[args.indexOf("--dist") + 1] : fileURLToPath(new URL("../../dist", import.meta.url)));
const BUDGET = { js: 60 * 1024, css: 40 * 1024, html: 60 * 1024 };
const STRICT = new Set(["/", "/ar/"]);

if (!existsSync(DIST)) {
  console.error(`check-budgets: ${DIST} does not exist (run the build first)`);
  process.exit(1);
}
const files = walk(DIST);
const cache = new Map();
const gz = (file) => {
  if (!cache.has(file)) cache.set(file, gzipSync(readFileSync(`${DIST}/${file}`), { level: 9 }).length);
  return cache.get(file);
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const errors = [];
const warnings = [];

/** Static imports of a built ES module (minified or not), resolved to dist-relative paths. */
function staticImports(file) {
  const src = readFileSync(`${DIST}/${file}`, "utf8");
  const dir = file.split("/").slice(0, -1).join("/");
  const out = [];
  // import x from "./a.js" | import{a}from"./a.js" | import"./a.js" | export{a}from"./a.js" — but not import("./a.js")
  for (const m of src.matchAll(/(?:^|[;\n}\s])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+\.m?js)["']/g)) {
    const spec = m[1];
    const path = spec.startsWith("/") ? spec.slice(1) : new URL(spec, `http://x/${dir ? `${dir}/` : ""}`).pathname.slice(1);
    out.push(path);
  }
  return out;
}
function closure(entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !files.includes(f)) continue;
    seen.add(f);
    stack.push(...staticImports(f));
  }
  return seen;
}

const pageFiles = files.filter((f) => f.endsWith(".html"));
const rows = [];
let heroGraph = null;
let widgetPanel = null;
let chatAvatar = null;
for (const f of pageFiles) {
  const html = readFileSync(`${DIST}/${f}`, "utf8");
  const path = `/${f.replace(/index\.html$/, "")}`;
  const local = (u) => (u && u.startsWith("/") && !u.startsWith("//") ? u.slice(1).split("?")[0] : null);

  const scriptTags = tags(html, "script");
  const entries = scriptTags.map((t) => local(t.attrs.get("src"))).filter(Boolean);
  const thirdParty = scriptTags.map((t) => t.attrs.get("src")).filter((s) => s && /^https?:/.test(s));
  const js = closure(entries);
  const jsBytes = [...js].reduce((s, x) => s + gz(x), 0);
  for (const x of js) {
    const text = readFileSync(`${DIST}/${x}`, "utf8");
    if (/hg-tip-caret/.test(text)) heroGraph = { file: x, gzip: gz(x) };
  }
  // the widget panel: a chunk only reachable through a dynamic import from the loader
  for (const x of js) {
    const text = readFileSync(`${DIST}/${x}`, "utf8");
    for (const m of text.matchAll(/import\(["'`]([^"'`]+\.js)["'`]\)/g)) {
      const p = new URL(m[1], `http://x/${x.split("/").slice(0, -1).join("/")}/`).pathname.slice(1);
      if (!files.includes(p) || js.has(p)) continue;
      const lazy = { file: p, gzip: [...closure([p])].filter((c) => !js.has(c)).reduce((s, c) => s + gz(c), 0) };
      const text = readFileSync(`${DIST}/${p}`, "utf8");
      // the launcher's avatar and speech bubble (src/scripts/chat-avatar.ts), imported after load on idle
      if (/mhb-t/.test(text)) chatAvatar = lazy;
      else if (/mhc-panel/.test(text)) widgetPanel = lazy;
    }
  }

  const css = tags(html, "link").filter((l) => (l.attrs.get("rel") ?? "").split(/\s+/).includes("stylesheet")).map((l) => local(l.attrs.get("href"))).filter(Boolean);
  const cssBytes = css.reduce((s, x) => s + (files.includes(x) ? gz(x) : 0), 0);
  const htmlBytes = gz(f);
  rows.push({ path, js: jsBytes, css: cssBytes, html: htmlBytes, scripts: js.size, third: thirdParty.length });

  const strict = STRICT.has(path);
  if (jsBytes > BUDGET.js) errors.push(`${path}: JS ${kb(jsBytes)} > ${kb(BUDGET.js)}`);
  if (cssBytes > BUDGET.css) errors.push(`${path}: CSS ${kb(cssBytes)} > ${kb(BUDGET.css)}`);
  if (htmlBytes > BUDGET.html) warnings.push(`${path}: HTML ${kb(htmlBytes)} gzip > ${kb(BUDGET.html)}`);

  // fonts
  const inlineCss = elements(html, "style").map((s) => s.body).join("\n");
  const allCss = inlineCss + css.map((x) => (files.includes(x) ? readFileSync(`${DIST}/${x}`, "utf8") : "")).join("\n");
  for (const m of allCss.matchAll(/@font-face\s*{[^}]*}/g)) {
    for (const u of m[0].matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      const url = u[1];
      if (/^https?:|^\/\//.test(url)) errors.push(`${path}: font loaded from another origin: ${url}`);
      else if (!/\.woff2$/.test(url)) errors.push(`${path}: font is not woff2: ${url}`);
    }
  }
  const preloads = tags(html, "link").filter((l) => l.attrs.get("rel") === "preload");
  const fontPreloads = preloads.filter((l) => l.attrs.get("as") === "font").map((l) => l.attrs.get("href"));
  /** URL of the @font-face whose family starts with `family` (and weight `weight` if given). */
  const faceUrl = (family, weight) => {
    for (const m of inlineCss.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const fam = m[1].match(/font-family:\s*"?([^";]+)"?/)?.[1] ?? "";
      const w = m[1].match(/font-weight:\s*([^;]+)/)?.[1]?.trim();
      if (fam.startsWith(family) && !fam.includes("fallback") && (!weight || w === String(weight))) return m[1].match(/url\("?([^")]+)"?\)/)?.[1];
    }
    return undefined;
  };
  if (strict) {
    const want = path === "/" ? faceUrl("Space Grotesk") : faceUrl("IBM Plex Sans Arabic", 700);
    const label = path === "/" ? "Space Grotesk" : "IBM Plex Sans Arabic 700";
    if (!want) errors.push(`${path}: no @font-face for ${label}`);
    else if (!fontPreloads.includes(want)) errors.push(`${path}: ${label} is not preloaded`);
    const allowed = path === "/" ? [want] : [400, 600, 700].map((w) => faceUrl("IBM Plex Sans Arabic", w));
    for (const p of fontPreloads) if (!allowed.includes(p)) errors.push(`${path}: unexpected font preload ${p}`);
    for (const p of fontPreloads) if (!tags(html, "link").find((l) => l.attrs.get("href") === p && l.attrs.has("crossorigin"))) errors.push(`${path}: font preload ${p} lacks crossorigin`);
  }

  // LCP images
  for (const img of tags(html, "img").filter((t) => t.attrs.get("fetchpriority") === "high")) {
    const src = img.attrs.get("src");
    const pre = preloads.find((l) => l.attrs.get("as") === "image" && (l.attrs.get("href") === src || (l.attrs.get("imagesrcset") ?? "").includes(src ?? "\0")));
    if (!pre) errors.push(`${path}: high-priority image ${src} is not preloaded`);
  }
  for (const img of tags(html, "img")) if (!img.attrs.has("width") || !img.attrs.has("height")) warnings.push(`${path}: <img ${img.attrs.get("src")}> without width/height (layout shift risk)`);
}

/* ------------------------------------------------------------------ report */
rows.sort((a, b) => a.path.localeCompare(b.path));
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("page", 40)} ${pad("JS gz", 10)} ${pad("CSS gz", 10)} ${pad("HTML gz", 10)} modules`);
for (const r of rows) console.log(`${pad(r.path, 40)} ${pad(kb(r.js), 10)} ${pad(kb(r.css), 10)} ${pad(kb(r.html), 10)} ${r.scripts}${r.third ? ` (+${r.third} third-party, not counted)` : ""}`);
if (heroGraph) console.log(`hero graph module: ${heroGraph.file} ${kb(heroGraph.gzip)} gzip (design budget 15 KB with its CSS)`);
if (widgetPanel) console.log(`chat widget panel (lazy, not counted): ${widgetPanel.file} ${kb(widgetPanel.gzip)} gzip`);
if (chatAvatar) console.log(`chat launcher avatar (after load, not counted; design target 12 KB): ${chatAvatar.file} ${kb(chatAvatar.gzip)} gzip`);
for (const w of [...new Set(warnings)]) console.warn(`  warn  ${w}`);
if (errors.length) {
  console.error(`check-budgets: ${errors.length} problem(s)`);
  for (const e of [...new Set(errors)]) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-budgets: OK (JS ≤ ${kb(BUDGET.js)}, CSS ≤ ${kb(BUDGET.css)} on ${rows.length} pages)`);
