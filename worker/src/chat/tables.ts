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
 * bullet, its first cell in bold. Streaming-safe: only a line that starts with "|" is held back, until its end (and,
 * for a possible header, until the next line shows whether a separator follows); all other text passes at once.
 */
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const ROW = /^\s*\|.*\|\s*$/;

export class TableFilter {
  /** Text not yet passed on: the start of a line that may be a table row. */
  private buf = "";
  /** At the start of a line (the previous text ended with a newline, or nothing was seen yet). */
  private lineStart = true;
  /** A complete row held until the next line shows whether it is a header (followed by a separator). */
  private pending: string | null = null;
  /** Inside a table (a separator was seen): rows are converted without waiting. */
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
      if (!this.buf) return final ? out + this.release() : out;
      if (!this.lineStart && this.pending === null) {
        // Mid-line: pass everything up to and including the next newline.
        const nl = this.buf.indexOf("\n");
        if (nl === -1) {
          out += this.buf;
          this.buf = "";
          return out;
        }
        out += this.buf.slice(0, nl + 1);
        this.buf = this.buf.slice(nl + 1);
        this.lineStart = true;
        continue;
      }
      // At a line start: a line that can't be a table row passes at once.
      if (!/^\s*(?:\||$)/.test(this.buf) && this.pending === null) {
        this.inTable = false;
        this.lineStart = false;
        continue;
      }
      const nl = this.buf.indexOf("\n");
      if (nl === -1 && !final) {
        // Possibly a row: wait for its end (unless it already can't be one).
        if (/^\s*[^\s|]/.test(this.buf)) {
          out += this.release();
          this.inTable = false;
          this.lineStart = false;
          continue;
        }
        return out;
      }
      const line = nl === -1 ? this.buf : this.buf.slice(0, nl);
      const eol = nl === -1 ? "" : "\n";
      this.buf = nl === -1 ? "" : this.buf.slice(nl + 1);
      this.lineStart = true;
      if (this.pending !== null) {
        if (SEPARATOR.test(line) && /\|/.test(line)) {
          // The held row was a header: drop it and the separator.
          this.pending = null;
          this.inTable = true;
          continue;
        }
        out += this.release();
      }
      if (ROW.test(line) && cells(line).length >= 2) {
        if (this.inTable) out += bullet(line) + eol;
        else this.pending = line + eol;
        continue;
      }
      if (this.inTable && SEPARATOR.test(line) && /\|/.test(line)) continue;
      this.inTable = false;
      out += line + eol;
    }
  }

  /** A held row that turned out not to be a header: a bullet like any other row. */
  private release(): string {
    if (this.pending === null) return "";
    const row = this.pending;
    this.pending = null;
    const eol = row.endsWith("\n") ? "\n" : "";
    return bullet(row.replace(/\n$/, "")) + eol;
  }
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
