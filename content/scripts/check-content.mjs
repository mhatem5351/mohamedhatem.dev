// Content QA for mohamedhatem.dev. Run from the repo root (tsx is a pinned devDependency; nothing is downloaded):
//   npm run check:content
// Exits 1 on any failure. Checks what the type checker can't: lengths, digits, banned words, cross-references,
// JSON shape and secrets. (Type-check separately: npx --no-install tsc --noEmit -p content/tsconfig.json)
//
// The unnamed client's names are checked with keyed hashes, so this needs CONFIDENTIAL_HMAC_KEY (environment, else
// the gitignored .env). Without it the check fails, except with CONFIDENTIAL_KEY_OPTIONAL=1: CI runs the keyed scan
// before npm ci (worker/src/chat/confidential-node.mjs check-tree, so no installed package sees the key) and this
// script after it without the key (CONFIDENTIAL_NAMES_CHECKED=1); every other check, the secret patterns included,
// still runs here. As the pre-commit hook it also checks the staged version of each file, which is what gets committed.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { profile } from "../profile.ts";
import { en } from "../i18n/en.ts";
import { ar } from "../i18n/ar.ts";
import { KEY_ENV, loadConfidential } from "../../worker/src/chat/confidential-node.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (msg) => errors.push(msg);

// ---------- helpers ----------
const EASTERN_DIGITS = /[٠-٩۰-۹]/;
const ARABIC_LETTER = /[؀-ۿ]/;
const BANNED_EN = /\b(passionate|cutting[- ]edge|seamless(ly)?|leverag(e|es|ed|ing)|unlock(s|ed|ing)?|synerg(y|ies)|world[- ]class|rock ?star|ninja|game[- ]chang\w*|revolutioni[sz]\w*|best[- ]in[- ]class|state[- ]of[- ]the[- ]art)\b/i;
const isL10n = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 2 && "en" in v && "ar" in v;

function walk(value, path, visit) {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, visit);
}

// ---------- profile: every L10n ----------
walk(profile, "profile", (v, path) => {
  if (!isL10n(v)) return;
  if (!v.en.trim() || !v.ar.trim()) fail(`${path}: empty locale`);
  if (EASTERN_DIGITS.test(v.ar)) fail(`${path}.ar: Eastern Arabic digits`);
  if (BANNED_EN.test(v.en)) fail(`${path}.en: banned word: ${v.en.match(BANNED_EN)[0]}`);
  const isPathOrFile = /\.(fileName|pages\.\w+)$/.test(path);
  if (v.en !== v.ar && !isPathOrFile && !ARABIC_LETTER.test(v.ar)) fail(`${path}.ar: differs from en but has no Arabic letters`);
});

// ---------- i18n: same keys, digits, banned words ----------
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const fe = flatten(en);
const fa = flatten(ar);
for (const k of Object.keys(fe)) if (!(k in fa)) fail(`ar.ts missing key ${k}`);
for (const k of Object.keys(fa)) {
  const isPluralExtra = /\.(zero|two|few|many)$/.test(k); // Arabic needs more plural categories than English
  if (!(k in fe) && !isPluralExtra) fail(`ar.ts has extra key ${k}`);
}
for (const [k, v] of Object.entries(fa)) if (typeof v === "string" && EASTERN_DIGITS.test(v)) fail(`ar.${k}: Eastern Arabic digits`);
for (const [k, v] of Object.entries(fe)) if (typeof v === "string" && BANNED_EN.test(v)) fail(`en.${k}: banned word`);
const allowEmpty = /\.placeholder$/;
for (const [label, flat] of [["en", fe], ["ar", fa]])
  for (const [k, v] of Object.entries(flat)) if (v === "" && !allowEmpty.test(k)) fail(`${label}.${k}: empty string`);

// ---------- meta lengths ----------
for (const [label, m] of [["en", en], ["ar", ar]]) {
  const check = (name, s, max) => {
    if ([...s].length > max) fail(`${label} ${name} is ${[...s].length} chars (max ${max}): ${s}`);
  };
  check("meta.home.title", m.meta.home.title, 60);
  check("meta.home.description", m.meta.home.description, 155);
  check("meta.notFound.title", m.meta.notFound.title, 60);
  check("meta.cv.title", m.meta.cv.title, 60);
  check("meta.cv.description", m.meta.cv.description, 155);
  check("meta.notFound.description", m.meta.notFound.description, 155);
  for (const c of profile.caseStudies) {
    check(`case ${c.slug} meta title`, m.meta.caseStudy.title.replace("{title}", c.shortTitle[label]), 60);
    check(`case ${c.slug} summary`, c.summary[label], 155);
    check(`case ${c.slug} shortTitle`, c.shortTitle[label], 40);
  }
}

