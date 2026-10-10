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
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const widget = join(here, "..");
const repo = join(widget, "..");
const outdir = join(widget, "dist");
const BUDGET = { loader: 3 * 1024, total: 18 * 1024 };

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
  metafile: true,
  logLevel: "warning",
});

const rows = Object.keys(result.metafile.outputs)
  .filter((f) => f.endsWith(".js"))
  .map((f) => {
    const buf = readFileSync(join(repo, f));
    return { file: relative(widget, join(repo, f)), raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  });
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const loader = rows.find((r) => r.file.endsWith("index.js"));
const total = rows.reduce((s, r) => s + r.gzip, 0);
for (const r of rows) console.log(`${r.file.padEnd(28)} ${kb(r.raw).padStart(10)} min  ${kb(r.gzip).padStart(9)} gzip`);
console.log(`${"total".padEnd(28)} ${"".padStart(14)} ${kb(total).padStart(9)} gzip  (budget: loader ≤ ${kb(BUDGET.loader)}, total ≤ ${kb(BUDGET.total)})`);

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
