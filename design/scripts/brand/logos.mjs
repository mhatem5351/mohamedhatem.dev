// Company / school logo treatments for mohamedhatem.dev.
//
//   node design/scripts/brand/logos.mjs            build everything (mono SVGs, tiles, logos.json, contact sheets)
//   node design/scripts/brand/logos.mjs --no-sheet skip the verification renders
//
// Inputs:  _inputs/logos/<slug>.jpg (official 100x100 rasters). mtc.jpg is NOT used (wrong college).
// Outputs: design/assets/logos/mono/<slug>.svg      single-colour marks, fill="currentColor", tight viewBox
//          design/assets/logos/tiles/<slug>-<96|160>.<png|webp>  rounded tiles (radius 22 %) on the native background
//          design/assets/logos/logos.json           slug -> names, paths, aspect ratio, recommended mono height
//          design/screens/assets/logos-*.png         contact sheets (light + dark) and trace checks
//
// Method (traced marks): upscale 8x (lanczos3), build a soft "mark-ness" mask per logo (colour distance from the
// fitted background plane, optionally restricted to a region or a mark colour), threshold at 50 %, trace with potrace,
// optimise with svgo, and normalise the viewBox to the mark's tight bounds (height 100 units).
// Institutions whose crest cannot be reduced to a faithful silhouette (Cairo, Tanta) and institutions without a
// supplied logo (MTC, Tabaqat, UQU) get text monograms set in Space Grotesk 600, outlined to paths.
import fs from "node:fs";
import path from "node:path";
import { sharp, need, palette, outline, initFonts, transformPath, shoot, closeBrowser, write, LOGOS, INPUTS, SCREENS } from "./lib.mjs";

const SRC = path.join(INPUTS, "logos");
const UP = 8;               // upscale factor for tracing
const N = 100 * UP;         // upscaled size
const TILE_SIZES = [96, 160];
const SYMBOL_TILES = new Set(["wakeb", "empoweromics", "tabaqat"]); // built by brand-logos.mjs
const MONO_UNITS = 100;     // mono viewBox height
const ROW_H = 28;           // nominal credibility-row height (px) used for the recommended heights
const ARGS = new Set(process.argv.slice(2));

