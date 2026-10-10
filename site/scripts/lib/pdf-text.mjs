/**
 * Plain text of each page of a PDF, with pdf-lib only (no rendering): enough for the build's checks on the CV
 * (scripts/postbuild/cv-pdf.mjs), not a general extractor.
 *
 * It reads each page's content streams (and the form XObjects they draw), follows the font set by `Tf`, and maps the
 * codes shown by `Tj`, `TJ`, `'` and `"` to Unicode through each font's /ToUnicode CMap (Chromium writes every font
 * as a Type 0 font with Identity-H codes and a ToUnicode map). Text comes out in drawing order: Latin reads normally;
 * Arabic runs are drawn in visual order, so their letters come out reversed. `contains()` handles that.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";

/** Bytes of a stream object, decoded. */
function streamBytes(stream) {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (stream instanceof PDFStream && typeof stream.getContents === "function") return stream.getContents();
  return new Uint8Array();
}

const hex = (s) => parseInt(s, 16);
const utf16 = (h) => {
  let out = "";
  for (let i = 0; i + 4 <= h.length; i += 4) out += String.fromCharCode(hex(h.slice(i, i + 4)));
  return out;
};

/** A ToUnicode CMap as a Map of code (number) → text, and the code width in bytes. */
export function parseToUnicode(text) {
  const map = new Map();
  let bytes = 2;
  const cs = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(text);
  if (cs) bytes = cs[1].length / 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(hex(m[1]), utf16(m[2]));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const lo = hex(m[1]);
      const hi = hex(m[2]);
      if (m[3].startsWith("[")) {
        const items = [...m[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => utf16(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      } else {
        const base = m[3].slice(1, -1);
        const last = hex(base.slice(-4));
        const prefix = utf16(base.slice(0, -4));
        for (let c = lo; c <= hi; c++) map.set(c, prefix + String.fromCharCode(last + (c - lo)));
      }
    }
  }
  return { map, bytes };
}

/** Tokens of a content stream: strings (as byte arrays), arrays of those, names, numbers and operators. */
function* tokens(src) {
  let i = 0;
  const n = src.length;
  const isWs = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const isDelim = (c) => "()<>[]{}/%".includes(String.fromCharCode(c));
  const readString = () => {
    // literal string; i points at "("
    const out = [];
    let depth = 1;
    i++;
    while (i < n && depth > 0) {
      const c = src[i++];
      if (c === 92) {
        const e = src[i++];
        const map = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12, 40: 40, 41: 41, 92: 92 };
        if (e in map) out.push(map[e]);
        else if (e >= 48 && e <= 55) {
          let v = e - 48;
          for (let k = 0; k < 2 && src[i] >= 48 && src[i] <= 55; k++) v = v * 8 + (src[i++] - 48);
          out.push(v & 255);
        } else if (e === 13 || e === 10) {
          if (e === 13 && src[i] === 10) i++;
        } else out.push(e);
      } else if (c === 40) {
        depth++;
        out.push(c);
      } else if (c === 41) {
        if (--depth > 0) out.push(c);
      } else out.push(c);
    }
    return { t: "str", v: out };
  };
  const readHex = () => {
    i++;
    let h = "";
    while (i < n && src[i] !== 62) {
      const ch = String.fromCharCode(src[i++]);
      if (/[0-9A-Fa-f]/.test(ch)) h += ch;
    }
    i++;
    if (h.length % 2) h += "0";
    const out = [];
    for (let k = 0; k < h.length; k += 2) out.push(hex(h.slice(k, k + 2)));
    return { t: "str", v: out };
  };
  let array = null;
  while (i < n) {
    const c = src[i];
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === 37) {
      while (i < n && src[i] !== 10 && src[i] !== 13) i++;
      continue;
    }
    let tok;
    if (c === 40) tok = readString();
    else if (c === 60 && src[i + 1] === 60) {
      i += 2;
      tok = { t: "op", v: "<<" };
    } else if (c === 62 && src[i + 1] === 62) {
      i += 2;
      tok = { t: "op", v: ">>" };
    } else if (c === 60) tok = readHex();
    else if (c === 91) {
      i++;
      array = [];
      continue;
    } else if (c === 93) {
      i++;
      tok = { t: "arr", v: array ?? [] };
      array = null;
    } else if (c === 47) {
      let s = "";
      i++;
      while (i < n && !isWs(src[i]) && !isDelim(src[i])) s += String.fromCharCode(src[i++]);
      tok = { t: "name", v: s };
    } else {
      let s = "";
      while (i < n && !isWs(src[i]) && !isDelim(src[i])) s += String.fromCharCode(src[i++]);
      if (!s) {
        i++;
        continue;
      }
      tok = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? { t: "num", v: Number(s) } : { t: "op", v: s };
    }
    if (array && tok.t !== "arr") array.push(tok);
    else yield tok;
  }
}

