import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { readdirSync } from "node:fs";
import { askQuestion, datedByRole, decisionOf, edgesOf, eyebrowParts, nodesByKind, periodInfo, screenGroups, sharesRolePeriod, sourcesText, stackGroups, tocOf } from "~/lib/case";

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

  it("lists the screens section in the TOC only where a case study has screens, after the approach", () => {
    for (const cs of profile.caseStudies.filter((c) => c.depth === "full")) {
      const ids = tocOf(cs, "en").map((t) => t.id);
      expect(ids.includes("screens"), cs.slug).toBe(!!cs.screens?.length);
      if (cs.screens?.length) expect(ids.indexOf("screens")).toBe(ids.indexOf("approach") + 1);
    }
  });
});

describe("screens gallery", () => {
  const sta = profile.caseStudies.find((c) => c.slug === "sta-tourism-assistants")!;

  it("has screens only where the client approved publishing them (the named STA case study), each file present", () => {
    for (const cs of profile.caseStudies) expect(!!cs.screens?.length, cs.slug).toBe(cs.slug === "sta-tourism-assistants");
    const files = readdirSync(new URL("../../src/assets/screens/sta-tourism-assistants/", import.meta.url));
    expect(sta.screens!.length).toBeGreaterThanOrEqual(4);
    expect(sta.screens!.length).toBeLessThanOrEqual(6);
    for (const s of sta.screens!) {
      expect(files, s.file).toContain(s.file);
      for (const locale of ["en", "ar"] as const) {
        expect(s.alt[locale].length, s.file).toBeGreaterThan(5);
        expect(s.caption[locale].length, s.file).toBeGreaterThan(20);
      }
      // 1x captures are the phone screen and the dialog; the desktop screens are 2x.
      expect(s.density, s.file).toBe(s.frame === "desktop" ? 2 : 1);
    }
  });

  it("groups screens by product, a lead across the grid only with three or more desktop screens, phone and dialog beside", () => {
    const groups = screenGroups(sta);
    expect(groups.map((g) => g.product.en)).toEqual(["Noura, for visitors", "The staff assistant"]);
    const [noura, staff] = groups;
    expect(noura!.slots.map((s) => s.place)).toEqual(["lead", "main", "main", "side"]);
    expect(noura!.slots[3]!.rows).toBe(2);
    expect(staff!.slots.map((s) => s.place)).toEqual(["main", "side"]);
    expect(staff!.slots[1]!.rows).toBe(1);
    expect(groups.flatMap((g) => g.slots.map((s) => s.screen))).toEqual(sta.screens);
    expect(screenGroups(profile.caseStudies.find((c) => c.slug === "arabsstock-assistant")!)).toEqual([]);
  });

  it("keeps the STA case study at the approved, light level", () => {
    const text = JSON.stringify(sta);
    // One agent, never multi-agent; accepted in UAT, never "in production" or launched; he led the AI engineering.
    expect(text).not.toMatch(/multi-agent|multi agent|متعدد(ة)? الوكلاء/i);
    expect(text).not.toMatch(/in production|launched|بيئة الإنتاج/i);
    expect(text).not.toMatch(/led the project/i);
    expect(sta.contribution.en).toMatch(/^Led the AI engineering/);
    // The only figure: 96 tools, 27 visible to visitors, behind one agent.
    expect(sta.figures.map((f) => f.value.en)).toEqual(["1", "96", "27"]);
    const numbers = new Set(text.match(/\b\d+\b/g)!.filter((n) => !/^(19|20)\d\d$/.test(n)));
    for (const n of numbers) expect(["1", "2", "96", "27", "01", "02", "04", "06", "08", "10", "10x"]).toContain(n);
    // No provider or infrastructure names.
    expect(text).not.toMatch(/Azure|OpenAI|pgvector|Kubernetes|Langfuse|Entra|Qdrant|Helm/i);
    expect(sta.client?.name.en).toBe("Saudi Tourism Authority");
    expect(sta.roleId).toBe("globant");
    expect(profile.experience.find((r) => r.id === "globant")!.caseStudies).toContain("sta-tourism-assistants");
  });
});
