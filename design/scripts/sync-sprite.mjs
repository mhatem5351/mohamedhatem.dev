#!/usr/bin/env node
// Inlines the icon sprite into every prototype between <!--sprite:start--> and <!--sprite:end-->,
// so each prototype stays self-contained (no external <use> fetches, works from file:// too).
// Source: assets/icons/sprite.svg when present (the shipped icon set), else scripts/sprite-fallback.svg.
//   node design/scripts/sync-sprite.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shipped = path.join(DIR, "assets/icons/sprite.svg");
const fallback = path.join(DIR, "scripts/sprite-fallback.svg");
const clean = f => fs.readFileSync(f, "utf8").replace(/<\?xml[^>]*>\s*/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
let sprite = clean(fs.existsSync(shipped) ? shipped : fallback);
// merge: any fallback symbol whose id the shipped set lacks is appended (keeps prototypes working while names converge)
if (fs.existsSync(shipped)) {
  const have = new Set([...sprite.matchAll(/<symbol[^>]*\bid="([^"]+)"/g)].map(m => m[1]));
  const missing = [...clean(fallback).matchAll(/<symbol[^>]*\bid="([^"]+)"[\s\S]*?<\/symbol>/g)].filter(m => !have.has(m[1]));
  if (missing.length) {
    sprite = sprite.replace(/<\/svg>\s*$/, missing.map(m => m[0]).join("") + "</svg>");
    console.log("fallback symbols used: " + missing.map(m => m[1]).join(", "));
  }
}
// make it an invisible inline sprite
sprite = sprite.replace(/<svg\b[^>]*>/, '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">');

const extra = process.argv.slice(2); // optional extra symbols file(s) appended (page-specific)
for (const f of extra) sprite = sprite.replace(/<\/svg>\s*$/, fs.readFileSync(f, "utf8").replace(/<\/?svg[^>]*>/g, "") + "</svg>");

const files = fs.readdirSync(path.join(DIR, "prototypes")).filter(f => f.endsWith(".html"));
let n = 0;
for (const f of files) {
  const p = path.join(DIR, "prototypes", f);
  const html = fs.readFileSync(p, "utf8");
  if (!html.includes("<!--sprite:start-->")) continue;
  const out = html.replace(/<!--sprite:start-->[\s\S]*?<!--sprite:end-->/, `<!--sprite:start-->${sprite}<!--sprite:end-->`);
  if (out !== html) { fs.writeFileSync(p, out); n++; }
}
console.log(`sprite synced into ${n} prototype(s) from ${path.relative(DIR, fs.existsSync(shipped) ? shipped : fallback)}`);
