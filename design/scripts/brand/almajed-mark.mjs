#!/usr/bin/env node
// Al Majed Oud tile mark: a typographic monogram «م» in the product's gold-on-warm-ink style (the chat product's own
// favicon and login crest: a gold «م» on a dark disc), outlined from the site's IBM Plex Sans Arabic 700 so the tile
// needs no font at build time. Not the company's official logo, which this repository does not have.
//
//   BRAND_NODE_MODULES=site:<dir with fontkit> node design/scripts/brand/almajed-mark.mjs
//
// Output: design/assets/logos/brand/src/almajed-mark.svg (then brand-logos.mjs builds the almajed tiles from it).
import fs from "node:fs";
import path from "node:path";
import { initFonts, outline, LOGOS } from "./lib.mjs";

await initFonts(["ar700"]);
const o = outline("م", { font: "ar700", size: 100, direction: "rtl", script: "arab" });
const { x0, y0, x1, y1 } = o.bbox;
const pad = 2;
const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map((n) => Math.round(n * 100) / 100);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2]}" height="${vb[3]}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4B977"/><stop offset="1" stop-color="#B08443"/></linearGradient></defs>
<path fill="url(#g)" d="${o.d}"/>
</svg>
`;
const out = path.join(LOGOS, "brand/src/almajed-mark.svg");
fs.writeFileSync(out, svg);
console.log(`wrote ${path.relative(process.cwd(), out)} (${vb[2]} x ${vb[3]})`);
