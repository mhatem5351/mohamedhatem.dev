// Profile photo pipeline: crops, subtle grade, duotones, responsive AVIF/WebP/JPEG exports,
// the "orchestrator" orbit overlay (SVG) + flattened previews, a manifest, and verification sheets.
//
//   node design/scripts/brand/photo.mjs
//
// Input : _inputs/profile-photo.jpg (800x800 sRGB JPEG, warm beige studio backdrop).
// Output: design/assets/photo/*, design/screens/assets/photo-*.png
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sharp, tok, shoot, closeBrowser, write, PHOTO, INPUTS, SCREENS } from "./lib.mjs";

const SRC = path.join(INPUTS, "profile-photo.jpg");
const SCRATCH = process.env.PHOTO_SCRATCH || path.join(os.tmpdir(), "mh-design-photo");
fs.mkdirSync(PHOTO, { recursive: true });
fs.mkdirSync(SCREENS, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

// ---------------------------------------------------------------- crop boxes (source pixels)
// Landmarks measured on the source: eye line y = 329, eye centre x = 375, head top y = 215, chin y = 495.
// A small green object sits at the bottom centre (x 415-445, y >= 795): every crop ends above y = 785.
const EYE_Y = 329, FACE_X = 380;
function box(w, h, eyeFrac) {
  const top = Math.round(EYE_Y - h * eyeFrac);
  const left = Math.round(FACE_X - w / 2);
  if (top < 0 || left < 0 || left + w > 800 || top + h > 785) throw new Error(`crop out of bounds ${w}x${h}`);
  return { left, top, width: w, height: h };
}
const CROPS = {
  square: box(640, 640, 1 / 3),   // head and shoulders, eyes on the upper third
  avatar: box(448, 448, 0.38),    // tight head crop for small circles (nav, chat widget, 24-96 px)
  portrait: box(536, 670, 1 / 3), // 4:5, eyes on the upper third (height capped by the green object)
};
const WIDTHS = [96, 192, 320, 480, 640, 960];
const JPEG_WIDTH = 480;

// ---------------------------------------------------------------- colour maths
const s2l = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
function rgb2oklab([r, g, b]) {
  const R = s2l(r), G = s2l(g), B = s2l(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklab2rgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [R, G, B].map(v => Math.min(1, Math.max(0, l2s(Math.min(1, Math.max(0, v))))));
}
const lerp = (a, b, t) => a + (b - a) * t;
const mixLab = (A, B, t) => A.map((v, i) => lerp(v, B[i], t));
const smooth = t => t * t * (3 - 2 * t);

// deterministic dither (keeps the smooth backdrop free of 8-bit banding after the gradient map)
let seed = 0x2f6b1d;
const rnd = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) >>> 0; let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const tpdf = () => rnd() - rnd(); // triangular, +-1 LSB

// ---------------------------------------------------------------- grade (subtle)
// Gentle S-curve on luminance only (hue and skin tones untouched), a hair of highlight lift so the
// backdrop reads clean next to the paper token, and a 4% saturation trim of the beige cast.
async function graded() {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const Y = 0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b);
    const L = Y ** (1 / 2.2);
    let L2 = lerp(L, smooth(L), 0.10);            // mild contrast
    L2 = L2 + 0.025 * Math.max(0, (L2 - 0.6) / 0.4) ** 2; // highlight lift (backdrop only)
    const k = L > 1e-4 ? L2 / L : 1;
    const grey = L2;
    for (let c = 0; c < 3; c++) {
      let v = [r, g, b][c] * k;
      v = lerp(grey, v, 0.96);                   // saturation trim
      out[i + c] = Math.max(0, Math.min(255, Math.round(v * 255 + tpdf() * 0.5)));
    }
  }
  return { data: out, info };
}

