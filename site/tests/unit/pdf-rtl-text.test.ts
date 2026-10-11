import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { normalizeRtlRuns, rtlRunsText, rtlTextProblems } from "../../scripts/lib/pdf-rtl-text.mjs";

// The font as Chromium writes it: codes 1-5 are glyphs 1-5; 2 is the ص+ر ligature, 3 the ف+ي one; 4 a shadda, 5 a meem.
const CMAP = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
5 beginbfchar <0001> <0645> <0002> <06350631> <0003> <0641064A> <0004> <0651> <0005> <0645> endbfchar
endcmap end end`;

/** A TrueType font program with only what the rewrite reads: its maxp table (8 glyphs). */
function fontProgram(): Uint8Array {
  const b = new Uint8Array(12 + 16 + 6);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, 1);
  b.set([..."maxp"].map((c) => c.charCodeAt(0)), 12);
  dv.setUint32(12 + 8, 28);
  dv.setUint32(12 + 12, 6);
  dv.setUint32(28, 0x00005000);
  dv.setUint16(32, 8);
  return b;
}

/** A one-page PDF drawn the way Chromium writes Arabic: a Type 0 font (Identity-H, CIDToGIDMap /Identity), visual order. */
async function pdf(content: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const page = doc.addPage([300, 200]);
  const file = ctx.register(ctx.flateStream(fontProgram()));
  const descriptor = ctx.register(ctx.obj({ Type: "FontDescriptor", FontName: "Test", Flags: 4, FontBBox: [0, -200, 1000, 800], ItalicAngle: 0, Ascent: 800, Descent: -200, CapHeight: 700, StemV: 80, FontFile2: file }));
  const cid = ctx.register(
    ctx.obj({ Type: "Font", Subtype: "CIDFontType2", BaseFont: "Test", CIDSystemInfo: { Registry: ctx.obj("Adobe"), Ordering: ctx.obj("Identity"), Supplement: 0 }, FontDescriptor: descriptor, CIDToGIDMap: "Identity", W: [1, [500, 900, 700, 0, 500]] }),
  );
  const toUnicode = ctx.register(ctx.flateStream(CMAP));
  const font = ctx.register(ctx.obj({ Type: "Font", Subtype: "Type0", BaseFont: "Test", Encoding: "Identity-H", DescendantFonts: [cid], ToUnicode: toUnicode }));
  page.node.setFontDictionary(PDFName.of("F1"), font);
  page.node.addContentStream(ctx.register(ctx.flateStream(content)));
  return doc.save();
}

// "مصر": the ligature (ص+ر) on the left, then the meem; "في": one glyph, which Chromium leaves unmarked; "مّ": a cluster.
const MISR = "BT /F1 12 Tf 1 0 0 -1 10 100 Tm /ReversedChars BMC <0002> Tj 10.8 0 Td <0001> Tj EMC ET";
const FI = "BT /F1 12 Tf 1 0 0 -1 40 100 Tm <0003> Tj ET";
const SHADDA = "BT /ReversedChars BMC /F1 12 Tf 1 0 0 -1 60 100 Tm /Span<</ActualText <FEFF06450651> >> BDC 2 1 Td <0004> Tj -1 -1 Td <0005> Tj EMC 6 0 Td <0001> Tj EMC ET";

describe("pdf-rtl-text", () => {
  it("reads right-to-left runs character-reversed, as Chrome's and Firefox's readers do, and says why they garble", async () => {
    const { runs, problems } = await rtlRunsText(await pdf(`${MISR} ${FI}`));
    expect(runs).toEqual(["مرص", "يف"]);
    expect(problems).toEqual(['a glyph standing for "صر" in a right-to-left run', 'a glyph standing for "في" in a right-to-left run', 'an unmarked right-to-left run ("يف")']);
  });

  it("rewrites ligatures and clusters so each glyph stands for one character, and the runs read in order", async () => {
    const before = await pdf(`${MISR} ${FI} ${SHADDA}`);
    const out = await normalizeRtlRuns(before);
    expect(out.rewritten).toBe(3);
    expect(out.copies).toBe(2); // one invisible copy each for ر and ي
    const { runs, problems } = await rtlRunsText(out.buf);
    expect(problems).toEqual([]);
    expect(runs).toEqual(["مصر", "في", "ممّ"]);
  });

  it("keeps every glyph's outline, width and position", async () => {
    const out = await normalizeRtlRuns(await pdf(`${MISR} ${SHADDA}`));
    const doc = await PDFDocument.load(out.buf);
    const ctx = doc.context;
    const contents = doc.getPage(0).node.Contents();
    const stream = (contents instanceof PDFArray ? ctx.lookup(contents.get(0)) : contents) as PDFRawStream;
    const content = new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
    // the copy (ر) is invisible and takes back its advance; the ligature (now ص) keeps its place, the meem its Td
    expect(content).toMatch(/\/ReversedChars BMC 3 Tr \[<0009> 1\] TJ 0 Tr <000A> Tj 10\.8 0 Td <0001> Tj EMC/);
    // the cluster loses its ActualText; its glyphs already stand for one character each, in reading order
    expect(content).not.toContain("ActualText");
    expect(content).toMatch(/2 1 Td <0004> Tj -1 -1 Td <0005> Tj\s+6 0 Td <0001> Tj/);
    const font = ctx.lookup(doc.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict).get(PDFName.of("F1"))) as PDFDict;
    const desc = ctx.lookup(font.lookup(PDFName.of("DescendantFonts"), PDFArray).get(0)) as PDFDict;
    const map = decodePDFRawStream(ctx.lookup(desc.get(PDFName.of("CIDToGIDMap"))) as PDFRawStream).decode();
    const gid = (c: number) => map[c * 2]! * 256 + map[c * 2 + 1]!;
    expect([gid(1), gid(2), gid(5), gid(9), gid(10)]).toEqual([1, 2, 5, 2, 2]);
    expect(desc.lookup(PDFName.of("W"), PDFArray).toString()).toContain("9 [ 1 ] 10 [ 900 ]");
  });

  it("checks a build: nothing readers disagree on, every run on the page, the search words found", async () => {
    const source = "القاهرة، مصر · في";
    const before = await pdf(`${MISR} ${FI}`);
    const problems = await rtlTextProblems(before, { source, words: ["مصر", "سبتمبر"] });
    expect(problems).toContain(`text that isn't on the page: "مرص", "يف"`);
    expect(problems).toContain(`"مصر" can't be found in the text`);
    expect(problems.join()).not.toContain("سبتمبر"); // not on this page: not required
    expect(await rtlTextProblems((await normalizeRtlRuns(before)).buf, { source, words: ["مصر", "سبتمبر"] })).toEqual([]);
  });

  it("leaves a PDF without right-to-left runs as it is", async () => {
    const latin = await pdf("BT /F1 12 Tf 1 0 0 -1 10 100 Tm <0001> Tj ET");
    const out = await normalizeRtlRuns(latin);
    expect(out.rewritten).toBe(0);
    expect(out.buf).toBe(latin);
  });
});
