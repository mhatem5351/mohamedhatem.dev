#!/usr/bin/env node
// Builds the hero graph into bundle/ and prints raw / gzip / brotli sizes.
// (bundle/, not dist/: the repo .gitignore ignores every dist/ and these files are committed.)
//   node build.mjs           -> bundle/hero-graph.js, bundle/hero-graph.render.js, bundle/hero-graph.css,
//                               bundle/hero-graph.{en,ar}.svg, bundle/hero-graph.{en,ar}.html,
//                               and refreshes the server-rendered block inside demo.html
//   node build.mjs --check   -> also type-checks the TypeScript sources (strict)
// esbuild is resolved from the nearest node_modules; set ESBUILD_FROM=/path/to/package.json to borrow
// another project's install (typescript is resolved the same way for --check).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(DIR, "bundle");
const borrow = process.env.ESBUILD_FROM ? createRequire(path.resolve(process.env.ESBUILD_FROM)) : null;

async function load(name) {
  try { return await import(name); } catch (e) {
    if (borrow) return borrow(name);
    throw new Error(`Cannot resolve "${name}". Install it, or set ESBUILD_FROM to a package.json whose node_modules has it.`);
  }
}
const esbuild = await load("esbuild");
fs.mkdirSync(DIST, { recursive: true });

// the lazy "./render" import of the runtime becomes a sibling file in bundle/
const renderExternal = {
  name: "render-external",
  setup(b) { b.onResolve({ filter: /^\.\/render$/ }, () => ({ path: "./hero-graph.render.js", external: true })); },
};
const common = { bundle: true, format: "esm", minify: true, target: "es2020", legalComments: "none", logLevel: "warning" };

await esbuild.build({ ...common, entryPoints: [path.join(DIR, "hero-graph.ts")], outfile: path.join(DIST, "hero-graph.js"), plugins: [renderExternal] });
await esbuild.build({ ...common, entryPoints: [path.join(DIR, "render.ts")], outfile: path.join(DIST, "hero-graph.render.js") });

const css = await esbuild.transform(fs.readFileSync(path.join(DIR, "hero-graph.css"), "utf8"), { loader: "css", minify: true });
fs.writeFileSync(path.join(DIST, "hero-graph.css"), css.code);

// server-side render (same code Astro runs at build time)
const ssr = await esbuild.build({ ...common, minify: false, platform: "node", entryPoints: [path.join(DIR, "render.ts")], write: false });
const R = await import("data:text/javascript;base64," + Buffer.from(ssr.outputFiles[0].text).toString("base64"));
for (const [lang, dir] of [["en", "ltr"], ["ar", "rtl"]]) {
  fs.writeFileSync(path.join(DIST, `hero-graph.${lang}.svg`), R.renderHeroGraphSVG({ dir, lang }) + "\n");
  fs.writeFileSync(path.join(DIST, `hero-graph.${lang}.html`), R.renderHeroGraph({ dir, lang }) + "\n");
}
const demo = path.join(DIR, "demo.html");
if (fs.existsSync(demo)) {
  const src = fs.readFileSync(demo, "utf8");
  const out = src.replace(/(<!-- hg:ssr -->)[\s\S]*?(<!-- \/hg:ssr -->)/, (_, a, b) => `${a}${R.renderHeroGraph({ dir: "ltr", lang: "en" })}${b}`);
  if (out !== src) fs.writeFileSync(demo, out);
}

if (process.argv.includes("--check")) {
  // runs the project's tsc CLI (TypeScript 6 or 7) in strict, no-emit mode over the three sources
  const req = borrow || createRequire(import.meta.url);
  const pkg = req.resolve("typescript/package.json");
  const bin = path.join(path.dirname(pkg), JSON.parse(fs.readFileSync(pkg, "utf8")).bin.tsc);
  const args = ["--noEmit", "--strict", "--noUnusedLocals", "--noUnusedParameters", "--skipLibCheck", "--target", "es2020",
    "--module", "esnext", "--moduleResolution", "bundler", "--lib", "es2020,dom", ...["graph-data.ts", "render.ts", "hero-graph.ts"].map(f => path.join(DIR, f))];
  const { spawnSync } = await import("node:child_process");
  const isJs = /\.(c|m)?js$/.test(bin);
  const r = spawnSync(isJs ? process.execPath : bin, isJs ? [bin, ...args] : args, { encoding: "utf8", cwd: (await import("node:os")).tmpdir() });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  console.log(r.status === 0 ? "typecheck: clean" : "typecheck: FAILED");
  if (r.status !== 0) process.exitCode = 1;
}

const kb = n => (n / 1024).toFixed(2).padStart(6) + " KB";
let gzTotal = 0;
console.log("file                      raw       gzip     brotli");
for (const f of ["hero-graph.js", "hero-graph.css", "hero-graph.render.js", "hero-graph.en.svg", "hero-graph.ar.svg"]) {
  const buf = fs.readFileSync(path.join(DIST, f));
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  const br = zlib.brotliCompressSync(buf).length;
  if (f === "hero-graph.js" || f === "hero-graph.css") gzTotal += gz;
  console.log(`${f.padEnd(22)} ${kb(buf.length)} ${kb(gz)} ${kb(br)}`);
}
console.log(`critical JS + CSS (gzip): ${kb(gzTotal).trim()}  (budget 15 KB, target 7 KB)`);
