import { expect, type Page } from "@playwright/test";

/** One mocked /api/chat response. `events` stream as SSE with per-event delays; `hang` keeps the stream open. */
export interface MockResponse {
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
  events?: [event: string, data: unknown, delayMs?: number][];
  hang?: boolean;
}

/**
 * Replaces fetch("/api/chat") inside the page with a scripted SSE stream (real streaming, real AbortSignal), and
 * records every request body in window.__requests. Everything that leaves localhost is aborted.
 */
export async function setup(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.addInitScript(() => {
    const w = window as unknown as { __requests: unknown[]; __queue: MockResponse[] };
    w.__requests = [];
    w.__queue = [];
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      if (!url.pathname.endsWith("/api/chat")) return real(input, init);
      w.__requests.push(JSON.parse(String(init.body)));
      const spec: MockResponse = w.__queue.shift() ?? { events: [["error", { code: "internal", message: "no mock", retryable: true }]] };
      const signal = init.signal;
      const abortError = () => new DOMException("The operation was aborted.", "AbortError");
      return new Promise<Response>((resolve, reject) => {
        if (signal?.aborted) return reject(abortError());
        signal?.addEventListener("abort", () => reject(abortError()));
        if (spec.status && spec.status !== 200) {
          resolve(new Response(JSON.stringify(spec.json ?? {}), { status: spec.status, headers: { "Content-Type": "application/json", ...spec.headers } }));
          return;
        }
        const enc = new TextEncoder();
        const timers: number[] = [];
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            let t = 0;
            for (const [event, data, delay = 0] of spec.events ?? []) {
              t += delay;
              timers.push(window.setTimeout(() => c.enqueue(enc.encode(`: ping\n\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`)), t));
            }
            if (!spec.hang) timers.push(window.setTimeout(() => c.close(), t + 5));
            signal?.addEventListener("abort", () => {
              timers.forEach(clearTimeout);
              try {
                c.error(abortError());
              } catch {
                /* already closed */
              }
            });
          },
        });
        resolve(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
      });
    };
  });
}

/** Queue mocked responses for the next /api/chat requests (FIFO). */
export async function mock(page: Page, ...responses: MockResponse[]): Promise<void> {
  await page.evaluate((r) => (window as unknown as { __queue: unknown[] }).__queue.push(...r), responses);
}

export async function requests(page: Page): Promise<{ messages: { role: string; content: string }[]; lang: string; turnstileToken?: string; device?: string }[]> {
  return page.evaluate(() => (window as unknown as { __requests: never[] }).__requests);
}

export const done = (extra: Partial<{ finish: string }> = {}): [string, unknown] => [
  "done",
  { finish: "stop", usage: { input: 10, output: 5, thoughts: 0, cached: 0 }, ms: { first: 50, total: 100 }, model: "mock", ...extra },
];

/** A complete answer: meta, text in two chunks, optional tools, done. */
export function answer(text: string, tools: [string, unknown][] = [], sessionExp?: number): MockResponse {
  const half = Math.ceil(text.length / 2);
  return {
    events: [
      ["meta", { id: "r1", lang: "en", ...(sessionExp ? { sessionExp } : {}) }],
      ["token", { t: text.slice(0, half) }, 20],
      ["token", { t: text.slice(half) }, 20],
      ...tools.map(([name, args]): [string, unknown] => ["tool", { name, args }]),
      done(),
    ],
  };
}

export async function openDemo(page: Page, query = ""): Promise<void> {
  await page.goto(`/chat-widget/demo.html?turnstile=off${query ? `&${query}` : ""}`);
  await expect(bubble(page)).toBeVisible();
}

export const bubble = (page: Page) => page.locator("[data-mh-chat] button.b");
export const dialog = (page: Page) => page.getByRole("dialog");
export const input = (page: Page) => page.locator("[data-mh-chat] textarea");
export const log = (page: Page) => page.locator("[data-mh-chat] .log");

/** The element focused inside the widget's shadow root, as "tag.class" (or null). */
export function shadowFocus(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const a = document.querySelector("[data-mh-chat]")?.shadowRoot?.activeElement;
    return a ? `${a.tagName.toLowerCase()}${a.className && typeof a.className === "string" ? `.${a.className.split(" ").join(".")}` : ""}` : null;
  });
}

export async function ask(page: Page, question: string): Promise<void> {
  await input(page).fill(question);
  await input(page).press("Enter");
}
