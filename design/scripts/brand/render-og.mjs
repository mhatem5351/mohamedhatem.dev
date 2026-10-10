// Open Graph images (1200 x 630) for mohamedhatem.dev.
//
//   node design/scripts/brand/render-og.mjs                 rebuild templates + the four sample cards
//   node design/scripts/brand/render-og.mjs --data og.json  render your own cards (see SAMPLES for the shape)
//
// 1. Writes the templates assets/brand/og/og-home.svg and og-case.svg. They are drawn in LTR
//    coordinates with {{PLACEHOLDER}} tokens for every string and data-* attributes that describe
//    the text flow (max width, line height, gaps, auto-fit). Nothing in them is language-specific.
// 2. For each card: fills the tokens, opens it in a headless browser with the self-hosted fonts,
//    and lays the text out there, so widths are measured with real shaping (Arabic joins, bidi,
//    Latin runs inside Arabic). RTL cards mirror the layout: text starts at the right edge, the
//    decorative layer (graph, glows, dot grid) flips to the left, the monogram is moved, not flipped.
// 3. Serialises the laid-out SVG with subset WOFF2 fonts embedded (so the filled SVG renders the
//    same anywhere), then screenshots THAT file to PNG (social platforms need PNG/JPG).
import fs from "node:fs";
import path from "node:path";
import { BRAND, SCREENS, palette, need, FONT_FILES, browser, closeBrowser, esc, write, kb, round as R } from "./lib.mjs";
import { mh, MASTER } from "./monogram-geom.mjs";

const OG = path.join(BRAND, "og");
const W = 1200, H = 630, M = 72;            // M: text margin (the safe margin is 60)
const P = palette("dark");                  // deep-ink theme: best contrast in feeds

