// Builds the "MH" identity: monogram, tile, EN + AR lockups (text outlined, no font needed),
// favicons (SVG with dark-mode swap, ICO 16+32, PNGs), app icons, web manifests (manifest.mjs), and the
// verification renders in design/screens/assets/brand-*.png.
//
//   node design/scripts/brand/brand.mjs
//
// Geometry lives in monogram-geom.mjs. The master is drawn on a 32-unit grid with every stem,
// the crossbar, the cap height and the baseline on EVEN units, so the same outline lands on whole
// pixels at 16 px and 32 px (16 px: 2 px stems on columns 1-2, 8-9, 13-14). Tiles get their own
// pixel-fitted geometry at 16 and 32 px because the mark is smaller inside the tile.
import fs from "node:fs";
import path from "node:path";
import { mh, MASTER, FAVICON } from "./monogram-geom.mjs";
import { writeManifests } from "./manifest.mjs";
import { BRAND, SCREENS, sharp, tok, palette, outline, initFonts, transformPath, shoot, closeBrowser, write, kb, round as R, esc } from "./lib.mjs";

// ---------------------------------------------------------------- geometry
// pixel-fitted marks for the ink tile at 16 px and 32 px (units = device pixels)
const TILE16 = { a1: 2, a2: 7, a3: 12, w: 2, T: 3, B: 13, ch: 2, t: 2.1, yc: 8, node: { r: 1.8 } };
const TILE32 = { a1: 5, a2: 15, a3: 24, w: 3, T: 7, B: 24, ch: 3, t: 2.7, yc: 15.5, node: { r: 2.85 } };

const L = palette("light"), D = palette("dark");
// Lapis & Gold: lapis ink tile, alabaster mark, gold node. NODE_D (the bright gold, the dark theme's accent fill) sits on
// the ink tile and on dark tabs; NODE_L (the deep gold, the light theme's saffron fill) on light tabs and pages.
const INK = L.ink, PAPER = L.bg, NODE_L = L.saffronF, NODE_D = tok("accent-fill", "dark");

const m = mh(MASTER);
const fv = mh(FAVICON);
const MB = m.bounds;                                 // { x0: 2, y0: 4, x1: 30, y1: 28 }
const MW = MB.x1 - MB.x0, MH = MB.y1 - MB.y0;        // 28 x 24

// The master path contains arc commands, so placement uses transform attributes; tiles rebuild the
// geometry at the target size instead (keeps their outlines on the pixel grid).
function scaled(p, k, dx = 0, dy = 0) {
  const s = v => v * k;
  return {
    a1: s(p.a1) + dx, a2: s(p.a2) + dx, a3: s(p.a3) + dx, w: s(p.w), T: s(p.T) + dy, B: s(p.B) + dy,
    ch: s(p.ch), t: s(p.t),
    yc: p.yc != null ? s(p.yc) + dy : undefined, vyO: p.vyO != null ? s(p.vyO) + dy : undefined,
    node: { r: s(p.node.r), gap: s(p.node.gap || 0) },
  };
}

