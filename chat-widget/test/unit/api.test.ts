import { afterEach, describe, expect, it, vi } from "vitest";
import { STALL_MS, streamChat } from "../../src/api";

const sse = (chunks: string[], status = 200) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const x of chunks) c.enqueue(new TextEncoder().encode(x));
        c.close();
      },
    }),
    { status, headers: { "Content-Type": "text/event-stream" } },
  );

afterEach(() => vi.unstubAllGlobals());

const body = { messages: [{ role: "user" as const, content: "hi" }], lang: "en" as const };

describe("streamChat", () => {
  it("feeds parsed events and ends with done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse(['event: meta\ndata: {"id":"1","lang":"en"}\n\nevent: tok', 'en\ndata: {"t":"Hi"}\n\nevent: done\ndata: {}\n\n'])));
    const events: [string, unknown][] = [];
    const out = await streamChat("/api/chat", body, new AbortController().signal, (e, d) => events.push([e, d]));
    expect(out).toEqual({ kind: "done" });
    expect(events).toEqual([
      ["meta", { id: "1", lang: "en" }],
      ["token", { t: "Hi" }],
      ["done", {}],
    ]);
  });

  it("reports pre-stream JSON errors with retryAfter (body or Retry-After header)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "rate_limited", message: "x" }, { status: 429, headers: { "Retry-After": "12" } })));
    expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toEqual({
      kind: "error",
      code: "rate_limited",
      pre: true,
      status: 429,
      retryAfter: 12,
    });
  });

  it("maps failures without the Worker's JSON by status: 429 / 5xx from the platform → unavailable", async () => {
    const cases: [number, string][] = [
      [429, "unavailable"], // e.g. the platform's daily request limit (an HTML page, not our rate limit)
      [502, "unavailable"],
      [503, "unavailable"],
      [413, "too_large"],
      [400, "bad_request"],
      [200, "internal"], // 200 but not an event stream
    ];
    for (const [status, code] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Error 1015</html>", { status, headers: { "Content-Type": "text/html" } })));
      expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toMatchObject({ kind: "error", code, pre: true, status });
    }
  });

  it("keeps the Worker's own codes: JSON 429 rate_limited and 503 upstream_busy (site-wide limit) with Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "upstream_busy", message: "x", retryAfter: 30 }, { status: 503 })));
    expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toEqual({
      kind: "error",
      code: "upstream_busy",
      pre: true,
      status: 503,
      retryAfter: 30,
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "rate_limited", message: "x" }, { status: 429, headers: { "Retry-After": "10" } })));
    expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toMatchObject({ code: "rate_limited", retryAfter: 10 });
  });

  it("treats an in-stream error event as terminal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse(['event: token\ndata: {"t":"a"}\n\nevent: error\ndata: {"code":"upstream_busy","retryAfter":5}\n\n'])));
    expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toEqual({
      kind: "error",
      code: "upstream_busy",
      pre: false,
      retryAfter: 5,
    });
  });

  it("reports a stream that ends without done as a dropped connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse(['event: token\ndata: {"t":"a"}\n\n'])));
    expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toEqual({ kind: "error", code: "network", pre: false });
  });

  it("reports network failures and aborts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await streamChat("/api/chat", body, new AbortController().signal, () => {})).toMatchObject({ code: "network" });
    const ctrl = new AbortController();
    ctrl.abort();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError"))));
    expect(await streamChat("/api/chat", body, ctrl.signal, () => {})).toEqual({ kind: "aborted" });
  });

  it("sends JSON with the right headers, and credentials so a cross-origin apiBase gets the session cookie", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => sse(["event: done\ndata: {}\n\n"]));
    vi.stubGlobal("fetch", f);
    await streamChat("http://127.0.0.1:8790/api/chat", { ...body, turnstileToken: "tok" }, new AbortController().signal, () => {});
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8790/api/chat");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ ...body, turnstileToken: "tok" });
  });

  it("gives up on a stream that goes silent (no data, no pings) and reports a timeout", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('event: token\ndata: {"t":"partial"}\n\n'));
        },
      });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } })));
      const events: string[] = [];
      const pending = streamChat("/api/chat", body, new AbortController().signal, (e) => events.push(e));
      await vi.advanceTimersByTimeAsync(STALL_MS + 100);
      expect(await pending).toEqual({ kind: "error", code: "timeout", pre: false });
      expect(events).toEqual(["token"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
