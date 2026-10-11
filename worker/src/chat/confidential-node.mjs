#!/usr/bin/env node
/**
 * Node-only side of the unnamed-client check (the Worker uses confidential.ts): the HMAC key, the shipped list and a
 * matcher, for content/scripts/check-content.mjs, the git hooks, the site's build check and the local chat scripts.
 * Never prints a name or the key.
 *
 *   import { loadConfidential, redactConfidential } from "<repo>/worker/src/chat/confidential-node.mjs";
 *   const conf = loadConfidential({ optional });   // { matcher, containsKey } | { error } | { skipped }
 *
 * CLI (the git hooks in .githooks/ and CI):
 *   node worker/src/chat/confidential-node.mjs check-message <file>   commit-msg: the whole message file
 *   node worker/src/chat/confidential-node.mjs check-push [remote]     pre-push (refs on stdin): ref names, and the
 *                                                                       messages, paths and added lines of every
 *                                                                       commit being pushed
 *   node worker/src/chat/confidential-node.mjs check-tree              every tracked and new file (content and path)
 *                                                                       and the key itself; CI runs it before npm ci,
 *                                                                       so no installed package ever sees the key
 *
 * The key: CONFIDENTIAL_HMAC_KEY from the environment (CI: a repository secret), else from the repo's gitignored .env.
 * Fail closed: a missing, malformed or wrong key is an error, unless `optional` (CI runs without the secret: pull
 * requests from forks and Dependabot), where it is `skipped` and the caller says so.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hasher, KEY_ENV, keyIdOf, Matcher, parseKey, SCHEME } from "./confidential-core.mjs";

export { KEY_ENV };
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const HASHES_PATH = "worker/src/chat/confidential-hashes.json";
/** At least this many canonical hashes, or the list has been weakened. */
export const MIN_CANONICAL = 7;

/** The key as written (environment first, then .env), or null. Never print it. */
export function readKeyText({ root = ROOT, env = process.env } = {}) {
  if (env[KEY_ENV]?.trim()) return env[KEY_ENV];
  const file = join(root, ".env");
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] === KEY_ENV && m[2]) return m[2];
  }
  return null;
}

/** The key's hasher and id, or an error message. */
export function readKey(opts = {}) {
  const text = readKeyText(opts);
  if (!text) return { missing: true, error: `${KEY_ENV} is not set (it lives in the gitignored .env, the Worker's secrets and the CI secret)` };
  const key = parseKey(text);
  if (!key) return { error: `${KEY_ENV} is malformed (expected 64 hex characters, i.e. 32 random bytes)` };
  const hasher = new Hasher(key);
  return { hasher, keyId: keyIdOf(hasher), hex: Array.from(key, (b) => b.toString(16).padStart(2, "0")).join("") };
}

const DIGEST = /^[0-9a-f]{64}$/;

/** The shipped list, checked for shape (not for the key). */
export function readList({ root = ROOT } = {}) {
  let list;
  try {
    list = JSON.parse(readFileSync(join(root, HASHES_PATH), "utf8"));
  } catch (e) {
    return { error: `${HASHES_PATH} can't be read (${e instanceof Error ? e.message : e})` };
  }
  if (list.scheme !== SCHEME) return { error: `${HASHES_PATH} uses scheme "${list.scheme ?? "sha256 (unkeyed)"}", expected "${SCHEME}": regenerate it with node worker/scripts/confidential-hashes.mjs` };
  const arrays = {};
  for (const k of ["canonical", "variants", "starts", "prefixes"]) {
    arrays[k] = Array.isArray(list[k]) ? list[k] : [];
    const bad = arrays[k].find((h) => !DIGEST.test(String(h)));
    if (bad !== undefined) return { error: `${HASHES_PATH}: ${k} has an entry that isn't a 64-hex HMAC-SHA-256 digest` };
  }
  if (arrays.canonical.length < MIN_CANONICAL)
    return { error: `${HASHES_PATH} has ${arrays.canonical.length} canonical hashes (expected at least ${MIN_CANONICAL}): the check would be weakened` };
  if (!arrays.variants.length || !arrays.starts.length || !arrays.prefixes.length) return { error: `${HASHES_PATH} is missing its variants, starts or prefixes` };
  return { list, ...arrays };
}

