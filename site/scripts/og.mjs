#!/usr/bin/env node
/**
 * Open Graph images (1200 × 630 PNG), EN and AR, for every page: home, cv, privacy and work-<slug> per case study.
 * Runs before `astro build` (npm run build) and writes site/public/og/<key>-<locale>.png, which Astro copies to
 * dist/og/. Base.astro points og:image / twitter:image at them (src/lib/site.ts → ogImage()).
 *
 * Look: the design's sharing cards (design/assets/brand/og/og-home-*.png, og-case-*.png). The decorative layer
 * (lapis-night background, glows, dot grid, agent graph) is taken from the design templates copied into scripts/og/
 * (og-home.svg, og-case.svg); the text is laid out as HTML in headless Chromium with the site's self-hosted fonts,
 * so Arabic shaping, bidi and Latin runs inside Arabic are measured for real (the design script's approach).
 * Arabic cards mirror the layout: text from the right, the graph flips to the left, the monogram moves.
 *
 * Colours: the design tokens' dark values (../design/tokens.json), the site's default theme.
 *
 * Fast path: inputs (texts, templates, tokens, fonts, this script) are hashed into node_modules/.cache/mh-og/manifest.json; when nothing
 * changed and every PNG on disk is the one this cache rendered (its own content hash is recorded too), the script exits
 * in milliseconds. The output check matters because node_modules can be shared (git worktrees symlink it): another
 * checkout may have rendered new cards into its own public/og/ and updated the manifest, leaving stale files here.
 *
 *   node scripts/og.mjs           render what changed
 *   node scripts/og.mjs --force   render everything
 *   node scripts/og.mjs --only work-arabsstock-assistant-ar,home-en
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { loadContent, yearsOf } from "./lib/content.mjs";

const SITE = fileURLToPath(new URL("../", import.meta.url));
const OUT = `${SITE}public/og/`;
const CACHE = `${SITE}node_modules/.cache/mh-og/`;
const MANIFEST = `${CACHE}manifest.json`;
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;

const W = 1200;
const H = 630;
const M = 72;

/* ------------------------------------------------------------------ fonts (base64 @font-face, loaded once) */
const FONT_DIR = `${SITE}../design/assets/fonts/`;
const FACES = [
  ["OG Display", "300 700", "space-grotesk-latin-wght.woff2"],
  ["OG Sans", "100 900", "inter-latin-wght.woff2"],
  ["OG Mono", "100 800", "jetbrains-mono-ascii-wght.woff2"],
  ["OG Arabic", "400", "ibm-plex-sans-arabic-400.woff2"],
  ["OG Arabic", "500", "ibm-plex-sans-arabic-500.woff2"],
  ["OG Arabic", "600", "ibm-plex-sans-arabic-600.woff2"],
  ["OG Arabic", "700", "ibm-plex-sans-arabic-700.woff2"],
];
// The site ships subset files (scripts/subset-fonts.mjs); the cards use the design's full files.
const fontBytes = FACES.map(([, , f]) => readFileSync(FONT_DIR + f));
const FONT_CSS = FACES.map(
  ([family, weight], i) =>
    `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${fontBytes[i].toString("base64")}) format("woff2")${family === "OG Arabic" ? ";unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F" : ""}}`,
).join("");

