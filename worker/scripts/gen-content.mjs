#!/usr/bin/env node
/**
 * Bundles the assistant's content into the Worker and the chat widget (codegen, so every tool — wrangler/esbuild,
 * vitest, tsc, Vite/Astro — sees plain TypeScript modules):
 *
 *   content/chat/system-prompt.md ─┐
 *   content/chat/knowledge.md     ─┼─▶ worker/src/generated/content.ts       (SYSTEM_PROMPT, KNOWLEDGE, CANARY, …)
 *   content/chat/suggestions.json ─┴─▶ chat-widget/src/generated/suggestions.ts (SUGGESTIONS: { en, ar })
 *   content/i18n/{en,ar}.ts → chat ──▶ chat-widget/src/generated/copy.ts        (COPY: the widget strings the content
 *                                                                               agent owns, e.g. title, privacy)
 *
 * Until the content agent's files exist, each missing file falls back to worker/test/fixtures/<same name> (with a
 * warning). `--require-content` (used by `npm run deploy:worker`) fails instead, so a fixture can never ship.
 *
 * Runs automatically on `wrangler dev` / `wrangler deploy` (wrangler.jsonc → build.command) and before the unit
 * tests (vitest globalSetup). The canary is a random string (kept while worker/src/generated/ exists, new on a
 * fresh checkout): it is appended to the system prompt and any answer that contains it is blocked
 * (worker/src/chat/guard.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Characters of the knowledge base in KNOWLEDGE_COMPACT (models with a small tokens-per-minute quota). */
const COMPACT_BUDGET = 33_000;
const requireContent = process.argv.includes("--require-content");
const quiet = process.argv.includes("--quiet");

const sources = {};
function load(name) {
  const real = join(root, "content", "chat", name);
  const fixture = join(root, "worker", "test", "fixtures", name);
  if (existsSync(real)) {
    sources[name] = "content";
    return readFileSync(real, "utf8");
  }
  if (requireContent) {
    console.error(`gen-content: ${relative(root, real)} is missing (required for deploy).`);
    process.exit(1);
  }
  if (!quiet) console.warn(`gen-content: ${relative(root, real)} not found, using the test fixture.`);
  sources[name] = "fixture";
  return readFileSync(fixture, "utf8");
}

/** Normalises line endings and trims trailing spaces, so the prompt prefix is byte-stable between builds. */
const clean = (s) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();

const systemPrompt = clean(load("system-prompt.md"));
const knowledge = clean(load("knowledge.md"));
const suggestions = normaliseSuggestions(JSON.parse(load("suggestions.json")));

if (systemPrompt.length < 200) fail("system-prompt.md looks empty");
if (knowledge.length < 500) fail("knowledge.md looks empty");
if (!suggestions.en.length || !suggestions.ar.length) fail("suggestions.json needs English and Arabic suggestions");

const version = createHash("sha256").update(systemPrompt).update("\0").update(knowledge).digest("hex").slice(0, 12);
// Gemma's free tier allows 16,000 input tokens a minute: ~33,000 characters of knowledge keep the compact instruction
// near 10k estimated tokens (worker/src/chat/gemini.ts estimateTokens), with room for a pasted job description.
const knowledgeCompact = compactKnowledge(knowledge, COMPACT_BUDGET);
// The facts the compact prompt's rules point to (audit R6-08: the case studies, education and fit guide were dropped).
if (sources["knowledge.md"] === "content")
  for (const needle of ["96 tools", "M.Sc. in Data Science", "Not in the sources", "GADD", "team of 7", "AWS Certified Machine Learning", "sta-tourism-assistants", "قاد هندسة الذكاء الاصطناعي"])
    if (!knowledgeCompact.includes(needle)) fail(`KNOWLEDGE_COMPACT lost "${needle}": adjust compactKnowledge's priorities or the budget`);
