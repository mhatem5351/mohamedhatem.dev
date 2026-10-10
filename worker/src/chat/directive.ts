import { validateToolCall } from "./tools";
import type { ToolEvent } from "./protocol";

/**
 * UI directive: the model ends its answer with one line
 *
 *   <ui>{"contact":"hiring","section":"experience","followups":["…","…"]}</ui>
 *
 * which the Worker cuts out of the text stream, validates, and forwards as `event: tool` messages (the same events
 * native function calling would produce). Why not Gemini function calling: Gemini 3 Flash often emits its calls
 * *before* any text and ends the turn, so every such answer needs a second request (measured: 3 of 5 answers, twice
 * the tokens and +30 s to the first token under load, and the free tier allows 20 requests a day for
 * gemini-3.8-flash). The directive costs ~50 output tokens and never a second request, on every model.
 *
 * The extractor is streaming-safe: a tail that could be the start of "<ui>" is held back until it can't be, text
 * inside the tag is captured, and text after "</ui>" (if the model wrote any) is shown normally.
 */
const OPEN = "<ui>";
const CLOSE = "</ui>";

export class DirectiveExtractor {
  private buf = "";
  private inside = false;
  private payloads: string[] = [];
  private current = "";

  /** Adds model text; returns the part that is visible answer text and safe to show now. */
  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    for (;;) {
      const lower = this.buf.toLowerCase();
      if (!this.inside) {
        const i = lower.indexOf(OPEN);
        if (i !== -1) {
          out += this.buf.slice(0, i);
          this.buf = this.buf.slice(i + OPEN.length);
          this.inside = true;
          continue;
        }
        const hold = partialSuffix(lower, OPEN);
        out += this.buf.slice(0, this.buf.length - hold);
        this.buf = this.buf.slice(this.buf.length - hold);
        return out;
      }
      const j = lower.indexOf(CLOSE);
      if (j !== -1) {
        this.payloads.push(this.current + this.buf.slice(0, j));
        this.current = "";
        this.buf = this.buf.slice(j + CLOSE.length);
        this.inside = false;
        continue;
      }
      const hold = partialSuffix(lower, CLOSE);
      this.current += this.buf.slice(0, this.buf.length - hold);
      this.buf = this.buf.slice(this.buf.length - hold);
      return out;
    }
  }

  /** End of the answer: returns any remaining visible text (an unclosed directive is still parsed). */
  flush(): string {
    if (this.inside) {
      this.payloads.push(this.current + this.buf);
      this.current = "";
      this.buf = "";
      this.inside = false;
      return "";
    }
    const rest = this.buf;
    this.buf = "";
    return rest;
  }

  /** Raw directive payloads seen so far (usually exactly one). */
  get raw(): readonly string[] {
    return this.payloads;
  }

  /** The validated UI events from the directive(s), in display order: contact card, section link, follow-ups. */
  events(): ToolEvent[] {
    const out = new Map<ToolEvent["name"], ToolEvent>();
    for (const payload of this.payloads) {
      const d = parseDirective(payload);
      if (!d) continue;
      const contact = d.contact === true ? "general" : d.contact;
      if (contact) {
        const ev = validateToolCall("show_contact_card", { reason: contact });
        if (ev) out.set(ev.name, ev);
      }
      if (d.section) {
        const ev = validateToolCall("open_section", { id: d.section });
        if (ev) out.set(ev.name, ev);
      }
      if (Array.isArray(d.followups)) {
        const ev = validateToolCall("suggest_followups", { questions: d.followups });
        if (ev) out.set(ev.name, ev);
      }
    }
    return (["show_contact_card", "open_section", "suggest_followups"] as const).flatMap((n) => (out.has(n) ? [out.get(n)!] : []));
  }
}

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialSuffix(text: string, tag: string): number {
  for (let k = Math.min(tag.length - 1, text.length); k > 0; k--) if (text.endsWith(tag.slice(0, k))) return k;
  return 0;
}

interface Directive {
  contact?: unknown;
  section?: unknown;
  followups?: unknown;
}

/** Tolerant JSON parse: the outermost {...}, tolerating a trailing comma or a code fence around it. */
export function parseDirective(payload: string): Directive | null {
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const json = payload.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Directive) : null;
  } catch {
    return null;
  }
}
