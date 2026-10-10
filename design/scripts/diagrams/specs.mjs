// Diagram data. Every label here is a fact from the sources (CV, LinkedIn, approved GitHub README).
// Coordinates are in px on an 8 px grid (4 px half-steps allowed). Node h defaults to 56.
// kinds: orch agent data model eval guard infra store ext  (see lib.mjs KINDS)
// edge ports: "nodeId:side[+-offset]" (side t r b l). async:true = dashed (async / batch).
// main: ordered edge ids for the optional travelling pulse (arrays = parallel hops).

export const SPECS = {};

// ============================================================================ hybrid-rag
SPECS["hybrid-rag"] = {
  wide: {
    w: 1120, h: 296,
    groups: [{ id: "par", x: 184, y: 48, w: 184, h: 168, tab: "parallel", co: 1 }],
    nodes: [
      { id: "q", kind: "ext", x: 32, y: 104, w: 96, t: "Query", g: "user" },
      { id: "bm25", kind: "data", x: 200, y: 72, w: 152, t: "BM25", s: "keyword", g: "keyword" },
      { id: "vec", kind: "data", x: 200, y: 136, w: 152, t: "Dense vector", s: "embeddings", g: "embed" },
      { id: "merge", kind: "data", x: 424, y: 104, w: 112, t: "Merge", g: "merge", co: 2 },
      { id: "rr", kind: "data", x: 592, y: 104, w: 144, t: "LLM rerank", g: "rerank", co: 3 },
      { id: "ctx", kind: "data", x: 784, y: 104, w: 120, t: "Context", g: "file-text" },
      { id: "gen", kind: "model", x: 960, y: 104, w: 128, t: "Generate", s: "LLM", g: "generate", co: 4 },
    ],
    edges: [
      { id: "q1", from: "q:r", to: "bm25:l", via: { x: 156 } },
      { id: "q2", from: "q:r", to: "vec:l", via: { x: 156 } },
      { id: "m1", from: "bm25:r", to: "merge:l", via: { x: 396 } },
      { id: "m2", from: "vec:r", to: "merge:l", via: { x: 396 } },
      { id: "r", from: "merge:r", to: "rr:l" },
      { id: "c", from: "rr:r", to: "ctx:l" },
      { id: "g", from: "ctx:r", to: "gen:l" },
    ],
    main: [["q1", "q2"], ["m1", "m2"], "r", "c", "g"],
    legend: { x: 32, y: 268 },
  },
};

// ============================================================================ arabsstock-assistant
{
  const rows = [
    ["r0", "AI image generation", "image"],
    ["r1", "Content moderation", "shield-check"],
    ["r2", "Semantic search", "search"],
    ["r3", "Integrated AI services", "tools-mcp"],
    ["r4", "Database operations", "database"],
  ];
  const serving = [
    ["s0", "Image search", "image"],
    ["s1", "Sound generation", "audio"],
    ["s2", "Instrument classification", "tag"],
    ["s3", "BPM detection", "activity"],
    ["s4", "Audio watermarking", "guard"],
  ];
  SPECS["arabsstock-assistant"] = {
    wide: {
      w: 1120, h: 760,
      groups: [
        { id: "media", x: 32, y: 40, w: 1056, h: 96, tab: "Media pipelines", co: 6 },
        { id: "assist", x: 32, y: 264, w: 512, h: 424, tab: "Assistant" },
        { id: "ag", x: 48, y: 384, w: 256, h: 280, tab: "14 agents", co: 2 },
        { id: "index", x: 576, y: 264, w: 224, h: 320, tab: "Indexing", co: 4 },
        { id: "serve", x: 832, y: 264, w: 256, h: 344, tab: "Model serving", co: 5 },
      ],
      nodes: [
        { id: "raw", kind: "ext", x: 48, y: 64, w: 184, t: "Raw video & audio", g: "video" },
        { id: "qual", kind: "infra", x: 456, y: 64, w: 192, t: "Quality optimisation", g: "filter" },
        { id: "meta", kind: "data", x: 864, y: 64, w: 208, t: "Metadata enrichment", g: "tag" },
        { id: "plat", kind: "ext", x: 32, y: 168, w: 1056, t: "ArabsStock platform", s: "photos · videos · vectors · audio", g: "frontend" },
        { id: "orch", kind: "orch", x: 88, y: 296, w: 176, t: "Orchestrator", s: "LangGraph", co: 1 },
        { id: "eval", kind: "eval", x: 328, y: 296, w: 200, t: "LLM agent evaluation", s: "accuracy · routing", co: 3 },
        ...rows.map(([id, t, g], i) => ({ id, kind: "agent", x: 64, y: 416 + i * 48, w: 224, h: 40, t, g })),
        { id: "db", kind: "store", x: 336, y: 596, w: 192, h: 64, t: "Platform database" },
        { id: "ing", kind: "infra", x: 592, y: 296, w: 192, t: "Batch ingestion", s: "millions of assets", g: "pipeline" },
        { id: "emb", kind: "model", x: 592, y: 392, w: 192, t: "OpenAI embeddings", g: "embed" },
        { id: "pc", kind: "store", tone: "saffron", x: 592, y: 500, w: 192, h: 64, t: "Pinecone", s: "vector index" },
        ...serving.map(([id, t, g], i) => ({ id, kind: "model", x: 848, y: 296 + i * 60, w: 224, h: 48, t, g })),
      ],
      edges: [
        { id: "m1", from: "raw:r", to: "qual:l", async: true },
        { id: "m2", from: "qual:r", to: "meta:l", async: true },
        { id: "m3", from: "meta:b", to: "plat:t+412", async: true },
        { id: "p1", from: "plat:b-384", to: "orch:t" },
        { id: "p2", from: "plat:b+128", to: "ing:t", async: true },
        { id: "p3", from: "plat:b+424", to: "serve:t+24" },
        { id: "o1", from: "orch:b", to: "ag:t-0" },
        { id: "o2", from: "orch:r", to: "eval:l", async: true },
        { id: "a1", from: "r2:r", to: "pc:l" },
        { id: "a2", from: "r4:r", to: "db:l" },
        { id: "i1", from: "ing:b", to: "emb:t", async: true },
        { id: "i2", from: "emb:b", to: "pc:t", async: true },
      ],
      main: ["p1", "o1", "a1"],
      legend: { x: 32, y: 732 },
    },
  };
}

