/**
 * "Skills, with receipts": the matrix on the home page (HANDOFF.md 6.1). Rows are skills, columns are where they
 * were used. Every filled cell names the evidence that justifies it, as a reference into content/profile.ts
 * (`role:<id>`, `case:<slug>` or `project:<id>`), so tests/unit can check that each dot points at a real role,
 * case study or repository whose column matches. Empty cells have no entry. Labels live in content/i18n
 * (skills.matrix.rows / groups / columns).
 */
import type { EvidenceRef } from "@content/profile.ts";

export type MatrixColumn = "globant" | "wakeb" | "arabsstock" | "tabaqat" | "empoweromics" | "earlier" | "oss";
export type MatrixGroup = "agents" | "retrieval" | "serving" | "quality" | "data";
export type MatrixRowKey =
  | "multiAgent"
  | "langgraph"
  | "mcp"
  | "openai"
  | "rag"
  | "hybrid"
  | "semantic"
  | "serving"
  | "fastapi"
  | "docker"
  | "prefect"
  | "evaluation"
  | "frontendQa"
  | "nlp"
  | "vision"
  | "etl"
  | "cloud";

/** Columns in display order. "earlier" = freelance and earlier roles (Logic Controls, AestheticsPro, MDP). */
export const MATRIX_COLUMNS: readonly MatrixColumn[] = ["globant", "wakeb", "arabsstock", "tabaqat", "empoweromics", "earlier", "oss"];

/** Category colour of each group (DESIGN.md 3.2): the row dots and the group header use it. */
export const GROUP_ACCENT: Record<MatrixGroup, "teal" | "saffron" | "slate" | "sky" | "coral"> = {
  agents: "teal",
  retrieval: "saffron",
  serving: "slate",
  quality: "sky",
  data: "coral",
};

export interface MatrixRow {
  key: MatrixRowKey;
  group: MatrixGroup;
  /** Filled cells: column → the profile.ts evidence for it. */
  cells: Partial<Record<MatrixColumn, EvidenceRef>>;
}

export const MATRIX_ROWS: readonly MatrixRow[] = [
  // Agents and LLMs
  // Globant (STA): one agentic LangGraph runtime with retrieval, human-approval gates and evaluation, on managed models,
  // so a LangGraph, RAG and evaluation dot, but neither "multi-agent" nor self-hosted serving.
  { key: "multiAgent", group: "agents", cells: { wakeb: "case:wakeb-bilingual-chatbot", arabsstock: "case:arabsstock-assistant" } },
  { key: "langgraph", group: "agents", cells: { globant: "role:globant", wakeb: "case:wakeb-bilingual-chatbot", arabsstock: "case:arabsstock-assistant", oss: "project:staged-llm-evaluator" } },
  { key: "mcp", group: "agents", cells: { wakeb: "case:wakeb-bilingual-chatbot" } },
  { key: "openai", group: "agents", cells: { arabsstock: "role:arabsstock", oss: "project:prompt-reliability-harness" } },
  // Retrieval
  { key: "rag", group: "retrieval", cells: { globant: "role:globant", wakeb: "case:wakeb-bilingual-chatbot", oss: "project:rag-answering-service" } },
  { key: "hybrid", group: "retrieval", cells: { wakeb: "case:wakeb-bilingual-chatbot" } },
  { key: "semantic", group: "retrieval", cells: { wakeb: "case:aip-semantic-search", arabsstock: "case:arabsstock-assistant" } },
  // Serving and MLOps
  // Self-hosted serving is Wakeb's (ArabsStock's role lists neither vLLM nor GPUs; round 7, HM-32).
  { key: "serving", group: "serving", cells: { wakeb: "case:wakeb-bilingual-chatbot" } },
  // FastAPI is in the STA case study's stack (round 7, R7-18).
  { key: "fastapi", group: "serving", cells: { globant: "case:sta-tourism-assistants", wakeb: "case:wakeb-bilingual-chatbot", arabsstock: "case:arabsstock-assistant", oss: "project:rag-answering-service" } },
  { key: "docker", group: "serving", cells: { wakeb: "role:wakeb", arabsstock: "role:arabsstock", earlier: "case:logic-controls-website" } },
  { key: "prefect", group: "serving", cells: { tabaqat: "case:tabaqat-gis" } },
  // Quality
  { key: "evaluation", group: "quality", cells: { globant: "role:globant", wakeb: "case:gov-bilingual-assistant", arabsstock: "role:arabsstock", oss: "project:staged-llm-evaluator" } },
  { key: "frontendQa", group: "quality", cells: { earlier: "case:logic-controls-website", oss: "project:logic-controls-website" } },
  // Data and ML
  { key: "nlp", group: "data", cells: { wakeb: "case:wakeb-bilingual-chatbot", empoweromics: "case:empoweromics-ml", oss: "project:arabic-sentiment-analysis" } },
  { key: "vision", group: "data", cells: { arabsstock: "case:arabsstock-assistant", empoweromics: "case:empoweromics-ml" } },
  { key: "etl", group: "data", cells: { tabaqat: "case:tabaqat-gis", empoweromics: "role:empoweromics", earlier: "role:mdp" } },
  { key: "cloud", group: "data", cells: { tabaqat: "case:tabaqat-gis", empoweromics: "role:empoweromics", earlier: "case:logic-controls-website" } },
];

/** Groups in display order with their rows. */
export function matrixGroups(): { group: MatrixGroup; rows: MatrixRow[] }[] {
  const order: MatrixGroup[] = ["agents", "retrieval", "serving", "quality", "data"];
  return order.map((group) => ({ group, rows: MATRIX_ROWS.filter((r) => r.group === group) }));
}

/**
 * The column an evidence ref belongs to: a role's column, the column of a case study's role (logic-controls.com,
 * freelance with no role, is "earlier"), and "oss" for public repositories.
 */
export function columnOfRef(ref: EvidenceRef, caseRole: (slug: string) => string | null | undefined): MatrixColumn | undefined {
  const [kind, id] = ref.split(":") as [string, string];
  const roleColumn = (role: string | null | undefined): MatrixColumn | undefined => {
    if (role === null) return "earlier";
    if (!role) return undefined;
    if ((["globant", "wakeb", "arabsstock", "tabaqat", "empoweromics"] as const).includes(role as never)) return role as MatrixColumn;
    if (role === "aestheticspro" || role === "mdp") return "earlier";
    return undefined;
  };
  if (kind === "role") return roleColumn(id);
  if (kind === "case") return roleColumn(caseRole(id));
  if (kind === "project") return "oss";
  return undefined;
}
