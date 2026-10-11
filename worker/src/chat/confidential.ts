/**
 * Confidentiality guard for the one unnamed client (the Saudi government client of the bilingual assistant at Wakeb
 * Data). Its names must never reach a visitor, not even when the visitor supplies them and the model repeats them.
 *
 * The check is confidential-core.mjs, shared with the repository checks: keyed hashes (HMAC-SHA-256) of the names'
 * normalised forms (confidential-hashes.json, generated from a gitignored file by worker/scripts/confidential-hashes.mjs),
 * matched on 1-3 word sequences spaced or joined, spelled-out letters, leetspeak, look-alike and invisible
 * characters, Arabic diacritics and tatweel, reversed and base64 forms. The repository holds no name and no unkeyed
 * hash of one.
 *
 * The key is the Worker secret CONFIDENTIAL_HMAC_KEY. {@link confidentialFor} builds the matcher from it once per
 * isolate and returns null when it is missing, malformed or not the key the list was made with: the chat must then
 * fail closed (the handler answers 503 "unavailable"). Without a key, `new ConfidentialMatcher()` blocks everything in
 * the Workers runtime (every answer becomes the fixed reply) and matches nothing elsewhere (unit tests, which hash
 * placeholder names with a fixed test key: worker/test/confidential-fixtures.ts).
 *
 * Streaming ({@link ConfidentialScanner}): a name can span chunks, so the last two complete words, any unfinished word,
 * a run of spelled-out letters and an unfinished base64 run are held back until the next chunk shows they can't
 * start a name.
 *
 * Indistinguishable answers (R6-03): {@link asksAboutUnnamedClient} spots, without looking at any name, a visitor
 * asking who the client is or trying to confirm a guess; such turns get {@link confidentialDeflection} whatever the
 * guess, real or not, with the UI events the model's own deflections carry (a link to the work section and two chips
 * from a pool). The same deflection replaces an answer the guard stops.
 */
import HASHES from "./confidential-hashes.json";
import { foldArabic, Hasher, keyIdOf, Matcher, normWords, parseKey, Scanner, SCHEME, sha256Hex, warmUp, type Span } from "./confidential-core.mjs";
import { asksAboutFit, ITS_ASSISTANT, MENTIONS_GOV_ASSISTANT, OTHER_WORK } from "./intent";
import { hasUnknownName } from "./names";
import type { Lang, ToolEvent } from "./protocol";

export { foldArabic, normWords, sha256Hex };

/** The Worker secret (also the .env entry and the CI secret) holding the key: 64 hex characters. */
export const CONFIDENTIAL_KEY_NAME = "CONFIDENTIAL_HMAC_KEY";

/** workerd reports this user agent (Node, where the unit tests run, reports its own). */
const IN_WORKERS_RUNTIME = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/** A keyed one-entry list that no text can match (normalised words never contain U+0000). */
function inertMatcher(): Matcher {
  const hasher = new Hasher(parseKey("00".repeat(32)));
  return new Matcher({ hasher, names: [hasher.hex("\u0000")], starts: [], prefixes: [] });
}

/**
 * The keyless default: fail closed in the Workers runtime; elsewhere (unit tests) the inert list, so answers stream
 * with the same held-back words as in production.
 */
function keylessDefault(): Matcher {
  return IN_WORKERS_RUNTIME ? new Matcher({ blockAll: true }) : inertMatcher();
}

// Unicode regexes and the hashing/scanning code compiled at isolate start, outside any request's 10 ms CPU budget.
warmUp(inertMatcher());

/* ------------------------------------------------------------------ matcher */

export class ConfidentialMatcher {
  readonly core: Matcher;

  /**
   * `new ConfidentialMatcher()`: no key, so fail closed in the Workers runtime and match nothing elsewhere (use
   * {@link confidentialFor} in production). `new ConfidentialMatcher(digests)`: unkeyed SHA-256 digests of normalised
   * phrases, for older tests only. `new ConfidentialMatcher(undefined, core)`: wraps a keyed core matcher.
   */
  constructor(digests?: Iterable<string>, core?: Matcher) {
    if (core) this.core = core;
    else if (digests) this.core = new Matcher({ names: digests });
    else this.core = keylessDefault();
  }

  /** Number of listed forms. */
  get size(): number {
    return this.core.size;
  }

  /** True for the fail-closed matcher: every text counts as naming the client. */
  get blocksAll(): boolean {
    return this.core.blockAll;
  }

  /** True when `text` names the client in any of the forms above. */
  mentions(text: string): boolean {
    return this.core.mentions(text);
  }