// ============================================================================ wakeb-multi-agent-chatbot
SPECS["wakeb-multi-agent-chatbot"] = {
  wide: {
    w: 1120, h: 432,
    groups: [
      { id: "lg", x: 616, y: 48, w: 472, h: 224, tab: "LangGraph · fully async" },
      { id: "ag", x: 856, y: 80, w: 216, h: 168, tab: "6 agents", co: 3 },
    ],
    nodes: [
      { id: "user", kind: "ext", x: 32, y: 136, w: 168, t: "User", s: "Arabic · English", g: "bilingual" },
      { id: "nginx", kind: "infra", x: 232, y: 136, w: 152, t: "Nginx", s: "reverse proxy", g: "gateway" },
      { id: "api", kind: "infra", x: 416, y: 136, w: 168, t: "FastAPI services", s: "Docker · gRPC", g: "container", co: 1 },
      { id: "orch", kind: "orch", x: 640, y: 136, w: 184, t: "Command routing", s: "no static edges", co: 2 },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, kind: "agent", x: 876 + (i % 3) * 64, y: 112 + Math.floor(i / 3) * 64, w: 48, h: 48, g: "agents", align: "center" })),
      { id: "qwen", kind: "model", x: 312, y: 336, w: 168, t: "Qwen LLM", s: "vLLM · A100 GPUs", co: 4 },
      { id: "hyb", kind: "data", x: 504, y: 336, w: 240, t: "Hybrid retrieval", s: "vector + BM25 · LLM rerank", co: 5 },
      { id: "brave", kind: "infra", x: 768, y: 336, w: 152, t: "Brave Search", s: "via MCP", g: "tools-mcp", co: 6 },
      { id: "cache", kind: "store", x: 944, y: 332, w: 144, h: 64, t: "Node cache", s: "SQLite", g: "cache", co: 7 },
    ],
    edges: [
      { id: "e1", from: "user:r", to: "nginx:l" },
      { id: "e2", from: "nginx:r", to: "api:l" },
      { id: "e3", from: "api:r", to: "orch:l" },
      { id: "e4", from: "orch:r", to: "ag:l" },
      { id: "t1", from: "lg:b-8", to: "qwen:t", via: { y: 304 } },
      { id: "t2", from: "lg:b-8", to: "hyb:t", via: { y: 304 } },
      { id: "t3", from: "lg:b-8", to: "brave:t", via: { y: 304 } },
      { id: "t4", from: "lg:b-8", to: "cache:t", via: { y: 304 } },
    ],
    main: ["e1", "e2", "e3", "e4", ["t1", "t2", "t3", "t4"]],
    legend: { x: 32, y: 248, w: 288, cols: 2 },
  },
};

// ============================================================================ llm-serving-a100
SPECS["llm-serving-a100"] = {
  wide: {
    w: 1120, h: 352,
    groups: [
      { id: "deliv", x: 32, y: 48, w: 504, h: 104, tab: "Delivery · CI/CD", co: 1 },
      { id: "prod", x: 600, y: 48, w: 264, h: 272, tab: "Production GPU servers", co: 4 },
    ],
    nodes: [
      { id: "git", kind: "infra", x: 48, y: 80, w: 104, t: "Git", g: "branch" },
      { id: "ci", kind: "infra", x: 176, y: 80, w: 160, t: "CI/CD", s: "shell-scripted", g: "pipeline" },
      { id: "img", kind: "infra", x: 360, y: 80, w: 160, t: "Docker images", s: "dev → prod", g: "container" },
      { id: "ver", kind: "store", x: 360, y: 176, w: 160, h: 64, t: "Model versions", s: "Qwen", g: "layers", co: 2 },
      { id: "cfg", kind: "infra", x: 360, y: 264, w: 160, t: "vLLM config", s: "GPU allocation", g: "gpu", co: 3 },
      { id: "s1", kind: "model", x: 624, y: 80, w: 216, t: "GPU server", s: "vLLM · Qwen · A100", g: "serving" },
      { id: "s2", kind: "model", x: 624, y: 160, w: 216, t: "GPU server", s: "vLLM · Qwen · A100", g: "serving" },
      { id: "more", kind: "more", x: 624, y: 240, w: 216, h: 48, t: "more servers", align: "center", g: null },
      { id: "cli", kind: "ext", x: 896, y: 80, w: 192, t: "Chatbot agents", s: "LangGraph", g: "agents" },
      { id: "hm", kind: "eval", x: 896, y: 160, w: 192, t: "Health monitoring", g: "activity", co: 5 },
      { id: "rs", kind: "infra", x: 896, y: 240, w: 192, t: "Automated restart", s: "restart pipelines", g: "refresh", co: 6 },
    ],
    edges: [
      { id: "d1", from: "git:r", to: "ci:l" },
      { id: "d2", from: "ci:r", to: "img:l" },
      { id: "d3", from: "img:r", to: "prod:l-76", label: "deploy" },
      { id: "v1", from: "ver:r", to: "prod:l+24" },
      { id: "c1", from: "cfg:r", to: "prod:l+108" },
      { id: "q1", from: "cli:l", to: "s1:r" },
      { id: "h1", from: "prod:r+4", to: "hm:l", async: true },
      { id: "h2", from: "hm:b", to: "rs:t" },
      { id: "h3", from: "rs:l", to: "prod:r+84" },
    ],
    main: ["d1", "d2", "d3", "h1", "h2", "h3"],
    legend: { x: 40, y: 200, w: 288, cols: 2 },
  },
};

