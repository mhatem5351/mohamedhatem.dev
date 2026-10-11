/**
 * Organisation names a visitor types, read by their shape only (audit R7-03).
 *
 * A right guess at the unnamed client and a wrong one must look the same. The deflection (confidential.ts) covers
 * questions about the government assistant's client; on every other turn the visitor's own words reach the model,
 * which may repeat a name it is given, and only a listed name would then trip the output guard: a visible difference.
 * So, before the model sees the conversation:
 *
 *   1. {@link maskOrganisations}: every organisation-shaped name the knowledge base doesn't name ("Ministry of X",
 *      "X Authority", «وزارة X», «هيئة X»…) becomes "[organisation]" / «[جهة]», decided by shape alone, so a real
 *      guess and a same-shape wrong one reach the model as the same text;
 *   2. {@link maskListed}: whatever is still a listed name (keyed hash check, confidential.ts) gets the same
 *      placeholder, so the model can't repeat a name in a shape the first step doesn't know.
 *
 * The prompt tells the model to treat the placeholder like any organisation his profile doesn't name ("that
 * organisation isn't named in his profile"), the rule it also follows for names it does see. Organisations the
 * knowledge base names (the Saudi Tourism Authority, the Saudi Ministry of Defense, his universities…) are kept.
 */
import { KNOWLEDGE } from "../generated/content";
import { foldArabic } from "./confidential-core.mjs";
import { escapedNameIn, type ConfidentialMatcher } from "./confidential";

export const ORG_PLACEHOLDER = { en: "[organisation]", ar: "[جهة]" } as const;

/* ------------------------------------------------------------------ English */

/** Words that make a capitalised phrase an organisation (capitalised, as in a name). */
const HEAD_EN =
  "(?:Ministry|Ministries|Authority|Commission|Agency|Council|Directorate|Department|Presidency|Corporation|Organi[sz]ation|Foundation|Bureau|Administration|Centre|Center|Programme|Program|Fund|Company|Holdings?|Bank|Institute|University|College|Academy|Court|Committee|Society|Chamber|Federation|Diwan)";
/** Capitalised words that start a question or a sentence, never a name ("Which Ministry…", "What University…"). */
const FUNCTION_EN =
  "(?:What|Which|Who|Whose|Whom|Where|When|How|Why|Did|Does|Do|Is|Was|Are|Were|Has|Had|Have|Can|Could|Would|Should|Will|May|Must|Tell|Give|List|Show|Name|His|Her|Its|Their|Our|Your|My|A|An|The|This|That|These|Those|And|Or|But|If|In|On|At|For|Of|To|From|With|By|Any|Some|Every|Each|Another|Other|Same|Different|Former|Previous|Current|I|We|You|He|She|They|It|Hatem|Mohamed)";
/** A capitalised word or an acronym (letters, Arabic-name particles such as "Al-", apostrophes). */
const CAP = "(?:[A-Z][\\p{L}\\p{M}'’-]*)";
/** A capitalised word that may begin a name (not a question word). */
const NAME_CAP = `(?:(?!${FUNCTION_EN}\\b)${CAP})`;
/** Words inside a name that are not capitalised. */
const LINK = "(?:of|for|and|&|the|on|in|de|al|el)";
/**
 * "Ministry of X Y", "General Authority for X and Y" (head, then of/for and capitalised words), or "X Y Authority"
 * (capitalised words, then the head), with "the" before it and an acronym in brackets after it.
 */
const ORG_EN = new RegExp(
  `(?:\\b[Tt]he\\s+)?(?:(?:${NAME_CAP}\\s+){0,4}\\b${HEAD_EN}\\s+(?:of|for)\\s+(?:the\\s+)?${CAP}(?:\\s+(?:${LINK}\\s+){0,2}${CAP}){0,5}|(?:${NAME_CAP}\\s+(?:(?:and|&|of|for)\\s+)?){1,4}${HEAD_EN})\\b(?:\\s*\\([A-Z]{2,8}\\))?`,
  "gu",
);
/** Words of a name that don't identify it ("Saudi", "General", the head, links). */
const GENERIC_EN = new RegExp(`^(?:${HEAD_EN}|${LINK}|saudi|general|national|royal|kingdom|supreme|higher|high|public|federal|state|arab|arabia|of|the)$`, "iu");

/* ------------------------------------------------------------------ Arabic */