// ---------------------------------------------------------------- per-logo configuration
// mask: how the mark is separated from its background.
//   lo/hi  colour-distance ramp (0..441) from the fitted background
//   region [x0,y0,x1,y1] in source px: only this area counts as mark (everything else is background)
//   exclude [[x0,y0,x1,y1], ...]: areas forced to background (e.g. illegible micro-text)
// trace: potrace parameters (turdSize in upscaled px^2).
// tile: "vector" rebuilds the tile from the traced layers (crisp at any size, flat colours sampled from the source);
//       "raster" composites the cleaned, decontaminated source mark. fit = mark bbox long side / tile size,
//       or "source" to keep the source composition (scale k, default 1).
const CONFIG = {
  globant: {
    name: "Globant", nameAr: "Globant", kind: "company",
    mask: { lo: 60, hi: 140 },
    trace: { alphaMax: 1.0, optTolerance: 0.2, turdSize: 60 },
    tile: { mode: "vector", fit: "source", k: 1 },
  },
  wakeb: {
    name: "Wakeb", fullName: "Wakeb Data", nameAr: "Wakeb", kind: "company", optical: 1.12,
    // The source draws the whole lockup in ~85 x 22 px, below what an automatic trace can resolve (the symbol's
    // 1 px inner stripes and the 1 px gaps of the Kufic wordmark blur into blobs). The mark is therefore rebuilt
    // geometrically from the source pixel grid (coordinates below are in source px, measured on the 100 x 100 file):
    // the symbol as four solid strokes (navy V, cyan triangle, purple slash; inner stripes omitted) and the
    // rectilinear Kufic wordmark as rectangles. The 2 px Latin caption "WAKEB" is omitted (illegible at any size).
    geometry: () => {
      const poly = pts => "M" + pts.map(p => p.join(" ")).join("L") + "Z";
      const rect = ([x0, y0, x1, y1]) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;      // clockwise
      const hole = ([x0, y0, x1, y1]) => `M${x0} ${y0}V${y1}H${x1}V${y0}Z`;      // counter-clockwise (nonzero rule)
      return [
        poly([[11.3, 40.6], [17.7, 40.6], [27.9, 58.3], [21.5, 58.3]]),   // navy V: long arm
        poly([[26.3, 51.4], [29.4, 51.4], [29.4, 58.3], [26.3, 58.3]]),   // navy V: short arm
        poly([[23.6, 40.6], [38.7, 40.6], [31.15, 53.1]]),                // cyan triangle
        poly([[40.4, 40.6], [46.7, 40.6], [36.3, 58.3], [30.0, 58.3]]),   // purple slash
        rect([48, 46.6, 51, 53.2]), rect([48, 50.6, 77.3, 53.2]), rect([52.7, 53.9, 55.5, 57.1]),   // ba
        rect([57.4, 46.6, 60, 53.2]),
        rect([61, 46.6, 77.3, 49.1]), rect([61, 45, 64, 47]), rect([75, 46.6, 77.3, 53.2]),         // kaf
        rect([78.3, 41.2, 81.2, 53.2]),                                                              // alef
        rect([82, 46.6, 88.7, 53.2]), hole([85.2, 49.2, 86.6, 53.2]), rect([85.6, 53, 88.5, 57.2]), // waw
      ].join("");
    },
    tile: { mode: "raster", fit: 0.92, mask: { parts: null, lo: 20, hi: 80, region: [5, 30, 96, 66] } },
  },
  arabsstock: {
    name: "ArabsStock", nameAr: "ArabsStock", kind: "company",
    mask: { lo: 50, hi: 130, blur: 3 },
    trace: { alphaMax: 0.7, optTolerance: 0.3, turdSize: 60 },
    tile: { mode: "vector", fit: "source", k: 1 },
  },
  empoweromics: {
    name: "Empoweromics", nameAr: "Empoweromics", kind: "company",
    // mono: the house-and-smile symbol only (the wordmarks are 4-7 px tall in the source and do not trace faithfully)
    mask: { lo: 50, hi: 150, region: [28, 20, 74, 60] },
    trace: { alphaMax: 1.0, optTolerance: 0.2, turdSize: 60 },
    tile: { mode: "raster", fit: 0.84, mask: { region: null, lo: 20, hi: 80 } },
  },
  mdp: {
    name: "MDP", fullName: "Misria Digital Payments", nameAr: "مصرية للمدفوعات الرقمية (MDP)", kind: "company",
    mask: { lo: 60, hi: 160, blur: 2 },
    trace: { alphaMax: 0.3, optTolerance: 0.2, turdSize: 60 },
    tile: { mode: "vector", fit: 0.66 },
  },
  aws: {
    name: "AWS", fullName: "Amazon Web Services", nameAr: "AWS", kind: "company",
    mask: { lo: 60, hi: 160 },
    trace: { alphaMax: 1.0, optTolerance: 0.15, turdSize: 40 },
    tile: { mode: "vector", fit: "source", k: 1 },
  },
  iti: {
    name: "ITI", fullName: "Information Technology Institute", nameAr: "معهد تكنولوجيا المعلومات (ITI)", kind: "school",
    mask: { lo: 60, hi: 160 },
    trace: { alphaMax: 0.75, optTolerance: 0.2, turdSize: 60 },
    tile: { mode: "vector", fit: 0.7 },
  },
  aestheticspro: {
    name: "AestheticsPro", nameAr: "AestheticsPro", kind: "company",
    // silhouette of the three ribbons; the blue/cyan ribbon passes in front of the orange one and the green bar,
    // so a thin fold gap is cut around it to keep the ribbon structure readable in one colour
    mask: { lo: 45, hi: 120, blur: 10, smooth: 6, knock: [{ front: [170, 215], gap: 9, smooth: 12, blur: 8 }], final: { open: 4 } },
    trace: { alphaMax: 1.2, optTolerance: 0.5, turdSize: 80 },
    tile: { mode: "raster", plain: true, fit: "source", k: 1 },
  },
  buid: {
    name: "BUiD", fullName: "The British University in Dubai", nameAr: "الجامعة البريطانية في دبي", kind: "school",
    // the source has 1-2 px white columns at both sides: crop them
    crop: [3, 0, 97, 100],
    mask: { lo: 60, hi: 160, region: [3, 0, 97, 100] },
    trace: { alphaMax: 1.0, optTolerance: 0.2, turdSize: 60 },
    tile: { mode: "vector", fit: "source", k: 1 },
    // two colour layers for the vector tile: the light tower, the red arc
    layers: [
      { name: "tower", pick: ([r, g, b]) => (r + g + b) / 3 > 150 && Math.abs(r - b) < 70 },
      { name: "arc", pick: ([r, g, b]) => r > 150 && r - b > 70 },
    ],
  },
  "cairo-university": {
    name: "Cairo University", nameAr: "جامعة القاهرة", kind: "school",
    monogram: { text: "CU" }, optical: 0.84,
    tile: { mode: "raster", fit: "source", k: 0.9, mask: { lo: 14, hi: 60 } },
    mask: { lo: 30, hi: 90 },
  },
  "tanta-university": {
    name: "Tanta University", nameAr: "جامعة طنطا", kind: "school",
    monogram: { text: "TU" }, optical: 0.84,
    tile: { mode: "raster", fit: "source", k: 1.06, mask: { lo: 14, hi: 60 } },
    mask: { lo: 30, hi: 90 },
  },
  mtc: {
    name: "MTC", fullName: "Military Technical College, Cairo", nameAr: "الكلية الفنية العسكرية", kind: "school",
    monogram: { text: "MTC" }, noSource: true, optical: 0.9,
  },
  tabaqat: {
    name: "Tabaqat", nameAr: "طبقات", kind: "company",
    monogram: { text: "Tabaqat", wordmark: true }, noSource: true, optical: 0.92,
  },
  uqu: {
    name: "UQU", fullName: "Umm Al-Qura University", nameAr: "جامعة أم القرى", kind: "school",
    monogram: { text: "UQU" }, noSource: true, optical: 0.9,
  },
};