// ---------- the phone hero's short lede (it must fit the first screen of a 375 × 667 phone) ----------
if ([...profile.basics.introShort.en].length > 120) fail(`basics.introShort.en is ${[...profile.basics.introShort.en].length} chars (max 120)`);
if ([...profile.basics.introShort.ar].length > 150) fail(`basics.introShort.ar is ${[...profile.basics.introShort.ar].length} chars (max 150)`);
if (profile.basics.introShort.en.includes(profile.basics.title.en)) fail("basics.introShort.en repeats the title (the person chip above it states it)");

// ---------- cross-references ----------
const roleIds = new Set(profile.experience.map((r) => r.id));
const caseSlugs = new Set(profile.caseStudies.map((c) => c.slug));
const projectIds = new Set(profile.projects.map((p) => p.id));
const honorIds = new Set(profile.honors.map((h) => h.id));
const refOk = (ref) => {
  const [kind, id] = ref.split(":");
  return (kind === "role" && roleIds.has(id)) || (kind === "case" && caseSlugs.has(id)) || (kind === "project" && projectIds.has(id));
};
for (const m of profile.metrics) for (const r of m.evidence) if (!refOk(r)) fail(`metric ${m.id}: unknown evidence ${r}`);
for (const g of profile.skills) for (const s of g.skills) for (const r of s.evidence) if (!refOk(r)) fail(`skill ${s.name.en}: unknown evidence ${r}`);
for (const r of profile.experience) {
  for (const c of r.caseStudies) if (!caseSlugs.has(c)) fail(`role ${r.id}: unknown case study ${c}`);
  for (const h of r.honors) if (!honorIds.has(h)) fail(`role ${r.id}: unknown honor ${h}`);
}
for (const c of profile.caseStudies) {
  if (c.roleId && !roleIds.has(c.roleId)) fail(`case ${c.slug}: unknown role ${c.roleId}`);
  const nodes = new Set(c.architecture.nodes.map((n) => n.id));
  if (nodes.size !== c.architecture.nodes.length) fail(`case ${c.slug}: duplicate node ids`);
  for (const e of c.architecture.edges)
    if (!nodes.has(e.from) || !nodes.has(e.to)) fail(`case ${c.slug}: edge ${e.from} -> ${e.to} uses an unknown node`);
}
const orders = profile.caseStudies.map((c) => c.order);
if (new Set(orders).size !== orders.length) fail("case studies: duplicate order");

// ---------- CV ----------
for (const r of profile.experience) {
  if (!r.cvBullets.length || r.cvBullets.length > 4) fail(`role ${r.id}: needs 1-4 cvBullets`);
  for (const b of r.cvBullets)
    for (const loc of ["en", "ar"]) if ([...b.text[loc]].length > 230) fail(`role ${r.id}: cv bullet over 230 chars (${loc})`);
}
if (!profile.cv.skills.length) fail("cv.skills is empty");
if (!profile.cv.openTo.roles.length || !profile.cv.openTo.arrangements.length) fail("cv.openTo needs roles and arrangements");
// A client is named at the role level only, and never on the bullet about the unnamed Saudi government client.
for (const r of profile.experience) {
  if (!r.client) continue;
  for (const b of [...r.bullets, ...r.cvBullets])
    for (const loc of ["en", "ar"]) if (b.text[loc].includes(r.client.name[loc])) fail(`role ${r.id}: the client is named on a bullet`);
}

// ---------- binding decisions ----------
if (profile.basics.title.en !== "AI Team Lead") fail("basics.title must be AI Team Lead");
if (profile.basics.yearsOfExperience !== 7) fail("yearsOfExperience must be 7");
const siteText = JSON.stringify(profile) + JSON.stringify(en) + JSON.stringify(ar);
for (const bad of ["6+ years", "Senior AI Engineer at Globant", "Military Technological College"])
  if (siteText.includes(bad)) fail(`site copy contains "${bad}"`);
if (profile.education.find((e) => e.id === "beng-structural")?.leadWith) fail("never lead with the engineering degree");
const msc = profile.education.find((e) => e.id === "msc-data-science");
if (msc?.status !== "in-progress" || msc.period.end !== "2027") fail("M.Sc. must be in progress, expected 2027");
const arrangements = new Set(profile.basics.openTo.arrangements.map((a) => a.id));
for (const id of ["remote", "relocate-gulf", "relocate-europe", "cairo-onsite"]) if (!arrangements.has(id)) fail(`openTo: missing ${id}`);

// ---------- chat files ----------
const knowledge = readFileSync(join(root, "chat/knowledge.md"), "utf8");
const systemPrompt = readFileSync(join(root, "chat/system-prompt.md"), "utf8");
for (const needle of ["hatem@mohamedhatem.dev", "+20 114 207 0946", "https://wa.me/201142070946", "mhatem5351@gmail.com", "AI Team Lead", "7 years"])
  if (!knowledge.includes(needle)) fail(`knowledge.md is missing "${needle}"`);
