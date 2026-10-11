/**
 * Minimal /api/chat client for the smoke and eval scripts (Node ≥ 22: fetch + web streams).
 * Gets a session the way the widget does: the first request carries a Turnstile token (the always-pass test token,
 * accepted because `npm run dev-vars` configures the Worker with Cloudflare's test secret), later ones the cookie.
 *
 * Models: tests must not spend the 20-a-day Flash quotas that visitors need, so requests carry
 * `X-Model-Chain: $EVAL_MODEL` (default: the Flash-Lite chain). The local Worker honours it because `.dev.vars` sets
 * ALLOW_MODEL_OVERRIDE=1; production ignores it. `EVAL_MODEL=default` uses the Worker's own chain.
 */
export const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
// gemini-3.1-flash-lite: 500 requests a day on the free tier, and production reaches it only after ~120 premium and
// ~500 gemini-3.5-flash-lite answers, so tests spend the quota visitors are least likely to need.
export const LITE_CHAIN = "gemini-3.1-flash-lite";
export const EVAL_MODEL = process.env.EVAL_MODEL || LITE_CHAIN;

export function createClient(base, { origin = base, turnstileToken = DUMMY_TURNSTILE_TOKEN, models = EVAL_MODEL, maxCalls = Infinity } = {}) {
  const modelHeader = models && models !== "default" ? { "X-Model-Chain": models } : {};
  let cookie = null;
  // Streamed answers this client started (each is one Gemini generate request: with X-Model-Chain the local Worker
  // neither hedges nor retries). Requests stop at `maxCalls`, so a run can't overspend the free daily quotas.
  let calls = 0;

  async function health() {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /**
   * Sends one turn and consumes the SSE stream.
   * `events` lists the stream's event names in order, consecutive `token` events collapsed into one `token*`;
   * `eventShape` is the same list joined with "," (e.g. "meta,token*,tool,tool,done"), and `toolNames` the names of
   * the `tool` events in the order they came (a `replace` resets `tools`, not these). Paired eval cases compare them
   * (audit R7-14: a right and a wrong guess at the unnamed client must look the same on the wire).
   * @returns {Promise<{status:number, text:string, tools:any[], meta:any, done:any, error:any, firstTokenMs:number|null, totalMs:number, replaced?:boolean, events:string[], eventShape:string, toolNames:string[]}>}
   */
  /**
   * Hard limits so a run can never hang: `timeoutMs` per request (default 45 s, the whole stream included), at most
   * `retries` retries for our own rate limit (429 with Retry-After ≤ 60 s) or a dropped stream. An upstream_busy
   * answer (every model over quota) is returned at once, never waited out.
   */
  async function ask(messages, { lang = "en", onToken, retries = 3, timeoutMs = 45_000 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const t0 = performance.now();
      if (calls >= maxCalls) return { status: 0, text: "", tools: [], meta: null, done: null, error: { code: "budget", message: `call budget of ${maxCalls} reached` }, firstTokenMs: null, totalMs: 0, ...NO_EVENTS() };
      let res;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin, ...modelHeader, ...(cookie ? { Cookie: cookie } : {}) },
          body: JSON.stringify({ messages, lang, ...(cookie ? {} : { turnstileToken }) }),
          // A local Worker reload (wrangler dev) can drop a stream mid-way: never hang the run.
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { status: 0, text: "", tools: [], meta: null, done: null, error: { message: String(e) }, firstTokenMs: null, totalMs: performance.now() - t0, ...NO_EVENTS() };
      }
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];

      if (res.status === 401 && cookie && attempt < retries) {
        cookie = null; // session expired: start a new one
        continue;
      }
      const wait = Number(res.headers.get("retry-after") || 10);
      if (res.status === 429 && attempt < retries && wait <= 60) {
        await res.body?.cancel();
        await new Promise((r) => setTimeout(r, wait * 1000 + 250));
        continue;
      }
      if (!res.ok || !res.body) {
        const body = await res.text();
        return { status: res.status, text: "", tools: [], meta: null, done: null, error: safeJson(body), firstTokenMs: null, totalMs: performance.now() - t0, ...NO_EVENTS() };
      }

      calls++;
      const out = { status: res.status, text: "", tools: [], meta: null, done: null, error: null, firstTokenMs: null, totalMs: 0, replaced: false, ...NO_EVENTS() };
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let broken = false;
      for (;;) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch {
          broken = true;
          break;
        }
        const { done, value } = chunk;
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (!ev || !data) continue;
          const payload = JSON.parse(data);
          if (ev !== "token" || out.events.at(-1) !== "token*") out.events.push(ev === "token" ? "token*" : ev);
          if (ev === "tool") out.toolNames.push(String(payload?.name ?? ""));
          if (ev === "token") {
            if (out.firstTokenMs === null) out.firstTokenMs = performance.now() - t0;
            out.text += payload.t;
            onToken?.(payload.t);
          } else if (ev === "replace") {
            // The Worker replaced the answer (confidentiality guard): what the visitor sees is only this text.
            if (out.firstTokenMs === null) out.firstTokenMs = performance.now() - t0;
            out.text = payload.t;
            out.tools = [];
            out.replaced = true;
          } else if (ev === "tool") out.tools.push(payload);
          else if (ev === "meta") out.meta = payload;
          else if (ev === "done") out.done = payload;
          else if (ev === "error") out.error = payload;
        }
      }
      out.totalMs = performance.now() - t0;
      out.eventShape = out.events.join(",");
      // A stream that ended without done/error (dropped connection, timeout): ask again, once (within the budget).
      if ((broken || (!out.done && !out.error)) && attempt < Math.min(1, retries) && calls < maxCalls) continue;
      if (broken || (!out.done && !out.error)) out.error ??= { code: "timeout", message: `no answer within ${timeoutMs / 1000} s` };
      return out;
    }
  }

  return {
    ask,
    health,
    get calls() {
      return calls;
    },
  };
}

/** The event record of a request that never streamed (fresh arrays per result). */
const NO_EVENTS = () => ({ events: [], eventShape: "", toolNames: [] });

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return { message: s.slice(0, 200) };
  }
}

export const percentile = (xs, p) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  return Math.round(v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)]);
};
