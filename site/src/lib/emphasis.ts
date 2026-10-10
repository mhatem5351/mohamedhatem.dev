/**
 * Bold "receipts" inside a sentence (DESIGN.md: the trace bullets and the CV mark the fact that matters, e.g. "STA
 * project", "3,008+ real-estate developers"). content/profile.ts names the phrase (`Fact.strong`,
 * `cv.summaryStrong`); the text itself stays plain, so meta tags, JSON-LD and llms.txt never see markup.
 */

export interface Segment {
  text: string;
  strong: boolean;
}

/**
 * Splits `text` around the first occurrence of each phrase (in text order; overlapping or missing phrases are
 * ignored, so a stale phrase can only lose its bold, never break the sentence).
 */
export function emphasize(text: string, phrases: readonly string[] = []): Segment[] {
  const hits = phrases
    .filter((p) => p.trim())
    .map((p) => ({ at: text.indexOf(p), len: p.length }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: Segment[] = [];
  let i = 0;
  for (const h of hits) {
    if (h.at < i) continue;
    if (h.at > i) out.push({ text: text.slice(i, h.at), strong: false });
    out.push({ text: text.slice(h.at, h.at + h.len), strong: true });
    i = h.at + h.len;
  }
  if (i < text.length) out.push({ text: text.slice(i), strong: false });
  return out;
}

/** Every phrase occurs in its text (used by the unit tests over content/profile.ts). */
export const allPhrasesFound = (text: string, phrases: readonly string[]): boolean => phrases.every((p) => text.includes(p));
