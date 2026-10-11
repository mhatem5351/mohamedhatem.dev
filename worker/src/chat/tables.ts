/**
 * Markdown tables → bullets, on the streamed answer (audit R6-09). The chat widget doesn't render tables, so a pipe
 * table showed as raw "| Client | Project |" and "| --- | --- |" lines, a wall of pipes on the phone sheet. The
 * prompt says "no tables, even when asked"; this filter is the backstop when a model writes one anyway:
 *
 *   | Project | Agents | Stack |          - **ArabsStock Assistant:** 14 · LangGraph
 *   | --- | --- | --- |            →     - **Wakeb chatbot:** 6 · vLLM, Qwen
 *   | ArabsStock Assistant | 14 | LangGraph |
 *   | Wakeb chatbot | 6 | vLLM, Qwen |
 *
 * The header row (a row followed by a |---| separator) and the separator are dropped; every other row becomes one
 * bullet, its first cell in bold. A line that starts with "|" becomes a bullet even without a separator.
 *
 * GFM also allows a table without the outer pipes (audit R7-13), which passed through unchanged before:
 *
 *   Project | Agents                       Project · Agents
 *   --- | ---                       →      - **ArabsStock Assistant:** 14
 *   ArabsStock Assistant | 14
 *
 * A line with an inner "|" is a header when a separator line (two or more columns) follows it; inside a table every
 * line with a "|" is a row, until a line without one. Text without "|" is never held back (streaming latency, and a
 * stalled answer must still reach the visitor), so the header's first cell has already been sent when its first "|"
 * arrives: the rest of the header becomes a caption (" · Agents") instead of being dropped. A line with an inner "|"
 * that no separator follows ("A | B" in a sentence) passes unchanged.
 *
 * Streaming-safe. Held back only:
 *   - a line that starts with "|" (or spaces so far), until its end;
 *   - in a line without outer pipes, the part from its first "|", until the line ends, when the text before it could
 *     be a header's first cell (short, a few words, not a sentence, list item or heading) and the line stays short;
 *   - after such a row, the next line while it could still be a separator ("-", ":", "|" and spaces);
 *   - inside a table, the start of each line until it shows a "|" (a row) or can no longer be a row.
 * Each decision depends on the text only, never on where the chunks were cut: the output is the same at every chunk
 * size.
 */
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** The separator under a header without outer pipes: GFM's, two or more columns of three or more dashes (R7-13). */
const BARE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
/** The start of a line that may still become a separator. */
const SEPARATOR_START = /^[\s|:-]*$/;
const ROW = /^\s*\|.*\|\s*$/;
/** A header row without outer pipes: at most this long, its first cell at most this many characters and words. */
const HEADER_ROW_CHARS = 300;
const HEADER_CELL_CHARS = 60;
const HEADER_CELL_WORDS = 6;
/** Inside a table: the most text before a row's first "|". */
const ROW_CELL_CHARS = 100;

type Mode =
  | "start" // at a line start, nothing of the line passed on yet
  | "open" // an ordinary line without "|" so far: passes as it comes, up to its first "|" or its end
  | "plain" // an ordinary line: passes as it comes, "|" included, up to its end
  | "held"; // a line without outer pipes, from its first "|": held to its end (it may be a header)

export class TableFilter {
  /** Text not yet looked at (or not yet passed on). */
  private buf = "";
  private mode: Mode = "start";
  /** What has been passed on of the current line. */
  private line = "";
  /** In "held" mode: the line from its first "|". */
  private held = "";
  /**
   * A complete row held until the next line shows whether it is a header. `piped`: the whole line (outer pipes);
   * otherwise only the part from its first "|", after `first` (the text before it, already passed on).
   */
  private pending: { text: string; piped: boolean; first: string } | null = null;
  /** Inside a table (a separator was seen): rows are converted as soon as they are complete. */
  private inTable = false;

  push(text: string): string {
    this.buf += text;
    return this.drain(false);
  }

  flush(): string {
    return this.drain(true);
  }

