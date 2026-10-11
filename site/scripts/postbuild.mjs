#!/usr/bin/env node
/**
 * Runs after `astro build` (npm run build). Each step is a module in scripts/postbuild/ with a default export
 * `async (ctx) => void`, run in this order when present:
 *   relocate-404.mjs  dist/ar/404/index.html → dist/ar/404.html (Workers assets serve the nearest 404.html)
 *   redirects.mjs     dist/_redirects: 301s for slash-less and index.html URLs and the /work/ parents
 *   early-hints.mjs   per-page rules appended to dist/_headers: Link preloads (CSS + preloaded fonts) and the
 *                     Content-Security-Policy-Report-Only mirror of the page's <meta> policy
 *   og-ratios.mjs     4:3 and 1:1 versions of the case-study sharing cards (Article JSON-LD images)
 *   cv-pdf.mjs        renders /cv/ and /ar/cv/ to PDF (public/cv/ + dist/cv/) and copies the EN PDF for the owner
 * ctx: { dist, site } absolute paths.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const site = fileURLToPath(new URL("../", import.meta.url));
const STEPS = ["relocate-404.mjs", "redirects.mjs", "early-hints.mjs", "og-ratios.mjs", "cv-pdf.mjs"];

for (const step of STEPS) {
  const file = fileURLToPath(new URL(`./postbuild/${step}`, import.meta.url));
  if (!existsSync(file)) continue;
  const t0 = Date.now();
  const mod = await import(pathToFileURL(file).href);
  await mod.default({ dist, site });
  console.log(`postbuild: ${step} (${Date.now() - t0} ms)`);
}
