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
 *   honesty          the unnamed client (hashed word n-grams, as content/scripts/check-content.mjs) in every text
 *                    file (HTML: the visible copy and the raw file, JSON-LD and scripts included) and in the CV PDFs'
 *                    text layer (both reading orders of the Arabic), an M.Sc. described as held, the Logic Controls
 *                    owner featured (no Person besides Mohamed in JSON-LD)
 *   CSP              not exactly one CSP <meta> per page; script-src/style-src missing or allowing 'unsafe-inline';
 *                    an inline <script>/<style> whose sha256 isn't listed; any style="" attribute; a page without its
 *                    Content-Security-Policy-Report-Only mirror in _headers (same fetch directives, reported to the
 *                    Worker); _headers over the Workers limits (100 rules, 2,000 characters a line)
 *   pages            <html lang/dir> (Arabic under /ar/), <title>, meta description, canonical + hreflang en/ar/
 *                    x-default (not on 404 pages, which must be noindex), og:image file present, JSON-LD parses,
 *                    exactly one <h1>, internal links / src / srcset / #anchors resolve, no insecure http:// URLs
 *   files            _headers, _redirects, robots.txt, sitemap-index.xml, llms.txt, favicons and manifests are present;
 *                    _redirects has a 301 for every page's slash-less URL, for /work/ and for the guessed URLs, and
 *                    every target exists; text files declare UTF-8; every sitemap URL has a <lastmod> date;
 *                    .well-known/security.txt (RFC 9116) has a Contact and an Expires at least 30 days away, and a
 *                    Policy pointing at the repository's SECURITY.md, which gives the same contact; the
 *                    IndexNow key file holds its own name; _headers reports CSP violations and sends CORP on /_astro/*
 *   robots meta      indexable pages allow large image previews (max-image-preview:large), 404 pages are noindex
 *   vCard            mohamed-hatem.vcf parses as a vCard 3.0 (BEGIN/END, VERSION, N, FN; CRLF, lines <= 75 octets, a
 *                    JPEG PHOTO) and _headers serves it as text/vcard
 *   manifests        site.webmanifest (en) and ar.webmanifest (ar): parse, lang/dir/start_url, one id and scope, icons
 *                    and shortcut targets exist; every page links its language's manifest and an
 *                    apple-mobile-web-app-title equal to that manifest's short_name
 *   structured data  one Person and one WebSite description on every page (same @id, same content); a WebSite node
 *                    wherever #website is referenced; Articles with full ISO datePublished / dateModified and their
 *                    card in 16:9, 4:3 and 1:1 (files present);
 *                    codeRepository only on SoftwareSourceCode; og:image:alt describes each page's own card
 * Warnings (no failure): long titles/descriptions, pages not in the expected list.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cspHash, elements, fileForPath, pageText, parsePolicy, tags, walk, withoutCode } from "./lib/html.mjs";
import { allPages } from "./lib/pages.mjs";
import { pdfPagesText } from "./lib/pdf-text.mjs";
import { rtlRunsText } from "./lib/pdf-rtl-text.mjs";
import { loadConfidential } from "../../worker/src/chat/confidential-node.mjs";

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
const TEXT_FILE = /\.(html|js|mjs|css|txt|xml|json|webmanifest|vcf|svg|map)$|(^|\/)_headers$/;

/* ------------------------------------------------------------------ honesty */
// The unnamed client's names: the repository's one keyed list and matcher (worker/src/chat/confidential-node.mjs, shared
// with content/scripts/check-content.mjs and the Worker's output guard); the names are never written. Fail closed: a
// missing or wrong CONFIDENTIAL_HMAC_KEY (environment or ../.env) is an error, unless CONFIDENTIAL_KEY_OPTIONAL=1.
const CONFIDENTIAL = loadConfidential({ optional: process.env.CONFIDENTIAL_KEY_OPTIONAL === "1" });
if (CONFIDENTIAL.error) fail("confidential-hashes.json", `the unnamed-client check can't run: ${CONFIDENTIAL.error}`);
if (CONFIDENTIAL.skipped) warn("confidential-hashes.json", `the unnamed-client check was skipped: ${CONFIDENTIAL.skipped}`);
export function mentionsUnnamedClient(text) {
  return CONFIDENTIAL.matcher?.mentions(text) ?? false;
}
const HELD_MSC = /\b(hold|holds|holding|has|completed|earned)\s+(an?\s+|his\s+|the\s+)?(m\.?\s?sc|master'?s)\b|حاصل على (درجة )?الماجستير|حصل على (درجة )?الماجستير/i;

for (const f of files) {
  if (!TEXT_FILE.test(f)) continue;
  const text = read(f);
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) fail(f, `possible secret: ${label}`);
  for (const [key, value] of SECRETS) if (text.includes(value)) fail(f, `contains the value of ${key} from .env`);
  const visible = f.endsWith(".html") ? pageText(text) : text;
  // The visible copy, and for HTML the raw file too: JSON-LD, other <script> content and attribute values aren't in
  // pageText (audit SEC-04, round-6 E-4).
  if (mentionsUnnamedClient(visible) || (f.endsWith(".html") && mentionsUnnamedClient(text))) fail(f, "names the unnamed client");
  const held = visible.match(HELD_MSC);
  if (held) fail(f, `describes the M.Sc. as held: "${held[0]}"`);
}