/* ------------------------------------------------------------------ design templates → decorative layers */
function layers(file) {
  const svg = readFileSync(new URL(`./og/${file}`, import.meta.url), "utf8").replace(/<style>[\s\S]*?<\/style>/, "");
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? "";
  const start = svg.indexOf('<g id="decor"');
  // the decor group contains nested <g>s: find its matching </g>
  let depth = 0;
  let i = start;
  for (; i < svg.length; i++) {
    if (svg.startsWith("<g", i) && /[\s>]/.test(svg[i + 2])) depth++;
    else if (svg.startsWith("</g>", i) && --depth === 0) break;
  }
  const decor = svg
    .slice(start, i + 4)
    .replace(' id="decor"', "")
    // A still card shows the request's route lit, not a comet frozen mid-flight (a stray dash at feed size; audit D-24):
    // each comet's halo goes and its head becomes the whole edge, in the comet's colour.
    .replace(/<path [^>]*stroke-opacity="\.22"[^>]*stroke-dashoffset="[^"]*"\/>/g, "")
    .replace(/<path d="([^"]+)" stroke="(#[0-9A-Fa-f]{6})" stroke-width="[\d.]+" stroke-linecap="round" stroke-dasharray="[^"]*" stroke-dashoffset="[^"]*"\/>/g, '<path d="$1" stroke="$2" stroke-opacity=".85" stroke-width="2.6" stroke-linecap="round"/>')
    // The hub's glow fades out instead of ending in a hard-edged disc.
    .replace(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="#5AC0BC" opacity="\.07"\/>/g, (_, cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${(Number(r) * 1.35).toFixed(2)}" fill="url(#og-hub)"/>`);
  const hub = '<radialGradient id="og-hub"><stop offset="0" stop-color="#5AC0BC" stop-opacity=".14"/><stop offset=".55" stop-color="#5AC0BC" stop-opacity=".07"/><stop offset="1" stop-color="#5AC0BC" stop-opacity="0"/></radialGradient>';
  const mark = svg.match(/<g id="mark"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? "";
  return { defs: defs.replace("</defs>", `${hub}</defs>`), decor, mark };
}
const TEMPLATES = { case: layers("og-case.svg"), home: layers("og-home.svg") };

/* ------------------------------------------------------------------ colours: the design tokens, dark theme */
// The cards use the site's default theme (Lapis & Gold by night), read from the design tokens so they never drift.
const TOKENS_FILE = `${SITE}../design/tokens.json`;
const tokenBytes = readFileSync(TOKENS_FILE);
const TOKENS = JSON.parse(tokenBytes.toString("utf8")).color;
const C = (name) => {
  const v = TOKENS[name]?.[1];
  if (!v) throw new Error(`og: no dark value for --color-${name}`);
  return v;
};
/** chip colours by technology category: text, tint, tint line */
const CHIP = Object.fromEntries(
  ["teal", "saffron", "coral", "sky", "sage", "slate"].map((c) => [c, [C(c), C(`${c}-tint`), C(`${c}-tint-line`)]]),
);
function chipCategory(tech) {
  const t = tech.toLowerCase();
  if (/langgraph|langchain|mcp|multi-agent|orchestr/.test(t)) return "teal";
  if (/pinecone|embedding|bm25|sqlite|postgres|cosmos|sql server|duckdb|overture|athena|search|rag|retriev|chroma|qdrant|pgvector/.test(t)) return "saffron";
  if (/qwen|vllm|openai|pytorch|nlp|vision|llm(?! eval)|model/.test(t)) return "coral";
  if (/evaluat|observab|vitest|playwright|axe|test/.test(t)) return "sky";
  if (/turnstile|guard|arabic/.test(t)) return "sage";
  return "slate";
}

/* ------------------------------------------------------------------ cards from content */
const { profile, messages } = await loadContent();

function caseCard(cs, locale) {
  const m = messages(locale);
  const role = cs.roleId ? profile.experience.find((r) => r.id === cs.roleId) : null;
  const org = role ? role.company[locale] : cs.context[locale].split(/[،,]/)[0].trim();
  return {
    key: `work-${cs.slug}`,
    kind: "case",
    eyebrow: m.experience.caseStudy,
    title: cs.title[locale],
    summary: cs.summary[locale],
    chips: cs.stack.slice(0, 5).map((s) => [s, chipCategory(s)]),
    meta: [role ? role.title[locale] : m.work.freelance, org, yearsOf(cs.period)],
  };
}

function cards(locale) {
  const m = messages(locale);
  const b = profile.basics;
  const [lead1, ...rest] = m.privacy.lead.split(/(?<=[.:]) /);
  return [
    {
      key: "home",
      kind: "home",
      name: b.name[locale],
      role: [b.title[locale], b.employer],
      focus: [...m.seo.ogFocus],
      // A small client line under the focus (round 6, HM-33), when the copy has one.
      client: m.seo.ogClient ?? null,
    },
    {
      key: "cv",
      kind: "case",
      eyebrow: m.cv.title,
      title: b.name[locale],
      // The meta description is a page summary ("Read it here or download the PDF"); the card has its own line.
      summary: m.seo.ogCvSummary,
      chips: ["LangGraph", "RAG", "vLLM", "Python", "LLM evaluation"].map((s) => [s, chipCategory(s)]),
      meta: [b.title[locale], b.employer, b.location.city[locale]],
    },
    {
      key: "privacy",
      kind: "case",
      eyebrow: m.footer.privacy,
      title: lead1,
      summary: rest.join(" "),
      chips: [],
      // Gold falls on the employer (meta[1]), as on every other card (audit D-25).
      meta: [b.title[locale], b.employer, b.name[locale]],
    },
    ...[...profile.caseStudies].sort((a, z) => a.order - z.order).map((cs) => caseCard(cs, locale)),
  ];
}

/* ------------------------------------------------------------------ page */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Text as HTML. Arabic runs rely on the page's dir="rtl" and the browser's bidi algorithm, as on the site. */
const isolate = (s) => esc(s);

const PAGE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;background:${C("bg")};overflow:hidden}
body{-webkit-font-smoothing:antialiased;font-kerning:normal;text-rendering:geometricPrecision}
.card{position:relative;width:${W}px;height:${H}px;color:${C("ink")};font-family:"OG Sans","OG Arabic",sans-serif}
.card[lang=ar]{font-family:"OG Sans","OG Arabic",sans-serif}
.bg{position:absolute;inset:0;width:${W}px;height:${H}px}
.top{position:absolute;inset-inline-start:${M}px;top:62px;height:40px;display:flex;align-items:center;gap:18px}
.mark{width:46.7px;height:40px;overflow:visible}
.domain{font:500 28px/1 "OG Mono",monospace;color:${C("muted")};direction:ltr;unicode-bidi:isolate}
.flow{position:absolute;inset-inline-start:${M}px;top:172px;display:flex;flex-direction:column;align-items:flex-start}
.eyebrow{font:600 28px/1 "OG Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:${C("accent")}}
[lang=ar] .eyebrow{font:600 30px/1.2 "OG Arabic","OG Sans",sans-serif;letter-spacing:0;text-transform:none}
.title{margin-top:16px;max-width:786px;font:600 58px/1.08 "OG Display","OG Arabic",sans-serif;letter-spacing:-.025em;color:${C("ink")};text-wrap:balance}
[lang=ar] .title{font-family:"OG Display","OG Arabic",sans-serif;font-weight:700;letter-spacing:0;line-height:1.33;max-width:800px}
.summary{margin-top:14px;max-width:800px;font:400 30px/1.32 "OG Sans","OG Arabic",sans-serif;color:${C("ink-2")};text-wrap:pretty}
[lang=ar] .summary{line-height:1.55}
.chips{margin-top:24px;display:flex;flex-wrap:nowrap;gap:12px;max-width:1056px}
.chip{display:inline-flex;align-items:center;height:52px;padding:0 18px;border-radius:10px;border:1.5px solid;font:500 28px/1 "OG Mono",monospace;white-space:nowrap;direction:ltr}
.meta{margin-top:26px;max-width:856px;display:flex;align-items:baseline;gap:12px;font:500 30px/1.2 "OG Display","OG Arabic",sans-serif;color:${C("ink-2")};white-space:nowrap}
[lang=ar] .meta{font-family:"OG Display","OG Arabic",sans-serif}
.meta .sep{color:${C("teal")}}.meta .org{color:${C("accent")}}.meta .yrs{font:500 28px/1 "OG Mono",monospace;color:${C("muted")};direction:ltr;unicode-bidi:isolate}
.stripe{position:absolute;display:flex;gap:8.4px}
.stripe i{display:block;height:7px;border-radius:3.5px}
.stripe i:nth-child(1){width:75.6px;background:${C("teal-fill")}}.stripe i:nth-child(2){width:42px;background:${C("saffron-fill")}}.stripe i:nth-child(3){width:22.4px;background:${C("coral-fill")}}
.home .flow{top:0}
.name{font:700 92px/1 "OG Display","OG Arabic",sans-serif;letter-spacing:-.035em;color:${C("ink")};white-space:nowrap}
[lang=ar] .name{font-size:84px;letter-spacing:0;line-height:1.3}
.role{margin-top:26px;display:flex;gap:12px;align-items:baseline;font:500 40px/1.2 "OG Display","OG Arabic",sans-serif;letter-spacing:-.01em;color:${C("ink-2")};white-space:nowrap}
[lang=ar] .role{font-size:38px;letter-spacing:0}
.role .sep{color:${C("teal")}}.role .org{color:${C("accent")}}
.focus{margin-top:40px;max-width:720px;font:500 26px/1.5 "OG Mono","OG Arabic",monospace;color:${C("ink-2")}}
[lang=ar] .focus{font:500 30px/1.6 "OG Arabic","OG Sans",sans-serif}
.focus .sep{color:${C("coral")}}
.client{margin-top:18px;max-width:720px;display:flex;align-items:center;gap:12px;font:500 26px/1.35 "OG Sans","OG Arabic",sans-serif;color:${C("muted")}}
.client::before{content:"";flex:none;width:10px;height:10px;border-radius:50%;background:${C("teal-fill")}}
.home .stripe{position:static;margin-top:40px}
bdi{unicode-bidi:isolate}
.nw{white-space:nowrap}
`;

function cardHtml(card, locale) {
  const rtl = locale === "ar";
  const t = TEMPLATES[card.kind];
  const mirror = rtl ? ` transform="translate(${W} 0) scale(-1 1)"` : "";
  // The home card's graph sits a little smaller and further out, so the long English name keeps its full size with 40 px
  // of air before the guard node (audit D-03); the glows and the dot grid stay where they are.
  const decor = card.kind === "home" ? t.decor.replace(/^(<g[^>]*>(?:<rect [^>]*\/>)+)([\s\S]*)<\/g>$/, '$1<g transform="translate(36 0) translate(950 330) scale(.92) translate(-950 -330)">$2</g></g>') : t.decor;
  const bg = `<svg class="bg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${t.defs}<rect width="${W}" height="${H}" fill="${C("bg")}"/><g fill="none"${mirror}>${decor}</g></svg>`;
  const top = `<div class="top"><svg class="mark" viewBox="0 0 46.7 40" aria-hidden="true">${t.mark}</svg><span class="domain">mohamedhatem.dev</span></div>`;
  const sep = '<span class="sep" aria-hidden="true">·</span>';
  let flow;
  if (card.kind === "home") {
    flow = `<div class="flow" data-settle>
      <h1 class="name">${esc(card.name)}</h1>
      <p class="role"><span>${isolate(card.role[0], locale)}</span>${sep}<span class="org" dir="ltr">${esc(card.role[1])}</span></p>
      <p class="focus">${card.focus
        .map((f, i) => `<span class="nw">${i ? '<span class="sep">·</span> ' : ""}${isolate(f, locale)}</span>`)
        .join(" ")}</p>
      ${card.client ? `<p class="client">${isolate(card.client, locale)}</p>` : ""}
      <div class="stripe"><i></i><i></i><i></i></div>
    </div>`;
  } else {
    const chips = card.chips
      .map(([label, cat]) => {
        const [fg, bgc, line] = CHIP[cat];
        return `<span class="chip" data-fg="${fg}" data-bg="${bgc}" data-line="${line}">${esc(label)}</span>`;
      })
      .join("");
    flow = `<div class="flow">
      <p class="eyebrow">${isolate(card.eyebrow, locale)}</p>
      <h1 class="title" data-fit="58,40,${card.summary ? 2 : 3}">${isolate(card.title, locale)}</h1>
      ${card.summary ? `<p class="summary" data-fit="30,24,3">${isolate(card.summary, locale)}</p>` : ""}
      ${card.chips.length ? `<div class="chips">${chips}</div>` : ""}
      <p class="meta"><span>${isolate(card.meta[0], locale)}</span>${sep}<span class="org">${isolate(card.meta[1], locale)}</span>${sep}<span class="${/^[\d–-]+$/.test(card.meta[2]) ? "yrs" : ""}">${esc(card.meta[2])}</span></p>
    </div>
    <div class="stripe stripe--end"><i></i><i></i><i></i></div>`;
  }
  return `<div class="card ${card.kind}" lang="${locale}" dir="${rtl ? "rtl" : "ltr"}">${bg}${top}${flow}</div>`;
}

/** Runs in the page: fit text, drop chips that overflow, place the flow and the stripe. Returns the text boxes that
 * come within 24 px of the agent graph (none on the home card: the caller fails the render then; audit D-03). */
function layout() {
  const card = document.querySelector(".card");
  const rtl = card.dir === "rtl";
  // The agent graph's box: everything drawn in the decorative layer except its full-card fills (glows, dot grid).
  const graph = [...document.querySelectorAll(".bg g *")]
    .filter((el) => el.tagName !== "rect" && el.tagName !== "g" && !el.closest("defs"))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.width < 600)
    .reduce((a, r) => ({ left: Math.min(a.left, r.left), right: Math.max(a.right, r.right), top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom) }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  /** How far `el`'s text (its line boxes, not its block) runs into the graph's side (px; ≤ 0: clear), keeping `air` px. */
  const into = (el, air) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    let most = -Infinity;
    for (const r of range.getClientRects()) {
      if (!r.width || r.bottom < graph.top - air || r.top > graph.bottom + air) continue;
      most = Math.max(most, rtl ? graph.right + air - r.left : r.right - (graph.left - air));
    }
    return most;
  };
  for (const chip of document.querySelectorAll(".chip")) {
    chip.style.color = chip.dataset.fg;
    chip.style.background = chip.dataset.bg;
    chip.style.borderColor = chip.dataset.line;
  }
  for (const el of document.querySelectorAll("[data-fit]")) {
    const [max, min, lines] = el.dataset.fit.split(",").map(Number);
    let size = max;
    el.style.fontSize = `${size}px`;
    const count = () => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
    while (count() > lines && size > min) el.style.fontSize = `${--size}px`;
    if (count() > lines) {
      el.style.display = "-webkit-box";
      el.style.webkitBoxOrient = "vertical";
      el.style.webkitLineClamp = String(lines);
      el.style.overflow = "hidden";
    }
  }
  const chips = document.querySelector(".chips");
  if (chips) while (chips.scrollWidth > chips.clientWidth + 1 && chips.children.length > 1) chips.lastElementChild.remove();
  const flow = document.querySelector(".flow");
  const h = flow.getBoundingClientRect().height;
  if (card.classList.contains("home")) {
    flow.style.top = `${Math.round(132 + (568 - 132 - h) * 0.55)}px`;
    // The name, the role and the focus line end at least 40 px before the graph (the long English name met its guard
    // node): each steps down a pixel at a time until it does.
    for (const [sel, min] of [[".name", 64], [".role", 30], [".focus", 22]]) {
      const el = document.querySelector(sel);
      while (el && into(el, 40) > 0 && parseFloat(getComputedStyle(el).fontSize) > min) el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) - 1}px`;
    }
  } else {
    const top = 168;
    // Whole flow must end above the bottom margin: shrink the title, then the summary, then drop chips.
    const bottom = () => top + flow.getBoundingClientRect().height;
    const shrink = (sel, min) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size <= min) return false;
      el.style.fontSize = `${size - 1}px`;
      return true;
    };
    flow.style.top = `${top}px`;
    while (bottom() > 572 && (shrink(".title", 40) || shrink(".summary", 24))) {}
    if (bottom() > 572) document.querySelector(".chips")?.remove();
    const room = 568 - top - flow.getBoundingClientRect().height;
    flow.style.top = `${Math.round(top + Math.max(0, room) * 0.5)}px`;
    const meta = document.querySelector(".meta").getBoundingClientRect();
    const stripe = document.querySelector(".stripe--end");
    stripe.style.top = `${Math.round(meta.top + meta.height / 2 - 3.5)}px`;
    stripe.style[rtl ? "left" : "right"] = "72px";
  }
  const touching = [...document.querySelectorAll(".flow > *, .top")].filter((el) => into(el, 24) > 0).map((el) => el.className);
  return document.fonts.ready.then(() => touching);
}

/* ------------------------------------------------------------------ run */
const scriptHash = createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).update(tokenBytes);
for (const t of Object.values(TEMPLATES)) scriptHash.update(t.defs).update(t.decor).update(t.mark);
for (const b of fontBytes) scriptHash.update(String(b.length));
const base = scriptHash.digest("hex");
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
/** Content hash of a rendered card, recorded with its input hash so the fast path only trusts its own output. */
const pngHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const jobs = [];
for (const locale of ["en", "ar"])
  for (const card of cards(locale)) {
    const name = `${card.key}-${locale}`;
    if (ONLY && !ONLY.has(name)) continue;
    const hash = createHash("sha256").update(base).update(JSON.stringify(card)).digest("hex").slice(0, 16);
    const file = `${OUT}${name}.png`;
    if (!FORCE && existsSync(file) && manifest[name] === `${hash}:${pngHash(readFileSync(file))}`) continue;
    jobs.push({ name, card, locale, hash, file });
  }

if (!jobs.length) {
  console.log("og: up to date");
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}${PAGE_CSS}</style></head><body></body></html>`);
// Warm the fonts so the first card is measured with real metrics.
await page.evaluate(async () => {
  const probe = ["OG Display", "OG Sans", "OG Mono"].map((f) => `600 20px "${f}"`);
  await Promise.all([...probe.map((p) => document.fonts.load(p, "Aa")), document.fonts.load('700 20px "OG Arabic"', "عربي"), document.fonts.load('400 20px "OG Arabic"', "عربي"), document.fonts.load('500 20px "OG Arabic"', "عربي")]);
});

let bytes = 0;
for (const job of jobs) {
  await page.evaluate((html) => (document.body.innerHTML = html), cardHtml(job.card, job.locale));
  const touching = await page.evaluate(layout);
  await page.evaluate(() => document.fonts.ready);
  if (touching.length && job.card.kind === "home") throw new Error(`og: ${job.name}: text within 24 px of the graph (${touching.join(", ")})`);
  if (touching.length) console.warn(`og: ${job.name}: text within 24 px of the graph (${touching.join(", ")})`);
  const raw = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
  // A full 256-colour palette (what effort 10 always selected): the same pixels as before, 36-39 % smaller without
  // adaptive filtering, which only bloats palette PNGs (audit PERF-06; fewer colours band the glows and shift the
  // coral separators, so the palette stays full).
  const png = await sharp(raw).png({ palette: true, quality: 100, colours: 256, compressionLevel: 9, adaptiveFiltering: false, effort: 10 }).toBuffer();
  writeFileSync(job.file, png);
  manifest[job.name] = `${job.hash}:${pngHash(png)}`;
  bytes += png.length;
  console.log(`og: ${job.name}.png ${(png.length / 1024).toFixed(0)} KB`);
}
await browser.close();
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`og: ${jobs.length} image(s), ${(bytes / 1024).toFixed(0)} KB total`);
