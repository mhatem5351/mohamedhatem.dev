import { describe, expect, it } from "vitest";
import { caseStudies } from "~/lib/site";
import { workLayout } from "~/lib/home-work";

describe("home: selected work layout (audit VUX-03)", () => {
  const layout = workLayout();
  it("the Saudi Tourism Authority assistants are the feature card, then the 14-agent assistant leads three equal cards", () => {
    expect(layout.feature?.slug).toBe("sta-tourism-assistants");
    expect(layout.grid.map((c) => c.slug)).toEqual(["arabsstock-assistant", "wakeb-bilingual-chatbot", "empoweromics-ml"]);
    // Four featured cards fill the feature row and one grid row: no wide card (round 6, HM-14).
    expect(layout.wide).toBeUndefined();
  });
  it("brief case studies (details not public) and the freelance logic-controls.com site sit in More work, never at flagship weight", () => {
    const brief = caseStudies.filter((c) => c.depth === "brief").map((c) => c.slug);
    expect(brief.length).toBeGreaterThan(0);
    // The AI briefs first, the front-end site last (round 6, HM-14: an AI Team Lead's grid shows AI work).
    expect(layout.more.map((c) => c.slug)).toEqual([...brief, "logic-controls-website"]);
    for (const c of [layout.feature!, ...layout.grid]) expect(c.depth).toBe("full");
    for (const c of [layout.feature!, ...layout.grid]) expect(c.roleId, c.slug).not.toBeNull();
  });
  it("featured case studies come first in display order", () => {
    const order = caseStudies.map((c) => c.featured);
    expect(order.indexOf(false)).toBe(order.filter(Boolean).length);
  });
});
