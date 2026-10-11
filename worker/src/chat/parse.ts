import { CHAT_LIMITS, type ChatMessage, type Lang } from "./protocol";
import { TURNSTILE_TOKEN_MAX } from "../turnstile";

/**
 * Removes characters that have no place in a chat message and are known prompt-injection / spoofing carriers:
 * C0/C1 controls (except tab and newline), bidi embeddings/overrides/isolates, zero-width space/word joiner/BOM,
 * interlinear annotations and Unicode "tag" characters (invisible ASCII smuggling). ZWJ/ZWNJ stay (emoji, Arabic).
 * Then NFC, CRLF → LF, at most two consecutive blank lines, trimmed.
 */
export function sanitizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​‎‏‪-‮⁠-⁤⁦-⁩﻿￹-￻]/g, "")
    .replace(/[\u{E0000}-\u{E007F}]/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cuts at a code-point boundary (never half a surrogate pair). */
export function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN = /[A-Za-z\u00C0-\u024F]/g;
/** Words, not letters: runs of Arabic letters (punctuation such as «؟» is never a word) and runs of Latin letters. */
const ARABIC_WORD = /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC][\u0621-\u065F\u0670-\u06D3\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]*/g;
const LATIN_WORD = /[A-Za-z\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F'’-]*/g;
/**
 * Arabic grammar words: a message whose Arabic words include two of these is Arabic with English terms in it
 * ("Can you tell me عن خبرة حاتم في RAG و vector databases؟"), not English quoting an Arabic phrase.
 */
const ARABIC_FUNCTION = new Set(["عن", "في", "من", "على", "إلى", "الى", "هل", "ما", "ماذا", "كيف", "لماذا", "متى", "أين", "و", "مع", "أو", "او", "هو", "هي", "لديه", "عنده", "عند", "لدى", "التي", "الذي", "كم", "اللي", "ايش", "وش", "إيه", "ايه", "فين"]);
/**
 * Arabizi (Arabic in Latin letters, with digits for Arabic sounds: 2 ء, 3 ع, 5 خ, 7 ح): a word of 4+ letters with one
 * of those digits before a letter ("3ando", "delwa2ti", "7abibi"). "2fa", "b2b", "e2e", "html5" and "gpt4" don't count.
 */
const arabiziWord = (w: string) => /^[a-z2357]+$/.test(w) && /[2357][a-z]/.test(w) && (w.match(/[a-z]/g)?.length ?? 0) >= 4;
const ARABIZI_COMMON = new Set(["howa", "hwa", "heya", "hia", "ana", "enta", "inta", "enty", "fein", "feen", "fen", "ezay", "izay", "ezzay", "eh", "leh", "keda", "kda", "msh", "mesh", "mish", "kam", "ya3ni", "bta3", "beta3", "betaa3", "3ayez", "3awez", "3ando", "3andoh", "delwa2ti", "delwa2ty", "dlwa2ty", "lsa", "lessa", "wala", "eih", "ahu", "ahoh", "momken", "3ayz", "ma3a", "fel", "bel", "el"]);

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;
const mostlyArabic = (text: string) => {
  const arabic = count(text, ARABIC);
  return arabic > 0 && arabic * 2 >= count(text, LATIN);
};

/** True when a Latin-script message is Arabic written in Latin letters (Arabizi). */
export function isArabizi(text: string): boolean {
  const words = (text.match(/[A-Za-z0-9]+/g) ?? []).map((w) => w.toLowerCase());
  const digitWords = words.filter(arabiziWord).length;
  const common = words.filter((w) => ARABIZI_COMMON.has(w)).length;
  return digitWords >= 2 || (digitWords >= 1 && common >= 2) || (words.length >= 3 && common >= 3 && common * 2 >= words.length);
}

/**
 * The language to answer in, from the visitor's own words rather than anything they pasted:
 *   1. the first or the last sentence/line is an Arabic sentence (2+ Arabic words, mostly Arabic script) → Arabic.
 *      "هل يناسب هذه الوظيفة؟" followed by a pasted English job description is answered in Arabic;
 *   2. counted in words (punctuation never counts): at least as many Arabic words as Latin ones → Arabic (ties go to
 *      Arabic), the same rule as the chat widget's detector;
 *   3. code-switched: 3+ Arabic words including 2 Arabic grammar words ("عن", "في", "و"…) → Arabic, so a question
 *      built in Arabic around English terms is answered in Arabic, while English quoting an Arabic title stays Latin;
 *   4. Arabizi (Egyptian or Gulf Arabic in Latin letters with 2/3/5/7 for Arabic sounds) → Arabic;
 *   5. otherwise Latin script → "latin" (English, or whatever European language the visitor used);
 *   6. no letters at all → the page language.
 */
export function detectLang(text: string, pageLang: Lang | undefined): Lang | "latin" {
  const segments = text
    .split(/[\n.!?\u061F\u06D4]+/)
    .map((s) => s.trim())
    .filter((s) => count(s, ARABIC) + count(s, LATIN) > 0);
  const own = [segments[0], segments.at(-1)].filter((s): s is string => Boolean(s));
  if (own.some((s) => (s.match(ARABIC_WORD) ?? []).filter((w) => w.length >= 2).length >= 2 && mostlyArabic(s))) return "ar";
  const arabicWords = text.match(ARABIC_WORD) ?? [];
  const latinWords = count(text, LATIN_WORD);
  if (arabicWords.length > 0 && arabicWords.length >= latinWords) return "ar";
  if (arabicWords.length >= 3 && arabicWords.filter((w) => ARABIC_FUNCTION.has(w)).length >= 2) return "ar";
  if (latinWords > 0) return isArabizi(text) ? "ar" : "latin";
  return pageLang ?? "en";
}

/** The script an earlier answer was written in (for a fixed reply on a turn whose own language is unclear). */
export function scriptLang(text: string): Lang {
  const plain = text.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+|mailto:\S+/g, "");
  return mostlyArabic(plain) ? "ar" : "en";
}

