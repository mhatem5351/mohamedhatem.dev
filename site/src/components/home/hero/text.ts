/**
 * Typographic treatment of the hero copy (HANDOFF.md 6.3), as escaped HTML:
 *   H1:   the emphasis word ("production" / "بيئة الإنتاج") in <em>; "multi-agent" never breaks; "hold up" and
 *         "in Arabic" stay together, so at 768–2560 px it breaks as "I build multi-agent / LLM systems that /
 *         hold up in production, / in Arabic and English."
 *   Lede: "7 years" in <strong>; counts never break from their noun ("14-agent", "6 وكلاء").
 */
import type { Locale } from "~/lib/i18n";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const EMPHASIS: Record<Locale, string> = { en: "production", ar: "بيئة الإنتاج" };
const NBSP = " ";

function glue(text: string, locale: Locale): string {
  let out = esc(text);
  if (locale === "en") {
    out = out
      .replace(/\b(\d+-agent|multi-agent)\b/g, '<span class="nowrap">$1</span>')
      .replace(/\bhold up\b/g, `hold${NBSP}up`)
      .replace(/\bin Arabic\b/g, `in${NBSP}Arabic`)
      .replace(/\b(\d+) years\b/g, `$1${NBSP}years`);
  } else {
    // A Western-digit count followed by its Arabic noun stays on one line.
    out = out.replace(/(\d+) (?=[؀-ۿ])/g, `$1${NBSP}`);
  }
  return out;
}

/** H1 markup: tagline with the emphasis word wrapped in <em>. */
export function taglineHtml(tagline: string, locale: Locale): string {
  const word = EMPHASIS[locale];
  const at = tagline.indexOf(word);
  if (at < 0) return glue(tagline, locale);
  return `${glue(tagline.slice(0, at), locale)}<em>${esc(word)}</em>${glue(tagline.slice(at + word.length), locale)}`;
}

/** Lede markup: the experience figure ("7 years" / "7 سنوات") in <strong>. */
export function introHtml(intro: string, locale: Locale, years: number): string {
  const phrase = locale === "en" ? `${years} years` : `${years} سنوات`;
  const at = intro.indexOf(phrase);
  if (at < 0) return glue(intro, locale);
  return `${glue(intro.slice(0, at), locale)}<strong>${glue(phrase, locale)}</strong>${glue(intro.slice(at + phrase.length), locale)}`;
}
