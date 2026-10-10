import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";

const tile = (key: string) => fileURLToPath(new URL(`../../src/assets/logos/tiles/${key}-160.webp`, import.meta.url));
const NAMED_CLIENT = /GADD|Ministry of Defen[cs]e|وزارة الدفاع/;

describe("CV data (content/profile.ts)", () => {
  it("has no Selected projects list", () => {
    expect(Object.keys(profile.cv)).not.toContain("projects");
  });

  it("has a logo tile for every role and every degree (the CV sheet shows one beside each)", () => {
    for (const r of profile.experience) expect(existsSync(tile(r.logo.file ?? r.id)), r.id).toBe(true);
    for (const e of profile.education) expect(e.logo.file && existsSync(tile(e.logo.file)), e.id).toBe(true);
  });

  it("names a client only at the Wakeb Data role level, never on a bullet or a case study", () => {
    expect(profile.experience.filter((r) => r.client).map((r) => r.id)).toEqual(["wakeb"]);
    const wakeb = profile.experience.find((r) => r.id === "wakeb")!;
    expect(wakeb.client).toEqual({
      name: { en: "Saudi Ministry of Defense (GADD)", ar: "وزارة الدفاع السعودية (GADD)" },
      source: ["mohamed"],
    });
    const texts = [
      ...profile.experience.flatMap((r) => [r.summary, ...r.bullets.map((b) => b.text), ...r.cvBullets.map((b) => b.text)]),
      ...profile.caseStudies.flatMap((c) => [c.title, c.summary, c.context, c.contribution, c.problem, ...c.approach.map((a) => a.text), ...c.outcome.map((o) => o.text)]),
    ];
    for (const x of texts) for (const loc of ["en", "ar"] as const) expect(x[loc], x.en.slice(0, 60)).not.toMatch(NAMED_CLIENT);
    // The government assistant keeps its unnamed client.
    expect(wakeb.cvBullets.some((b) => b.text.en.includes("a Saudi government client"))).toBe(true);
  });

  it("Open to on the CV: three roles led by the team-lead role, three arrangements; the site keeps basics.openTo", () => {
    expect(profile.cv.openTo.roles.map((r) => r.en)).toEqual(["AI/ML Team Lead", "Senior AI / LLM Engineer", "MLOps Engineer"]);
    expect(profile.cv.openTo.roles.map((r) => r.ar)).toEqual(["قائد فريق ذكاء اصطناعي / تعلّم آلة", "مهندس أول للذكاء الاصطناعي / LLM", "مهندس MLOps"]);
    expect(profile.cv.openTo.arrangements.map((a) => a.en)).toEqual(["Remote", "Relocation to the Gulf or Europe", "Hybrid in Cairo"]);
    expect(profile.cv.openTo.source).toEqual(["mohamed"]);
    expect(profile.basics.openTo.arrangements.map((a) => a.id)).toEqual(["remote", "relocate-gulf", "relocate-europe", "cairo-onsite"]);
  });

  it("the Globant role keeps the STA wording and adds only the approved facts", () => {
    const g = profile.experience.find((r) => r.id === "globant")!;
    expect(g.cvBullets[0].text.en.startsWith("Leading AI engineering on the Saudi Tourism Authority (STA) project")).toBe(true);
    const all = g.cvBullets.map((b) => `${b.text.en} ${b.text.ar}`).join(" ");
    expect(all).not.toMatch(/multi-agent|in production|launched|متعدد الوكلاء|بيئة الإنتاج/i);
    for (const n of ["96", "27", "2026"]) expect(all).toContain(n);
  });
});
