import { CANARIES, KNOWLEDGE, SITE_PATHS, SYSTEM_PROMPT } from "../generated/content";
import { FRIENDLY } from "../http";
import { ApartFilter, type ApartMode } from "./apart";
import { ConfidentialMatcher, fixedReply, type FixedReply } from "./confidential";
import { DirectiveExtractor } from "./directive";
import { CooldownStore, secondsToPacificMidnight } from "./cooldown";
import {
  buildBody,
  chunks,
  estimateRequestTokens,
  inputTokenLimit,
  isFast,
  meaningful,
  openStream,
  UpstreamError,
  usesCompactPrompt,
  type Chunk,
  type Usage,
} from "./gemini";
import { buildFingerprints, OutputGuard } from "./guard";
import { answerableFollowup, keepsClientsApart } from "./intent";
import { buildLinkCheck, buildPhoneFormats, LinkFilter, PhoneFilter } from "./links";
import { CLIENTS_HINT, COMPACT_RULES, GOV_ASSISTANT_HINT, JD_RULES, PHONE_LINE, REMINDERS, SECURITY_RULES, UI_DIRECTIVE, type GeminiContent } from "./prompt";
import type { DoneEvent, ErrorCode, ErrorEvent, Lang, ToolEvent, ToolName } from "./protocol";
import { TableFilter } from "./tables";

/**
 * One answer, streamed: picks the fastest healthy model, relays the text through the UI-directive extractor, the
 * table-to-bullets filter, the GADD / government-assistant separation, the link guard, the phone-number canonicaliser
 * and the output guard, then sends the
 * validated UI events and exactly one `done` or `error` event.
 *
 * Model chain: [primary, ...fallbacks] minus the models known to be cooling down and the models whose free tier
 * can't take this request's input tokens in a minute (Gemma: 16K), at most {@link MAX_ATTEMPTS} Gemini requests per
 * answer, one per model.
 *   - The first model starts at once. If nothing has come back after `hedgeMs` (~3 s), a second one starts in
 *     parallel ("hedging": Gemini's first-token latency swings from 1 s to over 60 s under load), preferring a fast
 *     model (Gemini 2.5 Flash without thinking, or Flash-Lite at minimal thinking); the first to produce content wins
 *     and the other request is aborted.
 *   - A model that fails before the first token (429 quota / rate limit, 503 overload, 5xx, network) hands over to
 *     the next one immediately; the visitor never sees it.
 *   - 429 and 503 also put the model on a cooldown (cooldown.ts), kept in the isolate and in the location's Cache
 *     API: a daily quota at least an hour (Google's RetryInfo when longer, else until midnight Pacific); a per-minute
 *     limit 60 s; an overload until RetryInfo, else 30 s. Free tier: 20 requests a day for each Flash model, 500 for
 *     Flash-Lite 3.5 and 3.1.
 *   - Everything cooling or failing: `error upstream_busy` with a retry time; the widget offers the contact card.
 *
 * Confidentiality (confidential.ts): if the answer is about to name the unnamed client, it is replaced by a fixed,
 * localised reply with the UI events of the model's own (a section link, two chips from a pool): on a turn about the
 * government assistant the confidentiality reply, on any other turn the "not named in his profile" reply (R7-03).
 * Turns that may draw a name (handler.ts: about that assistant or his clients, a guess, an organisation the
 * knowledge base doesn't name) are held whole until the guard has seen the end (`buffer`), then sent in word-sized
 * chunks, so a replaced answer is never shown first: no `replace`. Elsewhere a late catch still sends `replace`.
 *
 * Every path ends the same way (R7-04): tokens, the UI events, then `done` with `finish` only. Usage, timings and the
 * model stay in the logs (the local Worker adds them for the evaluation: `diagnostics`), and a fixed reply sent
 * without a model call ({@link sendDeflection}) streams at a model's pace, not in 10 ms.
 */
