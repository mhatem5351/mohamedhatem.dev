/**
 * The Arabic text layer of Chromium's PDFs, rewritten so every PDF reader extracts and searches it the same way
 * (scripts/postbuild/cv-pdf.mjs).
 *
 * Chromium (Skia) draws a right-to-left run in visual order, inside `/ReversedChars BMC … EMC` (or, for a run of one
 * glyph, with no marker at all), and maps each glyph to text through the font's ToUnicode CMap. IBM Plex Sans Arabic
 * joins many letter pairs into one glyph (ب+ر, ص+ر, ف+ي and every lam-alef, all in its required `rlig` feature, so CSS
 * can't turn them off without breaking lam-alef), and Skia maps such a glyph to both letters, in logical order ("صر").
 * A letter with a mark (shadda, tanween, damma) is two glyphs that Skia wraps in `/ActualText`. Readers disagree on
 * both inside a right-to-left run:
 *   - Chrome's and Edge's viewer (pdfium), Firefox's (pdf.js) and MuPDF reverse the run character by character, so a
 *     two-letter glyph comes out backwards: مصر → مرص, الاصطناعي → االصطناعي, سبتمبر → سبتمرب, في → يف (search fails);
 *   - Apple's PDFKit (Preview, Safari, Quick Look) reverses glyph by glyph and reads them right, so storing the pairs
 *     reversed would only move the problem; ActualText doesn't settle it either (pdf.js and PDFKit ignore it, pdfium
 *     applies it to some runs only, MuPDF reverses it again).
 * The form every reader agrees on is one character per glyph, in drawing order from left to right. So in every
 * right-to-left run this rewrites each glyph that stands for several characters, and each ActualText cluster:
 *   - a ligature: the glyph under a new code (same outline, same width) standing for its first letter, preceded by an
 *     invisible copy (text render mode 3, zero width, same origin) for each further letter;
 *   - a letter with its marks: the glyphs redrawn from left to right at their own positions, each standing for one
 *     character, so the run never steps backwards (pdfium breaks a word where it does);
 * and marks a one-glyph run as `/ReversedChars`. Nothing moves on the page: the new codes reuse the glyphs' outlines
 * and widths, every glyph is drawn at its original position, and the extra copies are never painted.
 *
 * `normalizeRtlRuns(buf)` rewrites the PDF; `rtlRunsText(buf)` reads its right-to-left runs back character-reversed
 * (as pdfium, pdf.js and MuPDF do) and lists what would still read differently from one reader to another.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";
import { parseToUnicode } from "./pdf-text.mjs";

const bytesOf = (s) => (s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : typeof s?.getContents === "function" ? s.getContents() : new Uint8Array());
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, "0");
const utf16 = (s) =>
  [...s]
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c <= 0xffff) return hex4(c);
      const v = c - 0x10000;
      return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 1023));
    })
    .join("");
/** Characters as code points (a surrogate pair stays one). */
const chars = (s) => [...(s ?? "")];
/** Arabic script only (letters, marks, Arabic punctuation and the presentation forms). */
const isArabic = (s) => !!s && /^[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+$/.test(s);
const num = (v) => String(Math.round(v * 1e5) / 1e5);
/** Width of the invisible copies, in thousandths of the font size. */
const COPY_WIDTH = 1;

/** Content-stream tokens with their byte offsets (enough for Chromium's output: no inline images). */
function* tokens(src) {
  let i = 0;
  const n = src.length;
  const ws = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const delim = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
  while (i < n) {
    const c = src[i];
    if (ws(c)) {
      i++;
      continue;
    }
    if (c === 37) {
      while (i < n && src[i] !== 10 && src[i] !== 13) i++;
      continue;
    }
    const start = i;
    if (c === 40) {
      const out = [];
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = src[i++];
        if (ch === 92) {
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
        } else if (ch === 40) {
          depth++;
          out.push(ch);
        } else if (ch === 41) {
          if (--depth > 0) out.push(ch);
        } else out.push(ch);
      }
      yield { t: "str", v: out, start, end: i };
    } else if (c === 60 && src[i + 1] === 60) {
      i += 2;
      yield { t: "punct", v: "<<", start, end: i };
    } else if (c === 62 && src[i + 1] === 62) {
      i += 2;
      yield { t: "punct", v: ">>", start, end: i };
    } else if (c === 60) {
      i++;
      let h = "";
      while (i < n && src[i] !== 62) {
        const ch = String.fromCharCode(src[i++]);
        if (/[0-9A-Fa-f]/.test(ch)) h += ch;
      }
      i++;
      if (h.length % 2) h += "0";
      const out = [];
      for (let k = 0; k < h.length; k += 2) out.push(parseInt(h.slice(k, k + 2), 16));
      yield { t: "str", v: out, start, end: i };
    } else if (c === 91 || c === 93 || c === 123 || c === 125) {
      i++;
      yield { t: "punct", v: String.fromCharCode(c), start, end: i };
    } else if (c === 47) {
      i++;
      let s = "";
      while (i < n && !ws(src[i]) && !delim(src[i])) s += String.fromCharCode(src[i++]);
      yield { t: "name", v: s, start, end: i };
    } else {
      let s = "";
      while (i < n && !ws(src[i]) && !delim(src[i])) s += String.fromCharCode(src[i++]);
      if (!s) {
        i++;
        continue;
      }
      if (s === "BI") throw new Error("pdf-rtl-text: inline images are not supported");
      yield /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? { t: "num", v: Number(s), start, end: i } : { t: "op", v: s, start, end: i };
    }
  }
}

