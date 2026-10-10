import type { ErrorBody, ErrorCode } from "./chat/protocol";
import type { Env } from "./env";

/** Headers on every API response (static assets get theirs from the site's _headers file). */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // API responses are data, never documents: nothing may load, frame or execute them.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-site",
  "Permissions-Policy": "interest-cohort=()",
  "Cache-Control": "no-store",
};

/* ------------------------------------------------------------------ origin + CORS */

/** The allowed origin of this request, or null. The Worker's own origin is always allowed. */
export function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  if (origin === new URL(req.url).origin) return origin;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return list.includes(origin) ? origin : null;
}

/** Hostnames a Turnstile token may come from (the allowed origins' hosts plus the Worker's own host). */
export function allowedHostnames(req: Request, env: Env): string[] {
  const hosts = new Set<string>([new URL(req.url).hostname]);
  for (const o of (env.ALLOWED_ORIGINS ?? "").split(",")) {
    try {
      hosts.add(new URL(o.trim()).hostname);
    } catch {
      /* ignore malformed entries */
    }
  }
  return [...hosts];
}

/**
 * Browser-only guard for POST endpoints: an allowed Origin header is required. Browsers always send one on POST
 * (same-origin included), so a missing or foreign Origin means another site or a script: refused.
 */
export function originProblem(req: Request, env: Env): boolean {
  return allowedOrigin(req, env) === null;
}

/** CORS headers for an allowed cross-origin caller (same-origin calls don't need them; they don't hurt). */
export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = allowedOrigin(req, env);
  if (!origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers": "Retry-After",
    Vary: "Origin",
  };
}

export function preflight(req: Request, env: Env): Response {
  const origin = allowedOrigin(req, env);
  if (!origin) return new Response(null, { status: 403, headers: { ...SECURITY_HEADERS, Vary: "Origin" } });
  return new Response(null, {
    status: 204,
    headers: {
      ...SECURITY_HEADERS,
      ...corsHeaders(req, env),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/* ------------------------------------------------------------------ responses */

export function json(req: Request, env: Env, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...corsHeaders(req, env), "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

export const FRIENDLY: Record<ErrorCode, string> = {
  bad_request: "That request could not be read. Please reload the page and try again.",
  forbidden: "This endpoint only accepts requests from mohamedhatem.dev.",
  turnstile_required: "Please complete the quick human check, then send your message again.",
  turnstile_failed: "The human check did not pass. Please try again.",
  too_large: "That message is too long. Please shorten it and try again.",
  unsupported: "Unsupported request format.",
  rate_limited: "You're sending messages a little fast. Please wait a moment and try again.",
  unavailable: "The assistant is unavailable right now. You can still reach Hatem by email or WhatsApp.",
  upstream_busy: "The assistant is very busy right now. Please try again in a minute, or contact Hatem directly.",
  upstream_error: "The assistant could not answer just now. Please try again.",
  timeout: "The answer took too long. Please try again.",
  blocked: "I can't share that. Ask me anything about Hatem's work, skills or how to contact him.",
  safety: "I can't help with that. Ask me anything about Hatem's work, skills or how to contact him.",
  empty: "I couldn't come up with an answer. Please rephrase your question.",
  internal: "Something went wrong on our side. Please try again.",
};

export function errorJson(req: Request, env: Env, status: number, code: ErrorCode, retryAfter?: number): Response {
  const body: ErrorBody = { ok: false, error: code, message: FRIENDLY[code], ...(retryAfter ? { retryAfter } : {}) };
  return json(req, env, status, body, retryAfter ? { "Retry-After": String(retryAfter) } : {});
}

export function methodNotAllowed(req: Request, env: Env): Response {
  return json(req, env, 405, { ok: false, error: "bad_request", message: "Method not allowed" }, { Allow: "POST, OPTIONS" });
}

/* ------------------------------------------------------------------ bodies */

export type BodyResult = { ok: true; bytes: Uint8Array } | { ok: false; code: "too_large" | "bad_request" };

/** Reads at most `max` bytes, trusting neither Content-Length nor its absence. */
export async function readCapped(req: Request, max: number): Promise<BodyResult> {
  const declared = req.headers.get("Content-Length");
  if (declared !== null && !(Number(declared) <= max)) return { ok: false, code: "too_large" };
  if (!req.body) return { ok: false, code: "bad_request" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return { ok: false, code: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: "bad_request" };
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes: out };
}

export function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return undefined;
  }
}

const clientIp = (req: Request) => req.headers.get("CF-Connecting-IP") ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";

/** Client IP for rate limiting only (never stored). IPv6 is keyed by its /64 so one host can't rotate addresses. */
export function clientKey(req: Request): string {
  const ip = clientIp(req);
  if (!ip.includes(":")) return ip;
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : ip;
}

/**
 * The visitor's network for session binding (never stored; only an HMAC of it goes into the cookie): IPv4 /24, IPv6
 * /48. Coarser than {@link clientKey} because mobile carriers move a device between addresses inside these ranges.
 */
export function networkKey(req: Request): string {
  const ip = clientIp(req);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return `${ip.split(".").slice(0, 3).join(".")}.0/24`;
  const groups = ip.includes(":") ? expandIpv6(ip) : null;
  return groups ? `${groups.slice(0, 3).join(":")}::/48` : ip;
}

function expandIpv6(ip: string): string[] | null {
  const clean = ip.split("%")[0]!.toLowerCase();
  if (clean.includes(".")) return null; // IPv4-mapped: rare, use as is
  const [head = "", tail = ""] = clean.split("::");
  const h = head ? head.split(":") : [];
  const t = clean.includes("::") ? (tail ? tail.split(":") : []) : [];
  const fill = clean.includes("::") ? 8 - h.length - t.length : 0;
  const groups = [...h, ...Array<string>(Math.max(0, fill)).fill("0"), ...t];
  return groups.length === 8 ? groups.map((g) => g.replace(/^0+(?=.)/, "")) : null;
}
