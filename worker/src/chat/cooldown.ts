/**
 * Which Gemini models are known to be unavailable (over a free-tier quota, or overloaded), and until when.
 *
 * Two layers, both free:
 *   - a module-level map: this isolate never retries a model it has seen fail;
 *   - the Workers Cache API (`caches.default`), one entry per model with the expiry as its max-age: other isolates in
 *     the same data center skip the model too. Cache contents don't replicate between data centers, and one visitor's
 *     requests can land in several, so each location learns about a spent quota once (one instant 429, ~0.3 s).
 * Durations (answer.ts → cooldownSeconds): a daily quota at least an hour (Google's RetryInfo when longer, else until
 * midnight Pacific); a per-minute limit 60 s; an overload (503) RetryInfo or 30 s.
 */
const memory = new Map<string, number>();

export interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, res: Response): Promise<void>;
}

export class CooldownStore {
  constructor(
    private readonly cache?: CacheLike,
    /** Origin used to build cache keys (any URL on the Worker's own zone). */
    private readonly origin = "https://mohamedhatem.dev",
    private readonly waitUntil: (p: Promise<unknown>) => void = (p) => void p.catch(() => {}),
  ) {}

  private key(model: string): string {
    return `${this.origin}/__model-cooldown/${encodeURIComponent(model)}`;
  }

  /** Pulls the shared (per-location) state for these models into this isolate's memory. Never throws. */
  async load(models: string[], now = Date.now()): Promise<void> {
    if (!this.cache) return;
    await Promise.all(
      models.map(async (m) => {
        if (this.until(m, now)) return;
        try {
          const hit = await this.cache!.match(this.key(m));
          const until = hit ? Number(await hit.text()) : NaN;
          if (until > now) memory.set(m, until);
        } catch {
          /* the cache is an optimisation only */
        }
      }),
    );
  }

  /** Epoch ms until which the model is cooling down, or 0. */
  until(model: string, now = Date.now()): number {
    const t = memory.get(model);
    if (t === undefined) return 0;
    if (t <= now) {
      memory.delete(model);
      return 0;
    }
    return t;
  }

  isCooling(model: string, now = Date.now()): boolean {
    return this.until(model, now) > 0;
  }

  coolDown(model: string, seconds: number, now = Date.now()): void {
    const s = Math.round(Math.min(Math.max(seconds, 5), 24 * 3600));
    const until = now + s * 1000;
    if (until <= this.until(model, now)) return;
    memory.set(model, until);
    if (this.cache) {
      const res = new Response(String(until), { headers: { "Cache-Control": `max-age=${s}`, "Content-Type": "text/plain" } });
      this.waitUntil(this.cache.put(this.key(model), res).catch(() => {}));
    }
  }
}

/** Clears this isolate's memory (tests). */
export function resetCooldowns(): void {
  memory.clear();
}

/** Seconds until the next midnight in America/Los_Angeles (when Gemini free-tier daily quotas reset). */
export function secondsToPacificMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = get("hour") * 3600 + get("minute") * 60 + get("second");
  return Math.max(60, 86400 - elapsed);
}
