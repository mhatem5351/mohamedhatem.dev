import { countryOf, track } from "../analytics";
import type { Env } from "../env";
import { CONTENT_VERSION } from "../generated/content";
import { allowedHostnames, clientKey, corsHeaders, errorJson, originProblem, parseJsonBytes, readCapped, SECURITY_HEADERS } from "../http";
import { checkLimits } from "../ratelimit";
import { nextExpiry, readCookie, SESSION_COOKIE, sessionCookie, signSession, verifySession } from "../session";
import { verifyTurnstile } from "../turnstile";
import { streamAnswer, type AnswerDeps, type Sink } from "./answer";
import { CooldownStore } from "./cooldown";
import { detectLang, parseChatRequest } from "./parse";
import { systemInstruction, toContents } from "./prompt";
import { usesCompactPrompt } from "./gemini";
import { CHAT_LIMITS, type Lang, type MetaEvent } from "./protocol";
import { encodeEvent, PING } from "./sse";

/**
 * POST /api/chat. Checks run cheapest first, and nothing reaches Gemini unless all pass:
 *   origin → content type → rate limits (burst, per minute, global) → body size → schema → configuration →
 *   session cookie, else Turnstile → stream.
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
  const limited = await checkLimits([
    { binding: env.RL_CHAT_BURST, key: `chat-burst:${ip}`, retryAfter: 10 },
    { binding: env.RL_CHAT, key: `chat:${ip}`, retryAfter: 60 },
    { binding: env.RL_CHAT_GLOBAL, key: "chat:global", retryAfter: 30 },
  ]);
  if (!limited.ok) return reject(429, "rate_limited", limited.retryAfter);

  const body = await readCapped(req, CHAT_LIMITS.maxBodyBytes);
  if (!body.ok) return reject(body.code === "too_large" ? 413 : 400, body.code);
  const parsed = parseChatRequest(parseJsonBytes(body.bytes));
  if (!parsed.ok) return reject(400, "bad_request");
  const { messages, pageLang, turnstileToken, userChars } = parsed.value;

  if (!env.GEMINI_API_KEY || !env.SESSION_SECRET || !env.TURNSTILE_SECRET) return reject(503, "unavailable");

  // Session cookie, or a Turnstile token to start one.
  const nowS = Math.floor(Date.now() / 1000);
  const session = await verifySession(env.SESSION_SECRET, readCookie(req, SESSION_COOKIE), nowS);
  if (!session) {
    if (!turnstileToken) return reject(401, "turnstile_required");
    const check = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET,
      token: turnstileToken,
      ip: req.headers.get("CF-Connecting-IP"),
      action: "chat",
      hostnames: allowedHostnames(req, env),
    });
    if (!check.ok) return reject(403, "turnstile_failed");
  }
  const renewed = nextExpiry(session, nowS);
  const cookie = renewed
    ? sessionCookie(await signSession(env.SESSION_SECRET, renewed.iat, renewed.exp), renewed.exp - nowS, new URL(req.url).protocol === "https:")
    : null;

  // Prompt: reply language from the visitor's latest message, falling back to the page language.
  const reply = detectLang(messages.at(-1)!.content, pageLang);
  const lang: Lang = reply === "ar" ? "ar" : "en";
  const turn = { reply, pageLang, now: new Date() };
  const system = (model: string) => systemInstruction(turn, usesCompactPrompt(model));
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

  const meta: MetaEvent = { id: crypto.randomUUID().slice(0, 8), lang, ...(renewed ? { sessionExp: renewed.exp * 1000 } : {}) };
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
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const answerDeps: AnswerDeps = {
    apiKey: env.GEMINI_API_KEY,
    primary: models[0]!,
    fallbacks: models.slice(1),
    hedgeMs: Number(env.GEMINI_HEDGE_MS) > 0 ? Number(env.GEMINI_HEDGE_MS) : 8000,
    cooldowns: new CooldownStore(cache, new URL(req.url).origin, (p) => ctx.waitUntil(p)),
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