// ---------------------------------------------------------------- fonts
const FACES = [
  { family: "Space Grotesk Variable", weight: "300 700", file: FONT_FILES.display },
  { family: "Inter Variable", weight: "100 900", file: FONT_FILES.sans },
  { family: "JetBrains Mono Variable", weight: "100 800", file: FONT_FILES.mono },
  { family: "IBM Plex Sans Arabic", weight: "400", file: FONT_FILES.ar400 },
  { family: "IBM Plex Sans Arabic", weight: "500", file: FONT_FILES.ar500 },
  { family: "IBM Plex Sans Arabic", weight: "600", file: FONT_FILES.ar600 },
  { family: "IBM Plex Sans Arabic", weight: "700", file: FONT_FILES.ar700 },
];
const face = (f, buf) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${buf.toString("base64")}) format("woff2")}`;
const FULL_FONT_CSS = FACES.map(f => face(f, fs.readFileSync(f.file))).join("");
// the filled SVGs embed static instances of just the weights the cards use, subset to their text
const PINNED = [
  { family: "Space Grotesk Variable", file: FONT_FILES.display, weights: [500, 600, 700] },
  { family: "Inter Variable", file: FONT_FILES.sans, weights: [400] },
  { family: "JetBrains Mono Variable", file: FONT_FILES.mono, weights: [500, 600] },
];
async function subsetFontCSS(usage) {
  // usage: { "family|weight": "chars" } collected from the laid-out card
  const subsetFont = need("subset-font");
  let css = "";
  for (const [key, chars] of Object.entries(usage).sort()) {
    const [family, weight] = key.split("|"), w = +weight;
    const pinned = PINNED.find(f => f.family === family);
    if (pinned) {
      const buf = await subsetFont(fs.readFileSync(pinned.file), chars + " ", { targetFormat: "woff2", variationAxes: { wght: w } });
      css += face({ family, weight: String(w) }, buf);
    } else {
      const f = FACES.find(f => f.family === family && +f.weight === w);
      if (!f) throw new Error(`no font file for ${key}`);
      css += face(f, await subsetFont(fs.readFileSync(f.file), chars + " ", { targetFormat: "woff2" }));
    }
  }
  return css;
}
/** in the page: which (family, weight) renders which characters */
function fontUsage() {
  const use = {};
  const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const walk = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 1) { if (!/^(title|desc|style)$/i.test(n.tagName)) walk(n); continue; }
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const cs = getComputedStyle(n.parentElement);
      const fams = cs.fontFamily.split(",").map(f => f.trim().replace(/^["']|["']$/g, ""));
      const w = String(Math.round(parseFloat(cs.fontWeight)));
      for (const ch of n.textContent) {
        if (/\s/.test(ch) || /[\u200E\u200F\u2066-\u2069]/.test(ch)) continue;
        const fam = ARABIC.test(ch) ? "IBM Plex Sans Arabic" : fams.find(f => f !== "IBM Plex Sans Arabic");
        const k = fam + "|" + w; use[k] = (use[k] || "") + (use[k] && use[k].includes(ch) ? "" : ch);
      }
    }
  };
  walk(document.querySelector("svg"));
  return use;
}

// ---------------------------------------------------------------- decorative pieces
const DISPLAY = `"Space Grotesk Variable","Space Grotesk",sans-serif`;
const SANS = `"Inter Variable","Inter",sans-serif`;
const MONO = `"JetBrains Mono Variable","JetBrains Mono",ui-monospace,monospace`;
const AR = `"IBM Plex Sans Arabic"`;

function qpt(p0, c, p1, t) { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]; }
function qlen(p0, c, p1) { let L = 0, prev = p0; for (let i = 1; i <= 64; i++) { const p = qpt(p0, c, p1, i / 64); L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; } return L; }
function edge(a, b, ra, rb, bend) {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  const p0 = [a[0] + ux * ra, a[1] + uy * ra], p1 = [b[0] - ux * rb, b[1] - uy * rb];
  const c = [(p0[0] + p1[0]) / 2 - uy * bend, (p0[1] + p1[1]) / 2 + ux * bend];
  return { d: `M${R(p0[0])} ${R(p0[1])}Q${R(c[0])} ${R(c[1])} ${R(p1[0])} ${R(p1[1])}`, L: qlen(p0, c, p1) };
}
/** the agent graph, static: orchestrator hub + five satellites, dotted spokes, curved rim, two frozen pulses */
function graph({ cx, cy, rx, ry, s }) {
  const ORR = 30 * s, NR = 15 * s;
  const nodes = [
    ["retrieve", P.saffronF, -90], ["rerank", P.saffronF, -18], ["generate", P.coralF, 54],
    ["evaluate", P.skyF, 126], ["guard", P.sageF, 198],
  ].map(([name, col, a]) => ({ name, col, x: cx + rx * Math.cos(a * Math.PI / 180), y: cy + ry * Math.sin(a * Math.PI / 180) }));
  const O = [cx, cy];
  const spokes = nodes.map(n => edge(O, [n.x, n.y], ORR + 6 * s, NR + 5 * s, 0));
  const rim = nodes.slice(0, -1).map((n, i) => edge([n.x, n.y], [nodes[i + 1].x, nodes[i + 1].y], NR + 5 * s, NR + 5 * s, -26 * s));
  const back = edge([nodes[4].x, nodes[4].y], O, NR + 5 * s, ORR + 6 * s, 22 * s);
  let g = "";
  for (const e of spokes) g += `<path d="${e.d}" stroke="${P.edge}" stroke-width="${R(1.6 * s)}" stroke-linecap="round" stroke-dasharray="${R(1 * s)} ${R(5.5 * s)}"/>`;
  for (const e of [...rim, back]) g += `<path d="${e.d}" stroke="${P.edge}" stroke-width="${R(1.8 * s)}" stroke-linecap="round"/>`;
  // frozen pulses: a bright segment with a soft halo, travelling towards its target node
  const pulse = (e, col, at) => {
    const len = 30 * s, off = -(e.L * at - len / 2);
    return `<path d="${e.d}" stroke="${col}" stroke-opacity=".22" stroke-width="${R(9 * s)}" stroke-linecap="round" stroke-dasharray="${R(len)} ${R(e.L + 100)}" stroke-dashoffset="${R(off)}"/>` +
      `<path d="${e.d}" stroke="${col}" stroke-width="${R(3.2 * s)}" stroke-linecap="round" stroke-dasharray="${R(len)} ${R(e.L + 100)}" stroke-dashoffset="${R(off)}"/>`;
  };
  g += pulse(spokes[0], P.saffronF, 0.55) + pulse(rim[2], P.skyF, 0.5);
  // orchestrator: soft halo, dashed outer ring, solid ring, hub glyph
  g += `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(ORR + 26 * s)}" fill="${P.tealF}" opacity=".07"/>`;
  g += `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(ORR + 9 * s)}" stroke="${P.tealF}" stroke-opacity=".55" stroke-width="${R(1.4 * s)}" stroke-dasharray="${R(5 * s)} ${R(4 * s)}"/>`;
  g += `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(ORR)}" fill="${P.node}" stroke="${P.tealF}" stroke-width="${R(2.4 * s)}"/>`;
  const hs = 9 * s;
  g += `<path d="M${R(cx - hs)} ${R(cy - hs * .6)}L${R(cx)} ${R(cy)}L${R(cx + hs)} ${R(cy - hs * .6)}M${R(cx)} ${R(cy)}V${R(cy + hs)}" stroke="${P.teal}" stroke-width="${R(2 * s)}" stroke-linecap="round"/>`;
  g += `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(3.6 * s)}" fill="${P.teal}"/>`;
  for (const [x, y] of [[cx - hs, cy - hs * .6], [cx + hs, cy - hs * .6], [cx, cy + hs]]) g += `<circle cx="${R(x)}" cy="${R(y)}" r="${R(2.6 * s)}" fill="${P.teal}"/>`;
  for (const n of nodes) {
    g += `<circle cx="${R(n.x)}" cy="${R(n.y)}" r="${R(NR)}" fill="${P.node}" stroke="${n.col}" stroke-width="${R(2.2 * s)}"/>`;
    g += `<circle cx="${R(n.x)}" cy="${R(n.y)}" r="${R(5 * s)}" fill="${n.col}"/>`;
  }
  return g;
}
function background({ gx, gy }) {
  const defs = `<pattern id="og-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.15" fill="${P.grid}"/></pattern>` +
    `<linearGradient id="og-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".45" stop-color="#fff" stop-opacity=".3"/><stop offset=".8" stop-color="#fff" stop-opacity="1"/></linearGradient>` +
    `<mask id="og-m"><rect width="${W}" height="${H}" fill="url(#og-fade)"/></mask>` +
    `<radialGradient id="og-g1" cx="${gx}" cy="${gy}" r="430" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.tealF}" stop-opacity=".17"/><stop offset="1" stop-color="${P.tealF}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="og-g2" cx="${W - 30}" cy="10" r="400" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.saffronF}" stop-opacity=".10"/><stop offset="1" stop-color="${P.saffronF}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="og-g3" cx="30" cy="${H}" r="460" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.coralF}" stop-opacity=".08"/><stop offset="1" stop-color="${P.coralF}" stop-opacity="0"/></radialGradient>`;
  const body = `<rect width="${W}" height="${H}" fill="url(#og-g1)"/><rect width="${W}" height="${H}" fill="url(#og-g2)"/><rect width="${W}" height="${H}" fill="url(#og-g3)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#og-dots)" mask="url(#og-m)"/>`;
  return { defs, body };
}
function stripe(k = 1.4) {
  return `<rect width="${R(54 * k)}" height="${R(5 * k)}" rx="${R(2.5 * k)}" fill="${P.tealF}"/>` +
    `<rect x="${R(60 * k)}" width="${R(30 * k)}" height="${R(5 * k)}" rx="${R(2.5 * k)}" fill="${P.saffronF}"/>` +
    `<rect x="${R(96 * k)}" width="${R(16 * k)}" height="${R(5 * k)}" rx="${R(2.5 * k)}" fill="${P.coralF}"/>`;
}
function mark(h) {
  const g = mh(MASTER), k = h / (g.bounds.y1 - g.bounds.y0);
  return { w: R((g.bounds.x1 - g.bounds.x0) * k), svg: `<path d="${g.d}" transform="scale(${R(k * 1000) / 1000}) translate(${-g.bounds.x0} ${-g.bounds.y0})" fill="${P.ink}"/>` +
    `<circle cx="${R((g.node.cx - g.bounds.x0) * k)}" cy="${R((g.node.cy - g.bounds.y0) * k)}" r="${R(g.node.r * k)}" fill="${P.tealF}"/>` };
}

