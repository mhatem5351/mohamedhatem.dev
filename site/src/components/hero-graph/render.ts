/*
 * Hero graph: pure string renderer (no DOM). Used at build time (Astro SSR) and, lazily, by the
 * runtime when a host element is empty.
 *   renderHeroGraphSVG({ dir, lang }) -> the self-contained <svg> (copy, descriptions, control labels inside)
 *   renderHeroGraph({ dir, lang })    -> the same svg wrapped in <figure class="hg" data-hero-graph>
 * The pause button, toggletip and live region are added by the runtime (they only make sense with JS).
 */
import {
  CAT, COPY, EDGES, LABEL, ORDER, PLACE, R_SPIN, ROUTE, VIEW,
  catOf, pathD, pos, seg, sideOf, type Dir, type Lang, type NodeId, type Side,
} from "./graph-data";

export interface RenderOptions {
  dir?: Dir;
  lang?: Lang;
  /** id prefix, only needed if two graphs share a page */
  id?: string;
}
interface SvgOptions extends RenderOptions {
  /** false when a <figcaption> already carries the flow sentence */
  describe?: boolean;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* 24-grid glyphs (round caps and joins); `hg-gd` marks the small filled "node" dots */
const GLYPH: Record<NodeId, string> = {
  orchestrator:
    '<path d="M12 10.1V7M10.3 13.7l-3.1 2.4M13.7 13.7l3.1 2.4"/><circle cx="12" cy="4.6" r="2.3"/>' +
    '<circle cx="5.2" cy="17.7" r="2.3"/><circle cx="18.8" cy="17.7" r="2.3"/><circle class="hg-gd" cx="12" cy="12.3" r="2"/>',
  guard: '<path d="M12 3.2l6.8 2.7v5.3c0 4.4-2.9 7.9-6.8 9.6-3.9-1.7-6.8-5.2-6.8-9.6V5.9z"/><circle class="hg-gd" cx="12" cy="11.8" r="1.6"/>',
  retrieve: '<circle cx="10.6" cy="10.6" r="6.1"/><path d="M15.1 15.1l4.6 4.6"/>',
  rerank: '<path d="M6 4.5v15M3.5 17l2.5 2.5 2.5-2.5M11 6.5h9M11 12h6.5M11 17.5h3.5"/>',
  generate: '<path d="M4.5 6.5h15M4.5 12h11M4.5 17.5h6.5M14.8 14.8v5.4"/>',
  evaluate: '<path d="M6 18.5A8.5 8.5 0 1 1 18 18.5M8.7 12.7l2.3 2.3 4.4-4.6"/>',
  tools: '<path d="M9 3.5v4M15 3.5v4M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v4.5"/>',
};
/* glyphs that encode reading direction are mirrored in RTL */
const MIRROR: Partial<Record<NodeId, true>> = { rerank: true, generate: true };

/* Labels sit in a group translated to their anchor point, so the phone-size scale (CSS, origin 0 0)
   grows them away from the node in every engine. */
function label(text: string, side: Side, r: number): string {
  const g = r + 10;
  const [x, y, at] =
    side === "n" ? [0, -g, 'text-anchor="middle"'] :
    side === "s" ? [0, g, 'dy=".8em" text-anchor="middle"'] :
    side === "e" ? [g, 0, 'dy=".34em" text-anchor="start"'] :
    [-g, 0, 'dy=".34em" text-anchor="end"'];
  return `<g transform="translate(${x} ${y})"><text class="hg-lbl" ${at}>${esc(text)}</text></g>`;
}

function glyph(id: NodeId, dir: Dir, scale: number): string {
  const h = 12 * scale, m = dir === "rtl" && MIRROR[id];
  return `<g class="hg-glyph" transform="translate(${m ? h : -h} ${-h}) scale(${m ? -scale : scale} ${scale})">${GLYPH[id]}</g>`;
}

function node(id: NodeId, dir: Dir, lang: Lang, pfx: string): string {
  const p = pos(id, dir), r = PLACE[id].r, c = COPY[lang].nodes[id];
  // WCAG 2.5.3: the accessible name starts with the visible (Latin) label, in both locales
  const name = lang === "ar" ? `${LABEL[id]}، ${c.title}` : LABEL[id];
  const o = id === "orchestrator";
  let inner =
    `<circle class="hg-hit" r="${r + 12}"/>` +
    `<circle class="hg-aura" r="${r + 7}"/>` +
    `<circle class="hg-ripple" r="${r}"/>` +
    `<circle class="hg-focus" r="${r + 6}"/>`;
  if (o) {
    const cw = Math.round(LABEL[id].length * 7.8 + 18), cy = R_SPIN + 9;
    inner +=
      `<circle class="hg-spin" r="${R_SPIN}" pathLength="288"/>` +
      `<circle class="hg-disc" r="${r}"/><circle class="hg-ring2" r="${r - 6}"/>` +
      glyph(id, dir, 1.25) +
      `<g transform="translate(0 ${cy})"><g class="hg-chip"><rect x="${-cw / 2}" y="0" width="${cw}" height="22" rx="6"/>` +
      `<text x="0" y="15.5" text-anchor="middle">${esc(LABEL[id])}</text></g></g>`;
  } else {
    inner += `<circle class="hg-disc" r="${r}"/>` + glyph(id, dir, 0.88) + label(LABEL[id], sideOf(id, dir), r);
  }
  return (
    `<g class="hg-node hg-c-${CAT[id]}" data-id="${id}" data-title="${esc(c.title)}" data-label="${esc(LABEL[id])}" ` +
    `role="button" tabindex="${id === ORDER[0] ? 0 : -1}" aria-label="${esc(name)}" aria-describedby="${pfx}-d-${id}" ` +
    `aria-expanded="false" transform="translate(${p.x} ${p.y})">${inner}</g>`
  );
}

function port(id: "query" | "answer", dir: Dir): string {
  const p = pos(id, dir), r = PLACE[id].r;
  return (
    `<g class="hg-port hg-c-${catOf(id)}" data-id="${id}" transform="translate(${p.x} ${p.y})">` +
    `<circle class="hg-ripple" r="${r + 2}"/><rect class="hg-term" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" rx="3.5"/>` +
    `<circle class="hg-gd" r="1.9"/>${label(LABEL[id], sideOf(id, dir), r)}</g>`
  );
}

export function renderHeroGraphSVG(o: SvgOptions = {}): string {
  const dir: Dir = o.dir === "rtl" ? "rtl" : "ltr";
  const lang: Lang = o.lang === "ar" ? "ar" : "en";
  const pfx = o.id || "hg";
  const copy = COPY[lang];

  let rimPort = "", spokes = "", routeRim = "", routeSpoke = "";
  for (const e of EDGES) {
    const sp = e.k === "spoke";
    const cls = sp ? "hg-e hg-sp" : e.k === "rim" ? "hg-e hg-rim" : "hg-e hg-pe";
    const el = `<path class="${cls}" data-a="${e.a}" data-b="${e.b}" d="${pathD(seg(e.a, e.b, dir))}"/>`;
    if (sp) spokes += el; else rimPort += el;
  }
  // the request route, drawn faintly in category colours for the still frame
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i]!, b = ROUTE[i + 1]!;
    const sp = EDGES.some(x => x.k === "spoke" && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    const el = `<path class="hg-rt hg-c-${catOf(a)}${sp ? " hg-sp" : ""}" data-a="${a}" data-b="${b}" d="${pathD(seg(a, b, dir))}"/>`;
    if (sp) routeSpoke += el; else routeRim += el;
  }
  // DOM order = reading / keyboard order (guard, orchestrator, retrieve, ...); the orchestrator keeps its own layer
  const sats = (ids: NodeId[]): string => ids.map(id => node(id, dir, lang, pfx)).join("");
  // node descriptions (aria-describedby targets) live outside the buttons so they never count as their visible text
  const descs = ORDER.map(id => `<text id="${pfx}-d-${id}">${esc(copy.nodes[id].text)}</text>`).join("");

