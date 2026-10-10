import { countryOf, track } from "../analytics";
import type { Env } from "../env";
import { CONTENT_VERSION } from "../generated/content";
import { allowedHostnames, clientKey, corsHeaders, errorJson, networkKey, originProblem, parseJsonBytes, readCapped, SECURITY_HEADERS } from "../http";
import { checkLimits } from "../ratelimit";
import { checkSession, nextExpiry, readCookie, SESSION_COOKIE, SESSION_MAX_S, sessionBinding, sessionCookie, signSession, type Session } from "../session";
import { verifyTurnstile } from "../turnstile";
import { CONFIDENTIAL, streamAnswer, type AnswerDeps, type Sink } from "./answer";
import { CooldownStore } from "./cooldown";
import { usesCompactPrompt } from "./gemini";
import { asksAboutFit, wantsContact } from "./intent";
import { detectLang, parseChatRequest } from "./parse";
import { systemInstruction, toContents } from "./prompt";
import { CHAT_LIMITS, type Lang, type MetaEvent } from "./protocol";
import { encodeEvent, PING } from "./sse";

/** Messages one session may send before a fresh Turnstile check (a real conversation rarely needs half of it). */
export const SESSION_MESSAGE_CAP = 40;

/**
 * POST /api/chat. Checks run cheapest first, and nothing reaches Gemini unless all pass:
 *   origin → content type → per-IP rate limits (burst, per minute) → body size → schema → configuration →
 *   session cookie (signed, unexpired, same network and browser), else Turnstile → per-session rate limit and message
 *   budget → site-wide limit → stream.
 * The site-wide limit is spent only by requests that passed the session or Turnstile check, so unverified traffic
 * can't shut the chat for everyone (audit SEC-2). Threat model: worker/README.md → "Security model".
 */