  private drain(final: boolean): string {
    let out = "";
    for (;;) {
      if (this.mode === "open" || this.mode === "plain") {
        // Ordinary text: up to the line's end, or (open) its first "|".
        const at = this.buf.search(this.mode === "open" ? /[|\n]/ : /\n/);
        const end = at === -1 ? this.buf.length : at;
        out += this.buf.slice(0, end);
        this.line += this.buf.slice(0, end);
        this.buf = this.buf.slice(end);
        if (at === -1) return out;
        if (this.buf[0] === "\n") {
          out += "\n";
          this.buf = this.buf.slice(1);
          this.newLine();
          continue;
        }
        // The line's first "|": it may be a header row without outer pipes if what came before could be its first cell.
        this.mode = couldBeHeaderCell(this.line) ? "held" : "plain";
        continue;
      }

      if (this.mode === "held") {
        const nl = this.buf.indexOf("\n");
        this.held += nl === -1 ? this.buf : this.buf.slice(0, nl);
        this.buf = nl === -1 ? "" : this.buf.slice(nl + 1);
        if (this.line.length + this.held.length > HEADER_ROW_CHARS) {
          // Too long for a header row: ordinary text after all.
          out += this.held;
          this.line += this.held;
          this.held = "";
          this.mode = "plain";
          if (nl !== -1) this.buf = `\n${this.buf}`;
          continue;
        }
        if (nl === -1 && !final) return out;
        this.pending = { text: this.held + (nl === -1 ? "" : "\n"), piped: false, first: this.line };
        this.held = "";
        this.newLine();
        continue;
      }

      // At a line start.
      if (!this.buf) return final ? out + this.release() : out;
      const nl = this.buf.indexOf("\n");
      const line = nl === -1 ? this.buf : this.buf.slice(0, nl);
      const eol = nl === -1 ? "" : "\n";
      const done = nl !== -1 || final; // the line is complete
      const take = () => {
        this.buf = nl === -1 ? "" : this.buf.slice(nl + 1);
      };

      if (this.pending) {
        if (!done && SEPARATOR_START.test(line)) return out; // may still be the separator
        const separator = this.pending.piped ? SEPARATOR : BARE_SEPARATOR;
        if (done && separator.test(line) && line.includes("|")) {
          // The held row was a header: drop the separator, and the header (with outer pipes) or the rest of it.
          out += this.caption();
          this.pending = null;
          this.inTable = true;
          take();
          continue;
        }
        out += this.release();
      }

      const pipe = line.indexOf("|");
      if (this.inTable) {
        if (pipe !== -1 && pipe <= ROW_CELL_CHARS) {
          if (!done) return out;
          take();
          if (!SEPARATOR.test(line)) out += bullet(line) + eol; // a repeated separator is dropped
          continue;
        }
        if (pipe === -1 && !done && line.length <= ROW_CELL_CHARS) return out; // its "|" may still come
        this.inTable = false; // a line without "|" ends the table; it is ordinary text
      }

      if (/^\s*\|/.test(line)) {
        // A line that starts with "|": held to its end; a row may be a header.
        if (!done) return out;
        take();
        if (ROW.test(line) && cells(line).length >= 2) this.pending = { text: line + eol, piped: true, first: "" };
        else out += line + eol;
        continue;
      }
      if (!done && /^\s*$/.test(line)) return out; // only spaces so far: a "|" may follow
      this.mode = "open";
    }
  }

  private newLine(): void {
    this.mode = "start";
    this.line = "";
  }

  /** A confirmed header: nothing of a piped one; of one without outer pipes, its other cells after the sent first one. */
  private caption(): string {
    const p = this.pending!;
    if (p.piped) return "";
    const rest = cells(p.text.replace(/\n$/, "")).filter(Boolean);
    return rest.length ? `${/\s$/.test(p.first) ? "" : " "}· ${rest.join(" · ")}\n` : "\n";
  }

  /**
   * A held row that turned out not to be a header: with outer pipes, a bullet like any other row; without, the
   * ordinary text it was ("A | B" in a sentence).
   */
  private release(): string {
    const p = this.pending;
    if (!p) return "";
    this.pending = null;
    if (!p.piped) return p.text;
    const eol = p.text.endsWith("\n") ? "\n" : "";
    return bullet(p.text.replace(/\n$/, "")) + eol;
  }
}

/**
 * Whether the text before a line's first "|" may be the first cell of a header row without outer pipes: a short label,
 * not a sentence, list item, quote or heading.
 */
function couldBeHeaderCell(text: string): boolean {
  return (
    text.length <= HEADER_CELL_CHARS &&
    (text.match(/\S+/g)?.length ?? 0) <= HEADER_CELL_WORDS &&
    !/^\s*(?:[-*+>]|#{1,6}|\d+[.)])\s/.test(text) &&
    !/[.,;:!?،؛؟]\s/.test(text)
  );
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function bullet(line: string): string {
  const [first = "", ...rest] = cells(line).filter(Boolean);
  const label = first.replace(/^\*\*(.*)\*\*$/, "$1").replace(/:$/, "");
  return rest.length ? `- **${label}:** ${rest.join(" · ")}` : `- ${label}`;
}
