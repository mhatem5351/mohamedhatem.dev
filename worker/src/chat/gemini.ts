import type { GeminiContent, GeminiPart } from "./prompt";
import { parseSse } from "./sse";

/**
 * Gemini API client (REST, `streamGenerateContent?alt=sse`), with the retry policy:
 *   429 per-minute limit with a short suggested delay, 500/502/503/504, network errors → retried with backoff
 *   (0.5 s, 1.5 s, plus jitter) up to `maxAttempts`; the caller passes 1 when another model can take over at once;
 *   429 daily quota → never retried (the caller moves to the next model and remembers the cooldown);
 *   other 4xx → never retried.
 * Every wait respects the caller's deadline and abort signal.
 */
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Visible-answer budget (the spec's 700 output tokens). */
export const ANSWER_TOKENS = 700;

export interface ModelProfile {
  thinkingConfig: Record<string, unknown> | null;
  /**
   * Extra output tokens for thinking: Gemini counts thought tokens against maxOutputTokens, so a bare 700 would
   * truncate answers (measured: gemini-3.5-flash-lite at "low" spends 500-670 tokens thinking).
   */
  thinkingHeadroom: number;
}

/**
 * Generation settings per model family (the fallback chain mixes families; thinking settings only where supported).
 *   Gemini 3 Flash / Flash-Lite: thinkingLevel "low". For Flash-Lite, "low" beat "minimal" on the hardest evaluation
 *     cases (7/8 vs 6/8) for ~1.5 s more; it spends up to ~1,450 thinking tokens (eval max), hence the headroom.
 *     `fast` (a hedge: it only runs because the first model stalled, so time to first token matters most):
 *     Flash-Lite at "minimal" (~1 s to the first token instead of 2-4 s). Job-description turns keep "low".
 *   gemini-flash-lite-latest: an alias (currently gemini-3.5-flash-lite), same settings.
 *   Gemini 2.5 Flash / Flash-Lite: thinkingBudget 0 (no thinking: fast, and nothing to budget for).
 *   Gemma 4: thinks by default and accepts no thinking settings, so it only gets headroom.
 */
export function profileFor(model: string, opts: { fast?: boolean } = {}): ModelProfile {
  if (/^gemini-[3-9][\w.]*-flash-lite|^gemini-flash-lite-latest$/.test(model))
    return opts.fast ? { thinkingConfig: { thinkingLevel: "minimal" }, thinkingHeadroom: 600 } : { thinkingConfig: { thinkingLevel: "low" }, thinkingHeadroom: 1800 };
  if (/^gemini-[3-9]/.test(model) || model === "gemini-flash-latest") return { thinkingConfig: { thinkingLevel: "low" }, thinkingHeadroom: 400 };
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingConfig: { thinkingBudget: 0 }, thinkingHeadroom: 0 };
  if (/^gemma-/.test(model)) return { thinkingConfig: null, thinkingHeadroom: 1500 };
  return { thinkingConfig: null, thinkingHeadroom: 0 };
}

/**
 * Fast models, preferred when hedging a slow request: Flash-Lite, and Gemini 2.5 Flash without thinking (measured in
 * production: first token 0.7-1.5 s).
 */
export const isFast = (model: string) => /flash-lite/.test(model) || /^gemini-2\.5-flash$/.test(model);

/** Models whose free tier allows too few input tokens a minute for the full prompt (Gemma: 16k TPM). */
export const usesCompactPrompt = (model: string) => /^gemma-/.test(model);

/**
 * Input tokens a model's free tier accepts per minute, when that is the binding limit: Gemma 4 allows 16,000 (the
 * full instruction alone is ~14.9K tokens, the compact one ~6.3K, a 6,000-character job description 1.2K-2.1K).
 * Requests estimated above this are routed to models that fit. Gemini Flash / Flash-Lite allow 250,000.
 */
export function inputTokenLimit(model: string): number {
  return /^gemma-/.test(model) ? 15_000 : 240_000;
}

const ARABIC_CHARS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

/**
 * A deliberately high token estimate, no API call. Calibrated with countTokens (October 2026): English prose ~4.7
 * characters per token, the markdown-heavy instructions ~3.9, Arabic ~2.9; this uses 3.6 and 2.5 so a long paste or
 * a grown prompt never slips past a limit.
 */
export function estimateTokens(text: string): number {
  const arabic = text.match(ARABIC_CHARS)?.length ?? 0;
  return Math.ceil((text.length - arabic) / 3.6 + arabic / 2.5);
}

export function estimateRequestTokens(system: string, contents: GeminiContent[]): number {
  let n = estimateTokens(system);
  for (const c of contents) for (const p of c.parts) n += estimateTokens(p.text ?? "") + 4;
  return n;
}

export function buildBody(system: string, contents: GeminiContent[], model: string, opts: { fast?: boolean } = {}): Record<string, unknown> {
  const p = profileFor(model, opts);
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      maxOutputTokens: ANSWER_TOKENS + p.thinkingHeadroom,
      ...(p.thinkingConfig ? { thinkingConfig: p.thinkingConfig } : {}),
    },
  };
}

export type UpstreamKind = "quota" | "busy" | "server" | "client" | "network" | "timeout" | "aborted";

export class UpstreamError extends Error {
  constructor(
    readonly kind: UpstreamKind,
    readonly status?: number,
    readonly retryAfterS?: number,
    /** A daily (free-tier) quota, as opposed to a per-minute limit. */
    readonly daily = false,
  ) {
    super(`gemini ${kind}${status ? ` ${status}` : ""}`);
  }
}

