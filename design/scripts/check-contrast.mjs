#!/usr/bin/env node
// WCAG 2.2 contrast check for every text / UI token pair the design system allows.
// Parses design/tokens.css (the shipped artefact, not the generator) so it also catches hand edits.
//   node design/scripts/check-contrast.mjs            -> table + exit 1 on any failure
//   node design/scripts/check-contrast.mjs --json     -> machine-readable result
//   node design/scripts/check-contrast.mjs path/to/tokens.css
// Semi-transparent colours are composited over the background they sit on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--")) || path.join(DIR, "tokens.css");
const asJson = args.includes("--json");
const css = fs.readFileSync(file, "utf8");

// ---- parse the two theme blocks ------------------------------------------------------------
function block(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error("block not found: " + selectorRe);
  const start = css.indexOf("{", m.index) + 1;
  let depth = 1, i = start;
  while (depth && i < css.length) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
  const body = css.slice(start, i - 1);
  const vars = {};
  for (const [, k, v] of body.matchAll(/--color-([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
  return vars;
}
// Dark is the default theme (`:root:not([data-theme="light"])`); light applies with html[data-theme="light"].
const THEMES = {
  light: block(/(^|\n):root\s*\{/),
  dark: block(/:root:not\(\[data-theme="light"\]\)\s*\{/),
};
// every colour token needs a dark value (a missing one would leak the light value into the default theme)
const drift = Object.keys(THEMES.light).filter(k => !(k in THEMES.dark));

// ---- colour maths ---------------------------------------------------------------------------
function parse(c) {
  c = c.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1); if (h.length === 3) h = [...h].map(x => x + x).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)/);
  if (!m) throw new Error("cannot parse colour " + c);
  let a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [+m[1], +m[2], +m[3], a];
}
const over = (fg, bg) => fg[3] >= 1 ? fg : [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
function ratio(fgTok, bgTok, theme, base = "bg") {
  const T = THEMES[theme];
  const pageBg = parse(T[base]);
  const bg = over(parse(T[bgTok]), pageBg);
  const fg = over(parse(T[fgTok]), bg);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ---- the pairs ------------------------------------------------------------------------------
// min 4.5 = normal text (AA 1.4.3); 3 = large text (>= 24px, or 18.66px bold) and UI/graphics (1.4.11)
const SURFACES = ["bg", "bg-subtle", "surface", "surface-2"];
const PAIRS = [];
const add = (fg, bgs, min, use) => (Array.isArray(bgs) ? bgs : [bgs]).forEach(bg => PAIRS.push({ fg, bg, min, use }));

add("ink", SURFACES, 4.5, "body text, headings");
add("ink-2", SURFACES, 4.5, "secondary text");
add("muted", SURFACES, 4.5, "meta text, captions, placeholders");
add("subtle", ["bg", "surface"], 3, "large text / icons / disabled only");
for (const c of ["accent", "accent-strong", "teal", "saffron", "coral", "sky", "sage", "slate", "success", "warning", "danger", "info"])
  add(c, SURFACES, 4.5, "accent text, links, chip labels");
for (const c of ["teal", "saffron", "coral", "sky", "sage", "slate"]) {
  add(c, `${c}-tint`, 4.5, `${c} chip label on its tint`);
  add("ink", `${c}-tint`, 4.5, `ink text on ${c} tint`);
}
add("accent", "accent-tint", 4.5, "accent chip");
add("ink", "accent-tint", 4.5, "ink on accent tint");
add("danger", "danger-tint", 4.5, "error message");
add("ink", "danger-tint", 4.5, "error body text");
add("ink", "selection", 4.5, "selected text");
add("on-inverse", "surface-inverse", 4.5, "primary button, user bubble, tooltip");
add("on-accent", "accent-solid", 4.5, "accent button label");
add("on-saffron", "saffron-fill", 4.5, "callout numerals on saffron discs");
add("on-accent", "accent-solid-hover", 4.5, "accent button label (hover)");
add("line-input", ["bg", "surface", "surface-2"], 3, "form control boundary (1.4.11)");
add("focus", [...SURFACES, "accent-tint"], 3, "focus ring (2.4.13 / 1.4.11)");
add("accent-solid", ["bg", "surface"], 3, "accent button against page (1.4.11)");
add("surface-inverse", ["bg", "surface"], 3, "primary button against page (1.4.11)");
// decorative: reported, never fails (graph strokes, stripes; meaning is carried by text labels)
for (const c of ["accent-fill", "teal-fill", "saffron-fill", "coral-fill", "sky-fill", "sage-fill", "slate-fill", "graph-edge"])
  add(c, ["bg", "surface"], 0, "decorative graphic (informational only)");

// ---- run ------------------------------------------------------------------------------------
const rows = [];
for (const theme of ["light", "dark"]) for (const p of PAIRS) {
  const r = ratio(p.fg, p.bg, theme);
  rows.push({ theme, ...p, fgValue: THEMES[theme][p.fg], bgValue: THEMES[theme][p.bg], ratio: +r.toFixed(2), pass: r >= p.min });
}
const fails = rows.filter(r => !r.pass);

if (asJson) {
  console.log(JSON.stringify({ file, drift, total: rows.length, failures: fails.length, rows }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`contrast check: ${path.relative(process.cwd(), file)}\n`);
  for (const theme of ["light", "dark"]) {
    console.log(`${theme.toUpperCase()}`);
    for (const r of rows.filter(r => r.theme === theme))
      console.log(`  ${r.pass ? (r.min ? "ok  " : "info") : "FAIL"} ${pad(r.fg, 19)} on ${pad(r.bg, 18)} ${pad(r.ratio.toFixed(2), 6)} (min ${r.min || "-"})  ${r.use}`);
    console.log("");
  }
  if (drift.length) console.log("DRIFT: no dark (default theme) value for: " + drift.join(", "));
  console.log(`${rows.length} pairs checked, ${fails.length} failures${drift.length ? ", theme drift detected" : ""}.`);
}
process.exit(fails.length || drift.length ? 1 : 0);
