/** Cloudflare Turnstile server-side validation (free on every plan). */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TOKEN_MAX = 2048;

export interface TurnstileCheck {
  secret: string | undefined;
  token: string;
  /** Visitor IP, forwarded to siteverify only (never stored). */
  ip: string | null;
  /** The `action` the widget was rendered with ("chat" | "contact"); a mismatch fails. */
  action: string;
  /** Hostnames the challenge may have been solved on. */
  hostnames: string[];
  fetcher?: typeof fetch;
}

export type TurnstileResult = { ok: true; testKey: boolean } | { ok: false; reason: string };

interface SiteverifyResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

/** Fails closed: no secret, a malformed token, a network error or a 5 s timeout all count as "not verified". */
export async function verifyTurnstile(check: TurnstileCheck): Promise<TurnstileResult> {
  if (!check.secret) return { ok: false, reason: "not-configured" };
  if (!check.token || check.token.length > TURNSTILE_TOKEN_MAX) return { ok: false, reason: "malformed" };
  let data: SiteverifyResponse;
  try {
    const res = await (check.fetcher ?? fetch)(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: check.secret, response: check.token, ...(check.ip ? { remoteip: check.ip } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    data = (await res.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!data.success) return { ok: false, reason: (data["error-codes"] ?? []).join(",") || "rejected" };
  // Cloudflare's test secret keys (local dev, CI) answer for hostname "example.com" without an action.
  const testKey = data.metadata?.result_with_testing_key === true;
  if (testKey) return { ok: true, testKey };
  if (data.hostname && !check.hostnames.includes(data.hostname)) return { ok: false, reason: "hostname" };
  if (data.action && data.action !== check.action) return { ok: false, reason: "action" };
  return { ok: true, testKey };
}
