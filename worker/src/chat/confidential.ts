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

/* ------------------------------------------------------------------ indistinguishable answers (R6-03) */

/**
 * The fixed, polite answer: neither confirms nor denies any name, compares the client with no other organisation,
 * and reads like the model's own deflection (plain text, same facts).
 */
export const CONFIDENTIAL_REPLY: Record<Lang, string> = {
  en:
    "For confidentiality, that client is described only as a Saudi government client, so I can't confirm or deny any name. " +
    "What is public: at Wakeb Data, Hatem built a bilingual (Arabic/English) enterprise assistant for this client, with LLM evaluation and observability monitoring for response quality.",
  ar:
    "حفاظًا على السرية، يُشار إلى هذا العميل فقط بأنه جهة حكومية سعودية، لذلك لا يمكنني تأكيد أي اسم أو نفيه. " +
    "المعلَن هو أن حاتم بنى لهذه الجهة في Wakeb Data مساعدًا مؤسسيًا ثنائي اللغة (العربية والإنجليزية)، مع تقييم النماذج اللغوية ومراقبة جودة الإجابات.",
};

/**
 * Chips for the fixed reply, drawn two at a time like the model's own varied chips. Each is answerable from the
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

/** @deprecated Fixed chips of the older reply; use {@link confidentialDeflection}. */
export const CONFIDENTIAL_FOLLOWUPS: Record<Lang, string[]> = {
  en: CONFIDENTIAL_CHIPS.en.slice(0, 2),
  ar: CONFIDENTIAL_CHIPS.ar.slice(0, 2),
};

/** The section the model links to when it deflects (open_section "work"). */
export const CONFIDENTIAL_SECTION = "work" as const;

/** The fixed reply with the model's deflection shape: the text, then open_section "work" and two chips from the pool. */
export function confidentialDeflection(lang: Lang, random: () => number = Math.random): { text: string; tools: ToolEvent[] } {
  const pool = [...CONFIDENTIAL_CHIPS[lang]];
  const pick = () => pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0]!;
  const questions = [pick(), pick()];
  return {
    text: CONFIDENTIAL_REPLY[lang],
    tools: [
      { name: "open_section", args: { id: CONFIDENTIAL_SECTION } },
      { name: "suggest_followups", args: { questions } },
    ],
  };
}

/* Name-independent reading of the visitor's latest message: is it asking who the client is, or trying a guess? */
const ASK_EN =
  /\b(?:who|whose|which|names?|named|called|identity|identify|initials?|first letters?|acronym|abbreviat\w*|stands? for|spell\w*|guess\w*|confirm\w*|deny|reveal\w*|real name|hint|yes or no|(?:is|was) (?:it|that|this|the|its|his)|(?:built|build|made|developed|deployed|delivered) (?:\w+ ){0,3}for)\b/i;
/** The client itself, not client-side code or clients in general. */
const CLIENT_EN =
  /\b(?:client(?![-\s](?:facing|side|server|code|librar\w+|sdk|apps?|components?))|customer|ministry|entity|commission|authority|government (?:agency|body|organi[sz]ation|department|side))\b/i;
/** "Same as", "a different one", "which sector": a question about the client only next to a client word. */
const COMPARE_EN = /\b(?:same|different|another|other|sector)\b/i;
/** An explicit guess: "was it X?", "confirm", "yes or no", "built for X". */
const GUESS_EN =
  /\b(?:(?:was|is|were) (?:it|that|this|they)|confirm\w*|yes or no|(?:built|build|made|developed|deployed|delivered) (?:\w+ ){0,3}for)\b|^\W*(?:or|maybe|perhaps)\b/i;
const ASK_AR =
  /من هي|من هو|من كان|من كانت|لمن|ما اسم|ما هو اسم|ما هي|(?<!\p{L})(?:ال|بال)?اسم(?:ها|ه)?(?!\p{L})|هل هي|هل هو|هل كان|هل كانت|(?<!\p{L})نفس(?!\p{L})|تأكيد|(?<!\p{L})[أا]كد|تؤكد|بنعم|صحيح|أليس كذلك|تهج|اختصار|أول حرف|الحرف الأول|الأحرف الأولى|(?<!\p{L})[أا]?خمن|(?<!\p{L})قطاع|أي جهة|أي وزارة|أي هيئة/u;
const GUESS_AR = /هل (?:كانت|كان|هي|هو|هم)|صحيح|أليس كذلك|بنعم|(?:^|\s)أم\s/u;
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
/** Public organisations the site names (questions about them are not about the unnamed client)... */
const PUBLIC_ORG = /globant|\bsta\b|touris|noura|سياح|نورة|جلوبانت|غلوبانت/i;
/** ...unless the message is clearly about the Wakeb assistant anyway. */
const WAKEB_CONTEXT = /wakeb|bilingual|enterprise assistant|government client|واكب|ثنائي اللغة|جهة حكومية|مساعد مؤسسي|مساعدًا مؤسسيًا/i;
/** A guess beside a public organisation still counts when it names a ministry or a government client. */
const GOVERNMENT_GUESS = /\bministry\b|\bgovernment (?:client|entity|agency|body)\b|وزارة|جهة حكومية/iu;
/** The unnamed client's assistant itself ("Was the bilingual assistant built for X?"), not bilingual work in general. */
const ITS_ASSISTANT = /\b(?:bilingual (?:enterprise )?assistant|enterprise assistant|government assistant|wakeb(?: data)?(?:'s|’s)? (?:enterprise )?assistant)\b|المساعد المؤسسي|مساعدًا مؤسسيًا|مساعد مؤسسي|المساعد ثنائي اللغة/i;
/** Guesses are short; a long message (a pasted job description) is never treated as one. */
const MAX_ASK_CHARS = 400;
/** The previous answer was about the unnamed client (the fixed reply, or the model's own deflection). */
const ABOUT_CLIENT = /Saudi government client|جهة حكومية سعودية/i;

/**
 * True when the visitor's message asks who the unnamed client is or tries to confirm a guess, judged without any
 * name, so a real guess and a wrong one are treated the same. `previousAnswer` (the assistant's last message, if any)
 * catches a bare follow-up guess ("Was it X?") right after an answer about the client.
 */
export function asksAboutUnnamedClient(text: string, previousAnswer = ""): boolean {
  if (!text || text.length > MAX_ASK_CHARS) return false;
  const guess = GUESS_EN.test(text) || GUESS_AR.test(text);
  if (PUBLIC_ORG.test(text) && !WAKEB_CONTEXT.test(text)) return guess && GOVERNMENT_GUESS.test(text);
  const asks = ASK_EN.test(text) || ASK_AR.test(text);
  const client = CLIENT_EN.test(text) || clientAr(text);
  if (client && (asks || COMPARE_EN.test(text))) return true;
  if (asks && ITS_ASSISTANT.test(text)) return true;
  return ABOUT_CLIENT.test(previousAnswer) && text.length <= 160 && (asks || guess);
}