// ---------------------------------------------------------------- templates
const CSS = (extra = "") => `
text{font-kerning:normal;font-variant-ligatures:common-ligatures}
.domain{font:500 28px ${MONO};fill:${P.muted}}
.name{font:700 92px ${DISPLAY};letter-spacing:-0.035em;fill:${P.ink}}
.role{font:500 40px ${DISPLAY};letter-spacing:-0.01em;fill:${P.ink2}}
.focus{font:500 28px ${MONO};fill:${P.ink2}}
.eyebrow{font:600 28px ${MONO};letter-spacing:0.08em;fill:${P.teal}}
.title{font:600 58px ${DISPLAY};letter-spacing:-0.025em;fill:${P.ink}}
.summary{font:400 30px ${SANS};fill:${P.ink2}}
.meta{font:500 30px ${DISPLAY};fill:${P.ink2}}
.period{font:500 28px ${MONO};fill:${P.muted}}
.chip{font:500 28px ${MONO}}
.sep-s{fill:${P.saffron}}.sep-c{fill:${P.coral}}.org{fill:${P.teal}}
[lang="ar"] .name{font:700 84px ${AR},${DISPLAY};letter-spacing:0}
[lang="ar"] .role{font:500 38px ${AR},${DISPLAY};letter-spacing:0}
[lang="ar"] .focus{font:500 29px ${AR},${MONO}}
[lang="ar"] .eyebrow{font:600 30px ${AR},${MONO};letter-spacing:0}
[lang="ar"] .title{font:700 54px ${AR},${DISPLAY};letter-spacing:0}
[lang="ar"] .summary{font:400 30px ${AR},${SANS}}
[lang="ar"] .meta{font:500 30px ${AR},${DISPLAY}}
${extra}`;

