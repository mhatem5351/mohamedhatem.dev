/**
 * Tiny, dependency-free HTML helpers for the static checks (scripts/check-dist.mjs, scripts/check-budgets.mjs).
 * The build output is machine-generated and regular, so attribute-level regexes are reliable here; the checks
 * deliberately use their own parsing and hashing rather than the build integration's, so one bug can't pass both.
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** All files under `dir` (relative paths, forward slashes). */
export function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

/** Attributes of one start tag's attribute string → Map(lowercased name → value; "" for boolean). */
export function attrs(src) {
  const map = new Map();
  for (const m of src.matchAll(/([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    map.set(m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return map;
}

/** Every start tag of `name` in the html: [{ attrs, index, raw }]. */
export function tags(html, name) {
  const re = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, "gi");
  return [...html.matchAll(re)].map((m) => ({ attrs: attrs(m[1]), index: m.index, raw: m[0] }));
}

/** Inline elements of `name` (script/style) with their attributes and body. */
export function elements(html, name) {
  const re = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, "gi");
  return [...html.matchAll(re)].map((m) => ({ attrs: attrs(m[1]), body: m[2], raw: m[0] }));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** HTML with scripts, styles, comments and inline SVG <title>/<desc> intact but no executable/style code. */
export function withoutCode(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

/** Visible-ish text of a page (all text nodes and alt/aria/title/content attribute values). */
export function pageText(html) {
  const code = withoutCode(html);
  const attrText = [...code.matchAll(/\s(?:alt|aria-label|title|content|placeholder|data-question|data-examples)="([^"]*)"/gi)].map((m) => decode(m[1]));
  const text = decode(code.replace(/<[^>]+>/g, " "));
  return `${text}\n${attrText.join("\n")}`.replace(/\s+/g, " ");
}

/** CSP sha256 source for an inline body, normalised like the HTML parser does (CR LF / CR → LF). */
export const cspHash = (body) => `'sha256-${createHash("sha256").update(body.replace(/\r\n?/g, "\n")).digest("base64")}'`;

/** Policy string → Map(directive → sources[]). */
export function parsePolicy(policy) {
  const map = new Map();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

/** dist-relative file for a site path ("/cv/" → "cv/index.html", "/x.png" → "x.png"); null if outside the site. */
export function fileForPath(pathname) {
  let p = decodeURIComponent(pathname.split("#")[0].split("?")[0]);
  if (!p.startsWith("/")) return null;
  if (p.endsWith("/")) p += "index.html";
  return p.slice(1);
}