/** Text of every page, in drawing order (one string per page). */
export async function pdfPagesText(buf) {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const ctx = doc.context;
  const look = (o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const cmapCache = new Map();
  const fontMap = (fontObj) => {
    const font = look(fontObj);
    if (!(font instanceof PDFDict)) return null;
    const key = fontObj instanceof PDFRef ? fontObj.toString() : font;
    if (cmapCache.has(key)) return cmapCache.get(key);
    const tu = look(font.get(PDFName.of("ToUnicode")));
    const parsed = tu ? parseToUnicode(Buffer.from(streamBytes(tu)).toString("latin1")) : null;
    cmapCache.set(key, parsed);
    return parsed;
  };

  const runContent = (bytes, resources, out, depth = 0) => {
    const fonts = look(resources?.get(PDFName.of("Font")));
    const xobjects = look(resources?.get(PDFName.of("XObject")));
    let cmap = null;
    const stack = [];
    const show = (str) => {
      if (!cmap) return;
      const v = str.v;
      for (let k = 0; k + cmap.bytes <= v.length; k += cmap.bytes) {
        let code = 0;
        for (let b = 0; b < cmap.bytes; b++) code = code * 256 + v[k + b];
        out.push(cmap.map.get(code) ?? "");
      }
    };
    for (const tok of tokens(bytes)) {
      if (tok.t !== "op") {
        stack.push(tok);
        continue;
      }
      switch (tok.v) {
        case "Tf": {
          const name = stack[stack.length - 2];
          cmap = name?.t === "name" && fonts instanceof PDFDict ? fontMap(fonts.get(PDFName.of(name.v))) : null;
          break;
        }
        case "Tj":
        case "'":
        case '"': {
          const s = stack[stack.length - 1];
          if (s?.t === "str") show(s);
          break;
        }
        case "TJ": {
          const a = stack[stack.length - 1];
          if (a?.t === "arr") for (const x of a.v) if (x.t === "str") show(x);
          break;
        }
        case "ET":
          out.push("\n");
          break;
        case "Do": {
          const name = stack[stack.length - 1];
          const xo = name?.t === "name" && xobjects instanceof PDFDict ? look(xobjects.get(PDFName.of(name.v))) : null;
          if (xo instanceof PDFStream && depth < 8 && xo.dict.get(PDFName.of("Subtype"))?.toString() === "/Form") {
            const res = look(xo.dict.get(PDFName.of("Resources")));
            runContent(streamBytes(xo), res instanceof PDFDict ? res : resources, out, depth + 1);
          }
          break;
        }
        default:
          break;
      }
      stack.length = 0;
    }
  };

  return doc.getPages().map((page) => {
    const out = [];
    const contents = page.node.Contents();
    const list = contents instanceof PDFArray ? contents.asArray().map(look) : contents ? [contents] : [];
    for (const s of list) runContent(streamBytes(s), page.node.Resources(), out);
    return out.join("");
  });
}

/** Letters only, case- and form-folded: compatibility forms (Arabic presentation forms, ligatures) decomposed. */
export function letters(s) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Whether a page's text contains `needle` (letters and digits only, case-insensitive). Latin runs read in order;
 * Arabic runs come out in visual order (and a ligature such as lam-alef keeps its own logical order inside the
 * reversed run), so a needle with Arabic letters matches when some stretch of the page holds exactly the needle's
 * letters, in any order.
 */
export function contains(pageText, needle) {
  const hay = [...letters(pageText)];
  const want = [...letters(needle)];
  if (!want.length) return false;
  if (hay.join("").includes(want.join(""))) return true;
  if (!want.some((c) => /[\u0600-\u06FF]/.test(c))) return false;
  const len = want.length;
  if (hay.length < len) return false;
  // Sliding window over letter counts: `off` is how many letters the window has too many or too few of.
  const need = new Map();
  for (const c of want) need.set(c, (need.get(c) ?? 0) + 1);
  const have = new Map();
  let off = len;
  const add = (c, d) => {
    const n = need.get(c) ?? 0;
    const before = Math.abs((have.get(c) ?? 0) - n);
    have.set(c, (have.get(c) ?? 0) + d);
    off += Math.abs((have.get(c) ?? 0) - n) - before;
  };
  for (let i = 0; i < hay.length; i++) {
    add(hay[i], 1);
    if (i >= len) add(hay[i - len], -1);
    if (i >= len - 1 && off === 0) return true;
  }
  return false;
}

/**
 * Page-break problems of the CV's sidebar (scripts/postbuild/cv-pdf.mjs): a section heading that is not on the same
 * page as its first entry, or a section the sheet keeps whole (`keep`) split across pages. `sections` comes from the
 * page as printed: { heading, first, all, keep } (innerText of the heading, the first entry and the whole section).
 */
export function sectionBreakProblems(pages, sections) {
  const problems = [];
  const onOnePage = (text) => pages.some((p) => contains(p, text));
  for (const s of sections) {
    if (!onOnePage(`${s.heading} ${s.first}`)) problems.push(`"${s.heading}" is not on the same page as its first entry`);
    if (s.keep && !onOnePage(s.all)) problems.push(`"${s.heading}" is split across pages`);
  }
  return problems;
}
