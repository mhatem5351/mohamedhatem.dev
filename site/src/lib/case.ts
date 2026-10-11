/**
 * Pure helpers for the case-study pages (src/views/CaseStudyPage.astro, src/components/case/*).
 * Everything is derived from content/profile.ts and the design's diagrams.json; no copy is written here.
 */
import type { ArchNode, ArchNodeKind, CaseStudy, Fact, L10n, Locale, Role, Screen, Source } from "@content/profile.ts";
import { format, formatDuration, formatPeriod, formatYears, joinList, messages, monthsInclusive, tr } from "./i18n";
import { CASE_DIAGRAMS, type DiagramId } from "./diagrams";
import { profile } from "./site";

/** Category colours of the design system (DESIGN.md 3.2). */
export type Accent = "teal" | "saffron" | "coral" | "sky" | "sage" | "slate";

export const roleOf = (cs: CaseStudy): Role | undefined => (cs.roleId ? profile.experience.find((r) => r.id === cs.roleId) : undefined);

/** Organisation name: the role's company, or (freelance work outside the experience list) the first part of `context`. */
export function companyOf(cs: CaseStudy, locale: Locale): string {
  const role = roleOf(cs);
  if (role) return tr(role.company, locale);
  return tr(cs.context, locale).split(/[،,]/)[0]!.trim();
}

/** The descriptor after the organisation name in `context` ("an Arab stock-media platform"), if any. */
export function contextDetail(cs: CaseStudy, locale: Locale): string | undefined {
  const parts = tr(cs.context, locale).split(/[،,]\s*/);
  return parts.length > 1 ? parts.slice(1).join(locale === "ar" ? "، " : ", ") : undefined;
}

/** Card / bar accent per case study (design: ArabsStock coral, Wakeb saffron, Empoweromics sky, freelance teal …). */
const ACCENT: Record<string, Accent> = {
  "sta-tourism-assistants": "teal",
  "arabsstock-assistant": "coral",
  "wakeb-bilingual-chatbot": "saffron",
  "gov-bilingual-assistant": "sage",
  "empoweromics-ml": "sky",
  "logic-controls-website": "teal",
  "aip-semantic-search": "saffron",
  "tabaqat-gis": "slate",
};
export const accentOf = (cs: CaseStudy): Accent => ACCENT[cs.slug] ?? "teal";

/** Eyebrow parts: organisation / role title (or "Freelance") / years. */
export function eyebrowParts(cs: CaseStudy, locale: Locale): { company: string; role: string; years: string } {
  const m = messages(locale);
  const role = roleOf(cs);
  return {
    company: companyOf(cs, locale),
    role: role ? tr(role.title, locale) : m.work.freelance,
    years: formatYears(cs.period),
  };
}

/** The case study carries its role's period because the sources don't date the project itself. */
export function datedByRole(cs: CaseStudy): boolean {
  const role = roleOf(cs);
  return !!role && role.period.start === cs.period.start && role.period.end === cs.period.end;
}

/**
 * Work dated only by a role that has several case studies (the chatbot, the government assistant and AIP at Wakeb
 * Data): pages and cards say "during the role" / "At Wakeb Data, 2024–2026" instead of presenting the role's dates
 * as each project's own (audit FC-7). A role with one case study is that case study's period.
 */
export const sharesRolePeriod = (cs: CaseStudy): boolean => datedByRole(cs) && (roleOf(cs)?.caseStudies.length ?? 0) > 1;

/** Period line and its small print (duration, or the role period for work dated by a shared role). */
export function periodInfo(cs: CaseStudy, locale: Locale): { main: string; small?: string; isRolePeriod: boolean } {
  const m = messages(locale);
  const role = roleOf(cs);
  const isRolePeriod = sharesRolePeriod(cs);
  if (isRolePeriod && role) return { main: format(m.work.page.duringRole, { company: tr(role.company, locale) }), small: formatPeriod(cs.period, locale), isRolePeriod };
  const main = formatPeriod(cs.period, locale);
  const hasMonths = /-/.test(cs.period.start);
  const small = hasMonths ? formatDuration(monthsInclusive(cs.period), locale) : undefined;
  return small ? { main, small, isRolePeriod } : { main, isRolePeriod };
}

/** The question the "Ask my AI about this project" controls send. */
export const askQuestion = (cs: CaseStudy, locale: Locale): string => format(messages(locale).work.page.askQuestion, { title: tr(cs.shortTitle, locale) });