// ============================================================================ empoweromics-message-routing
SPECS["empoweromics-message-routing"] = {
  wide: {
    w: 1120, h: 584,
    groups: [
      { id: "main", x: 24, y: 40, w: 1072, h: 312, tab: "WhatsApp message routing" },
      { id: "etl", x: 24, y: 384, w: 512, h: 120, tab: "ETL", co: 3 },
      { id: "int", x: 552, y: 384, w: 544, h: 120, tab: "Data integration", co: 4 },
    ],
    nodes: [
      { id: "wa", kind: "ext", x: 48, y: 176, w: 192, t: "WhatsApp messages", s: "text · images", g: "whatsapp" },
      { id: "txt", kind: "model", x: 352, y: 136, w: 168, t: "Text classifier", s: "NLP", g: "chat", co: 1 },
      { id: "imc", kind: "model", x: 352, y: 216, w: 168, t: "Image classifier", s: "computer vision", g: "image" },
      { id: "rt", kind: "infra", x: 632, y: 176, w: 152, t: "Route", s: "by department", g: "route", co: 2 },
      ...["Tech", "HR", "Accounting", "Operations", "Marketing"].map((t, i) => ({ id: `d${i}`, kind: "ext", x: 904, y: 80 + i * 52, w: 152, h: 40, t, g: "users" })),
      { id: "cos", kind: "store", x: 40, y: 416, w: 136, h: 64, t: "Cosmos DB", s: "NoSQL" },
      { id: "etlj", kind: "infra", x: 200, y: 420, w: 160, t: "Scheduled ETL", s: "Azure triggers", g: "function" },
      { id: "sql", kind: "store", x: 384, y: 416, w: 136, h: 64, t: "SQL Server", s: "Microsoft" },
      { id: "dev", kind: "ext", x: 568, y: 420, w: 176, t: "3,008+ developers", s: "unique schemas", g: "building" },
      { id: "di", kind: "data", x: 768, y: 420, w: 168, t: "Data integration", g: "merge" },
      { id: "map", kind: "ext", x: 960, y: 420, w: 120, t: "E-map", s: "real-time", g: "map" },
    ],
    edges: [
      { id: "w1", from: "wa:r", to: "txt:l", via: { x: 296 } },
      { id: "w2", from: "wa:r", to: "imc:l", via: { x: 296 } },
      { id: "c1", from: "txt:r", to: "rt:l", via: { x: 576 } },
      { id: "c2", from: "imc:r", to: "rt:l", via: { x: 576 } },
      ...[0, 1, 2, 3, 4].map((i) => ({ id: `r${i}`, from: "rt:r", to: `d${i}:l`, via: { x: 844 } })),
      { id: "x1", from: "cos:r", to: "etlj:l", async: true },
      { id: "x2", from: "etlj:r", to: "sql:l", async: true },
      { id: "y1", from: "dev:r", to: "di:l", async: true },
      { id: "y2", from: "di:r", to: "map:l" },
    ],
    main: [["w1", "w2"], ["c1", "c2"], ["r0", "r1", "r2", "r3", "r4"]],
    legend: { x: 24, y: 556 },
  },
};

// ============================================================================ compact (mobile, 352 wide) variants
// Same facts, linearised top to bottom. Cross-links that would need long detours are left out of the
// compact drawing (they stay in the wide one, the caption and the callouts).
const CW = 352;

SPECS["hybrid-rag"].compact = {
  w: CW, h: 648,
  groups: [{ id: "par", x: 12, y: 104, w: 328, h: 104, tab: "parallel", tabAlign: "center", co: 1 }],
  nodes: [
    { id: "q", kind: "ext", x: 72, y: 24, w: 208, h: 48, t: "Query", g: "user" },
    { id: "bm25", kind: "data", x: 24, y: 128, w: 148, t: "BM25", s: "keyword", g: "keyword" },
    { id: "vec", kind: "data", x: 180, y: 128, w: 148, t: "Dense vector", s: "embeddings", g: "embed" },
    { id: "merge", kind: "data", x: 72, y: 240, w: 208, h: 48, t: "Merge", g: "merge", co: 2 },
    { id: "rr", kind: "data", x: 72, y: 320, w: 208, h: 48, t: "LLM rerank", g: "rerank", co: 3 },
    { id: "ctx", kind: "data", x: 72, y: 400, w: 208, h: 48, t: "Context", g: "file-text" },
    { id: "gen", kind: "model", x: 72, y: 480, w: 208, t: "Generate", s: "LLM", g: "generate", co: 4 },
  ],
  edges: [
    { id: "q1", from: "q:b", to: "bm25:t", via: { y: 88 } },
    { id: "q2", from: "q:b", to: "vec:t", via: { y: 88 } },
    { id: "m1", from: "bm25:b", to: "merge:t", via: { y: 224 } },
    { id: "m2", from: "vec:b", to: "merge:t", via: { y: 224 } },
    { id: "r", from: "merge:b", to: "rr:t" },
    { id: "c", from: "rr:b", to: "ctx:t" },
    { id: "g", from: "ctx:b", to: "gen:t" },
  ],
  main: [["q1", "q2"], ["m1", "m2"], "r", "c", "g"],
  legend: { x: 24, y: 576, w: 304, cols: 2 },
};