// ---------------------------------------------------------------- image helpers
async function loadSource(slug) {
  const { data, info } = await sharp(path.join(SRC, slug + ".jpg")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
async function upscale(slug) {
  const { data, info } = await sharp(path.join(SRC, slug + ".jpg")).removeAlpha()
    .resize(N, N, { kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const hex = rgb => "#" + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("").toUpperCase();
const lumOf = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

// least-squares plane per channel (c = a + b*x + c*y) over background samples, with one outlier-rejection pass.
function fitBackground(src, crop) {
  const [cx0, cy0, cx1, cy1] = crop || [0, 0, src.w, src.h];
  const samples = [];
  const ring = 3;
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
    if (x - cx0 < ring || cx1 - 1 - x < ring || y - cy0 < ring || cy1 - 1 - y < ring) {
      const i = (y * src.w + x) * 3; samples.push([x / src.w, y / src.h, src.data[i], src.data[i + 1], src.data[i + 2]]);
    }
  }
  const solve = pts => {
    // normal equations for [1, x, y]
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], V = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const [x, y, ...c] of pts) {
      const v = [1, x, y];
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) M[i][j] += v[i] * v[j]; for (let k = 0; k < 3; k++) V[k][i] += v[i] * c[k]; }
    }
    const inv = m => {
      const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
      const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
      return [[A, -(b * i - c * h), b * f - c * e], [B, a * i - c * g, -(a * f - c * d)], [C, -(a * h - b * g), a * e - b * d]].map(r => r.map(v => v / det));
    };
    const Mi = inv(M);
    return V.map(vk => Mi.map(row => row[0] * vk[0] + row[1] * vk[1] + row[2] * vk[2]));
  };
  let P = solve(samples);
  const at = (x, y) => P.map(([a, b, c]) => a + b * x + c * y);
  const res = s => Math.hypot(...at(s[0], s[1]).map((v, k) => v - s[2 + k]));
  const kept = samples.filter(s => res(s) < 24);
  if (kept.length > samples.length * 0.5) P = solve(kept);
  const fn = (x, y) => P.map(([a, b, c]) => a + b * x + c * y);
  const grad = Math.hypot(...P.map(p => Math.hypot(p[1], p[2])));
  return { at: fn, plane: P, flat: grad < 10, mean: fn(0.5, 0.5) };
}

// soft mark-ness mask in [0,1] over the upscaled image (one part)
function softMask(up, bg, m) {
  const out = new Float32Array(up.w * up.h);
  const inRect = (r, x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  for (let y = 0; y < up.h; y++) for (let x = 0; x < up.w; x++) {
    const sx = (x + 0.5) / UP, sy = (y + 0.5) / UP;
    if (m.region && !inRect(m.region, sx, sy)) continue;
    if (m.exclude && m.exclude.some(r => inRect(r, sx, sy))) continue;
    const i = (y * up.w + x) * 3;
    const p = [up.data[i], up.data[i + 1], up.data[i + 2]];
    if (m.pick) { out[y * up.w + x] = m.pick(p) ? 1 : 0; continue; }
    if (m.proto) {
      // closeness to a mark colour (multi-colour marks: one part per colour keeps the gaps between parts)
      const q = m.proto;
      out[y * up.w + x] = 1 - smooth(m.lo, m.hi, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      continue;
    }
    const b = bg.at(sx / 100, sy / 100);
    const d = Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
    out[y * up.w + x] = smooth(m.lo, m.hi, d);
  }
  return out;
}

// ---- binary morphology on N x N masks (Uint8Array 0/1), exact Euclidean distance transform (Felzenszwalb)
function edt1(f, n) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
  return d;
}
// squared distance from each pixel to the nearest pixel where on(i) is true
function dist2(mask, on) {
  const W = N, H = N, INF = 1e12, g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = on(mask[i]) ? 0 : INF;
  const col = new Float64Array(H);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) col[y] = g[y * W + x]; const d = edt1(col, H); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  const row = new Float64Array(W);
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) row[x] = g[y * W + x]; const d = edt1(row, W); for (let x = 0; x < W; x++) g[y * W + x] = d[x]; }
  return g;
}
const dilate = (m, r) => { const d = dist2(m, v => v === 1); return Uint8Array.from(d, v => v <= r * r ? 1 : 0); };
const erode = (m, r) => { const d = dist2(m, v => v === 0); return Uint8Array.from(d, v => v > r * r ? 1 : 0); };
const close = (m, r) => erode(dilate(m, r), r);
const open = (m, r) => dilate(erode(m, r), r);
function fillHoles(m) {
  const out = Uint8Array.from(m), seen = new Uint8Array(m.length), st = [];
  for (let i = 0; i < N; i++) for (const p of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!m[p] && !seen[p]) { seen[p] = 1; st.push(p); }
  while (st.length) {
    const p = st.pop(), x = p % N, y = (p / N) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, y > 0 ? p - N : -1, y < N - 1 ? p + N : -1]) if (q >= 0 && !m[q] && !seen[q]) { seen[q] = 1; st.push(q); }
  }
  for (let i = 0; i < m.length; i++) if (!m[i] && !seen[i]) out[i] = 1;
  return out;
}
// remove connected components whose bounding box lies entirely inside one of the rects (source px)
function dropComponents(m, rects) {
  const out = Uint8Array.from(m), lab = new Int32Array(m.length).fill(-1);
  for (let s0 = 0; s0 < m.length; s0++) {
    if (!m[s0] || lab[s0] >= 0) continue;
    const st = [s0], px = []; lab[s0] = s0;
    let x0 = N, y0 = N, x1 = 0, y1 = 0;
    while (st.length) {
      const p = st.pop(), x = p % N, y = (p / N) | 0; px.push(p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, y > 0 ? p - N : -1, y < N - 1 ? p + N : -1]) if (q >= 0 && m[q] && lab[q] < 0) { lab[q] = s0; st.push(q); }
    }
    const inside = rects.some(([a, b, c, d]) => x0 >= a * UP && y0 >= b * UP && x1 < c * UP && y1 < d * UP);
    if (inside) for (const p of px) out[p] = 0;
  }
  return out;
}
function hueOf([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 1) return -1;
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return (h * 60 + 360) % 360;
}

