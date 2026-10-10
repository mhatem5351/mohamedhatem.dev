#!/usr/bin/env node
/**
 * Puts the Arabic 404 page where Cloudflare Workers static assets look for it.
 *
 * With not_found_handling "404-page", a missing path is answered (status 404) with the nearest 404.html walking up
 * from the request: /ar/anything → dist/ar/404.html, everything else → dist/404.html. Astro writes the root page as
 * dist/404.html but, with build.format "directory", the Arabic one as dist/ar/404/index.html; this moves it to
 * dist/ar/404.html and removes the /ar/404/ directory (so /ar/404/ is not a live 200 page). The sitemap never lists
 * either (astro.config.mjs filter); this also checks that.
 *
 *   default export async ({ dist })      used by scripts/postbuild.mjs
 *   node scripts/postbuild/relocate-404.mjs [--dist <dir>]
 */
import { existsSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default async function relocate404({ dist }) {
  const target = join(dist, "ar", "404.html");
  const dirPage = join(dist, "ar", "404", "index.html");
  if (existsSync(dirPage)) {
    renameSync(dirPage, target);
    rmSync(join(dist, "ar", "404"), { recursive: true, force: true });
  }
  if (!existsSync(join(dist, "404.html"))) throw new Error("relocate-404: dist/404.html is missing");
  if (!existsSync(target)) throw new Error("relocate-404: dist/ar/404.html is missing");
  if (!/<html lang="ar" dir="rtl"/.test(readFileSync(target, "utf8"))) throw new Error("relocate-404: dist/ar/404.html is not the Arabic page");
  for (const f of readdirSync(dist).filter((n) => /^sitemap.*\.xml$/.test(n))) {
    if (/\/404\b/.test(readFileSync(join(dist, f), "utf8"))) throw new Error(`relocate-404: ${f} lists a 404 page`);
  }
  console.log("relocate-404: dist/404.html (en), dist/ar/404.html (ar)");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--dist");
  await relocate404({ dist: resolve(i >= 0 ? args[i + 1] : fileURLToPath(new URL("../../../dist", import.meta.url))) });
}
