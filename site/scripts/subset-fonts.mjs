#!/usr/bin/env node
/**
 * Builds the site's web fonts from the design's files (design/assets/fonts), cut to what the site renders:
 *
 *   Latin faces (Space Grotesk, Inter, JetBrains Mono): Google's "latin" range plus the arrows and symbols the copy
 *     uses (JetBrains Mono without its code ligatures), and the weight axis limited to the weights the CSS asks for (DESIGN.md 4.2: display 500–700, text and
 *     mono 400–700; nothing lighter). Variable fonts carry the full axis otherwise.
 *   Plex Arabic 400 / 600 / 700: the Arabic-language block only (no Persian/Urdu letters, no Arabic-Indic digits,
 *     no presentation-form code points; hb-subset keeps every glyph the shaping rules reach, so joining, lam-alef
 *     ligatures and marks are unchanged).
 *   "MH Arabic Label": a few-KB Plex Arabic 600 cut to the Arabic words English pages show (language switch, footer
 *     link, one example question), so EN pages don't download an Arabic weight for them (DESIGN.md 4.4).
 *
 *   Print instances (src/assets/fonts/print/): static, single-weight cuts of the three Latin faces for the generated CV
 *     PDF only (scripts/postbuild/cv-pdf.mjs). Chromium embeds variable fonts in a PDF as Type 3 fonts, which breaks
 *     words in copied text and defeats search in Preview, Quick Look and some ATS parsers; static instances embed as
 *     TrueType. Never served to the site (nothing imports them).
 *
 * Output: src/assets/fonts/*.woff2 (committed). The unicode ranges in astro.config.mjs must match LATIN / ARABIC.
 * Run after changing the design fonts, the weights in use, or the Arabic label strings:
 *   node scripts/subset-fonts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import subsetFont from "subset-font";
import { en } from "../../content/i18n/en.ts";
import suggestions from "../../content/chat/suggestions.json" with { type: "json" };

const DESIGN = new URL("../../design/assets/fonts/", import.meta.url);
const OUT = new URL("../src/assets/fonts/", import.meta.url);

const chars = (ranges) => ranges.flatMap(([a, b = a]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i))).join("");

/** Google Fonts' "latin" subset + arrows, check mark, ≤ ≥, minus. Keep in sync with LATIN in astro.config.mjs. */
export const LATIN = [
  [0x0000, 0x00ff], [0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6], [0x02da], [0x02dc], [0x0304], [0x0308], [0x0329],
  [0x2000, 0x206f], [0x20ac], [0x2122], [0x2190, 0x2199], [0x2212], [0x2215], [0x2264, 0x2265], [0x2713], [0xfeff], [0xfffd],
];
/** The Arabic-language block. Keep in sync with ARABIC in astro.config.mjs. */
export const ARABIC = [[0x0600, 0x065f], [0x066a, 0x066d], [0x0670], [0x200c, 0x200f]];

const jobs = [
  { src: "space-grotesk-latin-wght.woff2", out: "space-grotesk-latin-500-700.woff2", text: chars(LATIN), axes: { wght: { min: 500, max: 700 } } },
  { src: "inter-latin-wght.woff2", out: "inter-latin-400-700.woff2", text: chars(LATIN), axes: { wght: { min: 400, max: 700 } } },
  // Mono: no layout closure (code ligatures such as "->" and their alternates aren't kept; the site's mono text is
  // labels, dates and names, and real arrows are their own characters): 24 KB → 13 KB on every page (audit PERF-07).
  { src: "jetbrains-mono-ascii-wght.woff2", out: "jetbrains-mono-400-700.woff2", text: chars(LATIN), axes: { wght: { min: 400, max: 700 } }, noLayoutClosure: true },
  ...[400, 600, 700].map((w) => ({
    src: `ibm-plex-sans-arabic-${w}.woff2`,
    out: `ibm-plex-sans-arabic-${w}-msa.woff2`,
    // + neutral punctuation and spaces that sit between Arabic words (shaped with the Arabic face)
    text: chars(ARABIC) + " .,:;!?()[]-–—«»\"'/%+·",
  })),
  {
    src: "ibm-plex-sans-arabic-600.woff2",
    out: "ibm-plex-sans-arabic-600-label.woff2",
    text: `${en.language.switchTo}${en.language.otherVersion}${en.hero.ask.otherLanguage}${suggestions.ar[0].label}ع: `,
  },
];

/** Weights the CV sheet uses (src/styles/cv.css): text 400/500/600/700, display 500/600/700, mono 400/500/600/700. */
export const PRINT = [
  ...[400, 500, 600, 700].map((w) => ({ src: "inter-latin-wght.woff2", out: `print/inter-${w}.woff2`, text: chars(LATIN), axes: { wght: w } })),
  ...[500, 600, 700].map((w) => ({ src: "space-grotesk-latin-wght.woff2", out: `print/space-grotesk-${w}.woff2`, text: chars(LATIN), axes: { wght: w } })),
  ...[400, 500, 600, 700].map((w) => ({ src: "jetbrains-mono-ascii-wght.woff2", out: `print/jetbrains-mono-${w}.woff2`, text: chars(LATIN), axes: { wght: w } })),
];
jobs.push(...PRINT);

let before = 0;
let after = 0;
for (const job of jobs) {
  const input = readFileSync(new URL(job.src, DESIGN));
  const buf = await subsetFont(input, job.text, { targetFormat: "woff2", ...(job.axes ? { variationAxes: job.axes } : {}), ...(job.noLayoutClosure ? { noLayoutClosure: true } : {}) });
  writeFileSync(new URL(job.out, OUT), buf);
  before += input.length;
  after += buf.length;
  console.log(`${job.out.padEnd(40)} ${(input.length / 1024).toFixed(1).padStart(6)} KB → ${(buf.length / 1024).toFixed(1).padStart(5)} KB`);
}
console.log(`fonts: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB`);
