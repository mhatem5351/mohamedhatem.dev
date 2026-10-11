/**
 * Build-time cache-buster for the share images: `/og/home-en.png` → `/og/home-en.png?v=<8 hex of its content>`.
 * LinkedIn, WhatsApp and X cache a preview by its image URL, so a new card needs a new URL to be fetched again.
 * Server-only (reads public/og/ at build time); without the file it returns the path unchanged.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cache = new Map<string, string>();

export function versioned(path: string): string {
  let v = cache.get(path);
  if (v === undefined) {
    try {
      v = createHash("sha256").update(readFileSync(join(process.cwd(), "public", path))).digest("hex").slice(0, 8);
    } catch {
      v = "";
    }
    cache.set(path, v);
  }
  return v ? `${path}?v=${v}` : path;
}

/** The extra aspect ratios of the case-study cards (rendered by scripts/postbuild/og-ratios.mjs). */
export const CARD_RATIOS = ["4x3", "1x1"] as const;

/** `…/og/work-x-en.png?v=1a2b3c4d` → `…/og/work-x-en-4x3.jpg?v=1a2b3c4d` (the card's own version: same content). */
export function cardRatio(card: string, ratio: (typeof CARD_RATIOS)[number]): string {
  return card.replace(/\.png(?=\?|$)/, `-${ratio}.jpg`);
}

/**
 * A case study's Article node gets its card in all three ratios Google asks for (16:9, 4:3, 1:1; audit SEO-05) when its
 * image is the page's own case-study card: the 4:3 and 1:1 files are that card, whole, on a taller canvas. Any other
 * node is returned as it is.
 */
export function withCardRatios<T>(node: T, card: string): T {
  const n = node as { "@type"?: unknown; image?: unknown } | null;
  if (!n || typeof n !== "object" || n["@type"] !== "Article" || n.image !== card || !/\/og\/work-[^/]+\.png(\?|$)/.test(card)) return node;
  return { ...node, image: [card, ...CARD_RATIOS.map((r) => cardRatio(card, r))] };
}
