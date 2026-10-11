#!/usr/bin/env node
// WCAG 2.2 contrast check for every text / UI / graphic token pair the design system allows, plus a stricter 6:1 for
// every colour set at 12 px or less (the small-text rule), plus the few components that set their own colours, plus
// colour-vision separation of the category colours.
// Parses design/tokens.css (the shipped artefact, not the generator) so it also catches hand edits, and reads the
// component colours from the site's source files (so it checks what ships).
//   node design/scripts/check-contrast.mjs            -> table + exit 1 on any failure
//   node design/scripts/check-contrast.mjs --json     -> machine-readable result
//   node design/scripts/check-contrast.mjs path/to/tokens.css
// Semi-transparent colours are composited over the background they sit on.
// Colour vision: Machado, Oliveira & Fernandes (2009) simulation at full severity (linear RGB), CIEDE2000 between the
// closest pair of the six category fills; deuteranopia and protanopia must keep every pair >= 8 (normal and
// tritanopia are reported).
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
const add = (fg, bgs, min, use, extra = {}) => (Array.isArray(bgs) ? bgs : [bgs]).forEach(bg => PAIRS.push({ fg, bg, min, use, ...extra }));

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
// graphics that carry category meaning (hero graph rings, diagram strokes, trace bars, stripes, chart dots): 3:1 on
// every surface they are drawn on (1.4.11), even though a text label always says the same (1.4.1)
for (const c of ["accent-fill", "teal-fill", "saffron-fill", "coral-fill", "sky-fill", "sage-fill", "slate-fill"])
  add(c, ["bg", "bg-subtle", "surface"], 3, "graphic: node ring, bar, stroke, dot (1.4.11)");
// decorative: reported, never fails (idle graph edges and hairlines; meaning is carried elsewhere)
for (const c of ["graph-edge", "line", "line-strong"])
  add(c, ["bg", "surface"], 0, "decorative (informational only)");

// ---- small text: 6:1 for every colour set at 12 px or less ---------------------------------------
// --text-2xs is 12 px at every width (the type floor) and is the smallest step; a few fixed labels go down to 10 px.
// Text that small, read on a phone and often outdoors, must reach 6:1 (a step above AA's 4.5:1) against every surface
// it sits on, in both themes. The list holds every colour token the site sets at that size, with where, so a future
// palette must pass too. A colour newly set at <= 12 px joins the list (grep site/src for `--text-2xs` and for fixed
// font sizes under 12px).
const SMALL_MIN = 6;
const SMALL = { small: true };
const SMALL_TEXT = {
  // meta and captions (the 12 px default): hero caption and meta, .kbd, chart .axis, trace dates (.span__dates),
  // .repo__owner, .facts dt, .matrix thead th, .edu__when, .edu__expected, .footer h2, .turnstile-slot,
  // .browser__url, .assist-flow span, chat preview head / hints (components.css, home-b.css); case pages: .cs-meta dt,
  // .cs-brief__tag, TOC numbers and labels, .fig-panel__bar, .cv-node__s, .cv-edges title and notes (case.css);
  // privacy .doc__meta and TOC numbers (privacy.css); fixed sizes: .tool__count (10 px, home-b.css), the hero graph
  // tooltip id (11.5 px, hero-graph.css) and the diagram labels (10-11 px, diagram.css)
  "muted": "meta, captions, labels",
  // the neutral .chip label (on surface-2), .cs-hero__brief, .fig-panel__title, .cap__stack b, archive links
  // (.repos__archive-list); architecture thumbnail node labels (11 px, ArchThumb.astro); diagram captions (12 px)
  "ink-2": "neutral chips, briefs, figure titles",
  // architecture thumbnail hub labels (12 px, ArchThumb.astro)
  "ink": "thumbnail hub labels",
  // list counters (.owned, .steps), the trace's "now" marker, the current TOC number, .fig-panel__id, the default
  // skills group heading (.matrix .grp th, .matrix-list__title), archive link hover
  "accent": "counters, figure ids, current TOC number",
  // category labels: .chip--<c> (case-study stack chips, the repo licence chip), component-view group labels
  // (.cv-group__label in .accent-<c>, on the figure canvas), skills group headings (.matrix .grp th,
  // .matrix-list__title in .accent-<c>); teal also .decision__label and .edu__badge (on teal-tint)
  "teal": "category labels and chips",
  "coral": "category labels and chips",
  "sky": "category labels and chips",
  "sage": "category labels and chips",
  "slate": "category labels and chips",
};
for (const [c, use] of Object.entries(SMALL_TEXT)) add(c, SURFACES, SMALL_MIN, `small text (<= 12 px): ${use}`, SMALL);
for (const c of ["teal", "coral", "sky", "sage", "slate"])
  add(c, `${c}-tint`, SMALL_MIN, `small text: .chip--${c} label on its tint`, SMALL);