/** The text of an ActualText string (UTF-16BE with a byte-order mark, else PDFDocEncoding read as Latin-1). */
function textString(b) {
  if (b[0] === 0xfe && b[1] === 0xff) {
    let s = "";
    for (let k = 2; k + 1 < b.length; k += 2) s += String.fromCharCode(b[k] * 256 + b[k + 1]);
    return s;
  }
  return String.fromCharCode(...b);
}

/** Number of glyphs in a TrueType font program (its maxp table), or 0. */
function numGlyphs(bytes) {
  if (bytes.length < 12) return 0;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let t = 0; t < dv.getUint16(4); t++) {
    const rec = 12 + t * 16;
    if (rec + 16 > bytes.length) return 0;
    if (String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]) === "maxp") return dv.getUint16(dv.getUint32(rec + 8) + 4);
  }
  return 0;
}

/**
 * Every right-to-left run of the PDF's content (pages and the form XObjects they draw), per stream:
 *   run   { implicit, wrap?, units, ok }  implicit: a one-glyph or one-cluster run that Skia left unmarked
 *   unit  { glyphs, text, cluster? }       one glyph and its ToUnicode text, or an ActualText cluster
 *   glyph { font, code, tj, index, pos, tm, td }
 *         pos: its origin in text space since the last Tm (the `tm`-th); td: the Td right before it ({ start, end, v })
 */
