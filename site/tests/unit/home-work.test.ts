import { describe, expect, it } from "vitest";
import { caseStudies } from "~/lib/site";
import { workLayout } from "~/lib/home-work";

describe("home: selected work layout (audit VUX-03)", () => {
  const layout = workLayout();
  it("the 14-agent assistant is the feature card, then three equal cards (no wide flagship card)", () => {
    expect(layout.feature?.slug).toBe("arabsstock-assistant");
    expect(layout.grid.map((c) => c.slug)).toEqual(["wakeb-bilingual-chatbot", "empoweromics-ml", "logic-controls-website"]);
    expect(layout.wide).toBeUndefined();
  });
  it("brief case studies (details not public) sit in More work, never at flagship weight", () => {
    const brief = caseStudies.filter((c) => c.depth === "brief").map((c) => c.slug);
    expect(brief.length).toBeGreaterThan(0);
    expect(layout.more.map((c) => c.slug).sort()).toEqual([...brief].sort());
    for (const c of [layout.feature!, ...layout.grid]) expect(c.depth).toBe("full");
  });
  it("featured case studies come first in display order", () => {
    const order = caseStudies.map((c) => c.featured);
    expect(order.indexOf(false)).toBe(order.filter(Boolean).length);
  });
});
