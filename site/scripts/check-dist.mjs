#!/usr/bin/env node
/**
 * Static checks on the built site (run after `npm run build`; part of `npm test`).
 *
 *   node scripts/check-dist.mjs                 checks ../dist
 *   node scripts/check-dist.mjs --dist <dir>    checks another build (e.g. a scratch build)
 *
 * Fails (exit 1) on:
 *   secrets          key patterns (AIza…, sk-…, ghp_…, github_pat_…), the names TURNSTILE_SECRET / SESSION_SECRET /
 *                    GEMINI_API_KEY, and the actual secret values from ../.env (compared by containment, never printed)
 *   honesty          the unnamed client (hashed word n-grams, as content/scripts/check-content.mjs), an M.Sc.
 *                    described as held, the Logic Controls owner featured (no Person besides Mohamed in JSON-LD)
 *   CSP              not exactly one CSP <meta> per page; script-src/style-src missing or allowing 'unsafe-inline';
 *                    an inline <script>/<style> whose sha256 isn't listed; any style="" attribute
 *   pages            <html lang/dir> (Arabic under /ar/), <title>, meta description, canonical + hreflang en/ar/
 *                    x-default (not on 404 pages, which must be noindex), og:image file present, JSON-LD parses,
 *                    exactly one <h1>, internal links / src / srcset / #anchors resolve, no insecure http:// URLs
 *   files            _headers, robots.txt, sitemap-index.xml, llms.txt, favicons and manifest are present
 * Warnings (no failure): long titles/descriptions, pages not in the expected list.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cspHash, elements, fileForPath, pageText, parsePolicy, tags, walk, withoutCode } from "./lib/html.mjs";
import { allPages } from "./lib/pages.mjs";

const args = process.argv.slice(2);
const DIST = resolve(args.includes("--dist") ? args[args.indexOf("--dist") + 1] : fileURLToPath(new URL("../../dist", import.meta.url)));
const ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));
const SITE = "https://mohamedhatem.dev";

const errors = [];
const warnings = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

if (!existsSync(DIST)) {
  console.error(`check-dist: ${DIST} does not exist (run the build first)`);
  process.exit(1);
}
const files = walk(DIST);
const fileSet = new Set(files);
const read = (f) => readFileSync(`${DIST}/${f}`, "utf8");

/* ------------------------------------------------------------------ secrets */
const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{20,}/, "Google API key pattern"],
  [/\bsk-[A-Za-z0-9]{20,}/, "sk- key pattern"],
  [/\bghp_[A-Za-z0-9]{20,}/, "GitHub token pattern"],
  [/github_pat_\w{20,}/, "GitHub token pattern"],
  [/\bxox[bp]-[\w-]{10,}/, "Slack token pattern"],
  [/TURNSTILE_SECRET/, "TURNSTILE_SECRET"],
  [/SESSION_SECRET/, "SESSION_SECRET"],
  [/GEMINI_API_KEY/, "GEMINI_API_KEY"],
];
/** Values of the secret keys in ../.env (public tokens excluded). Never printed. */
function secretValues() {
  if (!existsSync(ENV_FILE)) return [];
  const PUBLIC = new Set(["CF_WEB_ANALYTICS_TOKEN", "CF_WEB_ANALYTICS_SITE_TAG", "TURNSTILE_SITE_KEY"]);
  const out = [];
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || PUBLIC.has(m[1]) || m[1].startsWith("PUBLIC_")) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v.length >= 12) out.push([m[1], v]);
  }
  return out;
}
const SECRETS = secretValues();
const TEXT_FILE = /\.(html|js|mjs|css|txt|xml|json|webmanifest|svg|map)$|(^|\/)_headers$/;

