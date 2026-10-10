/**
 * Chat sessions: a verified Turnstile token buys a short-lived, HMAC-signed session so later messages skip Turnstile.
 *
 * Token:  v1.<iat>.<exp>.<nonce>.<sig>    iat/exp in epoch seconds (base 36), nonce 96 random bits (base64url),
 *         sig = base64url(HMAC-SHA256(SESSION_SECRET, "v1.<iat>.<exp>.<nonce>"))
 * Cookie: mh_chat=<token>; Path=/api/chat; HttpOnly; Secure; SameSite=Strict; Max-Age=<ttl>
 *
 * Sliding expiry: TTL 30 min, refreshed once less than half of it is left, but never beyond 2 h after the Turnstile
 * check (iat), after which the visitor passes Turnstile again (usually invisibly). Stateless: rotating SESSION_SECRET
 * ends every session at once (visitors just get a new Turnstile check).
 */
export const SESSION_COOKIE = "mh_chat";
export const SESSION_TTL_S = 30 * 60;
export const SESSION_MAX_S = 2 * 60 * 60;

export interface Session {
  iat: number;
  exp: number;
}

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

export async function signSession(secret: string, iat: number, exp: number): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `v1.${iat.toString(36)}.${exp.toString(36)}.${nonce}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** The session in `token` if its signature is valid and it has not expired; otherwise null. */
export async function verifySession(secret: string, token: string | null | undefined, nowS: number): Promise<Session | null> {
  if (!token || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, iatS, expS, , sigS] = parts as [string, string, string, string, string];
  const iat = parseInt(iatS, 36);
  const exp = parseInt(expS, 36);
  if (!Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)) return null;
  const sig = fromB64url(sigS);
  if (!sig || sig.byteLength !== 32) return null;
  const payload = parts.slice(0, 4).join(".");
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(payload));
  if (!valid) return null;
  if (exp <= nowS || iat > nowS + 60 || exp > iat + SESSION_MAX_S || nowS - iat > SESSION_MAX_S) return null;
  return { iat, exp };
}

/** A new session's expiry, or a refreshed one for a session past half its TTL (null: keep the current cookie). */
export function nextExpiry(session: Session | null, nowS: number): Session | null {
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