export interface Sink {
  send(event: "meta" | "token" | "replace" | "tool" | "done" | "error", data: unknown): void;
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
  /** One request per model, never a retry (local evaluation: every Gemini call is counted against a budget). */
  noRetry?: boolean;
  /** Answer language (for the fixed confidentiality reply). */
  lang?: Lang;
  /**
   * The visitor asked to reach or hire him, or is assessing him for a role (intent.ts). Without it the contact card
   * is dropped even when the model asks for it.
   */
  contactAllowed?: boolean;
  /** This turn assesses a job description: hedges keep normal thinking (accuracy over speed). */
  jd?: boolean;
  /** Names to keep out of answers (tests inject their own). */
  confidential?: ConfidentialMatcher;
  /** Keep GADD and the government assistant apart in this answer (apart.ts); null: no filter. */
  apart?: ApartMode | null;
  /** Hold the whole answer until the guard has seen its end, then send it paced (no visible `replace`). */
  buffer?: boolean;
  /** The fixed reply that replaces an answer the guard stops (default "confidential"). */
  redactWith?: FixedReply;
  /** Pacing of fixed replies and held answers (tests use {@link NO_PACE}). */
  pace?: Pace;
  /** Add usage, timings and the model to `done` (local development and evaluation only, never in production). */
  diagnostics?: boolean;
}

/**
 * How a fixed reply or a held answer is sent: the first chunk after `first` ms (a fixed reply: a model's usual
 * first-token latency; a held answer: at once, the model's time already passed), then `words` words per chunk every
 * `gap` ms, each drawn at random from its range.
 */
export interface Pace {
  first: readonly [number, number];
  gap: readonly [number, number];
  words: readonly [number, number];
  random?: () => number;
}
export const DEFAULT_PACE: Pace = { first: [1200, 3600], gap: [20, 80], words: [2, 7] };
/** No waiting (unit tests): the same events, at once. */
export const NO_PACE: Pace = { first: [0, 0], gap: [0, 0], words: [2, 7] };

