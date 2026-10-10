import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { askQuestion, datedByRole, decisionOf, edgesOf, eyebrowParts, nodesByKind, periodInfo, sharesRolePeriod, sourcesText, stackGroups, tocOf } from "~/lib/case";

describe("case-study helpers", () => {
  for (const cs of profile.caseStudies) {
    it(`${cs.slug}: renders every component and connection, in both languages`, () => {
      expect(nodesByKind(cs).flatMap((g) => g.nodes)).toHaveLength(cs.architecture.nodes.length);
      for (const locale of ["en", "ar"] as const) {
        expect(edgesOf(cs, locale)).toHaveLength(cs.architecture.edges.length);
        expect(sourcesText(cs.source, locale).length).toBeGreaterThan(0);
        expect(askQuestion(cs, locale)).toContain(cs.shortTitle[locale]);
        const eb = eyebrowParts(cs, locale);
        expect(eb.company).toBeTruthy();
        expect(periodInfo(cs, locale).main).toBeTruthy();
      }
      expect(stackGroups(cs).flatMap((g) => g.items).sort()).toEqual([...cs.stack].sort());
    });
  }

  it("lists every full case study's sections in the TOC, with unique anchors", () => {
    for (const cs of profile.caseStudies.filter((c) => c.depth === "full")) {
      const toc = tocOf(cs, "en");
      expect(toc.length).toBeGreaterThanOrEqual(4);
      expect(new Set(toc.map((t) => JSON.stringify(t))).size).toBe(toc.length);
    }
  });

  it("only quotes decisions the sources state (a verbatim approach fact)", () => {
    for (const cs of profile.caseStudies) {
      const d = decisionOf(cs);
      if (d) expect(cs.approach[d.index]).toBe(d.fact);
    }
  });

  it("dates work that shares a role's period as 'during the role', not as the project's own dates", () => {
    for (const slug of ["gov-bilingual-assistant", "aip-semantic-search", "wakeb-bilingual-chatbot"] as const) {
      const cs = profile.caseStudies.find((c) => c.slug === slug)!;
      expect(periodInfo(cs, "en").isRolePeriod, slug).toBe(true);
      expect(sharesRolePeriod(cs), slug).toBe(true);
    }
    // A role with one case study: that case study is the role's work, dated by it.
    const arabsstock = profile.caseStudies.find((c) => c.slug === "arabsstock-assistant")!;
    expect(sharesRolePeriod(arabsstock)).toBe(false);
    expect(datedByRole(arabsstock)).toBe(true);
    expect(datedByRole(profile.caseStudies.find((c) => c.slug === "logic-controls-website")!)).toBe(false);
  });
});