/**
 * The shipped list with its key: `{ matcher, containsKey }`; `{ error }` when the check can't run (fail closed); or
 * `{ skipped }` when the key is missing and `optional` is set.
 */
export function loadConfidential({ root = ROOT, env = process.env, optional = false, cacheSize = 1 << 16 } = {}) {
  const list = readList({ root });
  if (list.error) return { matcher: null, error: list.error };
  const key = readKey({ root, env });
  if (key.missing && optional) return { matcher: null, skipped: key.error };
  if (key.error) return { matcher: null, error: key.error };
  if (key.keyId !== list.list.keyId)
    return { matcher: null, error: `${KEY_ENV} is not the key ${HASHES_PATH} was generated with (key ids differ): fix the key, or regenerate the list` };
  const matcher = new Matcher({ hasher: key.hasher, names: [...list.canonical, ...list.variants], starts: list.starts, prefixes: list.prefixes, cacheSize });
  const hex = key.hex;
  return { matcher, counts: { canonical: list.canonical.length, variants: list.variants.length }, containsKey: (text) => text.toLowerCase().includes(hex) };
}

/** `text` with every listed name form replaced by `mark` (for saved results that must never hold a name). */
export function redactConfidential(text, matcher, mark = "[redacted]") {
  if (!text || !matcher) return text;
  let out = text;
  for (let i = 0, span = matcher.find(out); span && i < 200; i++, span = matcher.find(out)) out = out.slice(0, span.start) + mark + out.slice(span.end);
  return out;
}

/* ------------------------------------------------------------------ CLI (git hooks) */

function hookMatcher(hook) {
  const conf = loadConfidential({ optional: process.env.CONFIDENTIAL_KEY_OPTIONAL === "1" });
  if (conf.skipped) {
    console.warn(`${hook}: the unnamed-client check was skipped: ${conf.skipped}`);
    return null;
  }
  if (conf.error) {
    console.error(`${hook}: the unnamed-client check can't run: ${conf.error}`);
    process.exit(1);
  }
  return conf.matcher;
}

/** Binary files (not scanned as text; their names are). */
export const BINARY = /\.(png|jpe?g|webp|avif|gif|ico|pdf|woff2?|ttf|otf|zip|gz)$/i;

/**
 * Tracked files plus new ones not yet added (ignored ones such as _inputs/, .env or dist/ excluded): paths whose name
 * or text names the client, or whose text contains the key. Never prints a name or the key; a path that names the
 * client is reported by count only.
 */
