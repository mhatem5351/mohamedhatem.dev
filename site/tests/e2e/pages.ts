/** The site's pages for the sweeps (kept in sync with content/profile.ts by tests/unit/pages.test.ts). */
export const CASE_SLUGS = [
  "sta-tourism-assistants",
  "arabsstock-assistant",
  "wakeb-bilingual-chatbot",
  "aip-semantic-search",
  "gov-bilingual-assistant",
  "empoweromics-ml",
  "tabaqat-gis",
  "logic-controls-website",
] as const;

const EN = ["/", ...CASE_SLUGS.map((s) => `/work/${s}/`), "/cv/", "/privacy/"];
export const PAGES = [...EN, ...EN.map((p) => (p === "/" ? "/ar/" : `/ar${p}`))];
export const NOT_FOUND = ["/does-not-exist/", "/ar/does-not-exist/"];
/** A representative subset for the slower checks (axe in two themes, overflow sweep). */
export const KEY_PAGES = ["/", "/ar/", "/work/sta-tourism-assistants/", "/ar/work/sta-tourism-assistants/", "/work/arabsstock-assistant/", "/ar/work/arabsstock-assistant/", "/work/gov-bilingual-assistant/", "/cv/", "/ar/cv/", "/privacy/", "/ar/privacy/"];