SPECS["wakeb-multi-agent-chatbot"].compact = {
  w: CW, h: 1088,
  groups: [
    { id: "lg", x: 12, y: 288, w: 328, h: 308, tab: "LangGraph · async" },
    { id: "ag", x: 72, y: 408, w: 208, h: 168, tab: "6 agents", co: 3 },
  ],
  nodes: [
    { id: "user", kind: "ext", x: 64, y: 24, w: 224, t: "User", s: "Arabic · English", g: "bilingual" },
    { id: "nginx", kind: "infra", x: 64, y: 112, w: 224, t: "Nginx", s: "reverse proxy", g: "gateway" },
    { id: "api", kind: "infra", x: 64, y: 200, w: 224, t: "FastAPI services", s: "Docker · gRPC", g: "container", co: 1 },
    { id: "orch", kind: "orch", x: 64, y: 320, w: 224, t: "Command routing", s: "no static edges", co: 2 },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, kind: "agent", x: 88 + (i % 3) * 64, y: 440 + Math.floor(i / 3) * 64, w: 48, h: 48, g: "agents", align: "center" })),
    { id: "qwen", kind: "model", x: 48, y: 628, w: 280, t: "Qwen LLM", s: "vLLM · A100 GPUs", co: 4 },
    { id: "hyb", kind: "data", x: 48, y: 708, w: 280, t: "Hybrid retrieval", s: "vector + BM25 · LLM rerank", co: 5 },
    { id: "brave", kind: "infra", x: 48, y: 788, w: 280, t: "Brave Search", s: "via MCP", g: "tools-mcp", co: 6 },
    { id: "cache", kind: "store", x: 48, y: 864, w: 280, h: 64, t: "Node cache", s: "SQLite", g: "cache", co: 7 },
  ],
  edges: [
    { id: "e1", from: "user:b", to: "nginx:t" },
    { id: "e2", from: "nginx:b", to: "api:t" },
    { id: "e3", from: "api:b", to: "orch:t" },
    { id: "e4", from: "orch:b", to: "ag:t" },
    { id: "t1", from: "lg:b-148", to: "qwen:l" },
    { id: "t2", from: "lg:b-148", to: "hyb:l" },
    { id: "t3", from: "lg:b-148", to: "brave:l" },
    { id: "t4", from: "lg:b-148", to: "cache:l" },
  ],
  main: ["e1", "e2", "e3", "e4", ["t1", "t2", "t3", "t4"]],
  legend: { x: 24, y: 968, w: 304, cols: 2 },
};

SPECS["llm-serving-a100"].compact = {
  w: CW, h: 912,
  groups: [
    { id: "deliv", x: 12, y: 24, w: 328, h: 144, tab: "Delivery · CI/CD", co: 1 },
    { id: "prod", x: 12, y: 376, w: 296, h: 232, tab: "Production GPU servers", co: 4, coX: 208 },
  ],
  nodes: [
    { id: "git", kind: "infra", tile: true, x: 24, y: 52, w: 88, h: 96, t: "Git", g: "branch" },
    { id: "ci", kind: "infra", tile: true, x: 132, y: 52, w: 88, h: 96, t: "CI/CD", g: "pipeline" },
    { id: "img", kind: "infra", tile: true, x: 240, y: 52, w: 88, h: 96, t: "Docker\nimages", g: "container" },
    { id: "ver", kind: "store", x: 24, y: 200, w: 200, h: 64, t: "Model versions", s: "Qwen", g: "layers", co: 2 },
    { id: "cfg", kind: "infra", x: 24, y: 288, w: 200, t: "vLLM config", s: "GPU allocation", g: "gpu", co: 3 },
    { id: "s1", kind: "model", x: 24, y: 408, w: 272, t: "GPU server", s: "vLLM · Qwen · A100", g: "serving" },
    { id: "s2", kind: "model", x: 24, y: 480, w: 272, t: "GPU server", s: "vLLM · Qwen · A100", g: "serving" },
    { id: "more", kind: "more", x: 24, y: 552, w: 272, h: 40, t: "more servers", align: "center", g: null },
    { id: "hm", kind: "eval", x: 24, y: 640, w: 272, t: "Health monitoring", g: "activity", co: 5 },
    { id: "rs", kind: "infra", x: 24, y: 728, w: 272, t: "Automated restart", s: "restart pipelines", g: "refresh", co: 6 },
  ],
  edges: [
    { id: "d1", from: "git:r", to: "ci:l" },
    { id: "d2", from: "ci:r", to: "img:l" },
    { id: "d3", from: "img:b", to: "prod:t+124", label: "deploy", lt: 0.17 },
    { id: "v1", from: "ver:r", to: "prod:t+124" },
    { id: "c1", from: "cfg:r", to: "prod:t+124" },
    { id: "h1", from: "prod:b", to: "hm:t", async: true },
    { id: "h2", from: "hm:b", to: "rs:t" },
    { id: "h3", from: "rs:r", to: "prod:r", pts: [[328, 756], [328, 492]] },
  ],
  main: ["d1", "d2", "d3", "h1", "h2", "h3"],
  legend: { x: 24, y: 816, w: 304, cols: 2 },
};