function svgShell({ kind, graphAt, body }) {
  const bg = background(graphAt);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" lang="{{LANG}}" data-dir="{{DIR}}" data-kind="${kind}" data-margin="${M}" data-bottom="${H - 62}" fill="none" role="img" aria-label="{{ALT}}">` +
    `<title>{{ALT}}</title><style>{{FONTS}}${CSS()}</style><defs>${bg.defs}</defs>` +
    `<rect width="${W}" height="${H}" fill="${P.bg}"/>` +
    `<g id="decor" data-mirror="flip">${bg.body}{{GRAPH}}</g>` + body + `</svg>\n`;
}
// header: monogram + domain (same on both cards)
function header() {
  const mk = mark(40);
  return `<g id="mark" data-mirror="move" transform="translate(${M} 62)">${mk.svg}</g>` +
    `<text id="domain" class="domain" data-mirror="x-end" x="${R(M + mk.w + 18)}" y="92">{{DOMAIN}}</text>`;
}
function homeTemplate() {
  const graphAt = { gx: 950, gy: 330 };
  const body = header() +
    // flow: data-gap = distance from the previous item's last baseline (or data-top) to this item's first baseline
    `<g id="flow" data-top="262" data-settle="0.3">` +
    `<text id="name" class="name" data-flow data-gap="0" data-max="660" data-fit-min="64">{{NAME}}</text>` +
    `<text id="role" class="role" data-flow data-gap="64" data-max="680" data-fit-min="30" data-rich="{{ROLE}}|sep-s: · |org:{{ORG}}"></text>` +
    `<text id="focus" class="focus" data-flow data-gap="74" data-lh="42" data-max="600" data-items="{{FOCUS}}" data-sep="sep-c: · "></text>` +
    `<g id="stripe" data-flow data-gap="40" data-h="7" data-mirror="move">${stripe(1.4)}</g>` +
    `</g>`;
  return svgShell({ kind: "home", graphAt, body }).replace("{{GRAPH}}", graph({ cx: graphAt.gx, cy: graphAt.gy, rx: 170, ry: 154, s: 1.28 }));
}
function caseTemplate() {
  const graphAt = { gx: 1014, gy: 250 };
  const body = header() +
    `<g id="flow" data-top="172" data-settle="0.5">` +
    `<text id="eyebrow" class="eyebrow" data-flow data-gap="0" data-max="740">{{EYEBROW}}</text>` +
    `<text id="title" class="title" data-flow data-gap="64" data-gap-ar="70" data-lh="64" data-lh-ar="72" data-max="786" data-fit-min="44" data-max-lines="3">{{TITLE}}</text>` +
    `<text id="summary" class="summary" data-flow data-gap="52" data-gap-ar="58" data-lh="40" data-lh-ar="48" data-max="770" data-fit-min="28" data-max-lines="2">{{SUMMARY}}</text>` +
    `<g id="chips" data-flow data-gap="30" data-h="52" data-chips="{{CHIPS}}" data-max="${W - 2 * M}"></g>` +
    `<text id="meta" class="meta" data-flow data-gap="58" data-max="${W - 2 * M - 200}" data-rich="{{META_ROLE}}|sep-s: · |org:{{META_ORG}}|sep-s: · |period:{{META_PERIOD}}"></text>` +
    `</g>` +
    `<g id="stripe" data-mirror="move" data-align="meta" transform="translate(${R(W - M - 112 * 1.4)} 0)">${stripe(1.4)}</g>`;
  return svgShell({ kind: "case", graphAt, body }).replace("{{GRAPH}}", graph({ cx: graphAt.gx, cy: graphAt.gy, rx: 118, ry: 106, s: 0.92 }));
}