// The CV PDFs' text layer, read the way PDF readers do (audit SEC-04, E-4). Arabic is drawn in visual order, so the
// drawing-order text is also read with each Arabic word turned around, and with each stretch of Arabic words turned
// around as a whole (the word order of a multi-word name), plus the right-to-left runs as readers extract them, in
// both orders.
const ARABIC_WORD = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g;
const ARABIC_STRETCH = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;
const turn = (w) => [...w].reverse().join("");
for (const f of files.filter((x) => /^cv\/[^/]+\.pdf$/.test(x))) {
  const buf = readFileSync(`${DIST}/${f}`);
  const text = (await pdfPagesText(buf)).join("\n");
  const { runs } = await rtlRunsText(buf);
  const readings = [text, text.replace(ARABIC_WORD, turn), text.replace(ARABIC_STRETCH, turn), runs.join(" "), [...runs].reverse().join(" ")];
  if (!text.trim()) fail(f, "the PDF has no text layer to check");
  if (readings.some(mentionsUnnamedClient)) fail(f, "names the unnamed client (PDF text layer)");
  const held = readings.map((t) => t.match(HELD_MSC)).find(Boolean);
  if (held) fail(f, `describes the M.Sc. as held: "${held[0]}"`);
}

/* ------------------------------------------------------------------ required files */
for (const f of ["_headers", "_redirects", "robots.txt", "sitemap-index.xml", "llms.txt", "favicon.ico", "favicon.svg", "apple-touch-icon.png", "site.webmanifest", "ar.webmanifest", "404.html", ".well-known/security.txt"])
  if (!fileSet.has(f)) fail(f, "missing from the build");

