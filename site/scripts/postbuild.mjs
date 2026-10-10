#!/usr/bin/env node
/**
 * Runs after `astro build` (npm run build). Each step is a module in scripts/postbuild/ with a default export
 * `async (ctx) => void`, run in this order when present:
 *   relocate-404.mjs  dist/ar/404/index.html → dist/ar/404.html (Workers assets serve the nearest 404.html)
 *   cv-pdf.mjs        renders /cv/ and /ar/cv/ to PDF (public/cv/ + dist/cv/) and copies the EN PDF for the owner
 * ctx: { dist, site } absolute paths.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const site = fileURLToPath(new URL("../", import.meta.url));
const STEPS = ["relocate-404.mjs", "cv-pdf.mjs"];

for (const step of STEPS) {
  const file = fileURLToPath(new URL(`./postbuild/${step}`, import.meta.url));
  if (!existsSync(file)) continue;
  const t0 = Date.now();
  const mod = await import(pathToFileURL(file).href);
  await mod.default({ dist, site });
  console.log(`postbuild: ${step} (${Date.now() - t0} ms)`);
}