// separable box blur in float (3 passes ~ gaussian); float avoids 8-bit contouring in the backdrop
function blurF(src, w, h, r) {
  let a = Float32Array.from(src), b = new Float32Array(a.length);
  const pass = (inp, out, horiz) => {
    const len = horiz ? w : h, lines = horiz ? h : w, inv = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
      const at = i => horiz ? l * w + Math.min(len - 1, Math.max(0, i)) : Math.min(len - 1, Math.max(0, i)) * w + l;
      let acc = 0; for (let i = -r; i <= r; i++) acc += inp[at(i)];
      for (let i = 0; i < len; i++) { out[at(i)] = acc * inv; acc += inp[at(i + r + 1)] - inp[at(i - r)]; }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

// ---------------------------------------------------------------- duotone
// Gradient map on perceptual luminance, interpolated in OKLab (piecewise linear, so lightness is linear
// in t). Stops: ink (shadows) -> a lower mid-tone that borrows some of teal's hue -> a neutral upper mid
// (where the skin sits, so the face stays natural) -> paper (highlights). A little local contrast
// ("clarity") on the luminance keeps the face from going flat once colour is removed.
function duotoneStops(theme) {
  const dark = theme === "dark";
  // light: lapis ink #131D36 -> alabaster #F7F6F3; dark: lapis night #080E1C -> ivory #F4F0E7 (from the tokens)
  const lo = rgb2oklab(hex(dark ? tok("bg", "dark") : tok("ink", "light")));
  const hi = rgb2oklab(hex(dark ? tok("ink", "dark") : tok("bg", "light")));
  const teal = rgb2oklab(hex(dark ? tok("teal-fill", "dark") : tok("teal", "light")));
  const at = (t, tealAmt) => { const m = mixLab(lo, hi, t); return [m[0], lerp(m[1], teal[1], tealAmt), lerp(m[2], teal[2], tealAmt)]; };
  return [[0, lo], [0.34, at(0.34, dark ? 0.26 : 0.26)], [0.62, at(0.62, dark ? 0.05 : 0)], [1, hi]];
}
function duotoneLUT(theme) {
  const stops = duotoneStops(theme);
  const N = 4096, lut = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let k = 1; while (k < stops.length - 1 && t > stops[k][0]) k++;
    const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
    lut.set(oklab2rgb(mixLab(c0, c1, (t - t0) / (t1 - t0))).map(v => v * 255), i * 3);
  }
  return lut;
}
async function duotone({ data, info }, theme) {
  const dark = theme === "dark";
  const lut = duotoneLUT(theme);
  const N = lut.length / 3;
  const n = data.length / 3;
  const Ls = new Float32Array(n);
  for (let i = 0, j = 0; i < data.length; i += 3, j++) {
    const Y = 0.2126 * s2l(data[i] / 255) + 0.7152 * s2l(data[i + 1] / 255) + 0.0722 * s2l(data[i + 2] / 255);
    Ls[j] = Math.cbrt(Y); // OKLab-like lightness
  }
  // clarity: L + amount * (L - blur(L)), radius ~1.2 % of the frame
  const bl = blurF(Ls, info.width, info.height, Math.max(1, Math.round(info.width * 0.012)));
  // applied through a mid-tone bell so it shapes the face without haloing the head against the backdrop
  for (let j = 0; j < n; j++) { const w = Math.exp(-(((Ls[j] - 0.6) / 0.17) ** 2)); Ls[j] = Ls[j] + 0.20 * w * (Ls[j] - bl[j]); }
  if (process.env.PHOTO_DEBUG) {
    const at = (x, y) => Ls[Math.round(y * info.height) * info.width + Math.round(x * info.width)].toFixed(3);
    console.log(theme, "backdrop", at(0.1, 0.1), at(0.9, 0.3), "skin", at(0.47, 0.47), at(0.42, 0.40), "shirt", at(0.5, 0.85), "suit", at(0.2, 0.9));
  }
  // levels from percentiles: black at the deepest suit shadows
  const sorted = Float32Array.from(Ls).sort();
  const p = q => sorted[Math.floor(q * (sorted.length - 1))];
  // light: white sits between backdrop and shirt, so the backdrop stays a shade under paper and the circle
  // still reads on a paper page; dark: white at the backdrop, then the knee below pulls it down
  const black = p(0.004), white = p(dark ? 0.85 : 0.97);
  if (process.env.PHOTO_DEBUG) console.log(theme, "black", black.toFixed(3), "white", white.toFixed(3), "p50", p(0.5).toFixed(3), "p80", p(0.8).toFixed(3), "p95", p(0.95).toFixed(3));
  const GAMMA = dark ? 1.14 : 1.06; // keeps skin in the upper mids after the white point moved down
  const LIFT = dark ? 0.03 : 0.05;  // shadows stop just short of the ink stop (beard keeps its texture)
  const KNEE = 0.72, KS = 0.42;
  // shoulder steepness chosen so the slope is continuous (=1) at the knee: SK / (1 - e^-SK) = 1 / KS
  let SK = 1; for (let i = 0; i < 60; i++) SK = (1 - Math.exp(-SK)) / KS;     // dark only: highlights above the face roll off (backdrop never hits the full dark ink, #F4F0E7)
  const out = Buffer.alloc(data.length);
  for (let j = 0; j < n; j++) {
    let t = Math.min(1, Math.max(0, (Ls[j] - black) / (white - black))) ** GAMMA;
    t = LIFT + (1 - LIFT) * t;
    if (dark && t > KNEE) { const u = (t - KNEE) / (1 - KNEE); t = KNEE + (1 - KNEE) * KS * (1 - Math.exp(-SK * u)) / (1 - Math.exp(-SK)); } // monotonic soft shoulder
    const k = Math.round(t * (N - 1)) * 3;
    for (let c = 0; c < 3; c++) out[j * 3 + c] = Math.max(0, Math.min(255, Math.round(lut[k + c] + tpdf() * 0.75)));
  }
  return { data: out, info };
}

// ---------------------------------------------------------------- export
const ENC = {
  avif: { quality: 64, effort: 9, chromaSubsampling: "4:4:4" },
  webp: { quality: 82, effort: 6, smartSubsample: true, preset: "photo" },
  jpeg: { quality: 82, mozjpeg: true, progressive: true, chromaSubsampling: "4:2:0" },
};
const manifest = { source: "_inputs/profile-photo.jpg", sourceSize: [800, 800], crops: {}, variants: {}, encoders: ENC };

async function exportVariant(name, raw, crop) {
  const { data, info } = raw;
  const maxW = info.width;
  const widths = WIDTHS.filter(w => w <= maxW);
  const aspect = info.height / info.width;
  const files = [];
  const base = () => sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } });
  for (const w of widths) {
    const h = Math.round(w * aspect);
    const scale = maxW / w;
    const resized = await base().resize(w, h, { kernel: "lanczos3" })
      .sharpen(scale >= 2 ? { sigma: 0.55, m1: 0.6, m2: 1.2 } : { sigma: 0.4, m1: 0.3, m2: 0.6 })
      .toColourspace("srgb").raw().toBuffer();
    const img = () => sharp(resized, { raw: { width: w, height: h, channels: 3 } }).withIccProfile("srgb");
    for (const fmt of ["avif", "webp"]) {
      const f = `mh-${name}-${w}.${fmt}`;
      await img()[fmt](ENC[fmt]).toFile(path.join(PHOTO, f));
      files.push({ file: f, width: w, height: h, format: fmt, bytes: fs.statSync(path.join(PHOTO, f)).size });
    }
    if (w === Math.min(JPEG_WIDTH, widths[widths.length - 1])) { // one baseline fallback per variant
      const f = `mh-${name}-${w}.jpg`;
      await img().jpeg(ENC.jpeg).toFile(path.join(PHOTO, f));
      files.push({ file: f, width: w, height: h, format: "jpeg", bytes: fs.statSync(path.join(PHOTO, f)).size });
    }
  }
  manifest.variants[name] = { crop, aspect: `${info.width}:${info.height}`, widths, files };
  return files;
}

