/**
 * Copy that states a checkable fact about the repository itself stays true: the assistant section's test count is the
 * size of content/chat/eval-set.json (round 7, BM-02: the set's size and what it covers, never a pass rate).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "@content/i18n/en.ts";
import { ar } from "@content/i18n/ar.ts";

const evalSet = JSON.parse(readFileSync(fileURLToPath(new URL("../../../content/chat/eval-set.json", import.meta.url)), "utf8")) as {
  cases: unknown[];
};

describe("facts the copy states about this repository", () => {
  it("names the real size of the assistant's evaluation set, in both languages, with no pass rate", () => {
    const n = String(evalSet.cases.length);
    expect(en.assistant.howItWorks).toContain(`evaluation set of ${n} cases`);
    expect(ar.assistant.howItWorks).toContain(`من ${n} حالة`);
    for (const s of [en.assistant.howItWorks, ar.assistant.howItWorks]) expect(s).not.toMatch(/%|pass rate|passed|نسبة النجاح|نجحت/i);
  });
});