// binary mark mask for a logo: union of parts, then optional hue-based knockouts (ribbon folds)
async function blurMask(soft, sigma) {
  const buf = Buffer.from(Uint8Array.from(soft, v => Math.round(v * 255)));
  const out = await sharp(buf, { raw: { width: N, height: N, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
  return Float32Array.from(out, v => v / 255);
}
async function markMask(up, bg, cfg) {
  const parts = cfg.parts || [cfg];
  let union = new Uint8Array(N * N);
  for (const part of parts) {
    let soft = softMask(up, bg, part);
    const sigma = part.blur ?? 4;   // de-ring the JPEG edges before thresholding
    if (sigma) soft = await blurMask(soft, sigma);
    let b = Uint8Array.from(soft, v => v > 0.5 ? 1 : 0);
    if (part.drop) b = dropComponents(b, part.drop);
    if (part.open) b = open(b, part.open);
    if (part.fillHoles) b = fillHoles(b);
    if (part.close) b = close(b, part.close);
    if (part.fillHoles) b = fillHoles(b);
    if (part.smooth) b = close(open(b, part.smooth), part.smooth);
    for (let i = 0; i < b.length; i++) union[i] |= b[i];
  }
  for (const kn of cfg.knock || []) {
    // pixels of the "front" hue range, cleaned; cut a gap of kn.gap px into the "back" hue range around them
    const inH = ([h0, h1], p) => { const h = hueOf(p); return h >= 0 && (h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1); };
    let front = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) if (union[i] && inH(kn.front, [up.data[i * 3], up.data[i * 3 + 1], up.data[i * 3 + 2]])) front[i] = 1;
    front = close(open(front, kn.smooth || 3), kn.smooth || 3);
    if (kn.blur) { const f = await blurMask(front, kn.blur); front = Uint8Array.from(f, v => v > 0.5 ? 1 : 0); }
    if (kn.region) { const [x0, y0, x1, y1] = kn.region.map(v => v * UP); for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; if (x < x0 || x >= x1 || y < y0 || y >= y1) front[i] = 0; } }
    const halo = dilate(front, kn.gap);
    for (let i = 0; i < N * N; i++) if (halo[i] && !front[i]) union[i] = 0;
  }
  if (cfg.final && cfg.final.close) union = close(union, cfg.final.close);
  if (cfg.final && cfg.final.open) union = open(union, cfg.final.open);
  return union;
}

async function maskPNG(mask, w, h) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < mask.length; i++) buf[i] = mask[i] ? 0 : 255;
  return sharp(buf, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

// potrace a mask into an SVG path (coordinates in upscaled px)
async function trace(mask, params) {
  const potrace = need("potrace");
  const png = await maskPNG(mask, N, N);
  return new Promise((res, rej) => {
    const t = new potrace.Potrace();
    t.setParameters({ threshold: 128, blackOnWhite: true, turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY, ...params });
    t.loadImage(png, err => {
      if (err) return rej(err);
      const tag = t.getPathTag("#000");
      const d = /d="([^"]+)"/.exec(tag)[1];
      res(d);
    });
  });
}

// exact bounds of path data by sampling the curves
function pathBounds(d) {
  const toks = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0, i = 0, cmd = "M";
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[MLHVCQZmlhvcqz]/.test(toks[i])) cmd = toks[i++];
    if (cmd === "Z" || cmd === "z") continue;
    if (cmd === "M" || cmd === "L") { cx = num(); cy = num(); add(cx, cy); }
    else if (cmd === "H") { cx = num(); add(cx, cy); }
    else if (cmd === "V") { cy = num(); add(cx, cy); }
    else if (cmd === "Q") {
      const p = [cx, cy, num(), num(), num(), num()];
      for (let s = 1; s <= 16; s++) { const t = s / 16, u = 1 - t; add(u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]); }
      cx = p[4]; cy = p[5];
    }
    else if (cmd === "C") {
      const p = [cx, cy, num(), num(), num(), num(), num(), num()];
      for (let s = 1; s <= 24; s++) {
        const t = s / 24, u = 1 - t;
        add(u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6], u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7]);
      }
      cx = p[6]; cy = p[7];
    } else throw new Error("unsupported path command " + cmd);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function svgoOpt(svg) {
  const { optimize } = need("svgo");
  return optimize(svg, {
    multipass: true, floatPrecision: 2,
    plugins: ["preset-default"],
  }).data;
}

