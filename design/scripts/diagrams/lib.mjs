// Diagram engine for mohamedhatem.dev case-study diagrams.
// Renders data specs (specs.mjs) into small, themeable, accessible SVGs.
// Grammar (sizes, kinds, edges, callouts) is documented at the top of assets/diagrams/diagram.css.
import fs from "node:fs";
import { METRICS, MONO_ADVANCE } from "./metrics.mjs";

export const DESIGN = new URL("../../", import.meta.url); // design/

// ---------------------------------------------------------------- icons (shared source with the UI icon set)
let ICONS = {};
try { ({ ICONS } = await import("./icons.mjs")); } catch { /* icon set not built yet: placeholder glyphs */ }
export const hasIcon = (n) => Boolean(ICONS[n]);

// ---------------------------------------------------------------- tokens -> fallback hex values
export function readTokens() {
  const css = fs.readFileSync(new URL("tokens.css", DESIGN), "utf8");
  const block = (sel) => { const i = css.indexOf(sel); const s = css.indexOf("{", i); return css.slice(s + 1, css.indexOf("}", s)); };
  const parse = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  // dark is the default theme block; light is the base :root (html[data-theme="light"])
  return { light: parse(block(":root {")), dark: parse(block(':root:not([data-theme="light"]) {')) };
}
const TOK = readTokens();

// ---------------------------------------------------------------- categories and node kinds
export const CATS = ["teal", "saffron", "coral", "sky", "sage", "slate"];
// kind -> [category, shape, default glyph, legend label]
export const KINDS = {
  orch:  ["teal", "rect", "orchestrator", "orchestrator"],
  agent: ["teal", "rect", "agents", "agent"],
  data:  ["saffron", "rect", "retrieve", "retrieval · data"],
  model: ["coral", "rect", "generate", "model · LLM"],
  eval:  ["sky", "rect", "evaluate", "evaluation · observability"],
  guard: ["sage", "rect", "guard", "guard · safety"],
  infra: ["slate", "rect", "serving", "service · tool · infra"],
  store: ["slate", "cyl", "database", "store"],
  ext:   [null, "rect", "user", "external · channel"],
  more:  [null, "rect", null, null], // ghost placeholder ("and more of the same"), not in the legend
};

// local custom properties: page tokens win, hex fallbacks keep a standalone file themed
const BASE_VARS = { cv: ["dg-canvas|bg"], nd: ["dg-node|surface"], ink: ["ink"], ink2: ["ink-2"], mut: ["muted"], lns: ["line-strong"], edge: ["line-input"], grid: ["graph-grid"] };
function varDecl(theme, cats) {
  const T = TOK[theme];
  const out = [];
  for (const [k, [spec]] of Object.entries(BASE_VARS)) {
    const parts = spec.split("|");
    const tok = parts.at(-1);
    const hex = T[`color-${tok}`];
    out.push(parts.length > 1 ? `--_${k}:var(--${parts[0]},var(--color-${tok},${hex}))` : `--_${k}:var(--color-${tok},${hex})`);
  }
  for (const c of cats) {
    out.push(`--_${c}:var(--color-${c},${T[`color-${c}`]})`);
    out.push(`--_${c}-f:var(--color-${c}-fill,${T[`color-${c}-fill`]})`);
    out.push(`--_${c}-b:var(--color-${c}-tint,${T[`color-${c}-tint`]})`);
    out.push(`--_${c}-l:var(--color-${c}-tint-line,${T[`color-${c}-tint-line`]})`);
  }
  return out.join(";");
}

const SANS = `"Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;
const MONO = `"JetBrains Mono Variable","JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
export const FONT = { SANS, MONO };