add("muted", "teal-tint", SMALL_MIN, "small text: .decision__src on the decision card's teal tint", SMALL);
add("on-inverse", "surface-inverse", SMALL_MIN, "small text: hero graph pause / play tooltip (12 px)", SMALL);
// Known small-text uses that do not reach 6:1 yet and are moving off <= 12 px (to --text-xs, or to ink-2): printed as
// "todo", never a failure. Delete an entry once its CSS has moved; never add one to get a palette through.
//   saffron (light 5.32-5.68): .chip--saffron (case-study stack chips, retrieval / data tech), .cv-group__label in
//     .accent-saffron groups (component view, on the figure canvas), the skills "Retrieval" group heading
//     (.matrix .grp th, .matrix-list__title), .assist-flow b::before step numerals (11 px, on saffron-tint)
//   on-saffron on saffron-fill (light 5.28): callout numerals .co (11 px, case.css) and .dg-co text (11 px, diagram.css)
const PENDING = { small: true, pending: true };
// Gold text is never set at 12 px or below on the site any more: the case-study hero's stack chips, the component
// view's group labels, the assistant flow's step numerals and the callout discs (.co) are 13 px (--text-xs), where the
// 4.5:1 rule applies and gold passes it. So `saffron` has no small-text rule; add it back if gold text goes under 13 px.
add("on-saffron", "saffron-fill", SMALL_MIN, "small text (todo): the diagrams' own callout numerals (.dg-co text, 12-13 units)", PENDING);

// ---- run ------------------------------------------------------------------------------------
const rows = [];
for (const theme of ["light", "dark"]) for (const p of PAIRS) {
  const r = ratio(p.fg, p.bg, theme);
  rows.push({ theme, ...p, fgValue: THEMES[theme][p.fg], bgValue: THEMES[theme][p.bg], ratio: +r.toFixed(2), pass: r >= p.min });
}

