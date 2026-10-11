/**
 * Architecture diagrams from the design track (design/assets/diagrams → src/assets/diagrams): six systems, each in
 * a wide (≈1120), compact (320, phones: every label 11 px or more, on a 320 px phone too) and thumbnail (400×250,
 * cards) variant, one pattern drawn only as a thumbnail (agent-orchestration), plus diagrams.json with the EN/AR
 * titles, captions, text descriptions and numbered callouts.
 *
 * SVGs are inlined (so they follow the site's theme tokens) after two clean-ups required by the hash-only CSP:
 * their own <style> block is removed (src/styles/diagram.css carries the same grammar globally), and the motion
 * values (style="--L:…;--i:…" on the pulses, "--at:…;--k:…" on the nodes a pulse reaches) become data-vars, which
 * the motion runtime (src/scripts/motion.ts) applies through the CSSOM once the diagram is first on screen. Any
 * other style attribute is dropped.
 * Diagrams stay LTR and English on Arabic pages (technical notation); only <title>/<desc>, captions and callouts
 * are translated (HANDOFF.md 4.2). The exception is a diagram drawn in Arabic too (diagrams.json `ar`, files *-ar.svg:
 * mirrored to read right to left, Arabic labels; audit HM-41): Arabic pages get that drawing.
 */
import data from "~/assets/diagrams/diagrams.json";
import type { CaseStudySlug, Locale } from "@content/profile.ts";

export type DiagramId =
  | "arabsstock-assistant"
  | "wakeb-multi-agent-chatbot"
  | "llm-serving-a100"
  | "hybrid-rag"
  | "empoweromics-message-routing"
  | "sta-tourism-assistants"
  /** a pattern, drawn as a thumbnail only (the home page's multi-agent capability card) */
  | "agent-orchestration";
export type Variant = "wide" | "compact" | "thumb";

interface Bi {
  en: string;
  ar: string;
}
export interface Diagram {
  id: DiagramId;
  context: { en: string[]; ar: string[] };
  title: Bi;
  caption: Bi;
  desc: { long: Bi; short: Bi };
  /** Numbered notes under a figure; `term` is the bold lead-in ("Orchestrator."), as in the design. */
  callouts: ({ n: number; term?: Bi } & Bi)[];
  /** The drawn variants (a pattern may have only a thumbnail). */
  files: Partial<Record<Variant, { file: string }>>;
  ids: Record<Variant, string>;
  /** Arabic drawings (right to left, Arabic labels), when the diagram has them. */
  ar?: { files: Partial<Record<Variant, { file: string }>>; ids: Partial<Record<Variant, string>> };
}

export const DIAGRAMS = data.diagrams as unknown as Diagram[];

export const diagram = (id: DiagramId): Diagram => DIAGRAMS.find((d) => d.id === id)!;

/**
 * Which designed diagrams illustrate a case study, main figure first. Case studies without one (the brief ones and
 * logic-controls.com) render their architecture from profile.ts data instead.
 */
export const CASE_DIAGRAMS: Partial<Record<CaseStudySlug, DiagramId[]>> = {
  "sta-tourism-assistants": ["sta-tourism-assistants"],
  "arabsstock-assistant": ["arabsstock-assistant"],
  "wakeb-bilingual-chatbot": ["wakeb-multi-agent-chatbot", "hybrid-rag", "llm-serving-a100"],
  "empoweromics-ml": ["empoweromics-message-routing"],
};

const RAW = import.meta.glob<string>("../assets/diagrams/*.svg", { query: "?raw", import: "default", eager: true });

/** The drawing's file: the Arabic one on Arabic pages when it exists, otherwise the (English, LTR) one. */
function raw(id: DiagramId, variant: Variant, locale?: Locale): string {
  const base = variant === "wide" ? id : `${id}-${variant}`;
  const svg = (locale === "ar" ? RAW[`../assets/diagrams/${base}-ar.svg`] : undefined) ?? RAW[`../assets/diagrams/${base}.svg`];
  if (!svg) throw new Error(`diagram ${base}.svg not found`);
  return svg;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Removes what a strict style-src would block, plus the width/height that fight responsive sizing. */
function clean(svg: string): string {
  return svg
    .replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/\sstyle="(--[\w-]+:[^"]*)"/g, ' data-vars="$1"')
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/^<svg([^>]*?)\swidth="[\d.]+"\sheight="[\d.]+"/, "<svg$1");
}

/**
 * Inline SVG markup for a diagram, in the page's language where the diagram is drawn in it (pass `locale`).
 * - `decorative`: for card thumbnails next to a title that names the system: no role/title/desc/ids, aria-hidden.
 * - otherwise: role="img" labelled by its own <title>/<desc>, translated for Arabic pages.
 */
export function diagramSvg(
  id: DiagramId,
  variant: Variant,
  opts: { locale?: Locale; decorative?: boolean; /** makes ids unique when one diagram appears twice on a page */ idSuffix?: string } = {},
): string {
  let svg = clean(raw(id, variant, opts.locale));
  if (opts.idSuffix) {
    const sfx = opts.idSuffix;
    svg = svg
      .replace(/\sid="([^"]+)"/g, ` id="$1-${sfx}"`)
      .replace(/url\(#([^)]+)\)/g, `url(#$1-${sfx})`)
      .replace(/(aria-(?:labelledby|describedby))="([^"]+)"/g, (_, a: string, v: string) => `${a}="${v.split(/\s+/).map((x) => `${x}-${sfx}`).join(" ")}"`)
      .replace(/href="#([^"]+)"/g, `href="#$1-${sfx}"`);
  }
  if (opts.decorative) {
    return svg
      .replace(/<title[^>]*>[\s\S]*?<\/title>/g, "")
      .replace(/<desc[^>]*>[\s\S]*?<\/desc>/g, "")
      .replace(/\s(?:role|aria-labelledby|aria-describedby)="[^"]*"/g, "")
      .replace(/^<svg/, '<svg aria-hidden="true" focusable="false"');
  }
  if (opts.locale === "ar") {
    const d = diagram(id);
    const short = variant === "thumb";
    svg = svg
      .replace(/(<title id="[^"]+")>[\s\S]*?<\/title>/, `$1 lang="ar">${esc(d.title.ar)}</title>`)
      .replace(/(<desc id="[^"]+")>[\s\S]*?<\/desc>/, `$1 lang="ar">${esc(short ? d.desc.short.ar : d.desc.long.ar)}</desc>`);
  }
  return svg.replace(/^<svg/, '<svg focusable="false"');
}