export interface OpenOptions {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  /** Epoch ms after which no new attempt starts. */
  deadline: number;
  fetcher?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  maxAttempts?: number;
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new UpstreamError("aborted"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new UpstreamError("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Opens the stream; resolves with a 200 response whose body is the SSE stream, or throws {@link UpstreamError}. */
export async function openStream(o: OpenOptions): Promise<Response> {
  const fetcher = o.fetcher ?? fetch;
  const sleep = o.sleep ?? abortableSleep;
  const maxAttempts = o.maxAttempts ?? 3;
  const url = `${GEMINI_BASE}/${encodeURIComponent(o.model)}:streamGenerateContent?alt=sse`;
  let last: UpstreamError = new UpstreamError("network");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (o.signal.aborted) throw new UpstreamError("aborted");
    let res: Response;
    try {
      res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey },
        body: JSON.stringify(o.body),
        signal: o.signal,
      });
    } catch {
      if (o.signal.aborted) throw new UpstreamError("aborted");
      last = new UpstreamError("network");
      if (!(await backoff(attempt))) throw last;
      continue;
    }
    if (res.ok && res.body) return res;

    const info = await errorInfo(res);
    if (res.status === 429) {
      if (info.daily || (!info.perMinute && info.retryAfterS !== undefined && info.retryAfterS > 300)) throw new UpstreamError("quota", 429, info.retryAfterS, info.daily);
      last = new UpstreamError("busy", 429, info.retryAfterS);
      // Only wait when Google suggests a short delay (or none).
      if (info.retryAfterS !== undefined && info.retryAfterS > 4) throw last;
      if (!(await backoff(attempt, info.retryAfterS))) throw last;
      continue;
    }
    if ([500, 502, 503, 504].includes(res.status)) {
      last = new UpstreamError(res.status === 503 ? "busy" : "server", res.status, info.retryAfterS);
      if (!(await backoff(attempt))) throw last;
      continue;
    }
    throw new UpstreamError("client", res.status);
  }
  throw last;

  /** Waits before the next attempt; false when there is no attempt left or no time for one. */
  async function backoff(attempt: number, hintS?: number): Promise<boolean> {
    if (attempt >= maxAttempts) return false;
    const base = hintS !== undefined ? hintS * 1000 : attempt === 1 ? 500 : 1500;
    const wait = base + Math.floor(Math.random() * 250);
    if (Date.now() + wait + 1000 > o.deadline) return false;
    await sleep(wait, o.signal);
    return true;
  }
}

/** Retry hints from a Gemini error body (google.rpc.RetryInfo / QuotaFailure). The body text is never logged. */
async function errorInfo(res: Response): Promise<{ retryAfterS?: number; daily: boolean; perMinute: boolean }> {
  let retryAfterS: number | undefined;
  let daily = false;
  let perMinute = false;
  const header = res.headers.get("Retry-After");
  if (header && /^\d+$/.test(header)) retryAfterS = Number(header);
  try {
    const body = (await res.json()) as { error?: { details?: Array<Record<string, unknown>> } };
    for (const d of body.error?.details ?? []) {
      const delay = typeof d.retryDelay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay) : null;
      if (delay) retryAfterS = Math.ceil(Number(delay[1]));
      const violations = Array.isArray(d.violations) ? (d.violations as Array<Record<string, unknown>>) : [];
      // quotaId tells the limits apart: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" (RPD),
      // "…PerMinute…" (RPM, or input tokens per minute).
      if (violations.some((v) => /PerDay/i.test(String(v.quotaId ?? "")))) daily = true;
      if (violations.some((v) => /PerMinute/i.test(String(v.quotaId ?? "")))) perMinute = true;
    }
  } catch {
    /* not JSON */
  }
  return { retryAfterS, daily, perMinute };
}

/* ------------------------------------------------------------------ stream chunks */

export interface Usage {
  input: number;
  output: number;
  thoughts: number;
  cached: number;
}

export interface Chunk {
  /** Visible answer text in this chunk (thought summaries excluded). */
  text: string;
  finishReason?: string;
  blockReason?: string;
  usage?: Usage;
}

export function readChunk(data: string): Chunk | null {
  let json: {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: Record<string, number>;
  };
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const cand = json.candidates?.[0];
  const chunk: Chunk = { text: "" };
  // Thought summaries (thought: true) are never shown; no tools are declared, so there are no function calls.
  for (const part of cand?.content?.parts ?? []) if (typeof part.text === "string" && !part.thought) chunk.text += part.text;
  if (cand?.finishReason) chunk.finishReason = cand.finishReason;
  if (json.promptFeedback?.blockReason) chunk.blockReason = json.promptFeedback.blockReason;
  const u = json.usageMetadata;
  if (u) {
    chunk.usage = {
      input: u.promptTokenCount ?? 0,
      output: u.candidatesTokenCount ?? 0,
      thoughts: u.thoughtsTokenCount ?? 0,
      cached: u.cachedContentTokenCount ?? 0,
    };
  }
  return chunk;
}

export function meaningful(c: Chunk): boolean {
  return c.text.length > 0 || Boolean(c.finishReason) || Boolean(c.blockReason);
}

export async function* chunks(res: Response, signal: AbortSignal): AsyncGenerator<Chunk> {
  for await (const data of parseSse(res.body!, signal)) {
    const c = readChunk(data);
    if (c) yield c;
  }
  // An aborted read ends the byte stream early; that is not a normal end of the answer.
  if (signal.aborted) throw new UpstreamError("aborted");
}
