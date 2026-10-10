import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { PERSON_ID, WEBSITE_ID, caseStudyJsonLd, cvJsonLd, homeJsonLd, person, privacyJsonLd, temporalCoverage, website } from "~/lib/jsonld";

/** The unnamed client's hashed n-grams: the repository's one list (the names are never written). */
const CONFIDENTIAL = JSON.parse(readFileSync(new URL("../../../worker/src/chat/confidential-hashes.json", import.meta.url), "utf8")) as { canonical: string[]; variants: string[] };
const FORBIDDEN = new Set([...CONFIDENTIAL.canonical, ...CONFIDENTIAL.variants]);
type Node = Record<string, unknown>;
const all = (["en", "ar"] as const).flatMap((l) => [
  ...homeJsonLd(l),
  ...cvJsonLd(l),
  ...privacyJsonLd(l),
  ...profile.caseStudies.flatMap((c) => caseStudyJsonLd(c.slug, l)),
]) as Node[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const namesClient = (text: string) => {
  const words = text.normalize("NFKC").toLowerCase().replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let i = 0; i < words.length; i++)
    for (let n = 1; n <= 3 && i + n <= words.length; n++)
      if (FORBIDDEN.has(createHash("sha256").update(words.slice(i, i + n).join(" ")).digest("hex"))) return true;
  return false;
};

describe("JSON-LD", () => {
  it("describes the person with the binding facts", () => {
    const p = person();
    expect(p["@type"]).toBe("Person");
    expect(p.jobTitle).toBe("AI Team Lead");
    expect(JSON.stringify(p.worksFor)).toContain("Globant");
    expect(p.sameAs).toEqual(expect.arrayContaining(["https://www.linkedin.com/in/mohamed-hatem-6a5790173", "https://github.com/mhatem5351"]));
    expect(String(p.image)).toMatch(/^https:\/\/mohamedhatem\.dev\//);
    // The M.Sc. is in progress: Cairo University is not an alma mater yet.
    expect(JSON.stringify(p.alumniOf ?? "")).not.toContain("Cairo University");
    // The sources don't say which part of "Mohamed Hatem Radwan" is the family name: none is guessed.
    expect(p).not.toHaveProperty("familyName");
    expect(p).not.toHaveProperty("givenName");
    expect(p.alternateName).toEqual(expect.arrayContaining(["Mohamed Hatem Radwan", "محمد حاتم"]));
  });

  it("describes the Person and the WebSite once: the same content on every page and in both languages", () => {
    for (const id of [PERSON_ID, WEBSITE_ID]) {
      const bodies = new Set(all.filter((n) => n["@id"] === id).map((n) => JSON.stringify(n)));
      expect(bodies.size, id).toBe(1);
    }
    expect(JSON.stringify(website())).toContain("محمد حاتم");
  });

  it("puts the WebSite node on every page that refers to it", () => {
    for (const l of ["en", "ar"] as const)
      for (const page of [homeJsonLd(l), cvJsonLd(l), privacyJsonLd(l), ...profile.caseStudies.map((c) => caseStudyJsonLd(c.slug, l))]) {
        const json = JSON.stringify(page);
        if (json.includes(`"@id":"${WEBSITE_ID}"`)) expect(page.some((n) => (n as Node)["@type"] === "WebSite")).toBe(true);
      }
  });

  it("dates every case study with full ISO dates, and never presents a role's dates as the project's", () => {
    for (const cs of profile.caseStudies) {
      const article = caseStudyJsonLd(cs.slug, "en").find((n) => (n as Node)["@type"] === "Article") as Node;
      expect(article.datePublished).toMatch(ISO_DATE);
      expect(article.dateModified).toMatch(ISO_DATE);
      const about = article.about as Node;
      const role = profile.experience.find((r) => r.id === cs.roleId);
      const datedByRole = !!role && role.period.start === cs.period.start && role.period.end === cs.period.end;
      if (datedByRole) {
        expect(about).not.toHaveProperty("dateCreated");
        expect(about).not.toHaveProperty("temporalCoverage");
      }
    }
    const lc = caseStudyJsonLd("logic-controls-website", "en").find((n) => (n as Node)["@type"] === "Article") as Node;
    expect((lc.about as Node).temporalCoverage).toBe("2026");
    expect(temporalCoverage({ start: "2023-04", end: null })).toBe("2023-04/..");
  });

  it("puts codeRepository only on a SoftwareSourceCode node", () => {
    const json = JSON.stringify(all);
    expect(json).not.toMatch(/"@type":"(?!SoftwareSourceCode)[^"]+"[^{}]*"codeRepository"/);
    expect(json).toContain('"@type":"SoftwareSourceCode"');
  });

  it("emits valid, safe JSON for every page in both languages", () => {
    expect(CONFIDENTIAL.canonical.length).toBeGreaterThan(0);
    for (const item of all) {
      const json = JSON.stringify(item);
      expect(JSON.parse(json)).toBeTruthy();
      expect(namesClient(json)).toBe(false);
      expect(json).not.toMatch(/holds? an? M\.?Sc/i);
    }
  });

  it("gives each case study a breadcrumb Home → Work → case", () => {
    const items = caseStudyJsonLd("arabsstock-assistant", "en");
    const crumbs = items.find((i) => (i as { "@type"?: string })["@type"] === "BreadcrumbList") as { itemListElement: unknown[] } | undefined;
    expect(crumbs?.itemListElement).toHaveLength(3);
  });
});