// ---------------------------------------------------------------- monograms (Space Grotesk 600, outlined)
// style: "plain" (letters only), "frame" (letters in a thin rounded frame), "rule" (letters over a short rule)
const MONOGRAM_STYLE = process.env.MONOGRAM_STYLE || "plain";
function monogramSVG(cfg, style = MONOGRAM_STYLE) {
  const { text, wordmark } = cfg.monogram;
  const size = 100;
  const f = n => Math.round(n * 100) / 100;
  const tracking = wordmark ? -0.025 : text.length > 2 ? -0.01 : -0.02;
  const o = outline(text, { font: "display", wght: 600, size, tracking });
  const b = o.bbox, lw = b.x1 - b.x0;
  if (wordmark || style === "plain") {
    // box = cap height + descender if any (UQU's Q tail, Tabaqat's q)
    const d = transformPath(o.d, -b.x0, -b.y0);
    // vertical offset that puts the cap-height centre (not the bbox centre) on the row centre, in box units
    const shift = (b.y1 - b.y0) / 2 - (-o.capHeight / 2 - b.y0);
    return { d, w: lw, h: b.y1 - b.y0, shift };
  }
  const cap = o.capHeight;
  if (style === "rule") {
    const gap = 14, t = 8;
    const d = transformPath(o.d, -b.x0, cap) + `M0 ${f(cap + gap)}H${f(lw)}V${f(cap + gap + t)}H0Z`;
    return { d, w: lw, h: cap + gap + t };
  }
  // frame
  const stroke = 6, padX = 20, padY = 20;
  const W = lw + 2 * padX, H = cap + 2 * padY, r = Math.min(W, H) * 0.24;
  const ring = (x, y, w, h, rr) => `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h - rr}A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
  const outer = ring(0, 0, f(W), f(H), f(r));
  const inner = ring(stroke, stroke, f(W - 2 * stroke), f(H - 2 * stroke), f(Math.max(0, r - stroke)));
  return { d: outer + inner + transformPath(o.d, padX - b.x0, padY + cap), w: W, h: H };
}

// ---------------------------------------------------------------- main
const results = {};
async function buildMono(slug, cfg) {
  let d, w, h;
  if (cfg.monogram) {
    const m = monogramSVG(cfg); ({ d, w, h } = m);
    const k = MONO_UNITS / h;
    var shift = (m.shift || 0) / h;   // fraction of the rendered height
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+(w * k).toFixed(2)} ${MONO_UNITS}" fill="currentColor"><path transform="scale(${+k.toFixed(5)})" fill-rule="evenodd" d="${d}"/></svg>`;
    const opt = svgoOpt(svg);
    return { svg: opt, aspect: w / h, shift };
  }
  if (cfg.geometry) {
    d = cfg.geometry();
    const bb = pathBounds(d);
    const k = MONO_UNITS / bb.h;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(bb.w * k).toFixed(2)} ${MONO_UNITS}" fill="currentColor"><path transform="translate(${-bb.x0 * k} ${-bb.y0 * k}) scale(${k})" d="${d}"/></svg>`;
    return { svg: svgoOpt(svg), aspect: bb.w / bb.h };
  }
  const src = await loadSource(slug);
  const up = await upscale(slug);
  const bg = fitBackground(src, cfg.crop);
  const mask = await markMask(up, bg, cfg.mask);
  d = await trace(mask, cfg.trace);
  const bb = pathBounds(d);
  const k = MONO_UNITS / bb.h;
  const nd = transformPath(d, -bb.x0 * k, -bb.y0 * k, k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(bb.w * k).toFixed(2)} ${MONO_UNITS}" fill="currentColor"><path fill-rule="evenodd" d="${nd}"/></svg>`;
  return { svg: svgoOpt(svg), aspect: bb.w / bb.h, bg, src, up, mask, rawPath: d, bbox: bb };
}

// ---------------------------------------------------------------- optical normalisation
// Visual weight ~ ink area. Equal-area scaling over-shrinks wide wordmarks, equal-height over-inflates dense
// squares, so the recommended height blends both: h = H0 * aspect^-0.4 * (coverage / 0.42)^-0.3, clamped.
const NORM = { H0: 26, ea: 0.4, ed: 0.3, c0: 0.42, min: 15, max: ROW_H };
async function inkStats(svg) {
  const H = 240;
  const sized = svg.replace("<svg ", `<svg height="${H}" `);
  const { data, info } = await sharp(Buffer.from(sized)).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let sum = 0; for (const v of data) sum += v;
  return { coverage: sum / 255 / (info.width * info.height) };
}
function recommendedHeight(aspect, coverage, bias = 1) {
  const h = NORM.H0 * aspect ** -NORM.ea * (coverage / NORM.c0) ** -NORM.ed * bias;
  return Math.round(clamp(h, NORM.min, NORM.max) * 2) / 2;
}

