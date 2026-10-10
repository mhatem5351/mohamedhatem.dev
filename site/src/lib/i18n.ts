/**
 * Locale helpers shared by every page and component: messages, paths, dates and durations.
 * All words come from ../../content (profile.ts + i18n/*); nothing user-facing is written here.
 */
import { getMessages, format, pluralize, type Messages } from "@content/i18n/index.ts";
import type { IsoMonth, IsoYear, L10n, Locale, Period } from "@content/profile.ts";

export type { Locale, Messages };
export { format, pluralize };

export const LOCALES: readonly Locale[] = ["en", "ar"];

/** Messages for a locale. */
export const messages = (locale: Locale): Messages => getMessages(locale);

/** Pick one locale's text. */
export const tr = (text: L10n, locale: Locale): string => text[locale];

export const dirOf = (locale: Locale): "ltr" | "rtl" => (locale === "ar" ? "rtl" : "ltr");
export const otherLocale = (locale: Locale): Locale => (locale === "ar" ? "en" : "ar");

/**
 * A site path in a locale. `path` is the English path with leading and trailing slash ("/", "/cv/", "/work/x/").
 * Arabic pages live under /ar/.
 */
export function localePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === "en") return clean;
  return clean === "/" ? "/ar/" : `/ar${clean}`;
}

/** The English path for a URL pathname of either locale ("/ar/cv/" → "/cv/"). */
export function basePath(pathname: string): string {
  if (pathname === "/ar" || pathname === "/ar/") return "/";
  return pathname.startsWith("/ar/") ? pathname.slice(3) : pathname;
}

/** The locale a pathname belongs to. */
export const localeOfPath = (pathname: string): Locale => (/^\/ar(\/|$)/.test(pathname) ? "ar" : "en");

/* ------------------------------------------------------------------------------------------------------------ */
/* Dates                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------ */

const INTL = { en: "en-US", ar: "ar-EG-u-nu-latn" } as const;

/** "YYYY-MM" or "YYYY" → { y, m } (m is null for a bare year). */
export function parseIso(value: IsoMonth | IsoYear | string): { y: number; m: number | null } {
  const [y, m] = value.split("-");
  return { y: Number(y), m: m ? Number(m) : null };
}

/** "Sep 2024" (en) / "سبتمبر 2024" (ar); a bare year stays "2024". */
export function formatMonth(value: IsoMonth | IsoYear | string, locale: Locale, monthStyle: "short" | "long" = locale === "ar" ? "long" : "short"): string {
  const { y, m } = parseIso(value);
  if (m === null) return String(y);
  return new Intl.DateTimeFormat(INTL[locale], { month: monthStyle, year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
}

/** Month name only ("Mar" / "مارس"), for compact ranges within one year. */
function monthName(value: string, locale: Locale): string {
  const { y, m } = parseIso(value);
  return new Intl.DateTimeFormat(INTL[locale], { month: locale === "ar" ? "long" : "short", timeZone: "UTC" }).format(Date.UTC(y, (m ?? 1) - 1, 1));
}

/**
 * A period as text: "Sep 2024 – Apr 2026", "Apr 2026 – Present", "Mar – Nov 2022", "Aug 2022", "2026".
 * `expected` marks an in-progress degree ("2023 – 2027 (expected)").
 */
export function formatPeriod(period: Period, locale: Locale, opts: { expected?: boolean; compact?: boolean } = {}): string {
  const m = messages(locale);
  const { start, end } = period;
  if (end !== null && start === end) return formatMonth(start, locale);
  const s = parseIso(start);
  const endText =
    end === null
      ? m.experience.present
      : opts.expected
        ? format(m.education.expected, { year: String(parseIso(end).y) })
        : formatMonth(end, locale);
  if (end !== null && !opts.expected && opts.compact !== false) {
    const e = parseIso(end);
    // Same year, both with months: "Mar – Nov 2022"
    if (s.m !== null && e.m !== null && s.y === e.y) return format(m.experience.dateRange, { start: monthName(start, locale), end: formatMonth(end, locale) });
  }
  return format(m.experience.dateRange, { start: formatMonth(start, locale), end: endText });
}

/** Year range "2023–2024" (for eyebrows); in Arabic wrap the result in <bdi dir="ltr">. */
export function formatYears(period: Period, now: Date = new Date()): string {
  const s = parseIso(period.start).y;
  const e = period.end === null ? now.getUTCFullYear() : parseIso(period.end).y;
  return s === e ? String(s) : `${s}–${e}`;
}

/** Months in a period, counted inclusively (end month − start month + 1), like LinkedIn. */
export function monthsInclusive(period: Period, now: Date = new Date()): number {
  const s = parseIso(period.start);
  const e = period.end === null ? { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 } : parseIso(period.end);
  const sm = s.m ?? 1;
  const em = e.m ?? 12;
  return (e.y - s.y) * 12 + (em - sm) + 1;
}

/** "1 yr 9 mos" / "سنة و9 أشهر". */
export function formatDuration(months: number, locale: Locale): string {
  const m = messages(locale);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? pluralize(m.experience.duration.years, years, locale) : "";
  const mo = rest ? pluralize(m.experience.duration.months, rest, locale) : "";
  if (y && mo) return format(m.experience.duration.join, { years: y, months: mo });
  return y || mo;
}

/** Cairo time ("14:32") for the build-time fallback; the client script keeps it live. */
export function cairoTime(locale: Locale, date: Date = new Date()): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Joins a list the way each language does ("A, B and C" / "A وB وC"). */
export function joinList(items: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(locale === "ar" ? "ar" : "en-GB", { style: "long", type: "conjunction" }).format(items);
}