  /** Where `text` first names the client, or null. */
  find(text: string): Span | null {
    return this.core.find(text);
  }
}

/** The shipped list is usable: the current scheme, at least the 7 canonical forms, prefilters, and only digests. */
const LIST_OK =
  HASHES.scheme === SCHEME &&
  HASHES.canonical.length >= 7 &&
  [HASHES.variants, HASHES.starts, HASHES.prefixes].every((list) => list.length > 0) &&
  [HASHES.canonical, HASHES.variants, HASHES.starts, HASHES.prefixes].every((list) => list.every((h) => /^[0-9a-f]{64}$/.test(h)));
const byKey = new Map<string, ConfidentialMatcher | null>();
let warned = false;

/**
 * The shipped list keyed with `key` (env.CONFIDENTIAL_HMAC_KEY), built once per isolate; null when the key is
 * missing, malformed or not the one confidential-hashes.json was made with. Null means the chat must not answer.
 */
export function confidentialFor(key: string | null | undefined): ConfidentialMatcher | null {
  const text = key ?? "";
  if (byKey.has(text)) return byKey.get(text)!;
  const bytes = LIST_OK ? parseKey(text) : null;
  let matcher: ConfidentialMatcher | null = null;
  if (bytes) {
    const hasher = new Hasher(bytes);
    if (keyIdOf(hasher) === HASHES.keyId)
      matcher = new ConfidentialMatcher(
        undefined,
        new Matcher({ hasher, names: [...HASHES.canonical, ...HASHES.variants], starts: HASHES.starts, prefixes: HASHES.prefixes }),
      );
  }
  if (!matcher && !warned) {
    warned = true;
    // Content-free: never the key, never a name.
    console.error(`confidential: ${CONFIDENTIAL_KEY_NAME} is missing, malformed or not the key of confidential-hashes.json; the chat fails closed`);
  }
  if (byKey.size >= 4) byKey.clear();
  byKey.set(text, matcher);
  return matcher;
}

/* ------------------------------------------------------------------ escaped text (R7-11) */