export function scanTree(conf, { root = ROOT } = {}) {
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\0")
    .filter(Boolean);
  const problems = [];
  let namedPaths = 0;
  for (const rel of files) {
    const pathNames = conf.matcher.mentions(rel.replace(/[/_.-]+/g, " "));
    if (pathNames) namedPaths++;
    if (BINARY.test(rel)) continue;
    let text;
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue; // deleted in the work tree
    }
    const shown = pathNames ? "(a file whose path names the client)" : rel;
    if (conf.matcher.mentions(text)) problems.push(`${shown} names the unnamed client`);
    if (conf.containsKey(text)) problems.push(`${shown} contains the value of ${KEY_ENV}`);
  }
  if (namedPaths) problems.push(`${namedPaths} file path(s) name the unnamed client`);
  return { files: files.length, problems: [...new Set(problems)] };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "check-message" && arg) {
    // The whole file, comment lines included: git's template lists the branch and the files, and a "#" line can stay.
    const matcher = hookMatcher("commit-msg");
    if (matcher?.mentions(readFileSync(arg, "utf8"))) {
      console.error("commit-msg: the commit message (or the branch or a file name in it) names the unnamed client. Rewrite it (the repository is public).");
      process.exit(1);
    }
  } else if (cmd === "check-tree") {
    const conf = loadConfidential({ optional: process.env.CONFIDENTIAL_KEY_OPTIONAL === "1" });
    if (conf.skipped) {
      const note = `the unnamed-client name check was skipped: ${conf.skipped}`;
      console.warn(process.env.GITHUB_ACTIONS ? `::warning title=Name check skipped::${note}` : `check-tree: ${note}`);
      process.exit(0);
    }
    if (conf.error) {
      console.error(`check-tree: the unnamed-client check can't run: ${conf.error}`);
      process.exit(1);
    }
    const { files, problems } = scanTree(conf);
    if (problems.length) {
      console.error(`check-tree: ${problems.length} problem(s)\n  - ${problems.join("\n  - ")}`);
      process.exit(1);
    }
    console.log(`check-tree: OK (${files} files; ${conf.counts.canonical} canonical + ${conf.counts.variants} variant keyed forms)`);
  } else if (cmd === "check-push") {
    // stdin: "<local ref> <local sha> <remote ref> <remote sha>" per pushed ref (githooks(5)); arg: the remote's name.
    const matcher = hookMatcher("pre-push");
    if (matcher) {
      const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30 });
      const known = (sha) => {
        try {
          git(["cat-file", "-e", `${sha}^{commit}`]);
          return true;
        } catch {
          return false;
        }
      };
      const problems = [];
      for (const line of readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean)) {
        const [localRef = "", localSha = "", remoteRef = "", remoteSha = ""] = line.split(/\s+/);
        // Ref names are never printed: they might be what names the client.
        if (matcher.mentions(`${localRef} ${remoteRef}`.replace(/[/_.-]+/g, " "))) problems.push("a pushed branch or tag name names the unnamed client");
        if (!localSha || /^0+$/.test(localSha)) continue; // deleting a ref
        // The commits this push sends: past what the remote has for this ref, else past everything known on that remote.
        const range = remoteSha && !/^0+$/.test(remoteSha) && known(remoteSha) ? [`${remoteSha}..${localSha}`] : [localSha, "--not", arg ? `--remotes=${arg}` : "--remotes"];
        for (const entry of git(["log", "--format=%H%x00%B%x01", ...range]).split("\x01")) {
          const [sha, body] = entry.trim().split("\x00");
          if (sha && body && matcher.mentions(body)) problems.push(`commit ${sha.slice(0, 10)}: its message names the unnamed client`);
        }
        // Paths and added lines of every pushed commit: a name added and later removed would still be in the history.
        for (const entry of git(["log", "-p", "--no-color", "--no-ext-diff", "--format=%x01%H", ...range]).split("\x01")) {
          const nl = entry.indexOf("\n");
          const sha = entry.slice(0, nl < 0 ? entry.length : nl).trim();
          if (!sha) continue;
          const added = entry
            .split("\n")
            .filter((l) => (l.startsWith("+") && !l.startsWith("+++")) || l.startsWith("diff --git "))
            .map((l) => (l.startsWith("diff --git ") ? l.slice(11).replace(/[/_.-]+/g, " ") : l.slice(1)))
            .join("\n");
          if (matcher.mentions(added)) problems.push(`commit ${sha.slice(0, 10)}: a file it adds or changes (content or path) names the unnamed client`);
        }
      }
      if (problems.length) {
        console.error(`pre-push: blocked (the repository is public):\n  - ${[...new Set(problems)].join("\n  - ")}`);
        process.exit(1);
      }
    }
  } else {
    console.error("usage: node worker/src/chat/confidential-node.mjs check-message <file> | check-push [remote] | check-tree");
    process.exit(2);
  }
}
