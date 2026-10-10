// Captions, callouts and text descriptions for the case-study diagrams (EN + AR).
// Facts only (CV, LinkedIn, approved GitHub README). Arabic keeps technical terms in Latin script and
// uses Latin digits. The diagrams themselves stay LTR and English on Arabic pages; only this text is
// translated (figure caption, callout list, screen-reader description).
//
// context: [role, company, dates] (render each part in its own <bdi>, joined by " · ", so mixed
// Arabic/Latin parts never merge into one bidi run).
// desc.long: full description of the system (used by the wide and compact SVGs).
// desc.short: the simplified thumbnail.

export const ORDER = ["arabsstock-assistant", "wakeb-multi-agent-chatbot", "llm-serving-a100", "hybrid-rag", "empoweromics-message-routing"];

export const CAPTIONS = {
  "arabsstock-assistant": {
    context: { en: ["AI Engineer", "ArabsStock", "Apr 2023 – Dec 2024"], ar: ["مهندس ذكاء اصطناعي", "ArabsStock", "أبريل 2023 – ديسمبر 2024"] },
    title: {
      en: "ArabsStock Assistant: a 14-agent LangGraph system and the platform's AI services",
      ar: "مساعد ArabsStock: نظام من 14 وكيلًا مبني على LangGraph وخدمات الذكاء الاصطناعي في المنصة",
    },
    caption: {
      en: "The Arabsstock Assistant routes platform requests through a LangGraph orchestrator to 14 specialised agents, backed by semantic search on Pinecone, containerized model-serving endpoints and media pipelines.",
      ar: "يوجّه مساعد Arabsstock طلبات المنصة عبر منسّق LangGraph إلى 14 وكيلًا متخصصًا، مدعومًا ببحث دلالي على Pinecone ونقاط خدمة نماذج داخل حاويات ومسارات لمعالجة الوسائط.",
    },
    desc: {
      long: {
        en: "Architecture diagram. Top: media pipelines take raw video and audio through quality optimisation and metadata enrichment, then deliver it to the ArabsStock platform (photos, videos, vectors and audio). Below the platform are three systems. Assistant: platform requests go to a LangGraph orchestrator, which routes them to 14 specialised agents grouped by capability: AI image generation, content moderation, semantic search, integrated AI services and database operations. Semantic search queries the Pinecone vector index; database operations use the platform database. An LLM agent evaluation workflow monitors response accuracy, agent routing and reliability. Indexing: platform assets go through automated batch ingestion and OpenAI embeddings into the Pinecone vector index, covering millions of assets. Model serving: five containerized FastAPI microservices serve image search, sound generation, instrument classification, BPM detection and audio watermarking to the platform.",
        ar: "مخطط معماري. في الأعلى: مسارات معالجة الوسائط تنقل الفيديو والصوت الخام عبر تحسين الجودة وإثراء البيانات الوصفية، ثم تسلّمها إلى منصة ArabsStock (صور وفيديو ورسوم متجهة وصوت). تحت المنصة ثلاثة أنظمة. المساعد: تصل طلبات المنصة إلى منسّق LangGraph الذي يوجّهها إلى 14 وكيلًا متخصصًا مجمّعين حسب القدرة: توليد الصور بالذكاء الاصطناعي، والإشراف على المحتوى، والبحث الدلالي، وخدمات الذكاء الاصطناعي المدمجة، وعمليات قواعد البيانات. يستعلم البحث الدلالي فهرس المتجهات في Pinecone، وتعمل عمليات قواعد البيانات على قاعدة بيانات المنصة. ويراقب مسار لتقييم وكلاء LLM دقة الإجابات وتوجيه الوكلاء والاعتمادية. الفهرسة: تمر أصول المنصة عبر إدخال آلي على دفعات وتضمينات OpenAI إلى فهرس المتجهات في Pinecone، لتغطي ملايين الأصول. خدمة النماذج: خمس خدمات FastAPI مصغّرة داخل حاويات تقدّم للمنصة البحث بالصور وتوليد الأصوات وتصنيف الآلات الموسيقية وكشف الإيقاع (BPM) والعلامات المائية الصوتية.",
      },
      short: {
        en: "Simplified diagram: a LangGraph orchestrator routes requests to 14 agents, which query a Pinecone vector index; agent behaviour is evaluated.",
        ar: "مخطط مبسّط: منسّق LangGraph يوجّه الطلبات إلى 14 وكيلًا تستعلم فهرس المتجهات في Pinecone، مع تقييم أداء الوكلاء.",
      },
    },
    callouts: [
      { n: 1, en: "LangGraph orchestrator: routes each request to the right specialised agent.", ar: "منسّق LangGraph: يوجّه كل طلب إلى الوكيل المتخصص المناسب." },
      { n: 2, en: "14 specialised agents covering semantic search, AI image generation, database operations, content moderation and integrated AI services.", ar: "14 وكيلًا متخصصًا تغطي البحث الدلالي وتوليد الصور بالذكاء الاصطناعي وعمليات قواعد البيانات والإشراف على المحتوى وخدمات الذكاء الاصطناعي المدمجة." },
      { n: 3, en: "LLM agent evaluation workflows monitor reliability, response accuracy and agent routing in production.", ar: "مسارات لتقييم وكلاء LLM تراقب الاعتمادية ودقة الإجابات وتوجيه الوكلاء في بيئة الإنتاج." },
      { n: 4, en: "Semantic search pipeline: automated batch ingestion processes and indexes millions of photos, videos and vectors with OpenAI embeddings in Pinecone.", ar: "مسار البحث الدلالي: إدخال آلي على دفعات يعالج ملايين الصور ومقاطع الفيديو والرسوم المتجهة ويفهرسها بتضمينات OpenAI في Pinecone." },
      { n: 5, en: "Model-serving endpoints for image search, sound generation, instrument classification, BPM detection and audio watermarking, each a containerized FastAPI microservice.", ar: "نقاط خدمة نماذج للبحث بالصور وتوليد الأصوات وتصنيف الآلات الموسيقية وكشف الإيقاع (BPM) والعلامات المائية الصوتية، كلٌّ منها خدمة FastAPI مصغّرة داخل حاوية." },
      { n: 6, en: "Production pipelines take raw video and audio through quality optimisation and metadata enrichment before distribution on the platform.", ar: "مسارات إنتاج تعالج الفيديو والصوت الخام عبر تحسين الجودة وإثراء البيانات الوصفية قبل نشرها على المنصة." },
    ],
  },

  "wakeb-multi-agent-chatbot": {
    context: { en: ["Senior AI & MLOps Engineer", "Wakeb Data", "Sep 2024 – Apr 2026"], ar: ["مهندس أول للذكاء الاصطناعي وMLOps", "Wakeb Data", "سبتمبر 2024 – أبريل 2026"] },
    title: {
      en: "Multi-agent chatbot: fully async LangGraph with six specialised agents",
      ar: "روبوت محادثة متعدد الوكلاء: LangGraph غير متزامن بالكامل بستة وكلاء متخصصين",
    },
    caption: {
      en: "A fully async, bilingual multi-agent chatbot: LangGraph hands off between six specialised agents with Command-based edgeless routing, on Qwen served by vLLM on A100 GPUs, with hybrid retrieval, web search over MCP and node-level caching.",
      ar: "روبوت محادثة ثنائي اللغة متعدد الوكلاء وغير متزامن بالكامل: ينقل LangGraph التحكم بين ستة وكلاء متخصصين بتوجيه قائم على Command دون حواف ثابتة، فوق نموذج Qwen الذي يخدّمه vLLM على معالجات A100، مع استرجاع هجين وبحث في الويب عبر MCP وتخزين مؤقت على مستوى العُقد.",
    },
    desc: {
      long: {
        en: "Architecture diagram. A user writes in Arabic or English. Requests pass through Nginx, a reverse proxy, to Dockerized FastAPI services; key internal APIs use gRPC. Inside a fully async LangGraph graph, Command-based routing with no static edges hands control between six specialised agents, built as modular subgraphs. The graph calls four back ends: the Qwen LLM served with vLLM on A100 GPUs; hybrid retrieval that combines vector and BM25 search with LLM reranking; Brave Search through MCP; and a SQLite node-level cache.",
        ar: "مخطط معماري. يكتب المستخدم بالعربية أو الإنجليزية. تمر الطلبات عبر Nginx، وهو وكيل عكسي، إلى خدمات FastAPI داخل حاويات Docker، وتستخدم الواجهات الداخلية الأساسية gRPC. داخل رسم LangGraph غير متزامن بالكامل، ينقل التوجيه القائم على Command، دون حواف ثابتة، التحكم بين ستة وكلاء متخصصين مبنيين كرسوم فرعية قابلة للتركيب. ويستدعي الرسم أربع خدمات خلفية: نموذج Qwen الذي يخدّمه vLLM على معالجات A100، واسترجاعًا هجينًا يجمع بحث المتجهات وBM25 مع إعادة ترتيب بواسطة LLM، وBrave Search عبر MCP، وذاكرة تخزين مؤقت على مستوى العُقد مبنية على SQLite.",
      },
      short: {
        en: "Simplified diagram: Command-based routing in LangGraph hands off between six agents, which call Qwen on vLLM, hybrid retrieval, MCP tools and a node cache.",
        ar: "مخطط مبسّط: توجيه قائم على Command في LangGraph ينقل التحكم بين ستة وكلاء يستدعون Qwen عبر vLLM والاسترجاع الهجين وأدوات MCP وذاكرة تخزين مؤقت للعُقد.",
      },
    },
    callouts: [
      { n: 1, en: "Dockerized FastAPI services behind Nginx; key internal APIs moved from REST to gRPC to cut latency between services.", ar: "خدمات FastAPI داخل حاويات Docker خلف Nginx، مع نقل واجهات داخلية أساسية من REST إلى gRPC لتقليل زمن الاستجابة بين الخدمات." },
      { n: 2, en: "Command-based edgeless routing: control moves between agents through LangGraph Command instead of fixed graph edges.", ar: "توجيه دون حواف ثابتة قائم على Command: ينتقل التحكم بين الوكلاء عبر Command في LangGraph بدلًا من حواف ثابتة في الرسم البياني." },
      { n: 3, en: "Six specialised agents composed as modular subgraphs, working in Arabic and English.", ar: "ستة وكلاء متخصصين مبنيون كرسوم فرعية (subgraphs) قابلة للتركيب، ويعملون بالعربية والإنجليزية." },
      { n: 4, en: "Qwen served with vLLM on A100 GPU infrastructure.", ar: "نموذج Qwen يخدّمه vLLM على بنية تحتية من معالجات A100." },
      { n: 5, en: "Hybrid search for RAG: vector and BM25 results, reranked by an LLM.", ar: "بحث هجين لـ RAG: نتائج المتجهات وBM25 يعيد LLM ترتيبها." },
      { n: 6, en: "Web search through the Brave Search MCP integration.", ar: "بحث في الويب عبر تكامل Brave Search باستخدام MCP." },
      { n: 7, en: "SQLite-based node-level caching.", ar: "تخزين مؤقت على مستوى العُقد مبني على SQLite." },
    ],
  },

  "llm-serving-a100": {
    context: { en: ["Senior AI & MLOps Engineer", "Wakeb Data", "Sep 2024 – Apr 2026"], ar: ["مهندس أول للذكاء الاصطناعي وMLOps", "Wakeb Data", "سبتمبر 2024 – أبريل 2026"] },
    title: {
      en: "LLM serving on A100 GPUs: the model deployment lifecycle",
      ar: "خدمة نماذج LLM على معالجات A100: دورة حياة نشر النماذج",
    },
    caption: {
      en: "End-to-end deployment lifecycle for Qwen on vLLM across multiple production A100 GPU servers: CI/CD and containers, model versions, serving configuration and GPU allocation, health monitoring and automated restarts.",
      ar: "دورة حياة كاملة لنشر نماذج Qwen عبر vLLM على عدة خوادم إنتاج بمعالجات A100: CI/CD والحاويات، وإصدارات النماذج، وإعدادات الخدمة وتوزيع موارد GPU، ومراقبة الصحة وإعادة التشغيل الآلية.",
    },
    desc: {
      long: {
        en: "Architecture diagram. Delivery: code in Git goes through CI/CD with shell-scripted automation into Docker images, promoted from development to production and deployed to the production GPU servers. Model version management for Qwen and the vLLM serving configuration, including GPU resource allocation, are applied to the same servers. Production: multiple A100 GPU servers, each running vLLM with a Qwen model; two are drawn and a placeholder stands for the rest. The LangGraph chatbot agents send inference requests to them. Health monitoring checks the servers, and automated restart pipelines restart them.",
        ar: "مخطط معماري. التسليم: تمر الشيفرة من Git عبر CI/CD بأتمتة مكتوبة بسكربتات shell إلى صور Docker، تُرقّى من بيئة التطوير إلى بيئة الإنتاج وتُنشر على خوادم GPU الإنتاجية. وتُطبَّق على الخوادم نفسها إدارة إصدارات نماذج Qwen وإعدادات الخدمة في vLLM، بما فيها توزيع موارد GPU. الإنتاج: عدة خوادم بمعالجات A100، يشغّل كلٌّ منها vLLM مع نموذج Qwen؛ يظهر في المخطط خادمان وعنصر يمثّل البقية. يرسل وكلاء روبوت المحادثة المبني على LangGraph طلبات الاستدلال إليها. وتفحص مراقبة الصحة الخوادم، وتعيد مسارات إعادة التشغيل الآلية تشغيلها.",
      },
      short: {
        en: "Simplified diagram: Docker images deploy to vLLM GPU servers on A100s; health monitoring feeds automated restarts.",
        ar: "مخطط مبسّط: تُنشر صور Docker على خوادم GPU بمعالجات A100 تعمل بـ vLLM، وتغذّي مراقبة الصحة إعادة التشغيل الآلية.",
      },
    },
    callouts: [
      { n: 1, en: "CI/CD and containerized deployments with Docker, Git and shell-scripted automation, across development and production.", ar: "CI/CD ونشر عبر الحاويات باستخدام Docker وGit وأتمتة بسكربتات shell، في بيئتي التطوير والإنتاج." },
      { n: 2, en: "Model version management for the Qwen models in production.", ar: "إدارة إصدارات نماذج Qwen في بيئة الإنتاج." },
      { n: 3, en: "vLLM serving configuration and GPU resource allocation.", ar: "إعدادات الخدمة في vLLM وتوزيع موارد GPU." },
      { n: 4, en: "Multiple production GPU servers (NVIDIA A100) running vLLM.", ar: "عدة خوادم إنتاج بمعالجات NVIDIA A100 تعمل بـ vLLM." },
      { n: 5, en: "Health monitoring across the GPU servers.", ar: "مراقبة صحة الخدمة عبر خوادم GPU." },
      { n: 6, en: "Automated restart pipelines.", ar: "مسارات آلية لإعادة التشغيل." },
    ],
  },

  "hybrid-rag": {
    context: { en: ["Retrieval pattern", "RAG systems"], ar: ["نمط استرجاع", "أنظمة RAG"] },
    title: { en: "Hybrid retrieval with LLM reranking", ar: "استرجاع هجين مع إعادة ترتيب بواسطة LLM" },
    caption: {
      en: "The retrieval pattern behind my RAG work: keyword (BM25) and dense vector search run in parallel, results are merged and reranked by an LLM, and the answer is generated from that context.",
      ar: "نمط الاسترجاع وراء أعمالي في RAG: بحث بالكلمات المفتاحية (BM25) وبحث بالمتجهات الكثيفة بالتوازي، ثم دمج النتائج وإعادة ترتيبها بواسطة LLM، وتوليد الإجابة من هذا السياق.",
    },
    desc: {
      long: {
        en: "Flow diagram. A query is sent in parallel to BM25 keyword search and to dense vector search over embeddings. Their results are merged, reranked by an LLM, and passed as context to an LLM that generates the answer.",
        ar: "مخطط تدفق. يُرسَل الاستعلام بالتوازي إلى بحث BM25 بالكلمات المفتاحية وإلى بحث بالمتجهات الكثيفة عبر التضمينات. تُدمج النتائج ثم يعيد LLM ترتيبها، وتُمرَّر سياقًا إلى LLM يولّد الإجابة.",
      },
      short: {
        en: "Simplified diagram: BM25 and dense retrieval in parallel, LLM rerank, then generate.",
        ar: "مخطط مبسّط: استرجاع BM25 واسترجاع بالمتجهات بالتوازي، ثم إعادة ترتيب بواسطة LLM، ثم التوليد.",
      },
    },
    callouts: [
      { n: 1, en: "Keyword (BM25) and dense vector retrieval run in parallel.", ar: "يعمل البحث بالكلمات المفتاحية (BM25) والبحث بالمتجهات الكثيفة بالتوازي." },
      { n: 2, en: "Both result lists are merged into one candidate set.", ar: "تُدمج قائمتا النتائج في مجموعة مرشحين واحدة." },
      { n: 3, en: "An LLM reranks the candidates before they reach the prompt.", ar: "يعيد LLM ترتيب المرشحين قبل وصولهم إلى الموجِّه (prompt)." },
      { n: 4, en: "The LLM generates the answer from the reranked context.", ar: "يولّد LLM الإجابة من السياق بعد إعادة ترتيبه." },
    ],
  },

  "empoweromics-message-routing": {
    context: { en: ["Data Scientist", "Empoweromics", "Jan 2022 – Mar 2023"], ar: ["عالم بيانات", "Empoweromics", "يناير 2022 – مارس 2023"] },
    title: {
      en: "WhatsApp message routing and data integration at Empoweromics",
      ar: "توجيه رسائل WhatsApp وتكامل البيانات في Empoweromics",
    },
    caption: {
      en: "Automatic classification of WhatsApp messages (text and images) routes each message to the right department, alongside the ETL and data-integration work behind the company's real-time e-map.",
      ar: "تصنيف تلقائي لرسائل WhatsApp (نصوص وصور) يوجّه كل رسالة إلى القسم المناسب، إلى جانب أعمال ETL وتكامل البيانات التي تغذّي الخريطة الإلكترونية الفورية للشركة.",
    },
    desc: {
      long: {
        en: "Architecture diagram in two parts. Message routing: incoming WhatsApp messages are classified, text with an NLP model and images with a computer-vision model, and routed by department to Tech, HR, Accounting, Operations or Marketing. Data engineering: an ETL pipeline moves data from Cosmos DB (NoSQL) to Microsoft SQL Server on scheduled Azure triggers; a data-integration system merges data from 3,008+ real-estate developers, each with its own schema, to feed the real-time e-map.",
        ar: "مخطط معماري من جزأين. توجيه الرسائل: تُصنَّف رسائل WhatsApp الواردة، النصوص بنموذج NLP والصور بنموذج رؤية حاسوبية، ثم تُوجَّه حسب القسم إلى التقنية أو الموارد البشرية أو المحاسبة أو العمليات أو التسويق. هندسة البيانات: ينقل مسار ETL البيانات من Cosmos DB (NoSQL) إلى Microsoft SQL Server وفق مشغّلات Azure مجدولة، ويدمج نظام لتكامل البيانات بيانات أكثر من 3,008 مطوّرين عقاريين، لكلٍّ منهم مخطط بيانات خاص، لتغذية الخريطة الإلكترونية الفورية.",
      },
      short: {
        en: "Simplified diagram: WhatsApp messages are classified with NLP and computer vision, then routed to five departments.",
        ar: "مخطط مبسّط: تُصنَّف رسائل WhatsApp بمعالجة اللغة الطبيعية والرؤية الحاسوبية ثم تُوجَّه إلى خمسة أقسام.",
      },
    },
    callouts: [
      { n: 1, en: "Messages are classified automatically: text with NLP, images with computer vision.", ar: "تُصنَّف الرسائل تلقائيًا: النصوص بمعالجة اللغة الطبيعية (NLP) والصور بالرؤية الحاسوبية." },
      { n: 2, en: "Each message is routed to Tech, HR, Accounting, Operations or Marketing.", ar: "تُوجَّه كل رسالة إلى التقنية أو الموارد البشرية أو المحاسبة أو العمليات أو التسويق." },
      { n: 3, en: "ETL from Cosmos DB (NoSQL) to Microsoft SQL Server, scheduled with Azure Functions triggers.", ar: "عمليات ETL من Cosmos DB (NoSQL) إلى Microsoft SQL Server، مجدولة بمشغّلات Azure Functions." },
      { n: 4, en: "Data from 3,008+ real-estate developers, each with its own schema, merged to scale the real-time e-map.", ar: "دمج بيانات أكثر من 3,008 مطوّرين عقاريين، لكلٍّ منهم مخطط بيانات خاص، لتوسيع الخريطة الإلكترونية الفورية." },
    ],
  },
};

// Legend labels for an HTML legend (optional; the SVG legend stays English like the diagram).
export const LEGEND = {
  orch: { en: "orchestrator", ar: "المنسّق" },
  agent: { en: "agent", ar: "وكيل" },
  data: { en: "retrieval · data", ar: "استرجاع · بيانات" },
  model: { en: "model · LLM", ar: "نموذج · LLM" },
  eval: { en: "evaluation", ar: "تقييم" },
  guard: { en: "guard · safety", ar: "حماية · أمان" },
  infra: { en: "service · infra", ar: "خدمة · بنية تحتية" },
  store: { en: "store", ar: "مخزن بيانات" },
  ext: { en: "external", ar: "خارجي" },
  request: { en: "request", ar: "طلب" },
  batch: { en: "batch · background", ar: "دفعات · في الخلفية" },
  note: { en: "note", ar: "ملاحظة" },
};