// ---------------------------------------------------------------- in-page layout (runs in the browser)
function layoutInPage() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.querySelector("svg");
  const W = +svg.getAttribute("width"), M = +svg.getAttribute("data-margin");
  const rtl = svg.getAttribute("data-dir") === "rtl", ar = svg.getAttribute("lang") === "ar";
  const bottomLimit = +svg.getAttribute("data-bottom");
  const xStart = rtl ? W - M : M;
  const A = (el, k, d) => (ar && el.hasAttribute(k + "-ar")) ? +el.getAttribute(k + "-ar") : (el.hasAttribute(k) ? +el.getAttribute(k) : d);
  const probe = document.createElementNS(NS, "text");
  probe.setAttribute("x", "0"); probe.setAttribute("y", "-500"); svg.appendChild(probe);
  const setDir = (el, d) => { el.setAttribute("direction", d); el.style.direction = d; el.style.unicodeBidi = "embed"; };
  function width(cls, segs, size) {
    probe.setAttribute("class", cls); probe.style.fontSize = size ? size + "px" : "";
    setDir(probe, rtl ? "rtl" : "ltr");
    probe.textContent = "";
    for (const [t, c] of segs) { const s = document.createElementNS(NS, "tspan"); if (c) s.setAttribute("class", c); s.textContent = t; probe.appendChild(s); }
    return probe.getComputedTextLength();
  }
  const RLM = "\u200F";
  const parseRich = str => str.split("|").map(p => { const i = p.indexOf(":"); return i > 0 && /^[a-z-]+$/.test(p.slice(0, i)) ? [p.slice(i + 1), p.slice(0, i)] : [p, ""]; })
    .filter(([t]) => t.length).map(([t, c]) => [!rtl ? t : c.startsWith("sep") ? RLM + t + RLM : isolate(t), c]);
  // in RTL, a Latin/number run (org name, "2023–2024") is isolated left-to-right, so its own order
  // survives and it is placed as one unit in the right-to-left sequence
  const isolate = t => /[\u0600-\u06FF]/.test(t) ? t : "\u2066" + t + "\u2069";
  function writeLines(el, lines, lh) {
    el.textContent = "";
    el.setAttribute("x", String(xStart));
    lines.forEach((segs, i) => {
      segs.forEach(([t, c], j) => {
        const s = document.createElementNS(NS, "tspan");
        if (c) s.setAttribute("class", c);
        if (j === 0) { s.setAttribute("x", String(xStart)); s.setAttribute("dy", i === 0 ? "0" : String(lh)); }
        s.textContent = t; el.appendChild(s);
      });
    });
    setDir(el, rtl ? "rtl" : "ltr");
    el.setAttribute("text-anchor", "start");
  }
  // word wrap with three typographic rules: break after a colon when the rest fits (title/subtitle
  // structure), never end a line on a short function word, and balance a two-line paragraph so the
  // second line is not a lonely word
  let lastSoft = false;
  const SHORT = /^(a|an|the|of|to|in|on|at|by|for|and|or|from|with|من|في|على|عن|إلى|و)$/i;
  function greedy(cls, words, max, size) {
    const lines = []; let cur = [];
    for (const w of words) { const t = [...cur, w]; if (!cur.length || width(cls, [[t.join(" "), ""]], size) <= max) cur = t; else { lines.push(cur); cur = [w]; } }
    if (cur.length) lines.push(cur);
    for (let i = 0; i < lines.length - 1; i++) {
      const l = lines[i];
      if (l.length > 1 && SHORT.test(l[l.length - 1])) {
        const moved = [l[l.length - 1], ...lines[i + 1]];
        if (width(cls, [[moved.join(" "), ""]], size) <= max) { lines[i + 1] = moved; l.pop(); }
      }
    }
    return lines;
  }
  const fits = (cls, lines, max, size) => lines.every(l => width(cls, [[l.join(" "), ""]], size) <= max);
  function wrapWords(cls, text, max, size) {
    const words = text.split(/\s+/).filter(Boolean);
    let lines = greedy(cls, words, max, size);
    const ci = words.findIndex(w => /[:：]$/.test(w));
    lastSoft = false;
    if (lines.length > 1 && ci >= 0 && ci < words.length - 1) {
      const head = words.slice(0, ci + 1), rest = greedy(cls, words.slice(ci + 1), max, size);
      const alt = [head, ...rest];
      if (fits(cls, alt, max, size) && alt.length <= lines.length) lines = alt;
      else if (alt.length <= lines.length) lastSoft = true;     // the colon break would read better at a smaller size
    }
    if (lines.slice(0, -1).some(l => l.length > 1 && SHORT.test(l[l.length - 1]))) lastSoft = true;
    if (lines.length === 2) {
      const [a, b] = lines;
      while (a.length > 1 && b.length < a.length - 1 && !/[:：]$/.test(a[a.length - 1])) {
        const na = a.slice(0, -1), nb = [a[a.length - 1], ...b];
        const wa = width(cls, [[na.join(" "), ""]], size), wb = width(cls, [[nb.join(" "), ""]], size);
        if (wb > max || wb > wa) break;
        b.unshift(a.pop());
      }
    }
    return lines.map(l => [[l.join(" "), ""]]);
  }
  const flow = svg.querySelector("#flow");
  const items = [...flow.querySelectorAll("[data-flow]")];
  const fit = new Map(items.map(el => [el, null]));
  function run() {
    let y = +flow.getAttribute("data-top"), last = null;
    for (const el of items) {
      const gap = A(el, "data-gap", 0), max = A(el, "data-max", W - 2 * M);
      const cls = el.getAttribute("class") || "";
      const size = fit.get(el);
      if (size) el.style.fontSize = size + "px";
      if (el.tagName === "text") {
        const base = parseFloat(getComputedStyle(el).fontSize);
        const lhAttr = A(el, "data-lh", 0);
        const lh = lhAttr ? lhAttr * (size ? size / (el._base || base) : 1) : base * 1.2;
        el._base = el._base || base;
        let lines;
        if (el.hasAttribute("data-rich")) lines = [parseRich(el.getAttribute("data-rich"))];
        else if (el.hasAttribute("data-items")) {
          const its = el.getAttribute("data-items").split("|").filter(Boolean);
          const [sc, st0] = el.getAttribute("data-sep").split(":"); const st = rtl ? RLM + st0 + RLM : st0;
          // fewest lines first, then the split whose longest line is shortest
          const seg = arr => arr.flatMap((it, i) => i ? [[st, sc], [it, ""]] : [[it, ""]]);
          let best = null;
          const splits = (n, k) => k === 1 ? [[n]] : Array.from({ length: n - k + 1 }, (_, i) => splits(n - i - 1, k - 1).map(r => [i + 1, ...r])).flat();
          for (let k = 1; k <= its.length && !best; k++) {
            for (const sp of splits(its.length, k)) {
              let o = 0; const ls = sp.map(c => { const l = seg(its.slice(o, o + c)); o += c; return l; });
              const wmax = Math.max(...ls.map(l => width(cls, l, size)));
              if (wmax <= max && (!best || wmax < best.w)) best = { w: wmax, ls };
            }
          }
          lines = best ? best.ls : [seg(its)];
        } else {
          if (!el.hasAttribute("data-text")) el.setAttribute("data-text", el.textContent.trim());
          lines = wrapWords(cls, el.getAttribute("data-text"), max, size);
          el._soft = lastSoft;
        }
        y += gap; writeLines(el, lines, lh);
        el.setAttribute("y", String(y));
        el._lines = lines.length; el._over = Math.max(...lines.map(l => width(cls, l, size))) > max + 0.5;
        y += (lines.length - 1) * lh; last = el;
      } else if (el.id === "chips") {
        const h = +el.getAttribute("data-h"); const chips = el.getAttribute("data-chips").split("|").filter(Boolean);
        el.textContent = ""; const top = y + gap - (last ? 0 : 0);
        let x = rtl ? W - M : M, row = 0;
        for (const c of chips) {
          const [label, cat] = c.split(":");
          const tw = width("chip", [[label, ""]]);
          const w = tw + 36;
          if ((rtl ? (W - M) - (x - w) : x + w - M) > max) { row++; x = rtl ? W - M : M; }
          const cx0 = rtl ? x - w : x;
          const g = document.createElementNS(NS, "g");
          g.innerHTML = `<rect x="${cx0}" y="${top + row * (h + 12)}" width="${w}" height="${h}" rx="10" stroke-width="1.5" style="fill:var(--${cat}-t);stroke:var(--${cat}-l)"/>` +
            `<text class="chip" x="${cx0 + w / 2}" y="${top + row * (h + 12) + h / 2 + 10}" text-anchor="middle" direction="ltr" style="fill:var(--${cat}-c)">${label}</text>`;
          el.appendChild(g);
          x = rtl ? x - w - 12 : x + w + 12;
        }
        y = top + row * (h + 12) + h; last = el;
      } else {
        // a block (stripe): data-h tall, its top at y + gap
        const h = +el.getAttribute("data-h");
        el.setAttribute("transform", `translate(${M} ${y + gap})`);
        el._top = y + gap; y += gap + h; last = el;
      }
    }
    return y;
  }
  // auto-fit: shrink the fit-able items (largest first) until the flow ends above the bottom limit,
  // no line overflows, and no item exceeds its max line count
  let bottom = run();
  for (let i = 0; i < 40; i++) {
    const bad = items.filter(el => el._over || (el.hasAttribute("data-max-lines") && el._lines > +el.getAttribute("data-max-lines")) ||
      // soft: a nicer break exists at a slightly smaller size (never below 86 % of the design size)
      (el._soft && (fit.get(el) || el._base) - 2 >= el._base * 0.86));
    if (!bad.length && bottom <= bottomLimit) break;
    const cand = (bad.length ? bad : items).filter(el => el.hasAttribute("data-fit-min"))
      .map(el => [el, fit.get(el) || parseFloat(getComputedStyle(el).fontSize)])
      .filter(([el, s]) => s - 2 >= +el.getAttribute("data-fit-min")).sort((a, b) => b[1] - a[1])[0];
    if (!cand) break;
    fit.set(cand[0], cand[1] - 2);
    bottom = run();
  }
  // settle: move the flow down by a share of the free space above the bottom limit
  const settle = +(flow.getAttribute("data-settle") || 0);
  if (settle > 0 && bottom < bottomLimit) {
    flow.setAttribute("data-top", String(+flow.getAttribute("data-top") + Math.round((bottomLimit - bottom) * settle)));
    bottom = run();
  }
  // mirror for RTL
  const out = [];
  if (rtl) {
    svg.querySelector("#decor").setAttribute("transform", `translate(${W} 0) scale(-1 1)`);
    for (const el of svg.querySelectorAll('[data-mirror="move"]')) {
      const bb = el.getBBox(); const m = (el.getAttribute("transform") || "").match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
      const tx = m ? +m[1] : 0, ty = m ? +m[2] : 0;
      el.setAttribute("transform", `translate(${W - (tx + bb.x) - bb.width - bb.x} ${ty})`);
    }
    const d = svg.querySelector('[data-mirror="x-end"]');
    if (d) { d.setAttribute("x", String(W - +d.getAttribute("x"))); d.setAttribute("text-anchor", "end"); setDir(d, "ltr"); }
  }
  // the case card's stripe sits on the meta line, at the end side
  const st = svg.querySelector('#stripe[data-align]');
  if (st) {
    const meta = svg.querySelector("#" + st.getAttribute("data-align"));
    const y = +meta.getAttribute("y") - 11;
    const x = rtl ? M : W - M - st.getBBox().width;
    st.setAttribute("transform", `translate(${x} ${y})`);
  }
  probe.remove();
  for (const el of items) {
    out.push({ id: el.id, lines: el._lines, over: el._over, size: fit.get(el) || null, text: el.tagName === "text" ? [...el.querySelectorAll("tspan[x]")].map(t => { let s = "", n = t; do { s += n.textContent; n = n.nextElementSibling; } while (n && !n.hasAttribute("x")); return s; }) : null });
    el.removeAttribute("data-text");
  }
  return { bottom, items: out };
}

