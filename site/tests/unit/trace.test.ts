import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { axis, digitClasses, monthIndex, nowPosition, spanClasses, spanGeometry, traceRows, yearPosition } from "~/lib/trace";

const NOW = new Date(Date.UTC(2026, 9, 10)); // October 2026, like the design's reference renders

describe("experience trace geometry (HANDOFF.md 6.2)", () => {
  it("spans January 2020 to December of the current year", () => {
    const ax = axis(NOW);
    expect(ax.years).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(ax.months).toBe(84);
    expect(axis(new Date(Date.UTC(2027, 0, 5))).months).toBe(96); // grows each January
  });

  it("matches the prototype's bar positions", () => {
    const g = (start: string, end: string | null) => spanGeometry({ start: start as never, end: end as never }, NOW);
    expect(g("2026-04", null)).toMatchObject({ s: 89.29, w: 8.33, live: true, before: true });
    expect(g("2023-04", "2024-12")).toMatchObject({ s: 46.43, w: 25, live: false });
    expect(g("2020-01", "2021-01")).toMatchObject({ s: 0, w: 15.48 });
    expect(g("2021-04", "2022-02")).toMatchObject({ s: 17.86, w: 13.1 });
    expect(g("2022-08", "2022-08").w).toBe(1.19);
  });

  it("treats a bare end year as December and a degree in progress as live to now", () => {
    expect(monthIndex("2027", "end")).toBe(95);
    const msc = spanGeometry({ start: "2023-09", end: "2027" }, NOW, true);
    expect(msc.live).toBe(true);
    expect(msc.s + msc.w).toBeCloseTo(((6 * 12 + 9 + 1) / 84) * 100, 1); // ends with the current month (Oct 2026)
  });

  it("has one row per role, then the study lanes, with unique ids", () => {
    const rows = traceRows(NOW);
    expect(rows.filter((r) => r.kind === "role").map((r) => r.id)).toEqual(profile.experience.map((r) => r.id));
    expect(rows.filter((r) => r.kind === "study").map((r) => r.id)).toEqual(["msc-data-science", "iti-ai-diploma"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.geometry.s).toBeGreaterThanOrEqual(0);
      expect(r.geometry.s + r.geometry.w).toBeLessThanOrEqual(100.01);
    }
  });

  it("encodes geometry as digit classes (no style attributes)", () => {
    expect(digitClasses("s", 44)).toBe("s-h0 s-t4 s-o4");
    expect(digitClasses("w", 999)).toBe("w-h9 w-t9 w-o9");
    expect(spanClasses({ start: "2023-04", end: "2024-12" }, NOW)).toBe("s-h0 s-t3 s-o9 w-h0 w-t2 w-o1");
  });

  it("places year ticks and the now line", () => {
    expect(yearPosition(2023, axis(NOW))).toBe(42.86);
    expect(nowPosition(NOW)).toBe(96.43);
  });
});