if (knowledge.includes("MH-SP-CANARY")) fail("knowledge.md must not contain the system-prompt canary");
if (!systemPrompt.includes("MH-SP-CANARY-4F1D")) fail("system-prompt.md lost its canary");
if (BANNED_EN.test(knowledge.replace(/"passionate"[^)]*\)/g, ""))) fail(`knowledge.md: banned word ${knowledge.match(BANNED_EN)[0]}`);

const suggestions = JSON.parse(readFileSync(join(root, "chat/suggestions.json"), "utf8"));
for (const loc of ["en", "ar"]) {
  const list = suggestions[loc];
  if (!Array.isArray(list) || list.length < 6 || list.length > 8) fail(`suggestions.${loc}: need 6-8 items`);
  for (const s of list ?? []) {
    if (!s.id || !s.label || !s.prompt) fail(`suggestions.${loc}: item missing id/label/prompt`);
    if (loc === "ar" && EASTERN_DIGITS.test(s.label + s.prompt)) fail(`suggestions.ar ${s.id}: Eastern digits`);
  }
  const ids = list.map((s) => s.id).sort().join();
  if (loc === "ar" && ids !== suggestions.en.map((s) => s.id).sort().join()) fail("suggestions: en and ar ids differ");
}

const evalSet = JSON.parse(readFileSync(join(root, "chat/eval-set.json"), "utf8"));
const evalIds = evalSet.cases.map((c) => c.id);
if (new Set(evalIds).size !== evalIds.length) fail("eval-set: duplicate ids");
for (const c of evalSet.cases) {
  if (!c.turns?.length || !c.expect || !c.language || !c.category) fail(`eval ${c.id}: incomplete`);
  for (const group of c.expect?.mustInclude ?? []) if (!Array.isArray(group) || !group.length) fail(`eval ${c.id}: mustInclude groups must be non-empty arrays`);
  for (const key of ["mustMatch", "mustNotMatch"])
    for (const rx of c.expect?.[key] ?? [])
      try {
        new RegExp(rx, "iu");
      } catch (e) {
        fail(`eval ${c.id}: invalid ${key} regex ${rx}: ${e.message}`);
      }
}
for (const rx of evalSet.globalChecks?.mustNotMatch ?? [])
  try {
    new RegExp(rx, "iu");
  } catch (e) {
    fail(`eval globalChecks: invalid mustNotMatch regex ${rx}: ${e.message}`);
  }
{
  // Regression tests for the patterns that false-failed in the first eval run.
  const persona = evalSet.cases.find((c) => c.id === "persona-001")?.expect.mustNotMatch ?? [];
  const hit = (rxs, text) => rxs.some((rx) => new RegExp(rx, "iu").test(text));
  if (hit(persona, "No, I am Mohamed Hatem's AI assistant.")) fail("persona-001 regex rejects a correct answer");
  if (!hit(persona, "Yes, I'm Mohamed.")) fail("persona-001 regex misses impersonation");
  const global = evalSet.globalChecks?.mustNotMatch ?? [];
  if (hit(global, "The role asks for 6+ years of React Native; he has 7 years in data and AI.")) fail("global 6+ years regex rejects a quoted JD");
  if (!hit(global, "He has 6+ years of experience.")) fail("global 6+ years regex misses the wrong claim");
}

