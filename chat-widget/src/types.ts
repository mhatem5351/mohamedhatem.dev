import type { Lang, SectionId } from "../../worker/src/chat/protocol";

/**
 * Configuration for {@link mountChat}. Everything is optional: `mountChat({})` gives a working widget that talks
 * to `/api/chat` on the same origin, without Turnstile (the Worker will then answer 401 on the first message, so
 * production pages must pass `turnstileSiteKey`).
 */
export interface ChatWidgetConfig {
  /**
   * Origin of the Worker API, without a trailing slash. Default "" (same origin: POST /api/chat).
   * Requests use `credentials: "include"`, so a cross-origin value (e.g. "http://localhost:8787" from the demo)
   * sends the session cookie too.
   */
  apiBase?: string;
  /** UI language. Default: `<html lang>` ("ar…" → "ar", anything else → "en"). Also sets the panel direction. */
  lang?: Lang;
  /**
   * Public Turnstile site key. The widget loads Turnstile (managed, "interaction-only") lazily when the panel
   * opens (or its input gets focus) and no chat session exists yet, and removes it once a session exists.
   * `null` / omitted: never load Turnstile (tests, local mocks).
   */
  turnstileSiteKey?: string | null;
  /** Avatar shown in the panel header (square, ≥ 72 px). Omitted: an "MH" monogram. */
  avatarSrc?: string;
  /** Contact details for the contact card. They come from here, never from the model. */
  contact?: Partial<ContactConfig>;
  /**
   * Where `open_section` jump links go. Defaults: `#<id>` on the current page when that element exists,
   * otherwise the home page of the current language (`/#id` or `/ar/#id`), with built-in EN/AR labels.
   */
  sections?: Partial<Record<SectionId, SectionConfig>>;
  /**
   * Starter questions shown in an empty chat (chip text `label`, message sent `prompt`; a plain string is both).
   * Default: content/chat/suggestions.json, bundled at build time. The first 4 show on small screens, up to 8 otherwise.
   */
  suggestions?: Partial<Record<Lang, (string | { label: string; prompt: string })[]>>;
  /** Prefix for sessionStorage/localStorage keys. Default "mh-chat". */
  storageKey?: string;
}

export interface ContactConfig {
  /** International number, digits only, used for wa.me links. Default "201142070946". */
  whatsapp: string;
  /** How the number is displayed. Default derived from `whatsapp` ("+20 114 207 0946"). */
  phoneDisplay?: string;
  /** Default "hatem@mohamedhatem.dev". */
  email: string;
  /** Optional second address shown under the first. */
  altEmail?: string;
  /** Default "https://www.linkedin.com/in/mohamed-hatem-6a5790173". */
  linkedin: string;
  github?: string;
}

export interface SectionConfig {
  /** "#experience", "/#experience" or "/ar/#experience". */
  href: string;
  label: Record<Lang, string>;
}

export interface OpenOptions {
  /** A question to ask right away (or to put in the composer when `send` is false). */
  question?: string;
  /** Default true when `question` is given. */
  send?: boolean;
}

/** What the lazily loaded panel module exposes to the loader. */
export interface PanelApi {
  /** `quiet`: reopening after a page navigation (no focus move, no scroll, Turnstile waits for the textarea). */
  open(options?: OpenOptions, quiet?: boolean): void;
  close(): void;
  toggle(): void;
}

/** What the loader hands the panel module (no shared imports: keeps the loader chunk standalone). */
export interface PanelContext {
  host: HTMLElement;
  root: ShadowRoot;
  bubble: HTMLButtonElement;
  config: ChatWidgetConfig;
  lang: Lang;
  /** Storage key prefix (config.storageKey ?? "mh-chat"). */
  key: string;
  /** Adds CSS to the shadow root (constructed stylesheet: works under a strict CSP). */
  addStyles(css: string): void;
}