/* ------------------------------------------------------------------ honesty */
// Hashes of the unnamed client's names (copied from content/scripts/check-content.mjs; the names are never written).
const FORBIDDEN_SHA256 = new Set([
  "REMOVED",
  "REMOVED",
  "REMOVED",
]);
export function mentionsUnnamedClient(text) {
  const words = text.normalize("NFKC").toLowerCase().replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let i = 0; i < words.length; i++)
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      const gram = words.slice(i, i + n).join(" ");
      if (FORBIDDEN_SHA256.has(createHash("sha256").update(gram).digest("hex"))) return true;
    }
  return false;
}
const HELD_MSC = /\b(hold|holds|holding|has|completed|earned)\s+(an?\s+|his\s+|the\s+)?(m\.?\s?sc|master'?s)\b|حاصل على (درجة )?الماجستير|حصل على (درجة )?الماجستير/i;

for (const f of files) {
  if (!TEXT_FILE.test(f)) continue;
  const text = read(f);
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) fail(f, `possible secret: ${label}`);
  for (const [key, value] of SECRETS) if (text.includes(value)) fail(f, `contains the value of ${key} from .env`);
  const visible = f.endsWith(".html") ? pageText(text) : text;
  if (mentionsUnnamedClient(visible)) fail(f, "names the unnamed client");
  const held = visible.match(HELD_MSC);
  if (held) fail(f, `describes the M.Sc. as held: "${held[0]}"`);
}

/* ------------------------------------------------------------------ required files */
for (const f of ["_headers", "robots.txt", "sitemap-index.xml", "llms.txt", "favicon.ico", "favicon.svg", "apple-touch-icon.png", "site.webmanifest", "404.html"])
  if (!fileSet.has(f)) fail(f, "missing from the build");