// ---------------------------------------------------------------- render
const CAT_VARS = Object.entries({ teal: [P.tealT, P.tealTL, P.teal], saffron: [P.saffronT, P.saffronTL, P.saffron], coral: [P.coralT, P.coralTL, P.coral], sky: [P.skyT, P.skyTL, P.sky], sage: [P.sageT, P.sageTL, P.sage], slate: [P.slateT, P.slateTL, P.slate] })
  .map(([k, [t, l, c]]) => `--${k}-t:${t};--${k}-l:${l};--${k}-c:${c}`).join(";");

function fill(tpl, data) {
  const t = { ...data };
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (all, k) => {
    if (k === "FONTS" || k === "GRAPH") return all;
    if (!(k in t)) throw new Error(`missing data for {{${k}}}`);
    const v = t[k];
    return esc(Array.isArray(v) ? v.join("|") : v);
  });
}

export async function renderOG({ kind, lang, data, name }) {
  const tpl = fs.readFileSync(path.join(OG, `og-${kind}.svg`), "utf8");
  const filled = fill(tpl, { LANG: lang, DIR: lang === "ar" ? "rtl" : "ltr", DOMAIN: "mohamedhatem.dev", ...data });
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // pass 1: lay out with the full fonts
  await page.setContent(`<!doctype html><html><head><style>${FULL_FONT_CSS}html,body{margin:0;background:${P.bg}}svg{display:block;${CAT_VARS}}</style></head><body>${filled.replace("{{FONTS}}", "/*FONTS*/")}</body></html>`);
  await page.evaluate(async () => { await document.fonts.ready; for (const f of document.fonts) await f.load().catch(() => {}); });
  const report = await page.evaluate(layoutInPage);
  let svg = await page.evaluate(() => new XMLSerializer().serializeToString(document.querySelector("svg")));
  // inline the chip colour variables (the standalone SVG has no page CSS)
  const vars = Object.fromEntries(CAT_VARS.split(";").map(s => s.split(":")));
  svg = svg.replace(/var\((--[a-z]+-[tlc])\)/g, (_, v) => vars[v]);
  const usage = await page.evaluate(fontUsage);
  svg = svg.replace("/*FONTS*/", await subsetFontCSS(usage));
  await ctx.close();
  const svgPath = write(path.join(OG, `${name}.svg`), svg + "\n");
  // pass 2: render the self-contained SVG on its own (no page fonts) and screenshot it
  const ctx2 = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p2 = await ctx2.newPage();
  await p2.setContent(`<!doctype html><html><head><style>html,body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
  const fontsOk = await p2.evaluate(async () => { await document.fonts.ready; const r = []; for (const f of document.fonts) { await f.load().catch(() => {}); r.push(f.status); } return r; });
  const pngPath = path.join(OG, `${name}.png`);
  await p2.screenshot({ path: pngPath, type: "png" });
  await ctx2.close();
  // recompress losslessly
  const sharp = need("sharp");
  const buf = await sharp(pngPath).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer();
  fs.writeFileSync(pngPath, buf);
  return { svgPath, pngPath, report, fontsOk };
}

// ---------------------------------------------------------------- sample data (facts from content/profile.ts)
export const SAMPLES = [
  { name: "og-home-en", kind: "home", lang: "en", data: {
    ALT: "Mohamed Hatem, AI Team Lead at Globant. Multi-agent LLM systems, RAG and LLM serving. mohamedhatem.dev",
    NAME: "Mohamed Hatem", ROLE: "AI Team Lead", ORG: "Globant",
    FOCUS: ["Multi-agent LLM systems", "RAG", "LLM serving"] } },
  { name: "og-home-ar", kind: "home", lang: "ar", data: {
    ALT: "محمد حاتم، قائد فريق الذكاء الاصطناعي في Globant. أنظمة LLM متعددة الوكلاء، وRAG، وخدمة النماذج اللغوية. mohamedhatem.dev",
    NAME: "محمد حاتم", ROLE: "قائد فريق الذكاء الاصطناعي", ORG: "Globant",
    FOCUS: ["أنظمة LLM متعددة الوكلاء", "RAG", "خدمة النماذج اللغوية"] } },
  { name: "og-case-arabsstock-en", kind: "case", lang: "en", data: {
    ALT: "Case study: ArabsStock Assistant, a 14-agent LangGraph system by Mohamed Hatem. mohamedhatem.dev",
    EYEBROW: "CASE STUDY", TITLE: "ArabsStock Assistant: a 14-agent LangGraph system",
    SUMMARY: "Semantic search, image generation, database operations and content moderation in one assistant.",
    CHIPS: ["LangGraph:teal", "OpenAI embeddings:saffron", "Pinecone:saffron", "FastAPI:slate"],
    META_ROLE: "AI Engineer", META_ORG: "ArabsStock", META_PERIOD: "2023–2024" } },
  { name: "og-case-arabsstock-ar", kind: "case", lang: "ar", data: {
    ALT: "دراسة حالة: مساعد ArabsStock، نظام من 14 وكيلًا على LangGraph، من محمد حاتم. mohamedhatem.dev",
    EYEBROW: "دراسة حالة", TITLE: "مساعد ArabsStock: نظام من 14 وكيلًا على LangGraph",
    SUMMARY: "بحث دلالي، وتوليد صور، وعمليات قواعد بيانات، وإشراف على المحتوى في مساعد واحد.",
    CHIPS: ["LangGraph:teal", "OpenAI embeddings:saffron", "Pinecone:saffron", "FastAPI:slate"],
    META_ROLE: "مهندس ذكاء اصطناعي", META_ORG: "ArabsStock", META_PERIOD: "2023–2024" } },
];

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(OG, { recursive: true });
  write(path.join(OG, "og-home.svg"), homeTemplate());
  write(path.join(OG, "og-case.svg"), caseTemplate());
  const i = process.argv.indexOf("--data");
  const jobs = i > 0 ? JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8")) : SAMPLES;
  const results = [];
  for (const job of jobs) {
    const r = await renderOG(job);
    results.push(r);
    const flags = r.report.items.filter(x => x.over || x.size).map(x => `${x.id}${x.size ? "@" + x.size + "px" : ""}${x.over ? " OVERFLOW" : ""}`).join(", ");
    for (const it of r.report.items) if (it.text && it.text.length > 1) console.log("   ", it.id, JSON.stringify(it.text));
    console.log(`${job.name.padEnd(24)} png ${kb(r.pngPath).padStart(9)}  svg ${kb(r.svgPath).padStart(9)}  bottom ${R(r.report.bottom)}  fonts ${r.fontsOk.join("/")}${flags ? "  fit: " + flags : ""}`);
  }
  // contact sheet for review: the four cards, plus each at a feed-thumbnail width (500 px)
  if (i < 0) {
    const sharp = need("sharp");
    const comps = []; let y = 24;
    for (const r of results) {
      comps.push({ input: await sharp(r.pngPath).resize(600).png().toBuffer(), left: 24, top: y });
      comps.push({ input: await sharp(r.pngPath).resize(300).png().toBuffer(), left: 648, top: y });
      y += 315 + 24;
    }
    await sharp({ create: { width: 648 + 300 + 24, height: y, channels: 3, background: "#5B6670" } }).composite(comps).png().toFile(path.join(SCREENS, "brand-og-sheet.png"));
  }
  await closeBrowser();
}