// ---- components with their own colours (values read from the source that ships) ----------------------------
// The CTA band stays a deep lapis panel in the dark theme (site/src/styles/case.css); the chat launcher's avatar disc,
// rim and comic bubble (site/src/scripts/chat-avatar.ts) hold in both themes.
const SITE = path.resolve(DIR, "../site/src");
const sources = {};
function grab(file, re, label) {
  sources[file] ??= fs.existsSync(path.join(SITE, file)) ? fs.readFileSync(path.join(SITE, file), "utf8") : null;
  if (sources[file] == null) return null;
  const m = sources[file].match(re);
  if (!m) throw new Error(`component colour not found: ${label} (${file})`);
  return m[1];
}
const literal = (a, b) => { const A = over(parse(a), parse(b)), B = parse(b); const x = lum(A), y = lum(B); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixA = (c, pct) => { const [r, g, b] = parse(c); return `rgb(${r} ${g} ${b} / ${pct})`; };
function component(theme, fg, bg, min, use, page = THEMES[theme].bg) {
  const bgC = over(parse(bg), parse(page));
  const bgHex = `rgb(${bgC.slice(0, 3).map(Math.round).join(" ")})`;
  const r = literal(fg, bgHex);
  rows.push({ theme, fg: use.split(":")[0], bg: "", min, use, fgValue: fg, bgValue: bg, ratio: +r.toFixed(2), pass: r >= min, component: true });
}
const band = grab("styles/case.css", /\.cta-band\s*\{\s*--color-surface-inverse:\s*(#[0-9A-Fa-f]{6})/, "dark CTA band");
if (band) {
  const ink = THEMES.dark.ink;
  component("dark", ink, band, 4.5, "CTA band: title on the dark band");
  component("dark", mixA(ink, 0.64), band, 4.5, "CTA band: eyebrow (ink 64 %)");
  component("dark", mixA(ink, 0.78), band, 4.5, "CTA band: text (ink 78 %)");
  component("dark", THEMES.dark["accent-solid"], band, 3, "CTA band: accent button against the band (1.4.11)");
  component("light", mixA(THEMES.light["on-inverse"], 0.64), THEMES.light["surface-inverse"], 4.5, "CTA band: eyebrow on the light theme's band (64 %)");
  component("dark", THEMES.dark.focus, band, 3, "CTA band: focus ring on the dark band (2.4.13)");
  const lightSolid = grab("styles/case.css", /\[data-theme="light"\] \.cta-band\s*\{\s*--color-accent-solid:\s*(#[0-9A-Fa-f]{6})/, "light CTA band accent");
  const lightOn = grab("styles/case.css", /\[data-theme="light"\] \.cta-band\s*\{[^}]*--color-on-accent:\s*(#[0-9A-Fa-f]{6})/, "light CTA band label");
  const lightFocus = grab("styles/case.css", /\[data-theme="light"\] \.cta-band\s*\{[^}]*--color-focus:\s*(#[0-9A-Fa-f]{6})/, "light CTA band focus");
  component("light", lightSolid, THEMES.light["surface-inverse"], 3, "CTA band: gold button on the light theme's band (1.4.11)");
  component("light", lightOn, lightSolid, 4.5, "CTA band: label on its gold button");
  component("light", lightFocus, THEMES.light["surface-inverse"], 3, "CTA band: focus ring on the light theme's band (2.4.13)");
}
const disc = grab("scripts/chat-avatar.ts", /--mh-av-disc,(#[0-9a-fA-F]{6})/, "avatar disc");
const rim = grab("scripts/chat-avatar.ts", /--mh-av-rim,(#[0-9a-fA-F]{6})/, "avatar rim");
const bubbleInk = grab("scripts/chat-avatar.ts", /--mh-bubble-ink,(#[0-9a-fA-F]{6})/, "bubble ink");
const bubbleAccent = grab("scripts/chat-avatar.ts", /--mh-bubble-accent,(#[0-9a-fA-F]{6})/, "bubble accent");
const paper = grab("scripts/chat-avatar.ts", /--pp:var\(--mh-bubble-paper,color-mix\(in srgb,(#[0-9a-fA-F]{6})/, "bubble paper");
// Open, the launcher is the panel's close button: its × keeps its own ink on the disc (audit M-01).
const closeInk = grab("scripts/chat-avatar.ts", /\.b\.av\{[^}]*;color:(#[0-9a-fA-F]{6})/, "launcher close ink");
// By night the bubble is a "night comic" from the theme's tokens (site.css: --mh-bubble-paper / -text / -ink / -accent).
const night = grab("styles/site.css", /\[data-mh-chat\] \{ (--mh-bubble-paper: var\(--color-surface\); --mh-bubble-text: var\(--color-ink\); --mh-bubble-ink: var\(--color-accent-fill\); --mh-bubble-accent: var\(--color-accent\);) \}/, "night comic bubble");
if (disc) for (const theme of ["light", "dark"]) {
  component(theme, rim, THEMES[theme].bg, theme === "dark" ? 3 : 0, "avatar rim against the page (the launcher's edge in dark)");
  component(theme, disc, THEMES[theme].bg, theme === "light" ? 3 : 0, "avatar disc against the page (the launcher's edge in light)");
  component(theme, rim, disc, 3, "avatar rim against its disc");
  component(theme, closeInk, disc, 3, "launcher open: its × against the disc (1.4.11)");
  if (theme === "dark" && night) {
    const T = THEMES.dark;
    component(theme, T.ink, T.surface, 4.5, "comic bubble by night: ivory text on surface paper");
    component(theme, T.accent, T.surface, 4.5, "comic bubble by night: the greeting line");
    component(theme, T["accent-fill"], T.bg, 3, "comic bubble by night: the gold outline against the page");
    continue;
  }
  for (const [c, use] of [[bubbleInk, "comic bubble: ink text and outline"], [bubbleAccent, "comic bubble: the greeting line"]]) {
    // the bubble's paper is 94 % paper over the page background
    const P = parse(paper), B = parse(THEMES[theme].bg);
    const pp = `rgb(${[0, 1, 2].map(i => Math.round(P[i] * 0.94 + B[i] * 0.06)).join(" ")})`;
    component(theme, c, pp, 4.5, use);
  }
}

// ---- colour vision: the six category fills must stay apart ------------------------------------------------
const CATS = ["teal", "saffron", "coral", "sky", "sage", "slate"];
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const lin = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = v => Math.min(1, Math.max(0, v));
function simulate(c, type) {
  const rgb = parse(c).slice(0, 3);
  if (type === "normal") return rgb;
  const L = rgb.map(v => lin(v / 255));
  return CVD[type].map(row => gam(clamp01(row[0] * L[0] + row[1] * L[1] + row[2] * L[2])) * 255);
}
function lab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(v => lin(v / 255));
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047), Y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B), Z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function de2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  let dhp = 0; if (C1p * C2p) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dLp = L2 - L1, dCp = C2p - C1p, dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p; if (C1p * C2p) { if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (hbp + 360) / 2 : (hbp - 360) / 2; else hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-(((hbp - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}
const CVD_MIN = { normal: 0, deutan: 8, protan: 8, tritan: 0 };
const vision = [];
for (const theme of ["light", "dark"]) for (const kind of ["fill", "text"]) for (const type of ["normal", "deutan", "protan", "tritan"]) {
  let worst = { de: Infinity };
  for (let i = 0; i < CATS.length; i++) for (let j = i + 1; j < CATS.length; j++) {
    const a = THEMES[theme][kind === "fill" ? `${CATS[i]}-fill` : CATS[i]], b = THEMES[theme][kind === "fill" ? `${CATS[j]}-fill` : CATS[j]];
    const de = de2000(simulate(a, type), simulate(b, type));
    if (de < worst.de) worst = { de, a: CATS[i], b: CATS[j] };
  }
  const min = kind === "fill" ? CVD_MIN[type] : 0;
  vision.push({ theme, kind, type, worst: `${worst.a}/${worst.b}`, de: +worst.de.toFixed(1), min, pass: worst.de >= min });
}
const fails = [...rows.filter(r => !r.pass && !r.pending), ...vision.filter(v => !v.pass)];
const todo = rows.filter(r => !r.pass && r.pending);

if (asJson) {
  console.log(JSON.stringify({ file, drift, total: rows.length, failures: fails.length, pending: todo.length, rows, vision }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const status = r => (r.pass ? (r.min ? "ok  " : "info") : r.pending ? "todo" : "FAIL");
  const line = r => `  ${status(r)} ${pad(r.fg, 19)} on ${pad(r.bg, 18)} ${pad(r.ratio.toFixed(2), 6)} (min ${r.min || "-"})  ${r.use}`;
  console.log(`contrast check: ${path.relative(process.cwd(), file)}\n`);
  for (const theme of ["light", "dark"]) {
    console.log(`${theme.toUpperCase()}`);
    for (const r of rows.filter(r => r.theme === theme && !r.component && !r.small)) console.log(line(r));
    console.log(`  -- small text (<= 12 px): ${SMALL_MIN}:1 on every surface it sits on --`);
    for (const r of rows.filter(r => r.theme === theme && r.small)) console.log(line(r));
    console.log(`  -- components with their own colours --`);
    for (const r of rows.filter(r => r.theme === theme && r.component))
      console.log(`  ${status(r)} ${pad(`${r.fgValue} on ${r.bgValue}`, 40)} ${pad(r.ratio.toFixed(2), 6)} (min ${r.min || "-"})  ${r.use}`);
    console.log("");
  }
  console.log("COLOUR VISION (closest pair of the six category colours, CIEDE2000)");
  for (const v of vision)
    console.log(`  ${v.pass ? (v.min ? "ok  " : "info") : "FAIL"} ${pad(v.theme, 5)} ${pad(v.kind, 4)} ${pad(v.type, 6)} ${pad(v.de.toFixed(1), 5)} ${pad(v.worst, 14)} (min ${v.min || "-"})`);
  console.log("");
  if (drift.length) console.log("DRIFT: no dark (default theme) value for: " + drift.join(", "));
  const small = rows.filter(r => r.small && !r.pending).length;
  console.log(`${rows.length} pairs (${small} of them the ${SMALL_MIN}:1 small-text rule) + ${vision.length} colour-vision checks, ${fails.length} failures${todo.length ? `, ${todo.length} small-text pairs to do (moving off <= 12 px; see PENDING)` : ""}${drift.length ? ", theme drift detected" : ""}.`);
}
// exitCode, not exit(): a piped --json result is larger than one pipe buffer and must be flushed first
process.exitCode = fails.length || drift.length ? 1 : 0;
