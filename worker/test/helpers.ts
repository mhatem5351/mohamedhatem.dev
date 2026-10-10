import type { Env } from "../src/env";

/** A Gemini `alt=sse` response from a list of JSON chunks, optionally spaced out in time. */
export function geminiSse(chunks: unknown[], opts: { delayMs?: number; firstDelayMs?: number; hangAfter?: boolean } = {}): Response {
  const enc = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [i, c] of chunks.entries()) {
        const wait = i === 0 ? (opts.firstDelayMs ?? 0) : (opts.delayMs ?? 0);
        if (wait) await sleep(wait);
        if (cancelled) return;
        controller.enqueue(enc.encode(`data: ${JSON.stringify(c)}\r\n\r\n`));
      }
      if (!opts.hangAfter) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export const textChunk = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] }, index: 0, ...extra }],
});

export const finalChunk = (finishReason = "STOP", usage = { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 }) => ({
  candidates: [{ content: { role: "model", parts: [{ text: "" }] }, finishReason, index: 0 }],
  usageMetadata: usage,
});

export const geminiError = (status: number, details: unknown[] = [], headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code: status, message: "x", status: "X", details } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Collects what the Worker would stream to the browser. */
export function memorySink() {
  const events: { event: string; data: any }[] = [];
  let pings = 0;
  return {
    events,
    get pings() {
      return pings;
    },
    send(event: string, data: unknown) {
      events.push({ event, data });
    },
    ping() {
      pings++;
    },
    text() {
      return events
        .filter((e) => e.event === "token")
        .map((e) => e.data.t)
        .join("");
    },
    names() {
      return events.map((e) => e.event);
    },
  };
}

/** Parses an SSE response body from the Worker into events. */
export async function readSse(res: Response): Promise<{ event: string; data: any }[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.startsWith("event:"))
    .map((b) => {
      const [ev, data] = b.split("\n");
      return { event: ev!.slice(7), data: JSON.parse(data!.slice(6)) };
    });
}

export function fakeLimiter(allow: number) {
  let used = 0;
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      used++;
      return { success: used <= allow };
    },
  };
}

export function makeEnv(overrides: Partial<Env> = {}): Env & { sent: unknown[]; points: unknown[] } {
  const sent: unknown[] = [];
  const points: unknown[] = [];
  return {
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    MAIL: {
      send: async (m: unknown) => {
        sent.push(m);
        return { messageId: "m1" };
      },
    } as unknown as SendEmail,
    EVENTS: { writeDataPoint: (p: unknown) => points.push(p) } as unknown as AnalyticsEngineDataset,
    ALLOWED_ORIGINS: "https://mohamedhatem.dev,https://www.mohamedhatem.dev",
    MAIL_FROM: "website@mohamedhatem.dev",
    MAIL_TO: "mhatem5351@gmail.com",
    GEMINI_MODEL: "gemini-3.8-flash",
    GEMINI_FALLBACK_MODELS: "gemini-3.5-flash-lite",
    GEMINI_HEDGE_MS: "9000",
    GEMINI_API_KEY: "test-key",
    TURNSTILE_SECRET: "ts-secret",
    SESSION_SECRET: "session-secret-for-tests-0123456789",
    sent,
    points,
    ...overrides,
  };
}

export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext & { pending: Promise<unknown>[] };
}

export const ORIGIN = "https://mohamedhatem.dev";

export function chatRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
