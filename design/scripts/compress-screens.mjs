#!/usr/bin/env node
// Shrinks design/screens/**/*.png in place (palette PNG, visually lossless for UI renders) so the
// public repo stays light. Run after scripts/screenshots.mjs. Needs sharp (devDependency, or SHARP_PATH).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "screens");
const req = createRequire(process.env.SHARP_WORKSPACE ? path.join(process.env.SHARP_WORKSPACE, "package.json") : import.meta.url);
const sharp = req("sharp");
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".png") ? [path.join(d, e.name)] : []);
let before = 0, after = 0;
for (const f of walk(DIR)) {
  const src = fs.readFileSync(f); before += src.length;
  const out = await sharp(src, { limitInputPixels: false }).png({ palette: true, quality: 90, effort: 8, compressionLevel: 9 }).toBuffer();
  const keep = out.length < src.length ? out : src;
  if (keep !== src) fs.writeFileSync(f, keep);
  after += keep.length;
}
console.log(`screens: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