/** Sends `text` as token events in word-sized chunks at the given pace; `wait`: first the `first` delay. */
export async function sendPaced(sink: Sink, text: string, pace: Pace, signal?: AbortSignal, wait = false): Promise<void> {
  const random = pace.random ?? Math.random;
  const pick = ([lo, hi]: readonly [number, number]) => lo + Math.floor(random() * (hi - lo + 1));
  const pause = (ms: number) => (ms > 0 && !signal?.aborted ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
  if (wait) await pause(pick(pace.first));
  const words = text.split(/(?<=\s)(?=\S)/);
  for (let i = 0; i < words.length && !signal?.aborted; ) {
    const n = Math.max(1, pick(pace.words));
    sink.send("token", { t: words.slice(i, i + n).join("") });
    i += n;
    if (i < words.length) await pause(pick(pace.gap));
  }
}

/**
 * Most generation attempts per answer (first try, hedge and failovers together). An instant 429 (quota or rate
 * limit: no tokens generated, ~0.3 s) doesn't count, so the first visitor in a location where the Flash quotas are
 * spent still reaches a model that has quota; the chain length bounds those.
 */
export const MAX_ATTEMPTS = 4;
/** Time an answer needs left for a retry after an early stop to be worth starting. */
export const RETRY_MIN_MS = 10_000;

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
  /** "redacted": the confidentiality guard replaced the answer (sent with `done`). */
  outcome: "ok" | "redacted" | ErrorCode | "aborted";
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
const FINGERPRINTS = buildFingerprints(
  [SYSTEM_PROMPT, SECURITY_RULES, UI_DIRECTIVE, REMINDERS, COMPACT_RULES, JD_RULES, CLIENTS_HINT, GOV_ASSISTANT_HINT, PHONE_LINE].join("\n\n"),
  KNOWLEDGE,
);
export function promptFingerprints(): Map<string, number> {
  return FINGERPRINTS;
}

/** URLs the answer may link to: the ones written in the knowledge base and the instructions, plus the site's pages. */
const LINK_CHECK = buildLinkCheck([KNOWLEDGE, SYSTEM_PROMPT], undefined, SITE_PATHS ?? []);
/** The owner's phone number as the knowledge base writes it (any other spelling of it is rewritten to this). */
const PHONE_FORMATS = buildPhoneFormats([KNOWLEDGE, SYSTEM_PROMPT]);
/** The unnamed client's hashed names (built once per isolate). */
export const CONFIDENTIAL = new ConfidentialMatcher();

/** The models to try, in order, without the ones cooling down. */
export function modelChain(primary: string, fallbacks: string[], cooldowns: CooldownStore, now = Date.now()): string[] {
  return [...new Set([primary, ...fallbacks].filter(Boolean))].filter((m) => !cooldowns.isCooling(m, now));
}

/**
 * The conversation for a model with a small per-minute input quota: the oldest turns are dropped (in pairs, so it
 * still starts with the visitor) until the estimate fits; null when even the latest message alone doesn't fit.
 */
export function fitContents(system: string, contents: GeminiContent[], limit: number): GeminiContent[] | null {
  let c = contents;
  while (estimateRequestTokens(system, c) > limit) {
    if (c.length <= 1) return null;
    c = c.slice(c.length > 2 ? 2 : 1);
  }
  return c;
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
  const names = deps.confidential ?? CONFIDENTIAL;
  // Fresh per model attempt: a retry after an early stop starts the pipeline again from an empty answer.
  let guard = new OutputGuard(CANARIES, promptFingerprints(), names);
  let directive = new DirectiveExtractor();
  let tables = new TableFilter();
  const newApart = () => (deps.apart ? new ApartFilter(deps.apart) : null);
  let apart = newApart();
  /** Tables as bullets, then (on turns that may mention GADD or the government assistant) the two kept apart. */
  const shape = (text: string, final = false) => {
    const t = final ? tables.push(text) + tables.flush() : tables.push(text);
    return apart ? (final ? apart.push(t) + apart.flush() : apart.push(t)) : t;
  };
  let links = new LinkFilter(LINK_CHECK);
  let phones = new PhoneFilter(PHONE_FORMATS);
  /** The next text replaces what the widget already shows (a retry after an early stop). */
  let replacing = false;
  const pace = deps.pace ?? DEFAULT_PACE;
  /** Text sent to the browser so far. */
  let shown = false;
  /** `buffer`: text the guard has passed, not sent yet; and a cut answer kept while its retry runs. */
  let held = "";
  let heldCut = "";
  /** A retry after an early stop is running, and the widget still shows the cut answer. */
  let retrying = false;
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
  const doneEvent = (finish: DoneEvent["finish"]): DoneEvent =>
    deps.diagnostics ? { finish, usage, ms: { first: firstMs, total: Date.now() - t0 }, model } : { finish };
  /** `buffer`: sends the held answer (what a streamed answer would have shown by now). */
  const release = async () => {
    if (!held) return;
    const text = held;
    held = "";
    shown = true;
    await sendPaced(sink, text, pace, signal);
  };
  const fail = async (code: ErrorCode, retryAfter?: number): Promise<AnswerResult> => {
    // A partial answer stays, as it would have when streamed; a blocked one is dropped by the widget anyway.
    if (code !== "blocked") await release();
    const data: ErrorEvent = { code, message: FRIENDLY[code], retryable: RETRYABLE.has(code), ...(retryAfter ? { retryAfter } : {}) };
    sink.send("error", data);
    return result(code);
  };
  const emit = (text: string) => {
    if (!text) return;
    if (firstMs === null) firstMs = Date.now() - t0;
    if (deps.buffer) {
      held += text;
      return;
    }
    shown = true;
    if (replacing) {
      replacing = false;
      sink.send("replace", { t: text });
    } else sink.send("token", { t: text });
  };
  const show = (visible: string) => {
    if (!visible) return;
    const v = guard.push(visible);
    if (!v.ok) throw new Blocked(v.reason);
    emit(v.emit);
  };
  const tool = (ev: ToolEvent) => {
    sentTools.push(ev.name);
    sink.send("tool", ev);
  };
  /**
   * The answer was about to name the unnamed client: the fixed reply instead. Held text is dropped unseen and the
   * reply streams like an answer; only text already shown (a turn that wasn't held) needs a `replace`.
   */
  const redact = async (): Promise<AnswerResult> => {
    const lang: Lang = deps.lang === "ar" ? "ar" : "en";
    const { text, tools } = fixedReply(deps.redactWith ?? "confidential", lang);
    held = "";
    heldCut = "";
    firstMs ??= Date.now() - t0;
    if (shown) sink.send("replace", { t: text });
    else await sendPaced(sink, text, pace, signal);
    trace.push("redacted");
    for (const ev of tools) tool(ev);
    sink.send("done", doneEvent("stop"));
    return result("redacted", "stop");
  };

  try {
    const cooldowns = deps.cooldowns ?? new CooldownStore();
    const all = [...new Set([deps.primary, ...deps.fallbacks].filter(Boolean))];
    await cooldowns.load(all);
    const systemFor = typeof system === "string" ? () => system : system;
    // Per-model input: models with a small tokens-per-minute quota get a shortened history, or are skipped.
    const inputs = new Map<string, GeminiContent[]>();
    const chain = modelChain(deps.primary, deps.fallbacks, cooldowns).filter((m) => {
      const limit = inputTokenLimit(m);
      if (limit > 100_000) return true; // a 32 KB request can't come near it: skip the estimate (CPU budget)
      const fit = fitContents(systemFor(m), contents, limit);
      if (fit) inputs.set(m, fit);
      else trace.push(`${m}:too-long`);
      return Boolean(fit);
    });
    if (!chain.length) {
      // Every model is over quota or overloaded: answer at once instead of making the visitor wait for failures.
      const cooling = all.map((m) => cooldowns.until(m)).filter((u) => u > 0);
      trace.push("all-cooling");
      return fail("upstream_busy", cooling.length ? Math.max(1, Math.ceil((Math.min(...cooling) - Date.now()) / 1000)) : 60);
    }
    const bodyFor = (m: string, hedge: boolean) => buildBody(systemFor(m), inputs.get(m) ?? contents, m, { fast: hedge && !deps.jd });
    const deadline = t0 + t.total;
    let finishReason: string | undefined;
    let blockReason: string | undefined;
    let cut = false;
    // Gemini sometimes ends a stream after a few words with an unexpected finish reason ("OTHER", or none at all; seen
    // live: 21 tokens, mid-sentence). Such an answer is asked again once, from the next model, and its text replaces
    // the cut one in the widget (`replace`); without a model or the time for that, it is reported as cut ("length",
    // which the widget shows as "the answer was cut short").
    for (let pool = chain, firstBy = t0 + t.first, retried = false; ; ) {
      const won = await pickModel(pool, bodyFor, { ...deps, cooldowns }, run.signal, firstBy, trace);
      model = won.model;
      finishReason = undefined;
      blockReason = undefined;
      let last: Usage | undefined;
      const handle = (c: Chunk) => {
        // model text → UI directive cut out → tables as bullets → GADD / government assistant apart → links checked →
        // phone number canonical → output guard → browser
        if (c.text) show(phones.push(links.push(shape(directive.push(c.text)))));
        if (c.finishReason) finishReason = c.finishReason;
        if (c.blockReason) blockReason = c.blockReason;
        if (c.usage) last = c.usage;
      };
      if (won.first) handle(won.first);
      for (;;) {
        const next = await withTimeout(won.rest.next(), Math.min(t.idle, deadline - Date.now()), won.ctrl);
        if (next.done) break;
        handle(next.value);
      }
      if (last) Object.assign(usage, last);
      if (signal.aborted) return result("aborted");

      show(phones.push(links.push(shape(directive.flush(), true))));
      show(phones.push(links.flush()));
      show(phones.flush());
      const tail = guard.flush();
      if (!tail.ok) throw new Blocked(tail.reason);
      emit(tail.emit);

      const expected = finishReason === "STOP" || finishReason === "MAX_TOKENS" || SAFETY_REASONS.has(finishReason ?? "") || Boolean(blockReason);
      if (expected) break;
      trace.push(`${model}:finish-${(finishReason ?? "none").toLowerCase()}`);
      // Never retry on a weaker prompt: a cut full-prompt answer isn't asked again of a compact-prompt model (Gemma,
      // audit R6-19), which would also wait up to 40 s for its first token.
      const rest = pool.filter((m) => m !== model && (usesCompactPrompt(model) || !usesCompactPrompt(m)));
      if (retried || !rest.length || deadline - Date.now() < RETRY_MIN_MS) {
        cut = guard.answer.trim().length > 0;
        break;
      }
      retried = true;
      replacing = guard.started && !deps.buffer;
      retrying = guard.started;
      // Held: the cut answer waits aside; the retry's answer replaces it before anything is sent.
      heldCut = held;
      held = "";
      guard = new OutputGuard(CANARIES, promptFingerprints(), names);
      directive = new DirectiveExtractor();
      tables = new TableFilter();
      apart = newApart();
      links = new LinkFilter(LINK_CHECK);
      phones = new PhoneFilter(PHONE_FORMATS);
      pool = rest;
      firstBy = Math.min(deadline, Date.now() + t.first);
    }

    const visible = guard.answer.trim();
    // The retry after an early stop gave nothing: the widget still shows the cut answer, which stays, marked as cut.
    if (!visible && retrying && !guard.started) return done("length", true);
    if (blockReason || (SAFETY_REASONS.has(finishReason ?? "") && !visible)) return fail("safety");
    if (!visible) return fail("empty");

    // UI events go out after the text (the widget shows them under the answer), a held answer's text included.
    // Follow-up chips are visible text too: no canary, no confidential name, and only questions the knowledge base
    // can answer.
    await release();
    const canaryFree = (q: string) => new OutputGuard(CANARIES, new Map()).push(q).ok;
    for (const ev of directive.events()) {
      if (ev.name === "show_contact_card" && !deps.contactAllowed) continue;
      if (ev.name === "suggest_followups") {
        const questions = ev.args.questions.filter((q) => canaryFree(q) && !names.mentions(q) && answerableFollowup(q) && keepsClientsApart(visible, q));
        if (questions.length) tool({ name: "suggest_followups", args: { questions } });
        continue;
      }
      tool(ev);
    }
    if (SAFETY_REASONS.has(finishReason ?? "")) return fail("safety");
    return done(cut || finishReason === "MAX_TOKENS" ? "length" : "stop");
  } catch (e) {
    if (signal.aborted) return result("aborted");
    if (e instanceof Blocked) return e.message === "confidential" ? redact() : fail("blocked");
    // The retry after an early stop failed before showing anything: the widget still shows the cut answer, which
    // stays, marked as cut ("length"), instead of an error under visible text (audit R6-19).
    if (retrying && !guard.started && !(e instanceof UpstreamError && e.kind === "aborted")) return done("length", true);
    // Failed mid-answer: the text the filters and the guard were still holding back (the end of a sentence the
    // GADD / government-assistant filter waits for, the last words) belongs to the partial answer the widget keeps.
    if (!(e instanceof UpstreamError && e.kind === "aborted")) {
      try {
        show(phones.push(links.push(shape(directive.flush(), true))));
        show(phones.push(links.flush()));
        show(phones.flush());
      } catch (b) {
        if (b instanceof Blocked) return b.message === "confidential" ? redact() : fail("blocked");
        throw b;
      }
    }
    if (guard.answer) {
      const rest = guard.flush();
      if (!rest.ok) return rest.reason === "confidential" ? redact() : fail("blocked");
      emit(rest.emit);
      // A retry that had replaced the cut answer and then failed: what it showed is kept, marked as cut.
      if (retrying && !(e instanceof UpstreamError && e.kind === "aborted")) return done("length");
    }
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

  /** The end of the answer; `restoreCut`: a retry gave nothing, so the cut answer it was to replace stands. */
  async function done(finish: DoneEvent["finish"], restoreCut = false): Promise<AnswerResult> {
    if (restoreCut && deps.buffer) held = heldCut;
    await release();
    sink.send("done", doneEvent(finish));
    return result("ok", finish);
  }
}

/**
 * R6-03, R7-04: the fixed confidentiality answer for a turn that asks who the government assistant's client is (or
 * guesses), sent like a model's answer without calling one: after a model's usual first-token latency, in word-sized
 * chunks, then the UI events and `done` with `finish` only, so neither a right guess and a wrong one nor this path and
 * a model answer differ in their events.
 */
export async function sendDeflection(
  lang: Lang,
  sink: Sink,
  opts: { kind?: FixedReply; pace?: Pace; diagnostics?: boolean; signal?: AbortSignal; random?: () => number } = {},
): Promise<AnswerResult> {
  const t0 = Date.now();
  const { text, tools } = fixedReply(opts.kind ?? "confidential", lang, opts.random);
  await sendPaced(sink, text, opts.pace ?? DEFAULT_PACE, opts.signal, true);
  const usage: Usage = { input: 0, output: 0, thoughts: 0, cached: 0 };
  const ms = Date.now() - t0;
  const base = { model: "none", fallback: false, usage, firstMs: ms, totalMs: ms, tools: tools.map((t) => t.name), answerChars: text.length, trace: "deflected" };
  if (opts.signal?.aborted) return { ...base, outcome: "aborted" };
  for (const ev of tools) sink.send("tool", ev);
  sink.send("done", (opts.diagnostics ? { finish: "stop", usage, ms: { first: ms, total: ms }, model: null } : { finish: "stop" }) satisfies DoneEvent);
  return { ...base, outcome: "redacted", finish: "stop" };
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
  bodyFor: (model: string, hedge: boolean) => Record<string, unknown>,
  deps: Pick<AnswerDeps, "apiKey" | "hedgeMs" | "fetcher" | "noRetry"> & { cooldowns: CooldownStore },
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

  /** Starts the next model: in chain order, or for a hedge the first fast model left (with fast settings). */
  const startNext = (hedging = false): boolean => {
    if (!canStart()) return false;
    const i = hedging ? Math.max(0, waiting.findIndex(isFast)) : 0;
    const model = waiting.splice(i, 1)[0]!;
    const isLast = waiting.length === 0 || attempts() + 1 >= MAX_ATTEMPTS;
    const ctrl = linked(signal);
    const opened = (async () => {
      const res = await openStream({
        apiKey: deps.apiKey,
        model,
        body: bodyFor(model, hedging),
        signal: ctrl.signal,
        deadline,
        fetcher: deps.fetcher,
        // Retrying a busy model only makes sense when nothing else can answer.
        maxAttempts: isLast && !deps.noRetry ? 3 : 1,
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

/**
 * How long a failed model should be skipped: 429 and 503 only (other failures are not about the model's capacity).
 * A daily quota (20 requests a day for each Flash model) is skipped for at least an hour even when Google's RetryInfo
 * suggests less: in production, models whose daily quota was spent were tried again minutes later and failed again,
 * costing every such answer an extra round trip per exhausted model.
 */
export function cooldownSeconds(e: UpstreamError, now = new Date()): number {
  if (e.kind === "quota") return e.daily ? Math.max(e.retryAfterS ?? secondsToPacificMidnight(now), 3600) : (e.retryAfterS ?? 3600);
  // Per-minute limits (free tier: 5 RPM for Flash, 10–15 for Flash-Lite, 16k input tokens/min for Gemma).
  if (e.kind === "busy" && e.status === 429) return Math.min(Math.max(e.retryAfterS ?? 0, 60), 300);
  if (e.kind === "busy" && e.status === 503) return Math.min(e.retryAfterS ?? 30, 300);
  return 0;
}
