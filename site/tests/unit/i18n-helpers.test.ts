import { describe, expect, it } from "vitest";
import { basePath, formatDuration, formatMonth, formatPeriod, formatYears, joinList, localeOfPath, localePath, monthsInclusive } from "~/lib/i18n";

describe("paths", () => {
  it("maps English paths to Arabic twins and back", () => {
    expect(localePath("/", "en")).toBe("/");
    expect(localePath("/", "ar")).toBe("/ar/");
    expect(localePath("/cv/", "ar")).toBe("/ar/cv/");
    expect(localePath("/work/arabsstock-assistant/", "ar")).toBe("/ar/work/arabsstock-assistant/");
    expect(basePath("/ar/")).toBe("/");
    expect(basePath("/ar/cv/")).toBe("/cv/");
    expect(basePath("/privacy/")).toBe("/privacy/");
    expect(localeOfPath("/ar/work/x/")).toBe("ar");
    expect(localeOfPath("/arabic/")).toBe("en");
  });
});

describe("dates", () => {
  it("formats months per locale with Western digits", () => {
    expect(formatMonth("2024-09", "en")).toBe("Sep 2024");
    expect(formatMonth("2024-09", "ar")).toBe("سبتمبر 2024");
    expect(formatMonth("2026", "ar")).toBe("2026");
  });

  it("formats periods: ranges, present, same-year compaction, single month, expected degrees", () => {
    expect(formatPeriod({ start: "2024-09", end: "2026-04" }, "en")).toBe("Sep 2024 – Apr 2026");
    expect(formatPeriod({ start: "2026-04", end: null }, "en")).toBe("Apr 2026 – Present");
    expect(formatPeriod({ start: "2026-04", end: null }, "ar")).toBe("أبريل 2026 – حتى الآن");
    expect(formatPeriod({ start: "2022-03", end: "2022-11" }, "en")).toBe("Mar – Nov 2022");
    expect(formatPeriod({ start: "2022-08", end: "2022-08" }, "en")).toBe("Aug 2022");
    expect(formatPeriod({ start: "2023-09", end: "2027" }, "en", { expected: true })).toBe("Sep 2023 – 2027 (expected)");
    expect(formatPeriod({ start: "2023-09", end: "2027" }, "ar", { expected: true })).toBe("سبتمبر 2023 – 2027 (متوقع)");
  });

  it("counts months inclusively, matching LinkedIn", () => {
    expect(monthsInclusive({ start: "2024-09", end: "2026-04" })).toBe(20);
    expect(monthsInclusive({ start: "2023-04", end: "2024-12" })).toBe(21);
    expect(monthsInclusive({ start: "2022-08", end: "2022-08" })).toBe(1);
    expect(monthsInclusive({ start: "2026-04", end: null }, new Date(Date.UTC(2026, 9, 10)))).toBe(7);
  });

  it("formats durations in both languages", () => {
    expect(formatDuration(20, "en")).toBe("1 yr 8 mos");
    expect(formatDuration(21, "en")).toBe("1 yr 9 mos");
    expect(formatDuration(12, "en")).toBe("1 yr");
    expect(formatDuration(1, "en")).toBe("1 mo");
    expect(formatDuration(20, "ar")).toBe("سنة و8 أشهر");
    expect(formatDuration(24, "ar")).toBe("سنتان");
  });

  it("formats year ranges", () => {
    expect(formatYears({ start: "2023-04", end: "2024-12" })).toBe("2023–2024");
    expect(formatYears({ start: "2026", end: "2026" })).toBe("2026");
    expect(formatYears({ start: "2026-04", end: null }, new Date(Date.UTC(2026, 9, 1)))).toBe("2026");
  });

  it("joins lists per language", () => {
    expect(joinList(["A", "B", "C"], "en")).toBe("A, B and C");
    expect(joinList(["A", "B"], "ar")).toContain("و");
  });
});
