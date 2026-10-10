import { describe, expect, it } from "vitest";
import { CASE_DIAGRAMS, DIAGRAMS, diagramSvg } from "~/lib/diagrams";
import { profile } from "@content/profile.ts";

describe("diagrams", () => {
  it("maps case studies only to diagrams that exist", () => {
    const ids = new Set(DIAGRAMS.map((d) => d.id));
    for (const [slug, list] of Object.entries(CASE_DIAGRAMS)) {
      expect(profile.caseStudies.some((c) => c.slug === slug)).toBe(true);
      for (const id of list!) expect(ids.has(id)).toBe(true);
    }
  });

  it("inlines SVGs without <style> blocks or style attributes (hash-only CSP)", () => {
    for (const d of DIAGRAMS)
      for (const v of ["wide", "compact", "thumb"] as const) {
        const svg = diagramSvg(d.id, v);
        expect(svg).not.toMatch(/<style/);
        expect(svg).not.toMatch(/\sstyle="/);
        expect(svg).toMatch(/role="img"/);
      }
  });

  it("makes thumbnails decorative and keeps internal references unique", () => {
    const svg = diagramSvg("arabsstock-assistant", "thumb", { decorative: true, idSuffix: "card" });
    expect(svg).toMatch(/aria-hidden="true"/);
    expect(svg).not.toMatch(/<title|<desc|role="img"/);
    for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(svg).toContain(`id="${ref}"`);
  });

  it("translates the accessible title and description on Arabic pages", () => {
    const d = DIAGRAMS.find((x) => x.id === "wakeb-multi-agent-chatbot")!;
    const svg = diagramSvg(d.id, "wide", { locale: "ar" });
    expect(svg).toContain(`lang="ar"`);
    expect(svg).toContain(d.title.ar.replace(/&/g, "&amp;"));
  });
});