if (fileSet.has("_headers")) {
  const h = read("_headers");
  for (const [re, what] of [
    [/frame-ancestors 'none'/, "frame-ancestors 'none'"],
    [/Strict-Transport-Security: max-age=\d{8,}/, "HSTS"],
    [/X-Content-Type-Options: nosniff/, "nosniff"],
    [/Referrer-Policy:/, "Referrer-Policy"],
    [/Permissions-Policy:/, "Permissions-Policy"],
    [/\/_astro\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/, "immutable caching for /_astro/*"],
  ])
    if (!re.test(h)) fail("_headers", `missing ${what}`);
  if (/unsafe-inline/.test(h.replace(/^#.*$/gm, "").replace(/\/\*\.svg[\s\S]*?\n\n/, ""))) fail("_headers", "a page-level policy allows 'unsafe-inline'");
}
if (fileSet.has("robots.txt") && !/Sitemap: https:\/\/mohamedhatem\.dev\/sitemap-index\.xml/.test(read("robots.txt"))) fail("robots.txt", "no Sitemap line");

/* ------------------------------------------------------------------ pages */
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const pagePath = (f) => `/${f.replace(/index\.html$/, "")}`;
const ids = new Map(htmlFiles.map((f) => [f, new Set([...read(f).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
const expected = new Set(await allPages());

let checkedLinks = 0;
for (const f of htmlFiles) {
  const html = read(f);
  const path = pagePath(f);
  const ar = path.startsWith("/ar/");
  const is404 = /(^|\/)404(\.html|\/index\.html)$/.test(f);
  if (!is404 && !expected.has(path)) warn(f, "page is not in the expected page list (scripts/lib/pages.mjs)");

  // <html lang dir>
  const htmlTag = tags(html, "html")[0];
  if (!htmlTag) fail(f, "no <html> tag");
  else {
    const lang = htmlTag.attrs.get("lang");
    const dir = htmlTag.attrs.get("dir");
    if (ar && (lang !== "ar" || dir !== "rtl")) fail(f, `Arabic page has lang="${lang}" dir="${dir}"`);
    if (!ar && (lang !== "en" || dir !== "ltr")) fail(f, `English page has lang="${lang}" dir="${dir}"`);
  }

  // CSP meta
  const metas = tags(html, "meta").filter((t) => t.attrs.get("http-equiv")?.toLowerCase() === "content-security-policy");
  if (metas.length !== 1) fail(f, `${metas.length} CSP <meta> elements (expected 1)`);
  else {
    const policy = parsePolicy(metas[0].attrs.get("content") ?? "");
    const scriptSrc = policy.get("script-src");
    const styleSrc = policy.get("style-src");
    if (!scriptSrc) fail(f, "CSP has no script-src");
    if (!styleSrc) fail(f, "CSP has no style-src");
    if (scriptSrc?.includes("'unsafe-inline'")) fail(f, "script-src allows 'unsafe-inline'");
    if (styleSrc?.includes("'unsafe-inline'")) fail(f, "style-src allows 'unsafe-inline'");
    if (!policy.get("default-src")) fail(f, "CSP has no default-src");
    for (const s of elements(html, "script")) {
      if (s.attrs.has("src") || /json/i.test(s.attrs.get("type") ?? "") || !s.body) continue;
      if (!scriptSrc?.includes(cspHash(s.body))) fail(f, `inline script not in script-src: ${s.body.trim().slice(0, 60)}…`);
    }
    for (const s of elements(html, "style")) if (s.body && !styleSrc?.includes(cspHash(s.body))) fail(f, `inline style not in style-src: ${s.body.trim().slice(0, 60)}…`);
    const metaIndex = html.indexOf(metas[0].raw);
    const firstScript = html.search(/<script\b/i);
    if (firstScript >= 0 && firstScript < metaIndex) fail(f, "a script comes before the CSP <meta>");
  }
  const styleAttr = withoutCode(html).match(/<[a-z][^>]*\sstyle\s*=\s*["'][^"']*/i);
  if (styleAttr) fail(f, `style="" attribute (blocked by the CSP): ${styleAttr[0].slice(0, 100)}`);

  // head metadata
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!title) fail(f, "missing <title>");
  else if ([...title].length > 70) warn(f, `title is ${[...title].length} characters`);
  const metaByName = (name) => tags(html, "meta").find((t) => t.attrs.get("name") === name || t.attrs.get("property") === name)?.attrs.get("content");
  const desc = metaByName("description");
  if (!desc) fail(f, "missing meta description");
  else if ([...desc].length > 160) warn(f, `description is ${[...desc].length} characters`);
  const links = tags(html, "link");
  const canonical = links.find((l) => l.attrs.get("rel") === "canonical")?.attrs.get("href");
  const hreflangs = new Map(links.filter((l) => l.attrs.get("rel") === "alternate" && l.attrs.has("hreflang")).map((l) => [l.attrs.get("hreflang"), l.attrs.get("href")]));
  if (is404) {
    if (!/noindex/.test(metaByName("robots") ?? "")) fail(f, "404 page without noindex");
  } else {
    if (canonical !== `${SITE}${path}`) fail(f, `canonical is ${canonical} (expected ${SITE}${path})`);
    for (const l of ["en", "ar", "x-default"]) if (!hreflangs.has(l)) fail(f, `missing hreflang ${l}`);
    const enPath = ar ? path.slice(3) : path;
    if (hreflangs.get("en") && hreflangs.get("en") !== `${SITE}${enPath}`) fail(f, `hreflang en is ${hreflangs.get("en")}`);
    if (hreflangs.get("ar") && hreflangs.get("ar") !== `${SITE}${enPath === "/" ? "/ar/" : `/ar${enPath}`}`) fail(f, `hreflang ar is ${hreflangs.get("ar")}`);
    if (hreflangs.get("x-default") && hreflangs.get("x-default") !== `${SITE}${enPath}`) fail(f, `hreflang x-default is ${hreflangs.get("x-default")}`);
  }
  const og = metaByName("og:image");
  if (!og) fail(f, "missing og:image");
  else if (!og.startsWith(`${SITE}/`)) fail(f, `og:image is not an absolute site URL: ${og}`);
  else if (!fileSet.has(fileForPath(new URL(og).pathname))) fail(f, `og:image file missing: ${new URL(og).pathname}`);
  if (!metaByName("og:title") || !metaByName("twitter:card")) fail(f, "missing og:title or twitter:card");

  // JSON-LD
  for (const s of elements(html, "script").filter((s) => s.attrs.get("type") === "application/ld+json")) {
    try {
      const data = JSON.parse(s.body);
      const people = JSON.stringify(data).match(/"@type":"Person"[^}]*"name":"([^"]+)"/g) ?? [];
      for (const p of people) if (!/Mohamed Hatem|محمد حاتم/.test(p)) fail(f, `JSON-LD features another person: ${p.slice(0, 80)}`);
    } catch (e) {
      fail(f, `JSON-LD does not parse: ${e.message}`);
    }
  }

  // one <h1>
  const h1 = (withoutCode(html).match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) fail(f, `${h1} <h1> elements (expected 1)`);

  // insecure URLs
  for (const m of withoutCode(html).matchAll(/(?:href|src|action|content)="(http:\/\/[^"]+)"/gi)) fail(f, `insecure URL ${m[1]}`);

  // internal links, sources and anchors
  const refs = [];
  for (const m of withoutCode(html).matchAll(/\s(href|src|action|poster|data-avatar)="([^"]*)"/gi)) refs.push(m[2]);
  for (const m of withoutCode(html).matchAll(/\s(?:srcset|imagesrcset)="([^"]*)"/gi)) for (const part of m[1].split(",")) refs.push(part.trim().split(/\s+/)[0]);
  for (const ref of refs) {
    if (!ref || /^(mailto:|tel:|data:|javascript:|https?:\/\/(?!mohamedhatem\.dev)|\/\/)/i.test(ref)) {
      if (/^javascript:/i.test(ref)) fail(f, `javascript: URL ${ref}`);
      continue;
    }
    let url;
    try {
      url = new URL(ref, `${SITE}${path}`);
    } catch {
      fail(f, `bad URL ${ref}`);
      continue;
    }
    if (url.origin !== SITE || url.pathname.startsWith("/api/")) continue;
    checkedLinks++;
    const target = fileForPath(url.pathname);
    const exists = target && (fileSet.has(target) || fileSet.has(`${target.replace(/\/?$/, "")}/index.html`));
    if (!exists) {
      fail(f, `broken link ${ref}`);
      continue;
    }
    if (url.hash && url.hash.length > 1) {
      const page = fileSet.has(target) ? target : `${target}/index.html`;
      const id = decodeURIComponent(url.hash.slice(1));
      if (page.endsWith(".html") && !ids.get(page)?.has(id)) fail(f, `anchor ${ref} has no target id`);
    }
  }
}

/* ------------------------------------------------------------------ analytics beacon */
// When the repo's .env configures Cloudflare Web Analytics, every page must carry the (cookieless) beacon with it.
const analyticsConfigured =
  !!process.env.CF_WEB_ANALYTICS_TOKEN ||
  (existsSync(ENV_FILE) && /^\s*CF_WEB_ANALYTICS_TOKEN\s*=\s*["']?[a-f0-9]{32}/im.test(readFileSync(ENV_FILE, "utf8")));
if (analyticsConfigured && process.env.MH_DISABLE_ANALYTICS !== "1")
  for (const f of htmlFiles)
    if (!/<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon="\{&quot;token&quot;:&quot;[a-f0-9]{32}&quot;\}"><\/script>/.test(read(f)))
      fail(f, "Cloudflare Web Analytics beacon missing (CF_WEB_ANALYTICS_TOKEN is set)");

/* ------------------------------------------------------------------ report */
for (const w of warnings) console.warn(`  warn  ${w}`);
if (errors.length) {
  console.error(`check-dist: ${new Set(errors).size} problem(s) in ${DIST}`);
  for (const e of [...new Set(errors)]) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-dist: OK (${htmlFiles.length} pages, ${files.length} files, ${checkedLinks} internal links, ${SECRETS.length} secret values checked)`);
