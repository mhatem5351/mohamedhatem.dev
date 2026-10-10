import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { emphasize } from "~/lib/emphasis";

describe("emphasize", () => {
  it("splits a sentence around its bold phrases, in text order", () => {
    expect(emphasize("Leading AI engineering on the STA project: RAG.", ["STA project"])).toEqual([
      { text: "Leading AI engineering on the ", strong: false },
      { text: "STA project", strong: true },
      { text: ": RAG.", strong: false },
    ]);
    expect(emphasize("a b c", ["c", "a"]).map((s) => s.strong)).toEqual([true, false, true]);
  });

  it("ignores missing, empty and overlapping phrases instead of breaking the sentence", () => {
    expect(emphasize("plain text", ["absent", ""])).toEqual([{ text: "plain text", strong: false }]);
    expect(emphasize("14-agent assistant", ["14-agent", "agent assistant"]).map((s) => s.text).join("")).toBe("14-agent assistant");
  });
});

describe("bold phrases in content/profile.ts", () => {
  const facts = [
    ...profile.experience.flatMap((r) => [...r.bullets, ...r.cvBullets]),
    ...profile.caseStudies.flatMap((c) => [...c.approach, ...c.outcome]),
  ];
  for (const locale of ["en", "ar"] as const) {
    it(`every Fact.strong occurs verbatim in its text (${locale})`, () => {
      const missing = facts.filter((f) => f.strong && !f.text[locale].includes(f.strong[locale])).map((f) => f.text[locale].slice(0, 60));
      expect(missing).toEqual([]);
      expect(facts.filter((f) => f.strong).length).toBeGreaterThan(10);
    });
    it(`every cv.summaryStrong phrase occurs in the CV summary (${locale})`, () => {
      for (const p of profile.cv.summaryStrong) expect(profile.cv.summary[locale]).toContain(p[locale]);
    });
    it(`bold phrases start and end on word boundaries (${locale})`, () => {
      // A phrase that starts inside a word would split the word between two weights (and break Arabic joining).
      // The conjunction "و" doesn't join the next letter, so a phrase may start right after it.
      const pairs = [
        ...facts.filter((x) => x.strong).map((f) => [f.text[locale], f.strong![locale]] as const),
        ...profile.cv.summaryStrong.map((p) => [profile.cv.summary[locale], p[locale]] as const),
      ];
      for (const [text, phrase] of pairs) {
        const at = text.indexOf(phrase);
        const before = text[at - 1] ?? " ";
        const after = text[at + phrase.length] ?? " ";
        expect(/[\p{L}\p{N}]/u.test(before) && before !== "و", `${phrase} starts inside a word`).toBe(false);
        expect(/[\p{L}\p{N}]/u.test(after), `${phrase} ends inside a word`).toBe(false);
      }
    });
  }
});