/* ------------------------------------------------------------------ redirects (Workers static assets _redirects) */
// Slash-less URLs and the /work/ parent get permanent redirects (html_handling's own are 307); see
// scripts/postbuild/redirects.mjs. Rules are exact paths: one per page, plus the index.html forms.
if (fileSet.has("_redirects")) {
  const rules = new Map(
    read("_redirects")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*#.*$/, "").trim())
      .filter(Boolean)
      .map((l) => l.split(/\s+/))
      .map(([from, to, code]) => [from, { to, code }]),
  );
  const need = (from, to) => {
    const r = rules.get(from);
    if (!r) fail("_redirects", `no rule for ${from}`);
    else if (r.to !== to || r.code !== "301") fail("_redirects", `${from} → ${r.to} ${r.code} (expected ${to} 301)`);
  };
  for (const f of files.filter((x) => x.endsWith("/index.html"))) {
    const page = `/${f.replace(/index\.html$/, "")}`;
    need(page.slice(0, -1), page);
    need(`${page}index.html`, page);
  }
  need("/index.html", "/");
  need("/work", "/#work");
  need("/work/", "/#work");
  need("/ar/work", "/ar/#work");
  need("/ar/work/", "/ar/#work");
  // URLs people and tools guess (postbuild/redirects.mjs → ALIASES).
  need("/sitemap.xml", "/sitemap-index.xml");
  need("/resume", "/cv/");
  need("/cv.pdf", "/cv/Mohamed-Hatem-CV.pdf");
  need("/security.txt", "/.well-known/security.txt");
  need("/en", "/");
  need("/en/*", "/:splat");
  const dynamic = [...rules.keys()].filter((from) => from.includes("*") || from.includes("/:"));
  if (dynamic.length > 100) fail("_redirects", `${dynamic.length} dynamic rules (Workers static assets allow 100)`);
  if (rules.size - dynamic.length > 2000) fail("_redirects", `${rules.size - dynamic.length} static rules (Workers static assets allow 2,000)`);
  for (const [from, r] of rules) {
    if (from.endsWith("/") && rules.get(r.to)?.to === from) fail("_redirects", `loop between ${from} and ${r.to}`);
    // Every fixed target is a built file or page (a renamed CV PDF or page would otherwise redirect to a 404).
    const target = r.to.replace(/#.*$/, "");
    if (!target.includes(":") && !fileSet.has(fileForPath(target))) fail("_redirects", `${from} → ${r.to}: no such file or page in the build`);
  }
}

if (fileSet.has("_headers")) {
  const h = read("_headers");
  for (const [re, what] of [
    [/frame-ancestors 'none'/, "frame-ancestors 'none'"],
    [/Strict-Transport-Security: max-age=\d{8,}/, "HSTS"],
    [/X-Content-Type-Options: nosniff/, "nosniff"],
    [/Referrer-Policy:/, "Referrer-Policy"],
    [/Permissions-Policy:/, "Permissions-Policy"],
    [/\/_astro\/\*\s*\n\s*Cache-Control: public, max-age=31536000, immutable/, "immutable caching for /_astro/*"],
    [/\/_astro\/\*\s*\n(\s+.+\n)*?\s+Cross-Origin-Resource-Policy: same-origin/, "CORP same-origin on /_astro/*"],
    [/Content-Security-Policy: frame-ancestors[^\n]*report-uri \/api\/csp-report; report-to csp/, "CSP violation reporting (report-uri + report-to)"],
    [/Reporting-Endpoints: csp="\/api\/csp-report"/, "Reporting-Endpoints for report-to csp"],
    [/^\/\.well-known\/security\.txt\s*\n\s+Content-Type: text\/plain; charset=utf-8/m, "UTF-8 text/plain for /.well-known/security.txt"],
  ])
    if (!re.test(h)) fail("_headers", `missing ${what}`);
  // The only 'unsafe-inline' allowed: the SVG rule, and style attributes in the Report-Only mirrors (which enforce
  // nothing; postbuild/early-hints.mjs → MIRROR_ONLY explains the WebKit quirk).
  const policies = h
    .replace(/^#.*$/gm, "")
    .replace(/\/\*\.svg[\s\S]*?\n\n/, "")
    .replace(/^(\s+Content-Security-Policy-Report-Only:.*); style-src-attr 'unsafe-inline';/gm, "$1;");
  if (/unsafe-inline/.test(policies)) fail("_headers", "a page-level policy allows 'unsafe-inline'");
  // Workers static assets: at most 100 rules, 2,000 characters a line.
  const lines = h.split(/\r?\n/);
  const ruleCount = lines.filter((l) => /^\//.test(l)).length;
  if (ruleCount > 100) fail("_headers", `${ruleCount} rules (Workers static assets allow 100)`);
  for (const l of lines) if (l.length > 2000) fail("_headers", `a line is ${l.length} characters (Workers static assets allow 2,000): ${l.slice(0, 60)}…`);
}

/** dist/_headers as Map(exact path → Map(lowercased header → value)), for the per-page rules. */
function headerRules(text) {
  const rules = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = new Map();
      rules.set(line.trim(), current);
    } else if (current) {
      const i = line.indexOf(":");
      current.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
    }
  }
  return rules;
}
const pageHeaderRules = fileSet.has("_headers") ? headerRules(read("_headers")) : new Map();
if (fileSet.has("robots.txt") && !/Sitemap: https:\/\/mohamedhatem\.dev\/sitemap-index\.xml/.test(read("robots.txt"))) fail("robots.txt", "no Sitemap line");

/* ------------------------------------------------------------------ security.txt (RFC 9116) and the IndexNow key */
const SECURITY_TXT = ".well-known/security.txt";
if (fileSet.has(SECURITY_TXT)) {
  const txt = read(SECURITY_TXT);
  const field = (name) => txt.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"))?.[1]?.trim();
  if (!/^mailto:[^@\s]+@mohamedhatem\.dev$/.test(field("Contact") ?? "")) fail(SECURITY_TXT, `Contact is "${field("Contact")}" (expected a mailto: on the site's domain)`);
  if (field("Canonical") !== `${SITE}/${SECURITY_TXT}`) fail(SECURITY_TXT, `Canonical is "${field("Canonical")}"`);
  if (!field("Preferred-Languages")) fail(SECURITY_TXT, "no Preferred-Languages");
  // The policy is the repository's SECURITY.md (GitHub shows it at /security/policy), with the same contact.
  const policyFile = fileURLToPath(new URL("../../SECURITY.md", import.meta.url));
  if (field("Policy") !== "https://github.com/mhatem5351/mohamedhatem.dev/security/policy") fail(SECURITY_TXT, `Policy is "${field("Policy")}"`);
  if (!existsSync(policyFile)) fail("SECURITY.md", "missing at the repository root (security.txt's Policy)");
  else if (!readFileSync(policyFile, "utf8").includes(`mailto:${(field("Contact") ?? "").replace(/^mailto:/, "")}`)) fail("SECURITY.md", "doesn't give security.txt's Contact address");
  const expires = Date.parse(field("Expires") ?? "");
  const days = (expires - Date.now()) / 86_400_000;
  if (!Number.isFinite(expires)) fail(SECURITY_TXT, "no valid Expires date");
  else if (days < 30) fail(SECURITY_TXT, `Expires in ${Math.floor(days)} days: renew it (RFC 9116: at most a year ahead)`);
  else if (days > 366) fail(SECURITY_TXT, "Expires is more than a year ahead (RFC 9116 recommends less)");
}
// IndexNow (scripts/indexnow.mjs): one key file at the root, named <key>.txt and holding exactly the key.
const indexNowKeys = files.filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (indexNowKeys.length !== 1) fail("indexnow", `${indexNowKeys.length} key files (expected one <32 hex>.txt at the root)`);
for (const f of indexNowKeys) if (read(f) !== f.slice(0, -4)) fail(f, "the IndexNow key file must contain exactly its own name (no newline)");
// Workers static assets serve .txt as "text/plain" without a charset; _headers sets UTF-8 explicitly (one rule each,
// so the value replaces the default instead of being joined to another rule's).
if (fileSet.has("_headers"))
  for (const f of ["robots.txt", "llms.txt", "llms-full.txt"])
    if (!new RegExp(`^/${f.replace(".", "\\.")}\\s*\\n\\s+Content-Type: text/plain; charset=utf-8`, "m").test(read("_headers"))) fail("_headers", `no UTF-8 Content-Type rule for /${f}`);

/* ------------------------------------------------------------------ vCard ("Add to contacts") */
// src/pages/mohamed-hatem.vcf.ts renders it from content/profile.ts (src/lib/vcard.ts; field-by-field test in
// tests/unit/vcard.test.ts). Here: the built file is a vCard 3.0 a phone will read, served as text/vcard.
const VCARD = "mohamed-hatem.vcf";
if (!fileSet.has(VCARD)) fail(VCARD, "missing from the build");
else {
  const card = read(VCARD);
  const props = card.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); // structure; line endings are checked on their own
  const value = (name) => props.find((l) => l.split(/[;:]/)[0].toUpperCase() === name)?.replace(/^[^:]*:/, "");
  if (/\r(?!\n)|(?<!\r)\n/.test(card)) fail(VCARD, "line endings are not CRLF");
  if (card.split(/\r?\n/).some((l) => Buffer.byteLength(l, "utf8") > 75)) fail(VCARD, "a line is longer than 75 octets (not folded)");
  if (props[0] !== "BEGIN:VCARD" || props[1] !== "VERSION:3.0") fail(VCARD, "does not start with BEGIN:VCARD and VERSION:3.0");
  if (props.at(-2) !== "END:VCARD" || props.at(-1) !== "") fail(VCARD, "does not end with END:VCARD and a line break");
  if (props.filter((l) => /^(BEGIN|END):VCARD$/.test(l)).length !== 2) fail(VCARD, "is not exactly one card (one BEGIN, one END)");
  if (!/^[^;]+;[^;]+/.test(value("N") ?? "")) fail(VCARD, `N is "${value("N")}" (expected family;given;;;)`);
  if (!/Mohamed Hatem/.test(value("FN") ?? "")) fail(VCARD, `FN is "${value("FN")}"`);
  for (const name of ["TITLE", "ORG", "EMAIL", "TEL", "URL"]) if (!value(name)) fail(VCARD, `no ${name}`);
  const photo = props.find((l) => /^PHOTO;ENCODING=b;TYPE=JPEG:/i.test(l))?.replace(/^[^:]*:/, "");
  if (!photo) fail(VCARD, "no embedded JPEG PHOTO");
  else if (Buffer.from(photo, "base64").subarray(0, 3).toString("hex") !== "ffd8ff") fail(VCARD, "PHOTO is not a JPEG");
  else if (photo.length > 12 * 1024) fail(VCARD, `PHOTO is ${photo.length} base64 characters (budget 12 KB)`);
}
if (fileSet.has("_headers") && !/^\/mohamed-hatem\.vcf\s*\n\s+Content-Type: text\/vcard; charset=utf-8\s*\n\s+Content-Disposition: inline; filename="Mohamed-Hatem\.vcf"/m.test(read("_headers")))
  fail("_headers", "no text/vcard rule (Content-Type, then Content-Disposition inline) for /mohamed-hatem.vcf");

