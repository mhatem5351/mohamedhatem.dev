/**
 * Workers rate limiting bindings (wrangler.jsonc → ratelimits). Counters are kept per Cloudflare location and are
 * eventually consistent: a cheap, permissive first line of defence, not an exact quota. A missing binding (or a
 * binding error) lets the request through: availability over strictness for a portfolio site.
 */
export interface Rule {
  binding: RateLimit | undefined;
  key: string;
  /** Seconds the client should wait when this rule trips (the binding's period). */
  retryAfter: number;
}

export type LimitResult = { ok: true } | { ok: false; retryAfter: number; rule: number };

/** Checks rules in order and stops at the first one that trips (later counters are not consumed). */
export async function checkLimits(rules: Rule[]): Promise<LimitResult> {
  for (const [i, rule] of rules.entries()) {
    if (!rule.binding) continue;
    try {
      const { success } = await rule.binding.limit({ key: rule.key });
      if (!success) return { ok: false, retryAfter: rule.retryAfter, rule: i };
    } catch {
      /* fail open */
    }
  }
  return { ok: true };
}