SPECS["empoweromics-message-routing"].compact = {
  w: CW, h: 1064,
  groups: [
    { id: "main", x: 12, y: 24, w: 328, h: 432, tab: "WhatsApp message routing" },
    { id: "etl", x: 12, y: 488, w: 160, h: 412, tab: "ETL", co: 3 },
    { id: "int", x: 180, y: 488, w: 160, h: 412, tab: "Data integration", co: 4 },
  ],
  nodes: [
    { id: "wa", kind: "ext", x: 48, y: 56, w: 256, t: "WhatsApp messages", s: "text · images", g: "whatsapp" },
    { id: "txt", kind: "model", tile: true, x: 24, y: 144, w: 148, h: 96, t: "Text classifier", s: "NLP", g: "chat", co: 1 },
    { id: "imc", kind: "model", tile: true, x: 180, y: 144, w: 148, h: 96, t: "Image classifier", s: "computer vision", g: "image" },
    { id: "rt", kind: "infra", x: 72, y: 272, w: 208, t: "Route", s: "by department", g: "route", co: 2 },
    { id: "dep", kind: "ext", x: 48, y: 360, w: 256, h: 72, t: "Departments", s: "Tech · HR · Accounting\nOperations · Marketing", g: "users" },
    { id: "cos", kind: "store", tile: true, x: 24, y: 520, w: 136, h: 104, t: "Cosmos DB", s: "NoSQL", wellTop: 4 },
    { id: "etlj", kind: "infra", tile: true, x: 24, y: 648, w: 136, h: 104, t: "Scheduled ETL", s: "Azure triggers", g: "function", wellTop: 18 },
    { id: "sql", kind: "store", tile: true, x: 24, y: 776, w: 136, h: 104, t: "SQL Server", s: "Microsoft", wellTop: 4 },
    { id: "dev", kind: "ext", tile: true, x: 192, y: 520, w: 136, h: 104, t: "3,008+\ndevelopers", s: "unique schemas", g: "building", wellTop: 12 },
    { id: "di", kind: "data", tile: true, x: 192, y: 648, w: 136, h: 104, t: "Data integration", g: "merge", wellTop: 26 },
    { id: "map", kind: "ext", tile: true, x: 192, y: 776, w: 136, h: 104, t: "E-map", s: "real-time", g: "map", wellTop: 18 },
  ],
  edges: [
    { id: "w1", from: "wa:b", to: "txt:t", via: { y: 128 } },
    { id: "w2", from: "wa:b", to: "imc:t", via: { y: 128 } },
    { id: "c1", from: "txt:b", to: "rt:t", via: { y: 256 } },
    { id: "c2", from: "imc:b", to: "rt:t", via: { y: 256 } },
    { id: "r1", from: "rt:b", to: "dep:t" },
    { id: "x1", from: "cos:b", to: "etlj:t", async: true },
    { id: "x2", from: "etlj:b", to: "sql:t", async: true },
    { id: "y1", from: "dev:b", to: "di:t", async: true },
    { id: "y2", from: "di:b", to: "map:t" },
  ],
  main: [["w1", "w2"], ["c1", "c2"], "r1"],
  legend: { x: 24, y: 940, w: 304, cols: 2 },
};

{
  const rows = [["AI image generation", "image"], ["Content moderation", "shield-check"], ["Semantic search", "search"], ["Integrated AI services", "tools-mcp"], ["Database operations", "database"]];
  const serving = [["Image search", "image"], ["Sound generation", "audio"], ["Instrument classification", "tag"], ["BPM detection", "activity"], ["Audio watermarking", "guard"]];
  SPECS["arabsstock-assistant"].compact = {
    w: CW, h: 1576,
    groups: [
      { id: "media", x: 12, y: 24, w: 328, h: 244, tab: "Media pipelines", co: 6 },
      { id: "assist", x: 12, y: 388, w: 328, h: 516, tab: "Assistant", tabAlign: "right" },
      { id: "ag", x: 24, y: 508, w: 304, h: 280, tab: "14 agents", tabAlign: "right", co: 2 },
      { id: "index", x: 12, y: 936, w: 328, h: 148, tab: "Indexing", co: 4 },
      { id: "serve", x: 12, y: 1116, w: 328, h: 284, tab: "Model serving", co: 5 },
    ],
    nodes: [
      { id: "raw", kind: "ext", x: 48, y: 56, w: 256, h: 48, t: "Raw video & audio", g: "video" },
      { id: "qual", kind: "infra", x: 48, y: 128, w: 256, h: 48, t: "Quality optimisation", g: "filter" },
      { id: "meta", kind: "data", x: 48, y: 200, w: 256, h: 48, t: "Metadata enrichment", g: "tag" },
      { id: "plat", kind: "ext", x: 12, y: 300, w: 328, t: "ArabsStock platform", s: "photos · videos · vectors · audio", g: "frontend" },
      { id: "orch", kind: "orch", x: 24, y: 420, w: 148, t: "Orchestrator", s: "LangGraph", co: 1 },
      { id: "eval", kind: "eval", x: 196, y: 420, w: 132, t: "Evaluation", s: "LLM agents", co: 3 },
      ...rows.map(([t, g], i) => ({ id: `r${i}`, kind: "agent", x: 36, y: 540 + i * 48, w: 280, h: 40, t, g })),
      { id: "db", kind: "store", x: 24, y: 820, w: 148, h: 64, t: "Database", s: "platform" },
      { id: "pc", kind: "store", tone: "saffron", x: 180, y: 820, w: 148, h: 64, t: "Pinecone", s: "vector index" },
      { id: "ing", kind: "infra", tile: true, x: 24, y: 968, w: 136, h: 96, t: "Batch ingestion", s: "millions of assets", g: "pipeline" },
      { id: "emb", kind: "model", tile: true, x: 184, y: 968, w: 140, h: 96, t: "OpenAI\nembeddings", g: "embed" },
      ...serving.map(([t, g], i) => ({ id: `s${i}`, kind: "model", x: 24, y: 1148 + i * 48, w: 304, h: 40, t, g })),
    ],
    edges: [
      { id: "m1", from: "raw:b", to: "qual:t", async: true },
      { id: "m2", from: "qual:b", to: "meta:t", async: true },
      { id: "m3", from: "meta:b", to: "plat:t", async: true },
      { id: "p1", from: "plat:b-78", to: "orch:t" },
      { id: "o2", from: "orch:r", to: "eval:l", async: true },
      { id: "o1", from: "orch:b", to: "ag:t-78" },
      { id: "a2", from: "ag:b-78", to: "db:t" },
      { id: "a1", from: "ag:b+78", to: "pc:t" },
      { id: "i1", from: "ing:r", to: "emb:l", async: true },
      { id: "i2", from: "emb:t", to: "pc:b", async: true },
    ],
    main: ["p1", "o1", "a1"],
    legend: { x: 24, y: 1432, w: 304, cols: 2 },
  };
}

