#!/usr/bin/env node
/**
 * 4:3 and 1:1 versions of each case study's sharing card, for the Article JSON-LD (audit SEO-05). Google asks for an
 * Article's image in 16:9, 4:3 and 1:1 and otherwise crops the 1.9:1 card itself, which can cut the title in Discover
 * and on phones. Each version is the whole card, unchanged and at full width (1200 px), on a canvas grown upward and
 * downward with the card's own edge rows (softened so the dot grid doesn't streak): nothing is added, cropped or
 * redrawn, so it stays exactly as truthful as the card. JPEG keeps them at ~70 KB (a PNG of the gradient is ~250 KB).
 *
 *   dist/og/work-<slug>-<locale>.png → dist/og/work-<slug>-<locale>-4x3.jpg (1200 × 900)
 *                                      dist/og/work-<slug>-<locale>-1x1.jpg (1200 × 1200)
 *
 * The URLs carry the card's own ?v= (src/lib/og-version.ts → withCardRatios, used by components/Head.astro), so a new
 * card renames all three for the platforms that cache by URL. Unchanged cards come from a cache keyed by the card's
 * bytes and VERSION (node_modules/.cache/mh-og-ratios/), so a rebuild costs milliseconds.
 *
 *   default export async ({ dist, site })   used by scripts/postbuild.mjs
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** Bump when the rendering below changes, so cached files are made again. */
const VERSION = 1;
export const RATIOS = /** @type {const} */ ([
  ["4x3", 900],
  ["1x1", 1200],
]);
const CARD = /^work-[a-z0-9-]+-(?:en|ar)\.png$/;

/**
 * One version of a card: the card centred on a canvas `height` tall, grown with its own (softened) edge rows.
 * @param {Buffer} card  a 1200 × 630 PNG
 * @param {number} height
 */
export async function ratioVersion(card, height) {
  const { width, height: h } = await sharp(card).metadata();
  if (!width || !h || h > height) throw new Error(`og-ratios: unexpected card size ${width} × ${h}`);
  const top = Math.floor((height - h) / 2);
  const backdrop = await sharp(card).extend({ top, bottom: height - h - top, extendWith: "copy" }).blur(12).toBuffer();
  return sharp(backdrop)
    .composite([{ input: card, top, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

export default async function ogRatios({ dist, site }) {
  const dir = join(dist, "og");
  if (!existsSync(dir)) throw new Error("og-ratios: dist/og is missing (scripts/og.mjs renders the cards before the build)");
  const cache = join(site, "node_modules/.cache/mh-og-ratios");
  mkdirSync(cache, { recursive: true });
  let made = 0;
  let cached = 0;
  for (const name of readdirSync(dir).filter((f) => CARD.test(f))) {
    const card = readFileSync(join(dir, name));
    const key = createHash("sha256").update(card).update(`v${VERSION}`).digest("hex").slice(0, 16);
    for (const [ratio, height] of RATIOS) {
      const out = join(dir, name.replace(/\.png$/, `-${ratio}.jpg`));
      const hit = join(cache, `${key}-${ratio}.jpg`);
      if (existsSync(hit)) {
        copyFileSync(hit, out);
        cached++;
        continue;
      }
      const jpg = await ratioVersion(card, height);
      const meta = await sharp(jpg).metadata();
      if (meta.width !== 1200 || meta.height !== height) throw new Error(`og-ratios: ${out} is ${meta.width} × ${meta.height}`);
      writeFileSync(hit, jpg);
      copyFileSync(hit, out);
      made++;
    }
  }
  console.log(`og-ratios: ${made + cached} card versions in dist/og (${made} rendered, ${cached} from the cache)`);
}
