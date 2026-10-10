/*
 * Hero graph: the single source of truth for nodes, edges, geometry and copy.
 * Geometry is authored for LTR in a fixed 600 x 520 viewBox and mirrored for RTL.
 * The runtime imports only the geometry (COPY is tree-shaken out of the client bundle;
 * it reaches the browser through the server-rendered markup).
 */

export type Cat = "teal" | "saffron" | "coral" | "sky" | "sage" | "slate";
export type NodeId = "orchestrator" | "guard" | "retrieve" | "rerank" | "generate" | "evaluate" | "tools";
export type PortId = "query" | "answer";
export type Id = NodeId | PortId;
/** label side: n = above, s = below, e = right (LTR), w = left (LTR) */
export type Side = "n" | "s" | "e" | "w";
export type Dir = "ltr" | "rtl";
export type Lang = "en" | "ar";
export interface Pt { x: number; y: number }

export const VIEW = { w: 600, h: 520 } as const;
export const R_SAT = 25;
export const R_ORC = 40;
/** radius of the slowly turning dashed ring around the orchestrator */
export const R_SPIN = 51;
export const R_PORT = 6;

interface Place { x: number; y: number; r: number; lab: Side }

/**
 * LTR placement. Flow runs clockwise: guard (W) > orchestrator > retrieve (NW) > rerank (NE) > generate (E) > evaluate (SE);
 * the request enters at the top-left port and leaves at the bottom-right one. Label room is checked for the largest
 * (phone) label scale: e.g. generate's label must end before x = 600 at 1.36x.
 */
export const PLACE: Record<Id, Place> = {
  orchestrator: { x: 300, y: 242, r: R_ORC, lab: "s" },
  guard: { x: 122, y: 242, r: R_SAT, lab: "s" },
  retrieve: { x: 190, y: 82, r: R_SAT, lab: "n" },
  rerank: { x: 410, y: 82, r: R_SAT, lab: "n" },
  generate: { x: 478, y: 242, r: R_SAT, lab: "e" },
  evaluate: { x: 410, y: 402, r: R_SAT, lab: "s" },
  tools: { x: 190, y: 402, r: R_SAT, lab: "s" },
  query: { x: 40, y: 98, r: R_PORT, lab: "n" },
  answer: { x: 560, y: 462, r: R_PORT, lab: "s" },
};

export const CAT: Record<NodeId, Cat> = {
  orchestrator: "teal",
  guard: "sage",
  retrieve: "saffron",
  rerank: "saffron",
  generate: "coral",
  evaluate: "sky",
  tools: "slate",
};

/** Latin mono identifiers, shown in both locales. */
export const LABEL: Record<Id, string> = {
  orchestrator: "orchestrator",
  guard: "guard",
  retrieve: "retrieve",
  rerank: "rerank",
  generate: "generate",
  evaluate: "evaluate",
  tools: "tools · mcp",
  query: "query",
  answer: "answer",
};

/** Keyboard / reading order (the request flow; tools is the optional detour). */
export const ORDER: NodeId[] = ["guard", "orchestrator", "retrieve", "rerank", "generate", "evaluate", "tools"];

export type EdgeKind = "spoke" | "rim" | "port";
/** c = explicit control point (LTR); bend = outward bow (from the orchestrator) of a rim edge */
export interface EdgeDef { a: Id; b: Id; k: EdgeKind; bend?: number; c?: [number, number] }

export const EDGES: EdgeDef[] = [
  { a: "query", b: "guard", k: "port", c: [40, 242] },
  { a: "orchestrator", b: "guard", k: "spoke" },
  { a: "orchestrator", b: "retrieve", k: "spoke" },
  { a: "orchestrator", b: "rerank", k: "spoke" },
  { a: "orchestrator", b: "generate", k: "spoke" },
  { a: "orchestrator", b: "evaluate", k: "spoke" },
  { a: "orchestrator", b: "tools", k: "spoke" },
  { a: "retrieve", b: "rerank", k: "rim", bend: 22 },
  { a: "rerank", b: "generate", k: "rim", bend: 16 },
  { a: "generate", b: "evaluate", k: "rim", bend: 16 },
  { a: "evaluate", b: "answer", k: "port", c: [560, 402] },
];

