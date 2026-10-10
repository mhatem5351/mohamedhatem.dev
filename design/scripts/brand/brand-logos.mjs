#!/usr/bin/env node
// Brand-colour company logos: the "Shipped at" row (official artwork in each company's real colours, one file per
// theme) and the symbol tiles used beside a company's name (work cards, experience trace).
//
//   BRAND_NODE_MODULES=site node design/scripts/brand/brand-logos.mjs
//
// Inputs:  design/assets/logos/brand/src/   official files, sanitised; provenance in design/assets/logos/SOURCES.md
// Outputs: design/assets/logos/brand/<key>.(svg|png) and <key>-dark.(svg|png)   row artwork, light / dark page
//          design/assets/logos/brand/brand.json                                 sizes for the row (optically balanced)
//          design/assets/logos/tiles/<key>-(96|160).(png|webp)                   symbol tiles: wakeb, empoweromics,
//                                                                                tabaqat, logic-controls
//          design/screens/assets/brand-logos-(light|dark).png                   contact sheets
// Then copy brand/*.(svg|png) to site/src/assets/logos/brand/ and the 160 px tiles' WebP to site/src/assets/logos/tiles/.
//
// Rules (DESIGN.md 9): never redraw. Light files are the official artwork for light backgrounds. Dark files are the
// official reversed variant where one exists (Globant: the wordmark in white as on its official reversed rasters;
// Wakeb, ArabsStock: their own reversed SVGs; MDP: its official all-white symbol). Where none exists, only the parts
// that would vanish on the dark page (< 3:1 on #0C151D) are rendered light (#ECF1F4) and every brand-colour accent
// keeps its colour (Tabaqat). Empoweromics publishes its lockup only as a 45 px raster, so the row rebuilds it from its
// two official high-resolution parts (symbol, wordmark) at the positions and proportions the lockup gives them.
import fs from "node:fs";
import path from "node:path";
import { sharp, LOGOS, SCREENS, tok } from "./lib.mjs";

const lumOf = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

const SRC = path.join(LOGOS, "brand/src");
const OUT = path.join(LOGOS, "brand");
const TILES = path.join(LOGOS, "tiles");
const LIGHT_BG = tok("bg", "light"), DARK_BG = tok("bg", "dark");
const LIGHT_INK = tok("ink", "dark"); // #ECF1F4: the dark theme's ink, for parts rendered light
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---------------------------------------------------------------- the row
// Optical balance: every logo gets about the same visual area (height = sqrt(AREA / aspect) x ink weight), so a long
// wordmark is shorter than a stacked lockup; `k` corrects for marks that read heavier or lighter than their box.
const AREA = 2600; // px^2 at 1x; ~26 px tall for a 4:1 lockup
const ROW = [
  { key: "globant", name: "Globant", light: "globant.svg", dark: "globant-dark.svg", k: 0.97 },
  { key: "wakeb", name: "Wakeb Data", light: "wakeb.svg", dark: "wakeb-dark.svg", k: 1.02 },
  { key: "arabsstock", name: "ArabsStock", light: "arabsstock.svg", dark: "arabsstock-dark.svg", k: 0.96 },
  { key: "empoweromics", name: "Empoweromics", light: "empoweromics.png", dark: "empoweromics.png", k: 1.1 },
  { key: "tabaqat", name: "Tabaqat", light: "tabaqat.png", dark: "tabaqat-dark.png", k: 1.02 },
  { key: "mdp", name: "MDP", light: "mdp-symbol.svg", dark: "mdp-symbol-dark.svg", symbolOnly: true, h: 22 },
];

const viewBoxAspect = (svg) => { const v = /viewBox="([^"]+)"/.exec(svg)[1].trim().split(/[\s,]+/).map(Number); return v[2] / v[3]; };

async function bbox(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1, w: info.width, h: info.height };
}

