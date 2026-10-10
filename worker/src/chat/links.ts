/**
 * Link guard: the answer may only link to URLs that appear in the knowledge base or the instructions (plus the site
 * itself). Runs on the streamed text; a markdown link or bare URL is held back until it is complete, then
 *   allowed      → passed through unchanged;
 *   not allowed  → `[text](bad-url)` becomes `text`, a bare bad URL is dropped.
 * Catches the model "remembering" a URL slightly wrong (measured: `https://wa.co/201142070946` instead of wa.me) or
 * repeating a link a visitor tried to plant.
 */
const URL_IN_TEXT = /\b(?:https?:\/\/[^\s<>()[\]"'`]+|mailto:[^\s<>()[\]"'`]+)/gi;
const TRAILING_PUNCT = /[.,;:!?]+$/;

export type LinkCheck = (url: string) => boolean;

/** Builds the allow-list from texts that contain the trusted URLs (knowledge base, system prompt). */
export function buildLinkCheck(sources: string[], siteOrigins: string[] = ["https://mohamedhatem.dev", "https://www.mohamedhatem.dev"]): LinkCheck {
  const prefixes = new Map<string, Set<string>>(); // origin → path prefixes ("" = whole origin)
  const mails = new Set<string>();
  const phones = new Set<string>();
  const add = (origin: string, path: string) => {
    if (!prefixes.has(origin)) prefixes.set(origin, new Set());
    prefixes.get(origin)!.add(path);
  };
  for (const o of siteOrigins) add(o, "");
  for (const text of sources) {
    for (const m of text.matchAll(URL_IN_TEXT)) {
      const raw = m[0].replace(TRAILING_PUNCT, "");
      if (/^mailto:/i.test(raw)) {
        mails.add(raw.slice(7).split("?")[0]!.toLowerCase());
        continue;
      }
      try {
        const u = new URL(raw);
        add(u.origin, u.pathname.replace(/\/+$/, ""));
        if (u.hostname === "wa.me") phones.add(u.pathname.replace(/\D/g, ""));
      } catch {
        /* not a URL */
      }
    }
  }
  return (url: string) => {
    const link = url.trim();
    if (/^#[\w-]*$/.test(link) || /^\/(?!\/)/.test(link)) return true; // in-site anchors and paths
    if (/^mailto:/i.test(link)) return mails.has(link.slice(7).split("?")[0]!.toLowerCase());
    if (/^tel:/i.test(link)) return phones.has(link.replace(/\D/g, ""));
    let u: URL;
    try {
      u = new URL(link);
    } catch {
      return false;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const paths = prefixes.get(u.origin);
    if (!paths) return false;
    const path = u.pathname.replace(/\/+$/, "");
    for (const p of paths) if (p === "" || path === p || path.startsWith(`${p}/`)) return true;
    return false;
  };
}

/** Longest a markdown link may take to complete before "[" is treated as plain text. */
const MAX_LINK = 400;

export class LinkFilter {
  private buf = "";

  constructor(private readonly allowed: LinkCheck) {}

  /** Adds text; returns the part that is safe to pass on now. */
  push(text: string): string {
    this.buf += text;
    return this.drain(false);
  }

  /** End of the answer: resolves whatever is still held. */
  flush(): string {
    return this.drain(true);
  }

  private drain(final: boolean): string {
    let out = "";
    for (;;) {
      const b = this.buf;
      const bracket = b.indexOf("[");
      URL_IN_TEXT.lastIndex = 0;
      const bare = URL_IN_TEXT.exec(b);
      const bareAt = bare ? bare.index : -1;
      // A bare URL might still be starting at the very end ("htt", "mail"): hold that tail back.
      const partialAt = final ? -1 : partialSchemeAt(b);
      const starts = [bracket, bareAt, partialAt].filter((i) => i >= 0);
      if (!starts.length) {
        out += b;
        this.buf = "";
        return out;
      }
      const at = Math.min(...starts);
      out += b.slice(0, at);
      this.buf = b.slice(at);

      if (at === bracket) {
        const link = /^\[([^\]\n]*)\]\(([^)\s]*)(?:\s+"[^"\n]*")?\)/.exec(this.buf);
        if (link) {
          out += this.allowed(link[2]!) ? link[0] : link[1];
          this.buf = this.buf.slice(link[0].length);
          continue;
        }
        // Not (yet) a link: incomplete at the end of the stream so far → wait; otherwise "[" is just text.
        const couldGrow = !final && this.buf.length < MAX_LINK && /^\[[^\]\n]*(\](\([^)\s]*(\s+"[^"\n]*"?)?)?)?$/.test(this.buf);
        if (couldGrow) return out;
        // The answer ended inside a link ("[text](https://…" cut off): keep the text, drop the half URL.
        const cut = final ? /^\[([^\]\n]*)\]\([^)]*$/.exec(this.buf) : null;
        if (cut) {
          out += cut[1];
          this.buf = "";
          continue;
        }
        out += "[";
        this.buf = this.buf.slice(1);
        continue;
      }

      if (at === bareAt && bare) {
        // The bare URL now starts at 0; if it reaches the end of what we have, it may continue in the next chunk.
        if (!final && bare[0].length >= this.buf.length) return out;
        const url = bare[0].replace(TRAILING_PUNCT, "");
        out += this.allowed(url) ? url : "";
        this.buf = this.buf.slice(url.length);
        continue;
      }

      // Partial scheme at the end: wait for more text.
      return out;
    }
  }
}

/** Index where a URL scheme ("http", "https://", "mailt"…) may be starting at the end of the text, else -1. */
function partialSchemeAt(text: string): number {
  const m = /(?:^|[^\w])((?:h(?:t(?:t(?:p(?:s?(?::\/{0,2})?)?)?)?)?|m(?:a(?:i(?:l(?:t(?:o:?)?)?)?)?)?))$/i.exec(text);
  if (!m || !m[1]) return -1;
  return text.length - m[1].length;
}