// ============================================================================ thumbnails (16:10, 400 x 250)
// Simplified for case-study cards: bigger shapes, a few mono captions, no legend or callouts.
const TW = 400, TH = 250;
const icon = (o) => ({ align: "center", wl: 32, gs: 18, offgrid: true, ...o });

SPECS["hybrid-rag"].thumb = {
  w: TW, h: TH,
  nodes: [
    icon({ id: "q", kind: "ext", x: 24, y: 100, w: 48, h: 48, g: "user", cap: "query" }),
    icon({ id: "bm", kind: "data", x: 124, y: 56, w: 48, h: 48, g: "keyword", cap: "bm25", capPos: "above" }),
    icon({ id: "vec", kind: "data", x: 124, y: 144, w: 48, h: 48, g: "embed", cap: "dense" }),
    icon({ id: "rr", kind: "data", x: 226, y: 100, w: 48, h: 48, g: "rerank", cap: "rerank" }),
    icon({ id: "gen", kind: "model", x: 328, y: 100, w: 48, h: 48, g: "generate", cap: "generate" }),
  ],
  edges: [
    { id: "a", from: "q:r", to: "bm:l", via: { x: 98 } },
    { id: "b", from: "q:r", to: "vec:l", via: { x: 98 } },
    { id: "c", from: "bm:r", to: "rr:l", via: { x: 200 } },
    { id: "d", from: "vec:r", to: "rr:l", via: { x: 200 } },
    { id: "e", from: "rr:r", to: "gen:l" },
  ],
  main: [["a", "b"], ["c", "d"], "e"],
};

SPECS["arabsstock-assistant"].thumb = {
  w: TW, h: TH,
  groups: [{ id: "ag", x: 124, y: 40, w: 256, h: 112, tab: "14 agents" }],
  nodes: [
    icon({ id: "orch", kind: "orch", x: 28, y: 64, w: 64, h: 64, wl: 36, gs: 20, cap: "langgraph", capGap: 26 }),
    ...Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, kind: "agent", x: 144 + (i % 7) * 32, y: 72 + Math.floor(i / 7) * 36, w: 24, h: 24, rx: 7, g: null, pip: 3, offgrid: true })),
    { id: "pc", kind: "store", tone: "saffron", x: 124, y: 180, w: 124, h: 52, ry: 5, t: "Pinecone", g: "database", offgrid: true },
    { id: "ev", kind: "eval", x: 260, y: 182, w: 120, h: 48, t: "Evaluate", g: "evaluate", offgrid: true },
  ],
  edges: [
    { id: "o", from: "orch:r", to: "ag:l" },
    { id: "p", from: "ag:b-66", to: "pc:t" },
    { id: "e", from: "ag:b+68", to: "ev:t", async: true },
  ],
  main: ["o", "p"],
};

SPECS["wakeb-multi-agent-chatbot"].thumb = {
  w: TW, h: TH,
  groups: [{ id: "ag", x: 116, y: 28, w: 168, h: 104, tab: "6 agents" }],
  nodes: [
    icon({ id: "orch", kind: "orch", x: 24, y: 52, w: 56, h: 56, wl: 34, gs: 20, cap: "command\nrouting", capGap: 24 }),
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, kind: "agent", x: 140 + (i % 3) * 44, y: 52 + Math.floor(i / 3) * 40, w: 32, h: 32, rx: 8, g: "agents", align: "center", wl: 0, well: false, gs: 16, offgrid: true })),
    icon({ id: "qwen", kind: "model", x: 320, y: 52, w: 56, h: 56, wl: 34, gs: 20, g: "generate", cap: "qwen\nvllm", capGap: 24 }),
    icon({ id: "hyb", kind: "data", x: 116, y: 168, w: 44, h: 44, wl: 30, gs: 18, g: "retrieve", cap: "hybrid rag", capGap: 20 }),
    icon({ id: "mcp", kind: "infra", x: 178, y: 168, w: 44, h: 44, wl: 30, gs: 18, g: "tools-mcp", cap: "mcp", capGap: 20 }),
    icon({ id: "cache", kind: "infra", x: 240, y: 168, w: 44, h: 44, wl: 30, gs: 18, g: "cache", cap: "cache", capGap: 20 }),
  ],
  edges: [
    { id: "o", from: "orch:r", to: "ag:l" },
    { id: "q", from: "ag:r", to: "qwen:l" },
    { id: "t1", from: "ag:b", to: "hyb:t", via: { y: 150 } },
    { id: "t2", from: "ag:b", to: "mcp:t", via: { y: 150 } },
    { id: "t3", from: "ag:b", to: "cache:t", via: { y: 150 } },
  ],
  main: ["o", ["q", "t1", "t2", "t3"]],
};

