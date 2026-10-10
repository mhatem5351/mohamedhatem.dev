/**
 * A tiny, safe markdown renderer for model answers. It builds DOM nodes directly (text always goes through text
 * nodes / textContent; there is no innerHTML anywhere), so model output can never inject markup.
 *
 * Blocks: paragraphs (single newlines → <br>), bullet and numbered lists (one nesting level), fenced code blocks,
 * headings (rendered as bold paragraphs: the chat has no heading hierarchy), horizontal rules, "> " quotes (as text).
 * Inline: **bold**, *italic* / _italic_, `code`, [links](url), bare URLs, the site's own email addresses (any other
 * address stays plain text, so a planted one can't become a link), backslash escapes.
 * Links: http(s), mailto, tel, "#section" and paths on this site only; anything else renders as plain text.
 *
 * Streaming-tolerant: an unclosed ** turns bold until the end of the line, a half-streamed [link](… shows only its
 * text, and an unclosed code fence renders as a code block, so partial answers never flash raw syntax.
 */
import { LATIN_RUN } from "./lang";

export interface MdOptions {
  /** Wrap Latin-script runs in left-to-right isolates (for right-to-left messages). */
  isolate?: boolean;
  /** Append the streaming cursor to the last block. */
  cursor?: boolean;
  /** Email addresses that bare text may turn into mailto: links (the widget's contact config). */
  emails?: string[];
}

interface Ctx extends MdOptions {
  /** Inside a link: no nested links. */
  inLink?: boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => document.createElement(tag);
const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
const AUTO = /\bhttps?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]}]|[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi;

/**
 * The href to use for a model-provided link, or null when it is not allowed (javascript:, data:, //host, …).
 * Backslashes, whitespace and control characters are refused outright: the URL parser reads a backslash as "/" and
 * drops tabs and newlines, so "/\evil.example" or "/<tab>/evil.example" would otherwise reach https://evil.example.
 * A path must also resolve to this site.
 */
export function safeHref(raw: string): string | null {
  const h = raw.trim().replace(/^<(.*)>$/, "$1");
  if (/^#[\w-]+$/.test(h)) return h;
  if (/[\\\s\0-\x1f\x7f-\x9f]/.test(h) || !/^(https?:\/\/|mailto:|tel:|\/)/i.test(h)) return null;
  try {
    const u = new URL(h, location.href);
    return /^(https?|mailto|tel):$/.test(u.protocol) && (h[0] !== "/" || u.origin === location.origin) ? u.href : null;
  } catch {
    return null;
  }
}

export function renderMarkdown(src: string, opts: MdOptions = {}): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const c: Ctx = { ...opts };
  let para: string[] = [];
  let list = null as HTMLElement | null;
  let item = null as HTMLElement | null;
  let sub = null as HTMLElement | null;

  const flush = () => {
    if (!para.length) return;
    const p = el("p");
    para.forEach((l, i) => {
      if (i) p.append(el("br"));
      inline(p, l, c);
    });
    frag.append(p);
    para = [];
  };
  const endList = () => (list = item = sub = null);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      flush();
      endList();
      const body: string[] = [];
      while (++i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i]!);
      const pre = el("pre");
      const code = el("code");
      code.textContent = body.join("\n");
      pre.dir = "ltr";
      pre.append(code);
      frag.append(pre);
      continue;
    }
    if (!line.trim()) {
      // A blank line ends the paragraph; a list carries on if the next line is another item ("loose" lists).
      flush();
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      endList();
      frag.append(el("hr"));
      continue;
    }
    const m = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const tag = /\d/.test(m[2]!) ? "ol" : "ul";
      const li = el("li");
      inline(li, m[3]!, c);
      if (m[1]!.length >= 2 && item) {
        if (sub?.tagName.toLowerCase() !== tag) item.append((sub = el(tag)));
        sub.append(li);
      } else {
        if (list?.tagName.toLowerCase() !== tag) {
          frag.append((list = el(tag)));
          const n = parseInt(m[2]!, 10);
          if (tag === "ol" && n > 1) list.setAttribute("start", String(n));
        }
        list.append((item = li));
        sub = null;
      }
      continue;
    }
    if (item && !para.length && /^\s{2,}\S/.test(line)) {
      // Indented continuation of the previous list item.
      const target = (sub?.lastElementChild as HTMLElement | null) ?? item;
      target.append(" ");
      inline(target, line.trim(), c);
      continue;
    }
    endList();
    const h = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const p = el("p");
      const b = el("strong");
      inline(b, h[1]!, c);
      p.append(b);
      frag.append(p);
      continue;
    }
    para.push(line.replace(/^\s*>\s?/, ""));
  }
  flush();

  if (opts.cursor) {
    let last = frag.lastElementChild;
    while (last && /^(UL|OL)$/.test(last.tagName) && last.lastElementChild) {
      last = last.lastElementChild;
      const nested = last.lastElementChild;
      if (nested && /^(UL|OL)$/.test(nested.tagName)) last = nested;
    }
    if (last?.tagName === "PRE") last = last.firstElementChild;
    if (!last || last.tagName === "HR") frag.append((last = el("p")));
    const cursor = el("span");
    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");
    last.append(cursor);
  }
  return frag;
}