// ---------------------------------------------------------------- SVG builders
const svgOpen = (vb, w, h, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${w ? ` width="${w}" height="${h}"` : ""}${extra}>`;

/** monogram.svg: tight viewBox (28 x 24 units), currentColor ink, gold node via CSS var */
function monogramSVG() {
  return svgOpen(`${MB.x0} ${MB.y0} ${MW} ${MH}`, MW, MH, ` role="img" aria-label="Mohamed Hatem"`) +
    `<title>Mohamed Hatem</title>` +
    `<path d="${m.d}" fill="currentColor"/>` +
    `<circle cx="${R(m.node.cx)}" cy="${R(m.node.cy)}" r="${R(m.node.r)}" fill="${NODE_L}" style="fill:var(--mh-node,var(--color-accent-fill,${NODE_L}))"/>` +
    `</svg>\n`;
}

/** tile: ink square (radius 22 %), paper mark, gold node. size = viewBox units; geometry fitted per size */
function tileGeometry(size) {
  if (size === 16) return mh(TILE16);
  if (size === 32) return mh(TILE32);
  // vector master for every other size: mark width = 59 % of the tile, optically 1.5 % above centre
  const k = (size * 0.59) / MW;
  const dx = (size - MW * k) / 2 - MB.x0 * k;
  const dy = (size - MH * k) / 2 - MB.y0 * k - size * 0.012;
  return mh(scaled(MASTER, k, dx, dy));
}
function tileSVG(size, { fullBleed = false, markScale = 1, title = true, hairline = false } = {}) {
  let g;
  if (markScale !== 1) {
    const k = (size * 0.59 * markScale) / MW;
    g = mh(scaled(MASTER, k, (size - MW * k) / 2 - MB.x0 * k, (size - MH * k) / 2 - MB.y0 * k - size * 0.008));
  } else g = tileGeometry(size);
  const rx = fullBleed ? 0 : R(size * 0.22);
  return svgOpen(`0 0 ${size} ${size}`, size, size, ` role="img" aria-label="Mohamed Hatem"`) +
    (title ? `<title>Mohamed Hatem</title>` : "") +
    `<rect width="${size}" height="${size}" rx="${rx}" fill="${INK}"/>` +
    // 1-unit inside hairline: keeps the ink tile's edge visible on the deep-ink dark theme
    (hairline ? `<rect x=".5" y=".5" width="${size - 1}" height="${size - 1}" rx="${R(size * 0.22 - 0.5)}" fill="none" stroke="#FFFFFF" stroke-opacity=".12"/>` : "") +
    `<path d="${g.d}" fill="${PAPER}"/>` +
    `<circle cx="${R(g.node.cx)}" cy="${R(g.node.cy)}" r="${R(g.node.r)}" fill="${NODE_D}"/>` +
    `</svg>\n`;
}

/** favicon.svg: bare mark on a 32 grid (whole pixels at 16 and 32), light/dark swap inside the file */
function faviconSVG() {
  return svgOpen("0 0 32 32", 32, 32) +
    `<style>.i{fill:${INK}}.n{fill:${NODE_L}}@media (prefers-color-scheme:dark){.i{fill:${D.ink}}.n{fill:${NODE_D}}}</style>` +
    `<path class="i" d="${fv.d}"/><circle class="n" cx="${R(fv.node.cx)}" cy="${R(fv.node.cy)}" r="${R(fv.node.r)}"/></svg>\n`;
}

// ---------------------------------------------------------------- lockups (outlined text)
function lockup(lang) {
  // Layout in units of the mark height (H = 24 units = MASTER cap height).
  // EN: text cap height = 0.68 H, caps centred on the mark; gap = 0.40 H.
  const H = 48;                                        // lockup drawn at mark height 48
  const k = H / MH;
  let textPath, tw, x0, x1, markX, textX, top, bottom;
  if (lang === "en") {
    const capTarget = H * 0.68;
    const size = capTarget / 0.70;                     // Space Grotesk cap height = 700/1000
    const t = outline("Mohamed Hatem", { font: "display", wght: 600, size, tracking: -0.018 });
    const gap = H * 0.40;
    markX = 0; textX = MW * k + gap - t.bbox.x0;
    const base = (H + capTarget) / 2;                  // baseline so caps are centred on the mark
    textPath = transformPath(t.d, textX, base);
    tw = textX + t.bbox.x1;
    top = Math.min(0, base + t.bbox.y0); bottom = Math.max(H, base + t.bbox.y1);
    x0 = 0; x1 = tw;
  } else {
    // AR: RTL reading order, the mark stands at the right (start) edge, the name to its left.
    // Size so the tall letters (alef) reach 0.76 of the mark's height and the Arabic baseline sits on
    // the mark's baseline; descenders (meem, haa) hang below it, as Arabic wants.
    const probe = outline("محمد حاتم", { font: "ar600", size: 100 });
    const alef = -outline("ا", { font: "ar600", size: 100 }).bbox.y0;   // alef height per 100
    const size = (H * 0.76) / alef * 100;
    const t = outline("محمد حاتم", { font: "ar600", size });
    const gap = H * 0.40;
    const textW = t.bbox.x1 - t.bbox.x0;
    const alefH = alef * size / 100;
    const base = H - H * 0.03;                          // optically on the mark baseline (round bowls overshoot)
    textX = -t.bbox.x0;
    textPath = transformPath(t.d, textX, base);
    markX = textW + gap;
    top = Math.min(0, base + t.bbox.y0); bottom = Math.max(H, base + t.bbox.y1);
    x0 = 0; x1 = markX + MW * k;
    void probe;
  }
  const vbY = R(top), vbH = R(bottom - top), vbW = R(x1 - x0);
  const mark = `<path d="${m.d}" transform="translate(${R(markX - MB.x0 * k)} ${R(-MB.y0 * k)}) scale(${k})" fill="currentColor"/>` +
    `<circle cx="${R(markX + (m.node.cx - MB.x0) * k)}" cy="${R((m.node.cy - MB.y0) * k)}" r="${R(m.node.r * k)}" fill="${NODE_L}" style="fill:var(--mh-node,var(--color-accent-fill,${NODE_L}))"/>`;
  const label = lang === "en" ? "Mohamed Hatem" : "محمد حاتم";
  return svgOpen(`0 ${vbY} ${vbW} ${vbH}`, vbW, vbH, ` role="img" aria-label="${esc(label)}"${lang === "ar" ? ` lang="ar"` : ""}`) +
    `<title>${esc(label)}</title>${mark}<path d="${textPath}" fill="currentColor"/></svg>\n`;
}

// ---------------------------------------------------------------- ICO (PNG-compressed entries)
function ico(pngs) { // [{size, buf}]
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach((p, i) => {
    const o = 6 + i * 16;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, o); head.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(p.buf.length, o + 8); head.writeUInt32LE(off, o + 12);
    off += p.buf.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.buf)]);
}
const png = (svg, size, opts = {}) => {
  let s = sharp(Buffer.from(svg), { density: 72 * size / (opts.vb || size) }).resize(size, size);
  if (opts.opaque) s = s.flatten({ background: opts.opaque });
  return s.png({ compressionLevel: 9, palette: false }).toBuffer();
};

// ---------------------------------------------------------------- build
await initFonts(["display", "ar600"]);
fs.mkdirSync(BRAND, { recursive: true });
const out = {};
const put = (name, data) => { out[name] = write(path.join(BRAND, name), data); };

put("monogram.svg", monogramSVG());
put("monogram-tile.svg", tileSVG(64, { hairline: true }));
put("logo-lockup.svg", lockup("en"));
put("logo-lockup-ar.svg", lockup("ar"));
put("favicon.svg", faviconSVG());

const t16 = await png(tileSVG(16, { title: false }), 16);
const t32 = await png(tileSVG(32, { title: false }), 32);
put("favicon.ico", ico([{ size: 16, buf: t16 }, { size: 32, buf: t32 }]));
put("favicon-32.png", t32);
// iOS masks the icon itself: full-bleed, opaque, mark a little larger than in the tile
put("apple-touch-icon.png", await png(tileSVG(180, { fullBleed: true, markScale: 1.0, title: false }), 180, { opaque: INK }));
put("icon-192.png", await png(tileSVG(192, { title: false }), 192));
put("icon-512.png", await png(tileSVG(512, { title: false }), 512));
// maskable: full-bleed ink; the mark must stay inside the central 80 % circle (r = 204.8 px)
put("icon-maskable-512.png", await png(tileSVG(512, { fullBleed: true, markScale: 0.86, title: false }), 512, { opaque: INK }));

// web app manifests (EN + AR): names and labels from content/, colours from the dark bg token (manifest.mjs, which also
// writes them to site/public/)
for (const f of await writeManifests()) console.log(`manifest: ${f}`);

// safe-zone check for the maskable icon: farthest mark point from the centre must be < 204.8 px
{
  const k = (512 * 0.59 * 0.86) / MW;
  const cx = 256, cy = 256 - 512 * 0.008;
  const hw = MW * k / 2, hh = MH * k / 2;
  const far = Math.hypot(hw, hh + Math.abs(cy - 256));
  console.log(`maskable: mark ${R(MW * k)} x ${R(MH * k)} px, farthest corner ${R(far)} px from centre (safe radius 204.8)`);
}

// ---------------------------------------------------------------- verification renders
const b64 = s => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
const file64 = p => `data:${p.endsWith(".png") ? "image/png" : "image/svg+xml"};base64,` + fs.readFileSync(p).toString("base64");
const fav = fs.readFileSync(out["favicon.svg"], "utf8");
const mono = fs.readFileSync(out["monogram.svg"], "utf8");
const lockEN = fs.readFileSync(out["logo-lockup.svg"], "utf8"), lockAR = fs.readFileSync(out["logo-lockup-ar.svg"], "utf8");
const inline = (svg, cls = "") => svg.replace("<svg ", `<svg class="${cls}" `);

// 1. monogram sheet: sizes, both themes, tile, lockups
{
  const sizes = [16, 20, 24, 32, 48, 72, 120];
  const row = theme => `<div class="pane ${theme}">
    <div class="sizes">${sizes.map(s => `<div class="cell"><div style="height:${s}px;color:var(--ink)">${inline(mono, "m").replace(/width="28" height="24"/, `width="${R(s * 28 / 24)}" height="${s}"`)}</div><small>${s}</small></div>`).join("")}</div>
    <div class="locks"><div style="color:var(--ink)">${inline(lockEN).replace(/width="[^"]+" height="[^"]+"/, 'height="56"')}</div>
      <div style="color:var(--ink)" dir="rtl">${inline(lockAR).replace(/width="[^"]+" height="[^"]+"/, 'height="56"')}</div>
      <div style="color:var(--ink)">${inline(lockEN).replace(/width="[^"]+" height="[^"]+"/, 'height="28"')}</div>
      <div style="color:var(--ink)" dir="rtl">${inline(lockAR).replace(/width="[^"]+" height="[^"]+"/, 'height="28"')}</div></div>
    <div class="tiles">${[24, 40, 64, 128].map(s => `<img src="${b64(fs.readFileSync(out["monogram-tile.svg"], "utf8"))}" width="${s}" height="${s}">`).join("")}
      <img src="${file64(out["icon-192.png"])}" width="96" height="96"><img src="${file64(out["apple-touch-icon.png"])}" width="90" height="90" style="border-radius:20px">
      <img src="${file64(out["icon-maskable-512.png"])}" width="128" height="128" style="border-radius:50%"></div></div>`;
  const html = `<!doctype html><style>
  body{margin:0;font:12px/1.4 ui-monospace,monospace}
  .pane{padding:28px 32px;display:grid;gap:26px}.light{--ink:${L.ink};--mh-node:${NODE_L};background:${L.bg};color:${L.muted}}
  .dark{--ink:${D.ink};--mh-node:${NODE_D};background:${D.bg};color:${D.muted}}
  .sizes{display:flex;align-items:flex-end;gap:26px}.cell{display:grid;justify-items:center;gap:8px}
  .locks{display:flex;align-items:center;gap:56px;flex-wrap:wrap}.tiles{display:flex;align-items:center;gap:22px}
  svg{display:block}</style>${row("light")}${row("dark")}`;
  await shoot(html, path.join(SCREENS, "brand-monogram.png"), { width: 1280, height: 1040, scale: 2 });
}

// 2. favicon in browser tab strips (light + dark), 1x and 2x, plus an 8x pixel zoom
{
  const tab = (theme, label) => {
    const T = theme === "dark"
      ? { strip: "#1F1F1F", tab: "#3C3C3C", text: "#E3E3E3", other: "#9AA0A6" }
      : { strip: "#DFE3E8", tab: "#FFFFFF", text: "#1F1F1F", other: "#5F6368" };
    return `<div class="strip" style="background:${T.strip};color-scheme:${theme}">
      <div class="tab active" style="background:${T.tab};color:${T.text}"><img src="${b64(fav)}" width="16" height="16"><span>${label}</span></div>
      <div class="tab" style="color:${T.other}"><span class="dot" style="background:${T.other}"></span><span>LinkedIn</span></div>
      <div class="tab" style="color:${T.other}"><span class="dot" style="background:${T.other}"></span><span>GitHub</span></div></div>`;
  };
  const html = (theme) => `<!doctype html><style>body{margin:0;font:13px system-ui,-apple-system,sans-serif}
  .strip{display:flex;gap:2px;padding:8px 8px 0;height:42px;box-sizing:border-box}
  .tab{display:flex;align-items:center;gap:8px;padding:0 14px;height:34px;width:220px;border-radius:9px 9px 0 0;white-space:nowrap;overflow:hidden}
  .dot{width:16px;height:16px;border-radius:4px;opacity:.5;flex:none}img{flex:none}</style>${tab(theme, "Mohamed Hatem · AI Team Lead")}`;
  const shots = [];
  for (const theme of ["light", "dark"]) for (const scale of [1, 2]) {
    const p = path.join(SCREENS, `.tab-${theme}-${scale}.png`);
    await shoot(html(theme), p, { width: 700, height: 42, scale, colorScheme: theme });
    shots.push({ theme, scale, p });
  }
  // compose: each strip at 2x display, plus 8x nearest-neighbour zoom of the favicon area
  const comps = []; let y = 16;
  for (const s of shots) {
    const img = sharp(s.p);
    const strip = await img.clone().resize(1400, 84, { kernel: s.scale === 1 ? "nearest" : "lanczos3" }).png().toBuffer();
    comps.push({ input: strip, left: 16, top: y });
    // favicon region: x 22..38, y 17..33 (css px)
    const z = await sharp(s.p).extract({ left: 18 * s.scale, top: 13 * s.scale, width: 24 * s.scale, height: 24 * s.scale })
      .resize(192, 192, { kernel: "nearest" }).png().toBuffer();
    comps.push({ input: z, left: 1440, top: y - 54 + 42 });
    y += 220;
  }
  await sharp({ create: { width: 1650, height: y, channels: 3, background: "#8A8F94" } }).composite(comps).png().toFile(path.join(SCREENS, "brand-favicon-tabs.png"));
  for (const s of shots) fs.rmSync(s.p);
}

// 3. pixel check of the shipped raster favicons (ICO frames + favicon.svg rasterised at 16/32/48)
{
  const tiles = [];
  for (const [buf, n] of [[t16, 16], [t32, 32]]) tiles.push(await sharp(buf).resize(n * (256 / n), null, { kernel: "nearest" }).png().toBuffer());
  for (const theme of ["light", "dark"]) for (const n of [16, 32, 48]) {
    // the rasteriser ignores media queries: apply the dark swap by hand for the check
    const s = theme === "dark" ? fav.replace(/<style>.*<\/style>/, `<style>.i{fill:${D.ink}}.n{fill:${NODE_D}}</style>`) : fav;
    const bg = theme === "dark" ? "#3C3C3C" : "#FFFFFF";
    const buf = await sharp(Buffer.from(s), { density: 72 * n / 32 }).resize(n, n).flatten({ background: bg }).png().toBuffer();
    tiles.push(await sharp(buf).resize(256, 256, { kernel: "nearest" }).png().toBuffer());
  }
  const comps = tiles.map((b, i) => ({ input: b, left: 16 + (i % 4) * 272, top: 16 + Math.floor(i / 4) * 272 }));
  await sharp({ create: { width: 16 + 4 * 272, height: 16 + 2 * 272, channels: 3, background: "#8A8F94" } }).composite(comps).png().toFile(path.join(SCREENS, "brand-favicon-pixels.png"));
}

// 4. app icons in context: maskable with the 80 % safe zone drawn, the same under circle and squircle
//    masks, the iOS icon under its rounded mask, the "any" icons on paper and deep ink
{
  const img = (name, size, style = "") => `<img src="${file64(out[name])}" width="${size}" height="${size}" style="${style}">`;
  const html = `<!doctype html><style>body{margin:0;font:12px ui-monospace,monospace;color:${L.muted}}
  .row{display:flex;gap:28px;align-items:flex-end;padding:28px 32px}.c{display:grid;gap:8px;justify-items:center}
  .safe{position:relative}.safe::after{content:"";position:absolute;inset:10%;border-radius:50%;outline:2px dashed ${NODE_D}}
  .dk{background:${D.bg};color:${D.muted}}</style>
  <div class="row" style="background:${L.bg}">
    <div class="c"><div class="safe">${img("icon-maskable-512.png", 200)}</div>maskable + 80 % safe zone</div>
    <div class="c">${img("icon-maskable-512.png", 160, "border-radius:50%")}circle mask</div>
    <div class="c">${img("icon-maskable-512.png", 160, "border-radius:28%")}squircle mask</div>
    <div class="c">${img("apple-touch-icon.png", 160, "border-radius:22.37%")}apple-touch-icon</div>
    <div class="c">${img("icon-192.png", 96)}icon-192</div><div class="c">${img("icon-512.png", 160)}icon-512</div></div>
  <div class="row dk"><div class="c">${img("icon-512.png", 160)}icon-512 on deep ink</div>
    <div class="c">${img("icon-192.png", 96)}icon-192</div>
    <div class="c"><img src="${b64(fs.readFileSync(out["monogram-tile.svg"], "utf8"))}" width="96" height="96">monogram-tile.svg (hairline)</div>
    <div class="c">${img("favicon-32.png", 32)}favicon-32</div></div>`;
  await shoot(html, path.join(SCREENS, "brand-app-icons.png"), { width: 1240, height: 560, scale: 1 });
}

await closeBrowser();
for (const [k, p] of Object.entries(out)) console.log(k.padEnd(24), kb(p));