SPECS["llm-serving-a100"].thumb = {
  w: TW, h: TH,
  nodes: [
    icon({ id: "img", kind: "infra", x: 24, y: 104, w: 48, h: 48, g: "container", cap: "docker", capGap: 20 }),
    { id: "srv", kind: "model", x: 116, y: 96, w: 152, h: 64, stack: 2, t: "GPU servers", s: "vLLM · A100", g: "serving", offgrid: true },
    icon({ id: "hm", kind: "eval", x: 328, y: 44, w: 48, h: 48, g: "activity", cap: "health", capPos: "above", capGap: 12 }),
    icon({ id: "rs", kind: "infra", x: 328, y: 164, w: 48, h: 48, g: "refresh", cap: "restart", capGap: 20 }),
  ],
  edges: [
    { id: "d", from: "img:r", to: "srv:l" },
    { id: "h", from: "srv:r-16", to: "hm:l", async: true },
    { id: "r", from: "hm:b", to: "rs:t" },
    { id: "b", from: "rs:l", to: "srv:r+16" },
  ],
  main: ["d", "h", "r", "b"],
};

SPECS["empoweromics-message-routing"].thumb = {
  w: TW, h: TH,
  nodes: [
    icon({ id: "wa", kind: "ext", x: 20, y: 101, w: 48, h: 48, g: "whatsapp", cap: "whatsapp", capGap: 20 }),
    icon({ id: "txt", kind: "model", x: 108, y: 61, w: 48, h: 48, g: "chat", cap: "nlp", capPos: "above" }),
    icon({ id: "img", kind: "model", x: 108, y: 141, w: 48, h: 48, g: "image", cap: "vision", capGap: 20 }),
    icon({ id: "rt", kind: "infra", x: 196, y: 101, w: 48, h: 48, g: "route", cap: "route", capGap: 20 }),
    ...[0, 1, 2, 3, 4].map((i) => icon({ id: `d${i}`, kind: "ext", x: 316, y: 26 + i * 36, w: 64, h: 28, wl: 0, gs: 14, g: "users", offgrid: true })),
  ],
  texts: [{ x: 348, y: 228, text: "5 departments", cls: "dg-cap", anchor: "middle" }],
  edges: [
    { id: "a", from: "wa:r", to: "txt:l", via: { x: 88 } },
    { id: "b", from: "wa:r", to: "img:l", via: { x: 88 } },
    { id: "c", from: "txt:r", to: "rt:l", via: { x: 176 } },
    { id: "d", from: "img:r", to: "rt:l", via: { x: 176 } },
    ...[0, 1, 2, 3, 4].map((i) => ({ id: `r${i}`, from: "rt:r", to: `d${i}:l`, via: { x: 284 } })),
  ],
  main: [["a", "b"], ["c", "d"], ["r0", "r1", "r2", "r3", "r4"]],
};