// ---------------------------------------------------------------- orbit overlay
// Geometry in a 240 x 240 box; the photo is a circle of diameter 168 (70 %) centred in it.
const ORB = { box: 240, photoR: 84, ringR: 88, ringW: 2, orbitR: 106, orbitW: 1.4, nodeR: 6.5, nodeW: 2, dotR: 2.4 };
const SATS = [
  { cat: "saffron", a: -48 },  // retrieval
  { cat: "coral", a: 14 },     // generation
  { cat: "sky", a: 128 },      // evaluation
  { cat: "sage", a: 196 },     // guard
];
function orbitSVG() {
  const svg = orbitSVGRaw();
  for (const m of svg.matchAll(/<!--([\s\S]*?)-->/g)) if (m[1].includes("--")) throw new Error("double hyphen inside an XML comment");
  return svg;
}
function orbitSVGRaw() {
  const c = ORB.box / 2, R = n => Math.round(n * 100) / 100;
  const pos = SATS.map(s => ({ ...s, x: c + ORB.orbitR * Math.cos(s.a * Math.PI / 180), y: c + ORB.orbitR * Math.sin(s.a * Math.PI / 180) }));
  const L = { teal: tok("teal-fill"), saffron: tok("saffron-fill"), coral: tok("coral-fill"), sky: tok("sky-fill"), sage: tok("sage-fill"), node: tok("graph-node"), orbit: tok("line-strong") };
  const D = { teal: tok("teal-fill", "dark"), saffron: tok("saffron-fill", "dark"), coral: tok("coral-fill", "dark"), sky: tok("sky-fill", "dark"), sage: tok("sage-fill", "dark"), node: tok("graph-node", "dark"), orbit: tok("line-strong", "dark") };
  const vars = P => `--color-teal-fill:${P.teal};--color-saffron-fill:${P.saffron};--color-coral-fill:${P.coral};--color-sky-fill:${P.sky};--color-sage-fill:${P.sage};--color-graph-node:${P.node};color:${P.orbit}`;
  // the dashed orbit is drawn as arcs between the satellites (a clear gap around each node, no mask/ids,
  // so the SVG can be inlined any number of times on a page)
  const gap = (ORB.nodeR + ORB.nodeW / 2 + 3.5) / ORB.orbitR; // radians either side of a node
  const pt = a => [R(c + ORB.orbitR * Math.cos(a)), R(c + ORB.orbitR * Math.sin(a))];
  const angs = SATS.map(s => s.a * Math.PI / 180).sort((x, y) => x - y);
  const arcs = angs.map((a, i) => {
    const b = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI;
    const a0 = a + gap, a1 = b - gap, large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M${x0} ${y0}A${ORB.orbitR} ${ORB.orbitR} 0 ${large} 1 ${x1} ${y1}`;
  }).join("");
  const nodes = pos.map(p => `<g class="n n-${p.cat}"><circle cx="${R(p.x)}" cy="${R(p.y)}" r="${ORB.nodeR}" class="n-ring" stroke-width="${ORB.nodeW}"/><circle cx="${R(p.x)}" cy="${R(p.y)}" r="${ORB.dotR}" class="n-dot"/></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ORB.box} ${ORB.box}" class="mh-orbit" fill="none" aria-hidden="true" focusable="false">
<!--
  Orchestrator orbit: overlay for the circular profile photo (static; no motion).
  Layout (square box of any size S):
    - photo: circle-cropped <img>, diameter 70% of S (168/240), centred, i.e. inset 15% on every side
    - teal ring hugging the photo (r 88/240), dashed orbit (r 106/240), four satellite nodes on the orbit
      in the category colours: saffron (retrieval), coral (generation), sky (evaluation), sage (guard).
  Example (S = 240 px, use the 480 w file for 2x):
    <div style="position:relative;width:240px;aspect-ratio:1">
      <img src="mh-square-480.avif" alt="Mohamed Hatem" width="168" height="168"
           style="position:absolute;inset:15%;width:70%;height:70%;border-radius:50%;object-fit:cover">
      [this SVG, inlined, with style "position:absolute;inset:0;width:100%;height:100%"]
    </div>
  Colours: inline it so it follows the page's colour tokens (CSS custom properties color-teal-fill,
  color-saffron-fill, color-coral-fill, color-sky-fill, color-sage-fill, color-graph-node); the dashed orbit
  uses currentColor, so set color on the svg or its wrapper (recommended: the color-line-strong token).
  Used as an <img>, it falls back to the token values for the visitor's colour scheme.
  Recommended display size: 160 px and up (below that use the photo alone, e.g. mh-avatar-*).
-->
<style>
svg.mh-orbit:root{${vars(L)}}
@media (prefers-color-scheme:dark){svg.mh-orbit:root{${vars(D)}}}
.mh-orbit .o-ring{stroke:var(--color-teal-fill)}
.mh-orbit .o-orbit{stroke:currentColor}
.mh-orbit .n-ring{fill:var(--color-graph-node)}
.mh-orbit .n-saffron .n-ring{stroke:var(--color-saffron-fill)}.mh-orbit .n-saffron .n-dot{fill:var(--color-saffron-fill)}
.mh-orbit .n-coral .n-ring{stroke:var(--color-coral-fill)}.mh-orbit .n-coral .n-dot{fill:var(--color-coral-fill)}
.mh-orbit .n-sky .n-ring{stroke:var(--color-sky-fill)}.mh-orbit .n-sky .n-dot{fill:var(--color-sky-fill)}
.mh-orbit .n-sage .n-ring{stroke:var(--color-sage-fill)}.mh-orbit .n-sage .n-dot{fill:var(--color-sage-fill)}
</style>
<path d="${arcs}" class="o-orbit" stroke-width="${ORB.orbitW}" stroke-linecap="round" stroke-dasharray="3.2 4.6"/>
<circle cx="${c}" cy="${c}" r="${ORB.ringR}" class="o-ring" stroke-width="${ORB.ringW}"/>
${nodes}
</svg>
`;
}

// ---------------------------------------------------------------- previews + sheets
const fileURL = f => "file://" + path.join(PHOTO, f);
const tokensCSS = fs.readFileSync(path.join(PHOTO, "../../tokens.css"), "utf8");
function orbitBlock(size, img, theme) {
  const svg = fs.readFileSync(path.join(PHOTO, "orbit-ring.svg"), "utf8").replace(/<!--[\s\S]*?-->/, "");
  return `<div class="orb" style="width:${size}px"><img src="${fileURL(img)}" alt="">${svg.replace("<svg ", `<svg style="position:absolute;inset:0;width:100%;height:100%;color:var(--color-line-strong)" `)}</div>`;
}
const pageCSS = theme => `${tokensCSS}
html,body{margin:0;background:var(--color-bg);color:var(--color-ink);font:14px/1.4 ui-sans-serif,system-ui,sans-serif}
.orb{position:relative;aspect-ratio:1}
.orb img{position:absolute;inset:15%;width:70%;height:70%;border-radius:50%;object-fit:cover;display:block}
`;

async function previews() {
  for (const theme of ["light", "dark"]) {
    const html = `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${pageCSS(theme)}
body{width:480px;height:480px}</style></head><body>${orbitBlock(480, "mh-square-480.avif", theme)}</body></html>`;
    const out = path.join(PHOTO, `orbit-preview-${theme}.png`);
    await shoot(html, out, { width: 480, height: 480, colorScheme: theme, baseURL: SCRATCH });
    fs.writeFileSync(out, await sharp(out).png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer());
  }
}

async function sheets() {
  for (const theme of ["light", "dark"]) {
    const sizes = [96, 192, 320];
    const small = [32, 48, 64, 96];
    const row = (label, cells) => `<div class="row"><div class="lab">${label}</div>${cells}</div>`;
    const circ = (f, s) => `<img class="c" src="${fileURL(f)}" width="${s}" height="${s}" alt="">`;
    const pick = (variant, s) => { const w = [96, 192, 320, 480, 640].find(w => w >= s * 2) || 640; const v = manifest.variants[variant]; const ok = v.widths.includes(w) ? w : v.widths[v.widths.length - 1]; return `mh-${variant}-${ok}.avif`; };
    const html = `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${pageCSS(theme)}
body{padding:28px;width:1544px}
h1{font-size:15px;font-weight:600;margin:0 0 18px;color:var(--color-muted);letter-spacing:.06em;text-transform:uppercase}
.row{display:flex;align-items:center;gap:28px;margin-bottom:24px}
.lab{width:150px;color:var(--color-muted);font-size:13px}
.c{border-radius:50%;display:block}
.sq{border-radius:16px;display:block}
.pt{border-radius:16px;display:block}
.card{background:var(--color-surface);border:1px solid var(--color-line);border-radius:24px;padding:20px;display:flex;gap:28px;align-items:center}
</style></head><body>
<h1>Profile photo · ${theme}</h1>
${row("avatar (circle)", small.map(s => circ(pick("avatar", s), s)).join(""))}
${row("square (circle)", sizes.map(s => circ(pick("square", s), s)).join(""))}
${row("duotone light", sizes.map(s => circ(pick("duotone-light", s), s)).join(""))}
${row("duotone dark", sizes.map(s => circ(pick("duotone-dark", s), s)).join(""))}
${row("orbit", `<div class="card">${sizes.map(s => orbitBlock(s, pick("square", s * 0.7), theme)).join("")}${orbitBlock(320, pick(theme === "dark" ? "duotone-dark" : "duotone-light", 224), theme)}</div>`)}
${row("square / portrait", `<img class="sq" src="${fileURL("mh-square-320.avif")}" width="320" height="320" alt=""><img class="pt" src="${fileURL("mh-portrait-480.avif")}" width="320" height="400" alt=""><img class="sq" src="${fileURL(theme === "dark" ? "mh-duotone-dark-320.avif" : "mh-duotone-light-320.avif")}" width="320" height="320" alt="">`)}
</body></html>`;
    await shoot(html, path.join(SCREENS, `photo-sheet-${theme}.png`), { width: 1600, height: 2080, colorScheme: theme, baseURL: SCRATCH });
  }
  // 1:1 detail check of the 480 encodes (skin, beard edge, backdrop banding)
  const det = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${pageCSS("light")}
body{padding:20px;display:grid;grid-template-columns:repeat(4,480px);gap:16px;width:1980px}
img{display:block}figure{margin:0}figcaption{font:12px ui-monospace,monospace;color:var(--color-muted);padding-top:6px}</style></head><body>
${["mh-square-480.avif", "mh-square-480.webp", "mh-duotone-light-480.avif", "mh-duotone-dark-480.avif"].map(f => `<figure><img src="${fileURL(f)}" width="480" height="480"><figcaption>${f} · ${(fs.statSync(path.join(PHOTO, f)).size / 1024).toFixed(1)} KB</figcaption></figure>`).join("")}
</body></html>`;
  await shoot(det, path.join(SCREENS, "photo-detail-480.png"), { width: 2020, height: 540, colorScheme: "light", baseURL: SCRATCH });
}

