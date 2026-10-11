/** Bindings, vars and secrets (wrangler.jsonc + `wrangler secret put`; locally `.dev.vars`). */
export interface Env {
  ASSETS: Fetcher;
  /** send_email binding; its destination is fixed to MAIL_TO in wrangler.jsonc. */
  MAIL: SendEmail;
  /** Rate limiting bindings. Optional so a misconfigured environment degrades to "no limit" instead of 500s. */
  RL_CHAT?: RateLimit;
  RL_CHAT_BURST?: RateLimit;
  RL_CHAT_GLOBAL?: RateLimit;
  /** Per chat session (keyed by the session nonce). */
  RL_CHAT_SESSION?: RateLimit;
  RL_CONTACT?: RateLimit;
  /** CSP violation reports: per visitor IP, and per Cloudflare location for all visitors together. */
  RL_CSP?: RateLimit;
  RL_CSP_GLOBAL?: RateLimit;
  /** Workers Analytics Engine (anonymous counts and latency only). */
  EVENTS?: AnalyticsEngineDataset;

  /** Comma-separated origins allowed to call /api/* (the Worker's own origin is always allowed). */
  ALLOWED_ORIGINS: string;
  MAIL_FROM: string;
  MAIL_TO: string;
  GEMINI_MODEL: string;
  /** Comma-separated fallback models, in order (each has its own free-tier quota). Empty: no fallback. */
  GEMINI_FALLBACK_MODELS?: string;
  /** Milliseconds without a first token before the next model in the chain is raced. */
  GEMINI_HEDGE_MS?: string;
  /** "1" only in local dev (.dev.vars): honours the X-Model-Chain request header (eval/smoke use Flash-Lite). */
  ALLOW_MODEL_OVERRIDE?: string;
  /** "1" only in local dev (.dev.vars): accept Cloudflare's Turnstile test secret and test-key results. */
  ALLOW_TURNSTILE_TEST?: string;

  GEMINI_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  SESSION_SECRET?: string;
  /**
   * Key of the unnamed client's hashed names (worker/src/chat/confidential-hashes.json): 64 hex characters. Missing,
   * malformed or not the list's key: the chat answers 503 "unavailable" (fail closed).
   */
  CONFIDENTIAL_HMAC_KEY?: string;
}