export interface ParsedChat {
  messages: ChatMessage[];
  pageLang: Lang | undefined;
  turnstileToken: string | undefined;
  /**
   * Optional request field `device: "phone"`, sent while the widget shows its phone layout (the bottom sheet): the
   * Worker asks for shorter answers (prompt.ts PHONE_LINE). Any other value is ignored. Not yet in protocol.ts's
   * ChatRequest, which the widget bundles: it goes there together with the widget change that sends it.
   */
  device?: "phone";
  /** Characters of the visitor's latest message (after sanitising and capping). */
  userChars: number;
  /** Set when the latest message was longer than {@link CHAT_LIMITS.maxLatestUserChars}: the characters kept. */
  trimmed?: number;
}

export type ParseResult = { ok: true; value: ParsedChat } | { ok: false; reason: string };

/**
 * Validates the request body and shapes the history for the model: sanitised text, capped lengths (the visitor's
 * latest message 6,000 characters, room for a pasted job description; earlier visitor messages 1,200; answers 2,400),
 * consecutive same-role messages merged, the last {@link CHAT_LIMITS.maxMessages} messages kept, starting with a user
 * message and ending with the visitor's new one.
 */
export function parseChatRequest(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "body" };
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 100) return { ok: false, reason: "messages" };

  const merged: ChatMessage[] = [];
  for (const m of body.messages as unknown[]) {
    if (!m || typeof m !== "object") return { ok: false, reason: "message" };
    const { role, content } = m as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return { ok: false, reason: "message" };
    const text = sanitizeText(content);
    if (!text) continue;
    const last = merged.at(-1);
    if (last?.role === role) last.content += `\n\n${text}`;
    else merged.push({ role, content: text });
  }

  let messages = merged.slice(-CHAT_LIMITS.maxMessages);
  while (messages.length && messages[0]!.role !== "user") messages = messages.slice(1);
  if (!messages.length || messages.at(-1)!.role !== "user") return { ok: false, reason: "last-not-user" };
  const latestLength = messages.at(-1)!.content.length;
  messages = messages.map((m, i) => ({
    role: m.role,
    content: cap(
      m.content,
      m.role === "assistant" ? CHAT_LIMITS.maxAssistantChars : i === messages.length - 1 ? CHAT_LIMITS.maxLatestUserChars : CHAT_LIMITS.maxUserChars,
    ),
  }));
  const userChars = messages.at(-1)!.content.length;

  const lang = body.lang === "ar" || body.lang === "en" ? body.lang : undefined;
  const token = typeof body.turnstileToken === "string" && body.turnstileToken.length <= TURNSTILE_TOKEN_MAX ? body.turnstileToken : undefined;
  return {
    ok: true,
    value: {
      messages,
      pageLang: lang,
      turnstileToken: token || undefined,
      userChars,
      ...(body.device === "phone" ? { device: "phone" as const } : {}),
      ...(latestLength > userChars ? { trimmed: userChars } : {}),
    },
  };
}