// ============================================================================ sta-tourism-assistants
// One LangGraph agent behind an audience gate serves both assistants (Noura for visitors, the staff assistant).
// Look-up tools are called directly; tools that change something are reached only through human approval.
// The main path is a visitor's request, so it never lands on a staff tool.
{
  const look = [["r0", "Destinations & events", "location"], ["r1", "Visas & weather", "globe"]];
  const act = [["r2", "Itineraries", "map"], ["r3", "Staff requests", "calendar"]];
  const tab = "96 tools · 27 for visitors";
  SPECS["sta-tourism-assistants"] = {
    wide: {
      w: 1120, h: 464,
      groups: [{ id: "tools", x: 856, y: 88, w: 232, h: 248, tab, co: 3 }],
      nodes: [
        { id: "vis", kind: "ext", x: 32, y: 96, w: 216, t: "Visitors", s: "Noura · Arabic · English", g: "bilingual" },
        { id: "staff", kind: "ext", x: 32, y: 176, w: 216, t: "Staff", s: "staff assistant", g: "briefcase" },
        { id: "gate", kind: "guard", x: 280, y: 136, w: 176, t: "Audience gate", s: "tools · knowledge", co: 1 },
        { id: "eval", kind: "eval", x: 488, y: 40, w: 192, t: "Evaluation", s: "answers · retrieval", co: 6 },
        { id: "agent", kind: "orch", x: 496, y: 136, w: 176, t: "One agent", s: "LangGraph", co: 2 },
        { id: "appr", kind: "guard", x: 632, y: 248, w: 176, t: "Human approval", s: "before any action", g: "check", co: 4 },
        ...look.map(([id, t, g], i) => ({ id, kind: "infra", x: 872, y: 120 + i * 48, w: 200, h: 40, t, g })),
        ...act.map(([id, t, g], i) => ({ id, kind: "infra", x: 872, y: 232 + i * 48, w: 200, h: 40, t, g })),
        { id: "llm", kind: "model", x: 472, y: 376, w: 128, t: "LLM" },
        { id: "ret", kind: "data", x: 632, y: 376, w: 176, t: "Retrieval", s: "with sources", co: 5 },
        { id: "kb", kind: "store", x: 872, y: 372, w: 200, h: 64, t: "Authority content", s: "documents · tourism", g: "file-text" },
      ],
      edges: [
        { id: "v1", from: "vis:r", to: "gate:l", via: { x: 264 } },
        { id: "s1", from: "staff:r", to: "gate:l", via: { x: 264 } },
        { id: "g1", from: "gate:r", to: "agent:l" },
        { id: "t0", from: "agent:r", to: "r0:l", via: { x: 832 } },
        { id: "t1", from: "agent:r", to: "r1:l", via: { x: 832 } },
        { id: "ap", from: "agent:b+16", to: "appr:l" },
        { id: "a0", from: "appr:r", to: "r2:l", via: { x: 832 } },
        { id: "a1", from: "appr:r", to: "r3:l", via: { x: 832 } },
        { id: "l1", from: "agent:b-48", to: "llm:t" },
        { id: "l2", from: "agent:b-48", to: "ret:t", via: { y: 344 } },
        { id: "k1", from: "ret:r", to: "kb:l" },
        { id: "ev", from: "agent:t", to: "eval:b", async: true },
      ],
      main: ["v1", "g1", ["t0", "t1", "ap"], "a0"],
      legend: { x: 32, y: 272, w: 288, cols: 2 },
    },

    // Vertical: the agent's trunk on the left reaches the look-up tools, the LLM and retrieval; the approval's bus on
    // the right reaches the action tools.
    compact: {
      w: CW, h: 1104,
      groups: [{ id: "tools", x: 12, y: 424, w: 328, h: 248, tab, tabAlign: "center", co: 3, coX: 292 }],
      nodes: [
        { id: "vis", kind: "ext", tile: true, x: 24, y: 24, w: 148, h: 104, t: "Visitors", s: "Noura\nArabic · English", g: "bilingual" },
        { id: "staff", kind: "ext", tile: true, x: 180, y: 24, w: 148, h: 104, t: "Staff", s: "staff assistant\ninternal", g: "briefcase" },
        { id: "gate", kind: "guard", x: 24, y: 160, w: 304, t: "Audience gate", s: "tools · knowledge per audience", co: 1 },
        { id: "agent", kind: "orch", x: 24, y: 248, w: 148, t: "One agent", s: "LangGraph", co: 2 },
        { id: "eval", kind: "eval", x: 196, y: 248, w: 132, t: "Evaluation", s: "quality", co: 6 },
        { id: "appr", kind: "guard", x: 56, y: 336, w: 176, t: "Human approval", s: "before any action", g: "check", co: 4 },
        ...look.map(([id, t, g], i) => ({ id, kind: "infra", x: 56, y: 456 + i * 48, w: 240, h: 40, t, g })),
        ...act.map(([id, t, g], i) => ({ id, kind: "infra", x: 56, y: 568 + i * 48, w: 240, h: 40, t, g })),
        { id: "llm", kind: "model", x: 56, y: 704, w: 240, h: 48, t: "LLM" },
        { id: "ret", kind: "data", x: 56, y: 776, w: 240, t: "Retrieval", s: "with sources", co: 5 },
        { id: "kb", kind: "store", x: 56, y: 856, w: 240, h: 64, t: "Authority content", s: "documents · tourism", g: "file-text" },
      ],
      edges: [
        { id: "v1", from: "vis:b", to: "gate:t", via: { y: 144 } },
        { id: "s1", from: "staff:b", to: "gate:t", via: { y: 144 } },
        { id: "g1", from: "gate:b-78", to: "agent:t" },
        { id: "ev", from: "agent:r", to: "eval:l", async: true },
        { id: "ap", from: "agent:b+46", to: "appr:t" },
        { id: "t0", from: "agent:b-62", to: "r0:l" },
        { id: "t1", from: "agent:b-62", to: "r1:l" },
        { id: "a0", from: "appr:r", to: "r2:r", via: { x: 316 } },
        { id: "a1", from: "appr:r", to: "r3:r", via: { x: 316 } },
        { id: "l1", from: "agent:b-62", to: "llm:l" },
        { id: "l2", from: "agent:b-62", to: "ret:l" },
        { id: "k1", from: "ret:b", to: "kb:t" },
      ],
      main: ["v1", "g1", ["t0", "t1", "ap"], "a0"],
      legend: { x: 24, y: 960, w: 304, cols: 2 },
    },

    // Thumbnail: two audiences, the gate, the agent, approval, and the tool set as pips.
    thumb: {
      w: TW, h: TH,
      groups: [{ id: "tools", x: 256, y: 40, w: 124, h: 172, tab: "96 tools" }],
      nodes: [
        icon({ id: "vis", kind: "ext", x: 20, y: 44, w: 40, h: 40, g: "bilingual", cap: "visitors", capPos: "above" }),
        icon({ id: "staff", kind: "ext", x: 20, y: 124, w: 40, h: 40, g: "briefcase", cap: "staff", capGap: 20 }),
        icon({ id: "gate", kind: "guard", x: 84, y: 80, w: 48, h: 48, g: "guard", cap: "audience\ngate", capGap: 20 }),
        icon({ id: "agent", kind: "orch", x: 156, y: 76, w: 56, h: 56, wl: 34, gs: 20, cap: "one agent", capPos: "above", capGap: 16 }),
        icon({ id: "appr", kind: "guard", x: 162, y: 168, w: 44, h: 44, wl: 30, g: "check", cap: "approval", capGap: 20 }),
        ...Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, kind: "infra", x: 274 + (i % 3) * 32, y: 66 + Math.floor(i / 3) * 32, w: 24, h: 24, rx: 7, g: null, pip: 3, offgrid: true })),
      ],
      texts: [{ x: 318, y: 232, text: "27 for visitors", cls: "dg-cap", anchor: "middle" }],
      edges: [
        { id: "v", from: "vis:r", to: "gate:l", via: { x: 72 } },
        { id: "s", from: "staff:r", to: "gate:l", via: { x: 72 } },
        { id: "g", from: "gate:r", to: "agent:l" },
        { id: "t", from: "agent:r", to: "tools:l-22" },
        { id: "ap", from: "agent:b", to: "appr:t" },
        { id: "a", from: "appr:r", to: "tools:l+64" },
      ],
      main: ["v", "g", ["t", "ap"], "a"],
    },
  };
}