// The full stylesheet. `cats` limits the per-category rules to the ones a diagram uses (keeps files small).
export function css(cats = CATS, { full = false } = {}) {
  const c = [...new Set(["teal", "saffron", ...cats])]; // teal: pulses/orchestrator ring; saffron: callouts
  const r = [];
  r.push(`.dg{${varDecl("light", c)};direction:ltr;unicode-bidi:isolate;font-family:${SANS};-webkit-font-smoothing:antialiased}`);
  r.push(`@media (prefers-color-scheme:dark){.dg{${varDecl("dark", c)}}}`);
  r.push(`.dg-cv{fill:var(--_cv)}.dg-dots{fill:var(--_grid)}`);
  r.push(`.dg-b{fill:var(--_nd);stroke:var(--nl,var(--_lns));stroke-width:1.5}.dg-w{fill:var(--nb)}`);
  r.push(`.dg-rim{fill:none;stroke:var(--nl,var(--_lns));stroke-width:1.5}`);
  r.push(`.dg-g{color:var(--ni,var(--_mut));fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}`);
  for (const k of c) r.push(`.dg-c-${k}{--nb:var(--_${k}-b);--nl:var(--_${k}-l);--ni:var(--_${k});--pf:var(--_${k}-f)}`);
  r.push(`.dg-orch .dg-b{stroke:var(--_teal-f);stroke-width:2}`);
  r.push(`.dg-ring{fill:none;stroke:var(--_teal-f);stroke-opacity:.55;stroke-width:1.25;stroke-dasharray:4 4}`);
  r.push(`.dg-ext .dg-b{fill:var(--_cv);stroke:var(--_edge);stroke-dasharray:4 4}.dg-ext .dg-g{color:var(--_ink2)}`);
  r.push(`.dg-more .dg-b{fill:none;stroke:var(--_lns);stroke-dasharray:3 4}.dg-more .dg-t{fill:var(--_mut);font-weight:500}`);
  r.push(`.dg-t{font:600 13px/1 ${SANS};fill:var(--_ink)}`);
  r.push(`.dg-s{font:500 11px/1 ${MONO};fill:var(--_mut)}`);
  r.push(`.dg-grp{fill:var(--dg-group-fill,none);stroke:var(--_lns);stroke-dasharray:4 4}`);
  r.push(`.dg-tab{font:600 10px/1 ${MONO};letter-spacing:.08em;fill:var(--_mut)}.dg-tabbg,.dg-elbg{fill:var(--_cv)}`);
  r.push(`.dg-e{fill:none;stroke:var(--_edge);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.dg-a{stroke-dasharray:4 5}`);
  r.push(`.dg-ah{fill:none;stroke:var(--_edge);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}`);
  r.push(`.dg-el{font:500 10.5px/1 ${MONO};fill:var(--_mut)}`);
  r.push(`.dg-co circle{fill:var(--_saffron-f);stroke:var(--_cv);stroke-width:2}.dg-co text{font:700 11px/1 ${MONO};fill:var(--color-on-saffron,${TOK.light["color-on-saffron"]});text-anchor:middle}`);
  r.push(`.dg-cap{font:500 12px/1 ${MONO};fill:var(--_ink2)}.dg-stk{opacity:.55}`);
  r.push(`.dg-lg{font:500 11px/1 ${MONO};fill:var(--_mut)}.dg-lsw{stroke:var(--nl);stroke-width:1}`);
  r.push(`.dg-dot{fill:var(--ni,var(--_mut))}.dg-mute{fill:var(--_mut)}.dg-ink2{fill:var(--_ink2)}`);
  // Opt-in motion: add class "dg-play" to the <svg> (or any ancestor). Static and complete without it.
  // One loop = one request travelling the main path (--i: hop index, --L: path length), each hop lasting --dg-hop
  // (12% of the loop); the node it reaches lights up as it lands (.dg-hl, --at: arrival index, --k: wave order inside
  // a group); the orchestrator's ring breathes. Standalone, the pulses are dashes (.dg-p, stroke-dashoffset). A page
  // runtime may instead draw them as comets moved by transform (.dg-cm, plus .dg-bgp packets drifting along async
  // edges) and add "dg-comets", which hides the dashes: transform and opacity animate off the main thread.
  r.push(`.dg{--dg-hop:.72s}.dg-thumb{--dg-hop:.5s}`);
  r.push(`.dg-p{fill:none;stroke:var(--pf,var(--_teal-f));stroke-width:3;stroke-linecap:round;opacity:0;stroke-dasharray:18px var(--L);stroke-dashoffset:18px}.dg-ph{stroke-width:9;stroke-opacity:.22}`);
  r.push(`.dg-hl{fill:var(--nb,var(--_teal-b));stroke:var(--pf,var(--_teal-f));stroke-width:2;opacity:0}`);
  r.push(`.dg-cm,.dg-bgp{opacity:0;pointer-events:none}.dg-cm-h,.dg-cm-t{fill:var(--pf,var(--_teal-f))}.dg-cm-h{opacity:.22}.dg-cm-c{fill:var(--ni,var(--_teal));stroke:var(--pf,var(--_teal-f));stroke-width:1.5}.dg-bgp{fill:var(--_ink2)}`);
  r.push(`.dg-play .dg-p{opacity:1;animation:dg-p calc(var(--dg-hop) / .12) cubic-bezier(.65,0,.35,1) infinite;animation-delay:calc(var(--i) * var(--dg-hop))}.dg-comets .dg-p{display:none}`);
  r.push(`.dg-play .dg-hl{animation:dg-hit calc(var(--dg-hop) / .12) cubic-bezier(.16,1,.3,1) infinite;animation-delay:calc((var(--at) - .25) * var(--dg-hop) + var(--k,0) * 40ms)}`);
  r.push(`.dg-play .dg-ring{animation:dg-breathe 3.6s ease-in-out infinite}`);
  for (const k of ["p", "hl", "ring"]) r.push(`.dg-play.dg-paused .dg-${k},.dg-paused .dg-play .dg-${k}{animation-play-state:paused}`);
  r.push(`@keyframes dg-p{0%{stroke-dashoffset:18px}12%,100%{stroke-dashoffset:calc(var(--L) * -1)}}`);
  r.push(`@keyframes dg-hit{0%,24%,100%{opacity:0}3%{opacity:1}}`);
  r.push(`@keyframes dg-breathe{50%{opacity:.35}}`);
  r.push(`@media (prefers-reduced-motion:reduce){.dg-p,.dg-hl,.dg-cm,.dg-bgp{animation:none!important;opacity:0!important}.dg-ring{animation:none!important}}`);
  return r.join("");
}