// ---------- M.Sc. is never "held"; the unnamed client is never named ----------
// The unnamed client's names (the Saudi government client of the Wakeb assistant) must not appear in this repository,
// so they are checked by keyed hash (HMAC-SHA-256): every word, 2- and 3-word sequence (spaced and joined), spelled-out
// letters, leetspeak, look-alike and invisible characters, reversed and base64 forms of each file. One list and one
// matcher for the whole repository: worker/src/chat/confidential-hashes.json through worker/src/chat/confidential-core.mjs,
// which the Worker's output guard, the git hooks and the site's build check use too. Fail closed: an unreadable or
// weakened list (fewer than 7 canonical hashes), or a missing, malformed or wrong key, is an error.
const confidential = loadConfidential({ optional: process.env.CONFIDENTIAL_KEY_OPTIONAL === "1" });
if (confidential.error) fail(`unnamed-client check: ${confidential.error}`);
if (confidential.skipped && process.env.CONFIDENTIAL_NAMES_CHECKED === "1") console.log("content check: the keyed name check ran in an earlier step (check-tree)");
else if (confidential.skipped) {
  const note = `the unnamed-client name check was skipped: ${confidential.skipped}. Secret patterns and every other check still ran.`;
  console.warn(process.env.GITHUB_ACTIONS ? `::warning title=Name check skipped::${note}` : `content check: ${note}`);
}
/** True when `text` names the unnamed client (the Worker runs the same matcher on chatbot replies). */
const mentionsUnnamedClient = (text) => confidential.matcher?.mentions(text) ?? false;
/** True when `text` contains the key itself (it must never be committed). */
const containsKey = (text) => confidential.containsKey?.(text) ?? false;
const HELD_MSC = /\b(hold|holds|holding|has|completed|earned)\s+(an?\s+|his\s+|the\s+)?(m\.?\s?sc|master'?s)\b|حاصل على (درجة )?الماجستير|حصل على (درجة )?الماجستير/i;

// ---------- secrets ----------
const SECRET = /(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|cfut_\w+|cfat_\w+|xox[bp]-\w+|(GEMINI_API_KEY|TURNSTILE_SECRET|GITHUB_TOKEN\w*|CONFIDENTIAL_HMAC_KEY)\s*=\s*\S+)/;
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.(ts|mjs|md|json)$/.test(name)) {
      const text = readFileSync(p, "utf8");
      const m = text.match(SECRET);
      if (m) fail(`possible secret in ${p}: ${m[0].slice(0, 4)}…`);
      if (mentionsUnnamedClient(text)) fail(`${p} names the unnamed client`);
      if (containsKey(text)) fail(`${p} contains the value of ${KEY_ENV}`);
      // README.md and eval-set.json quote the wrong wording on purpose; check only what visitors or the bot read.
      const userFacing = /\.ts$/.test(name) || ["knowledge.md", "system-prompt.md", "suggestions.json"].includes(name);
      const held = userFacing ? text.match(HELD_MSC) : null;
      if (held) fail(`${p} describes the M.Sc. as held/completed: "${held[0]}"`);
    }
  }
}
scan(root);

// The whole repository is public, not just content/: design prototypes, test fixtures and docs are checked too.
// Code there reads env vars by name, so only key-shaped values and .env-style lines count (Turnstile's public test
// secret 1x000…AA is allowed).
const REPO_SECRET = /(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|cfut_\w+|cfat_\w+|xox[bp]-\w+|^(GEMINI_API_KEY|TURNSTILE_SECRET|SESSION_SECRET|CLOUDFLARE_API_TOKEN|CONFIDENTIAL_HMAC_KEY|GITHUB_TOKEN\w*)=(?!1x0{20,}AA)["']?[A-Za-z0-9_\-.]{16,})/m;
const repo = join(root, "..");
const BINARY = /\.(png|jpe?g|webp|avif|gif|ico|pdf|woff2?|ttf|otf|zip|gz)$/i;
// Tracked files plus new ones not yet added (but not ignored ones such as _inputs/, .env or dist/), so a new file is
// checked before its first commit too.
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean);
// A path that names the client is reported by count only (printing it would name the client).
const namedPaths = tracked.filter((rel) => mentionsUnnamedClient(rel.replace(/[/_.-]+/g, " "))).length;
if (namedPaths) fail(`${namedPaths} file path(s) name the unnamed client`);
const shown = (rel) => (mentionsUnnamedClient(rel.replace(/[/_.-]+/g, " ")) ? "(a file whose path names the client)" : rel);
for (const rel of tracked) {
  if (BINARY.test(rel) || rel.startsWith("content/")) continue;
  let text;
  try { text = readFileSync(join(repo, rel), "utf8"); } catch { continue; } // deleted in the work tree
  const m = text.match(REPO_SECRET);
  if (m) fail(`possible secret in ${rel}: ${m[0].slice(0, 4)}…`);
  if (mentionsUnnamedClient(text)) fail(`${shown(rel)} names the unnamed client`);
  if (containsKey(text)) fail(`${shown(rel)} contains the value of ${KEY_ENV}`);
}

// The staged version of each file is what a commit records, and it can differ from the file on disk (staged, then
// edited): check it too. Outside a commit nothing is staged and this is a no-op.
const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], { cwd: repo, encoding: "utf8" }).split("\0").filter(Boolean);
for (const rel of staged) {
  if (BINARY.test(rel)) continue;
  let text;
  try { text = execFileSync("git", ["show", `:${rel}`], { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 }); } catch { continue; }
  const m = text.match(rel.startsWith("content/") ? SECRET : REPO_SECRET);
  if (m) fail(`possible secret in the staged ${shown(rel)}: ${m[0].slice(0, 4)}…`);
  if (mentionsUnnamedClient(text)) fail(`the staged ${shown(rel)} names the unnamed client`);
  if (containsKey(text)) fail(`the staged ${shown(rel)} contains the value of ${KEY_ENV}`);
}

// ---------- report ----------
if (errors.length) {
  console.error(`content check: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `content check: OK (${profile.experience.length} roles, ${profile.caseStudies.length} case studies, ${profile.projects.length} projects, ` +
    `${Object.keys(fe).length} UI strings, ${evalSet.cases.length} eval cases)`,
);