  return (
    `<svg class="hg-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}" ` +
    `fill="none" direction="ltr" tabindex="-1" role="group" aria-label="${esc(copy.group)}" aria-describedby="${pfx}-desc" ` +
    `data-dir="${dir}" data-lang="${lang}" data-pause="${esc(copy.pause)}" data-play="${esc(copy.play)}">` +
    `<desc id="${pfx}-desc">${esc(o.describe === false ? copy.hint : copy.caption + " " + copy.hint)}</desc>` +
    `<g class="hg-descs" display="none" aria-hidden="true">${descs}</g>` +
    `<g class="hg-sl" aria-hidden="true">${rimPort}${routeRim}</g>` +
    `<g class="hg-spokes" aria-hidden="true">${spokes}${routeSpoke}</g>` +
    `<g class="hg-comet hg-c-teal" aria-hidden="true">` +
    `<linearGradient id="${pfx}-cg" gradientUnits="userSpaceOnUse"><stop offset="0" class="hg-cs0"/><stop offset="1" class="hg-cs1"/></linearGradient>` +
    `<path class="hg-tail-h" stroke="url(#${pfx}-cg)"/><path class="hg-tail" stroke="url(#${pfx}-cg)"/>` +
    `<circle class="hg-head-h" r="8"/><circle class="hg-head" r="3.4"/></g>` +
    `<g class="hg-sl"><g aria-hidden="true">${port("query", dir)}${port("answer", dir)}</g>${sats(["guard"])}</g>` +
    `<g class="hg-ol">${node("orchestrator", dir, lang, pfx)}</g>` +
    `<g class="hg-sl">${sats(ORDER.slice(2))}</g>` +
    `</svg>`
  );
}

/**
 * <figure class="hg" data-hero-graph> with a visually hidden caption (the flow in one sentence, read in
 * browse mode) around the svg. The runtime auto-initialises it.
 */
export function renderHeroGraph(o: RenderOptions = {}): string {
  const dir: Dir = o.dir === "rtl" ? "rtl" : "ltr";
  const lang: Lang = o.lang === "ar" ? "ar" : "en";
  return (
    `<figure class="hg" data-hero-graph dir="${dir}" lang="${lang}"><figcaption class="hg-sr">${esc(COPY[lang].caption)}</figcaption>` +
    `${renderHeroGraphSVG({ ...o, dir, lang, describe: false })}</figure>`
  );
}
