#!/usr/bin/env node
/**
 * Keeps the previous deploy's hashed assets (dist/_astro) online for one more deploy (audit R7-RES-04; the same
 * approach as the logic-controls.com deploy).
 *
 * Every build renames its /_astro files (content hashes) and `wrangler deploy` uploads only the new build, so a page
 * loaded before a deploy asks for files that no longer exist: its lazy chunks (the chat panel, the zoom dialog), CSS
 * and images answer 404, and the /_astro/* rule in _headers even caches that 404 as immutable. Right after a deploy the
 * edge can also serve the previous HTML for a few seconds. Carrying the last deployed build's files into this deploy
 * fixes both for anything up to one deploy old. Hashed names never collide, so serving both sets is safe, and
 * Cloudflare skips files it already holds, so nothing is uploaded twice. Only one previous build is kept: ~215 files
 * and ~15 MB today, far inside Workers Free's 20,000 files per version and 25 MiB per file (checked below).
 *
 *   node site/scripts/keep-previous-assets.mjs          before `wrangler deploy`, after every dist check: copy the
 *                                                       last deployed build's files that dist/_astro lacks into it,
 *                                                       then check that the live home pages' /_astro files are all
 *                                                       in dist (fails if not, see below)
 *   node site/scripts/keep-previous-assets.mjs --save   after a successful deploy: remember THIS build's own files
 *                                                       (not the carried ones) for the next deploy
 *   node site/scripts/keep-previous-assets.mjs --seed <dist>
 *                                                       once, when no state exists yet: remember <dist>/_astro as the
 *                                                       deployed build (e.g. the main checkout's dist/ before it is
 *                                                       rebuilt, or a build of the deployed commit: builds are
 *                                                       deterministic)
 * Options: --live <origin> (default https://mohamedhatem.dev), --no-live-check or NO_LIVE_CHECK=1 (offline),
 * --dist <dir> (default dist/), --state <dir> (default .wrangler/deploy-prev).
 *
 * State lives in .wrangler/deploy-prev/ (gitignored with the rest of .wrangler/): _astro/ holds the last deployed
 * build's files, current.json this build's own file list and fingerprint, written by the first step for --save (a
 * re-run after a failed upload keeps the original list instead of counting the carried files as this build's).
 *
 * The live check fetches / and /ar/ from production (two requests) and fails the step when an /_astro file they use
 * would not be in the upload, i.e. open tabs would break: the state was lost or was never seeded. A network error only
 * warns. To deploy anyway: NO_LIVE_CHECK=1 npm run deploy:worker.
 */
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const DIST = resolve(ROOT, opt("--dist") ?? "dist");
const ASSETS = join(DIST, "_astro");
const STATE = resolve(ROOT, opt("--state") ?? ".wrangler/deploy-prev");
const PREV = join(STATE, "_astro");
const OWN = join(STATE, "current.json");
const LIVE = (opt("--live") ?? "https://mohamedhatem.dev").replace(/\/+$/, "");
/** Workers Free static assets: files per version, bytes per file. */
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Files under dir, relative, forward slashes. */
export function filesIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1).split("\\").join("/"));
}

/** The build's identity: its home page (which names the build's own assets; carried files never change it). */
const fingerprint = (dist) => createHash("sha256").update(readFileSync(join(dist, "index.html"))).digest("hex").slice(0, 16);

/** /_astro/… paths an HTML page uses (href, src, srcset, preload). */
export function astroRefs(html) {
  return [...new Set([...html.matchAll(/\/_astro\/[^"'\s),>]+/g)].map((m) => m[0].slice("/_astro/".length)))];
}

function remember(fromDir, own) {
  rmSync(PREV, { recursive: true, force: true });
  for (const f of own) {
    mkdirSync(dirname(join(PREV, f)), { recursive: true });
    copyFileSync(join(fromDir, f), join(PREV, f));
  }
}

async function liveCheck() {
  if (args.includes("--no-live-check") || process.env.NO_LIVE_CHECK === "1") return console.log("keep-previous-assets: live check skipped");
  const have = new Set(filesIn(ASSETS));
  const missing = new Set();
  for (const path of ["/", "/ar/"]) {
    let html;
    try {
      const res = await fetch(`${LIVE}${path}`, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "mohamedhatem.dev deploy (keep-previous-assets)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (e) {
      console.warn(`keep-previous-assets: WARNING, couldn't fetch ${LIVE}${path} (${e instanceof Error ? e.message : e}); live check skipped`);
      return;
    }
    for (const f of astroRefs(html)) if (!have.has(f)) missing.add(f);
  }
  if (missing.size) {
    console.error(
      `keep-previous-assets: ${missing.size} /_astro file(s) the live pages use would be gone after this deploy (open tabs break):\n` +
        [...missing].slice(0, 8).map((f) => `  /_astro/${f}`).join("\n") +
        `\nThe last deployed build isn't in ${STATE}. Seed it once from a dist/ of the deployed commit:\n` +
        `  node site/scripts/keep-previous-assets.mjs --seed <that dist>   then deploy again (or NO_LIVE_CHECK=1 to deploy anyway)`,
    );
    process.exit(1);
  }
  console.log(`keep-previous-assets: the live home pages' /_astro files are all in this upload`);
}

async function main() {
  mkdirSync(STATE, { recursive: true });
  if (args.includes("--seed")) {
    const dir = join(resolve(opt("--seed") ?? ""), "_astro");
    if (!existsSync(dir)) throw new Error(`keep-previous-assets: ${dir} is missing`);
    const own = filesIn(dir);
    remember(dir, own);
    rmSync(OWN, { force: true });
    console.log(`keep-previous-assets: seeded ${own.length} files from ${dir} as the deployed build`);
    return;
  }
  if (!existsSync(ASSETS)) throw new Error(`keep-previous-assets: ${ASSETS} is missing: build first`);
  if (args.includes("--save")) {
    let own = filesIn(ASSETS);
    if (existsSync(OWN)) {
      const state = JSON.parse(readFileSync(OWN, "utf8"));
      if (state.build === fingerprint(DIST)) own = state.own;
      else console.warn("keep-previous-assets: current.json belongs to another build; remembering every file in dist/_astro");
    }
    remember(ASSETS, own);
    rmSync(OWN, { force: true });
    console.log(`keep-previous-assets: remembered ${own.length} files of this deploy for the next one`);
    return;
  }
  const build = fingerprint(DIST);
  const state = existsSync(OWN) ? JSON.parse(readFileSync(OWN, "utf8")) : null;
  // Same build again (a re-run after a failed upload): keep the first run's list, from before anything was carried in.
  const own = state?.build === build ? state.own : filesIn(ASSETS);
  writeFileSync(OWN, JSON.stringify({ build, own }));
  if (!existsSync(PREV)) console.warn(`keep-previous-assets: WARNING, no previous build in ${STATE}: nothing to carry`);
  const have = new Set(filesIn(ASSETS));
  const carried = filesIn(PREV).filter((f) => !have.has(f));
  for (const f of carried) cpSync(join(PREV, f), join(ASSETS, f));
  console.log(`keep-previous-assets: ${carried.length} files of the previous deploy kept online for one more deploy`);

  const all = filesIn(DIST);
  if (all.length > MAX_FILES) throw new Error(`keep-previous-assets: ${all.length} files in dist (Workers allow ${MAX_FILES} per version)`);
  for (const f of all) if (statSync(join(DIST, f)).size > MAX_FILE_BYTES) throw new Error(`keep-previous-assets: ${f} is over 25 MiB (the Workers limit per file)`);
  await liveCheck();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
