import { CANARIES, KNOWLEDGE, SYSTEM_PROMPT } from "../generated/content";
import { FRIENDLY } from "../http";
import { DirectiveExtractor } from "./directive";
import { CooldownStore, secondsToPacificMidnight } from "./cooldown";
import { buildBody, chunks, isLite, meaningful, openStream, UpstreamError, type Chunk, type Usage } from "./gemini";
import { buildFingerprints, OutputGuard } from "./guard";
import { buildLinkCheck, LinkFilter } from "./links";
import { COMPACT_RULES, REMINDERS, SECURITY_RULES, UI_DIRECTIVE, type GeminiContent } from "./prompt";
import type { DoneEvent, ErrorCode, ErrorEvent, ToolName } from "./protocol";

/**
 * One answer, streamed: picks the fastest healthy model, relays the text through the UI-directive extractor, the
 * link guard and the output guard, then sends the validated UI events and exactly one `done` or `error` event.
 *
 * Model chain: [primary, ...fallbacks] minus the models known to be cooling down, at most {@link MAX_ATTEMPTS}
 * Gemini requests per answer, one per model.
 *   - The first model starts at once. If nothing has come back after `hedgeMs`, a second one starts in parallel
 *     ("hedging": Gemini's first-token latency swings from 1 s to over 60 s under load), preferring a Flash-Lite model
 *     because they are the fast ones; the first to produce content wins and the other request is aborted.
 *   - A model that fails before the first token (429 quota / rate limit, 503 overload, 5xx, network) hands over to
 *     the next one immediately; the visitor never sees it.
 *   - 429 and 503 also put the model on a cooldown shared by every isolate in the Cloudflare location
 *     (cooldown.ts): a daily quota until Google's RetryInfo, else next midnight Pacific; a per-minute limit 60 s; an
 *     overload until RetryInfo, else 30 s. Free tier: 20 requests a day for each Flash model, 500 for Flash-Lite.
 *   - Everything cooling or failing: `error upstream_busy` with a retry time; the widget offers the contact card.
 */
export interface Sink {
  send(event: "meta" | "token" | "tool" | "done" | "error", data: unknown): void;
  ping(): void;
}

export interface AnswerDeps {
  apiKey: string;
  primary: string;
  /** Fallback models, in order of preference. */
  fallbacks: string[];
  hedgeMs: number;
  fetcher?: typeof fetch;
  timeouts?: Partial<Timeouts>;
  /** Shared model cooldowns (defaults to this isolate's memory only). */
  cooldowns?: CooldownStore;
}

/**
 * Most generation attempts per answer (first try, hedge and failovers together). An instant 429 (quota or rate
 * limit: no tokens generated, ~0.3 s) doesn't count, so the first visitor in a location where the Flash quotas are
 * spent still reaches a model that has quota; the chain length bounds those.
 */
export const MAX_ATTEMPTS = 4;

export interface Timeouts {
  /** Request start → first content, all models included. */
  first: number;
  /** Max silence between two chunks once streaming. */
  idle: number;
  /** Request start → end of the answer. */
  total: number;
  /** Keep-alive comment interval (keeps proxies from closing a quiet stream). */
  ping: number;
}

export const DEFAULT_TIMEOUTS: Timeouts = { first: 40_000, idle: 20_000, total: 75_000, ping: 8_000 };

export interface AnswerResult {
  outcome: "ok" | ErrorCode | "aborted";
  model: string;
  fallback: boolean;
  finish?: DoneEvent["finish"];
  usage: Usage;
  firstMs: number | null;
  totalMs: number;
  tools: ToolName[];
  answerChars: number;
  /** Content-free trace of what happened upstream, for logs: e.g. "gemini-3.8-flash:quota429>gemini-3.5-flash-lite:ok". */
  trace: string;
}

const SAFETY_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);
const RETRYABLE = new Set<ErrorCode>(["upstream_busy", "upstream_error", "timeout", "empty", "internal", "rate_limited"]);

/**
 * Runs of words that occur in the private instructions but not in the public knowledge. Built once per isolate, in
 * the global scope (isolate startup, ~4 ms) rather than inside the first request's 10 ms CPU budget.
 */
