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
  const site = siteOrigins[0] ?? "https://mohamedhatem.dev";
  return (url: string) => {
    const link = url.trim();
    // Browsers treat "\" like "/" and drop tabs and newlines, so "/\evil.example" or "/<TAB>/evil.example" would open
    // another site: any backslash, whitespace or control character inside a link refuses it outright.
    if (!link || /[\\\s\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(link)) return false;
    if (/^#[\w-]*$/.test(link)) return true; // in-page anchor
    if (/^mailto:/i.test(link)) return mails.has(link.slice(7).split("?")[0]!.toLowerCase());
    if (/^tel:/i.test(link)) return phones.has(link.replace(/\D/g, ""));
    let u: URL;
    try {
      // Relative links ("/cv/", "cv/") resolve against the site, exactly as the widget resolves them.
      u = new URL(link, `${site}/`);
    } catch {
      return false;
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) return siteOrigins.includes(u.origin);
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
        // Anything up to ")" counts as the target, whitespace included: the widget's renderer would still make a
        // link of "[x](/<TAB>/host)", so it must be judged here, not passed on as plain text.
        const link = /^\[([^\]\n]*)\]\(([^)\n]*)\)/.exec(this.buf);
        if (link) {
          const target = /^\s*(\S+)(?:\s+"[^"\n]*")?\s*$/.exec(link[2]!)?.[1];
          out += target && this.allowed(target) ? link[0] : link[1];
          this.buf = this.buf.slice(link[0].length);
          continue;
        }
        // Not (yet) a link: incomplete at the end of the stream so far → wait; otherwise "[" is just text.
        const couldGrow = !final && this.buf.length < MAX_LINK && /^\[[^\]\n]*(\](\([^)\n]*)?)?$/.test(this.buf);
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

/* ------------------------------------------------------------------ phone numbers */

const DISPLAY_PHONE = /\+\d[\d ]{6,}\d/g;

/**
 * digits → how the knowledge base writes the number ("201142070946" → "+20 114 207 0946"), for every number that is
 * also a wa.me link in the sources; the Egyptian local form (0 + national number) maps to the same display.
 */
export function buildPhoneFormats(sources: string[]): Map<string, string> {
  const formats = new Map<string, string>();
  const known = new Set<string>();
  for (const text of sources) for (const m of text.matchAll(/https:\/\/wa\.me\/(\d{8,15})/g)) known.add(m[1]!);
  for (const text of sources)
    for (const m of text.matchAll(DISPLAY_PHONE)) {
      const digits = m[0].replace(/\D/g, "");
      if (!known.has(digits)) continue;
      formats.set(digits, m[0]);
      if (digits.startsWith("20")) formats.set(`0${digits.slice(2)}`, m[0]);
    }
  return formats;
}

/** A run that may be a phone number: optional +, then 8+ digits/spaces/dashes/brackets, optional trailing + (RTL slip). */
const PHONE_RUN = /(?<![\p{L}\p{N}_/=.%@#-])\+?[0-9٠-٩][0-9٠-٩  ()-]{6,}[0-9٠-٩]\+?(?![\p{L}\p{N}_/])/gu;
const PHONE_TAIL = /\+?[0-9٠-٩][0-9٠-٩  ()-]*\+?$|\+$/u;

/**
 * Rewrites the site owner's phone number to its canonical display wherever the model wrote it differently (measured
 * in an Arabic answer: "201142070946+", the plus last in logical order, which renders and copies as a wrong number).
 * URLs and link targets are left alone (the run must not follow "/", "=", "." and the like). Streaming-safe: a
 * trailing run of digits is held back until the next chunk shows where it ends.
 */
export class PhoneFilter {
  private buf = "";
  /** The last character already passed on: context for the run's look-behind (a held run may follow "wa.me/"). */
  private last = "";

  constructor(private readonly formats: Map<string, string>) {}

  push(text: string): string {
    this.buf += text;
    if (!this.formats.size) return this.take(this.buf.length);
    const tail = PHONE_TAIL.exec(this.buf);
    return this.take(tail ? tail.index : this.buf.length);
  }

  flush(): string {
    return this.take(this.buf.length);
  }

  private take(end: number): string {
    const ready = this.buf.slice(0, end);
    this.buf = this.buf.slice(end);
    if (!ready || !this.formats.size) return ready;
    // The context character is never part of a run (a held run starts after a non-run character), so it survives
    // the replacement unchanged and is cut off again.
    const out = (this.last + ready)
      .replace(PHONE_RUN, (run) => {
        const digits = run.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, "");
        return this.formats.get(digits) ?? run;
      })
      .slice(this.last.length);
    this.last = ready.slice(-1);
    return out;
  }
}
