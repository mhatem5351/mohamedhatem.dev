import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { contains, letters, parseToUnicode, pdfPagesText, sectionBreakProblems } from "../../scripts/lib/pdf-text.mjs";

const CMAP = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
3 beginbfchar <0001> <0045> <0002> <0064> <0003> <0020> endbfchar
2 beginbfrange <0010> <0012> <0061> <0020> <0021> [<0644> <0627>] endbfrange
endcmap end end`;

/** A one-page PDF drawn the way Chromium writes text: a Type 0 font, Identity-H codes, a ToUnicode map. */
async function pdf(content: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const toUnicode = doc.context.register(doc.context.flateStream(CMAP));
  const font = doc.context.register(doc.context.obj({ Type: "Font", Subtype: "Type0", BaseFont: "Test", Encoding: "Identity-H", ToUnicode: toUnicode }));
  page.node.setFontDictionary(PDFName.of("F1"), font);
  page.node.addContentStream(doc.context.register(doc.context.flateStream(content)));
  return doc.save();
}

describe("pdf-text", () => {
  it("reads a ToUnicode CMap: single codes, ranges and range arrays", () => {
    const { map, bytes } = parseToUnicode(CMAP);
    expect(bytes).toBe(2);
    expect(map.get(1)).toBe("E");
    expect(map.get(0x11)).toBe("b");
    expect(map.get(0x20)).toBe("ل");
    expect(map.get(0x21)).toBe("ا");
  });

  it("extracts each page's text from Tj and TJ in drawing order", async () => {
    const pages = await pdfPagesText(await pdf("BT /F1 12 Tf 1 0 0 1 10 100 Tm <0001> Tj 5 0 Td <0002> Tj <0003> Tj [<0010> -200 <00110012>] TJ ET"));
    expect(pages).toEqual(["Ed abc\n"]);
  });

  it("matches Latin text in order, ignoring case, spaces and punctuation", () => {
    expect(contains("EDUCATION\nM.Sc. in Data Science", "Education M.Sc. in Data Science")).toBe(true);
    expect(contains("Umm Al-\nQura University", "Umm Al-Qura University")).toBe(true);
    expect(contains("Skills LangGraph", "Education")).toBe(false);
  });

  it("matches Arabic text drawn in visual order (reversed letters)", () => {
    // "التعليم" drawn right to left comes out as "ميلعتلا"; the lam-alef ligature keeps its logical "لا".
    expect(contains("ميلعتلا\nتانايبلا", "التعليم البيانات")).toBe(true);
    expect(contains("ميلعتلا", "المهارات")).toBe(false);
    expect(letters("ﻻ")).toBe("لا");
  });

  it("reports a sidebar heading left without its entries and a kept section split across pages", () => {
    const sections = [
      { heading: "SKILLS", first: "LLMs & agents", all: "SKILLS LLMs & agents Retrieval", keep: false },
      { heading: "EDUCATION", first: "M.Sc. in Data Science", all: "EDUCATION M.Sc. in Data Science B.Eng. in Structural Engineering", keep: true },
    ];
    expect(sectionBreakProblems(["SKILLS LLMs & agents Retrieval EDUCATION M.Sc. in Data Science", "B.Eng. in Structural Engineering"], sections)).toEqual([
      '"EDUCATION" is split across pages',
    ]);
    expect(sectionBreakProblems(["SKILLS LLMs & agents EDUCATION", "M.Sc. in Data Science B.Eng. in Structural Engineering"], sections)).toEqual([
      '"EDUCATION" is not on the same page as its first entry',
      '"EDUCATION" is split across pages',
    ]);
    expect(sectionBreakProblems(["EDUCATION M.Sc. in Data Science B.Eng. in Structural Engineering SKILLS LLMs & agents Retrieval"], sections)).toEqual([]);
  });
});