/** "my CV, my LinkedIn profile and …" from a case study's sources. */
export function sourcesText(sources: readonly Source[], locale: Locale): string {
  const names = messages(locale).work.page.sources;
  return joinList([...new Set(sources)].map((s) => names[s]), locale);
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Engineering decisions: one approach fact per case study, quoted verbatim, only where the source states a choice */
/* ------------------------------------------------------------------------------------------------------------ */

const DECISION: Partial<Record<CaseStudy["slug"], number>> = {
  "sta-tourism-assistants": 0, // one agent for two audiences, behind an audience gate
  "arabsstock-assistant": 0, // 14 specialised agents behind one LangGraph orchestrator
  "wakeb-bilingual-chatbot": 0, // Command-based routing instead of fixed edges, fully async
  "logic-controls-website": 0, // static build on Workers, free tier
};

export function decisionOf(cs: CaseStudy): { fact: Fact; index: number } | undefined {
  const i = DECISION[cs.slug];
  if (i === undefined || cs.depth === "brief") return undefined;
  const fact = cs.approach[i];
  return fact ? { fact, index: i } : undefined;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Table of contents                                                                                             */
/* ------------------------------------------------------------------------------------------------------------ */

export interface TocEntry {
  id: string;
  label: string;
}

export function tocOf(cs: CaseStudy, locale: Locale): TocEntry[] {
  const m = messages(locale);
  const l = m.work.labels;
  const out: TocEntry[] = [
    { id: "problem", label: l.problem },
    { id: "approach", label: l.approach },
    ...(cs.screens?.length ? [{ id: "screens", label: l.screens }] : []),
    { id: "components", label: l.architecture },
    { id: "outcome", label: l.outcome },
    { id: "stack", label: l.stack },
  ];
  if (cs.links.length) out.push({ id: "links", label: m.work.page.links });
  return out;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Architecture as HTML (component view) when there is no designed diagram, and as the text alternative          */
/* ------------------------------------------------------------------------------------------------------------ */

/** Order in which node kinds are shown (roughly request flow: who, routing, work, models, data, plumbing, quality). */
export const KIND_ORDER: readonly ArchNodeKind[] = ["user", "orchestrator", "agent", "model", "retrieval", "data", "service", "pipeline", "infra", "quality"];

/** Category colour per node kind (design/assets/diagrams/diagram.css grammar: users external/neutral). */
export const KIND_ACCENT: Record<ArchNodeKind, Accent | "neutral"> = {
  user: "neutral",
  orchestrator: "teal",
  agent: "teal",
  model: "coral",
  retrieval: "saffron",
  data: "saffron",
  service: "slate",
  pipeline: "slate",
  infra: "slate",
  quality: "sky",
};

export const KIND_ICON: Record<ArchNodeKind, string> = {
  user: "users",
  orchestrator: "orchestrator",
  agent: "agents",
  model: "generate",
  retrieval: "retrieve",
  data: "database",
  service: "gateway",
  pipeline: "pipeline",
  infra: "serving",
  quality: "evaluate",
};

export interface KindGroup {
  kind: ArchNodeKind;
  nodes: ArchNode[];
}

export function nodesByKind(cs: CaseStudy): KindGroup[] {
  return KIND_ORDER.map((kind) => ({ kind, nodes: cs.architecture.nodes.filter((n) => n.kind === kind) })).filter((g) => g.nodes.length);
}

export interface EdgeText {
  from: string;
  to: string;
  label?: string;
}

/** Connections with node labels resolved ("Platform users" → "LangGraph orchestrator"). */
export function edgesOf(cs: CaseStudy, locale: Locale): EdgeText[] {
  const label = (id: string) => {
    const n = cs.architecture.nodes.find((x) => x.id === id);
    return n ? tr(n.label, locale) : id;
  };
  return cs.architecture.edges.map((e) => ({ from: label(e.from), to: label(e.to), ...(e.label ? { label: tr(e.label, locale) } : {}) }));
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Stack grouped by category                                                                                     */
/* ------------------------------------------------------------------------------------------------------------ */

const TECH_KIND: Record<string, ArchNodeKind> = {
  LangGraph: "orchestrator",
  "OpenAI API": "model",
  Qwen: "model",
  vLLM: "model",
  "LLM reranking": "retrieval",
  Pinecone: "retrieval",
  BM25: "retrieval",
  "Brave Search": "retrieval",
  "Semantic search": "retrieval",
  "Image search": "retrieval",
  "OpenAI embeddings": "retrieval",
  "Overture Maps": "data",
  "AWS Athena": "data",
  DuckDB: "data",
  PostgreSQL: "data",
  SQLite: "data",
  "Cosmos DB": "data",
  "SQL Server": "data",
  Prefect: "pipeline",
  "Azure Functions": "pipeline",
  "CI/CD": "pipeline",
  "NVIDIA A100": "infra",
  Docker: "infra",
  Nginx: "infra",
  "Cloudflare Workers": "infra",
  MapProxy: "service",
  MBTileServer: "service",
  MapLibre: "service",
  "Kepler.gl": "service",
  FastAPI: "service",
  MCP: "service",
  Python: "service",
  Astro: "service",
  TypeScript: "service",
  "Tailwind CSS": "service",
  PyTorch: "model",
  NLP: "model",
  "Computer vision": "model",
  "Arabic NLP": "model",
  "LLM evaluation": "quality",
  RAG: "retrieval",
  React: "service",
  Observability: "quality",
  Turnstile: "quality",
  Vitest: "quality",
  Playwright: "quality",
  "axe-core": "quality",
};

/**
 * A stack item: a product name (one string in both languages) or, for a concept that reads in Arabic ("LLM evaluation"
 * / «تقييم النماذج اللغوية»), a localized pair. Its kind and colour come from the English name.
 */
export type StackItem = string | L10n;
const stackKey = (tech: StackItem): string => (typeof tech === "string" ? tech : tech.en);
/** The item's label on a page in `locale`. */
export const stackLabel = (tech: StackItem, locale: Locale): string => (typeof tech === "string" ? tech : tech[locale]);

export const techKind = (tech: StackItem): ArchNodeKind => TECH_KIND[stackKey(tech)] ?? "service";

/** Chip colour for a tech name (chip--<accent>, or neutral). */
export function techAccent(tech: StackItem): Accent | "neutral" {
  return KIND_ACCENT[techKind(tech)];
}

export function stackGroups(cs: CaseStudy): { kind: ArchNodeKind; items: StackItem[] }[] {
  const groups = new Map<ArchNodeKind, StackItem[]>();
  for (const t of cs.stack as readonly StackItem[]) {
    const k = techKind(t);
    // agents/orchestration share one row, and so do service/infra plumbing pieces with few items
    const key: ArchNodeKind = k === "agent" ? "orchestrator" : k;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return KIND_ORDER.filter((k) => groups.has(k)).map((kind) => ({ kind, items: groups.get(kind)! }));
}

/** Designed diagrams for this case study (main figure first), if any. */
export const diagramsOf = (cs: CaseStudy): DiagramId[] => CASE_DIAGRAMS[cs.slug] ?? [];

/* ------------------------------------------------------------------------------------------------------------ */
/* Screens gallery (case studies whose client approved publishing product screens)                               */
/* ------------------------------------------------------------------------------------------------------------ */

/**
 * Where a screen sits in its group's grid (two columns from 48rem, 2 : 1):
 * - `lead`: the first desktop screen of a group with three or more, across both columns;
 * - `main`: the other desktop screens, in the wide column;
 * - `side`: phone and dialog captures in the narrow column, spanning `rows` rows of desktop screens, so a tall
 *   phone sits beside a stack of desktop screens instead of under them.
 */
export interface ScreenSlot {
  screen: Screen;
  place: "lead" | "main" | "side";
  rows: 1 | 2 | 3;
}
export interface ScreenGroup {
  product: L10n;
  slots: ScreenSlot[];
}

/** The case study's screens grouped by product (first-seen order), each with its place in the grid. */
export function screenGroups(cs: CaseStudy): ScreenGroup[] {
  const groups: ScreenGroup[] = [];
  for (const screen of cs.screens ?? []) {
    let g = groups.find((x) => x.product.en === screen.product.en);
    if (!g) groups.push((g = { product: screen.product, slots: [] }));
    g.slots.push({ screen, place: "main", rows: 1 });
  }
  for (const g of groups) {
    const desktop = g.slots.filter((s) => s.screen.frame === "desktop");
    const side = g.slots.filter((s) => s.screen.frame !== "desktop");
    if (desktop.length >= 3) desktop[0]!.place = "lead";
    const beside = desktop.filter((s) => s.place === "main").length;
    const rows = Math.max(1, Math.min(3, Math.round(beside / Math.max(1, side.length)))) as 1 | 2 | 3;
    for (const s of side) Object.assign(s, { place: "side", rows });
  }
  return groups;
}