/** An Arabic organisation word, with the clitics it can carry (و ف ب ك ل, ال / لل). */
const HEAD_AR =
  /^((?:[وف]?[بكل]?|لل|ولل|فلل))(?:ال)?(وزارة|وزاره|هيئة|هيئه|مؤسسة|مؤسسه|جهة|جهه|مركز|صندوق|شركة|شركه|مجلس|رئاسة|رئاسه|ديوان|إدارة|اداره|مديرية|مديريه|جامعة|جامعه|كلية|كليه|معهد|أكاديمية|اكاديميه|بنك|مصرف|برنامج|مدينة|مدينه|لجنة|لجنه|منظمة|منظمه)$/u;
/** Words after an Arabic organisation word that belong to its name: definite (ال، لل، بال…) or joined with و. */
const NAME_WORD_AR = /^(?:و|ف)?(?:ال|لل|بال|كال|لـ?ال)\p{L}{2,}$/u;
/** Words that start like a name word but describe rather than name ("the government one", "the same one"). */
const GENERIC_AR = new Set(
  ["الحكومية", "الحكومي", "السعودية", "السعودي", "العامة", "العام", "الأخرى", "الاخرى", "نفسها", "ذاتها", "المذكورة", "المعنية", "المسؤولة", "الوطنية", "الكبرى", "الرسمية", "الخاصة", "العربية", "الملكية", "العليا"].map(foldArabic),
);
/** Words that end a name (relative pronouns, time words). */
const STOP_AR = new Set(["التي", "الذي", "الذين", "اللذين", "اللتين", "الآن", "اليوم", "اللي"].map(foldArabic));

/* ------------------------------------------------------------------ what the knowledge base names */

