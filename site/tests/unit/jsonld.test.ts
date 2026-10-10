import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { caseStudyJsonLd, cvJsonLd, homeJsonLd, person, privacyJsonLd } from "~/lib/jsonld";

/** The unnamed client's hashed n-grams, from content/scripts/check-content.mjs (the names are never written). */
const FORBIDDEN = new Set([...readFileSync(new URL("../../../content/scripts/check-content.mjs", import.meta.url), "utf8").matchAll(/"([a-f0-9]{64})"/g)].map((m) => m[1]));
const namesClient = (text: string) => {
  const words = text.normalize("NFKC").toLowerCase().replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let i = 0; i < words.length; i++)
    for (let n = 1; n <= 3 && i + n <= words.length; n++)
      if (FORBIDDEN.has(createHash("sha256").update(words.slice(i, i + n).join(" ")).digest("hex"))) return true;
  return false;
};

describe("JSON-LD", () => {
  it("describes the person with the binding facts", () => {
    const p = person("en") as Record<string, unknown>;
    expect(p["@type"]).toBe("Person");
    expect(p.jobTitle).toBe("AI Team Lead");
    expect(JSON.stringify(p.worksFor)).toContain("Globant");
    expect(p.sameAs).toEqual(expect.arrayContaining(["https://www.linkedin.com/in/mohamed-hatem-6a5790173", "https://github.com/mhatem5351"]));
    expect(String(p.image)).toMatch(/^https:\/\/mohamedhatem\.dev\//);
    // The M.Sc. is in progress: Cairo University is not an alma mater yet.
    expect(JSON.stringify(p.alumniOf ?? "")).not.toContain("Cairo University");
  });

  it("emits valid, safe JSON for every page in both languages", () => {
    const all = (["en", "ar"] as const).flatMap((l) => [
      ...homeJsonLd(l),
      ...cvJsonLd(l),
      ...privacyJsonLd(l),
      ...profile.caseStudies.flatMap((c) => caseStudyJsonLd(c.slug, l)),
    ]);
    expect(FORBIDDEN.size).toBeGreaterThan(0);
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