function readRuns(doc) {
  const ctx = doc.context;
  const look = (o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const fonts = new Map();
  const fontOf = (ref) => {
    const key = ref instanceof PDFRef ? ref.toString() : ref;
    if (!fonts.has(key)) {
      const dict = look(ref);
      const tu = dict instanceof PDFDict ? look(dict.get(PDFName.of("ToUnicode"))) : null;
      fonts.set(key, { key, dict, cmap: tu ? parseToUnicode(Buffer.from(bytesOf(tu)).toString("latin1")) : null });
    }
    return fonts.get(key);
  };
  const streams = [];
  const visit = (ref, bytes, resources, depth) => {
    const fontRes = look(resources?.get(PDFName.of("Font")));
    const xobjects = look(resources?.get(PDFName.of("XObject")));
    const stream = { ref, bytes, runs: [], usesTr: false };
    streams.push(stream);
    let font = null;
    let ops = [];
    let prev = null; // the previous operator: { v, start (of its first operand), end, args }
    let tlm = null; // the line matrix's origin since the last Tm, in text space
    let tm = 0;
    const mc = [];
    const openRun = () => [...mc].reverse().find((m) => m.kind === "run");
    const glyphsOf = (str, tj) => {
      const out = [];
      if (!font?.cmap) return out;
      const w = font.cmap.bytes;
      for (let k = 0; k + w <= str.v.length; k += w) {
        let code = 0;
        for (let b = 0; b < w; b++) code = code * 256 + str.v[k + b];
        const first = k === 0;
        const td = first && prev?.v === "Td" && prev.args.length === 2 ? { start: prev.start, end: prev.end, v: prev.args } : null;
        out.push({ font, code, tj, index: k / w, pos: first && tlm ? [...tlm] : null, tm, td });
      }
      return out;
    };
    for (const tok of tokens(bytes)) {
      if (tok.t !== "op") {
        ops.push(tok);
        continue;
      }
      const last = ops.at(-1);
      const run = openRun();
      switch (tok.v) {
        case "BT":
          tlm = null;
          break;
        case "Tm":
          tlm = [0, 0];
          tm++;
          break;
        case "Td":
        case "TD":
          tlm = tlm && ops.length >= 2 && ops.at(-2).t === "num" && last.t === "num" ? [tlm[0] + ops.at(-2).v, tlm[1] + last.v] : null;
          break;
        case "T*":
          tlm = null;
          break;
        case "Tr":
          stream.usesTr = true;
          break;
        case "Tf": {
          const nm = ops.at(-2);
          font = nm?.t === "name" && fontRes instanceof PDFDict ? fontOf(fontRes.get(PDFName.of(nm.v))) : null;
          break;
        }
        case "BMC":
          mc.push(last?.t === "name" && last.v === "ReversedChars" ? { kind: "run", implicit: false, units: [], ok: true } : { kind: "other" });
          break;
        case "BDC": {
          const i = ops.findIndex((o) => o.t === "name" && o.v === "ActualText");
          if (i >= 0 && ops[i + 1]?.t === "str") mc.push({ kind: "at", text: textString(ops[i + 1].v), bdc: [ops[0].start, tok.end], glyphs: [], parent: run ?? null });
          else mc.push({ kind: "other" });
          break;
        }
        case "EMC": {
          const top = mc.pop();
          if (top?.kind === "at") {
            const unit = { glyphs: top.glyphs, text: top.text, cluster: { bdc: top.bdc, emc: [tok.start, tok.end] } };
            // a cluster directly inside a run, or (Skia's one-cluster runs) an Arabic cluster on its own
            if (top.parent && mc.at(-1) === top.parent) top.parent.units.push(unit);
            else if (top.parent) top.parent.ok = false;
            else if (isArabic(top.text) && top.glyphs.length) stream.runs.push({ implicit: true, units: [unit], ok: true });
          } else if (top?.kind === "run") stream.runs.push(top);
          break;
        }
        case "Tj": {
          if (last?.t !== "str") break;
          const tj = { start: last.start, end: tok.end };
          const gs = glyphsOf(last, tj);
          tj.codes = gs;
          const at = mc.at(-1)?.kind === "at" ? mc.at(-1) : null;
          if (at) at.glyphs.push(...gs);
          else if (run) {
            for (const g of gs) run.units.push({ glyphs: [g], text: g.font.cmap?.map.get(g.code) });
            if (!font?.cmap) run.ok = false;
          } else if (gs.length && gs.every((g) => isArabic(g.font.cmap?.map.get(g.code))) && gs.some((g) => chars(g.font.cmap.map.get(g.code)).length > 1)) {
            // a one-glyph run (Skia marks a run reversed only when it has two clusters or more)
            stream.runs.push({ implicit: true, wrap: tj, units: gs.map((g) => ({ glyphs: [g], text: g.font.cmap.map.get(g.code) })), ok: true });
          }
          break;
        }
        case "TJ": {
          // Chromium shows text with Tj only; a run with a TJ (such as the invisible copies this file adds) is read but
          // never rewritten.
          const open = ops.map((o) => o.v).lastIndexOf("[");
          const gs = ops.slice(open + 1).filter((o) => o.t === "str").flatMap((o) => glyphsOf(o, null));
          const at = mc.at(-1)?.kind === "at" ? mc.at(-1) : null;
          if (at) at.glyphs.push(...gs);
          else if (run) for (const g of gs) run.units.push({ glyphs: [g], text: g.font.cmap?.map.get(g.code) });
          if (run) run.tj = true;
          break;
        }
        case "'":
        case '"':
          if (run) run.ok = false;
          break;
        case "Do": {
          const xo = last?.t === "name" && xobjects instanceof PDFDict ? xobjects.get(PDFName.of(last.v)) : null;
          const x = look(xo);
          if (x instanceof PDFStream && depth < 8 && x.dict.get(PDFName.of("Subtype"))?.toString() === "/Form") {
            const res = look(x.dict.get(PDFName.of("Resources")));
            visit(xo, bytesOf(x), res instanceof PDFDict ? res : resources, depth + 1);
          }
          break;
        }
        default:
          break;
      }
      prev = { v: tok.v, start: ops[0]?.start ?? tok.start, end: tok.end, args: ops.map((o) => o.v) };
      ops = [];
    }
  };
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of("Contents"));
    const list = look(contents) instanceof PDFArray ? look(contents).asArray() : contents ? [contents] : [];
    for (const ref of list) visit(ref, bytesOf(look(ref)), page.node.Resources(), 0);
  }
  return { streams, look };
}

