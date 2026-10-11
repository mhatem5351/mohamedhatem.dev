#!/usr/bin/env node
/**
 * Regenerates worker/src/chat/confidential-hashes.json: keyed hashes (HMAC-SHA-256 with CONFIDENTIAL_HMAC_KEY) of the
 * normalised forms of the unnamed client's names, read by the Worker's output guard and by every repository check
 * (all through worker/src/chat/confidential-core.mjs). Never prints a name or the key.
 *
 *   canonical  the forms the repository-wide check started with; never shrinks below 7. Carried over from the current
 *              file: a phrase of the names file is canonical when its form is already canonical there (by its keyed
 *              hash; for the one-time migration from the old unkeyed list, by its plain SHA-256)
 *   variants   every other generated form (confidential-core.mjs → phraseForms): spaced and joined, reversed, l read as
 *              i, Arabic prefixes
 *   starts     first words of the multi-word forms; prefixes: first three letters of the space-free forms (domain-
 *              separated). Both are run-time prefilters, keyed like everything else
 *   keyId      public fingerprint of the key, so a wrong key fails loudly instead of matching nothing
 *
 * Input: the gitignored _inputs/forbidden-names.txt (KEY=phrase lines; phrases of more than 3 words are eval
 * placeholders only and are not hashed). The key: CONFIDENTIAL_HMAC_KEY from the environment, else from .env.
 * Rotating the key: run once with the old key in CONFIDENTIAL_HMAC_KEY_PREVIOUS, so `canonical` carries over.
 *
 *   node worker/scripts/confidential-hashes.mjs           write the file
 *   node worker/scripts/confidential-hashes.mjs --check   exit 1 if the file is out of date (needs the names file)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Hasher, hashForms, keyIdOf, parseKey, phraseForms, SCHEME } from "../src/chat/confidential-core.mjs";
import { HASHES_PATH, KEY_ENV, MIN_CANONICAL, readKey, ROOT } from "../src/chat/confidential-node.mjs";

const namesFile = join(ROOT, "_inputs", "forbidden-names.txt");
const outFile = join(ROOT, HASHES_PATH);
const check = process.argv.includes("--check");
const die = (msg) => {
  console.error(`confidential-hashes: ${msg}`);
  process.exit(1);
};

if (!existsSync(namesFile)) {
  console.error("confidential-hashes: _inputs/forbidden-names.txt not found (local only, never committed); nothing to do.");
  process.exit(check ? 0 : 1);
}
const key = readKey();
if (key.error) die(key.error);

const phrases = readFileSync(namesFile, "utf8")
  .split(/\r?\n/)
  .map((l) => /^\s*[A-Z][A-Z0-9_]*\s*=\s*(.+?)\s*$/.exec(l)?.[1])
  .filter(Boolean);

// The current file decides which phrases are canonical.
const previous = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
const previousCanonical = new Set(Array.isArray(previous.canonical) ? previous.canonical : []);
if (previousCanonical.size < MIN_CANONICAL) die(`${HASHES_PATH} has ${previousCanonical.size} canonical hashes (expected at least ${MIN_CANONICAL}); refusing to write.`);

/** How a phrase's canonical form was hashed in the current file. */
let previousDigest;
if (previous.scheme === undefined) {
  // One-time migration from the unkeyed list: its normalisation (NFKC, lower case, marks removed), as written or folded.
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const words = (t) => t.normalize("NFKC").toLowerCase().replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const fold = (w) => w.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "");
  previousDigest = (phrase) => [sha(words(phrase).join(" ")), sha(words(phrase).map(fold).join(" "))];
} else if (previous.scheme === SCHEME) {
  const previousKeyText = process.env[`${KEY_ENV}_PREVIOUS`];
  const hasher = previousKeyText ? new Hasher(parseKey(previousKeyText) ?? die(`${KEY_ENV}_PREVIOUS is malformed`)) : key.hasher;
  if (keyIdOf(hasher) !== previous.keyId)
    die(`${HASHES_PATH} was made with another key. Rotating? Run once with the old key in ${KEY_ENV}_PREVIOUS so its canonical hashes carry over.`);
  previousDigest = (phrase) => {
    const forms = phraseForms(phrase);
    return forms ? [hasher.hex(forms.base)] : [];
  };
} else die(`${HASHES_PATH} uses an unknown scheme "${previous.scheme}"`);

const canonical = new Set();
const names = new Set();
const starts = new Set();
const prefixes = new Set();
const matched = new Set();
for (const phrase of phrases) {
  const forms = phraseForms(phrase);
  if (!forms) continue;
  const hashed = hashForms(key.hasher, forms);
  for (const h of hashed.names) names.add(h);
  for (const h of hashed.starts) starts.add(h);
  for (const h of hashed.prefixes) prefixes.add(h);
  const was = previousDigest(phrase).filter((h) => previousCanonical.has(h));
  if (was.length) {
    for (const h of was) matched.add(h);
    canonical.add(key.hasher.hex(forms.base));
  }
}

const unmatched = [...previousCanonical].filter((h) => !matched.has(h));
if (unmatched.length) {
  // A canonical form missing from the names file: with the same key it is kept as is; otherwise it would be lost.
  if (previous.scheme === SCHEME && !process.env[`${KEY_ENV}_PREVIOUS`]) for (const h of unmatched) canonical.add(h);
  else die(`${unmatched.length} canonical hash(es) have no phrase in _inputs/forbidden-names.txt, so they can't be re-keyed; refusing to drop them.`);
}
if (canonical.size < MIN_CANONICAL) die(`only ${canonical.size} canonical hashes would be written (expected at least ${MIN_CANONICAL}); refusing to write.`);

const sorted = (set, without = new Set()) => [...set].filter((h) => !without.has(h)).sort();
const json =
  JSON.stringify(
    {
      about:
        "Keyed hashes (HMAC-SHA-256; the key is never in git) of the normalised forms of the unnamed client's names, never the names. " +
        "canonical = the forms the repository-wide check started with; variants = the other forms; starts and prefixes = run-time prefilters. " +
        "Generated by worker/scripts/confidential-hashes.mjs from a gitignored file; read through worker/src/chat/confidential-core.mjs " +
        "by the Worker's output guard, content/scripts/check-content.mjs, the git hooks and the site's build check.",
      scheme: SCHEME,
      keyId: key.keyId,
      canonical: sorted(canonical),
      variants: sorted(names, canonical),
      starts: sorted(starts),
      prefixes: sorted(prefixes),
    },
    null,
    1,
  ) + "\n";

const counts = `${canonical.size} canonical + ${names.size - [...canonical].filter((h) => names.has(h)).length} variants, ${starts.size} starts, ${prefixes.size} prefixes`;
if (check) {
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== json) die(`${HASHES_PATH} is out of date; run node worker/scripts/confidential-hashes.mjs`);
  console.log(`confidential-hashes: up to date (${counts})`);
} else {
  writeFileSync(outFile, json);
  console.log(`confidential-hashes: wrote ${counts}`);
}
