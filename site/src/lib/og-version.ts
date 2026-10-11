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
