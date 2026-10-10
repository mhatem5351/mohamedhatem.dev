// @ts-check
/**
 * Completes Astro's CSP <meta> (astro.config.mjs → security.csp) for the static build.
 *
 * Astro hashes the scripts and styles it renders itself, but not `is:inline` scripts (the theme boot script, the
 * analytics config) nor style blocks a component writes with set:html (the trace geometry). After the build this
 * sets each page's `script-src` and `style-src` hashes to exactly the inline elements that page contains, and moves
 * the <meta> right after <meta charset> so it governs everything that follows.
 *
 * Fails the build (closed) when a page has inline code but no CSP <meta>, has more than one, lacks script-src or
 * style-src, would allow 'unsafe-inline', or carries a `style="…"` attribute (which a hash-only style-src blocks).
 * JSON-LD blocks are data, never executed, and need no hash. scripts/check-dist.mjs re-checks the result with its
 * own parser.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const META = /<meta http-equiv="content-security-policy" content="([^"]*)"\s*\/?>/gi;
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const STYLE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const SRC_ATTR = /(?:^|\s)src\s*=/i;
const DATA_TYPE = /(?:^|\s)type\s*=\s*["']?application\/(?:ld\+)?json/i;
const STYLE_ATTR = /<[a-z][^>]*\sstyle\s*=\s*["'][^"']*["']/i;

/** CSP source for a body, hashed as the browser sees it (the parser normalises CR LF / CR to LF). */
const sha = (/** @type {string} */ body) =>
  `'sha256-${createHash("sha256").update(body.replace(/\r\n?/g, "\n")).digest("base64")}'`;

/** Strips <svg>…<template> islands that are not markup (none today) and returns the HTML to scan. */
const scannable = (/** @type {string} */ html) => html.replace(/<!--[\s\S]*?-->/g, "");

/** sha256 sources of the page's executable inline scripts. */
export function inlineScriptHashes(/** @type {string} */ html) {
  const out = new Set();
  for (const [, attrs = "", body = ""] of scannable(html).matchAll(SCRIPT)) {
    if (SRC_ATTR.test(attrs) || DATA_TYPE.test(attrs) || !body) continue;
    out.add(sha(body));
  }
  return out;
}

/** sha256 sources of the page's inline <style> elements (inside inline SVG too). */
export function inlineStyleHashes(/** @type {string} */ html) {
  const out = new Set();
  for (const [, , body] of scannable(html).matchAll(STYLE)) if (body) out.add(sha(body));
  return out;
}

/** The directive list of a policy string: Map(name → sources). */
export function parsePolicy(/** @type {string} */ content) {
  const map = new Map();
  for (const part of content.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

/** Rewrites one page; returns the new HTML (or null when the page has no CSP meta and no inline code). */
export function completePage(/** @type {string} */ html, /** @type {string} */ file) {
  const metas = [...html.matchAll(META)];
  const scripts = inlineScriptHashes(html);
  const styles = inlineStyleHashes(html);
  if (STYLE_ATTR.test(scannable(html).replace(SCRIPT, ""))) {
    const m = scannable(html).replace(SCRIPT, "").match(STYLE_ATTR);
    throw new Error(`csp: ${file} has a style="" attribute (blocked by the hash-only style-src): ${m?.[0].slice(0, 120)}`);
  }
  if (metas.length === 0) {
    if (scripts.size || styles.size) throw new Error(`csp: ${file} has inline code but no CSP <meta>`);
    return null;
  }
  if (metas.length > 1) throw new Error(`csp: ${file} has ${metas.length} CSP <meta> elements (expected one)`);
  const [tag, content] = /** @type {[string, string]} */ ([metas[0]?.[0] ?? "", metas[0]?.[1] ?? ""]);
  const directives = content
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  const set = (/** @type {string} */ name, /** @type {Set<string>} */ hashes) => {
    const at = directives.findIndex((d) => d.toLowerCase() === name || d.toLowerCase().startsWith(`${name} `));
    if (at < 0) throw new Error(`csp: ${file} CSP <meta> has no ${name} directive`);
    const keep = (directives[at] ?? "")
      .split(/\s+/)
      .slice(1)
      .filter((x) => !x.startsWith("'sha"));
    if (keep.includes("'unsafe-inline'")) throw new Error(`csp: ${file} ${name} allows 'unsafe-inline'`);
    directives[at] = [name, ...keep, ...hashes].join(" ");
  };
  set("script-src", scripts);
  set("style-src", styles);
  const meta = `<meta http-equiv="content-security-policy" content="${directives.join("; ")}">`;
  const out = html.replace(tag, "").replace(/<meta charset="utf-8">/i, (c) => c + meta);
  if (!out.includes(meta)) throw new Error(`csp: no <meta charset> in ${file}`);
  // Self-check: every inline element of the final page is listed.
  const policy = parsePolicy([...out.matchAll(META)][0]?.[1] ?? "");
  const listedScripts = new Set(policy.get("script-src") ?? []);
  const listedStyles = new Set(policy.get("style-src") ?? []);
  for (const h of inlineScriptHashes(out)) if (!listedScripts.has(h)) throw new Error(`csp: ${file} script ${h} not listed`);
  for (const h of inlineStyleHashes(out)) if (!listedStyles.has(h)) throw new Error(`csp: ${file} style ${h} not listed`);
  return out;
}

/** @returns {import("astro").AstroIntegration} */
export default function cspHashes() {
  return {
    name: "mh-csp-hashes",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith(".html"));
        let pages = 0;
        let hashes = 0;
        for (const f of files) {
          const path = join(root, f);
          const html = await readFile(path, "utf8");
          const out = completePage(html, f);
          if (out === null) continue;
          hashes += inlineScriptHashes(out).size + inlineStyleHashes(out).size;
          await writeFile(path, out);
          pages++;
        }
        logger.info(`CSP hashes: ${pages} pages, ${hashes} inline scripts/styles hashed`);
      },
    },
  };
}