/**
 * The right-to-left runs as pdfium, pdf.js and MuPDF read them (each run's text character-reversed), and what would
 * still read differently from one reader to another: a glyph that stands for several characters (or none), an
 * ActualText cluster, an unmarked run.
 */
export async function rtlRunsText(buf) {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const runs = [];
  const problems = [];
  for (const stream of readRuns(doc).streams) {
    for (const run of stream.runs) {
      let text = "";
      for (const u of run.units) {
        if (u.cluster) problems.push(`ActualText "${u.text}" in a right-to-left run`);
        else if (chars(u.text).length !== 1) problems.push(`a glyph standing for ${u.text ? `"${u.text}"` : "nothing"} in a right-to-left run`);
        text += u.text ?? "";
      }
      if (run.implicit) problems.push(`an unmarked right-to-left run ("${chars(text).reverse().join("")}")`);
      runs.push(chars(text).reverse().join(""));
    }
  }
  return { runs, problems };
}

/**
 * Rewrites every right-to-left run so that each of its glyphs stands for exactly one character, left to right (see
 * the top of this file). Returns the new PDF and counts: { buf, runs, rewritten, recoded, copies, skipped }.
 */
export async function normalizeRtlRuns(buf) {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const ctx = doc.context;
  const { streams, look } = readRuns(doc);
  const stats = { runs: 0, rewritten: 0, recoded: 0, copies: 0, skipped: 0 };

  // Per font, the codes added: CID → GID (the same outline), width, text. New CIDs follow the font's last glyph.
  const fontStates = new Map();
  const stateOf = (font) => {
    if (fontStates.has(font.key)) return fontStates.get(font.key);
    let state = null;
    const desc = look(look(font.dict?.get(PDFName.of("DescendantFonts")))?.get?.(0));
    const fd = desc instanceof PDFDict ? look(desc.get(PDFName.of("FontDescriptor"))) : null;
    const file = fd instanceof PDFDict ? look(fd.get(PDFName.of("FontFile2"))) : null;
    const identity = font.dict?.get(PDFName.of("Encoding"))?.toString() === "/Identity-H" && look(desc?.get?.(PDFName.of("CIDToGIDMap")))?.toString() === "/Identity";
    const glyphs = file ? numGlyphs(bytesOf(file)) : 0;
    if (desc instanceof PDFDict && identity && glyphs > 0 && font.cmap?.bytes === 2) {
      const widths = new Map();
      const items = (look(desc.get(PDFName.of("W")))?.asArray?.() ?? []).map(look);
      for (let i = 0; i < items.length; ) {
        const a = items[i]?.asNumber?.();
        const b = items[i + 1];
        if (b instanceof PDFArray) {
          b.asArray().forEach((w, k) => widths.set(a + k, look(w).asNumber()));
          i += 2;
        } else {
          for (let c = a; c <= b?.asNumber?.(); c++) widths.set(c, items[i + 2]?.asNumber?.());
          i += 3;
        }
      }
      const dw = look(desc.get(PDFName.of("DW")))?.asNumber?.() ?? 1000;
      state = { font, desc, glyphs, next: Math.max(glyphs, ...font.cmap.map.keys()) + 1, width: (c) => widths.get(c) ?? dw, cids: new Map(), list: [] };
    }
    fontStates.set(font.key, state);
    return state;
  };
  /** A code drawing glyph `gid`, `width` wide, standing for `text`. */
  const cidFor = (state, gid, text, width) => {
    const key = `${gid}|${text}|${width}`;
    if (!state.cids.has(key)) {
      const cid = state.next++;
      if (cid > 0xffff) throw new Error("pdf-rtl-text: out of two-byte codes");
      state.cids.set(key, cid);
      state.list.push({ cid, gid, text, width });
    }
    return state.cids.get(key);
  };
  // Each copy advances COPY_WIDTH and the TJ takes it back: no net move, and no zero-width glyph (pdf.js starts a new
  // text item after one, which splits the word).
  const invisible = (cids) => `3 Tr [${cids.map((c) => `<${hex4(c)}> ${COPY_WIDTH}`).join(" ")}] TJ 0 Tr`;

  for (const stream of streams) {
    const edits = []; // { start, end, text }, never overlapping
    const tjPlans = new Map(); // a Tj → { before: glyph index → [invisible codes], replace: glyph index → code, wrap }
    const planOf = (tj) => {
      if (!tjPlans.has(tj)) tjPlans.set(tj, { before: new Map(), replace: new Map(), wrap: false });
      return tjPlans.get(tj);
    };
    for (const run of stream.runs) {
      stats.runs++;
      // What each unit needs; a run is rewritten whole or not at all.
      const work = [];
      let ok = run.ok && !run.tj;
      for (const u of run.units) {
        const text = chars(u.text);
        if (!u.cluster && text.length === 1) continue;
        const state = u.glyphs[0] ? stateOf(u.glyphs[0].font) : null;
        if (!state || !u.glyphs.length || text.length < u.glyphs.length || u.glyphs.some((g) => g.font !== u.glyphs[0].font || !g.tj)) ok = false;
        // a cluster of several glyphs is redrawn glyph by glyph: each in a Tj of its own, placed by a Td (or a Tm)
        else if (u.glyphs.length > 1 && u.glyphs.some((g, k) => !g.tj || g.tj.codes.length !== 1 || !g.pos || g.tm !== u.glyphs[0].tm || (k > 0 && !g.td))) ok = false;
        work.push({ u, text, state });
      }
      if (!ok) {
        stats.skipped++;
        continue;
      }
      if (!work.length) continue;
      stats.rewritten++;
      for (const { u, text, state } of work) {
        // Left to right: the invisible copies (the last letters), then the glyphs by their origins, each standing for
        // one of the remaining letters. Read backwards, that is the unit's text.
        const order = text.slice().reverse();
        const glyphs = u.glyphs;
        const extra = order.length - glyphs.length;
        const copies = order.slice(0, extra).map((ch) => cidFor(state, glyphs[0].code, ch, COPY_WIDTH));
        stats.copies += copies.length;
        const codes = glyphs.map((g, k) => {
          const ch = order[extra + k];
          if (g.font.cmap.map.get(g.code) === ch) return g.code;
          stats.recoded++;
          return cidFor(state, g.code, ch, state.width(g.code));
        });
        if (u.glyphs.length > 1) {
          // The cluster's Td/Tj pairs become the same glyphs drawn left to right, then a Td back to where the last one
          // left the line matrix (the next Td is relative to it).
          const first = u.glyphs[0];
          let cur = first.td ? [first.pos[0] - first.td.v[0], first.pos[1] - first.td.v[1]] : first.pos;
          const parts = [];
          const moveTo = (p) => {
            if (Math.abs(p[0] - cur[0]) > 1e-6 || Math.abs(p[1] - cur[1]) > 1e-6) parts.push(`${num(p[0] - cur[0])} ${num(p[1] - cur[1])} Td`);
            cur = p;
          };
          glyphs.forEach((g, k) => {
            moveTo(g.pos);
            if (k === 0 && copies.length) parts.push(invisible(copies));
            parts.push(`<${hex4(codes[k])}> Tj`);
          });
          moveTo(u.glyphs.at(-1).pos);
          edits.push({ start: first.td ? first.td.start : first.tj.start, end: first.tj.end, text: parts.join(" ") });
          for (const g of u.glyphs.slice(1)) edits.push({ start: g.td.start, end: g.tj.end, text: "" });
        } else {
          const g = glyphs[0];
          const plan = planOf(g.tj);
          if (copies.length) plan.before.set(g.index, [...(plan.before.get(g.index) ?? []), ...copies]);
          if (codes[0] !== g.code) plan.replace.set(g.index, codes[0]);
        }
        if (u.cluster) {
          // the cluster's ActualText goes; an unmarked one-cluster run becomes a marked one
          edits.push({ start: u.cluster.bdc[0], end: u.cluster.bdc[1], text: run.implicit ? "/ReversedChars BMC" : "" });
          if (!run.implicit) edits.push({ start: u.cluster.emc[0], end: u.cluster.emc[1], text: "" });
        }
      }
      if (run.implicit && run.wrap) planOf(run.wrap).wrap = true;
    }
    for (const [tj, { before, replace, wrap }] of tjPlans) {
      const parts = [];
      let cur = "";
      tj.codes.forEach((g, i) => {
        if (before.has(i)) {
          if (cur) parts.push(`<${cur}> Tj`);
          cur = "";
          parts.push(invisible(before.get(i)));
        }
        cur += hex4(replace.get(i) ?? g.code);
      });
      if (cur) parts.push(`<${cur}> Tj`);
      edits.push({ start: tj.start, end: tj.end, text: wrap ? `/ReversedChars BMC ${parts.join(" ")} EMC` : parts.join(" ") });
    }
    if (!edits.length) continue;
    // The copies switch to render mode 3 and back to 0: a stream that sets another mode is not supported.
    if (stream.usesTr) throw new Error("pdf-rtl-text: the content sets a text render mode");
    let s = Buffer.from(stream.bytes).toString("latin1");
    for (const e of edits.sort((a, b) => b.start - a.start)) s = s.slice(0, e.start) + e.text + s.slice(e.end);
    const old = look(stream.ref);
    const next = ctx.flateStream(Buffer.from(s, "latin1"));
    if (old instanceof PDFStream) for (const [k, v] of old.dict.entries()) if (!["/Length", "/Filter", "/DecodeParms"].includes(k.toString())) next.dict.set(k, v);
    ctx.assign(stream.ref, next);
  }

  // The fonts: CIDToGIDMap becomes a stream (identity, then the new codes); widths and ToUnicode entries for them.
  for (const state of fontStates.values()) {
    if (!state?.list.length) continue;
    const map = new Uint8Array(state.next * 2);
    for (let c = 0; c < state.glyphs; c++) {
      map[c * 2] = c >> 8;
      map[c * 2 + 1] = c & 255;
    }
    for (const { cid, gid } of state.list) {
      map[cid * 2] = gid >> 8;
      map[cid * 2 + 1] = gid & 255;
    }
    state.desc.set(PDFName.of("CIDToGIDMap"), ctx.register(ctx.flateStream(map)));
    let W = look(state.desc.get(PDFName.of("W")));
    if (!(W instanceof PDFArray)) state.desc.set(PDFName.of("W"), (W = ctx.obj([])));
    for (const { cid, width } of state.list) {
      W.push(PDFNumber.of(cid));
      W.push(ctx.obj([width]));
    }
    const tuRef = state.font.dict.get(PDFName.of("ToUnicode"));
    let cmap = Buffer.from(bytesOf(look(tuRef))).toString("latin1");
    const blocks = [];
    for (let i = 0; i < state.list.length; i += 100) {
      const part = state.list.slice(i, i + 100);
      blocks.push(`${part.length} beginbfchar\n${part.map(({ cid, text }) => `<${hex4(cid)}> <${utf16(text)}>`).join("\n")}\nendbfchar\n`);
    }
    const at = cmap.lastIndexOf("endcmap");
    if (at < 0) throw new Error("pdf-rtl-text: a ToUnicode CMap without endcmap");
    cmap = cmap.slice(0, at) + blocks.join("") + cmap.slice(at);
    if (tuRef instanceof PDFRef) ctx.assign(tuRef, ctx.flateStream(cmap));
    else state.font.dict.set(PDFName.of("ToUnicode"), ctx.register(ctx.flateStream(cmap)));
  }
  if (!stats.rewritten) return { buf, ...stats };
  return { buf: Buffer.from(await doc.save({ useObjectStreams: false })), ...stats };
}

