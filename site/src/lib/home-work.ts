/**
 * Presentation data for the home page's "Selected work" (which card style and accent each case study gets).
 * Facts stay in content/profile.ts; this only maps slugs to the design's category colours (DESIGN.md 3.2):
 * teal = the current role (the Saudi Tourism Authority assistants at Globant, as in the trace), coral = generation
 * (the ArabsStock assistant), saffron = Wakeb (as in the trace), sage = bilingual / guarded assistant, sky =
 * Empoweromics (as in the trace), teal = front-end craft, slate = data platforms.
 */
import type { CaseStudy, CaseStudySlug } from "@content/profile.ts";
import { caseStudies } from "./site";

export type Accent = "teal" | "saffron" | "coral" | "sky" | "sage" | "slate";

export const CASE_ACCENT: Record<CaseStudySlug, Accent> = {
  "sta-tourism-assistants": "teal",
  "arabsstock-assistant": "coral",
  "wakeb-bilingual-chatbot": "saffron",
  "gov-bilingual-assistant": "sage",
  "empoweromics-ml": "sky",
  "logic-controls-website": "teal",
  "aip-semantic-search": "slate",
  "tabaqat-gis": "slate",
};

export interface WorkLayout {
  /** The first featured case study: full-width card, media on the end side. */
  feature: CaseStudy | undefined;
  /** Featured case studies in the 3-column grid. */
  grid: CaseStudy[];
  /** A featured case study that would sit alone in the last grid row becomes a wide card instead. */
  wide: CaseStudy | undefined;
  /** Not featured: the compact "More work" list. */
  more: CaseStudy[];
}

/** Splits case studies into the home layout (display order from profile.ts `order`). */
export function workLayout(all: readonly CaseStudy[] = caseStudies, columns = 3): WorkLayout {
  const featured = all.filter((c) => c.featured);
  const more = all.filter((c) => !c.featured);
  const [feature, ...rest] = featured;
  const orphan = rest.length % columns === 1 ? rest[rest.length - 1] : undefined;
  return { feature, grid: orphan ? rest.slice(0, -1) : rest, wide: orphan, more };
}