// ---------------------------------------------------------------- run
const t0 = Date.now();
for (const f of fs.readdirSync(PHOTO)) if (/^mh-|^orbit-|^photo\.json$/.test(f)) fs.rmSync(path.join(PHOTO, f));
const G = await graded();
const crop = async (b) => {
  const { data, info } = await sharp(G.data, { raw: { width: G.info.width, height: G.info.height, channels: 3 } })
    .extract(b).raw().toBuffer({ resolveWithObject: true });
  return { data, info };
};
const sq = await crop(CROPS.square), pt = await crop(CROPS.portrait);
manifest.crops = CROPS;
await exportVariant("square", sq, CROPS.square);
await exportVariant("portrait", pt, CROPS.portrait);
await exportVariant("avatar", await crop(CROPS.avatar), CROPS.avatar);
await exportVariant("duotone-light", await duotone(sq, "light"), CROPS.square);
await exportVariant("duotone-dark", await duotone(sq, "dark"), CROPS.square);
write(path.join(PHOTO, "orbit-ring.svg"), orbitSVG());
await previews();
manifest.orbit = {
  file: "orbit-ring.svg", previews: ["orbit-preview-light.png", "orbit-preview-dark.png"],
  photoInset: "15%", photoDiameter: "70%", geometry: ORB, satellites: SATS,
};
manifest.notes = "srcset: use variants[*].files filtered by format; widths are capped at the crop's native size (no upscaling).";
write(path.join(PHOTO, "photo.json"), JSON.stringify(manifest, null, 2) + "\n");
await sheets();
await closeBrowser();

// report
const rows = fs.readdirSync(PHOTO).filter(f => f !== ".DS_Store").sort().map(f => [f, fs.statSync(path.join(PHOTO, f)).size]);
for (const [f, b] of rows) console.log(f.padEnd(34), String(b).padStart(7), "B");
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