// Site pages the assistant may link to (links.ts): the fixed pages plus every case-study page in content/profile.ts.
const sitePaths = await loadSitePaths();
if (sources["knowledge.md"] === "content") {
  for (const text of [knowledge, systemPrompt])
    for (const m of text.matchAll(/https:\/\/(?:www\.)?mohamedhatem\.dev(\/[^\s)#?"'`]*)?/g)) {
      const path = m[1] || "/";
      if (sitePaths && !sitePaths.includes(path)) fail(`chat content links ${m[0]}, which is not a page of the site (content/profile.ts)`);
    }
}
// Random, and kept across regenerations (so `npm test` or a content edit doesn't restart `wrangler dev` for nothing);
// a fresh checkout or CI build gets a new one.
const generatedFile = join(root, "worker", "src", "generated", "content.ts");
const previousCanary = existsSync(generatedFile) ? /export const CANARY: string = "(MHC-[0-9a-f]{12})";/.exec(readFileSync(generatedFile, "utf8"))?.[1] : undefined;
const canary = previousCanary ?? `MHC-${randomBytes(6).toString("hex")}`;
// Canaries the content agent wrote into the system prompt itself ("Canary: MH-SP-CANARY-4F1D") are blocked too.
const promptCanaries = [...systemPrompt.matchAll(/\bcanary\b[^A-Za-z0-9]{1,4}([A-Z0-9][A-Z0-9_-]{5,63})/gi)].map((m) => m[1]);
const canaries = [...new Set([canary, ...promptCanaries])];
const source = Object.values(sources).every((s) => s === "content") ? "content" : Object.values(sources).every((s) => s === "fixture") ? "fixture" : "mixed";

const banner = "// GENERATED by worker/scripts/gen-content.mjs from content/chat/*. Do not edit; do not commit.\n";
write(
  "worker/src/generated/content.ts",
  banner +
    `export const SYSTEM_PROMPT: string = ${JSON.stringify(systemPrompt)};\n` +
    `export const KNOWLEDGE: string = ${JSON.stringify(knowledge)};\n` +
    `/** ≤ ${COMPACT_BUDGET.toLocaleString("en")} characters of the knowledge base, for models with a small token-per-minute quota (Gemma: 16k). */\n` +
    `export const KNOWLEDGE_COMPACT: string = ${JSON.stringify(knowledgeCompact)};\n` +
    `/** Paths of mohamedhatem.dev the assistant may link to (fixed pages + content/profile.ts case studies); null = unknown. */\n` +
    `export const SITE_PATHS: readonly string[] | null = ${JSON.stringify(sitePaths)};\n` +
    `/** Random per build; appended to the system instruction and blocked in any answer (prompt-leak tripwire). */\n` +
    `export const CANARY: string = ${JSON.stringify(canary)};\n` +
    `/** CANARY plus any canary written in system-prompt.md: all blocked in answers. */\n` +
    `export const CANARIES: readonly string[] = ${JSON.stringify(canaries)};\n` +
    `/** sha256(system prompt + knowledge), first 12 hex chars. */\n` +
    `export const CONTENT_VERSION: string = ${JSON.stringify(version)};\n` +
    `export const CONTENT_SOURCE: "content" | "fixture" | "mixed" = ${JSON.stringify(source)};\n`,
);
write(
  "chat-widget/src/generated/suggestions.ts",
  banner +
    `/** Starter suggestions per language: \`label\` is the chip text, \`prompt\` is the message sent. Show the first 4 on small screens. */\n` +
    `export interface Suggestion {\n  label: string;\n  prompt: string;\n}\n` +
    `export const SUGGESTIONS: { en: Suggestion[]; ar: Suggestion[] } = ${JSON.stringify(suggestions, null, 2)};\n`,
);
// Widget copy owned by the content agent (content/i18n/*.ts → chat): mapped onto the widget's own string keys, so
// the site and the widget never disagree (e.g. the privacy notice). Only plain strings; missing keys keep the
// widget's built-in text.
const COPY_KEYS = {
  title: "title",
  disclaimer: "disclaimer",
  privacy: "privacy",
  greeting: "welcome",
  placeholder: "placeholder",
  inputLabel: "input",
  newChat: "newChat",
  send: "send",
  stop: "stop",
  retry: "retry",
  thinking: "thinking",
  suggestionsTitle: "suggested",
};
const copy = { en: {}, ar: {} };
const i18nEntry = join(root, "content", "i18n", "index.ts");
if (existsSync(i18nEntry)) {
  try {
    const out = await build({ entryPoints: [i18nEntry], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" });
    const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
    for (const lang of ["en", "ar"]) {
      const chat = mod.messages?.[lang]?.chat ?? {};
      for (const [from, to] of Object.entries(COPY_KEYS)) if (typeof chat[from] === "string" && chat[from].trim()) copy[lang][to] = chat[from].trim();
    }
  } catch (e) {
    if (requireContent) fail(`content/i18n could not be loaded: ${e.message}`);
    if (!quiet) console.warn(`gen-content: content/i18n could not be loaded (${e.message}); the widget keeps its built-in copy.`);
  }
}
write(
  "chat-widget/src/generated/copy.ts",
  banner +
    `/** Widget strings from content/i18n (chat section), keyed by the widget's own string names. */\n` +
    `export const COPY: { en: Record<string, string>; ar: Record<string, string> } = ${JSON.stringify(copy, null, 2)};\n`,
);

if (!quiet) {
  const kTokens = Math.round((systemPrompt.length + knowledge.length) / 4);
  console.log(`gen-content: ${source} content v${version} (~${kTokens} tokens of instructions), ${suggestions.en.length}+${suggestions.ar.length} suggestions`);
}

function write(rel, text) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  // Rewrite only on change (keeps wrangler's watcher quiet).
  if (existsSync(file) && readFileSync(file, "utf8") === text) return;
  writeFileSync(file, text);
}

/**
 * The knowledge base's most important parts that fit in `budget` characters, in their original order. Units are the
 * "### " subsections of each "## " section (plus the section's own intro), so a long section such as the case studies
 * can be kept in part: identity and contact, "not stated", the fit guide, education and certifications first, then
 * the main roles, the STA case study (its 96/27 figure) and the government assistant's rules, the Arabic terminology,
 * and the rest. A rule on a "## " title takes the whole section or nothing. Deterministic: no model involved.
 */
function compactKnowledge(text, budget) {
  const parts = text.split(/^(?=## )/m);
  const head = parts[0].startsWith("## ") ? "" : parts.shift();
  const sections = parts.map((p, si) => p.split(/^(?=### )/m).map((t, ui) => ({ si, ui, t, title: t.split("\n")[0] })));
  const rules = [
    { sec: /at a glance/i },
    { sec: /contact/i },
    { sec: /not stated/i },
    { sec: /fit guide/i },
    { sec: /education/i },
    { sec: /certification/i },
    { sub: /· Globant ·/ },
    { sub: /· Wakeb Data ·/ },
    { sub: /· ArabsStock ·/ },
    { sub: /^### 4\.1\b/ },
    { sub: /^### 4\.4\b/ },
    { sec: /terminology/i },
    { sub: /Empoweromics ·|Tabaqat ·|AestheticsPro|Misria|Military Technical|British University|Freelance: Logic/ },
    { sec: /honou?r/i },
    { sec: /teaching|mentor/i },
    { sub: /^### 4\.3\b/ },
    { sub: /^### 4\.2\b/ },
    { sec: /skills/i },
    { sec: /working style/i },
    { sec: /open.source/i },
    { sec: /this website/i },
    { sub: /^### 4\./ },
    { sub: /Timeline/ },
  ];
  const chosen = new Set();
  let size = head.length;
  /** Adds the units (and their section's intro) when they fit; all or nothing. */
  const take = (units) => {
    const add = new Set();
    for (const u of units) for (const x of [sections[u.si][0], u]) if (!chosen.has(x)) add.add(x);
    const c = [...add].reduce((n, u) => n + u.t.length, 0);
    if (size + c > budget) return;
    for (const u of add) chosen.add(u);
    size += c;
  };
  for (const r of rules) {
    if (r.sec) {
      const s = sections.find((units) => r.sec.test(units[0].title));
      if (s) take(s);
    } else for (const s of sections) for (const u of s) if (u.ui > 0 && r.sub.test(u.title)) take([u]);
  }
  return (head + sections.flat().filter((u) => chosen.has(u)).map((u) => u.t).join("")).trim();
}

/**
 * The site's pages the assistant may link to: home, CV and privacy in both languages, and every case-study page
 * (content/profile.ts → caseStudies[].slug, the same list site/src/pages/work/[slug].astro builds). Null when the
 * profile can't be loaded (fixture runs): the link guard then allows only the paths written in the sources.
 */
async function loadSitePaths() {
  const entry = join(root, "content", "profile.ts");
  if (!existsSync(entry)) return null;
  try {
    const out = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" });
    const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
    const slugs = (mod.profile ?? mod.default)?.caseStudies?.map((c) => c.slug).filter((x) => typeof x === "string" && /^[a-z0-9-]+$/.test(x)) ?? [];
    if (!slugs.length) throw new Error("no case studies");
    const pages = ["/", "/cv/", "/privacy/", ...slugs.map((slug) => `/work/${slug}/`)];
    return [...pages, ...pages.map((p) => `/ar${p}`)];
  } catch (e) {
    if (requireContent) fail(`content/profile.ts could not be loaded for the link allow-list: ${e.message}`);
    if (!quiet) console.warn(`gen-content: content/profile.ts could not be loaded (${e.message}); site links limited to the sources.`);
    return null;
  }
}

function fail(msg) {
  console.error(`gen-content: ${msg}`);
  process.exit(1);
}

/**
 * Accepts the shapes a content file might reasonably use and returns { en: Suggestion[], ar: Suggestion[] } with
 * Suggestion = { label, prompt } (label: chip text, prompt: the message sent; a plain string is both):
 *   { en: [{ label, prompt }], ar: […] } · { en: ["…"], ar: ["…"] } · [{ en, ar }] · { suggestions: … }
 */
function normaliseSuggestions(raw) {
  if (raw && !Array.isArray(raw) && raw.suggestions) raw = raw.suggestions;
  const out = { en: [], ar: [] };
  const one = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const item = (v) => {
    if (typeof v === "string") return { label: one(v), prompt: one(v) };
    if (!v || typeof v !== "object") return null;
    const prompt = one(v.prompt ?? v.question ?? v.text ?? v.q ?? v.label);
    const label = one(v.label ?? v.text ?? prompt);
    return { label, prompt };
  };
  if (Array.isArray(raw)) {
    for (const entry of raw) for (const lang of ["en", "ar"]) if (entry?.[lang]) out[lang].push(item(entry[lang]));
  } else if (raw && typeof raw === "object") {
    for (const lang of ["en", "ar"]) for (const entry of raw[lang] ?? []) out[lang].push(item(entry));
  }
  for (const lang of ["en", "ar"]) {
    out[lang] = out[lang]
      .filter((s) => s && s.label.length > 0 && s.label.length <= 80 && s.prompt.length > 0 && s.prompt.length <= 400)
      .slice(0, 8);
  }
  return out;
}