/** The request route, and the variant used on every second loop (orchestrator calls tools before generate). */
export const ROUTE: Id[] = ["query", "guard", "orchestrator", "retrieve", "rerank", "generate", "evaluate", "answer"];
export const ROUTE_TOOLS: Id[] = ["query", "guard", "orchestrator", "retrieve", "rerank", "orchestrator", "tools", "orchestrator", "generate", "evaluate", "answer"];

// ------------------------------------------------------------------ geometry

/** category colour of whatever a pulse leaves from (the query port uses the accent) */
export function catOf(id: Id): Cat {
  return id === "query" ? "teal" : id === "answer" ? "sky" : CAT[id];
}

export function pos(id: Id, dir: Dir): Pt {
  const p = PLACE[id];
  return { x: dir === "rtl" ? VIEW.w - p.x : p.x, y: p.y };
}

export function sideOf(id: Id, dir: Dir): Side {
  const s = PLACE[id].lab;
  return dir === "rtl" && (s === "e" || s === "w") ? (s === "e" ? "w" : "e") : s;
}

export function edgeOf(a: Id, b: Id): EdgeDef | undefined {
  return EDGES.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

/** clearance between an edge end and the thing it connects to */
function gap(id: Id): number {
  return id === "orchestrator" ? R_SPIN + 6 : PLACE[id].r + (id === "query" || id === "answer" ? 5 : 6);
}

export interface Seg { p0: Pt; c: Pt; p1: Pt }
type Off = (id: Id) => Pt;
const ZERO: Off = () => ({ x: 0, y: 0 });

/**
 * Quadratic segment from a to b (either direction of a defined edge), trimmed at both ends
 * so it starts and ends a little outside the node rims. `off` adds per-node offsets (parallax).
 */
export function seg(a: Id, b: Id, dir: Dir, off: Off = ZERO): Seg {
  const e = edgeOf(a, b);
  const oa = off(a), ob = off(b);
  const A = pos(a, dir), B = pos(b, dir);
  A.x += oa.x; A.y += oa.y; B.x += ob.x; B.y += ob.y;
  let c: Pt;
  if (e && e.c) {
    // explicit control points belong to port cables: they travel with the satellite layer
    const o = off(e.a === "orchestrator" ? e.b : e.a);
    c = { x: (dir === "rtl" ? VIEW.w - e.c[0] : e.c[0]) + o.x, y: e.c[1] + o.y };
  } else {
    c = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    if (e && e.bend) {
      const O = pos("orchestrator", dir);
      const dx = c.x - O.x, dy = c.y - O.y, d = Math.hypot(dx, dy) || 1;
      c = { x: c.x + (dx / d) * e.bend, y: c.y + (dy / d) * e.bend };
    }
  }
  const tA = unit(A, c), tB = unit(B, c);
  const ga = gap(a), gb = gap(b);
  return { p0: { x: A.x + tA.x * ga, y: A.y + tA.y * ga }, c, p1: { x: B.x + tB.x * gb, y: B.y + tB.y * gb } };
}

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

export const rd = (v: number): number => Math.round(v * 10) / 10;

export function pathD(s: Seg): string {
  return `M${rd(s.p0.x)} ${rd(s.p0.y)}Q${rd(s.c.x)} ${rd(s.c.y)} ${rd(s.p1.x)} ${rd(s.p1.y)}`;
}

export function segLen(s: Seg): number {
  let L = 0, px = s.p0.x, py = s.p0.y;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    const x = u * u * s.p0.x + 2 * u * t * s.c.x + t * t * s.p1.x;
    const y = u * u * s.p0.y + 2 * u * t * s.c.y + t * t * s.p1.y;
    L += Math.hypot(x - px, y - py); px = x; py = y;
  }
  return L;
}