/** Empoweromics: the official lockup's layout (45 px tall) rebuilt from the official 225 px symbol and 142 px wordmark. */
async function empoweromicsLockup() {
  const ref = path.join(SRC, "empoweromics.png");
  const { data, info } = await sharp(ref).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // the symbol is the left block; the first fully transparent column after it starts the gap before the wordmark
  const colInk = (x) => { for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 24) return true; return false; };
  let x = 0; while (!colInk(x)) x++;
  const s0 = x; while (colInk(x)) x++;
  const s1 = x; while (!colInk(x)) x++;
  const w0 = x;
  const rows = (a, b) => { let t = info.height, u = 0; for (let y = 0; y < info.height; y++) for (let xx = a; xx < b; xx++) if (data[(y * info.width + xx) * 4 + 3] > 24) { t = Math.min(t, y); u = Math.max(u, y + 1); } return [t, u]; };
  const [st, sb] = rows(s0, s1), [wt, wb] = rows(w0, info.width);
  const sym = await bbox(path.join(SRC, "empoweromics-symbol.png")), wm = await bbox(path.join(SRC, "empoweromics-wordmark.png"));
  const S = (wm.y1 - wm.y0) / (wb - wt); // wordmark at its native resolution sets the scale
  const symH = Math.round((sb - st) * S), symW = Math.round(symH * (sym.x1 - sym.x0) / (sym.y1 - sym.y0));
  const gap = Math.round((w0 - s1) * S), H = Math.round((Math.max(sb, wb) - Math.min(st, wt)) * S);
  const symPng = await sharp(path.join(SRC, "empoweromics-symbol.png")).extract({ left: sym.x0, top: sym.y0, width: sym.x1 - sym.x0, height: sym.y1 - sym.y0 }).resize(symW, symH, { kernel: "lanczos3" }).png().toBuffer();
  const wmPng = await sharp(path.join(SRC, "empoweromics-wordmark.png")).extract({ left: wm.x0, top: wm.y0, width: wm.x1 - wm.x0, height: wm.y1 - wm.y0 }).png().toBuffer();
  const top0 = Math.min(st, wt);
  const W = symW + gap + (wm.x1 - wm.x0);
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: symPng, left: 0, top: Math.round((st - top0) * S) }, { input: wmPng, left: symW + gap, top: Math.round((wt - top0) * S) }])
    .png({ compressionLevel: 9 }).toBuffer();
}

