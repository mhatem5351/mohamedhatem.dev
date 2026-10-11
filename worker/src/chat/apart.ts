import { MENTIONS_GADD, MENTIONS_GOV_ASSISTANT } from "./intent";

/**
 * GADD and the government assistant never share an answer (round-6 decision; audit R6-01, R6-02). The prompt says so,
 * and a per-turn hint repeats it, but the lite models still listed the government assistant right under GADD when
 * asked "which clients, and what did he build for each one?". This filter is the backstop, on the streamed answer:
 *
 *   "clients" (the visitor asks about his clients or names GADD): GADD stays; every sentence or list item that
 *             mentions the government assistant, a client that isn't named, or a count of his clients is dropped;
 *   "gov"     (the visitor asks about the government assistant or names a possible client for it): the other way
 *             round, every sentence or list item that mentions GADD is dropped;
 *   "first"   (any other turn about Wakeb Data): whichever of the two comes first stays.
 * A sentence or item that mentions both is dropped in every mode.
 *
 * Streaming: list items are held until their line ends, other text until the end of each sentence, so a dropped unit
 * never reaches the browser. Only turns that may touch either topic use it (handler.ts); others stream as before.
 */
export type ApartMode = "clients" | "gov" | "first";

const BULLET = /^\s*(?:[-*+•]|\d{1,2}[.)])\s/;
/** A line start that may still become a list marker ("-", "1", "1."). */
const MAYBE_BULLET = /^\s*(?:[-*+•]|\d{1,2}[.)]?)?$/;
/** Sentence ends: punctuation (a closing ** may follow) and whitespace. */
const SENTENCE_END = /[.!?؟](?:\*\*)?\s+/g;

/** A sentence that points at a client it doesn't name: the government assistant's, as far as a reader can tell. */
const UNNAMED_CLIENT =
  /\bclients?\b[^.\n]{0,60}\b(?:isn't|is not|aren't|are not|not|un)\s?(?:named|disclosed)\b|\b(?:unnamed|confidential|undisclosed) clients?\b|name confidential|لا يُذكر اسمها|لا يذكر اسمها|غير مسما/i;
/** On a clients turn, counting his Wakeb clients ("two clients") points at the one that isn't named. */
const COUNTED_CLIENTS = /\b(?:two|2|both|several|multiple)\s+(?:\w+\s+)?clients\b|عميلين|عميلان/i;

type Topic = "gadd" | "gov";

export class ApartFilter {
  private buf = "";
  private lineStart = true;
  private kept: Topic | null;
  /** Units dropped so far (for logs and tests). */
  dropped = 0;

  constructor(private readonly mode: ApartMode) {
    this.kept = mode === "clients" ? "gadd" : mode === "gov" ? "gov" : null;
  }

  push(text: string): string {
    this.buf += text;
    return this.drain(false);
  }

  flush(): string {
    return this.drain(true);
  }

  private drain(final: boolean): string {
    let out = "";
    while (this.buf) {
      const nl = this.buf.indexOf("\n");
      const complete = nl !== -1;
      const line = complete ? this.buf.slice(0, nl + 1) : this.buf;
      if (this.lineStart && BULLET.test(line)) {
        if (!complete && !final) break;
        out += this.keep(line) ? line : "";
        this.buf = this.buf.slice(line.length);
        this.lineStart = true;
        continue;
      }
      if (this.lineStart && !complete && !final && MAYBE_BULLET.test(line)) break;
      // Running text: pass the complete sentences (the whole line once it ends).
      const end = complete || final ? line.length : lastSentenceEnd(line);
      if (end <= 0) break;
      for (const s of line.slice(0, end).split(/(?<=[.!?؟](?:\*\*)?\s+)/)) if (s && this.keep(s)) out += s;
      this.buf = this.buf.slice(end);
      this.lineStart = end === line.length && complete;
    }
    return out;
  }

  /** Whether a sentence or list item may be shown; the first topic seen (or the mode's) decides. */
  private keep(unit: string): boolean {
    const gadd = MENTIONS_GADD.test(unit);
    const gov = MENTIONS_GOV_ASSISTANT.test(unit) || UNNAMED_CLIENT.test(unit) || (this.mode === "clients" && COUNTED_CLIENTS.test(unit));
    if (!gadd && !gov) return true;
    const topic: Topic | "both" = gadd && gov ? "both" : gadd ? "gadd" : "gov";
    if (topic !== "both" && (this.kept === null || this.kept === topic)) {
      this.kept = topic;
      return true;
    }
    this.dropped++;
    return false;
  }
}

function lastSentenceEnd(text: string): number {
  let end = 0;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) end = m.index + m[0].length;
  return end;
}