/** Invisible format characters (ZWNJ, ZWJ, directional marks and isolates) that a PDF may or may not keep. */
const plain = (s) => s.replace(/[؜​-‏⁦-⁩]/g, "").replace(/\s+/g, " ");

/**
 * What the CV build checks in a PDF with right-to-left text (scripts/postbuild/cv-pdf.mjs): no run that readers would
 * read differently (see rtlRunsText), every run's text present in `source`, the page's own text (a run that reads
 * backwards is not), and every one of `words` that `source` contains found in some run. Returns the problems.
 * @param {Uint8Array} buf
 * @param {{ source: string, words?: string[] }} options
 * @returns {Promise<string[]>}
 */
export async function rtlTextProblems(buf, { source, words = [] }) {
  const { runs, problems } = await rtlRunsText(buf);
  const out = [...new Set(problems)].slice(0, 8);
  const page = plain(source);
  const texts = runs.map(plain).filter((r) => r.trim());
  const missing = [...new Set(texts.filter((r) => !page.includes(r)))];
  if (missing.length) out.push(`text that isn't on the page: ${missing.slice(0, 8).map((r) => `"${r}"`).join(", ")}`);
  for (const w of words) if (page.includes(w) && !texts.some((r) => r.includes(w))) out.push(`"${w}" can't be found in the text`);
  return out;
}