/** Tabaqat on the dark page: its black, dark-teal and maroon parts (< 3:1 on #0C151D) rendered light; accents kept. */
async function tabaqatDark() {
  const { data, info } = await sharp(path.join(SRC, "tabaqat.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dark = rgb(DARK_BG), light = rgb(LIGHT_INK);
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    if (ratio(c, dark) < 3) { data[i] = light[0]; data[i + 1] = light[1]; data[i + 2] = light[2]; changed++; }
  }
  console.log(`tabaqat-dark: ${changed} px rendered light (every colour under 3:1 on ${DARK_BG}); accents untouched`);
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

// ---------------------------------------------------------------- tiles (the design's tile: 22 % radius, hairline)
const TILE_RADIUS = 0.22;
const TILE_SPECS = [
  { key: "wakeb", src: "wakeb-symbol.svg", bg: "#FFFFFF", fit: 0.7 },
  { key: "empoweromics", src: "empoweromics-symbol.png", bg: "#FFFFFF", fit: 0.6 },
  { key: "tabaqat", src: "tabaqat-symbol.png", bg: "#FFFFFF", fit: 0.72 },
  { key: "logic-controls", src: "logic-controls-mark.svg", bg: "#FFFFFF", fit: 0.66 },
];
async function tile(S, { src, bg, fit }) {
  const F = S * 4;
  const file = path.join(SRC, src);
  let mark = src.endsWith(".svg") ? sharp(fs.readFileSync(file), { density: 1200 }) : sharp(file);
  const b = await bbox(await mark.clone().png().toBuffer());
  mark = mark.extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
  const ar = (b.x1 - b.x0) / (b.y1 - b.y0);
  const long = Math.round(F * fit), mw = ar >= 1 ? long : Math.round(long * ar), mh = ar >= 1 ? Math.round(long / ar) : long;
  const markPng = await mark.resize(mw, mh, { kernel: "lanczos3" }).png().toBuffer();
  const big = await sharp({ create: { width: F, height: F, channels: 4, background: bg } })
    .composite([{ input: markPng, left: Math.round((F - mw) / 2), top: Math.round((F - mh) / 2) }]).png().toBuffer();
  const small = await sharp(big).resize(S, S, { kernel: "lanczos3" }).png().toBuffer();
  const r = S * TILE_RADIUS;
  const hair = lumOf(rgb(bg)) > 0.4 ? "rgb(20 33 43 / 0.13)" : "rgb(255 255 255 / 0.16)";
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${r}" fill="#fff"/></svg>`;
  const line = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect x=".5" y=".5" width="${S - 1}" height="${S - 1}" rx="${r - 0.5}" fill="none" stroke="${hair}" stroke-width="1"/></svg>`;
  const masked = await sharp(small).ensureAlpha().composite([{ input: Buffer.from(mask), blend: "dest-in" }]).png().toBuffer();
  return sharp(masked).composite([{ input: Buffer.from(line) }]).png().toBuffer();
}

// ---------------------------------------------------------------- build
fs.mkdirSync(OUT, { recursive: true });
const manifest = { $comment: "Generated by design/scripts/brand/brand-logos.mjs. The 'Shipped at' row: official logos in their real colours, one file per theme; height in CSS px at 1x (optically balanced: equal visual area), width follows the file's aspect ratio. Sources: ../SOURCES.md.", area: AREA, logos: {} };
for (const item of ROW) {
  const entry = { name: item.name, symbolOnly: !!item.symbolOnly, files: {} };
  for (const theme of ["light", "dark"]) {
    const srcName = item[theme];
    const outName = `${item.key}${theme === "dark" ? "-dark" : ""}${path.extname(srcName)}`;
    let buf;
    if (item.key === "empoweromics") buf = await empoweromicsLockup();
    else if (item.key === "tabaqat" && theme === "dark") buf = await tabaqatDark();
    else buf = fs.readFileSync(path.join(SRC, srcName));
    if (item.key === "empoweromics" && theme === "dark") { entry.files.dark = entry.files.light; continue; } // one file: it holds 3:1 on both pages
    fs.writeFileSync(path.join(OUT, outName), buf);
    const aspect = outName.endsWith(".svg") ? viewBoxAspect(buf.toString()) : (await sharp(buf).metadata()).width / (await sharp(buf).metadata()).height;
    const h = item.h ?? Math.round(Math.sqrt(AREA / aspect) * item.k * 2) / 2;
    entry.files[theme] = { file: outName, aspect: +aspect.toFixed(4), height: h, width: Math.round(h * aspect * 2) / 2 };
  }
  manifest.logos[item.key] = entry;
}
fs.writeFileSync(path.join(OUT, "brand.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(Object.entries(manifest.logos).map(([k, v]) => `${k}: ${v.files.light.width}x${v.files.light.height} / ${v.files.dark.width}x${v.files.dark.height}`).join("\n"));

for (const spec of TILE_SPECS) {
  for (const S of [96, 160]) {
    const png = await tile(S, spec);
    const base = path.join(TILES, `${spec.key}-${S}`);
    fs.writeFileSync(base + ".png", await sharp(png).png({ compressionLevel: 9, effort: 10 }).toBuffer());
    fs.writeFileSync(base + ".webp", await sharp(png).webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer());
  }
  console.log(`tile ${spec.key}: 96, 160`);
}

// ---------------------------------------------------------------- contact sheets (both pages, row height as built)
fs.mkdirSync(SCREENS, { recursive: true });
for (const theme of ["light", "dark"]) {
  const bg = theme === "light" ? LIGHT_BG : DARK_BG;
  const scale = 2, pad = 40 * scale, gap = 48 * scale;
  const parts = [];
  let x = pad;
  for (const [, v] of Object.entries(manifest.logos)) {
    const f = v.files[theme];
    const file = path.join(OUT, f.file);
    const w = Math.round(f.width * scale), h = Math.round(f.height * scale);
    const img = file.endsWith(".svg") ? sharp(fs.readFileSync(file), { density: 600 }) : sharp(file);
    parts.push({ input: await img.resize(w, h, { fit: "fill" }).png().toBuffer(), left: x, top: Math.round(60 * scale - h / 2) });
    x += w + gap;
  }
  await sharp({ create: { width: x - gap + pad, height: 120 * scale, channels: 3, background: bg } }).composite(parts).png().toFile(path.join(SCREENS, `brand-logos-${theme}.png`));
}
console.log("contact sheets: design/screens/assets/brand-logos-(light|dark).png");
