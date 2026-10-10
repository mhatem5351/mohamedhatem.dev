import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { CASE_SLUGS } from "../e2e/pages";

describe("e2e page list", () => {
  it("covers every case study in profile.ts", () => {
    expect([...CASE_SLUGS].sort()).toEqual(profile.caseStudies.map((c) => c.slug).sort());
  });
});
