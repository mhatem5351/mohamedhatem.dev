// Captions, callouts and text descriptions for the case-study diagrams (EN + AR).
// Facts only (CV, LinkedIn, approved GitHub README). Arabic keeps technical terms in Latin script and
// uses Latin digits. The diagrams themselves stay LTR and English on Arabic pages; only this text is
// translated (figure caption, callout list, screen-reader description).
//
// context: [role, company, dates] (render each part in its own <bdi>, joined by " · ", so mixed
// Arabic/Latin parts never merge into one bidi run).
// desc.long: full description of the system (used by the wide and compact SVGs).
// desc.short: the simplified thumbnail.

export const ORDER = ["arabsstock-assistant", "wakeb-multi-agent-chatbot", "llm-serving-a100", "hybrid-rag", "empoweromics-message-routing", "sta-tourism-assistants", "agent-orchestration"];

export const CAPTIONS = {
  "arabsstock-assistant": {
    context: { en: ["AI Engineer", "ArabsStock", "Apr 2023 – Dec 2024"], ar: ["مهندس ذكاء اصطناعي", "ArabsStock", "أبريل 2023 – ديسمبر 2024"] },
    title: {
      en: "ArabsStock Assistant: a 14-agent LangGraph system and the platform's AI services",
      ar: "مساعد ArabsStock: نظام من 14 وكيلًا على LangGraph، إلى جانب خدمات الذكاء الاصطناعي في المنصة",
    },
    caption: {
      en: "The ArabsStock Assistant routes platform requests through a LangGraph orchestrator to 14 specialised agents across five kinds of job, backed by semantic search on Pinecone, containerised model-serving endpoints and media pipelines.",
      ar: "يوجّه مساعد ArabsStock طلبات المنصة عبر منسّق LangGraph إلى 14 وكيلًا متخصصًا في خمسة أنواع من المهام، ويستند إلى بحث دلالي على Pinecone، ونقاط لخدمة النماذج في حاويات، وخطوط لمعالجة الوسائط.",
    },
    desc: {
      long: {
        en: "Architecture diagram. Top: media pipelines take raw video and audio through quality optimisation and metadata enrichment, then deliver it to the ArabsStock platform (photos, videos, vectors and audio). Below the platform are three systems. Assistant: platform requests go to a LangGraph orchestrator, which routes them to 14 specialised agents across five kinds of job: AI image generation, content moderation, semantic search, other platform AI services and database operations. Semantic search queries the Pinecone vector index; database operations use the platform database. An LLM agent evaluation workflow monitors response accuracy, agent routing and reliability. Indexing: platform assets go through automated batch ingestion and OpenAI embeddings into the Pinecone vector index, covering millions of assets. Model serving: five containerised FastAPI microservices serve image search, sound generation, instrument classification, BPM detection and audio watermarking to the platform.",
        ar: "مخطط معماري. في الأعلى: خطوط معالجة الوسائط تنقل الفيديو والصوت الخام عبر تحسين الجودة وإثراء البيانات الوصفية، ثم تسلّمها إلى منصة ArabsStock (صور وفيديو ورسوم متجهة وصوت). وتحت المنصة ثلاثة أنظمة. المساعد: تصل طلبات المنصة إلى منسّق LangGraph، فيوجّهها إلى 14 وكيلًا متخصصًا في خمسة أنواع من المهام: توليد الصور بالذكاء الاصطناعي، والإشراف على المحتوى، والبحث الدلالي، وخدمات ذكاء اصطناعي أخرى في المنصة، وعمليات قواعد البيانات. ويستعلم البحث الدلالي فهرس المتجهات في Pinecone، وتعمل عمليات قواعد البيانات على قاعدة بيانات المنصة، وتراقب عمليات تقييم الوكلاء دقة الإجابات وتوجيه الوكلاء والاعتمادية. الفهرسة: تمر ملفات الوسائط في المنصة بإدخال آلي على دفعات وتضمينات OpenAI حتى فهرس المتجهات في Pinecone، فتغطي ملايين الصور ومقاطع الفيديو والرسوم المتجهة. خدمة النماذج: خمس خدمات FastAPI مصغّرة في حاويات تقدّم للمنصة البحث بالصور، وتوليد الأصوات، وتصنيف الآلات الموسيقية، وكشف الإيقاع (BPM)، والعلامات المائية الصوتية.",
      },
      short: {
        en: "Simplified diagram: a LangGraph orchestrator routes requests to 14 agents, which query a Pinecone vector index; agent behaviour is evaluated.",
        ar: "مخطط مبسّط: منسّق LangGraph يوجّه الطلبات إلى 14 وكيلًا تستعلم فهرس المتجهات في Pinecone، مع تقييم أداء الوكلاء.",
      },
    },
    callouts: [
      { n: 1, term: { en: "Orchestrator", ar: "المنسّق" }, en: "LangGraph routes each request to the right specialised agent.", ar: "يوجّه LangGraph كل طلب إلى الوكيل المتخصص المناسب." },
      { n: 2, term: { en: "Evaluation", ar: "التقييم" }, en: "LLM agent evaluation workflows monitor reliability, response accuracy and agent routing in production.", ar: "عمليات تقييم للوكلاء تراقب الاعتمادية ودقة الإجابات وتوجيه الوكلاء في بيئة الإنتاج." },
      { n: 3, term: { en: "Specialised agents", ar: "الوكلاء المتخصصون" }, en: "14 of them across five kinds of job: semantic search, AI image generation, database operations, content moderation and other platform AI services.", ar: "14 وكيلًا متخصصًا في خمسة أنواع من المهام: البحث الدلالي، وتوليد الصور بالذكاء الاصطناعي، وعمليات قواعد البيانات، والإشراف على المحتوى، وخدمات ذكاء اصطناعي أخرى في المنصة." },
      { n: 4, term: { en: "Semantic search", ar: "البحث الدلالي" }, en: "Automated batch ingestion processes and indexes millions of photos, videos and vectors with OpenAI embeddings in Pinecone.", ar: "إدخال آلي على دفعات يعالج ملايين الصور ومقاطع الفيديو والرسوم المتجهة ويفهرسها بتضمينات OpenAI في Pinecone." },
      { n: 5, term: { en: "AI services", ar: "خدمات الذكاء الاصطناعي" }, en: "Model-serving endpoints for image search, sound generation, instrument classification, BPM detection and audio watermarking, each a containerised FastAPI microservice.", ar: "نقاط لخدمة النماذج: البحث بالصور، وتوليد الأصوات، وتصنيف الآلات الموسيقية، وكشف الإيقاع (BPM)، والعلامات المائية الصوتية، وكلٌّ منها خدمة FastAPI مصغّرة في حاوية." },
      { n: 6, term: { en: "Media pipelines", ar: "خطوط معالجة الوسائط" }, en: "Production pipelines take raw video and audio through quality optimisation and metadata enrichment before distribution on the platform.", ar: "خطوط معالجة في بيئة الإنتاج تمرّر الفيديو والصوت الخام بمرحلتَي تحسين الجودة وإثراء البيانات الوصفية قبل نشرها على المنصة." },
    ],
  },

  "wakeb-multi-agent-chatbot": {
    context: { en: ["Senior AI & MLOps Engineer", "Wakeb Data", "Sep 2024 – Apr 2026"], ar: ["مهندس ذكاء اصطناعي وMLOps أول", "Wakeb Data", "سبتمبر 2024 – أبريل 2026"] },
    title: {
      en: "Multi-agent chatbot: fully async LangGraph with six specialised agents",
      ar: "روبوت محادثة متعدد الوكلاء: ستة وكلاء متخصصين على LangGraph بمعالجة غير متزامنة بالكامل",
    },
    caption: {
      en: "A fully async, bilingual multi-agent chatbot: LangGraph hands off between six specialised agents, routing through LangGraph Command instead of fixed edges, on Qwen served by vLLM on A100 GPUs, with hybrid retrieval, web search over MCP and node-level caching.",
      ar: "روبوت محادثة ثنائي اللغة متعدد الوكلاء، بمعالجة غير متزامنة بالكامل: ينقل LangGraph التحكم بين ستة وكلاء متخصصين بتوجيه عبر Command بدلًا من الحواف الثابتة، ويعتمد على نموذج Qwen المستضاف عبر vLLM على وحدات A100، مع استرجاع هجين، وبحث في الويب عبر MCP، وتخزين مؤقت على مستوى العُقد.",
    },
    desc: {
      long: {
        en: "Architecture diagram. A user writes in Arabic or English. Requests pass through Nginx, a reverse proxy, to Dockerised FastAPI services; key internal APIs use gRPC. Inside a fully async LangGraph graph, routing through LangGraph Command instead of fixed edges hands control between six specialised agents, built as modular subgraphs. The graph calls four back ends: the Qwen LLM served with vLLM on A100 GPUs; hybrid retrieval that combines vector and BM25 search with LLM reranking; Brave Search through MCP; and a SQLite node-level cache.",
        ar: "مخطط معماري. يكتب المستخدم بالعربية أو الإنجليزية. تمر الطلبات عبر Nginx، وهو خادم وسيط عكسي، إلى خدمات FastAPI في حاويات Docker، وتعتمد الواجهات الداخلية الأساسية على gRPC. وداخل مخطط LangGraph غير متزامن بالكامل، ينقل التوجيه عبر Command التحكم بين ستة وكلاء متخصصين مبنيين من مخططات فرعية قابلة للتركيب، دون حواف ثابتة. ويستدعي المخطط أربع خدمات خلفية: نموذج Qwen المستضاف عبر vLLM على وحدات A100، واسترجاعًا هجينًا يجمع البحث المتجهي وBM25 مع إعادة ترتيب بنموذج لغوي، وBrave Search عبر MCP، وذاكرة تخزين مؤقت على مستوى العُقد مبنية على SQLite.",
      },
      short: {
        en: "Simplified diagram: routing through LangGraph Command instead of fixed edges hands off between six agents, which call Qwen on vLLM, hybrid retrieval, MCP tools and a node cache.",
        ar: "مخطط مبسّط: توجيه عبر Command في LangGraph ينقل التحكم بين ستة وكلاء يستدعون Qwen عبر vLLM، والاسترجاع الهجين، وأدوات MCP، وذاكرة تخزين مؤقت للعُقد.",
      },
    },
    callouts: [
      { n: 1, term: { en: "Services", ar: "الخدمات" }, en: "Dockerised FastAPI services behind Nginx; key internal APIs moved from REST to gRPC to cut latency between services.", ar: "خدمات FastAPI في حاويات Docker خلف Nginx، ونُقلت واجهات داخلية أساسية من REST إلى gRPC لتقليل زمن الاستجابة بين الخدمات." },
      { n: 2, term: { en: "Routing", ar: "التوجيه" }, en: "Routing through LangGraph Command instead of fixed edges: control moves between the agents at run time.", ar: "توجيه عبر Command في LangGraph بدلًا من الحواف الثابتة: ينتقل التحكم بين الوكلاء أثناء التشغيل." },
      { n: 3, term: { en: "Agents", ar: "الوكلاء" }, en: "Six specialised agents composed as modular subgraphs, working in Arabic and English.", ar: "ستة وكلاء متخصصين، كلٌّ منهم مخطط فرعي قابل للتركيب، ويعملون بالعربية والإنجليزية." },
      { n: 4, term: { en: "Model", ar: "النموذج" }, en: "Qwen served with vLLM on A100 GPU infrastructure.", ar: "نموذج Qwen مستضاف عبر vLLM على وحدات NVIDIA A100." },
      { n: 5, term: { en: "Retrieval", ar: "الاسترجاع" }, en: "Hybrid search for RAG: vector and BM25 results, reranked by an LLM.", ar: "بحث هجين لأنظمة RAG: يعيد نموذج لغوي ترتيب نتائج البحث المتجهي وBM25." },
      { n: 6, term: { en: "Web search", ar: "البحث في الويب" }, en: "Through the Brave Search MCP integration.", ar: "بتكامل Brave Search عبر MCP." },
      { n: 7, term: { en: "Cache", ar: "التخزين المؤقت" }, en: "SQLite-based node-level caching.", ar: "تخزين مؤقت على مستوى العُقد مبني على SQLite." },
    ],
  },

  "llm-serving-a100": {
    context: { en: ["Senior AI & MLOps Engineer", "Wakeb Data", "Sep 2024 – Apr 2026"], ar: ["مهندس ذكاء اصطناعي وMLOps أول", "Wakeb Data", "سبتمبر 2024 – أبريل 2026"] },
    title: {
      en: "LLM serving on A100 GPUs: the model deployment lifecycle",
      ar: "خدمة النماذج اللغوية على وحدات A100: دورة حياة النشر",
    },
    caption: {
      en: "End-to-end deployment lifecycle for Qwen on vLLM across multiple production A100 GPU servers: CI/CD and containers, model versions, serving configuration and GPU allocation, health monitoring and automated restarts.",
      ar: "دورة حياة كاملة لنشر نماذج Qwen عبر vLLM على عدة خوادم إنتاج بوحدات A100، تشمل الحاويات وCI/CD، وإصدارات النماذج، وإعدادات الخدمة وتوزيع موارد GPU، ومراقبة الحالة وإعادة التشغيل التلقائي.",
    },
    desc: {
      long: {
        en: "Architecture diagram. Delivery: code in Git goes through CI/CD with shell-scripted automation into Docker images, promoted from development to production and deployed to the production GPU servers. Model version management for Qwen and the vLLM serving configuration, including GPU resource allocation, are applied to the same servers. Production: multiple A100 GPU servers, each running vLLM with a Qwen model; two are drawn and a placeholder stands for the rest. The LangGraph chatbot agents send inference requests to them. Health monitoring checks the servers, and automated restart pipelines restart them.",
        ar: "مخطط معماري. التسليم: تنتقل الشيفرة من Git عبر CI/CD، بأتمتة مكتوبة بسكربتات shell، إلى صور Docker تُرقّى من بيئة التطوير إلى بيئة الإنتاج وتُنشر على خوادم GPU في بيئة الإنتاج. وعلى الخوادم نفسها تُدار إصدارات نماذج Qwen وإعدادات الخدمة في vLLM، ومنها توزيع موارد GPU. الإنتاج: عدة خوادم بوحدات A100، يشغّل كلٌّ منها vLLM مع نموذج Qwen، ويُظهر المخطط خادمين وعنصرًا يمثّل البقية. ويرسل وكلاء روبوت المحادثة المبني على LangGraph طلبات الاستدلال إليها، وتفحص مراقبة الحالة الخوادم، وتعيد خطوط إعادة التشغيل التلقائي تشغيلها.",
      },
      short: {
        en: "Simplified diagram: Docker images deploy to vLLM GPU servers on A100s; health monitoring feeds automated restarts.",
        ar: "مخطط مبسّط: تُنشر صور Docker على خوادم GPU بوحدات A100 تشغّل vLLM، وتغذّي مراقبة الحالة إعادة التشغيل التلقائي.",
      },
    },
    callouts: [
      { n: 1, term: { en: "Delivery", ar: "التسليم" }, en: "CI/CD and containerised deployments with Docker, Git and shell-scripted automation, across development and production.", ar: "نشر عبر الحاويات وCI/CD باستخدام Docker وGit وأتمتة بسكربتات shell، في بيئتَي التطوير والإنتاج." },
      { n: 2, term: { en: "Versions", ar: "الإصدارات" }, en: "Model version management for the Qwen models in production.", ar: "إدارة إصدارات نماذج Qwen في بيئة الإنتاج." },
      { n: 3, term: { en: "Serving", ar: "الخدمة" }, en: "vLLM serving configuration and GPU resource allocation.", ar: "إعدادات الخدمة في vLLM وتوزيع موارد GPU." },
      { n: 4, term: { en: "GPU servers", ar: "خوادم GPU" }, en: "Multiple production GPU servers (NVIDIA A100) running vLLM.", ar: "عدة خوادم إنتاج بوحدات NVIDIA A100 تشغّل vLLM." },
      { n: 5, term: { en: "Monitoring", ar: "المراقبة" }, en: "Health monitoring across the GPU servers.", ar: "مراقبة حالة الخدمة عبر خوادم GPU." },
      { n: 6, term: { en: "Recovery", ar: "التعافي" }, en: "Automated restart pipelines.", ar: "خطوط آلية لإعادة التشغيل." },
    ],
  },

  "hybrid-rag": {
    context: { en: ["Retrieval pattern", "RAG systems"], ar: ["نمط استرجاع", "أنظمة RAG"] },
    title: { en: "Hybrid retrieval with LLM reranking", ar: "استرجاع هجين مع إعادة ترتيب بنموذج لغوي" },
    caption: {
      en: "The retrieval pattern behind my RAG work: keyword (BM25) and dense vector search run in parallel, results are merged and reranked by an LLM, and the answer is generated from that context.",
      ar: "نمط الاسترجاع الذي أعتمده في أنظمة RAG: بحث BM25 بالكلمات المفتاحية وبحث بالمتجهات الكثيفة بالتوازي، ثم دمج النتائج وإعادة ترتيبها بنموذج لغوي، ثم توليد الإجابة من هذا السياق.",
    },
    desc: {
      long: {
        en: "Flow diagram. A query is sent in parallel to BM25 keyword search and to dense vector search over embeddings. Their results are merged, reranked by an LLM, and passed as context to an LLM that generates the answer.",
        ar: "مخطط تدفق. يُرسَل الاستعلام بالتوازي إلى بحث BM25 بالكلمات المفتاحية وإلى بحث بالمتجهات الكثيفة عبر التضمينات. تُدمج النتائج ثم يعيد نموذج لغوي ترتيبها، وتُمرَّر سياقًا إلى نموذج لغوي يولّد الإجابة.",
      },
      short: {
        en: "Simplified diagram: BM25 and dense retrieval in parallel, LLM rerank, then generate.",
        ar: "مخطط مبسّط: استرجاع BM25 واسترجاع بالمتجهات بالتوازي، ثم إعادة ترتيب بنموذج لغوي، ثم التوليد.",
      },
    },
    callouts: [
      { n: 1, term: { en: "Retrieve", ar: "الاسترجاع" }, en: "Keyword (BM25) and dense vector retrieval run in parallel.", ar: "يعمل بحث BM25 بالكلمات المفتاحية والبحث بالمتجهات الكثيفة بالتوازي." },
      { n: 2, term: { en: "Merge", ar: "الدمج" }, en: "Both result lists are merged into one candidate set.", ar: "تُدمج قائمتا النتائج في مجموعة واحدة من النتائج المرشّحة." },
      { n: 3, term: { en: "Rerank", ar: "إعادة الترتيب" }, en: "An LLM reranks the candidates before they reach the prompt.", ar: "يعيد نموذج لغوي ترتيب النتائج المرشّحة قبل وصولها إلى الموجّه." },
      { n: 4, term: { en: "Generate", ar: "التوليد" }, en: "The LLM generates the answer from the reranked context.", ar: "يولّد النموذج اللغوي الإجابة من السياق بعد إعادة ترتيبه." },
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
      ar: "تصنيف تلقائي لرسائل WhatsApp، نصوصًا وصورًا، يوجّه كل رسالة إلى القسم المناسب، إلى جانب أعمال ETL وتكامل البيانات التي تغذّي خريطة الشركة الإلكترونية المحدَّثة لحظيًا.",
    },
    desc: {
      long: {
        en: "Architecture diagram in two parts. Message routing: incoming WhatsApp messages are classified, text with an NLP model and images with a computer-vision model, and routed by department to Tech, HR, Accounting, Operations or Marketing. Data engineering: an ETL pipeline moves data from Cosmos DB (NoSQL) to Microsoft SQL Server on scheduled Azure triggers; a data-integration system merges data from 3,008+ real-estate developers, each with its own schema, to feed the real-time e-map.",
        ar: "مخطط معماري من جزأين. توجيه الرسائل: تُصنَّف رسائل WhatsApp الواردة، النصوص بنموذج لمعالجة اللغة الطبيعية والصور بنموذج للرؤية الحاسوبية، ثم تُوجَّه حسب القسم إلى التقنية أو الموارد البشرية أو المحاسبة أو العمليات أو التسويق. هندسة البيانات: ينقل خط ETL البيانات من قاعدة Cosmos DB غير العلائقية إلى Microsoft SQL Server بمشغّلات Azure مجدولة، ويدمج نظام لتكامل البيانات بيانات أكثر من 3,008 من المطوّرين العقاريين، لكلٍّ منهم مخطط بيانات خاص، لتغذية الخريطة الإلكترونية المحدَّثة لحظيًا.",
      },
      short: {
        en: "Simplified diagram: WhatsApp messages are classified with NLP and computer vision, then routed to five departments.",
        ar: "مخطط مبسّط: تُصنَّف رسائل WhatsApp بمعالجة اللغة الطبيعية والرؤية الحاسوبية ثم تُوجَّه إلى خمسة أقسام.",
      },
    },
    callouts: [
      { n: 1, term: { en: "Classification", ar: "التصنيف" }, en: "Messages are classified automatically: text with NLP, images with computer vision.", ar: "تُصنَّف الرسائل تلقائيًا: النصوص بمعالجة اللغة الطبيعية، والصور بالرؤية الحاسوبية." },
      { n: 2, term: { en: "Routing", ar: "التوجيه" }, en: "Each message is routed to Tech, HR, Accounting, Operations or Marketing.", ar: "تُوجَّه كل رسالة إلى التقنية أو الموارد البشرية أو المحاسبة أو العمليات أو التسويق." },
      { n: 3, term: { en: "ETL", ar: "ETL" }, en: "ETL from Cosmos DB (NoSQL) to Microsoft SQL Server, scheduled with Azure Functions triggers.", ar: "عمليات ETL من قاعدة Cosmos DB غير العلائقية إلى Microsoft SQL Server، تجدولها مشغّلات Azure Functions." },
      { n: 4, term: { en: "Data integration", ar: "تكامل البيانات" }, en: "Data from 3,008+ real-estate developers, each with its own schema, merged to scale the real-time e-map.", ar: "دمج بيانات أكثر من 3,008 من المطوّرين العقاريين، لكلٍّ منهم مخطط بيانات خاص، لتوسيع الخريطة الإلكترونية المحدَّثة لحظيًا." },
    ],
  },

  "sta-tourism-assistants": {
    context: { en: ["AI Team Lead", "Globant", "Apr 2026 – present"], ar: ["قائد فريق ذكاء اصطناعي", "Globant", "أبريل 2026 – حتى الآن"] },
    title: {
      en: "Saudi Tourism Authority assistants: one agent for visitors and staff",
      ar: "مساعدا الهيئة السعودية للسياحة: وكيل واحد للزوار والموظفين",
    },
    caption: {
      en: "Two assistants for the Saudi Tourism Authority (STA) run on one LangGraph agent: Noura, for visitors in Arabic and English, and an internal staff assistant. An audience gate sets which tools and knowledge each session may use; typed tools return cards, every booking or order waits for the user's confirmation, and answers cite their sources.",
      ar: "يعمل مساعدان للهيئة السعودية للسياحة (STA) على وكيل LangGraph واحد: «نورة» للزوار بالعربية والإنجليزية، و«مساعد الموظفين» الداخلي. تحدد طبقة الصلاحيات الأدوات والمعرفة المتاحة لكل جلسة، وتعيد الأدوات المحددة الأنواع نتائجها في بطاقات، وينتظر كل حجز أو طلب تأكيد المستخدم، وتذكر الإجابات مصادرها.",
    },
    desc: {
      long: {
        en: "Architecture diagram. Two audiences come in: visitors, who use Noura in Arabic or English, and the authority's staff, who use the staff assistant. Both pass through an audience gate, which decides which tools and which knowledge the session may use, so a visitor never reaches staff tools or data. The gate hands the request to one LangGraph agent. The agent calls typed tools that return cards: 96 tools, 27 of them visible to visitors. Look-up tools (destinations and events, visas and weather) are called directly. Tools that book or order something (itineraries, and staff requests such as meeting rooms, leave and office coffee orders) are reached only through human approval: every booking or order waits for the user's confirmation. The agent also searches the authority's own documents and tourism content, and its answers cite their sources. Evaluation scores answer quality and retrieval.",
        ar: "مخطط معماري. يدخل جمهوران: الزوار الذين يستخدمون «نورة» بالعربية أو الإنجليزية، وموظفو الهيئة الذين يستخدمون «مساعد الموظفين». يمر الطرفان عبر طبقة الصلاحيات التي تحدد الأدوات والمعرفة التي يحق للجلسة استخدامها، فلا يصل الزائر أبدًا إلى أدوات الموظفين أو بياناتهم. تسلّم الطبقة الطلب إلى وكيل LangGraph واحد. يستدعي الوكيل أدوات محددة الأنواع تعيد نتائجها في بطاقات: 96 أداة، منها 27 متاحة للزوار. تُستدعى أدوات الاستعلام (الوجهات والفعاليات، والتأشيرات والطقس) مباشرةً، أما الأدوات التي تحجز أو تطلب شيئًا (خطط الرحلات، وطلبات الموظفين مثل حجز قاعات الاجتماعات والإجازات وطلبات قهوة المكتب) فلا يُوصَل إليها إلا عبر الموافقة البشرية: كل حجز أو طلب ينتظر تأكيد المستخدم. ويبحث الوكيل أيضًا في وثائق الهيئة ومحتواها السياحي، وتذكر إجاباته مصادرها. ويقيس التقييم جودة الإجابات ودقة الاسترجاع.",
      },
      short: {
        en: "Simplified diagram: visitors and staff pass an audience gate to one agent, which calls a set of 96 tools, 27 of them for visitors; bookings and orders wait for human approval.",
        ar: "مخطط مبسّط: يمر الزوار والموظفون عبر طبقة الصلاحيات إلى وكيل واحد يستدعي 96 أداة، منها 27 للزوار، وينتظر كل حجز أو طلب الموافقة البشرية.",
      },
    },
    callouts: [
      { n: 1, term: { en: "Audience gate", ar: "طبقة الصلاحيات" }, en: "Decides which tools and which knowledge each session may use, so a visitor never reaches staff tools or data.", ar: "تحدد الأدوات والمعرفة التي يحق لكل جلسة استخدامها، فلا يصل الزائر أبدًا إلى أدوات الموظفين أو بياناتهم." },
      { n: 2, term: { en: "One agent", ar: "وكيل واحد" }, en: "A single LangGraph agent serves both Noura and the staff assistant, and works by calling tools.", ar: "وكيل LangGraph واحد يخدم «نورة» و«مساعد الموظفين» معًا، ويعمل باستدعاء الأدوات." },
      { n: 3, term: { en: "Evaluation", ar: "التقييم" }, en: "Evaluation scores answer quality and retrieval.", ar: "يقيس التقييم جودة الإجابات ودقة الاسترجاع." },
      { n: 4, term: { en: "Human approval", ar: "الموافقة البشرية" }, en: "Every booking or order waits for the user's confirmation.", ar: "كل حجز أو طلب ينتظر تأكيد المستخدم." },
      { n: 5, term: { en: "Typed tools", ar: "أدوات محددة الأنواع" }, en: "96 tools, 27 of them visible to visitors, each returning a card: destinations and events, visas, weather, itineraries, and staff requests such as meeting rooms, leave and office coffee orders.", ar: "96 أداة، منها 27 متاحة للزوار، تعيد كلٌّ منها بطاقة: الوجهات والفعاليات، والتأشيرات، والطقس، وخطط الرحلات، وطلبات الموظفين مثل حجز قاعات الاجتماعات والإجازات وطلبات قهوة المكتب." },
      { n: 6, term: { en: "Search with citations", ar: "البحث مع ذكر المصادر" }, en: "Answers come from the authority's own documents and tourism content, and cite their sources.", ar: "تأتي الإجابات من وثائق الهيئة ومحتواها السياحي، وتذكر مصادرها." },
    ],
  },
};