/** Runs of 3+ percent-escapes or HTML numeric entities ("%5A%65…", "&#90;&#101;…", "&#x5A;…"). */
const ESCAPED_RUN = /(?:%[0-9A-Fa-f]{2}[\s+]*){3,}|(?:&#(?:\d{1,7}|[xX][0-9A-Fa-f]{1,6});?[\s]*){3,}/g;

/** The run decoded (percent-escapes as UTF-8, entities as code points); null when it isn't valid. */
function decodeRun(run: string): string | null {
  try {
    if (run.includes("%")) return decodeURIComponent(run.replace(/\+/g, " ").replace(/\s+/g, ""));
    return run.replace(/&#([xX][0-9A-Fa-f]{1,6}|\d{1,7});?\s*/g, (_, n: string) => String.fromCodePoint(n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : Number(n)));
  } catch {
    return null;
  }
}

/**
 * True when a run of percent-escapes or HTML entities in `text` decodes to a listed name. A model asked to "write it
 * URL-encoded" would get past the word matcher, and a browser, or the visitor, decodes it at once.
 */
export function escapedNameIn(text: string, matcher: ConfidentialMatcher): { start: number; end: number } | null {
  if (!/%[0-9A-Fa-f]{2}|&#/.test(text)) return null;
  for (const m of text.matchAll(ESCAPED_RUN)) {
    const decoded = decodeRun(m[0]);
    if (decoded && matcher.mentions(decoded)) return { start: m.index!, end: m.index! + m[0].length };
  }
  return null;
}

/* ------------------------------------------------------------------ streaming */

/**
 * Incremental scan of a growing answer: `push` returns how much of the text is safe to show (the held-back tail is
 * described in the header), or -1 once a listed form has appeared.
 */
export class ConfidentialScanner {
  private readonly scanner: Scanner;

  constructor(matcher: ConfidentialMatcher) {
    this.scanner = new Scanner(matcher.core);
  }

  get hit(): boolean {
    return this.scanner.hit;
  }

  /** Adds text; returns the safe end index into the whole text, or -1 once a listed form has appeared. */
  push(chunk: string, final = false): number {
    return this.scanner.push(chunk, final);
  }
}

/* ------------------------------------------------------------------ indistinguishable answers (R6-03, R7-01, R7-03) */

/**
 * The fixed answer to a question about who the government assistant's client is (or a guess at it). It never says
 * which client the visitor asked about ("that client is…" turned "Who was his client at Wakeb?" into a statement that
 * his Wakeb client is the unnamed one, which the CV's role-level client then names: audit R7-01): it is conditional
 * ("if you mean the bilingual assistant"), names no other organisation, compares with none, and says what is public.
 */
export const CONFIDENTIAL_REPLY: Record<Lang, string> = {
  en:
    "If you mean the bilingual enterprise assistant Hatem built at Wakeb Data: its client isn't named publicly, so I can't confirm or deny any name, initials or sector. " +
    "What is public: it is a bilingual (Arabic/English) enterprise assistant for a Saudi government client, with LLM evaluation and observability monitoring for response quality.",
  ar:
    "إن كنت تقصد المساعد المؤسسي ثنائي اللغة الذي بناه حاتم في Wakeb Data، فاسم عميله غير معلن، لذلك لا يمكنني تأكيد أي اسم أو نفيه، ولا ذكر قطاعه أو اختصاره. " +
    "المعلَن أنه مساعد مؤسسي ثنائي اللغة (العربية والإنجليزية) لجهة حكومية سعودية، مع تقييم النماذج اللغوية ومراقبة جودة الإجابات.",
};

/**
 * The output guard's answer on a turn that isn't about the government assistant (R7-03): the model wrote a listed
 * name there, so it gets the answer the model gives for any organisation his profile doesn't name, not the
 * Saudi-government text (which would tie the name the visitor typed to that assistant).
 */
export const NOT_NAMED_REPLY: Record<Lang, string> = {
  en: "That organisation isn't named in Mohamed Hatem's profile, so I can't say anything about it. His employers and clients are listed in [Experience](https://mohamedhatem.dev/#experience).",
  ar: "لا يرد اسم هذه الجهة في ملف محمد حاتم، لذلك لا يمكنني قول شيء عنها. جهات عمله وعملاؤه مذكورة في قسم [الخبرات](https://mohamedhatem.dev/ar/#experience).",
};

/**
 * Chips for the fixed replies, drawn two at a time like the model's own varied chips. Each is answerable from the
 * knowledge base, and none leads to the Wakeb client list (so the unnamed client is never set beside another one).
 */
export const CONFIDENTIAL_CHIPS: Record<Lang, readonly string[]> = {
  en: [
    "How does he evaluate LLM outputs?",
    "What has he built with LangGraph?",
    "How does he run LLMs in production?",
    "Tell me about the 14-agent assistant",
    "What does he lead at Globant?",
  ],
  ar: [
    "كيف يقيّم مخرجات النماذج؟",
    "ماذا بنى باستخدام LangGraph؟",
    "كيف يشغّل النماذج في بيئة الإنتاج؟",
    "حدّثني عن المساعد المكوّن من 14 وكيلًا",
    "ماذا يقود في Globant؟",
  ],
};

/** The section each fixed reply links to (open_section), as the model does for the same answers. */
export const FIXED_SECTIONS = { confidential: "work", notNamed: "experience" } as const;
export type FixedReply = keyof typeof FIXED_SECTIONS;

/** A fixed reply with the model's answer shape: the text, then open_section and two chips from the pool. */
export function fixedReply(kind: FixedReply, lang: Lang, random: () => number = Math.random): { text: string; tools: ToolEvent[] } {
  const pool = [...CONFIDENTIAL_CHIPS[lang]];
  const pick = () => pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0]!;
  const questions = [pick(), pick()];
  return {
    text: (kind === "confidential" ? CONFIDENTIAL_REPLY : NOT_NAMED_REPLY)[lang],
    tools: [
      { name: "open_section", args: { id: FIXED_SECTIONS[kind] } },
      { name: "suggest_followups", args: { questions } },
    ],
  };
}

/** The confidentiality reply ({@link fixedReply} "confidential"). */
export function confidentialDeflection(lang: Lang, random: () => number = Math.random): { text: string; tools: ToolEvent[] } {
  return fixedReply("confidential", lang, random);
}

/*
 * Name-independent reading of the visitor's latest message (R7-01): the fixed reply is for questions tied to the
 * government assistant, i.e. the message names or clearly refers to that assistant or its client and asks who the
 * client is or tries a guess, or it is such a question right after an answer about that assistant. Questions about
 * his clients in general, his Wakeb client, his current client or another project's client go to the model.
 */

/** Its client, described ("the government client", "the confidential client", «الجهة الحكومية»). */
const ITS_CLIENT =
  /\b(?:(?:saudi )?government (?:client|customer|entity|body|agency|organi[sz]ation|ministry|department)|(?:unnamed|confidential|undisclosed|secret|anonymous|mystery|hidden) (?:client|customer|ministry|entity|organi[sz]ation)|public[- ]sector (?:client|organi[sz]ation|body|entity))s?\b|جهة حكومية|الجهة الحكومية|عميل حكومي|العميل الحكومي|(?:العميل|الجهة) (?:السري|السرية|المجهول|المجهولة|غير المسمى|غير المسماة)/iu;
/** Asking who the client is: its name or any part of it, its sector or city, "who was it for". */
const IDENTITY_EN =
  /\b(?:names?|named|called|identity|identify|initials?|first letters?|acronym|abbreviat\w*|stands? for|spell\w*|reveal\w*|real name|hint|sector|industry|city|located|whose|for whom)\b|\bwho\b[^?.!\n]{0,50}\bfor\b/i;
const IDENTITY_AR =
  /(?<!\p{L})(?:ال|بال)?اسم(?:ها|ه)?(?!\p{L})|ما اسم|تهج|اختصار|أول حرف|الحرف الأول|الأحرف الأولى|(?<!\p{L})قطاع|مدينة|من هي|من هو|من كان|من كانت|لمن|لصالح من|أي جهة|أي وزارة|أي هيئة/u;
const ASK_EN = /\b(?:who|whom|which)\b/i;
/** The client itself, not client-side code or clients in general. */
const CLIENT_EN =
  /\b(?:client(?![-\s](?:facing|side|server|code|librar\w+|sdk|apps?|components?))|customer|ministry|entity|commission|authority|agency|organi[sz]ation|department)\b/i;
/** Leading spaces and punctuation (not `\W`, which also matches Arabic letters). */
const LEAD = "^[\\s\\p{P}\\p{S}]*";
/** A guess: "was it X?", "is the client X?", "confirm", "yes or no", "built for X", "or X?". */
const GUESS_EN = new RegExp(
  `\\b(?:(?:was|is|were) (?:it|that|this|they|the client|its client)|confirm\\w*|deny|yes or no|guess\\w*|(?:built|build|made|developed|deployed|delivered) (?:\\S+ ){0,3}for)\\b|${LEAD}(?:or|maybe|perhaps)\\b`,
  "iu",
);
const GUESS_AR = /صحيح|أليس كذلك|بنعم|(?:^|\s)أم\s|تأكيد|(?<!\p{L})[أا]كد|تؤكد|(?<!\p{L})[أا]?خمن/u;
/** A yes/no question: a guess only when it offers a name or a client word ("Was GADD the client…?"). */
const YES_NO = new RegExp(`${LEAD}(?:was|is|were|did|does|has|had)\\b|هل (?:كانت|كان|هي|هو|هم)\\s|هل\\s+\\S+(?:\\s+\\S+)?\\s+(?:هي|هو|كانت|كان)\\s`, "iu");
/** "The same as", "a different one": comparing the client with another organisation. */
const COMPARE = /\b(?:same|different|another|other|separate|second)\b|(?<!\p{L})نفس(?!\p{L})|ذاتها|(?<!\p{L})أخرى|مختلفة/iu;
/** Arabic client words, matched as whole words with their clitics (و ف ب ك ل, ال / لل). */
const CLIENT_AR_STEMS = new Set(["جهة", "جهه", "وزارة", "وزاره", "هيئة", "هيئه", "عميل", "مؤسسة", "مؤسسه"]);
const AR_CLITICS = ["", "و", "ف", "ب", "ك", "ل", "وب", "ول", "فب", "فل", "وك", "ال", "وال", "فال", "بال", "كال", "لل", "ولل", "فلل"];
/** Words that only look like a clitic + client word ("وجهة": a destination, a point of view). */
const NOT_CLIENT_AR = new Set(["وجهة", "وجهه"]);
function clientAr(text: string): boolean {
  for (const raw of text.replace(/من جهة أخرى|من جهة/gu, " ").match(/[\p{L}\p{M}]+/gu) ?? []) {
    const w = raw.replace(/\p{M}/gu, "").replace(/ـ/g, "");
    if (NOT_CLIENT_AR.has(w)) continue;
    if (AR_CLITICS.some((c) => w.startsWith(c) && CLIENT_AR_STEMS.has(w.slice(c.length)))) return true;
  }
  return false;
}
/** A previous answer about the government assistant: the fixed reply, the model's own deflection, or a mention. */
const DEFLECTION_START = new RegExp(`${LEAD}(?:if you mean the bilingual|for confidentiality|إن كنت تقصد المساعد|حفاظًا على السرية|للسرية)`, "iu");
/** Short follow-ups that only offer a name: "And X?", "Or X?", "What about X?", "X then." */
const BARE_LEAD_EN = new RegExp(`${LEAD}(?:and|or|what about|how about|maybe|perhaps|so|then|i think|i bet|i guess|it'?s|it is|it was|was it|is it|interesting,?)\\b\\s*`, "iu");
const BARE_QUESTION_EN = /\b(?:what|how|why|when|where|who|which|does|did|can|could|tell|show|list|explain|describe|he|his|him|hatem|mohamed)\b/i;
const BARE_LEAD_AR = new RegExp(`${LEAD}(?:وماذا عن\\s|ماذا عن\\s|أو\\s|او\\s|ربما\\s|يعني\\s|طيب\\s|و(?=\\p{L}))\\s*`, "u");
const BARE_TOPIC_AR = /مهار|خبر|مشروع|مشاريع|تعليم|دراس|شهاد|تواصل|سيرت|سيرة|وظيف|مهام|أدوات|ادوات|تقني|لغات|موقع|فريق|شكر|تمام|حسن|ممتاز|رائع|جميل/u;
/** Guesses are short; a long message (a pasted job description) is never treated as one. */
const MAX_ASK_CHARS = 300;

/** "And X?", "ZQLA?", «والزرافات؟»: a follow-up that is just a (name-shaped) guess. */
function bareGuess(text: string): boolean {
  if (text.length > 80) return false;
  if (/[A-Za-z]/.test(text)) {
    const lead = BARE_LEAD_EN.exec(text);
    const rest = text.slice(lead ? lead[0].length : 0);
    const words = rest.match(/[\p{L}\p{N}'’&-]+/gu) ?? [];
    // "And X?" / "What about X?", or a message that is only a name ("ZQLA?", "Zebra Holdings.").
    const onlyName = words.length > 0 && words.every((w) => /^[A-Z0-9]/.test(w) || /^(?:of|for|and|the|al|el|de)$/.test(w));
    return (Boolean(lead) || onlyName) && words.length <= 6 && !BARE_QUESTION_EN.test(rest) && hasUnknownName(rest, true);
  }
  const lead = BARE_LEAD_AR.exec(text);
  const ar = text.replace(BARE_LEAD_AR, "");
  const arWords = ar.match(/\p{Script=Arabic}+/gu) ?? [];
  return Boolean(lead) && arWords.length >= 1 && arWords.length <= 3 && !BARE_TOPIC_AR.test(ar) && !/\p{Script=Arabic}+ه[؟?]?\s*$/u.test(ar);
}

/**
 * True when the visitor's message asks who the government assistant's client is or tries to confirm a guess at it,
 * judged without any name, so a real guess and a wrong one are treated the same. `previousAnswer` (the assistant's
 * last message, if any) and `previousQuestion` (the visitor's message before this one) tie a short follow-up ("Was
 * it X?", "And X?", "Repeat the client's name") to a conversation about that assistant; the answer alone isn't enough,
 * since the browser stores it and a forged one may hide the assistant. A job description or fit question is never
 * deflected (R7-02): it gets the fit assessment, and the guard stays the backstop.
 */
export function asksAboutUnnamedClient(text: string, previousAnswer = "", previousQuestion = ""): boolean {
  if (!text || text.length > MAX_ASK_CHARS || asksAboutFit(text)) return false;
  const identity = IDENTITY_EN.test(text) || IDENTITY_AR.test(text);
  const client = CLIENT_EN.test(text) || clientAr(text);
  const asksWho = (ASK_EN.test(text) && client) || identity;
  const guess = GUESS_EN.test(text) || GUESS_AR.test(text);
  const named = () => client || hasUnknownName(text);
  const offers = guess || ((YES_NO.test(text) || COMPARE.test(text)) && named());
  const its = ITS_ASSISTANT.test(text);
  // About the assistant or its client, and not about another project that a "government client" phrase sits beside.
  if ((its || (ITS_CLIENT.test(text) && !OTHER_WORK.test(text))) && (asksWho || offers)) return true;
  // A short follow-up right after an answer about that assistant.
  const afterGov =
    DEFLECTION_START.test(previousAnswer) ||
    MENTIONS_GOV_ASSISTANT.test(previousAnswer) ||
    ITS_ASSISTANT.test(previousQuestion) ||
    (ITS_CLIENT.test(previousQuestion) && !OTHER_WORK.test(previousQuestion));
  if (!afterGov || text.length > 160 || OTHER_WORK.test(text)) return false;
  if (asksWho || (guess && named()) || (offers && !guess)) return true;
  if (new RegExp(`${LEAD}(?:هل (?:كانت|هي)|أم|أو)\\s`, "u").test(text) && text.length <= 60) return true;
  return bareGuess(text);
}