// ---------------------------------------------------------------- tiles
const TILE_RADIUS = 0.22;
function bgSVG(bg) {
  // background in source px space (0..100), extended beyond the square so scaled compositions stay covered
  if (bg.flat) return { defs: "", body: `<rect x="-60" y="-60" width="220" height="220" fill="${hex(bg.mean)}"/>` };
  const gx = bg.plane.reduce((a, p) => a + p[1], 0), gy = bg.plane.reduce((a, p) => a + p[2], 0);
  const L = Math.hypot(gx, gy), ux = gx / L, uy = gy / L, ext = 0.5 * (Math.abs(ux) + Math.abs(uy));
  const P = t => [0.5 + ux * ext * t, 0.5 + uy * ext * t];
  const stops = [-1, -0.5, 0, 0.5, 1].map(t => { const [x, y] = P(t); return `<stop offset="${(t + 1) / 2}" stop-color="${hex(bg.at(x, y))}"/>`; }).join("");
  const [x1, y1] = P(-1), [x2, y2] = P(1);
  return {
    defs: `<linearGradient id="bgg" gradientUnits="userSpaceOnUse" x1="${x1 * 100}" y1="${y1 * 100}" x2="${x2 * 100}" y2="${y2 * 100}">${stops}</linearGradient>`,
    body: `<rect x="-60" y="-60" width="220" height="220" fill="url(#bgg)"/>`,
  };
}
// median colour of source pixels under a (strong) mask, from the upscaled image
function sampleColour(up, mask) {
  const inner = erode(mask, 6), ch = [[], [], []];
  for (let i = 0; i < inner.length; i += 3) if (inner[i]) for (let k = 0; k < 3; k++) ch[k].push(up.data[i * 3 + k]);
  return ch.map(a => { a.sort((x, y) => x - y); return a[a.length >> 1]; });
}
// RGBA image (N x N) of the mark: soft alpha, colours decontaminated from the fitted background
async function rasterMark(up, bg, m) {
  let soft = softMask(up, bg, { ...m, lo: m.tileLo ?? m.lo, hi: m.tileHi ?? m.hi });
  soft = await blurMask(soft, 1.2);
  const out = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, a = soft[i], b = bg.at((x + 0.5) / N, (y + 0.5) / N);
    for (let k = 0; k < 3; k++) {
      const s = up.data[i * 3 + k];
      out[i * 4 + k] = a > 0.04 ? Math.round(clamp((s - (1 - a) * b[k]) / a, 0, 255)) : Math.round(clamp(b[k], 0, 255));
    }
    out[i * 4 + 3] = Math.round(a * 255);
  }
  // bounds of the mark (alpha > 0.5) in upscaled px
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (soft[y * N + x] > 0.5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { png: await sharp(out, { raw: { width: N, height: N, channels: 4 } }).png().toBuffer(), bbox: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
}
// the tile's inner hairline: ink at 13 % on light tiles (the light theme's ink token), white at 16 % on dark ones
const INK_RGB = palette("light").ink.match(/\w\w/g).map(v => parseInt(v, 16)).join(" ");
function hairline(bgRGB) {
  return lumOf(bgRGB) > 0.4 ? `rgb(${INK_RGB} / 0.13)` : "rgb(255 255 255 / 0.16)";
}
// compose one tile at size S (PNG buffer). layers: { bg, vectorSVG?, raster? }
async function composeTile(S, { bgRGB, bgSvg, vector, raster, place }) {
  const F = S * 4;    // supersampled canvas, downsampled with lanczos3
  const tf = place.mode === "source"
    ? `translate(${(1 - place.k) * 50} ${(1 - place.k) * 50}) scale(${place.k})`
    : `translate(${place.tx} ${place.ty}) scale(${place.k})`;
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${F}" height="${F}" viewBox="0 0 100 100"><defs>${bgSvg.defs}</defs><g transform="${tf}">${bgSvg.body}${vector || ""}</g></svg>`;
  let img = sharp(Buffer.from(base));
  if (raster) {
    // raster mark: N x N in source-px*8 space -> canvas
    const scale = (F / 100) * place.k / UP;
    const size = Math.round(N * scale);
    const off = place.mode === "source" ? Math.round((1 - place.k) * F / 2) : null;
    const left = off ?? Math.round(place.tx * F / 100), top = off ?? Math.round(place.ty * F / 100);
    const layer = await sharp(raster).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
    // crop if the layer overflows the canvas
    const cl = Math.max(0, -left), ct = Math.max(0, -top);
    const w = Math.min(size - cl, F - Math.max(0, left)), h = Math.min(size - ct, F - Math.max(0, top));
    const part = await sharp(layer).extract({ left: cl, top: ct, width: w, height: h }).png().toBuffer();
    img = sharp(await img.png().toBuffer()).composite([{ input: part, left: Math.max(0, left), top: Math.max(0, top) }]);
  }
  const big = await img.png().toBuffer();
  const small = await sharp(big).resize(S, S, { kernel: "lanczos3" }).png().toBuffer();
  const r = S * TILE_RADIUS;
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${r}" fill="#fff"/></svg>`;
  const lineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect x=".5" y=".5" width="${S - 1}" height="${S - 1}" rx="${r - 0.5}" fill="none" stroke="${hairline(bgRGB)}" stroke-width="1"/></svg>`;
  return sharp(small).ensureAlpha()
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }]).png().toBuffer()
    .then(b => sharp(b).composite([{ input: Buffer.from(lineSvg) }]).png().toBuffer());
}

// tile description per logo
async function tileSpec(slug, cfg, mono) {
  if (cfg.noSource || cfg.monogramTile) {
    // quiet paper tile with the monogram letters (no frame: the tile is the frame)
    const P = palette("light");
    const text = cfg.monogram.text;
    const o = outline(text, { font: "display", wght: 600, size: 100, tracking: cfg.monogram.wordmark ? -0.025 : (text.length > 2 ? -0.01 : -0.02) });
    const b = o.bbox, w = b.x1 - b.x0, h = b.y1 - b.y0;
    // optical size inside the tile: wordmarks fill 70 % of the width, 2-3 letter monograms get a 30-34 % cap height
    const k = cfg.monogram.wordmark ? 70 / w : Math.min((text.length > 2 ? 28 : 32) / o.capHeight, 62 / w);
    // centre the cap height (descenders such as the Q tail or the q of Tabaqat hang below, as in type)
    const tx = 50 - (b.x0 + w / 2) * k, ty = 50 + (o.capHeight / 2) * k;
    const vector = `<path fill="${P.ink2}" d="${transformPath(o.d, tx, ty, k)}"/>`;
    const bgRGB = P.bg2.match(/\w\w/g).map(v => parseInt(v, 16));
    return { bgRGB, bgSvg: { defs: "", body: `<rect x="-60" y="-60" width="220" height="220" fill="${P.bg2}"/>` }, vector, place: { mode: "source", k: 1 } };
  }
  const src = await loadSource(slug);
  const up = await upscale(slug);
  const bg = fitBackground(src, cfg.crop);
  const bgSvg = bgSVG(bg);
  const t = cfg.tile;
  if (t.mode === "vector") {
    // flat-colour layers rebuilt from traces (crisp at any size)
    const layers = cfg.layers || [{ name: "mark" }];
    let vector = "";
    for (const L of layers) {
      const mask = L.pick ? await markMask(up, bg, { pick: L.pick, blur: 3, region: cfg.mask.region }) : (mono.mask || await markMask(up, bg, cfg.mask));
      const d = L.pick ? await trace(mask, cfg.trace) : mono.rawPath;
      const col = hex(sampleColour(up, mask));
      vector += `<path transform="scale(${1 / UP})" fill-rule="evenodd" fill="${col}" d="${d}"/>`;
    }
    if (typeof t.fit === "number") {
      const bb = mono.bbox, bw = bb.w / UP, bh = bb.h / UP, k = (t.fit * 100) / Math.max(bw, bh);
      const cx = (bb.x0 + bb.w / 2) / UP, cy = (bb.y0 + bb.h / 2) / UP;
      return { bgRGB: bg.mean, bgSvg, vector, place: { mode: "fit", k, tx: 50 - cx * k, ty: 50 - cy * k } };
    }
    return { bgRGB: bg.mean, bgSvg, vector, place: { mode: "source", k: t.k ?? 1 } };
  }
  // raster
  if (t.plain) {
    const png = await sharp(path.join(SRC, slug + ".jpg")).resize(N, N, { kernel: "lanczos3" }).ensureAlpha().png().toBuffer();
    return { bgRGB: bg.mean, bgSvg, raster: png, place: { mode: "source", k: t.k ?? 1 } };
  }
  const rm = await rasterMark(up, bg, { ...cfg.mask, ...(t.mask || {}) });
  if (t.fit === "source") return { bgRGB: bg.mean, bgSvg, raster: rm.png, place: { mode: "source", k: t.k ?? 1 } };
  // fit: scale the mark bbox so its long side = fit * tile, centred
  const bw = (rm.bbox.x1 - rm.bbox.x0) / UP, bh = (rm.bbox.y1 - rm.bbox.y0) / UP;
  const k = (t.fit * 100) / Math.max(bw, bh);
  const cx = (rm.bbox.x0 + rm.bbox.x1) / 2 / UP, cy = (rm.bbox.y0 + rm.bbox.y1) / 2 / UP;
  return { bgRGB: bg.mean, bgSvg, raster: rm.png, place: { mode: "fit", k, tx: 50 - cx * k, ty: 50 - cy * k } };
}

export { CONFIG, fitBackground, markMask, softMask, dilate, erode, close, open, fillHoles, hueOf, trace, pathBounds, loadSource, upscale, maskPNG, buildMono, monogramSVG, svgoOpt, hex, lumOf, smooth, clamp, inkStats, recommendedHeight, tileSpec, composeTile };

// ---------------------------------------------------------------- build
if (import.meta.url === `file://${process.argv[1]}`) {
  await initFonts(["display"]);
  const out = { mono: path.join(LOGOS, "mono"), tiles: path.join(LOGOS, "tiles") };
  for (const d of Object.values(out)) fs.mkdirSync(d, { recursive: true });
  const manifest = {};
  for (const [slug, cfg] of Object.entries(CONFIG)) {
    const r = await buildMono(slug, cfg);
    write(path.join(out.mono, slug + ".svg"), r.svg);
    results[slug] = r;
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(r.svg);
    const aspect = +vb[1] / +vb[2];
    const { coverage } = await inkStats(r.svg);
    const h = recommendedHeight(aspect, coverage, cfg.optical ?? 1);
    // tiles (Wakeb, Empoweromics and Tabaqat get symbol tiles from official high-resolution artwork in
    // brand-logos.mjs, which also writes logic-controls; this script leaves those files alone)
    const spec = await tileSpec(slug, cfg, r);
    const tiles = {};
    for (const S of SYMBOL_TILES.has(slug) ? [] : TILE_SIZES) {
      const png = await composeTile(S, spec);
      const base = path.join(out.tiles, `${slug}-${S}`);
      // flat-colour tiles (vector / monogram): lossless WebP and full-colour PNG stay tiny and artefact-free;
      // photographic sources (crests, gradients): high-quality lossy WebP and a 256-colour PNG fallback
      const flat = !spec.raster;
      fs.writeFileSync(base + ".png", await sharp(png).png(flat ? { compressionLevel: 9, effort: 10 } : { palette: true, quality: 92, effort: 10, dither: 0.6 }).toBuffer());
      const lossy = await sharp(png).webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
      const lossless = flat ? await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer() : null;
      fs.writeFileSync(base + ".webp", lossless && lossless.length <= lossy.length * 1.25 ? lossless : lossy);
      tiles[S] = { png: `tiles/${slug}-${S}.png`, webp: `tiles/${slug}-${S}.webp` };
    }
    if (SYMBOL_TILES.has(slug)) for (const S of TILE_SIZES) tiles[S] = { png: `tiles/${slug}-${S}.png`, webp: `tiles/${slug}-${S}.webp` };
    manifest[slug] = {
      name: cfg.name,
      ...(cfg.fullName ? { fullName: cfg.fullName } : {}),
      nameAr: cfg.nameAr,
      kind: cfg.kind,
      treatment: cfg.monogram ? "monogram" : cfg.geometry ? "redrawn" : "traced",
      mono: `mono/${slug}.svg`,
      aspectRatio: +aspect.toFixed(3),
      inkCoverage: +coverage.toFixed(3),
      monoHeight: h,
      monoWidth: Math.round(h * aspect * 2) / 2,
      ...(r.shift && Math.abs(r.shift * h) >= 0.25 ? { monoOffsetY: Math.round(r.shift * h * 2) / 2 } : {}),
      tiles,
      tileBackground: hex(spec.bgRGB),
    };
    console.log(slug.padEnd(18), "aspect", aspect.toFixed(2), "cov", coverage.toFixed(2), "h", h, "svg", Buffer.byteLength(r.svg));
  }
  const json = {
    $comment: "Generated by design/scripts/brand/logos.mjs. Paths are relative to design/assets/logos/. monoHeight/monoWidth: recommended rendered size in px for a 28 px credibility row (optically normalised: equal visual weight, not equal bounding boxes); scale proportionally for other row heights (monoHeight / 28). Tiles: radius 22 %, 1 px inside hairline, native background; use the 96 px file up to 48 CSS px and the 160 px file up to 80 CSS px.",
    rowHeight: ROW_H,
    tileSizes: TILE_SIZES,
    logos: manifest,
  };
  write(path.join(LOGOS, "logos.json"), JSON.stringify(json, null, 2) + "\n");
  if (!ARGS.has("--no-sheet")) await sheets(manifest);
  await closeBrowser();
}

// ---------------------------------------------------------------- verification renders
async function sheets(manifest) {
  const rel = p => "file://" + path.join(LOGOS, p);
  const order = ["globant", "wakeb", "arabsstock", "empoweromics", "tabaqat", "mdp", "aestheticspro", "aws",
    "cairo-university", "tanta-university", "iti", "buid", "mtc", "uqu"];
  const monoInline = slug => fs.readFileSync(path.join(LOGOS, "mono", slug + ".svg"), "utf8")
    .replace("<svg ", `<svg height="${manifest[slug].monoHeight}" style="height:${manifest[slug].monoHeight}px;width:auto;transform:translateY(${manifest[slug].monoOffsetY || 0}px)" aria-label="${manifest[slug].name}" role="img" `);
  for (const theme of ["light", "dark"]) {
    const P = palette(theme);
    const rowCompany = order.filter(s => manifest[s].kind === "company");
    const rowSchool = order.filter(s => manifest[s].kind === "school");
    const monoRow = list => `<div class="row">${list.map(s => `<div class="cell">${monoInline(s)}</div>`).join("")}</div>`;
    const tileRow = list => `<div class="tiles">${list.map(s => `<figure><img src="${rel(manifest[s].tiles[96].png)}" width="40" height="40" alt=""><figcaption>${manifest[s].name}</figcaption></figure>`).join("")}</div>`;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:${P.bg};color:${P.ink};font:13px/1.4 system-ui,sans-serif;padding:28px 36px}
      h2{font:600 11px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:${P.muted};margin:26px 0 12px}
      .row{display:flex;align-items:center;gap:36px;height:28px;color:${P.muted};padding:14px 0;border-top:1px dashed ${P.line};border-bottom:1px dashed ${P.line};flex-wrap:nowrap}
      .cell{display:flex;align-items:center;height:28px}
      .cell svg{display:block}
      .tiles{display:flex;gap:18px;flex-wrap:wrap}
      figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px;width:76px}
      figcaption{font-size:10px;color:${P.muted};text-align:center}
      img{border-radius:9px;display:block}
      .big{display:flex;gap:16px;flex-wrap:wrap}
    </style><body>
      <h2>Mono row, companies (28 px row, --color-muted, normalised heights)</h2>${monoRow(rowCompany)}
      <h2>Mono row, education (28 px row)</h2>${monoRow(rowSchool)}
      <h2>Tiles at 40 px (96 px source)</h2>${tileRow(order)}
      <h2>Tiles at 80 px (160 px source)</h2><div class="tiles">${order.map(s => `<figure style="width:80px"><img src="${rel(manifest[s].tiles[160].png)}" width="80" height="80" alt="" style="border-radius:18px"></figure>`).join("")}</div>
    </body>`;
    await shoot(html, path.join(SCREENS, `logos-sheet-${theme}.png`), { width: 1240, height: 760, scale: 2, colorScheme: theme, baseURL: path.join(LOGOS) });
  }
  // trace check: source vs mono at 4x, for every logo with a source
  const withSrc = order.filter(s => !CONFIG[s].noSource && fs.existsSync(path.join(SRC, s + ".jpg")));
  const cells = withSrc.map(s => {
    const svg = fs.readFileSync(path.join(LOGOS, "mono", s + ".svg"), "utf8");
    return `<div class="c"><img src="file://${path.join(SRC, s + ".jpg")}"><div class="m">${svg}</div><div class="m d">${svg}</div><span>${manifest[s].name} (${manifest[s].treatment})</span></div>`;
  }).join("");
  const L = palette("light"), D = palette("dark");
  const html2 = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:${L.line};font:12px system-ui;padding:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
    .c{display:flex;gap:8px;align-items:center;background:#fff;padding:8px;position:relative}img{width:200px;height:200px}
    .m{width:200px;height:200px;display:flex;align-items:center;justify-content:center;background:${L.bg};color:${L.ink}}.m svg{max-width:184px;max-height:150px;width:100%;height:auto}
    .d{background:${D.bg};color:${D.ink}}span{position:absolute;left:8px;top:-2px;transform:translateY(-100%);font-size:11px;color:${L.ink2}}.c{margin-top:16px}</style><body>${cells}</body>`;
  await shoot(html2, path.join(SCREENS, "logos-trace-check.png"), { width: 1300, height: 230 * Math.ceil(withSrc.length / 2) + 30, scale: 1, baseURL: LOGOS });
}
