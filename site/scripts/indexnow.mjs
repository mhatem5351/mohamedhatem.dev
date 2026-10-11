#!/usr/bin/env node
/**
 * Tells IndexNow (Bing, Yandex, Naver, Seznam…; free, no account) which URLs changed. Run after a deploy, from the
 * repo root:
 *   npm run indexnow                  submit the URLs whose sitemap <lastmod> changed since the last submission, plus
 *                                     new and removed ones (IndexNow is for added, updated or deleted URLs)
 *   npm run indexnow -- --dry-run     list them; no request, no file written
 *   npm run indexnow -- --all         submit every sitemap URL (a deliberate full resubmit)
 *
 * The key is public by design: the one site/public/<32 hex>.txt file, served at https://mohamedhatem.dev/<key>.txt
 * and holding exactly the key (check-dist.mjs checks both). Before submitting, the live key file must answer with the
 * key and the live sitemap must equal dist/'s: the engines would otherwise crawl pages that aren't deployed yet.
 * The last accepted submission is recorded in site/scripts/indexnow-state.json (sitemap path → the <lastmod>
 * submitted), written only after IndexNow accepted the list: commit it. Without that file every URL is submitted.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOST = "mohamedhatem.dev";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));
const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
export const STATE_FILE = fileURLToPath(new URL("./indexnow-state.json", import.meta.url));

/** <loc> → <lastmod> ("" when absent) of every sitemap-N.xml text, keyed by path. */
export function sitemapDates(/** @type {string[]} */ xmls) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const xml of xmls)
    for (const [, body = ""] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(body)?.[1];
      if (loc) out[new URL(loc).pathname] = /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1] ?? "";
    }
  return out;
}

/**
 * The paths to submit: new or re-dated pages and pages gone since the last submission (all of them without a record).
 * @param {Record<string, string>} current path → lastmod now
 * @param {Record<string, string> | undefined} submitted path → lastmod at the last accepted submission
 * @param {{ all?: boolean }} [opts]
 */
export function toSubmit(current, submitted, { all = false } = {}) {
  if (all || !submitted) return { paths: Object.keys(current).sort(), added: [], changed: [], removed: [], full: true };
  const added = Object.keys(current).filter((p) => !(p in submitted));
  const changed = Object.keys(current).filter((p) => p in submitted && submitted[p] !== current[p]);
  const removed = Object.keys(submitted).filter((p) => !(p in current));
  return { paths: [...added, ...changed, ...removed].sort(), added, changed, removed, full: false };
}

/** The state file's text: paths sorted, 2-space indent, trailing newline. */
export const serializeState = (/** @type {Record<string, string>} */ map) =>
  `${JSON.stringify(
    Object.fromEntries(
      Object.keys(map)
        .sort()
        .map((p) => [p, map[p]]),
    ),
    null,
    2,
  )}\n`;

/** The IndexNow key: the name of the one <32 hex>.txt file in a directory, which must hold exactly that key. */
export function readKey(/** @type {string} */ dir) {
  const files = readdirSync(dir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (files.length !== 1) throw new Error(`expected one <32 hex>.txt key file in ${dir}, found ${files.length}`);
  const key = files[0].slice(0, -4);
  if (readFileSync(`${dir}/${files[0]}`, "utf8") !== key) throw new Error(`${files[0]} must contain exactly its own name`);
  return key;
}

/** The request body IndexNow expects (https://www.indexnow.org/documentation). */
export const payload = (/** @type {string} */ key, /** @type {string[]} */ paths) => ({
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${key}.txt`,
  urlList: paths.map((p) => `https://${HOST}${p}`),
});

async function main(/** @type {string[]} */ args) {
  const dryRun = args.includes("--dry-run");
  const files = existsSync(DIST)
    ? readdirSync(DIST)
        .filter((f) => /^sitemap-\d+\.xml$/.test(f))
        .sort()
    : [];
  if (!files.length) throw new Error("dist/ has no sitemap: build (and deploy) first");
  const xmls = files.map((f) => readFileSync(`${DIST}${f}`, "utf8"));
  const current = sitemapDates(xmls);
  const submitted = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : undefined;
  const plan = toSubmit(current, submitted, { all: args.includes("--all") });
  if (plan.full) console.log(`IndexNow: ${submitted ? "--all" : "no indexnow-state.json yet"}: all ${plan.paths.length} sitemap URLs`);
  else console.log(`IndexNow: ${plan.added.length} new, ${plan.changed.length} re-dated, ${plan.removed.length} removed since the last submission`);
  for (const p of plan.paths) console.log(`  ${p}`);
  if (!plan.paths.length || dryRun) return 0;

  const key = readKey(PUBLIC);
  const live = await fetch(`https://${HOST}/${key}.txt`, { cache: "no-store" });
  if (!live.ok || (await live.text()).trim() !== key) throw new Error(`https://${HOST}/${key}.txt doesn't serve the key yet: deploy first`);
  for (const [i, f] of files.entries()) {
    const sitemap = await fetch(`https://${HOST}/${f}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""));
    if (sitemap !== xmls[i]) throw new Error(`the live /${f} differs from dist/${f}: deploy first, then submit`);
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload(key, plan.paths)),
  });
  // 200: accepted and the key is verified; 202: accepted, key validation pending (first use of a key). Both count.
  console.log(`IndexNow: submitted ${plan.paths.length} URLs → HTTP ${res.status} ${res.statusText}`);
  if (!res.ok) {
    console.log(await res.text());
    return 1;
  }
  writeFileSync(STATE_FILE, serializeState(current));
  console.log("  recorded in site/scripts/indexnow-state.json: commit it");
  return 0;
}

// Only as the entry point (tests/unit/indexnow.test.ts imports the helpers).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`IndexNow: ${e.message}`);
      process.exitCode = 1;
    },
  );
}