// split a stylesheet into top-level rules (keeps @media / @keyframes blocks whole)
export function splitRules(cssText) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < cssText.length; i++) {
    if (cssText[i] === "{") depth++;
    else if (cssText[i] === "}") { depth--; if (depth === 0) { out.push(cssText.slice(start, i + 1)); start = i + 1; } }
  }
  return out;
}
// drop rules whose class selectors never occur in the markup (per-file CSS stays small)
export function shake(cssText, markup) {
  const present = new Set([...markup.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const always = new Set(["dg", "dg-play", "dg-paused", "dg-comets", "dg-wide", "dg-compact", "dg-thumb"]);
  const ok = (sel) => [...sel.matchAll(/\.(dg-[\w-]+)/g)].every((m) => always.has(m[1]) || present.has(m[1]));
  return splitRules(cssText).filter((rule) => {
    if (rule.startsWith("@keyframes dg-hit")) return present.has("dg-hl");
    if (rule.startsWith("@keyframes dg-breathe")) return present.has("dg-ring");
    if (rule.startsWith("@keyframes")) return present.has("dg-p");
    if (rule.startsWith("@media (prefers-reduced-motion")) return present.has("dg-p");
    if (rule.startsWith("@media")) return true;
    const sel = rule.slice(0, rule.indexOf("{"));
    return sel.split(",").some((part) => ok(part));
  }).join("");
}

// ---------------------------------------------------------------- text measurement
export function textW(str, kind = "title") {
  if (kind === "mono" || kind === "sub") return str.length * MONO_ADVANCE * 11;
  if (kind === "el") return str.length * MONO_ADVANCE * 10.5;
  if (kind === "tab") return str.length * (MONO_ADVANCE * 10 + 0.8) - 0.8;
  if (kind === "lg") return str.length * MONO_ADVANCE * 11;
  const [font, size] = Array.isArray(kind) ? kind : ["inter600", 13];
  const t = METRICS[font];
  let w = 0;
  for (const ch of str) w += t[ch] ?? 0.62;
  return w * size;
}

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? 0 : r; };
const P = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${n2(x)} ${n2(y)}`).join("");

export function glyph(name, x, y, size = 16) {
  const inner = ICONS[name] ?? `<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>`;
  const s = size / 24;
  return `<g class="dg-g" transform="translate(${n2(x)} ${n2(y)}) scale(${n2(s * 1000) / 1000})">${inner}</g>`;
}

// ---------------------------------------------------------------- the renderer
export class Diagram {
  constructor(spec, { id, variant, title, desc }) {
    this.s = spec; this.id = id; this.variant = variant; this.title = title; this.desc = desc;
    this.pid = `dg-${id}-${variant[0]}`; // unique per diagram+variant: wide and compact can share a page
    this.W = spec.w; this.H = spec.h;
    this.boxes = new Map(); this.warn = []; this.used = new Set(); this.kindsUsed = new Set();
    this.hasAsync = false; this.hasSync = false; this.hasCallout = false; this.lateCallouts = [];
  }

  // geometry of a node / group for ports
  box(id) {
    const b = this.boxes.get(id);
    if (!b) throw new Error(`${this.id}/${this.variant}: unknown node ${id}`);
    return b;
  }

  // port: "id:side[+-offset]" -> {x,y,dir,inset}
  port(ref, isEnd) {
    const m = /^([\w-]+):([trbl])([+-]\d+(?:\.\d+)?)?$/.exec(ref);
    if (!m) throw new Error(`bad port ${ref}`);
    const b = this.box(m[1]); const side = m[2]; const off = m[3] ? Number(m[3]) : 0;
    const out = b.ring ?? 0; // orchestrator ring sits 4px outside the box
    const x0 = b.x - out, y0 = b.y - out, x1 = b.x + b.w + out, y1 = b.y + b.h + out;
    const cyMid = b.cy ?? (b.y + b.h / 2), cxMid = b.x + b.w / 2;
    // half stroke of the target outline + half stroke of the edge (round join): tip just touches the outline
    const touch = (b.ring ? 0.625 : b.stroke / 2) + 0.75;
    let p;
    if (side === "l") p = { x: x0, y: cyMid + off, dir: [-1, 0] };
    if (side === "r") p = { x: x1, y: cyMid + off, dir: [1, 0] };
    if (side === "t") p = { x: cxMid + off, y: y0, dir: [0, -1] };
    if (side === "b") p = { x: cxMid + off, y: y1, dir: [0, 1] };
    if (b.shape === "cyl" && side === "b") p.y = b.y + b.h; // bottom of the lower arc
    p.side = side; p.touch = touch; p.box = b;
    return p;
  }

  route(e) {
    const a = this.port(e.from, false), b = this.port(e.to, true);
    // arrow tip sits outside the target outline
    const tip = { x: b.x + b.dir[0] * b.touch, y: b.y + b.dir[1] * b.touch };
    const start = { x: a.x, y: a.y };
    let pts = [[start.x, start.y]];
    const hA = a.side === "l" || a.side === "r", hB = b.side === "l" || b.side === "r";
    if (e.pts) pts.push(...e.pts);
    else if (hA && hB) {
      if (Math.abs(start.y - tip.y) > 0.01) { const mx = e.via?.x ?? (start.x + tip.x) / 2; pts.push([mx, start.y], [mx, tip.y]); }
    } else if (!hA && !hB) {
      if (Math.abs(start.x - tip.x) > 0.01) { const my = e.via?.y ?? (start.y + tip.y) / 2; pts.push([start.x, my], [tip.x, my]); }
    } else if (hA && !hB) pts.push([tip.x, start.y]);
    else pts.push([start.x, tip.y]);
    pts.push([tip.x, tip.y]);
    // drop duplicate / collinear points
    pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
    const clean = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [p, q, r] = [clean.at(-1), pts[i], pts[i + 1]];
      const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
      if (Math.abs(cross) > 0.01) clean.push(q);
    }
    clean.push(pts.at(-1));
    return { pts: clean, dirEnd: b.dir.map((v) => -v), a, b };
  }

  // rounded orthogonal path (radius 8, clamped) + its length
  pathD(pts, R = 8) {
    let d = `M${n2(pts[0][0])} ${n2(pts[0][1])}`; let L = 0; let prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (i < pts.length - 1) {
        const n = pts[i + 1];
        const l1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]), l2 = Math.hypot(n[0] - p[0], n[1] - p[1]);
        const r = Math.min(R, l1 / 2, l2 / 2);
        const a = [p[0] - (p[0] - prev[0]) / l1 * r, p[1] - (p[1] - prev[1]) / l1 * r];
        const b = [p[0] + (n[0] - p[0]) / l2 * r, p[1] + (n[1] - p[1]) / l2 * r];
        L += Math.hypot(a[0] - prev[0], a[1] - prev[1]) + r * Math.PI / 2 * 0.98;
        d += `L${n2(a[0])} ${n2(a[1])}Q${n2(p[0])} ${n2(p[1])} ${n2(b[0])} ${n2(b[1])}`;
        prev = b;
      } else {
        L += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        d += `L${n2(p[0])} ${n2(p[1])}`;
      }
    }
    return { d, L };
  }

  pointAt(pts, t) {
    const segs = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); tot += l; }
    let want = tot * t;
    for (let i = 0; i < segs.length; i++) {
      if (want <= segs[i] || i === segs.length - 1) {
        const f = segs[i] ? want / segs[i] : 0;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, pts[i + 1][0] === pts[i][0] ? "v" : "h"];
      }
      want -= segs[i];
    }
  }

  // ------------------------------------------------------------ elements
  group(g) {
    const { x, y, w, h } = g;
    this.boxes.set(g.id, { x, y, w, h, stroke: 1, group: true });
    let s = `<rect class="dg-grp" x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="14"/>`;
    if (g.tab) {
      const label = g.tab.toUpperCase();
      const tw = textW(label, "tab");
      const tx = g.tabAlign === "center" ? x + w / 2 - tw / 2 : g.tabAlign === "right" ? x + w - 16 - tw : x + 16;
      s += `<rect class="dg-tabbg" x="${n2(tx - 7)}" y="${y - 7.5}" width="${n2(tw + 14)}" height="16" rx="4"/>`;
      s += `<text class="dg-tab" x="${n2(tx)}" y="${y + 4}">${esc(label)}</text>`;
      if (tw + 30 > w) this.warn.push(`group tab overflows: ${g.tab}`);
    }
    if (g.co) this.lateCallouts.push(this.callout(g.co, g.coX ?? (g.tabAlign === "right" ? x + 20 : x + w - 16), y));
    return s;
  }

  // layout: "row" (well left, text left), "center" (well + text centred), "tile" (well on top, text centred
  // below), "icon" (well only). Titles and sublabels accept "\n" for extra lines.
  node(n) {
    if (!KINDS[n.kind]) throw new Error(`unknown kind ${n.kind}`);
    const [cat0, shape, glyph0] = KINDS[n.kind];
    const cat = n.tone ?? cat0;
    if (n.kind !== "more") this.kindsUsed.add(n.kind);
    if (cat) this.used.add(cat);
    const { x, y, w } = n; const h = n.h ?? 56;
    const ry = n.ry ?? 6;
    const cy = shape === "cyl" ? y + h / 2 + ry / 2 : y + h / 2; // cylinder: content sits just below the lid
    const ring = n.kind === "orch" ? 4 : 0;
    const stroke = n.kind === "orch" ? 2 : 1.5;
    this.boxes.set(n.id, { x, y, w, h, cy: y + h / 2, shape, ring, stroke, cat }); // ports use the silhouette centre
    const cls = `dg-n dg-${n.kind}${cat ? ` dg-c-${cat}` : ""}`;
    // motion hooks: when the main-path pulse reaches this node (or the group it sits in), as --at / --k
    const hit = this.arrivalOf(n.id, { x, y, w, h });
    let s = `<g class="${cls}"${hit ? ` style="--at:${hit.at}${hit.k ? `;--k:${hit.k}` : ""}"` : ""}>`;
    const rx0 = n.rx ?? 10;
    for (let i = n.stack ?? 0; i > 0; i--) s += `<rect class="dg-b dg-stk" x="${x + i * 8}" y="${y - i * 6}" width="${w - i * 16}" height="${h}" rx="${rx0}"/>`;
    if (ring) s += `<rect class="dg-ring" x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="${rx0 + 4}"/>`;
    if (shape === "cyl") {
      const rx = w / 2;
      const body = `d="M${x} ${y + ry}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}Z"`;
      s += `<path class="dg-b" ${body}/>`;
      if (hit) s += `<path class="dg-hl" ${body}/>`;
      s += `<path class="dg-rim" d="M${x} ${y + ry}A${rx} ${ry} 0 0 0 ${x + w} ${y + ry}"/>`;
    } else {
      s += `<rect class="dg-b" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx0}"/>`;
      if (hit) s += `<rect class="dg-hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx0}"/>`;
    }
    const mode = n.tile ? "tile" : n.align === "center" ? (n.t ? "center" : "icon") : "row";
    const gName = n.g === undefined ? glyph0 : n.g;
    const gs = n.gs ?? 16;
    const WL = n.wl ?? 28; // icon well
    const well = n.kind !== "ext" && n.kind !== "more" && n.well !== false;
    const tl = n.t ? String(n.t).split("\n") : [];
    const sl = n.s ? String(n.s).split("\n") : [];
    const tw = Math.max(0, ...tl.map((t) => textW(t, n.font ?? "title")));
    const sw = Math.max(0, ...sl.map((t) => textW(t, "sub")));
    const D = 16 * Math.max(tl.length - 1, 0) + (sl.length ? (tl.length ? 16 : 0) + 15 * (sl.length - 1) : 0);
    const drawWell = (wx, wy) => {
      if (!gName) return "";
      return (well ? `<rect class="dg-w" x="${n2(wx)}" y="${n2(wy)}" width="${WL}" height="${WL}" rx="${n2(WL * 0.29)}"/>` : "") +
        glyph(gName, wx + (WL - gs) / 2, wy + (WL - gs) / 2, gs);
    };
    const drawText = (tx, b0, anchor) => {
      const a = anchor ? ` text-anchor="middle"` : "";
      let o = ""; let b = b0;
      tl.forEach((t, i) => { o += `<text class="dg-t" x="${n2(tx)}" y="${n2(b)}"${a}>${esc(t)}</text>`; if (i < tl.length - 1) b += 16; });
      if (sl.length && tl.length) b += 16;
      sl.forEach((t, i) => { o += `<text class="dg-s" x="${n2(tx)}" y="${n2(b)}"${a}>${esc(t)}</text>`; if (i < sl.length - 1) b += 15; });
      return o;
    };
    let need = 0;
    if (mode === "tile") {
      const top = (shape === "cyl" ? y + 2 * ry + 6 : y) + (n.wellTop ?? 14);
      s += drawWell(x + w / 2 - WL / 2, top);
      const b0 = top + (gName ? WL : 0) + 21;
      s += drawText(x + w / 2, b0, true);
      need = Math.max(tw, sw) + 16;
      const last = b0 + D;
      if (last + 10 > y + h + 0.5) this.warn.push(`tile ${n.id} text runs past the bottom (${n2(last + 10)} > ${y + h})`);
    } else if (mode === "icon") {
      s += drawWell(x + w / 2 - WL / 2, cy - WL / 2);
    } else {
      const b0 = cy - (D - 9.45) / 2;
      if (mode === "center") {
        const lead = gName ? (well ? WL + 10 : gs + 10) : 0;
        const blockW = lead + Math.max(tw, sw);
        const bx = x + w / 2 - blockW / 2;
        if (gName) s += well ? drawWell(bx, cy - WL / 2) : glyph(gName, bx, cy - gs / 2, gs);
        s += gName ? drawText(bx + lead, b0, false) : drawText(x + w / 2, b0, true);
        need = blockW + 28;
      } else {
        const tx0 = gName ? (well ? 10 + WL + 10 : 40) : 16;
        if (gName) s += well ? drawWell(x + 10, cy - WL / 2) : glyph(gName, x + 14, cy - gs / 2, gs);
        s += drawText(x + tx0, b0, false);
        need = tx0 + 14 + Math.max(tw, sw);
      }
    }
    if (n.pip) s += `<circle class="dg-dot" cx="${n2(x + w / 2)}" cy="${n2(cy)}" r="${n.pip}"/>`;
    s += `</g>`;
    if (n.cap) {
      const cl = String(n.cap).split("\n");
      const above = n.capPos === "above";
      cl.forEach((c, i) => { const cyy = above ? y - (n.capGap ?? 12) - (cl.length - 1 - i) * 16 : y + h + (n.capGap ?? 22) + i * 16; s += `<text class="dg-cap" x="${n2(x + w / 2)}" y="${n2(cyy)}" text-anchor="middle">${esc(c)}</text>`; });
    }
    if ((tl.length || sl.length) && need > w + 0.5) this.warn.push(`text overflow in ${n.id}: needs ${Math.ceil(need)} > ${w}`);
    for (const [k, v] of Object.entries({ x, y, w, h })) if (v % 4 !== 0 && !n.offgrid) this.warn.push(`${n.id}.${k}=${v} off the 4px half-grid`);
    if (n.co) s += this.callout(n.co, x + w - (n.coIn ?? 8), y - (n.coUp ?? 0));
    return s;
  }

  // When the main-path pulse reaches a node: its hop index + 1 (0 = where the first hop leaves). A node inside a
  // target group lights up with the group, in reading order (k), so a row of agents ripples as the request lands.
  arrivalOf(id, b) {
    const at = this.arrive?.get(id);
    if (at !== undefined) return { at, k: 0 };
    for (const [gid, gat] of this.arrive ?? []) {
      const g = this.boxes.get(gid);
      if (!g?.group || b.x < g.x || b.y < g.y || b.x + b.w > g.x + g.w || b.y + b.h > g.y + g.h) continue;
      const k = (this.wave[gid] = (this.wave[gid] ?? -1) + 1);
      return { at: gat, k };
    }
    return null;
  }

  callout(num, cx, cy) {
    this.hasCallout = true;
    return `<g class="dg-co"><circle cx="${n2(cx)}" cy="${n2(cy)}" r="10"/><text x="${n2(cx)}" y="${n2(cy + 3.9)}">${num}</text></g>`;
  }

  edge(e) {
    const { pts, dirEnd } = this.route(e);
    const { d, L } = this.pathD(pts);
    const cls = `dg-e${e.async ? " dg-a" : ""}`;
    if (e.async) this.hasAsync = true; else this.hasSync = true;
    let s = `<path class="${cls}" d="${d}"/>`;
    if (e.head !== false) {
      const [tx, ty] = pts.at(-1); const [dx, dy] = dirEnd; const AL = 5.5, AW = 4;
      const bx = tx - dx * AL, by = ty - dy * AL;
      s += `<path class="dg-ah" d="M${n2(bx - dy * AW)} ${n2(by + dx * AW)}L${n2(tx)} ${n2(ty)}L${n2(bx + dy * AW)} ${n2(by - dx * AW)}"/>`;
    }
    if (e.label) {
      let [lx, ly] = e.lxy ?? this.pointAt(pts, e.lt ?? 0.5);
      if (e.lo) { lx += e.lo[0]; ly += e.lo[1]; }
      const tw = textW(e.label, "el");
      s += `<rect class="dg-elbg" x="${n2(lx - tw / 2 - 6)}" y="${n2(ly - 8)}" width="${n2(tw + 12)}" height="16" rx="4"/>`;
      s += `<text class="dg-el" x="${n2(lx)}" y="${n2(ly + 3.7)}" text-anchor="middle">${esc(e.label)}</text>`;
    }
    this.checkEdge(e, pts);
    return { svg: s, d, L, to: e.to.split(":")[0] };
  }

  checkEdge(e, pts) {
    const ends = new Set([e.from.split(":")[0], e.to.split(":")[0]]);
    for (const [id, b] of this.boxes) {
      if (ends.has(id) || b.group) continue;
      for (let i = 1; i < pts.length; i++) {
        const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
        const minx = Math.min(x1, x2), maxx = Math.max(x1, x2), miny = Math.min(y1, y2), maxy = Math.max(y1, y2);
        if (maxx > b.x + 1 && minx < b.x + b.w - 1 && maxy > b.y + 1 && miny < b.y + b.h - 1) this.warn.push(`edge ${e.from}->${e.to} crosses ${id}`);
      }
    }
  }

  legend(lg) {
    const LABEL = { orch: "orchestrator", agent: "agent", data: "retrieval · data", model: "model · LLM", eval: "evaluation", guard: "guard · safety", infra: "service · infra", store: "store", ext: "external" };
    const kinds = ["orch", "agent", "data", "model", "eval", "guard", "infra", "store", "ext"].filter((k) => this.kindsUsed.has(k) && !(lg.skip ?? []).includes(k)).map((k) => ({ k, label: lg.labels?.[k] ?? LABEL[k] }));
    const links = [];
    if (this.hasSync) links.push({ e: "sync", label: "request" });
    if (this.hasAsync) links.push({ e: "async", label: "batch · background" });
    if (this.hasCallout) links.push({ co: true, label: "note" });
    const rowH = lg.rowH ?? 24, gap = lg.gap ?? 24;
    const maxW = lg.w ?? this.W - lg.x * 2;
    let s = `<g class="dg-legend">`;
    let y = lg.y;
    const rows = lg.oneRow ? [[...kinds, ...links]] : [kinds, links];
    for (const row of rows) {
      if (!row.length) continue;
      let x = lg.x, col = 0;
      for (const it of row) {
        const sw = it.e ? 28 : 16;
        const iw = sw + 8 + textW(it.label, "lg");
        if (lg.cols) {
          if (col === lg.cols) { col = 0; y += rowH; }
          x = lg.x + col * (maxW / lg.cols); col++;
        } else if (x > lg.x && x + iw > lg.x + maxW + 0.5) { x = lg.x; y += rowH; }
        const cy = y - 4;
        if (it.k) {
          const [cat0, shape] = KINDS[it.k];
          const cls = `dg-n dg-${it.k}${cat0 ? ` dg-c-${cat0}` : ""}`;
          s += `<g class="${cls}">`;
          if (shape === "cyl") s += `<path class="dg-w dg-lsw" d="M${x} ${cy - 5.5}a8 2.5 0 0 1 16 0v11a8 2.5 0 0 1 -16 0z"/><path class="dg-rim" d="M${x} ${cy - 5.5}a8 2.5 0 0 0 16 0"/>`;
          else if (it.k === "ext") s += `<rect class="dg-b" x="${x + 0.75}" y="${cy - 7.25}" width="14.5" height="14.5" rx="4"/>`;
          else if (it.k === "orch") s += `<rect class="dg-ring" x="${x - 2.5}" y="${cy - 10.5}" width="21" height="21" rx="7"/><rect class="dg-b" x="${x + 1}" y="${cy - 7}" width="14" height="14" rx="4"/>`;
          else s += `<rect class="dg-w dg-lsw" x="${x + 0.75}" y="${cy - 7.25}" width="14.5" height="14.5" rx="4"/>`;
          if (it.k !== "ext") s += `<circle class="dg-dot" cx="${x + 8}" cy="${shape === "cyl" ? cy + 1.5 : cy}" r="2.5"/>`;
          s += `</g>`;
        } else if (it.e) {
          s += `<path class="dg-e${it.e === "async" ? " dg-a" : ""}" d="M${x} ${cy}H${x + 26}"/><path class="dg-ah" d="M${x + 22.5} ${cy - 4}L${x + 26.5} ${cy}L${x + 22.5} ${cy + 4}"/>`;
        } else if (it.co) {
          s += `<g class="dg-co"><circle cx="${x + 8}" cy="${cy}" r="8"/><text x="${x + 8}" y="${cy + 3.4}" style="font-size:9.5px">1</text></g>`;
        }
        s += `<text class="dg-lg" x="${x + sw + 8}" y="${y}">${esc(it.label)}</text>`;
        if (!lg.cols) x += iw + gap;
      }
      y += rowH;
    }
    s += `</g>`;
    this.legendBottom = y - rowH;
    return s;
  }

  render() {
    const S = this.s;
    let groups = "", nodes = "", edges = "", pulses = "", extra = "";
    // arrivals along the main path (see arrivalOf): first hop's sources leave at 0, each hop's target arrives at i + 1
    this.arrive = new Map(); this.wave = {};
    const byId = new Map((S.edges ?? []).map((e, i) => [e.id ?? i, e]));
    (S.main ?? []).forEach((step, i) => {
      for (const eid of [step].flat()) {
        const e = byId.get(eid); if (!e) continue;
        const from = e.from.split(":")[0], to = e.to.split(":")[0];
        if (i === 0 && !this.arrive.has(from)) this.arrive.set(from, 0);
        if (!this.arrive.has(to)) this.arrive.set(to, i + 1);
      }
    });
    for (const g of S.groups ?? []) groups += this.group(g);
    for (const n of S.nodes) nodes += this.node(n);
    const edgeOut = {};
    for (const [i, e] of (S.edges ?? []).entries()) { const r = this.edge(e); edges += r.svg; edgeOut[e.id ?? i] = r; }
    const main = S.main ?? [];
    main.forEach((step, i) => {
      for (const eid of [step].flat()) {
        const r = edgeOut[eid]; if (!r) throw new Error(`${this.id}: main path edge ${eid} missing`);
        const cat = this.boxes.get(r.to)?.cat;
        const st = `style="--L:${Math.ceil(r.L) + 2}px;--i:${i}"`;
        const cc = cat ? ` dg-c-${cat}` : "";
        pulses += `<path class="dg-p dg-ph${cc}" d="${r.d}" ${st}/><path class="dg-p${cc}" d="${r.d}" ${st}/>`;
      }
    });
    for (const t of S.texts ?? []) extra += `<text class="${t.cls ?? "dg-el"}" x="${t.x}" y="${t.y}"${t.anchor ? ` text-anchor="${t.anchor}"` : ""}>${esc(t.text)}</text>`;
    for (const c of S.callouts ?? []) extra += this.callout(c.n, c.x, c.y);
    extra += this.lateCallouts.join("");
    const legend = S.legend ? this.legend(S.legend) : "";
    if (main.length > 8) this.warn.push("main path longer than 8 hops: pulses overlap");
    const dots = S.grid === false ? "" : `<defs><pattern id="${this.pid}-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle class="dg-dots" cx="12" cy="12" r="1"/></pattern></defs>`;
    const bg = `<rect class="dg-cv" width="${this.W}" height="${this.H}" rx="16"/>` + (S.grid === false ? "" : `<rect width="${this.W}" height="${this.H}" rx="16" fill="url(#${this.pid}-dots)" opacity="${S.gridOpacity ?? 0.55}"/>`);
    const style = shake(css([...this.used]), `${dots}${bg}${groups}${edges}${pulses}${nodes}${extra}${legend}`);
    const vars = "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}" width="${this.W}" height="${this.H}" class="dg dg-${this.variant}" role="img" aria-labelledby="${this.pid}-title" aria-describedby="${this.pid}-desc" lang="en" direction="ltr" fill="none"${vars}>` +
      `<title id="${this.pid}-title">${esc(this.title)}</title><desc id="${this.pid}-desc">${esc(this.desc)}</desc>` +
      `<style>${style}</style>${dots}${bg}${groups}${edges}${pulses}${nodes}${extra}${legend}</svg>`;
    this.checkOverlaps();
    return svg;
  }

  checkOverlaps() {
    const list = [...this.boxes.entries()].filter(([, b]) => !b.group);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [ia, a] = list[i], [ib, b] = list[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) this.warn.push(`nodes overlap: ${ia} / ${ib}`);
    }
    for (const [id, b] of this.boxes) if (b.x < 0 || b.y < 0 || b.x + b.w > this.W || b.y + b.h > this.H) this.warn.push(`${id} outside canvas`);
  }
}

// WCAG contrast helper for build-time checks
export function contrast(a, b) {
  const hex = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, bl] = hex(c); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export { TOK };
