/**
 * Experience trace (HANDOFF.md 6.2): roles and study lanes as spans on one timeline.
 *
 * Pure functions (no Astro, no DOM) so they can be unit-tested:
 *   axis(now)               the axis: first year 2020, last year = the build year (it grows each January)
 *   monthIndex(ym)          months since Jan 2020
 *   spanGeometry(p, now)    --s / --w in % of the axis, label side, live flag
 *   traceRows(now)          every row, newest role first, then the study lanes (M.Sc., ITI diploma)
 *   spanClasses / axisClasses / digitClasses
 *                           geometry as digit classes (src/styles/home-a.css turns them into percentages), because
 *                           the CSP is hash-only (no style="") and <style> is not valid inside <body>
 */
import { profile, type Education, type Period, type Role, type RoleId } from "@content/profile.ts";

export const AXIS_START = 2020;

export type BarStyle = "solid" | "pt" | "study";
export type Accent = "teal" | "saffron" | "coral" | "sky" | "sage" | "slate" | "study";

/** Bar colour by organisation (HANDOFF.md 6.2). */
export const ROLE_ACCENT: Record<RoleId, Accent> = {
  globant: "teal",
  wakeb: "saffron",
  arabsstock: "coral",
  empoweromics: "sky",
  buid: "sage",
  mtc: "sage",
  tabaqat: "slate",
  aestheticspro: "slate",
  mdp: "slate",
};

/** Education entries shown as study lanes (the B.Eng. ends before the axis starts). */
export const STUDY_LANES = ["msc-data-science", "iti-ai-diploma"] as const;

export interface Axis {
  start: number;
  end: number;
  months: number;
  years: number[];
}

export function axis(now: Date): Axis {
  const end = Math.max(now.getUTCFullYear(), AXIS_START);
  const years: number[] = [];
  for (let y = AXIS_START; y <= end; y++) years.push(y);
  return { start: AXIS_START, end, months: (end - AXIS_START + 1) * 12, years };
}

/** Months since Jan of the axis start. A bare year ("2026") means January for a start, December for an end. */
export function monthIndex(value: string, edge: "start" | "end" = "start"): number {
  const [y, m] = value.split("-");
  const month = m ? Number(m) : edge === "start" ? 1 : 12;
  return (Number(y) - AXIS_START) * 12 + (month - 1);
}

/** The current month as an index (the "now" line and the end of ongoing spans). */
export const nowIndex = (now: Date): number => (now.getUTCFullYear() - AXIS_START) * 12 + now.getUTCMonth();

const round = (v: number): number => Math.round(v * 100) / 100;

export interface Geometry {
  /** Start, % of the axis. */
  s: number;
  /** Width, % of the axis (inclusive of the end month). */
  w: number;
  /** Dates label sits before the bar (it would overflow the lane after it). */
  before: boolean;
  /** Ongoing: the bar fades into the "now" line. */
  live: boolean;
}

/**
 * Geometry of a period. Ongoing periods (end null) and periods that end after now (a degree in progress, expected
 * in a later year) run to the current month and are "live".
 */
export function spanGeometry(period: Period, now: Date, inProgress = false): Geometry {
  const ax = axis(now);
  const nowI = nowIndex(now);
  const s0 = Math.max(0, monthIndex(period.start, "start"));
  const endI = period.end === null || inProgress ? nowI : Math.min(monthIndex(period.end, "end"), ax.months - 1);
  const live = period.end === null || inProgress;
  const s = (s0 / ax.months) * 100;
  const w = ((endI + 1 - s0) / ax.months) * 100;
  return { s: round(s), w: round(w), before: s + w > 74, live };
}

export interface TraceRow {
  /** Unique, CSS-safe id ("globant", "msc-data-science"). */
  id: string;
  kind: "role" | "study";
  accent: Accent;
  bar: BarStyle;
  geometry: Geometry;
  /** Digit classes carrying the geometry (see spanClasses). */
  classes: string;
  role?: Role;
  education?: Education;
}

export function barStyle(role: Role): BarStyle {
  return role.employmentType === "full-time" ? "solid" : "pt";
}

export function traceRows(now: Date): TraceRow[] {
  const roles: TraceRow[] = profile.experience.map((role) => ({
    id: role.id,
    kind: "role",
    accent: ROLE_ACCENT[role.id],
    bar: barStyle(role),
    geometry: spanGeometry(role.period, now),
    classes: spanClasses(role.period, now),
    role,
  }));
  const study: TraceRow[] = STUDY_LANES.map((id) => profile.education.find((e) => e.id === id))
    .filter((e): e is Education => Boolean(e))
    .map((education) => ({
      id: education.id,
      kind: "study",
      accent: "study",
      bar: "study",
      geometry: spanGeometry(education.period, now, education.status === "in-progress"),
      classes: spanClasses(education.period, now, education.status === "in-progress"),
      education,
    }));
  return [...roles, ...study];
}

/** Month index of a year tick. */
export const yearIndex = (year: number, ax: Axis): number => (year - ax.start) * 12;

/** % position of a year tick. */
export const yearPosition = (year: number, ax: Axis): number => round((yearIndex(year, ax) / ax.months) * 100);

/** % position of the "now" line (start of the current month). */
export const nowPosition = (now: Date): number => round((nowIndex(now) / axis(now).months) * 100);

/**
 * Digit classes for an integer 0-999 under a one-letter name: digitClasses("s", 44) → "s-h0 s-t4 s-o4".
 * src/styles/home-a.css turns them back into numbers (custom properties) and then into percentages, so geometry
 * needs neither style="" nor a <style> element in <body>.
 */
export function digitClasses(name: "m" | "s" | "w" | "p", value: number): string {
  const v = Math.max(0, Math.min(999, Math.round(value)));
  return `${name}-h${Math.floor(v / 100)} ${name}-t${Math.floor(v / 10) % 10} ${name}-o${v % 10}`;
}

/** Month-precision geometry of a row as classes: start month and width in months. */
export function spanClasses(period: Period, now: Date, inProgress = false): string {
  const ax = axis(now);
  const s0 = Math.max(0, monthIndex(period.start, "start"));
  const endI = period.end === null || inProgress ? nowIndex(now) : Math.min(monthIndex(period.end, "end"), ax.months - 1);
  return `${digitClasses("s", s0)} ${digitClasses("w", endI + 1 - s0)}`;
}

/** Classes of the trace card (the axis length in months). */
export const axisClasses = (now: Date): string => digitClasses("m", axis(now).months);
