/**
 * English UI and section copy for mohamedhatem.dev. This file is the source of truth for keys; `ar.ts` must mirror
 * every key (the `Messages` type enforces it).
 *
 * - Facts (title, numbers, roles, bullets, case studies) live in `../profile.ts`, not here. Components compose
 *   the hero from `profile.basics.tagline` / `.intro` and these labels.
 * - Site copy speaks in the first person ("I build"). The chat widget refers to him as "Hatem".
 * - `{name}` placeholders are filled with `format()`; `Plural` objects with `pluralize()` (see ./types.ts).
 * - Meta titles are <= 60 characters and descriptions <= 155 (checked in content/README.md's QA step).
 */
import { plural, type Widen } from "./types";

export const en = {
  locale: {
    /** BCP 47 tag for `<html lang>`. */
    code: "en",
    /** Text direction for `<html dir>`. */
    dir: "ltr",
    /** Open Graph locale. */
    ogLocale: "en_US",
    /** Locale for Intl date/number formatting ("Sep 2024"). */
    intl: "en-US",
    /** This language's name in itself. */
    name: "English",
  },

  meta: {
    siteName: "Mohamed Hatem",
    titleSeparator: " · ",
    home: {
      title: "Mohamed Hatem · AI Team Lead, LLM & Multi-Agent Systems",
      description:
        "AI Team Lead at Globant with 7 years in data and AI. Multi-agent LangGraph systems, RAG and vLLM serving on A100s, in Arabic and English.",
    },
    caseStudy: {
      /** Filled with the case study's `shortTitle`. */
      title: "{title} · Mohamed Hatem",
    },
    cv: {
      title: "CV · Mohamed Hatem, AI Team Lead",
      description:
        "CV of Mohamed Hatem, AI Team Lead at Globant: 7 years in data and AI, multi-agent LLM systems, RAG and vLLM serving. Read it here or download the PDF.",
    },
    notFound: {
      title: "Page not found · Mohamed Hatem",
      description: "This page doesn't exist. Go back to Mohamed Hatem's portfolio or ask his AI assistant.",
    },
    privacy: {
      title: "Privacy · Mohamed Hatem",
      description:
        "What mohamedhatem.dev collects and what it doesn't: the AI assistant, the contact form, cookieless analytics and the one optional session cookie.",
    },
    ogImageAlt: "Mohamed Hatem, AI Team Lead at Globant, builds multi-agent LLM systems for production",
  },

  a11y: {
    skipToContent: "Skip to content",
    mainNav: "Main",
    footerNav: "Footer",
    breadcrumb: "Breadcrumb",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    opensInNewTab: "(opens in a new tab)",
    heroGraph:
      "Diagram: an orchestrator agent passes work to retrieve, rerank, guard, evaluate and generate agents, with signals moving along the connections.",
    caseDiagram: "Architecture diagram for {title}. The same components are listed below.",
    profilePhoto: "Portrait of Mohamed Hatem",
    logo: "{name} logo",
    skillsTable: "Skills table, scrolls sideways",
  },

  nav: {
    home: "Home",
    work: "Work",
    experience: "Experience",
    projects: "Projects",
    skills: "Skills",
    education: "Education",
    about: "About",
    assistant: "Ask AI",
    contact: "Contact",
    cv: "CV",
  },

  language: {
    label: "Language",
    /** Link to the other locale, written in that language. */
    switchTo: "العربية",
    switchToLabel: "Read this page in Arabic",
    /** Footer link to the other locale, written in that language. */
    otherVersion: "النسخة العربية",
  },

  theme: {
    label: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  },

  motion: {
    pause: "Pause animations",
    play: "Play animations",
  },

  hero: {
    greeting: "Hi, I'm",
    availability: "Open to new roles",
    localTime: "{time} in Cairo",
    ctaAsk: "Ask my AI assistant",
    ctaContact: "Get in touch",
    ctaWork: "See my work",
    ctaCv: "Download CV",
    scrollCue: "Scroll for more",
    /** The "Ask my AI" input in the hero: it opens the assistant with the typed question. */
    ask: {
      label: "Ask my AI assistant about my work",
      placeholder: "Ask my AI about my work",
      submit: "Ask",
      /** Prefix for the example question shown in the other language, written in that language. */
      otherLanguage: "اسأل بالعربية",
    },
    /** Caption under the live agent graph. */
    graphCaption: "A request flowing through the agents I build. Select a node.",
    graph: {
      orchestrator: "orchestrator",
      retrieve: "retrieve",
      rerank: "rerank",
      guard: "guard",
      evaluate: "evaluate",
      generate: "generate",
    },
  },

  metrics: {
    eyebrow: "At a glance",
    title: "The scale, in numbers",
    lead: "Every figure is sourced from my CV, LinkedIn or public code. Where a client hasn't published a number, I describe what the system does instead.",
    /** Label of the employer logo row under the metric strip. */
    logosLabel: "Shipped at",
  },

  /** Home section 01: what I build (capability cards). */
  capabilities: {
    eyebrow: "What I build",
    title: "Production AI, from the agent graph down to the GPU.",
    lead: "I own the whole path: how agents route, what they retrieve, where the model runs, and how we know the answers are right.",
    agents: {
      title: "Multi-agent LLM systems",
      body: "LangGraph orchestration with command-based routing and modular subgraphs: from a 6-agent bilingual chatbot to a 14-agent assistant for a stock-media platform.",
      stack: "LangGraph · LangChain · MCP · OpenAI API · Qwen · async Python",
    },
    retrieval: {
      title: "Retrieval and search",
      body: "Hybrid vector + BM25 retrieval with LLM reranking, and semantic and visual search over millions of media assets.",
      stack: "Pinecone · Qdrant · pgvector · OpenAI embeddings",
    },
    serving: {
      title: "LLM serving and MLOps",
      body: "Qwen on A100 GPUs with vLLM: model versions, GPU allocation, health checks and automated restarts. Dockerised FastAPI and gRPC services, CI/CD.",
      stack: "vLLM · Docker · Kubernetes (EKS) · Nginx · gRPC",
    },
    evaluation: {
      title: "Evaluation and observability",
      body: "LLM evaluation, tracing and monitoring, so we know a model is right before users find out it isn't.",
      stack: "Langfuse · staged evaluators · reliability harnesses",
    },
    bilingual: {
      title: "Arabic and English",
      body: "Most of what I have shipped is bilingual: Arabic and English in the same product, from retrieval and search to the interface.",
      stack: "Arabic NLP · RTL interfaces · bilingual search",
    },
    frontend: {
      title: "Front end, too",
      body: "Accessible, fast, multilingual sites with Astro, TypeScript and Tailwind CSS, including Arabic RTL. See the showcase below.",
      stack: "Astro · TypeScript · Tailwind CSS · Cloudflare Workers",
    },
  },

  /** Home section 06: the logic-controls.com front-end showcase. */
  showcase: {
    eyebrow: "Front-end craft",
    title: "I ship the front end too, to the same standard.",
    /** `{site}` is the linked domain. */
    lead: "Freelance: {site}, the site of an industrial-automation company in Egypt, in English, Arabic (RTL), Chinese and Turkish, with an interactive HMI demo.",
    stats: {
      languages: { value: "4", label: "languages, including Arabic right-to-left" },
      lighthouse: { value: "98–100", label: "Lighthouse on mobile, 100 on desktop" },
      tests: { value: "~950 + ~900", label: "unit and end-to-end tests in CI, across Chrome, Android and iPhone Safari" },
      wcag: { value: "AA", label: "WCAG 2.2, axe-clean, with reduced-motion support" },
    },
    stack: "Astro · TypeScript · Tailwind CSS · Cloudflare Workers · Turnstile",
    visit: "Visit the site",
    source: "Source",
    devicesLabel: "logic-controls.com on a laptop and a phone",
  },

  work: {
    eyebrow: "Selected work",
    title: "Systems I've built and run",
    lead: "Work since 2022, from multi-agent assistants to data pipelines. Client details stay at the level each employer allows.",
    moreTitle: "More work",
    labels: {
      problem: "The problem",
      approach: "Approach",
      architecture: "Architecture",
      outcome: "Outcome",
      figures: "Key figures",
      stack: "Stack",
      context: "Context",
      contribution: "My part",
      period: "When",
    },
    readCase: "Read the case study",
    allWork: "All work",
    nextCase: "Next case study",
    prevCase: "Previous case study",
    viewLive: "Visit the site",
    viewCode: "View the code",
    freelance: "Freelance",
    architectureNote:
      "Diagrams show the components named in public descriptions of the work. They are simplified, not complete system maps.",
    briefNote: "The implementation details of this system aren't public. This summary covers what can be shared.",
    noPublicFigure: "No public figure",
    legend: {
      user: "Users and apps",
      orchestrator: "Orchestration",
      agent: "Agents",
      model: "Models",
      retrieval: "Retrieval",
      data: "Data",
      service: "Services",
      pipeline: "Pipelines",
      quality: "Quality",
      infra: "Infrastructure",
    },
    /** Case-study detail pages. */
    page: {
      ask: "Ask my AI about this project",
      /** Sent to the assistant from the case-study page. */
      askQuestion: "Tell me about “{title}”: what was built, and what was Hatem's part?",
      seeArchitecture: "See the architecture",
      backToWork: "Back to all work",
      keepReading: "Keep reading",
      decision: "Decision",
      decisionSource: "Source: {sources}",
      capabilityView: "Capability view",
      componentView: "Component view",
      onThisPage: "On this page",
      role: "Role",
      company: "Company",
      location: "Where",
      links: "Links",
      figure: "Figure {n}",
      textDescription: "Text description of the diagram",
      components: "Components",
      connections: "Connections",
      connection: "{from} to {to}",
      sourcesTitle: "Where these facts come from",
      sourcesBody: "Everything on this page comes from {sources}. Nothing is estimated: where no figure is public, the page describes what the system does.",
      sources: {
        cv: "my CV",
        linkedin: "my LinkedIn profile",
        github: "my GitHub profile and repositories",
        "logic-controls": "the Logic Controls project and its public repository",
        mohamed: "details I confirmed for this site",
      },
      ctaEyebrow: "Questions about this build?",
      ctaTitle: "Ask my AI about “{title}”.",
      ctaBody: "It answers from my CV and public profile, in English or Arabic.",
      ctaContact: "Contact me",
      ctaWrite: "or write to",
      duringRole: "During the {company} role",
    },
  },

  experience: {
    eyebrow: "Career",
    title: "Experience",
    lead: "7 years, from SQL at a payments company to leading AI engineering at Globant.",
    present: "Present",
    dateRange: "{start} – {end}",
    earlierTitle: "Earlier roles",
    showEarlier: "Show earlier roles",
    hideEarlier: "Hide earlier roles",
    employmentType: {
      "full-time": "Full-time",
      "part-time": "Part-time",
      freelance: "Freelance",
    },
    workMode: {
      remote: "Remote",
      hybrid: "Hybrid",
      "on-site": "On-site",
    },
    duration: {
      years: plural({ one: "{count} yr", other: "{count} yrs" }),
      months: plural({ one: "{count} mo", other: "{count} mos" }),
      /** Joins years and months, e.g. "1 yr 8 mos". */
      join: "{years} {months}",
    },
    tech: "Tech",
    caseStudy: "Case study",
    award: "Award",
    /** The trace view (roles as spans on one timeline). */
    trace: {
      roleColumn: "Role",
      now: "now",
      fullTime: "Full-time",
      partTime: "Part-time or freelance",
      study: "Study",
      keyboardHint: "Use ↑ ↓ to move between roles, Enter to open.",
      type: "type",
      location: "where",
      courses: "courses",
      notes: "notes",
    },
  },

  projects: {
    eyebrow: "Code",
    title: "Open source and client work",
    lead: "Small, focused tools for LLM work: grading outputs, testing prompt reliability, serving retrieval. Each README says what the code does and what it doesn't.",
    kinds: {
      llm: "LLM tooling",
      ml: "ML & NLP",
      web: "Client site",
      coursework: "Coursework",
    },
    viewRepo: "Code",
    viewLive: "Live site",
    license: "{license} licence",
    teamProject: "Team project",
    archiveTitle: "Where I started",
    archiveLead: "Coursework from my AI diploma (2021–22), kept public as a record.",
    allRepos: "All repositories on GitHub",
  },

  skills: {
    eyebrow: "Toolbox",
    title: "What I work with",
    lead: "Grouped by the job each tool does. Endorsement counts are from LinkedIn.",
    endorsements: plural({ one: "{count} endorsement on LinkedIn", other: "{count} endorsements on LinkedIn" }),
    assessmentPassed: "Passed the LinkedIn skill assessment",
    usedIn: "Used in",
    /** The "skills with receipts" matrix: rows are skills, columns are where they were used. */
    matrix: {
      title: "Skills, with receipts",
      lead: "Every dot marks where I used the skill for real: in a role, in freelance work or in a public repository.",
      caption: "Skills by where they were used. A filled dot means the skill was used in that role or project.",
      skill: "Skill",
      yes: "yes",
      columns: {
        globant: "Globant",
        wakeb: "Wakeb",
        arabsstock: "ArabsStock",
        tabaqat: "Tabaqat",
        empoweromics: "Empoweromics",
        earlier: "Freelance & earlier",
        oss: "Open source",
      },
      groups: {
        agents: "Agents and LLMs",
        retrieval: "Retrieval",
        serving: "Serving and MLOps",
        quality: "Quality",
        data: "Data and ML",
      },
      rows: {
        multiAgent: "Multi-agent orchestration",
        langgraph: "LangGraph",
        mcp: "MCP tool integration",
        openai: "OpenAI API",
        rag: "RAG pipelines",
        hybrid: "Hybrid BM25 + dense, LLM reranking",
        semantic: "Semantic and visual search",
        serving: "LLM serving (vLLM, GPUs)",
        fastapi: "FastAPI microservices",
        docker: "Docker, CI/CD",
        prefect: "Workflow orchestration (Prefect)",
        evaluation: "LLM evaluation and monitoring",
        frontendQa: "Accessibility and testing (front end)",
        nlp: "NLP (Arabic and English)",
        vision: "Computer vision and audio ML",
        etl: "ETL and SQL",
        cloud: "Cloud (AWS, Azure, Cloudflare)",
      },
      earlierNote: "Freelance & earlier: Logic Controls (front end), AestheticsPro, Misria Digital Payments.",
      allTitle: "The full toolbox",
    },
  },

  education: {
    eyebrow: "Learning",
    title: "Education & certifications",
    degrees: "Education",
    certifications: "Certifications",
    honors: "Honours",
    languages: "Languages",
    coursework: "Coursework",
    earned: "Earned {date}",
    /** Appended to the end year of a degree in progress: "2023 – 2027 (expected)". */
    expected: "{year} (expected)",
    inProgress: "In progress",
  },

  about: {
    eyebrow: "About",
    title: "About me",
    basedIn: "Based in",
    timeZone: "Time zone",
    openTo: "Open to",
    workArrangements: "Work arrangements",
    languages: "Languages",
  },

  cv: {
    title: "CV",
    lead: "My experience in brief, generated from the same data as this site.",
    download: "Download CV",
    downloadPdf: "Download PDF",
    downloadLabel: "Download Mohamed Hatem's CV as a PDF",
    otherLanguagePdf: "Arabic version (PDF)",
    print: "Print",
    copyLink: "Copy link",
    linkCopied: "Link copied",
    updated: "Updated {date}",
    fileInfo: "PDF, {size}",
    sections: {
      summary: "Summary",
      experience: "Experience",
      skills: "Skills",
      projects: "Selected projects",
      education: "Education",
      certifications: "Certifications",
      awards: "Awards",
      languages: "Languages",
      openTo: "Open to",
      contact: "Contact",
    },
    earlierRoles: "Earlier roles",
    backToSite: "Back to the portfolio",
    /** Focus line in the CV header, after the title and employer. */
    focus: "Multi-agent LLM systems, RAG, LLM serving",
    /** Short label of the download button on narrow screens. */
    pdfShort: "PDF",
    footer: "Case studies, code and an AI assistant that answers questions about my work: mohamedhatem.dev",
  },

  assistant: {
    eyebrow: "AI assistant",
    title: "Ask about my work",
    lead: "My assistant has read my CV, LinkedIn and GitHub. Ask it about my experience, or paste a job description to check the fit. It answers in English or Arabic.",
    howItWorks:
      "How it works: one knowledge file, a Cloudflare Worker and Google Gemini. No vector database; the whole profile fits in the model's context.",
    open: "Start a conversation",
    howBuilt: "How it's built",
    flowLabel: "How the assistant works",
    flow: {
      question: { title: "Your question", detail: "chat widget, EN or AR" },
      worker: { title: "Worker", detail: "Cloudflare, /api/chat, rate-limited" },
      model: { title: "Gemini", detail: "whole profile in context, no vector DB" },
      answer: { title: "Answer", detail: "streamed back as it is written" },
    },
  },

  chat: {
    launcher: "Ask AI",
    launcherLabel: "Open Hatem's AI assistant",
    title: "Hatem's AI assistant",
    subtitle: "Answers from his CV, LinkedIn and GitHub",
    greeting:
      "Hi! I'm Hatem's AI assistant. Ask me about his work, his stack, or whether he fits a role. You can paste a job description too.",
    suggestionsTitle: "Try asking",
    inputLabel: "Your question",
    placeholder: "Ask about Hatem's experience…",
    jdHint: "Tip: paste a job description and ask “Is he a fit?”",
    send: "Send",
    stop: "Stop",
    retry: "Try again",
    newChat: "New conversation",
    close: "Close assistant",
    minimize: "Minimise",
    copy: "Copy answer",
    copied: "Copied",
    you: "You",
    assistant: "Assistant",
    thinking: "Thinking…",
    charCount: "{count} / {max}",
    disclaimer: "AI answers can be wrong. Check anything important with Hatem directly.",
    privacy:
      "Your messages are sent to Google's Gemini API, and Google may use them to improve its services. Please don't share personal or confidential information.",
    contactPrompt: "Prefer to talk to Hatem?",
    contactEmail: "Email him",
    contactWhatsApp: "WhatsApp",
    feedback: {
      helpful: "Helpful",
      notHelpful: "Not helpful",
      thanks: "Thanks for the feedback",
    },
    srNewReply: "New reply from the assistant",
    noscript: "The assistant needs JavaScript. You can still reach Hatem by email or WhatsApp.",
    errors: {
      empty: "Type a question first.",
      tooLong: "That message is too long. Please keep it under {max} characters.",
      network: "You seem to be offline. Check your connection and try again.",
      rateLimited: "That's a lot of questions in a short time. Please wait a minute and try again.",
      timeout: "The answer took too long. Please try again.",
      server: "The assistant hit a problem and couldn't answer. Please try again, or contact Hatem directly.",
      unavailable: "The assistant is offline right now. You can still reach Hatem by email or WhatsApp.",
    },
  },

  contact: {
    eyebrow: "Contact",
    title: "Let's talk",
    lead: "Hiring for an AI, LLM or MLOps role, or planning a project? WhatsApp and email are the quickest ways to reach me. The form sends straight to my inbox.",
    localTime: "It's {time} in Cairo right now.",
    /** Sentence after the lead with an inline button that opens the assistant. */
    askFirst: { before: "Or", action: "ask my AI", after: "first." },
    channels: {
      email: { title: "Email", action: "Write an email" },
      whatsapp: { title: "WhatsApp", action: "Message me on WhatsApp" },
      linkedin: { title: "LinkedIn", action: "Connect on LinkedIn" },
      github: { title: "GitHub", action: "Read my code" },
    },
    copyEmail: "Copy email address",
    emailCopied: "Email address copied",
    /** Pre-filled WhatsApp message (URL-encode before use). */
    whatsappPrefill: "Hi Hatem, I found you through mohamedhatem.dev. ",
    /** Default subject for mailto links. */
    emailSubject: "Hello from mohamedhatem.dev",
    form: {
      title: "Or send a message",
      lead: "I reply from {email}.",
      required: "Required",
      optional: "Optional",
      name: { label: "Your name", placeholder: "" },
      email: { label: "Email", placeholder: "you@company.com", hint: "I'll reply to this address." },
      company: { label: "Company", placeholder: "" },
      topic: {
        label: "What's it about?",
        placeholder: "Choose one",
        options: {
          role: "A job opportunity",
          project: "A project or consulting",
          collaboration: "Speaking or collaboration",
          other: "Something else",
        },
      },
      message: {
        label: "Message",
        placeholder: "A few lines about the role or the project…",
        hint: "{min} to {max} characters.",
      },
      honeypot: "Leave this field empty",
      turnstile: "This form is protected by Cloudflare Turnstile.",
      submit: "Send message",
      sending: "Sending…",
    },
    errors: {
      summary: plural({ one: "Please fix 1 field below.", other: "Please fix {count} fields below." }),
      nameRequired: "Please enter your name.",
      nameTooLong: "Please keep your name under {max} characters.",
      emailRequired: "Please enter your email address.",
      emailInvalid: "That email address doesn't look right. Please check it (for example, name@company.com).",
      companyTooLong: "Please keep the company name under {max} characters.",
      topicRequired: "Please choose a topic.",
      messageRequired: "Please write a message.",
      messageTooShort: "Please write at least {min} characters.",
      messageTooLong: "Please keep your message under {max} characters.",
      turnstile: "The spam check didn't finish. Please let it complete, then send again.",
      rateLimited: "Too many messages in a short time. Please try again in a few minutes.",
      server: "Something went wrong and your message wasn't sent. Please email {email} or message me on WhatsApp.",
      network: "You seem to be offline. Your message wasn't sent; please try again.",
    },
    success: {
      title: "Message sent",
      body: "Thanks, {name}. Your message is in my inbox, and I'll reply to {email}.",
      /** Shown under the body with the Worker's reference (e.g. MH-261009-7K3QX). */
      reference: "Reference: {ref}",
      again: "Send another message",
    },
  },

  footer: {
    builtWith: "Built with Astro and Tailwind CSS, served by Cloudflare Workers. The assistant runs on Google Gemini.",
    sourceCode: "Source code",
    copyright: "© {year} Mohamed Hatem",
    lastUpdated: "Last updated {date}",
    backToTop: "Back to top",
    summary: "AI Team Lead at Globant. Multi-agent LLM systems, RAG and LLM serving. Cairo, working remotely.",
    columns: {
      site: "Site",
      elsewhere: "Elsewhere",
      thisSite: "This site",
    },
    changeTheme: "Change theme",
    privacy: "Privacy",
  },

  notFound: {
    code: "404",
    title: "This page doesn't exist",
    body: "The link may be old or mistyped. Head back to the home page, or ask the assistant what you were looking for.",
    home: "Back to home",
    ask: "Ask the assistant",
    pathLabel: "Requested path",
  },

  /** /privacy/: what the site processes. Facts mirror worker/README.md ("Security model"). */
  privacy: {
    title: "Privacy",
    lead: "What this site collects, what it doesn't, and where your messages go. Short version: no tracking cookies, no ads, no profiles.",
    updated: "Last updated {date}",
    sections: {
      assistant: {
        title: "The AI assistant",
        body: [
          "Your questions are sent from your browser to this site's Cloudflare Worker, which passes the conversation (the last few messages) to Google's Gemini API to write the answer.",
          "The site uses the free tier of the Gemini API, and on that tier Google may use the messages it receives to improve its services. Please don't share personal or confidential information in the chat.",
          "The Worker doesn't log or store what you write. It records anonymous numbers for capacity planning: how many answers, how long they took, how long the messages were, which model answered, the reply language and the country, never your IP address or your text.",
          "Your conversation is kept in your browser's session storage so it survives a page change, and it is gone when you close the tab.",
        ],
      },
      contact: {
        title: "The contact form",
        body: [
          "When you send the form, your name, email address, company (optional), topic and message are emailed to me through Cloudflare Email Routing, with your address as the reply-to. The site keeps no copy; it only counts that a message was sent.",
          "WhatsApp and email links open your own apps; what you send there is between you and those services.",
        ],
      },
      spam: {
        title: "Spam protection",
        body: [
          "The contact form and the assistant use Cloudflare Turnstile, which checks that a real browser is there, usually without a puzzle. Cloudflare processes the signals it needs for that check and doesn't use them for advertising. Requests are also rate-limited per IP address; the site uses the address for that count only and doesn't log it.",
        ],
      },
      cookies: {
        title: "Cookies and storage",
        body: [
          "There are no tracking or advertising cookies. The site sets one cookie, and only if you use the assistant: after the spam check, a short-lived session token (it lasts 30 minutes, two hours at most, and is sent only to the chat endpoint) so you aren't checked again for every question.",
          "Your browser also remembers your theme, whether you paused the animation, and whether you've seen the assistant's label, in local storage on your device.",
        ],
      },
      analytics: {
        title: "Analytics",
        body: [
          "Visits are counted with Cloudflare Web Analytics, which uses no cookies and doesn't build a profile of you or follow you across sites.",
        ],
      },
      questions: {
        title: "Questions",
        body: ["Email {email} with any question about this page or to ask for anything you sent to be deleted from my inbox."],
      },
    },
  },

  common: {
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Couldn't copy. Please select the text and copy it manually.",
    close: "Close",
    loading: "Loading…",
    showMore: "Show more",
    showLess: "Show less",
  },

  /** Sharing images (site/scripts/og.mjs) and machine-readable summaries (llms.txt). */
  seo: {
    /** Focus areas on the home sharing image, shown as "A · B · C". */
    ogFocus: ["Multi-agent LLM systems", "RAG", "LLM serving"],
  },
} as const;

/** Shape every locale must match (string literals widened to `string`). */
export type Messages = Widen<typeof en>;

export default en;
