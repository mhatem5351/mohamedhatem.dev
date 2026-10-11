/**
 * Mixed-direction labels (audit A-01, A-02). A localized label always takes the page's direction; only the runs of the
 * other script inside it are isolated, each with its own explicit direction. Never `dir="auto"` or a bare <bdi> (its
 * default is auto) on a localized label: auto picks the direction from the first strong letter, so an Arabic phrase
 * that starts with a Latin word ("vLLM يخدم Qwen") becomes a left-to-right paragraph and reads backwards
 * ("Qwen serves vLLM"), and a Latin-only label sits flush left in a right-aligned Arabic card.
 *
 * - Arabic pages: Latin runs ("vLLM", "Brave Search", "ETL (Azure Functions)", "WCAG 2.2 AA") and numeric ranges
 *   ("2021–2022", which the Arabic bidi algorithm would show as "2022–2021") become `<bdi dir="ltr">`. Punctuation at
 *   a run's edges stays outside it ("CI: …" keeps its colon between "CI" and the Arabic), so it follows the sentence.
 * - English pages: Arabic runs become `<bdi dir="rtl">`.
 * Render with components/ui/BidiText.astro.
 */
import type { Locale } from "./i18n";

export type BidiPart = { text: string; dir?: "ltr" | "rtl" };

/** Arabic letters, Arabic Supplement and Extended-A, and the presentation forms. */
const AR = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFC";
const ARABIC_CHAR = new RegExp(`[${AR}]`);
const ARABIC_RUNS = new RegExp(`[${AR}]+(?:[\\s\\u00A0]+[${AR}]+)*`, "g");
const ARABIC_SPLIT = new RegExp(`([${AR}]+)`);
const NUMBER_RANGE = /^\d[\d,.]*\s*[-\u2010-\u2015]\s*\d[\d,.]*$/;

/** "rtl" when the text has any Arabic letter, else "ltr" (the direction its own content asks for). */
export const scriptDir = (text: string): "ltr" | "rtl" => (ARABIC_CHAR.test(text) ? "rtl" : "ltr");

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** The isolatable core of a non-Arabic stretch: no edge punctuation, no unbalanced bracket. [start, end) or null. */
function core(seg: string): [number, number] | null {
  let a = 0;
  let b = seg.length;
  for (;;) {
    while (a < b && !/[A-Za-z0-9]/.test(seg[a]!)) a++;
    while (b > a && !/[A-Za-z0-9)]/.test(seg[b - 1]!)) b--;
    const s = seg.slice(a, b);
    if (s.endsWith(")") && count(s, ")") > count(s, "(")) {
      b--;
      continue;
    }
    break;
  }
  return b > a ? [a, b] : null;
}

/** The label split into plain text (the page's direction) and isolated runs of the other script. */
export function bidiParts(text: string, locale: Locale): BidiPart[] {
  const parts: BidiPart[] = [];
  const push = (t: string, dir?: "ltr" | "rtl") => {
    if (!t) return;
    const last = parts.at(-1);
    if (!dir && last && !last.dir) last.text += t;
    else parts.push(dir ? { text: t, dir } : { text: t });
  };
  if (locale !== "ar") {
    let at = 0;
    for (const m of text.matchAll(ARABIC_RUNS)) {
      push(text.slice(at, m.index));
      push(m[0], "rtl");
      at = m.index + m[0].length;
    }
    push(text.slice(at));
    return parts;
  }
  // Arabic page: walk the stretches between Arabic letters; isolate the ones that hold a Latin word or a number range.
  const stretches = text.split(ARABIC_SPLIT);
  for (const seg of stretches) {
    if (!seg) continue;
    if (ARABIC_CHAR.test(seg)) {
      push(seg);
      continue;
    }
    const c = core(seg);
    const run = c ? seg.slice(c[0], c[1]) : "";
    if (c && (/[A-Za-z]/.test(run) || NUMBER_RANGE.test(run))) {
      push(seg.slice(0, c[0]));
      push(run, "ltr");
      push(seg.slice(c[1]));
    } else push(seg);
  }
  return parts;
}
