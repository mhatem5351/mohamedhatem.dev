/**
 * Output guard: a cheap tripwire against prompt leaks, run on the answer while it streams.
 *
 * 1. Canaries: random markers sit in the system instruction; an answer containing one is blocked before the chunk
 *    holding it reaches the browser (a tail that could be the start of a canary is held back until more text arrives).
 * 2. Verbatim leak: the answer is compared, as it grows, with every run of {@link SHINGLE} consecutive words of the
 *    private instructions (minus runs that also occur in the public knowledge base, e.g. contact details). Matches
 *    from {@link LEAK_BLOCKS} or more different blocks (paragraphs / list items) of the instructions → blocked. One
 *    quoted sentence (a canned phrase the prompt suggests) never trips it; a "repeat the text above" dump does.
 *    Text the prompt *wants* echoed is not fingerprinted: example answers ("**Assistant:** …" up to the next
 *    "**Visitor:**" or heading) and quoted phrasings longer than 30 characters. (An answer that followed the prompt's
 *    LangGraph example word for word was blocked before this rule.) Translations and paraphrases are left to the
 *    model's own rules.
 * 3. Confidential names (confidential.ts): the unnamed client's names, checked by hash on every 1-3 word sequence.
 *    The last words are held back until the next chunk, so a name is caught before any part of it is sent; the
 *    caller then replaces the whole answer with a fixed reply. Runs of percent-escapes or HTML numeric entities are
 *    decoded and checked too (audit R7-11), only when the answer contains one.
 */
import { ConfidentialScanner, escapedNameIn, type ConfidentialMatcher } from "./confidential";

export const SHINGLE = 10;
export const LEAK_BLOCKS = 3;

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export function shingles(text: string, n = SHINGLE): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Blocks of a markdown text: paragraphs and list items. */
const blocks = (text: string) => text.split(/\n\s*\n|\n(?=\s*(?:[-*+]|\d+[.)])\s)/);

/** Removes the parts of the instructions an answer is meant to imitate: example answers and quoted phrasings. */
export function withoutExamples(text: string): string {
  return text
    .replace(/\*\*(?:Assistant|Answer|Reply)\s*:\*\*[\s\S]*?(?=\n\s*\*\*(?:Visitor|User|Question)\s*:\*\*|\n#{1,6}\s|$)/gi, "\n\n")
    .replace(/"[^"\n]{30,}"|“[^”\n]{30,}”|«[^»\n]{30,}»/g, " ");
}

/**
 * Fingerprints of the private instructions that never legitimately appear in an answer: shingle → index of the
 * block it comes from.
 */
export function buildFingerprints(privateText: string, publicText: string): Map<string, number> {
  const pub = shingles(publicText);
  const out = new Map<string, number>();
  blocks(withoutExamples(privateText)).forEach((block, i) => {
    for (const s of shingles(block)) if (!pub.has(s) && !out.has(s)) out.set(s, i);
  });
  return out;
}

export type GuardVerdict = { ok: true; emit: string } | { ok: false; reason: "canary" | "leak" | "confidential" };

/**
 * Incremental: every chunk is normalised and checked once (only a window of canary length is re-scanned), so the
 * cost stays linear in the answer length (the Free plan allows 10 ms of CPU per request).
 */
export class OutputGuard {
  private text = "";
  private emitted = 0;
  private words: string[] = [];
  /** Trailing letters/digits not yet known to be a complete word. */
  private partial = "";
  /** Shingles ending before this word index have been checked. */
  private checked = 0;
  /** Blocks of the private instructions the answer has quoted from. */
  private hits = new Set<number>();
  private readonly canaries: string[];
  private readonly longest: number;
  private readonly names: ConfidentialScanner | null;
  private readonly matcher: ConfidentialMatcher | null;

  constructor(
    canaries: string | readonly string[],
    private readonly fingerprints: Map<string, number>,
    confidential?: ConfidentialMatcher,
  ) {
    this.canaries = (typeof canaries === "string" ? [canaries] : [...canaries]).filter(Boolean).map((c) => c.toLowerCase());
    this.longest = Math.max(0, ...this.canaries.map((c) => c.length));
    this.names = confidential ? new ConfidentialScanner(confidential) : null;
    this.matcher = confidential ?? null;
  }

  /** Adds a chunk; returns the text that is now safe to send, or a block verdict. */
  push(chunk: string): GuardVerdict {
    const from = Math.max(0, this.text.length - this.longest + 1);
    this.text += chunk;
    if (this.canaryFrom(from)) return { ok: false, reason: "canary" };
    if (this.leaked(chunk, false)) return { ok: false, reason: "leak" };
    const namesEnd = this.names ? this.names.push(chunk) : this.text.length;
    if (namesEnd < 0 || this.escapedName(chunk)) return { ok: false, reason: "confidential" };
    // Hold back a possible canary prefix and the last words (a name may still be completing) at the end.
    const safeEnd = Math.min(this.text.length - this.heldBack(), namesEnd);
    const emit = this.text.slice(this.emitted, Math.max(this.emitted, safeEnd));
    this.emitted = Math.max(this.emitted, safeEnd);
    return { ok: true, emit };
  }

  /** End of the answer: everything not yet sent (the held-back tail is not a canary). */
  flush(): GuardVerdict {
    if (this.canaryFrom(Math.max(0, this.text.length - this.longest))) return { ok: false, reason: "canary" };
    if (this.leaked("", true)) return { ok: false, reason: "leak" };
    if (this.names && this.names.push("", true) < 0) return { ok: false, reason: "confidential" };
    if (this.escapedName("%")) return { ok: false, reason: "confidential" };
    const emit = this.text.slice(this.emitted);
    this.emitted = this.text.length;
    return { ok: true, emit };
  }

  get answer(): string {
    return this.text;
  }

  /** True once any text has been released to the browser. */
  get started(): boolean {
    return this.emitted > 0;
  }

  /** An escaped run (it can't be told complete mid-stream, so the whole text is checked whenever one may grow). */
  private escapedName(chunk: string): boolean {
    if (!this.matcher || !/[%&#;0-9A-Fa-f]/.test(chunk)) return false;
    return escapedNameIn(this.text, this.matcher) !== null;
  }

  private canaryFrom(from: number): boolean {
    if (!this.canaries.length) return false;
    const window = this.text.slice(from).toLowerCase();
    return this.canaries.some((c) => window.includes(c));
  }

  /** Length of the longest suffix of the text that is a proper prefix of a canary (case-insensitive). */
  private heldBack(): number {
    const tail = this.text.slice(-this.longest).toLowerCase();
    let hold = 0;
    for (const c of this.canaries) {
      for (let k = Math.min(c.length - 1, tail.length); k > hold; k--) {
        if (tail.endsWith(c.slice(0, k))) {
          hold = k;
          break;
        }
      }
    }
    return hold;
  }

  private leaked(chunk: string, final: boolean): boolean {
    if (!this.fingerprints.size) return false;
    const pending = this.partial + chunk;
    this.partial = final ? "" : (/[\p{L}\p{N}]+$/u.exec(pending)?.[0] ?? "");
    const complete = pending.slice(0, pending.length - this.partial.length);
    if (complete) this.words.push(...words(complete));
    for (let end = Math.max(this.checked, SHINGLE); end <= this.words.length; end++) {
      const block = this.fingerprints.get(this.words.slice(end - SHINGLE, end).join(" "));
      if (block !== undefined) this.hits.add(block);
    }
    this.checked = this.words.length + 1;
    return this.hits.size >= LEAK_BLOCKS;
  }
}