/* ------------------------------------------------------------------ sitemap <lastmod> */
for (const f of files.filter((x) => /^sitemap-\d+\.xml$/.test(x))) {
  const urls = [...read(f).matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  if (!urls.length) fail(f, "no <url> entries");
  for (const u of urls) if (!/<lastmod>\d{4}-\d{2}-\d{2}(T[^<]*)?<\/lastmod>/.test(u)) fail(f, `no <lastmod> date for ${u.match(/<loc>([^<]*)/)?.[1]}`);
}

/* ------------------------------------------------------------------ pages */
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const pagePath = (f) => `/${f.replace(/index\.html$/, "")}`;
const ids = new Map(htmlFiles.map((f) => [f, new Set([...read(f).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
const expected = new Set(await allPages());

let checkedLinks = 0;
const entities = new Map();
const ogAlts = new Map();
/** Each page's manifest link and iOS home-screen title, checked against the manifests below. */
const appLinks = [];
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
    // Only what the pages use: Turnstile (script + frame), the analytics beacon (script) and its reports (connect).
    if ((policy.get("connect-src") ?? []).join(" ") !== "'self' https://cloudflareinsights.com") fail(f, `CSP connect-src is "${(policy.get("connect-src") ?? []).join(" ")}"`);
    if (policy.has("child-src")) fail(f, "CSP has a child-src (frame-src and worker-src cover it)");
    if ((policy.get("worker-src") ?? []).some((v) => v === "blob:" || v === "*")) fail(f, "CSP worker-src allows blob: or *");
    for (const s of elements(html, "script")) {
      if (s.attrs.has("src") || /json/i.test(s.attrs.get("type") ?? "") || !s.body) continue;
      if (!scriptSrc?.includes(cspHash(s.body))) fail(f, `inline script not in script-src: ${s.body.trim().slice(0, 60)}…`);
    }
    for (const s of elements(html, "style")) if (s.body && !styleSrc?.includes(cspHash(s.body))) fail(f, `inline style not in style-src: ${s.body.trim().slice(0, 60)}…`);
    // The Report-Only mirror of this <meta> (postbuild/early-hints.mjs, audit SEC-H01): the same script-src and
    // style-src (so the browser reports exactly what the <meta> blocks), reported to the Worker, without the
    // directives the enforced header policy already reports (counted once).
    if (!is404) {
      const ro = pageHeaderRules.get(path)?.get("content-security-policy-report-only");
      if (!ro) fail(f, "no Content-Security-Policy-Report-Only mirror of the <meta> policy in _headers (postbuild/early-hints.mjs)");
      else {
        const mirror = parsePolicy(ro);
        for (const d of ["default-src", "script-src", "style-src", "img-src", "connect-src", "frame-src"]) {
          const a = [...(policy.get(d) ?? [])].sort().join(" ");
          const b = [...(mirror.get(d) ?? [])].sort().join(" ");
          if (a !== b) fail(f, `the Report-Only mirror's ${d} differs from the <meta> policy's`);
        }
        if ((mirror.get("report-uri") ?? []).join(" ") !== "/api/csp-report" || (mirror.get("report-to") ?? []).join(" ") !== "csp")
          fail(f, "the Report-Only mirror doesn't report to /api/csp-report (report-uri + report-to csp)");
        for (const d of ["base-uri", "form-action", "object-src"]) if (mirror.has(d)) fail(f, `the Report-Only mirror repeats ${d} (the header policy reports it already)`);
      }
    }
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
    if (metaByName("robots") !== "max-image-preview:large") fail(f, `robots meta is "${metaByName("robots")}" (expected max-image-preview:large)`);
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
  const ogAlt = metaByName("og:image:alt");
  if (!ogAlt) fail(f, "missing og:image:alt");
  else if (ogAlt !== metaByName("twitter:image:alt")) fail(f, "og:image:alt and twitter:image:alt differ");
  if (ogAlt && !is404 && path !== "/" && path !== "/ar/") ogAlts.set(f, ogAlt);
  appLinks.push({ f, ar, manifest: links.find((l) => l.attrs.get("rel") === "manifest")?.attrs.get("href"), title: metaByName("apple-mobile-web-app-title") });

  // JSON-LD
  const nodes = [];
  for (const s of elements(html, "script").filter((s) => s.attrs.get("type") === "application/ld+json")) {
    try {
      const data = JSON.parse(s.body);
      nodes.push(data);
      const people = JSON.stringify(data).match(/"@type":"Person"[^}]*"name":"([^"]+)"/g) ?? [];
      for (const p of people) if (!/Mohamed Hatem|محمد حاتم/.test(p)) fail(f, `JSON-LD features another person: ${p.slice(0, 80)}`);
    } catch (e) {
      fail(f, `JSON-LD does not parse: ${e.message}`);
    }
  }
  const json = JSON.stringify(nodes);
  for (const n of nodes) {
    // One description per entity: the Person and the WebSite are identical on every page, in both languages.
    if (n["@id"] === `${SITE}/#person` || n["@id"] === `${SITE}/#website`) {
      const body = JSON.stringify(n);
      if (!entities.has(n["@id"])) entities.set(n["@id"], { body, f });
      else if (entities.get(n["@id"]).body !== body) fail(f, `${n["@id"]} differs from ${entities.get(n["@id"]).f}`);
    }
    if (n["@type"] === "Article") {
      for (const k of ["datePublished", "dateModified"]) if (!/^\d{4}-\d{2}-\d{2}$/.test(n[k] ?? "")) fail(f, `Article ${k} is "${n[k]}" (expected YYYY-MM-DD)`);
      // The card in 16:9, 4:3 and 1:1 (audit SEO-05; scripts/postbuild/og-ratios.mjs), each a file in the build.
      const images = Array.isArray(n.image) ? n.image : [n.image];
      if (images.length !== 3 || !/-4x3\.jpg(\?|$)/.test(images[1] ?? "") || !/-1x1\.jpg(\?|$)/.test(images[2] ?? "")) fail(f, "Article image is not the card in 16:9, 4:3 and 1:1");
      for (const img of images)
        if (typeof img !== "string" || !img.startsWith(`${SITE}/`) || !fileSet.has(fileForPath(new URL(img).pathname))) fail(f, `Article image missing from the build: ${img}`);
    }
  }
  if (json.includes(`"@id":"${SITE}/#website"`) && !nodes.some((n) => n["@type"] === "WebSite")) fail(f, "JSON-LD refers to #website without a WebSite node");
  if (/"@type":"(?!SoftwareSourceCode)[^"]+"[^{}]*"codeRepository"/.test(json)) fail(f, "codeRepository outside a SoftwareSourceCode node");

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

// Each page's sharing card has its own description (not the home card's on every page).
for (const [f, alt] of ogAlts) if ([...ogAlts.values()].filter((a) => a === alt).length > 1) fail(f, `og:image:alt is shared with another page: "${alt.slice(0, 60)}…"`);

/* ------------------------------------------------------------------ web app manifests */
// Written by design/scripts/brand/manifest.mjs from content/ and the tokens (tests/unit/palette.test.ts checks they are
// current). Here: each language's manifest is complete, its targets exist, and every page links its own.
const MANIFESTS = { en: "site.webmanifest", ar: "ar.webmanifest" };
const manifests = {};
for (const [lang, f] of Object.entries(MANIFESTS)) {
  if (!fileSet.has(f)) continue; // reported under required files
  let m;
  try {
    m = JSON.parse(read(f));
  } catch (e) {
    fail(f, `does not parse: ${e.message}`);
    continue;
  }
  manifests[lang] = m;
  const home = lang === "ar" ? "/ar/" : "/";
  for (const [k, v] of Object.entries({ lang, dir: lang === "ar" ? "rtl" : "ltr", start_url: home, id: "/", scope: "/", display: "standalone" }))
    if (m[k] !== v) fail(f, `${k} is "${m[k]}" (expected "${v}")`);
  for (const k of ["name", "short_name", "description", "theme_color", "background_color"]) if (!m[k]) fail(f, `no ${k}`);
  if (!(m.icons ?? []).some((i) => i.purpose === "maskable")) fail(f, "no maskable icon");
  if (!m.shortcuts?.length) fail(f, "no shortcuts");
  for (const icon of [...(m.icons ?? []), ...(m.shortcuts ?? []).flatMap((s) => s.icons ?? [])])
    if (!fileSet.has(fileForPath(icon.src) ?? "")) fail(f, `icon ${icon.src} is missing`);
  for (const s of m.shortcuts ?? []) {
    const url = new URL(s.url, `${SITE}/`);
    const page = fileForPath(url.pathname);
    if (url.origin !== SITE || !url.pathname.startsWith(home) || (lang === "en" && url.pathname.startsWith("/ar/")))
      fail(f, `shortcut "${s.name}" leaves the manifest's language: ${s.url}`);
    else if (!fileSet.has(page)) fail(f, `shortcut "${s.name}" → ${s.url} has no page`);
    else if (url.hash && !ids.get(page)?.has(url.hash.slice(1))) fail(f, `shortcut "${s.name}" → ${s.url} has no target id`);
  }
}
if (manifests.en && manifests.ar && manifests.en.id !== manifests.ar.id) fail("ar.webmanifest", "id differs from site.webmanifest (one app, two languages)");
for (const { f, ar, manifest, title } of appLinks) {
  const lang = ar ? "ar" : "en";
  if (manifest !== `/${MANIFESTS[lang]}`) fail(f, `manifest link is ${manifest} (expected /${MANIFESTS[lang]})`);
  if (manifests[lang] && title !== manifests[lang].short_name) fail(f, `apple-mobile-web-app-title is "${title}" (expected the manifest's short_name "${manifests[lang].short_name}")`);
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
