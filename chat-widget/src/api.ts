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
 * never rejects. A stream that ends without `done` / `error` counts as a dropped connection ("network"). A refusal
 * before streaming keeps the Worker's code, e.g. a 503 `upstream_busy` (the site-wide limit) with its Retry-After.
 */
export async function streamChat(
  url: string,
  body: ChatRequest,
  signal: AbortSignal,
  onEvent: (event: string, data: unknown) => void,
): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      // Same as "same-origin" on the site; lets a cross-origin apiBase (the local demo) send the session cookie too.
      credentials: "include",
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
    const retryAfter = err.retryAfter || Number(res.headers.get("Retry-After"));
    // Not the Worker's JSON: a 429 or 5xx then comes from the platform in front of it (e.g. its daily request limit),
    // so the chat is unavailable for everyone; it isn't this visitor sending too fast.
    const s = res.status;
    const code = err.error ?? (s === 413 ? "too_large" : s === 429 || s > 499 ? "unavailable" : s > 399 ? "bad_request" : "internal");
    return { kind: "error", code, pre: true, status: s, ...(retryAfter > 0 ? { retryAfter } : {}) };
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
