# Mohamed Hatem: knowledge base (test fixture built from _inputs/SOURCES.md, the CV and the GitHub README)

## Identity
- Name: Mohamed Hatem (full name Mohamed Hatem Radwan). Based in Cairo, Egypt. Works remotely with teams in the Gulf
  and the US, in English and Arabic.
- Current role: AI Team Lead at Globant (April 2026 – present, remote).
- Experience: 7 years in data and AI: SQL development, then data science, then building AI platforms in production,
  and now leading an AI engineering team.
- Languages: Arabic (native), English (professional working proficiency).
- Website: https://mohamedhatem.dev

## Contact
- WhatsApp: +20 114 207 0946 (https://wa.me/201142070946)
- Email: hatem@mohamedhatem.dev (professional) or mhatem5351@gmail.com
- LinkedIn: https://www.linkedin.com/in/mohamed-hatem-6a5790173
- GitHub: https://github.com/mhatem5351
- Open to: Senior AI Engineer, MLOps Engineer, AI Agents Engineer, LLM Engineer, ML Engineer and AI Team Lead roles.

## Summary
He designs, ships and runs production LLM systems: multi-agent orchestration (LangGraph), retrieval (RAG), self-hosted
model serving (vLLM on NVIDIA A100 GPUs), and the evaluation and monitoring that keep them honest. Most of what he has
shipped is bilingual (Arabic and English). He is passionate about bilingual Arabic/English AI products.

## Experience
### AI Team Lead, Globant (Apr 2026 – present, remote)
- Leads AI engineering on the STA project: multi-agent LLM orchestration, LLM serving and scalable RAG pipelines in
  production.

### Senior AI & MLOps Engineer, Wakeb Data (WAKEB) (Sep 2024 – Apr 2026, Giza/Cairo, Egypt)
- Architected a fully async, production multi-agent chatbot with LangGraph and Qwen served with vLLM on A100 GPUs:
  six specialised agents, command-based edgeless routing, modular subgraphs, Arabic and English.
- Owned model serving end to end: vLLM configuration, GPU allocation, model versions, health checks and automated
  restarts across the production GPU servers.
- Built hybrid retrieval (vector + BM25 with LLM reranking), SQLite node-level caching and Brave Search over MCP,
  shipped as Dockerized FastAPI services behind Nginx.
- Delivered the second generation of the AIP project's semantic search (better accuracy, faster, image search).
- Built a bilingual enterprise assistant for a Saudi government client with LLM evaluation and
  observability.
- Built the Wakeb Papers Research Agent for academic paper search with agent memory and multi-turn context.
- Migrated key internal APIs from REST to gRPC to cut latency between services.
- Managed CI/CD and containerized deployments (Docker, Git, shell automation).

### AI Engineer, ArabsStock (Apr 2023 – Dec 2024, Dubai, UAE, remote)
- ArabsStock is the largest Arab digital media library (stock photos, videos, vectors).
- Built the Arabsstock Assistant: a 14-agent LangGraph system covering semantic search, AI image generation,
  database operations and content moderation.
- Engineered semantic search (OpenAI embeddings + Pinecone) and visual-similarity search across millions of assets,
  with automated batch ingestion.
- Built model-serving endpoints for image search, sound generation, instrument classification, BPM detection and audio
  watermarking, each a containerized FastAPI microservice.
- Implemented LLM agent evaluation workflows (reliability, accuracy, routing performance).

### Software Engineer (part-time), Tabaqat (Feb 2023 – May 2024, Saudi Arabia, remote)
- Prefect data pipelines for Saudi government GIS data; AWS Athena + DuckDB over Overture Maps; MapProxy, Kepler.gl,
  MapLibre and MBTileServer for map rendering.

### Data Scientist, Empoweromics (Jan 2022 – Mar 2023, Cairo)
- Award: Best Engineer of the Year at Empoweromics.
- Unified data from 3,008+ real-estate developers to scale the company's real-time e-map.
- Lead-lifecycle classification models for broker prioritisation; WhatsApp message classification (text and images)
  routing messages to the right department; a deep-learning gender-detection model from Arabic names (PyTorch); a fuzzy
  "Smart Search" that finds clients despite misspellings.
- ETL from Cosmos DB to SQL Server scheduled with Azure Functions.

### Earlier
- Research Assistant (part-time, remote), The British University in Dubai and Umm Al-Qura University (Mar – Nov 2022):
  mentored M.Sc. students on AI research (text summarization, recommender systems, classification).
- AI Instructor, Military Technical College, Cairo (Aug 2022): AI courses for engineers.
- Freelance Data Scientist, AestheticsPro (US, Feb – Apr 2022): healthcare data scraping and cleaning, SQL Server,
  dashboards.
- SQL Developer, Misria Digital Payments (MDP) (Jan 2020 – Jan 2021, Cairo): stored procedures and performance tuning
  for payment systems.

## Education
- M.Sc. in Data Science, Cairo University (Faculty of Graduate Studies for Statistical Research), Sep 2023 – Sep 2026.
- Diploma in Artificial Intelligence, Information Technology Institute (ITI), 9-month program with EPITA Paris,
  Apr 2021 – Feb 2022.
- B.Eng. in Structural Engineering, Tanta University, 2015 – 2020.

## Certifications
- AWS Certified Machine Learning – Specialty (2022).
- DataCamp: Data Scientist with Python (2021), Data Analyst with SQL Server (2022).
- 365 Data Science: Intro to Tableau. AWS Academy Cloud Foundations.

## Skills
- LLMs & agents: LangGraph, LangChain, OpenAI API, Azure OpenAI, Qwen, vLLM, MCP, Langfuse, prompt engineering, LLM
  evaluation and observability, agent memory.
- Retrieval: Pinecone, Qdrant, pgvector, ChromaDB, hybrid BM25 + dense search, LLM reranking.
- Backend & infra: Python, Go, FastAPI, gRPC, Celery, PostgreSQL, Docker, Kubernetes (AWS EKS), Nginx, CI/CD, Linux.
- ML & data: PyTorch, TensorFlow, scikit-learn, Spark, SQL Server, Prefect, DuckDB, AWS (SageMaker, EC2, S3, Athena),
  Azure (Functions, Cosmos DB, DevOps), GCP.

## Open-source work (GitHub)
- staged-llm-evaluator: a replayable LangGraph pipeline that grades LLM outputs in separate quality, safety and retry
  stages, with the final verdict computed in code. https://github.com/mhatem5351/staged-llm-evaluator
- prompt-reliability-harness: measures how consistently an LLM answers paraphrased, misspelled, reordered or
  distractor-padded prompts. https://github.com/mhatem5351/prompt-reliability-harness
- rag-answering-service: a small FastAPI retrieval service with cosine and dot-product indexes, a prompt-injection
  guardrail and latency / hit-rate metrics. https://github.com/mhatem5351/rag-answering-service
- Arabic sentiment analysis: BiGRU, CNN and classical models on about 455k Arabic texts with AraVec embeddings.
- Text summarization: a Dash app comparing DistilBART, T5 and TextRank (team project, AI diploma).

## Freelance web work
- logic-controls.com: a multilingual industrial-automation company website in 4 languages (English, Arabic RTL,
  Chinese, Turkish) built with Astro, TypeScript and Tailwind CSS on Cloudflare Workers; interactive HMI demo; motion
  design with reduced-motion support; WCAG 2.2 AA (axe-clean); Lighthouse 98–100 mobile and 100 desktop; about 950 unit
  and 900 end-to-end tests; contact form with spam protection and email delivery. Code:
  https://github.com/mhatem5351/logic-controls-website

## This website
- mohamedhatem.dev is built with Astro and runs on Cloudflare Workers. This assistant uses Google Gemini, grounded in
  this knowledge base (no vector database needed: the whole profile fits in the context).
