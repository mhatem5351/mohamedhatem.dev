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
const ARABIC_WORD = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]{2,}/g;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;
const mostlyArabic = (text: string) => {
  const arabic = count(text, ARABIC);
  return arabic > 0 && arabic * 2 >= count(text, LATIN);
};

/**
 * The language to answer in, from the visitor's own words rather than anything they pasted:
 *   1. the first or the last sentence/line is an Arabic sentence (2+ Arabic words, mostly Arabic script) → Arabic.
 *      "هل يناسب هذه الوظيفة؟" followed by a pasted English job description is answered in Arabic;
 *   2. otherwise the whole message is mostly Arabic script (Latin tech terms inside Arabic don't count against it) → Arabic;
 *   3. otherwise Latin script → "latin" (English, or whatever European language the visitor used);
 *   4. no letters at all → the page language.
 */
export function detectLang(text: string, pageLang: Lang | undefined): Lang | "latin" {
  const segments = text
    .split(/[\n.!?\u061F\u06D4]+/)
    .map((s) => s.trim())
    .filter((s) => count(s, ARABIC) + count(s, LATIN) > 0);
  const own = [segments[0], segments.at(-1)].filter((s): s is string => Boolean(s));
  if (own.some((s) => count(s, ARABIC_WORD) >= 2 && mostlyArabic(s))) return "ar";
  if (mostlyArabic(text)) return "ar";
  if (count(text, LATIN) > 0) return "latin";
  return pageLang ?? "en";
}

export interface ParsedChat {
  messages: ChatMessage[];
  pageLang: Lang | undefined;
  turnstileToken: string | undefined;
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
    value: { messages, pageLang: lang, turnstileToken: token || undefined, userChars, ...(latestLength > userChars ? { trimmed: userChars } : {}) },
  };
}