export async function handleChat(req: Request, env: Env, ctx: ExecutionContext, deps?: Partial<AnswerDeps>): Promise<Response> {
  const t0 = Date.now();
  const country = countryOf(req);
  const reject = (status: number, code: Parameters<typeof errorJson>[3], retryAfter?: number) => {
    track(env.EVENTS, { kind: "chat", outcome: code, country, totalMs: Date.now() - t0, version: CONTENT_VERSION });
    return errorJson(req, env, status, code, retryAfter);
  };

  if (originProblem(req, env)) return reject(403, "forbidden");
  if (!/^application\/json\b/i.test(req.headers.get("Content-Type") ?? "")) return reject(415, "unsupported");

  const ip = clientKey(req);
  const perIp = await checkLimits([
    { binding: env.RL_CHAT_BURST, key: `chat-burst:${ip}`, retryAfter: 10 },
    { binding: env.RL_CHAT, key: `chat:${ip}`, retryAfter: 60 },
  ]);
  if (!perIp.ok) return reject(429, "rate_limited", perIp.retryAfter);

  const body = await readCapped(req, CHAT_LIMITS.maxBodyBytes);
  if (!body.ok) return reject(body.code === "too_large" ? 413 : 400, body.code);
  const parsed = parseChatRequest(parseJsonBytes(body.bytes));
  if (!parsed.ok) return reject(400, "bad_request");
  const { messages, pageLang, turnstileToken, userChars, trimmed } = parsed.value;

  if (!env.GEMINI_API_KEY || !env.SESSION_SECRET || !env.TURNSTILE_SECRET) return reject(503, "unavailable");

  // Session cookie (bound to this network and browser), or a Turnstile token to start one. A missing, expired or
  // moved session is a 401: the widget gets a fresh token silently and resends.
  const nowS = Math.floor(Date.now() / 1000);
  const bind = await sessionBinding(env.SESSION_SECRET, networkKey(req), req.headers.get("User-Agent") ?? "");
  const found = await checkSession(env.SESSION_SECRET, readCookie(req, SESSION_COOKIE), nowS, bind);
  let session: Session | null = found.ok ? found.session : null;
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const origin = new URL(req.url).origin;
  if (session && (await sessionMessages(cache, origin, session, nowS, ctx)) > SESSION_MESSAGE_CAP) session = null;
  if (!session) {
    if (!turnstileToken) return reject(401, "turnstile_required");
    const check = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET,
      token: turnstileToken,
      ip: req.headers.get("CF-Connecting-IP"),
      action: "chat",
      hostnames: allowedHostnames(req, env),
      allowTestKey: env.ALLOW_TURNSTILE_TEST === "1",
    });
    if (!check.ok) {
      if (/^test-(?:secret|key)$/.test(check.reason)) console.error(`chat turnstile ${check.reason} outside local development`);
      return reject(403, "turnstile_failed");
    }
  } else {
    const perSession = await checkLimits([{ binding: env.RL_CHAT_SESSION, key: `chat-session:${session.nonce}`, retryAfter: 60 }]);
    if (!perSession.ok) return reject(429, "rate_limited", perSession.retryAfter);
  }
  // Site-wide breaker, after verification: busy for everyone, which the widget says as such (not "you're too fast").
  const global = await checkLimits([{ binding: env.RL_CHAT_GLOBAL, key: "chat:global", retryAfter: 60 }]);
  if (!global.ok) return reject(503, "upstream_busy", global.retryAfter);

  const renewed = nextExpiry(session, nowS);
  const cookie = renewed
    ? sessionCookie(
        await signSession(env.SESSION_SECRET, renewed.iat, renewed.exp, bind, session?.nonce),
        renewed.exp - nowS,
        new URL(req.url).protocol === "https:",
      )
    : null;

  // Prompt: reply language from the visitor's latest message, falling back to the page language.
  const latest = messages.at(-1)!.content;
  const reply = detectLang(latest, pageLang);
  const lang: Lang = reply === "ar" ? "ar" : "en";
  const jd = asksAboutFit(latest);
  const turn = { reply, pageLang, now: new Date(), jd, namesClient: (deps?.confidential ?? CONFIDENTIAL).mentions(latest) };
  const prompts = new Map<boolean, string>();
  const system = (model: string) => {
    const compact = usesCompactPrompt(model);
    if (!prompts.has(compact)) prompts.set(compact, systemInstruction(turn, compact));
    return prompts.get(compact)!;
  };
  const contents = toContents(messages);

  // The response stream. The visitor closing the tab / pressing Stop cancels it, which aborts Gemini.
  const abort = new AbortController();
  req.signal?.addEventListener?.("abort", () => abort.abort(), { once: true });
  let out!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      out = controller;
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  const write = (bytes: Uint8Array) => {
    if (closed) return;
    try {
      out.enqueue(bytes);
    } catch {
      closed = true;
      abort.abort();
    }
  };
  const sink: Sink = { send: (event, data) => write(encodeEvent(event, data)), ping: () => write(PING) };

  const meta: MetaEvent = {
    id: crypto.randomUUID().slice(0, 8),
    lang,
    ...(renewed ? { sessionExp: renewed.exp * 1000 } : {}),
    ...(trimmed ? { trimmed } : {}),
  };
  sink.send("meta", meta);

  // Model chain: wrangler.jsonc, or (local dev / eval only, never in production) the X-Model-Chain header, so tests
  // can run on Flash-Lite and leave the 20-a-day Flash quotas to visitors.
  const list = (v: string | null | undefined) =>
    (v ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => /^(gemini|gemma)-[\w.-]{1,60}$/.test(m));
  const override = env.ALLOW_MODEL_OVERRIDE === "1" ? list(req.headers.get("X-Model-Chain")).slice(0, 12) : [];
  const models = override.length ? override : [env.GEMINI_MODEL || "gemini-3.8-flash", ...list(env.GEMINI_FALLBACK_MODELS)];
  const answerDeps: AnswerDeps = {
    apiKey: env.GEMINI_API_KEY,
    primary: models[0]!,
    fallbacks: models.slice(1),
    hedgeMs: Number(env.GEMINI_HEDGE_MS) > 0 ? Number(env.GEMINI_HEDGE_MS) : 3200,
    cooldowns: new CooldownStore(cache, origin, (p) => ctx.waitUntil(p)),
    // An X-Model-Chain run (local evaluation) counts its Gemini calls: never retry.
    noRetry: override.length > 0,
    lang,
    contactAllowed: wantsContact(latest),
    jd,
    ...deps,
  };
  const work = streamAnswer(system, contents, answerDeps, sink, abort.signal)
    .then((r) => {
      track(env.EVENTS, {
        kind: "chat",
        outcome: r.outcome,
        lang,
        model: r.model,
        finish: r.finish,
        tools: r.tools,
        version: CONTENT_VERSION,
        country,
        trace: r.trace,
        totalMs: Date.now() - t0,
        firstMs: r.firstMs,
        ...r.usage,
        messages: messages.length,
        userChars,
        answerChars: r.answerChars,
        fallback: r.fallback,
      });
      // Content-free log line (Workers Logs): outcome, upstream trace, timings.
      if (r.outcome !== "ok" || r.fallback) console.log(`chat ${r.outcome} ${r.trace} first=${r.firstMs ?? "-"}ms total=${r.totalMs}ms`);
    })
    .catch((e: unknown) => console.error("chat stream failed", e instanceof Error ? e.name : "unknown"))
    .finally(() => {
      if (!closed) {
        closed = true;
        try {
          out.close();
        } catch {
          /* already closed */
        }
      }
    });
  ctx.waitUntil(work);

  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    ...corsHeaders(req, env),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(stream, { status: 200, headers });
}

/**
 * Counts this session's messages (this one included) in the Cache API: per Cloudflare location and approximate (no
 * locking), which is enough for a soft budget; free, and gone when the session ends. Without a cache: 0 (no budget).
 */
async function sessionMessages(cache: Cache | undefined, origin: string, session: Session, nowS: number, ctx: ExecutionContext): Promise<number> {
  if (!cache) return 0;
  const key = `${origin}/__chat-session/${session.nonce}`;
  try {
    const hit = await cache.match(key);
    const n = (Number(hit ? await hit.text() : 0) || 0) + 1;
    const ttl = Math.max(60, session.iat + SESSION_MAX_S - nowS);
    ctx.waitUntil(cache.put(key, new Response(String(n), { headers: { "Cache-Control": `max-age=${ttl}`, "Content-Type": "text/plain" } })).catch(() => {}));
    return n;
  } catch {
    return 0;
  }
}