function inline(parent: ParentNode, s: string, c: Ctx): void {
  let text = "";
  const flush = () => {
    if (text) textOut(parent, text, c);
    text = "";
  };
  for (let i = 0; i < s.length; ) {
    const ch = s[i]!;
    const next = s[i + 1];
    if (ch === "\\" && next && /[\\`*_[\]()#+.!-]/.test(next)) {
      text += next;
      i += 2;
      continue;
    }
    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        flush();
        const code = el("code");
        code.textContent = s.slice(i + 1, j);
        if (c.isolate) code.dir = "ltr";
        parent.append(code);
        i = j + 1;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && !(ch === "_" && isWord(s[i - 1]))) {
      if (next === ch) {
        // **bold** (unclosed while streaming: bold to the end of the line)
        const j = s.indexOf(ch + ch, i + 2);
        flush();
        const b = el("strong");
        inline(b, j < 0 ? s.slice(i + 2) : s.slice(i + 2, j), c);
        parent.append(b);
        i = j < 0 ? s.length : j + 2;
        continue;
      }
      if (next && next !== " ") {
        const j = closing(s, ch, i + 1);
        if (j > 0) {
          flush();
          const em = el("em");
          inline(em, s.slice(i + 1, j), c);
          parent.append(em);
          i = j + 1;
          continue;
        }
      }
    }
    if (ch === "[" && !c.inLink) {
      const close = s.indexOf("]", i + 1);
      if (close > i && s[close + 1] === "(") {
        const end = s.indexOf(")", close + 2);
        const label = s.slice(i + 1, close);
        flush();
        if (end < 0) {
          // Half-streamed link: show the text now, the link once the URL is complete.
          inline(parent, label, c);
          i = s.length;
        } else {
          link(parent, label, s.slice(close + 2, end), c);
          i = end + 1;
        }
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
}

/** Index of the closing single * or _ for an emphasis opened before `from`, or -1. */
function closing(s: string, ch: string, from: number): number {
  for (let j = from + 1; j < s.length; j++) {
    if (s[j] === ch && s[j - 1] !== " " && s[j + 1] !== ch && !(ch === "_" && isWord(s[j + 1]))) return j;
  }
  return -1;
}

function link(parent: ParentNode, label: string, href: string, c: Ctx): void {
  const url = safeHref(href.split(/\s+["']/)[0]!);
  if (!url) return inline(parent, label, { ...c, inLink: true });
  const a = el("a");
  a.href = url;
  if (/^https?:/.test(url) && new URL(url).origin !== location.origin) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  inline(a, label || url, { ...c, inLink: true });
  parent.append(a);
}

/** Plain text: bare URLs and allowed emails become links, then (RTL messages) Latin runs become LTR isolates. */
function textOut(parent: ParentNode, text: string, c: Ctx): void {
  if (c.inLink) return isolate(parent, text, c);
  let last = 0;
  for (const m of text.matchAll(AUTO)) {
    const v = m[0];
    const url = v.includes("://");
    if (!url && !c.emails?.some((e) => e.toLowerCase() === v.toLowerCase())) continue;
    isolate(parent, text.slice(last, m.index), c);
    link(parent, v, url ? v : `mailto:${v}`, c);
    last = m.index + v.length;
  }
  isolate(parent, text.slice(last), c);
}

function isolate(parent: ParentNode, text: string, c: Ctx): void {
  if (!text) return;
  if (!c.isolate) return void parent.append(text);
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const span = el("span");
    span.dir = "ltr";
    // Short runs (phone numbers, names, versions) stay on one line; long English sentences may wrap.
    if (m[0].length <= 24) span.className = "nw";
    span.textContent = m[0];
    parent.append(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}
