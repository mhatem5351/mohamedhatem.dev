/**
 * Chat sessions: a verified Turnstile token buys a short-lived, HMAC-signed session so later messages skip Turnstile.
 *
 * Token:  v2.<iat>.<exp>.<nonce>.<bind>.<sig>   iat/exp in epoch seconds (base 36), nonce 96 random bits (base64url),
 *         bind = first 72 bits of HMAC-SHA256(SESSION_SECRET, "bind|<network>|<user agent>"), base64url, where
 *         <network> is the visitor's IPv4 /24 or IPv6 /48;
 *         sig = base64url(HMAC-SHA256(SESSION_SECRET, "v2.<iat>.<exp>.<nonce>.<bind>"))
 * Cookie: mh_chat=<token>; Path=/api/chat; HttpOnly; Secure; SameSite=Strict; Max-Age=<ttl>
 *
 * Binding: a cookie copied to another network or another browser no longer verifies (`moved`), so one Turnstile solve
 * can't be replayed from a script farm. A visitor whose phone switches from Wi-Fi to cellular just gets a 401
 * `turnstile_required`, which the widget answers with a silent Turnstile check and one resend.
 *
 * Sliding expiry: TTL 30 min, refreshed once less than half of it is left, but never beyond 1 h after the Turnstile
 * check (iat). Stateless: rotating SESSION_SECRET ends every session at once (visitors just pass Turnstile again).
 */
export const SESSION_COOKIE = "mh_chat";
export const SESSION_TTL_S = 30 * 60;
export const SESSION_MAX_S = 60 * 60;

export interface Session {
  iat: number;
  exp: number;
  /** Random per session: keys the per-session rate limit and message budget. */
  nonce: string;
}

export type SessionCheck = { ok: true; session: Session } | { ok: false; reason: "missing" | "invalid" | "expired" | "moved" };

const enc = new TextEncoder();
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]),
    };
  }
  return cachedKey.key;
}

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * The value a session is bound to: the visitor's network (IPv4 /24, IPv6 /48) and browser (user agent), keyed with
 * the secret so the cookie reveals neither. Coarse on purpose: mobile carriers rotate addresses inside a /24 or /48.
 */
export async function sessionBinding(secret: string, network: string, userAgent: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`bind|${network}|${userAgent.slice(0, 512)}`));
  return b64url(new Uint8Array(mac).slice(0, 9));
}

export async function signSession(secret: string, iat: number, exp: number, bind: string, nonce?: string): Promise<string> {
  const n = nonce ?? b64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `v2.${iat.toString(36)}.${exp.toString(36)}.${n}.${bind}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** Verifies signature, expiry and binding. `bind` is {@link sessionBinding} for this request. */
export async function checkSession(secret: string, token: string | null | undefined, nowS: number, bind: string): Promise<SessionCheck> {
  if (!token) return { ok: false, reason: "missing" };
  if (token.length > 200) return { ok: false, reason: "invalid" };
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "v2") return { ok: false, reason: "invalid" };
  const [, iatS, expS, nonce, tokenBind, sigS] = parts as [string, string, string, string, string, string];
  const iat = parseInt(iatS, 36);
  const exp = parseInt(expS, 36);
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp) || !/^[A-Za-z0-9_-]{16}$/.test(nonce)) return { ok: false, reason: "invalid" };
  const sig = fromB64url(sigS);
  if (!sig || sig.byteLength !== 32) return { ok: false, reason: "invalid" };
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(parts.slice(0, 5).join(".")));
  if (!valid) return { ok: false, reason: "invalid" };
  if (exp <= nowS || iat > nowS + 60 || exp > iat + SESSION_MAX_S || nowS - iat > SESSION_MAX_S) return { ok: false, reason: "expired" };
  if (tokenBind !== bind) return { ok: false, reason: "moved" };
  return { ok: true, session: { iat, exp, nonce } };
}

/** A new session's expiry, or a refreshed one for a session past half its TTL (null: keep the current cookie). */
export function nextExpiry(session: Session | null, nowS: number): { iat: number; exp: number } | null {
  if (!session) return { iat: nowS, exp: nowS + SESSION_TTL_S };
  if (session.exp - nowS > SESSION_TTL_S / 2) return null;
  const exp = Math.min(nowS + SESSION_TTL_S, session.iat + SESSION_MAX_S);
  return exp > session.exp ? { iat: session.iat, exp } : null;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAgeS: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/api/chat; Max-Age=${Math.max(0, Math.floor(maxAgeS))}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict`;
}
