import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { en } from "@content/i18n/en.ts";
import { ar } from "@content/i18n/ar.ts";
import { MATRIX_COLUMNS, MATRIX_ROWS, columnOfRef, matrixGroups } from "~/lib/skills-matrix";

const caseRole = (slug: string) => profile.caseStudies.find((c) => c.slug === slug)?.roleId;
const exists = (ref: string): boolean => {
  const [kind, id] = ref.split(":");
  if (kind === "role") return profile.experience.some((r) => r.id === id);
  if (kind === "case") return profile.caseStudies.some((c) => c.slug === id);
  if (kind === "project") return profile.projects.some((p) => p.id === id);
  return false;
};

describe("skills with receipts", () => {
  it("backs every dot with evidence that exists in profile.ts and belongs to that column", () => {
    const bad: string[] = [];
    for (const row of MATRIX_ROWS)
      for (const [column, ref] of Object.entries(row.cells)) {
        if (!exists(ref!)) bad.push(`${row.key}/${column}: ${ref} not in profile.ts`);
        else if (columnOfRef(ref!, caseRole) !== column) bad.push(`${row.key}/${column}: ${ref} belongs to ${columnOfRef(ref!, caseRole)}`);
      }
    expect(bad).toEqual([]);
  });

  it("has at least one dot per row, known columns only, and labels in both languages", () => {
    for (const row of MATRIX_ROWS) {
      expect(Object.keys(row.cells).length).toBeGreaterThan(0);
      for (const c of Object.keys(row.cells)) expect(MATRIX_COLUMNS).toContain(c);
      expect(en.skills.matrix.rows[row.key]).toBeTruthy();
      expect(ar.skills.matrix.rows[row.key]).toBeTruthy();
    }
    for (const c of MATRIX_COLUMNS) expect(ar.skills.matrix.columns[c]).toBeTruthy();
  });

  it("groups rows in display order without losing any", () => {
    const groups = matrixGroups();
    expect(groups.map((g) => g.group)).toEqual(["agents", "retrieval", "serving", "quality", "data"]);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(MATRIX_ROWS.length);
  });
});