const normEn = (w: string) => w.toLowerCase().replace(/['’]s$/, "").replace(/defence/g, "defense").replace(/[^\p{L}\p{N}-]/gu, "");
const normAr = (w: string) => foldArabic(w.replace(/\p{M}/gu, "")).replace(/^(?:و|ف)?(?:بال|كال|لل|ال|ل)/u, "");

/** The words that identify an English organisation span (no head, link or generic words). */
function contentWordsEn(span: string): string[] {
  return (span.match(/[\p{L}\p{N}'’-]+/gu) ?? []).filter((w) => !GENERIC_EN.test(w)).map(normEn).filter(Boolean);
}

interface ArSpan {
  start: number;
  end: number;
  clitic: string;
  words: string[];
}

/** Arabic organisation spans: an organisation word and the 1-3 name words after it. */
function arabicSpans(text: string): ArSpan[] {
  const out: ArSpan[] = [];
  const words = [...text.matchAll(/[\p{L}\p{M}ـ]+/gu)];
  for (let i = 0; i < words.length; i++) {
    const head = HEAD_AR.exec(foldArabic(words[i]![0].replace(/\p{M}/gu, "")).replace(/ـ/g, ""));
    if (!head) continue;
    const name: string[] = [];
    let j = i + 1;
    for (; j < words.length && name.length < 3; j++) {
      const raw = words[j]![0];
      // Only words that follow directly (a space, nothing else between them).
      const gap = text.slice(words[j - 1]!.index! + words[j - 1]![0].length, words[j]!.index!);
      if (!/^\s+$/u.test(gap) || gap.includes("\n")) break;
      const w = foldArabic(raw.replace(/\p{M}/gu, "")).replace(/ـ/g, "");
      if (STOP_AR.has(w) || !NAME_WORD_AR.test(w)) break;
      name.push(w);
    }
    if (!name.length) continue;
    const last = words[i + name.length]!;
    out.push({ start: words[i]!.index!, end: last.index! + last[0].length, clitic: head[1] ?? "", words: name.filter((w) => !GENERIC_AR.has(w)).map(normAr) });
    i += name.length;
  }
  return out;
}

/**
 * Identifying words of every organisation the knowledge base names (public by definition). Not the instructions:
 * their examples use made-up organisations.
 */
const KNOWN_ORG_WORDS: ReadonlySet<string> = (() => {
  const known = new Set<string>();
  for (const m of KNOWLEDGE.matchAll(ORG_EN)) for (const w of contentWordsEn(m[0])) known.add(w);
  for (const s of arabicSpans(KNOWLEDGE)) for (const w of s.words) known.add(w);
  return known;
})();

/** Every Latin word of the knowledge base, lower case (product names, tools, employers…). */
export const KNOWN_WORDS: ReadonlySet<string> = (() => {
  const known = new Set<string>();
  for (const m of KNOWLEDGE.matchAll(/[A-Za-z][A-Za-z0-9'’-]*/g)) known.add(normEn(m[0]));
  return known;
})();

/* ------------------------------------------------------------------ masking */

/** Organisation-shaped names in `text` that the knowledge base doesn't name. */
function unknownSpans(text: string): { start: number; end: number; replacement: string }[] {
  const spans: { start: number; end: number; replacement: string }[] = [];
  for (const m of text.matchAll(ORG_EN)) {
    const words = contentWordsEn(m[0]);
    if (words.length && !words.every((w) => KNOWN_ORG_WORDS.has(w))) spans.push({ start: m.index!, end: m.index! + m[0].length, replacement: ORG_PLACEHOLDER.en });
  }
  for (const s of arabicSpans(text)) {
    if (s.words.length && !s.words.every((w) => KNOWN_ORG_WORDS.has(w)))
      spans.push({ start: s.start, end: s.end, replacement: `${s.clitic.replace(/ل?ل$/, "ل")}${ORG_PLACEHOLDER.ar}` });
  }
  return spans.sort((a, b) => a.start - b.start).filter((s, i, all) => i === 0 || s.start >= all[i - 1]!.end);
}

/** True when the text names an organisation (by its shape) that the knowledge base doesn't name. */
export function namesUnknownOrganisation(text: string): boolean {
  return unknownSpans(text).length > 0;
}

/** A capitalised word or an acronym that may be (part of) a name. */
const NAME_WORD = "[A-Z][\\p{L}\\p{N}'’&.-]*";
const NAME_RUN = `${NAME_WORD}(?:\\s+(?:(?:of|for|and|&|the|al|el|de)\\s+)?${NAME_WORD}){0,4}`;
/**
 * Where a visitor puts a one-word name ("ZebraCorp", "ZQLA"): after "work for / with / at", "mention", "named",
 * "about"…, after "repeat: / say: / translate:", at the start of "And X?", "Is X one of…", "Was it X?".
 */
/** Slot words as written at a sentence start too ("Repeat", "Was it"): only their first letter may be capitalised. */
const cased = (words: string) => words.replace(/(^|\|)([a-z])/g, (_, bar: string, c: string) => `${bar}[${c.toUpperCase()}${c}]`);
const NAME_SLOT = new RegExp(
  `(?:\\b(?:${cased("for|with|at|from|by|mentions?|mentioning|named|called|about|client|customer|than|versus|vs\\.?|including|include")})\\s+(?:the\\s+)?` +
    `|\\b(?:${cased("repeat|say|write|type|spell|echo|translate")})\\b[^:\\n]{0,40}[:–-]\\s*["“«']?` +
    `|^[\\s\\p{P}\\p{S}]*(?:(?:${cased("and|or|what about|how about|maybe|perhaps|so|then|is it|was it|is|was|were|did|does")})\\s+){1,2}(?:the\\s+)?)(${NAME_RUN})`,
  "gmu",
);
/** A whole message that is only a name: "ZQLA?", "ZebraCorp Holdings." (a single plain word like "Explain?" isn't). */
const BARE_NAME = new RegExp(`^[\\s\\p{P}\\p{S}]*(${NAME_RUN})[\\s\\p{P}\\p{S}]*$`, "u");
const FUNCTION_WORDS = new RegExp(`^${FUNCTION_EN}$`);

/** The words of a run that the knowledge base doesn't use, trimmed of known and function words at both ends. */
function unknownRun(run: string): { offset: number; text: string } | null {
  const words = [...run.matchAll(/[\p{L}\p{N}'’&.-]+/gu)];
  const unknown = (w: string) => /^[A-Z]/.test(w) && !FUNCTION_WORDS.test(w) && !SMALL_TALK.has(normEn(w)) && !KNOWN_WORDS.has(normEn(w)) && normEn(w).length >= 2;
  let a = 0;
  let b = words.length - 1;
  while (a <= b && !unknown(words[a]![0])) a++;
  while (b >= a && !unknown(words[b]![0])) b--;
  if (a > b) return null;
  // Every capitalised word in between must be unknown too (a known word inside means it's not one name).
  for (let i = a; i <= b; i++) if (/^[A-Z]/.test(words[i]![0]) && !unknown(words[i]![0])) return null;
  const start = words[a]!.index!;
  const end = words[b]!.index! + words[b]![0].length;
  return { offset: start, text: run.slice(start, end).replace(/[.]+$/, "") };
}

/** One-word names in the slots above (not in a job description: a requirement such as "GCP" must stay readable). */
function slotSpans(text: string): { start: number; end: number; replacement: string }[] {
  const spans: { start: number; end: number; replacement: string }[] = [];
  const add = (runStart: number, run: string, bare: boolean) => {
    const u = unknownRun(run);
    if (!u) return;
    // A bare message must look like a name, not like a word: an acronym, an inner capital or digit, or 2+ words.
    if (bare && !/^[A-Z]{2,}\b|[a-z][A-Z0-9]|\s/.test(u.text)) return;
    spans.push({ start: runStart + u.offset, end: runStart + u.offset + u.text.length, replacement: ORG_PLACEHOLDER.en });
  };
  for (const m of text.matchAll(NAME_SLOT)) add(m.index! + m[0].length - m[1]!.length, m[1]!, false);
  const bare = BARE_NAME.exec(text);
  if (bare) add(bare.index + bare[0].indexOf(bare[1]!), bare[1]!, true);
  return spans;
}

/** Steps 1 and 1b: organisation-shaped names, and (`words`) one-word names in name slots → the placeholder. */
export function maskOrganisations(text: string, words = false): string {
  const spans = [...unknownSpans(text), ...(words ? slotSpans(text) : [])]
    .sort((a, b) => a.start - b.start)
    .filter((s, i, all) => i === 0 || s.start >= all[i - 1]!.end);
  let out = text;
  for (const s of spans.reverse()) out = out.slice(0, s.start) + s.replacement + out.slice(s.end);
  return out;
}

/**
 * Step 2: any listed form of the unnamed client's names still in the text → the placeholder. One pass: a cheap
 * check first (most messages name nobody), then each search resumes after the previous name, so the cost grows
 * with the text, not with how often a name is repeated (a pasted name repeated hundreds of times must not cost more
 * CPU, and so more time, than a wrong one).
 */
export function maskListed(text: string, matcher: ConfidentialMatcher): string {
  if (!text || matcher.blocksAll || !matcher.size) return text;
  // Percent-escaped or entity-encoded names first (R7-11): the model would decode them.
  for (let i = 0, run = escapedNameIn(text, matcher); run && i < 20; i++, run = escapedNameIn(text, matcher))
    text = text.slice(0, run.start) + ORG_PLACEHOLDER.en + text.slice(run.end);
  if (!matcher.mentions(text)) return text;
  let out = "";
  let rest = text;
  for (let span = matcher.find(rest); span && span.end > span.start; span = matcher.find(rest)) {
    const arabic = /\p{Script=Arabic}/u.test(rest.slice(span.start, span.end));
    out += rest.slice(0, span.start) + (arabic ? ORG_PLACEHOLDER.ar : ORG_PLACEHOLDER.en);
    rest = rest.slice(span.end);
  }
  return out + rest;
}

/**
 * Both steps, for one message of the conversation. `words`: also one-word names in name slots (the visitor's own
 * messages, except a job description).
 */
export function maskNames(text: string, matcher: ConfidentialMatcher, words = false): string {
  return maskListed(maskOrganisations(text, words), matcher);
}

/* ------------------------------------------------------------------ name-like words (for the deflection) */

const SMALL_TALK = new Set(["i", "i'm", "i'd", "ok", "okay", "hi", "hello", "hey", "thanks", "thank", "yes", "no", "please", "sure", "cool", "great", "nice", "wow"]);

/**
 * True when the text has a word shaped like a name the knowledge base doesn't use: a capitalised word that isn't
 * the first word of a sentence (`anywhere`: or is), or an acronym. Real and wrong guesses of the same shape get the same answer: neither
 * is in the knowledge base.
 */
export function hasUnknownName(text: string, anywhere = false): boolean {
  for (const m of text.matchAll(/[A-Z][\p{L}\p{N}'’-]*/gu)) {
    const word = m[0];
    const before = text.slice(0, m.index).replace(/["'“‘(«\s]+$/u, "");
    const sentenceStart = !anywhere && (before === "" || /[.!?:؟]$/.test(before));
    const acronym = /^[A-Z]{2,8}$/.test(word);
    if (sentenceStart && !acronym) continue;
    const w = normEn(word);
    if (w.length < 2 || SMALL_TALK.has(w) || KNOWN_WORDS.has(w)) continue;
    return true;
  }
  return namesUnknownOrganisation(text);
}

// Compile the Unicode regexes at isolate start, outside the first request's CPU budget.
maskOrganisations("Did he work for the Ministry of Example or ZQLA? هل عمل مع وزارة المثال؟", true);
hasUnknownName("And Example?");
