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
  });

  it("never puts the unnamed government assistant in the CV block of a role that names its client (round 6, HM-03)", () => {
    const GOV = /government client|government assistant|جهة حكومية|حكومي/i;
    for (const r of profile.experience.filter((x) => x.client))
      for (const b of r.cvBullets) for (const loc of ["en", "ar"] as const) expect(b.text[loc], `${r.id} ${loc}`).not.toMatch(GOV);
    // The site keeps the assistant as a brief case study, with its client unnamed and no client line.
    const gov = profile.caseStudies.find((c) => c.slug === "gov-bilingual-assistant")!;
    expect(gov.client).toBeUndefined();
    expect(gov.depth).toBe("brief");
  });

  it("Open to: one list everywhere (site, CV, llms.txt): two roles led by the team-lead role, three arrangements on the CV, and the notice period", () => {
    expect(profile.cv.openTo.roles.map((r) => r.en)).toEqual(["AI/ML Team Lead", "Senior AI / LLM Engineer"]);
    expect(profile.cv.openTo.roles.map((r) => r.ar)).toEqual(["قائد فريق ذكاء اصطناعي / تعلّم آلة", "مهندس ذكاء اصطناعي أول (LLM)"]);
    expect(profile.basics.openTo.roles).toEqual(profile.cv.openTo.roles);
    expect(profile.cv.openTo.arrangements.map((a) => a.en)).toEqual(["Remote", "Relocation to the Gulf or Europe", "Hybrid in Cairo"]);
    expect(profile.cv.openTo.source).toEqual(["mohamed"]);
    expect(profile.basics.openTo.arrangements.map((a) => a.id)).toEqual(["remote", "relocate-gulf", "relocate-europe", "cairo-onsite"]);
    expect(profile.basics.openTo.line.en).toBe(
      "Open to AI/ML Team Lead or Senior AI / LLM Engineer roles: remote, relocation to the Gulf or Europe, or hybrid in Cairo. Notice period: 2 weeks to 1 month.",
    );
    // Round 7: the notice period Mohamed confirmed, in both languages, and nothing about visas anywhere.
    expect(profile.basics.openTo.noticePeriod).toEqual({ en: "2 weeks to 1 month", ar: "من أسبوعين إلى شهر" });
    expect(profile.basics.openTo.line.ar).toContain("فترة الإشعار: من أسبوعين إلى شهر");
    expect(JSON.stringify(profile)).not.toMatch(/\bvisa (?:status|sponsor\w*)|work (?:visa|permit|authori[sz]ation)|تأشيرة عمل/i);
  });

  it("lists only the AWS certification on the CV, as a plain entry (round 6, HM-10, HM-23)", () => {
    expect(profile.certifications.filter((c) => c.onCv).map((c) => c.id)).toEqual(["aws-mls"]);
    expect(profile.certifications.filter((c) => c.featured)).toEqual([]);
    const aws = profile.certifications.find((c) => c.id === "aws-mls")!;
    expect([aws.name.en, aws.issued]).toEqual(["AWS Certified Machine Learning – Specialty", "2022"]);
    // Not in the CV summary, nor in any skills summary or the About text.
    const elsewhere = [profile.cv.summary, ...profile.skills.map((g) => g.summary), ...profile.basics.bio.map((f) => f.text)];
    for (const x of elsewhere) for (const loc of ["en", "ar"] as const) expect(x[loc]).not.toMatch(/AWS Certified/);
  });

  it("the Globant role keeps the STA wording and adds only the approved facts, with the team of 7", () => {
    const g = profile.experience.find((r) => r.id === "globant")!;
    // Round 7 (R7-14): the CV summary carries the approved STA clause; the first CV bullet adds the case study's facts.
    expect(g.cvBullets[0].text.en.startsWith("Saudi Tourism Authority (STA) project:")).toBe(true);
    expect(profile.cv.summary.en).toContain(
      "the AI engineering: an agentic LLM runtime (LangGraph) with retrieval, human-approval gates and evaluation, serving Noura, the public visitor assistant, and an internal staff assistant, in Arabic and English.",
    );
    expect(g.bullets[0]!.text.en).toBe(
      "Leading AI engineering on the Saudi Tourism Authority (STA) project: an agentic LLM runtime (LangGraph) with retrieval, human-approval gates and evaluation, serving Noura, the public visitor assistant, and an internal staff assistant, in Arabic and English.",
    );
    const all = [g.summary, ...g.bullets.map((b) => b.text), ...g.cvBullets.map((b) => b.text)].map((x) => `${x.en} ${x.ar}`).join(" ");
    expect(all).not.toMatch(/multi-agent|in production|launched|متعدد(ة)? الوكلاء|بيئة الإنتاج/i);
    for (const n of ["96", "27", "2026"]) expect(all).toContain(n);
    // Leadership: the team of 7 and nothing more (no reports, hiring or team practices).
    expect(all).toContain("Leading a team of 7");
    expect(all).toContain("فريق من 7 أعضاء");
    expect(all).not.toMatch(/\b(hire|hired|hiring|mentor\w*|reports to|direct reports|managed)\b/i);
    // Round 7 (R7-03): the approval rule as the case study defines it, never "before every action".
    expect(all).not.toMatch(/every action|any action|أي إجراء|كل إجراء/i);
    expect(all).toContain("every booking or order waits for the user's confirmation");
  });

  it("never sets Globant or the STA work beside multi-agent or production claims (round 6, HM-01)", () => {
    const BAD = /multi-agent|in production|متعدد(ة)? الوكلاء|بيئة الإنتاج/i;
    // The CV summary and the About text say "multi-agent … in production" only after "Before Globant".
    for (const [text, before] of [
      [profile.cv.summary.en, "Before Globant"],
      [profile.cv.summary.ar, "وقبل Globant"],
      [profile.basics.bio[0]!.text.en, "Before Globant"],
      [profile.basics.bio[0]!.text.ar, "وقبل Globant"],
    ] as const) {
      const at = text.indexOf(before);
      expect(at, text.slice(0, 40)).toBeGreaterThan(0);
      expect(text.slice(0, at)).not.toMatch(BAD);
    }
    for (const loc of ["en", "ar"] as const) {
      expect(profile.basics.tagline[loc]).not.toMatch(BAD);
      expect(profile.basics.headline[loc]).not.toMatch(BAD);
      const intro = profile.basics.intro[loc];
      expect(intro.slice(0, intro.indexOf(loc === "en" ? "Before that" : "وقبل ذلك"))).not.toMatch(/\d+-agent|من \d+ وكلاء|من \d+ وكيلًا/);
    }
  });
});
