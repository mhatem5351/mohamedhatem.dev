import type { ChatRequest, ErrorBody } from "../../worker/src/chat/protocol";
import { createSseParser } from "./sse";

/** How a request ended. `pre` errors happened before the stream started (JSON error body, HTTP status). */
export type Outcome =
  | { kind: "done" }
  | { kind: "aborted" }
  | { kind: "error"; code: string; pre: boolean; status?: number; retryAfter?: number };

/**
 * A stream that stays silent this long is dead (the Worker sends a `: ping` every 8 s while the model thinks), so it
 * is cancelled and reported as a "timeout" instead of leaving the visitor waiting forever.
 */
export const STALL_MS = 30_000;

/**
 * POST /api/chat and feed every SSE event to `onEvent` (data already JSON-parsed). Resolves when the stream ends;
 * never rejects. A stream that ends without `done` / `error` counts as a dropped connection ("network").
 */
export async function streamChat(
  url: string,
  body: ChatRequest,
  signal: AbortSignal,
  credentials: RequestCredentials,
  onEvent: (event: string, data: unknown) => void,
): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      credentials,
      signal,
    });
  } catch {
    return signal.aborted ? { kind: "aborted" } : { kind: "error", code: "network", pre: true };
  }

  if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("text/event-stream")) {
    let err: Partial<ErrorBody> = {};
    try {
      err = (await res.json()) as ErrorBody;
    } catch {
      /* not JSON */
    }
    const header = Number(res.headers.get("Retry-After"));
    const retryAfter = err.retryAfter ?? (header > 0 ? header : undefined);
    const code = err.error ?? (res.status === 429 ? "rate_limited" : res.status === 413 ? "too_large" : res.ok ? "internal" : res.status >= 500 ? "internal" : "bad_request");
    return { kind: "error", code, pre: true, status: res.status, ...(retryAfter ? { retryAfter } : {}) };
  }

  let terminal = null as Outcome | null;
  const parser = createSseParser((event, data) => {
    let parsed: unknown = data;
    try {
      parsed = JSON.parse(data);
    } catch {
      /* keep the raw string */
    }
    if (event === "done") terminal = { kind: "done" };
    if (event === "error") {
      const e = parsed as { code?: string; retryAfter?: number };
      terminal = { kind: "error", code: e?.code ?? "internal", pre: false, ...(e?.retryAfter ? { retryAfter: e.retryAfter } : {}) };
    }
    onEvent(event, parsed);
  });

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let stalled = false;
  let watchdog = 0;
  const arm = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      void reader.cancel().catch(() => {});
    }, STALL_MS) as unknown as number;
  };
  try {
    arm();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parser.push(value);
    }
    parser.end();
  } catch {
    if (signal.aborted) return { kind: "aborted" };
    return terminal ?? { kind: "error", code: stalled ? "timeout" : "network", pre: false };
  } finally {
    clearTimeout(watchdog);
  }
  if (terminal) return terminal;
  if (signal.aborted) return { kind: "aborted" };
  return { kind: "error", code: stalled ? "timeout" : "network", pre: false };
}