const FINGERPRINTS = buildFingerprints(`${SYSTEM_PROMPT}\n\n${SECURITY_RULES}\n\n${UI_DIRECTIVE}\n\n${REMINDERS}\n\n${COMPACT_RULES}`, KNOWLEDGE);
export function promptFingerprints(): Map<string, number> {
  return FINGERPRINTS;
}

/** URLs the answer may link to: the ones written in the knowledge base and the instructions, plus the site. */
const LINK_CHECK = buildLinkCheck([KNOWLEDGE, SYSTEM_PROMPT]);

/** The models to try, in order, without the ones cooling down. */
export function modelChain(primary: string, fallbacks: string[], cooldowns: CooldownStore, now = Date.now()): string[] {
  return [...new Set([primary, ...fallbacks].filter(Boolean))].filter((m) => !cooldowns.isCooling(m, now));
}

class Blocked extends Error {}

/* ------------------------------------------------------------------ the answer */

export async function streamAnswer(
  /** The system instruction, or one per model (small-quota models get a compact one). */
  system: string | ((model: string) => string),
  contents: GeminiContent[],
  deps: AnswerDeps,
  sink: Sink,
  signal: AbortSignal,
): Promise<AnswerResult> {
  const t = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };
  const t0 = Date.now();
  const guard = new OutputGuard(CANARIES, promptFingerprints());
  const directive = new DirectiveExtractor();
  const links = new LinkFilter(LINK_CHECK);
  const usage: Usage = { input: 0, output: 0, thoughts: 0, cached: 0 };
  const sentTools: ToolName[] = [];
  const trace: string[] = [];
  let firstMs: number | null = null;
  let model = deps.primary;

  // Parent of every upstream request of this answer: aborted when the visitor leaves and at the end, so nothing
  // keeps running (or counting against the quota) after the answer is over.
  const run = linked(signal);
  const pinger = setInterval(() => sink.ping(), t.ping);

  const result = (outcome: AnswerResult["outcome"], finish?: DoneEvent["finish"]): AnswerResult => ({
    outcome,
    model,
    fallback: model !== deps.primary,
    finish,
    usage,
    firstMs,
    totalMs: Date.now() - t0,
    tools: sentTools,
    answerChars: guard.answer.length,
    trace: trace.join(">"),
  });
  const fail = (code: ErrorCode, retryAfter?: number): AnswerResult => {
    const data: ErrorEvent = { code, message: FRIENDLY[code], retryable: RETRYABLE.has(code), ...(retryAfter ? { retryAfter } : {}) };
    sink.send("error", data);
    return result(code);
  };
  const emit = (text: string) => {
    if (!text) return;
    if (firstMs === null) firstMs = Date.now() - t0;
    sink.send("token", { t: text });
  };
  const show = (visible: string) => {
    if (!visible) return;
    const v = guard.push(visible);
    if (!v.ok) throw new Blocked(v.reason);
    emit(v.emit);
  };

  try {
    const cooldowns = deps.cooldowns ?? new CooldownStore();
    const all = [...new Set([deps.primary, ...deps.fallbacks].filter(Boolean))];
    await cooldowns.load(all);
    const chain = modelChain(deps.primary, deps.fallbacks, cooldowns);
    if (!chain.length) {
      // Every model is over quota or overloaded: answer at once instead of making the visitor wait for failures.
      const soonest = Math.min(...all.map((m) => cooldowns.until(m)));
      trace.push("all-cooling");
      return fail("upstream_busy", Math.max(1, Math.ceil((soonest - Date.now()) / 1000)));
    }
    const systemFor = typeof system === "string" ? () => system : system;
    const won = await pickModel(chain, (m) => buildBody(systemFor(m), contents, m), { ...deps, cooldowns }, run.signal, t0 + t.first, trace);
    model = won.model;

    let finishReason: string | undefined;
    let blockReason: string | undefined;
    let last: Usage | undefined;
    const handle = (c: Chunk) => {
      // model text → UI directive cut out → links checked → output guard → browser
      if (c.text) show(links.push(directive.push(c.text)));
      if (c.finishReason) finishReason = c.finishReason;
      if (c.blockReason) blockReason = c.blockReason;
      if (c.usage) last = c.usage;
    };
    if (won.first) handle(won.first);
    const deadline = t0 + t.total;
    for (;;) {
      const next = await withTimeout(won.rest.next(), Math.min(t.idle, deadline - Date.now()), won.ctrl);
      if (next.done) break;
      handle(next.value);
    }
    if (last) Object.assign(usage, last);
    if (signal.aborted) return result("aborted");

    show(links.push(directive.flush()));
    show(links.flush());
    const tail = guard.flush();
    if (!tail.ok) throw new Blocked(tail.reason);
    emit(tail.emit);

    const visible = guard.answer.trim();
    if (blockReason || (SAFETY_REASONS.has(finishReason ?? "") && !visible)) return fail("safety");
    if (!visible) return fail("empty");

    // UI events go out after the text (the widget shows them under the answer). Follow-up chips are visible text
    // too, so they get the canary check.
    for (const ev of directive.events()) {
      if (ev.name === "suggest_followups" && !new OutputGuard(CANARIES, new Map()).push(ev.args.questions.join(" | ")).ok) continue;
      sentTools.push(ev.name);
      sink.send("tool", ev);
    }
    if (SAFETY_REASONS.has(finishReason ?? "")) return fail("safety");
    return done(finishReason === "MAX_TOKENS" ? "length" : "stop");
  } catch (e) {
    if (signal.aborted) return result("aborted");
    if (e instanceof Blocked) return fail("blocked");
    if (e instanceof UpstreamError) {
      if (e.kind === "aborted") return result("aborted");
      if (e.kind === "quota" || e.kind === "busy") return fail("upstream_busy", Math.min(e.retryAfterS ?? 20, e.kind === "quota" ? 3600 : 60));
      if (e.kind === "timeout") return fail("timeout");
      return fail("upstream_error");
    }
    return fail("internal");
  } finally {
    clearInterval(pinger);
    run.abort();
  }

  function done(finish: DoneEvent["finish"]): AnswerResult {
    const data: DoneEvent = { finish, usage, ms: { first: firstMs, total: Date.now() - t0 }, model };
    sink.send("done", data);
    return result("ok", finish);
  }
}