// A pattern, drawn only as a thumbnail (the home page's multi-agent capability card); no callouts.
CAPTIONS["agent-orchestration"] = {
  context: { en: ["Orchestration pattern", "Multi-agent systems"], ar: ["نمط تنسيق", "الأنظمة متعددة الوكلاء"] },
  title: { en: "Multi-agent orchestration: a router and modular subgraphs", ar: "تنسيق متعدد الوكلاء: توجيه ومخططات فرعية قابلة للتركيب" },
  caption: {
    en: "The pattern behind my multi-agent work: a LangGraph router hands each request to the right subgraph agent, an LLM writes the answer, and evaluation checks it.",
    ar: "النمط الذي أعتمده في الأنظمة متعددة الوكلاء: يوجّه LangGraph كل طلب إلى الوكيل المناسب في مخطط فرعي، ويكتب نموذج لغوي الإجابة، ثم يتحقق منها التقييم.",
  },
  desc: {
    long: {
      en: "Pattern diagram. A request reaches a LangGraph router, which hands it to one of several subgraph agents: search, tools over MCP, or data. The agents' results go to an LLM that writes the answer, and evaluation checks it.",
      ar: "مخطط نمط. يصل الطلب إلى طبقة توجيه مبنية على LangGraph تسلّمه إلى أحد عدة وكلاء في مخططات فرعية: البحث، أو الأدوات عبر MCP، أو البيانات. تذهب نتائج الوكلاء إلى نموذج لغوي يكتب الإجابة، ويتحقق منها التقييم.",
    },
    short: {
      en: "Simplified diagram: a router hands a request to subgraph agents (search, MCP tools, data); an LLM answers and evaluation checks it.",
      ar: "مخطط مبسّط: طبقة توجيه تسلّم الطلب إلى وكلاء في مخططات فرعية للبحث وأدوات MCP والبيانات، ثم يجيب نموذج لغوي ويتحقق التقييم من الإجابة.",
    },
  },
  callouts: [],
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
