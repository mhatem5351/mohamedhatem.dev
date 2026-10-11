/**
 * Titles that never break inside a hyphenated compound ("self-hosted", "real-estate", "4-language", "answer-quality"),
 * a number range ("98–100") or a domain name ("logic-controls.com", with its trailing punctuation): DESIGN 12.10,
 * audits VUX-05, C-02.
 * Returns escaped HTML (for `set:html`) in which each such run, with the punctuation right after it ("real-estate,"), is
 * a `<span class="…">` unit: an inline block may be followed by a line break, so a comma left outside it could start
 * the next line. With the unit styled as an
 * inline block that may not exceed its line (`display: inline-block; max-width: 100%`, `.nb-unit` in case.css), the
 * whole compound moves to the next line instead of splitting at its hyphen, and only a unit wider than the line itself
 * (a long domain in a large heading on a 320 px phone, or user text spacing, WCAG 1.4.12) still wraps inside.
 * Domains are isolated left-to-right as well, so they read right inside Arabic titles.
 *
 * The same rule as the home cards' titles (components/work/CaseCard.astro), shared here so every title uses one helper.
 */
const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function noBreakHtml(text: string, cls = "nb-unit"): string {
  return esc(text)
    .replace(/\b([a-z0-9-]+\.(?:com|dev|org|net|io))([:;,.]?)/g, `<span class="${cls}" dir="ltr">$1$2</span>`)
    .replace(/(^|[\s(])([A-Za-z0-9]+(?:[-–][A-Za-z0-9]+)+[,.:;)،؛]*)(?![^<]*<\/span>)(?=\s|$)/g, `$1<span class="${cls}">$2</span>`);
}

/**
 * Plain text (no markup) with no-break spaces where an Arabic line must not break (round 7, R7-21): a Latin word
 * carrying an Arabic prefix keeps the short word that ends its phrase («وMLOps أول»), so the line never ends on
 * «وMLOps» with «أول» alone below it. The text layer stays plain (copy, search, the PDF).
 */
export function glueArabic(text: string): string {
  return text.replace(/([وبلف][A-Za-z][A-Za-z0-9.-]*) (أول|أولى|أعلى)(?=$|[\s،.؛:)])/g, "$1\u00a0$2");
}