function linked(parent: AbortSignal): AbortController {
  const ctrl = new AbortController();
  if (parent.aborted) ctrl.abort();
  else parent.addEventListener("abort", () => ctrl.abort(), { once: true });
  return ctrl;
}

function withTimeout<T>(p: Promise<T>, ms: number, ctrl: AbortController): Promise<T> {
  p.catch(() => {}); // a read cancelled by the timeout rejects after the race is decided
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new UpstreamError("timeout"));
    }, Math.max(0, ms));
  });
  return Promise.race([p, timeout]).finally(() => timer !== undefined && clearTimeout(timer));
}

/* ------------------------------------------------------------------ hedged model selection */

interface Contender {
  model: string;
  ctrl: AbortController;
  opened: Promise<{ first: Chunk | null; rest: AsyncGenerator<Chunk> }>;
}

export interface Won {
  model: string;
  ctrl: AbortController;
  first: Chunk | null;
  rest: AsyncGenerator<Chunk>;
}

type Settled = { c: Contender; ok: true; v: Awaited<Contender["opened"]> } | { c: Contender; ok: false; e: unknown };

/**
 * Starts chain[0]; starts the next model when every running one is slower than `hedgeMs` or one fails; returns the
 * first stream that produces content and aborts the others.
 */
export async function pickModel(
  chain: string[],
  bodyFor: (model: string) => Record<string, unknown>,
  deps: Pick<AnswerDeps, "apiKey" | "hedgeMs" | "fetcher"> & { cooldowns: CooldownStore },
  signal: AbortSignal,
  deadline: number,
  trace: string[] = [],
): Promise<Won> {
  const contenders: Contender[] = [];
  const settled = new Map<Contender, Promise<Settled>>();
  const waiting = [...chain];
  let rejected429 = 0;
  const attempts = () => contenders.length - rejected429;
  const canStart = () => waiting.length > 0 && attempts() < MAX_ATTEMPTS;

  /** Starts the next model: in chain order, or for a hedge the first fast (Flash-Lite) model left. */
  const startNext = (hedging = false): boolean => {
    if (!canStart()) return false;
    const i = hedging ? Math.max(0, waiting.findIndex(isLite)) : 0;
    const model = waiting.splice(i, 1)[0]!;
    const isLast = waiting.length === 0 || attempts() + 1 >= MAX_ATTEMPTS;
    const ctrl = linked(signal);
    const opened = (async () => {
      const res = await openStream({
        apiKey: deps.apiKey,
        model,
        body: bodyFor(model),
        signal: ctrl.signal,
        deadline,
        fetcher: deps.fetcher,
        // Retrying a busy model only makes sense when nothing else can answer.
        maxAttempts: isLast ? 3 : 1,
      });
      const rest = chunks(res, ctrl.signal);
      for (;;) {
        const next = await rest.next();
        if (next.done) return { first: null, rest };
        if (meaningful(next.value)) return { first: next.value, rest };
      }
    })();
    opened.catch(() => {}); // settled through the race below
    const c: Contender = { model, ctrl, opened };
    contenders.push(c);
    settled.set(
      c,
      opened.then(
        (v): Settled => ({ c, ok: true, v }),
        (e: unknown): Settled => ({ c, ok: false, e }),
      ),
    );
    return true;
  };

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let hedge: Promise<"hedge"> = new Promise(() => {});
  const armHedge = () => {
    if (hedgeTimer !== undefined) clearTimeout(hedgeTimer);
    hedge = new Promise<"hedge">((r) => (hedgeTimer = setTimeout(() => r("hedge"), Math.max(0, deps.hedgeMs))));
  };
  const timeUp = new Promise<"timeout">((r) => (deadlineTimer = setTimeout(() => r("timeout"), Math.max(0, deadline - Date.now()))));
  const aborted = new Promise<"aborted">((r) => (signal.aborted ? r("aborted") : signal.addEventListener("abort", () => r("aborted"), { once: true })));

  startNext();
  armHedge();
  let firstError: unknown;
  try {
    for (;;) {
      const waitOn: Promise<unknown>[] = [...settled.values(), timeUp, aborted];
      if (canStart()) waitOn.push(hedge);
      const r = (await Promise.race(waitOn)) as "hedge" | "timeout" | "aborted" | Settled;
      if (r === "aborted") throw new UpstreamError("aborted");
      if (r === "timeout") {
        trace.push("timeout");
        throw new UpstreamError("timeout");
      }
      if (r === "hedge") {
        trace.push(`hedge${deps.hedgeMs}`);
        startNext(true);
        armHedge();
        continue;
      }
      settled.delete(r.c);
      if (r.ok) {
        trace.push(`${r.c.model}:ok`);
        for (const other of contenders) if (other !== r.c) other.ctrl.abort();
        return { model: r.c.model, ctrl: r.c.ctrl, first: r.v.first, rest: r.v.rest };
      }
      const e = r.e;
      if (e instanceof UpstreamError && e.kind === "aborted") throw e;
      trace.push(`${r.c.model}:${e instanceof UpstreamError ? `${e.kind}${e.status ?? ""}` : "error"}`);
      if (e instanceof UpstreamError) {
        const s = cooldownSeconds(e);
        if (s) deps.cooldowns.coolDown(r.c.model, s);
        if (e.status === 429) rejected429++;
      }
      firstError ??= e;
      if (startNext()) {
        armHedge();
        continue;
      }
      if (settled.size === 0) throw firstError;
    }
  } catch (e) {
    for (const c of contenders) c.ctrl.abort();
    throw e;
  } finally {
    if (hedgeTimer !== undefined) clearTimeout(hedgeTimer);
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
  }
}

/** How long a failed model should be skipped: 429 and 503 only (other failures are not about the model's capacity). */
export function cooldownSeconds(e: UpstreamError, now = new Date()): number {
  if (e.kind === "quota") return e.retryAfterS ?? (e.daily ? secondsToPacificMidnight(now) : 3600);
  // Per-minute limits (free tier: 5 RPM for Flash, 10–15 for Flash-Lite, 16k input tokens/min for Gemma).
  if (e.kind === "busy" && e.status === 429) return Math.min(Math.max(e.retryAfterS ?? 0, 60), 300);
  if (e.kind === "busy" && e.status === 503) return Math.min(e.retryAfterS ?? 30, 300);
  return 0;
}
