/**
 * The /api/chat wire protocol, shared by the Worker and the chat widget (type-only imports on both sides).
 * Version 1. Additive changes only: new optional fields and new event names that old clients ignore.
 *
 * Request: POST /api/chat, Content-Type: application/json, body ≤ 16 KB, same-origin credentials (the session
 * cookie). The browser sends the visible conversation; the Worker keeps the last 12 messages and trims each user
 * message to 1,200 characters.
 *
 * Response, success: 200 text/event-stream. Events, in order:
 *   meta   once, first        {@link MetaEvent}
 *   token  0..n               {@link TokenEvent}   text deltas of the answer (markdown)
 *   tool   0..n, any time     {@link ToolEvent}    a validated UI tool call the widget renders (never executed server-side)
 *   done   once, last         {@link DoneEvent}
 *   error  once, last         {@link ErrorEvent}   instead of `done` when the answer failed mid-way
 * plus `: ping` comment lines every few seconds while the model is thinking (ignore them).
 *
 * Response, refused before streaming: a JSON {@link ErrorBody} with a 4xx/5xx status (see {@link ErrorCode}).
 */

export const CHAT_PATH = "/api/chat";
export const CONTACT_PATH = "/api/contact";

/** Limits the Worker enforces (the widget mirrors them to fail early with a friendly message). */
export const CHAT_LIMITS = {
  maxBodyBytes: 16 * 1024,
  maxMessages: 12,
  maxUserChars: 1200,
  maxAssistantChars: 2400,
} as const;

export type Lang = "en" | "ar";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  /** Oldest first; the last message must be the visitor's new question. */
  messages: ChatMessage[];
  /** The page language (document.documentElement.lang). Arabic input is answered in Arabic either way. */
  lang?: Lang;
  /**
   * Turnstile token (action "chat"). Needed when there is no valid session cookie yet: send it with the first
   * message, or after a 401 `turnstile_required`. A verified token starts a session (HttpOnly cookie, 30 min sliding,
   * 2 h max) so later messages need no Turnstile.
   */
  turnstileToken?: string;
}

/* ------------------------------------------------------------------ SSE events */

export interface MetaEvent {
  /** Reply id (for logs and the "copy" button); not a conversation id. */
  id: string;
  /** Language the Worker asked the model to answer in. */
  lang: Lang;
  /** Session expiry (epoch ms) when this response set or refreshed the session cookie. */
  sessionExp?: number;
}

export interface TokenEvent {
  /** Text delta (markdown). Append to the current answer. */
  t: string;
}

export type ToolEvent =
  | { name: "show_contact_card"; args: { reason: "hiring" | "project" | "general" } }
  | { name: "open_section"; args: { id: SectionId } }
  | { name: "suggest_followups"; args: { questions: string[] } };

export type ToolName = ToolEvent["name"];

/**
 * Site sections the model may link to (the section ids of content/chat/knowledge.md → "Site sections"). The widget
 * maps each id to an href and a label (config.sections).
 */
export const SECTION_IDS = ["about", "work", "experience", "projects", "skills", "education", "contact"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface DoneEvent {
  /** "stop" normal end · "length" hit the output cap (answer may be cut) · "tools" reserved (UI only, no text) */
  finish: "stop" | "length" | "tools";
  usage: { input: number; output: number; thoughts: number; cached: number };
  /** Milliseconds: request start → first token, and → done (server side). */
  ms: { first: number | null; total: number };
  /** Model that produced the answer (a fallback model may answer when the primary is slow or over quota). */
  model: string;
}

export interface ErrorEvent {
  code: ErrorCode;
  /** Friendly English fallback text; the widget shows its own localised string for known codes. */
  message: string;
  /** True when retrying the same message later may work. */
  retryable: boolean;
  /** Seconds to wait before retrying, when known. */
  retryAfter?: number;
}

export type SseEvent =
  | { event: "meta"; data: MetaEvent }
  | { event: "token"; data: TokenEvent }
  | { event: "tool"; data: ToolEvent }
  | { event: "done"; data: DoneEvent }
  | { event: "error"; data: ErrorEvent };

/* ------------------------------------------------------------------ errors */

/**
 * Pre-stream (JSON body, HTTP status) and in-stream (`event: error`) error codes.
 *   bad_request 400 · forbidden 403 (origin) · turnstile_required 401 · turnstile_failed 403 · too_large 413 ·
 *   unsupported 415 · rate_limited 429 (Retry-After) · unavailable 503 (not configured / daily budget) ·
 *   upstream_busy (model over quota after retries) · upstream_error · timeout · blocked (output guard) ·
 *   safety (model refused for safety) · empty (no answer) · internal 500
 */
export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "turnstile_required"
  | "turnstile_failed"
  | "too_large"
  | "unsupported"
  | "rate_limited"
  | "unavailable"
  | "upstream_busy"
  | "upstream_error"
  | "timeout"
  | "blocked"
  | "safety"
  | "empty"
  | "internal";

export interface ErrorBody {
  ok: false;
  error: ErrorCode;
  message: string;
  retryAfter?: number;
}

/* ------------------------------------------------------------------ contact form */

export const CONTACT_SUBJECTS = ["hiring", "project", "other"] as const;
export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** POST /api/contact (application/json, or a form post with the same field names). */
export interface ContactRequest {
  name: string;
  email: string;
  company?: string;
  subject: ContactSubject;
  message: string;
  /** Turnstile token (action "contact"). Field name in form posts: `cf-turnstile-response` also accepted. */
  turnstileToken: string;
  /** Honeypot: must be empty. Real people never see this field (neutral name so nothing autofills it). */
  mh_hp?: string;
  lang?: Lang;
}

export type ContactResponse =
  | { ok: true; ref: string }
  | { ok: false; error: ErrorCode | "invalid" | "send_failed"; message: string; fields?: string[]; retryAfter?: number };
