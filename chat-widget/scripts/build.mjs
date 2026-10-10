#!/usr/bin/env node
/**
 * Builds the widget for the demo page and the size budget: chat-widget/dist/index.js (the loader) + the lazily
 * imported panel chunk. The Astro site (phase 2) does not need this: it imports chat-widget/src/index.ts directly.
 *
 *   node chat-widget/scripts/build.mjs           build
 *   node chat-widget/scripts/build.mjs --check   build, then fail if over budget (npm run widget:size)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { build } from "esbuild";
import { gzipSync } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const widget = join(here, "..");
const repo = join(widget, "..");
const outdir = join(widget, "dist");
// Gzip is measured with fflate (pure JavaScript), not node:zlib: Node's zlib takes CPU-specific code paths, so the same
// bundle measured 17.97 KB on an arm64 Mac and 18.21 KB on x64 CI. fflate gives the same bytes on every machine and
// reads about 2.5% larger than Node's arm64 zlib. Brotli (what Cloudflare usually serves) is printed for reference.
// The total was 18.5 KB until the Lapis palette added 20 B for its brand colours (the token fallbacks and the default
// launcher; README "Size"), and the mobile round raised it once, by about 1 KB, for the phone-native sheet: CHAT-01
// (fit above the on-screen keyboard), CHAT-03 (Back closes the sheet), CHAT-07 (focus returns to the opener), CHAT-08
// (44 px targets), CHAT-09 (grab bar, swipe to close), plus the hover guards and New chat's Undo.
const BUDGET = { loader: 3 * 1024, total: 19.5 * 1024 };

execFileSync(process.execPath, [join(repo, "worker/scripts/gen-content.mjs"), "--quiet"], { stdio: "inherit" });
rmSync(outdir, { recursive: true, force: true });
const result = await build({
  entryPoints: [join(widget, "src/index.ts")],
  outdir,
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  target: "es2022",
  entryNames: "[name]",
  chunkNames: "[name]-[hash]",
  legalComments: "none",
  // Arabic text as UTF-8, like the site's production build (Vite), not as \uXXXX escapes (esbuild's default), so the
  // size check measures the bytes visitors actually download.
  charset: "utf8",
  metafile: true,
  logLevel: "warning",
});

const rows = Object.keys(result.metafile.outputs)
  .filter((f) => f.endsWith(".js"))
  .map((f) => {
    const buf = readFileSync(join(repo, f));
    const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    return { file: relative(widget, join(repo, f)), raw: buf.length, gzip: gzipSync(buf, { level: 9, mtime: 0 }).length, br };
  });
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const loader = rows.find((r) => r.file.endsWith("index.js"));
const total = rows.reduce((s, r) => s + r.gzip, 0);
const totalBr = rows.reduce((s, r) => s + r.br, 0);
for (const r of rows) console.log(`${r.file.padEnd(28)} ${kb(r.raw).padStart(10)} min  ${kb(r.gzip).padStart(9)} gzip  ${kb(r.br).padStart(9)} br`);
console.log(`${"total".padEnd(28)} ${"".padStart(14)} ${kb(total).padStart(9)} gzip  ${kb(totalBr).padStart(9)} br  (budget, gzip: loader ≤ ${kb(BUDGET.loader)}, total ≤ ${kb(BUDGET.total)})`);

if (process.argv.includes("--check")) {
  const over = [];
  if (!loader || loader.gzip > BUDGET.loader) over.push(`loader ${kb(loader?.gzip ?? 0)} > ${kb(BUDGET.loader)}`);
  if (total > BUDGET.total) over.push(`total ${kb(total)} > ${kb(BUDGET.total)}`);
  if (over.length) {
    console.error(`Over budget: ${over.join(", ")}`);
    process.exit(1);
  }
  console.log("Within budget.");
}