// ------------------------------------------------------------------ copy

export interface NodeCopy { title: string; text: string }
export interface Copy {
  caption: string;
  group: string;
  hint: string;
  pause: string;
  play: string;
  nodes: Record<NodeId, NodeCopy>;
}

export const COPY: Record<Lang, Copy> = {
  en: {
    caption:
      "How a request flows through the agent systems I build: the query passes guard, which screens the input; " +
      "the orchestrator then routes it to retrieve for hybrid search, to rerank to keep only the best context, " +
      "to generate to write the answer with a self-hosted model, and to evaluate to grade it before the answer is returned. " +
      "When live data is needed, the orchestrator also calls tools over MCP.",
    group: "Agent graph",
    hint: "Use the arrow keys to move between agents. Press Enter for details.",
    pause: "Pause animation",
    play: "Play animation",
    nodes: {
      orchestrator: { title: "orchestrator", text: "Routes every turn to the right agent: LangGraph with command-based routing across specialised agents." },
      guard: { title: "guard", text: "Screens the input first: prompt-injection and off-topic checks before anything reaches a model." },
      retrieve: { title: "retrieve", text: "Hybrid retrieval: dense vectors plus BM25 keyword search over the knowledge base." },
      rerank: { title: "rerank", text: "An LLM reranks the candidates, so only the best context reaches the prompt." },
      generate: { title: "generate", text: "Writes the answer with a self-hosted model: Qwen served by vLLM on A100 GPUs." },
      evaluate: { title: "evaluate", text: "Grades answers for quality and safety; the final verdict is computed in code, not by the model." },
      tools: { title: "tools · mcp", text: "Calls external tools over MCP, such as live web search." },
    },
  },
  ar: {
    caption:
      "كيف يمرّ الطلب عبر أنظمة الوكلاء التي أبنيها: يبدأ الاستعلام بالحارس (guard) الذي يفحص المدخلات، " +
      "ثم يوجّهه المنسِّق (orchestrator) إلى الاسترجاع (retrieve) للبحث الهجين، فإعادة الترتيب (rerank) لإبقاء أنسب سياق، " +
      "ثم التوليد (generate) لكتابة الإجابة بنموذج مستضاف ذاتيًا، فالتقييم (evaluate) قبل إرجاع الإجابة. " +
      "وعند الحاجة إلى بيانات مباشرة يستدعي المنسِّق الأدوات (tools) عبر MCP.",
    group: "مخطط الوكلاء",
    hint: "استخدم مفاتيح الأسهم للتنقل بين الوكلاء، واضغط Enter لعرض التفاصيل.",
    pause: "إيقاف الحركة مؤقتًا",
    play: "تشغيل الحركة",
    nodes: {
      orchestrator: { title: "المنسِّق", text: "يوجّه كل رسالة إلى الوكيل المناسب، عبر LangGraph وتوجيه قائم على الأوامر بين وكلاء متخصصين." },
      guard: { title: "الحارس", text: "يفحص المدخلات أولًا: محاولات حقن الأوامر والأسئلة الخارجة عن النطاق، قبل أن تصل إلى أي نموذج." },
      retrieve: { title: "الاسترجاع", text: "استرجاع هجين: متجهات دلالية مع بحث BM25 بالكلمات المفتاحية في قاعدة المعرفة." },
      rerank: { title: "إعادة الترتيب", text: "نموذج لغوي يعيد ترتيب النتائج، فلا يصل إلى السياق إلا الأنسب." },
      generate: { title: "التوليد", text: "يكتب الإجابة نموذج مستضاف ذاتيًا: Qwen عبر vLLM على وحدات A100." },
      evaluate: { title: "التقييم", text: "يقيّم الإجابات من حيث الجودة والأمان، والحكم النهائي يُحسب في الكود لا في النموذج." },
      tools: { title: "الأدوات", text: "يستدعي أدوات خارجية عبر MCP، مثل البحث المباشر على الويب." },
    },
  },
};
