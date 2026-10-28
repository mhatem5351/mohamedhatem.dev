/**
 * mohamedhatem.dev: the structured profile every page renders from.
 *
 * Rules (see content/README.md):
 * - Every fact-bearing item carries `source`: the input file(s) that state it ("cv", "linkedin", "github",
 *   "logic-controls"). The first entry is the primary source. Nothing here is invented; where no number exists,
 *   the text describes what a system does instead.
 * - Human-language fields are `L10n` objects ({ en, ar }) in this one file, so a fact and its translation are
 *   edited together and the compiler rejects a missing locale. Brand names, product names and technical terms stay
 *   in Latin script in Arabic; digits are Western (0-9) in both locales.
 * - Site copy is first person ("I build..."); experience and case-study bullets are verb-first in English and
 *   verbal-noun style (masdar) in Arabic, which reads naturally in an Arabic CV and avoids a grammatical person.
 * - Dates are ISO 8601 (`YYYY-MM` or `YYYY`); format them per locale with Intl
 *   (`en-US` and `ar-EG-u-nu-latn`, which keeps Western digits).
 */

/* ------------------------------------------------------------------------------------------------------------ */
/* Core types                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------ */

/** Site locales. English is the default (`/`); Arabic is served under `/ar/` with `dir="rtl"`. */
export type Locale = "en" | "ar";

/** All site locales, default first. */
export const LOCALES: readonly Locale[] = ["en", "ar"];

/**
 * Human-language text in both locales.
 * `ar` is natural Modern Standard Arabic written for the same reader, not a word-for-word translation.
 */
export interface L10n {
  /** English text. */
  readonly en: string;
  /** Arabic text: MSA, Western digits, technical terms and brand names in Latin script. */
  readonly ar: string;
}

/**
 * Input file that states a fact.
 * - `cv`: `_inputs/cv.pdf` (Oct 2026).
 * - `linkedin`: `_inputs/linkedin-experience.snapshot.yml` plus the About / extras quoted in `_inputs/SOURCES.md`.
 * - `github`: `_inputs/github-readme-text.md`, `_inputs/github-public-repos.md` and the public repos' READMEs.
 * - `logic-controls`: the Logic Controls facts in `_inputs/SOURCES.md` and the logic-controls-website README.
 * - `mohamed`: confirmed by Mohamed directly (answers relayed on 2026-10-09: M.Sc. status, work arrangements,
 *   which clients are named, CV).
 */
export type Source = "cv" | "linkedin" | "github" | "logic-controls" | "mohamed";

/** One or more sources that state a fact. The first entry is the primary source. */
export type Sources = readonly [Source, ...Source[]];

/** Two-digit month. */
type MM = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12";

/** ISO 8601 year, e.g. `"2022"`. Used when the sources give no month. */
export type IsoYear = `${number}`;

/** ISO 8601 calendar month, e.g. `"2024-09"`. */
export type IsoMonth = `${number}-${MM}`;

/** Two-digit day of the month. */
type DD = `0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | `${1 | 2}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | "30" | "31";

/** ISO 8601 calendar date, e.g. `"2026-10-10"`. Used where the exact day is known (publication and review dates). */
export type IsoDate = `${number}-${MM}-${DD}`;

/** A date range. `end: null` means ongoing. Month precision when the sources give it, otherwise year. */
export interface Period {
  /** First month (or year) of the period. */
  readonly start: IsoMonth | IsoYear;
  /** Last month (or year), or `null` while ongoing ("Present"). */
  readonly end: IsoMonth | IsoYear | null;
}

/** A fact-bearing line of text with its provenance. */
export interface Fact {
  /** The text, in both locales. */
  readonly text: L10n;
  /** Input file(s) that state it. */
  readonly source: Sources;
  /**
   * Optional: the phrase of `text` set in bold where the design marks the "receipt" of a line (the experience trace,
   * the CV). It must appear verbatim in `text`, in both locales (checked by the site's unit tests). One per line.
   */
  readonly strong?: L10n;
}

/** An external link. */
export interface Link {
  /** Visible label. */
  readonly label: L10n;
  /** Absolute URL. */
  readonly href: string;
}

/**
 * Logo file key. The file is `_inputs/logos/<key>.jpg` (official 100x100 LinkedIn logos); the design build copies
 * the ones it uses into `public/`. `mtc.jpg` is deliberately absent: it is a different college (Oman), so the
 * Military Technical College (Cairo) uses a monogram.
 */
export type LogoFile =
  | "globant"
  | "wakeb"
  | "arabsstock"
  | "empoweromics"
  | "buid"
  | "mdp"
  | "cairo-university"
  | "iti"
  | "tanta-university"
  | "aws"
  | "aestheticspro";

/** How to draw an organisation's mark. */
export interface Logo {
  /** Official logo file, or `null` when there is none (render the monogram). */
  readonly file: LogoFile | null;
  /** 1-3 letter fallback monogram, always provided (also used while the image loads). */
  readonly monogram: string;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* IDs (typed so cross-references are checked by the compiler)                                                  */
/* ------------------------------------------------------------------------------------------------------------ */

/** Stable id of an experience entry. */
export type RoleId =
  | "globant"
  | "wakeb"
  | "arabsstock"
  | "tabaqat"
  | "empoweromics"
  | "buid"
  | "mtc"
  | "aestheticspro"
  | "mdp";

/** URL slug of a case study (also its anchor id). */
export type CaseStudySlug =
  | "sta-tourism-assistants"
  | "almajed-sales-assistant"
  | "arabsstock-assistant"
  | "wakeb-bilingual-chatbot"
  | "aip-semantic-search"
  | "gov-bilingual-assistant"
  | "empoweromics-ml"
  | "tabaqat-gis"
  | "logic-controls-website";

/** Stable id of a project (open source, client or coursework). */
export type ProjectId =
  | "staged-llm-evaluator"
  | "prompt-reliability-harness"
  | "rag-answering-service"
  | "arabic-sentiment-analysis"
  | "text-summarization"
  | "logic-controls-website"
  | "stroke-prediction-pyspark"
  | "covid19-dashboard"
  | "telco-churn"
  | "house-price-hyderabad";

/** A pointer to where a skill is demonstrated: a role, a case study or a project. */
export type EvidenceRef = `role:${RoleId}` | `case:${CaseStudySlug}` | `project:${ProjectId}`;

/* ------------------------------------------------------------------------------------------------------------ */
/* Section types                                                                                                */
/* ------------------------------------------------------------------------------------------------------------ */

/** A way to reach him. */
export interface ContactChannel {
  /** Stable id (also used for icons). */
  readonly id: "email" | "whatsapp" | "gmail";
  /** Visible label, e.g. "WhatsApp". */
  readonly label: L10n;
  /** Value as displayed. Phone numbers and emails are LTR: wrap them in `<bdi dir="ltr">` in Arabic pages. */
  readonly display: string;
  /** Link target (`mailto:`, `https://wa.me/...`). */
  readonly href: string;
  /** Preferred channels are shown first and offered first by the chatbot. */
  readonly preferred: boolean;
}

/** A public profile or site link. */
export interface ProfileLink {
  /** Stable id (also used for icons). */
  readonly id: "linkedin" | "github" | "website" | "site-source";
  /** Visible label. */
  readonly label: L10n;
  /** Short display form, e.g. "github.com/mhatem5351". */
  readonly display: string;
  /** Absolute URL. */
  readonly href: string;
}

/** A spoken language. */
export interface SpokenLanguage {
  /** Language name. */
  readonly name: L10n;
  /** Proficiency as stated in the CV. */
  readonly level: L10n;
  /** Provenance. */
  readonly source: Sources;
}

/** Identity, positioning and contact. */
export interface Basics {
  /** Display name. */
  readonly name: L10n;
  /** Full legal name as on the CV (used in JSON-LD `name` alternates, not in headings). */
  readonly fullName: L10n;
  /** How the chatbot refers to him after first mention. */
  readonly shortName: L10n;
  /** Current job title (binding decision: AI Team Lead, not the CV's "Senior AI Engineer"). */
  readonly title: L10n;
  /** Current employer. */
  readonly employer: string;
  /** Current employer's website. */
  readonly employerUrl: string;
  /** "<title> at <employer>", for bylines and meta. */
  readonly headline: L10n;
  /** Hero headline: one line, outcome first. */
  readonly tagline: L10n;
  /** Hero lead: two sentences with the scale facts. */
  readonly intro: L10n;
  /**
   * The hero lead on phones (≤ 120 characters in English): the scale facts without the role, which the person chip
   * right above it already states, so the actions and availability fit the first screen of a small phone.
   */
  readonly introShort: L10n;
  /** About section, first person, 2-3 short paragraphs. */
  readonly bio: readonly Fact[];
  /** Years of professional experience (binding decision: 7; CV and LinkedIn say "6+"). */
  readonly yearsOfExperience: number;
  /** First professional role (SQL Developer, Jan 2020); the "7 years" is counted from here. */
  readonly careerStart: IsoMonth;
  /** Where he lives and works from. */
  readonly location: {
    /** City. */
    readonly city: L10n;
    /** Country. */
    readonly country: L10n;
    /** IANA time zone, for a live local-time display. */
    readonly timeZone: "Africa/Cairo";
    /** Human-readable offset (Egypt observes summer time). */
    readonly utcOffset: L10n;
    /** How he works with teams. */
    readonly workStyle: L10n;
  };
  /** Profile photo (800x800, `_inputs/profile-photo.jpg`). */
  readonly photo: {
    /** Source file name inside `_inputs/`. */
    readonly file: "profile-photo.jpg";
    /** Alt text. */
    readonly alt: L10n;
  };
  /** Direct contact channels, preferred first. */
  readonly contacts: readonly ContactChannel[];
  /** Public profiles and site links. */
  readonly links: readonly ProfileLink[];
  /** Languages he speaks. */
  readonly languages: readonly SpokenLanguage[];
  /** Roles and work arrangements he is open to. */
  readonly openTo: {
    /** Role names. */
    readonly roles: readonly L10n[];
    /** Work arrangements he accepts (remote, relocation, on-site). */
    readonly arrangements: readonly WorkArrangement[];
    /**
     * Notice period, shown beside "Open to" (About, the CV, llms.txt; round 7). Visa or work authorisation is never
     * stated anywhere (the assistant says to ask him).
     */
    readonly noticePeriod: L10n;
    /** One-line statement for the site (llms.txt): roles, arrangements and the notice period. */
    readonly line: L10n;
    /** Provenance. */
    readonly source: Sources;
  };
}

/** A work arrangement he is open to. */
export interface WorkArrangement {
  /** Stable id (also used for icons). */
  readonly id: "remote" | "relocate-gulf" | "relocate-europe" | "cairo-onsite";
  /** Short label. */
  readonly label: L10n;
  /** Optional detail (regions, cities). */
  readonly detail?: L10n;
}

/** A headline number. Only real, sourced values. */
export interface Metric {
  /** Stable id. */
  readonly id: string;
  /** The big figure, e.g. "14" or "Millions". */
  readonly value: L10n;
  /** Short label under the figure. */
  readonly label: L10n;
  /** One-sentence context (tooltip / expanded view). */
  readonly detail: L10n;
  /** Shown in the hero strip (the first 4 featured metrics). */
  readonly featured: boolean;
  /** Where the number is demonstrated. */
  readonly evidence: readonly EvidenceRef[];
  /** Provenance. */
  readonly source: Sources;
}

/** An experience entry. Ordered newest first. */
export interface Role {
  /** Stable id. */
  readonly id: RoleId;
  /** Organisation name (brand names stay Latin in Arabic). */
  readonly company: L10n;
  /** Organisation website, only where a source links it. */
  readonly companyUrl?: string;
  /** Logo or monogram. */
  readonly logo: Logo;
  /** Job title. */
  readonly title: L10n;
  /** Contract type. */
  readonly employmentType: "full-time" | "part-time" | "freelance";
  /** Dates. */
  readonly period: Period;
  /** Location as displayed. */
  readonly location: L10n;
  /** Work arrangement, or `null` when the sources don't say. */
  readonly workMode: "remote" | "hybrid" | "on-site" | null;
  /** One line: what he did there, outcome first. */
  readonly summary: L10n;
  /** Achievement bullets, strongest first. */
  readonly bullets: readonly Fact[];
  /** Concise bullets for the generated CV (PDF and /cv page): 1 to 4, strongest first. */
  readonly cvBullets: UpTo4<Fact>;
  /**
   * Technology tags. Tool and product names are plain strings (Latin script in both locales); descriptive phrases
   * ("Machine learning") are `L10n`, so Arabic pages don't show English phrases as tags.
   */
  readonly tech: readonly (string | L10n)[];
  /** Case studies drawn from this role. */
  readonly caseStudies: readonly CaseStudySlug[];
  /** Awards received in this role (ids of `honors`). */
  readonly honors: readonly string[];
  /** `true` for the four main roles shown expanded; the rest sit under "Earlier roles". */
  readonly primary: boolean;
  /**
   * Optional: the client of the whole role, where Mohamed approved naming it. Role level only: the CV shows it on its
   * own line under the role head ("Client: …"), never on a bullet, a project or a case study.
   */
  readonly client?: RoleClient;
  /** Provenance of the role itself (title, dates, company). */
  readonly source: Sources;
}

/** The client a role's work was for (`Role.client`). */
export interface RoleClient {
  /** Client name as shown after the "Client:" label (`m.cv.client`). */
  readonly name: L10n;
  /** Provenance. */
  readonly source: Sources;
}

/** One to four items (the compiler enforces the maximum). */
export type UpTo4<T> = readonly [T] | readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T];

/** Category of a node in an architecture diagram; maps to the brand's category colours. */
export type ArchNodeKind =
  | "user" // people or client apps
  | "orchestrator" // the routing brain (LangGraph graph, Worker)
  | "agent" // specialised agents / subgraphs
  | "model" // LLMs and ML models
  | "retrieval" // search, reranking, embeddings
  | "data" // stores, indexes, sources
  | "service" // APIs, microservices, gateways
  | "pipeline" // ETL / batch / CI
  | "quality" // evaluation, monitoring, guardrails, tests
  | "infra"; // GPUs, containers, hosting

/** A component in an architecture diagram. */
export interface ArchNode {
  /** Id unique within the diagram. */
  readonly id: string;
  /** Component name. */
  readonly label: L10n;
  /** Category (colour / icon). */
  readonly kind: ArchNodeKind;
  /** Optional one-line note shown on hover or under the label. */
  readonly note?: L10n;
}

/** A directed connection between two nodes. Only connections the sources state or directly imply. */
export interface ArchEdge {
  /** Source node id. */
  readonly from: string;
  /** Target node id. */
  readonly to: string;
  /** Optional short label. */
  readonly label?: L10n;
}

/** Component view of a system, suitable for a diagram. */
export interface Architecture {
  /** One-sentence caption under the diagram. */
  readonly caption: L10n;
  /** Components. */
  readonly nodes: readonly ArchNode[];
  /** Connections. */
  readonly edges: readonly ArchEdge[];
}

/** A small figure shown on a case-study card. */
export interface Figure {
  /** The figure, e.g. "14". */
  readonly value: L10n;
  /** Optional unit set small after the value, e.g. "months". */
  readonly unit?: L10n;
  /** What it counts. */
  readonly label: L10n;
  /** Provenance. */
  readonly source: Sources;
}

/**
 * A screen of a shipped product, shown in a case study's gallery. The file is a cleaned capture (personal data and
 * internal names removed before export) in `site/src/assets/screens/<slug>/`. Captions describe what the screen
 * shows, never how it was captured.
 */
export interface Screen {
  /** File name in `site/src/assets/screens/<slug>/` (WebP). */
  readonly file: string;
  /**
   * Pixel density of the capture: 2 = captured at twice the size it is shown (the desktop screens); 1 = a 1x capture
   * (the phone screen, a dialog), shown at its native width or smaller, never upscaled.
   */
  readonly density: 1 | 2;
  /** `desktop` (a browser-like frame), `phone` (a phone bezel) or `panel` (a cropped dialog on its own). */
  readonly frame: "desktop" | "phone" | "panel";
  /** Which product the screen belongs to (groups the gallery). */
  readonly product: L10n;
  /** Short text alternative. */
  readonly alt: L10n;
  /** Caption under the screen. */
  readonly caption: L10n;
}

/** The client a case study was built for, where the client approved being named (JSON-LD `about`). */
export interface Client {
  /** Official name. */
  readonly name: L10n;
  /** Abbreviation used in the sources (e.g. "STA"). */
  readonly abbreviation?: string;
  /**
   * Optional: the client's logo tile (`design/assets/logos/tiles/<file>-160.webp`, built by
   * `design/scripts/brand/brand-logos.mjs`), shown beside the eyebrow of contract or freelance work that has no role
   * (`roleId: null`): the case-study hero and the work card. Client work done in a role shows the employer's tile.
   */
  readonly tile?: { readonly file: string; readonly monogram: string };
}

/** A case study: problem -> approach -> architecture -> outcome. */
export interface CaseStudy {
  /** URL slug / anchor id. */
  readonly slug: CaseStudySlug;
  /** Display order (1 = first). */
  readonly order: number;
  /** Shown in the main "Selected work" grid. The rest are listed compactly. */
  readonly featured: boolean;
  /** `full` has enough public detail for a long page; `brief` renders as a compact card (thin sources). */
  readonly depth: "full" | "brief";
  /** Title, outcome first. */
  readonly title: L10n;
  /** Short title (<= 40 characters) for meta titles ("<shortTitle> · Mohamed Hatem"), tabs and breadcrumbs. */
  readonly shortTitle: L10n;
  /** Client or context, at the level the sources disclose. */
  readonly context: L10n;
  /** The role this work belongs to (`null` for freelance work outside the experience list). */
  readonly roleId: RoleId | null;
  /** His part in it. */
  readonly contribution: L10n;
  /**
   * When the work happened. For work dated only by its role (several case studies from one role), this is the
   * role's period and pages say "during the role" instead of presenting it as the project's own dates.
   */
  readonly period: Period;
  /** First publication of the case-study page (JSON-LD `datePublished`, `article:published_time`). */
  readonly published: IsoDate;
  /** Last content change of the case-study page (JSON-LD `dateModified`, sitemap `<lastmod>`). */
  readonly updated: IsoDate;
  /** One sentence (<= 155 characters in each locale, so it doubles as the meta description). */
  readonly summary: L10n;
  /** What had to be solved. */
  readonly problem: L10n;
  /** How he solved it, step by step. */
  readonly approach: readonly Fact[];
  /** Components and connections for the diagram. */
  readonly architecture: Architecture;
  /** What it delivered. Capabilities where no metric is public; never invented numbers. */
  readonly outcome: readonly Fact[];
  /** Headline figures for the card. */
  readonly figures: readonly Figure[];
  /** Technology tags. */
  readonly stack: readonly string[];
  /** Public links (live site, code). */
  readonly links: readonly Link[];
  /** The named client, only where the client approved being named (unnamed clients never appear here). */
  readonly client?: Client;
  /** Screens of the product (a gallery on the case-study page), where the client approved publishing them. */
  readonly screens?: readonly Screen[];
  /**
   * Optional: the line under the gallery, where the default (`m.work.page.screensCredit`: "shown with the client's
   * approval, with personal data removed") doesn't fit, e.g. screens that run on illustrative demo data.
   */
  readonly screensNote?: L10n;
  /** Provenance of the case study as a whole. */
  readonly source: Sources;
}

/** A public repository or shipped site. */
export interface Project {
  /** Stable id. */
  readonly id: ProjectId;
  /** Repository or product name. */
  readonly name: string;
  /** `llm` = LLM tooling, `ml` = ML / NLP, `web` = client frontend, `coursework` = AI-diploma archive. */
  readonly kind: "llm" | "ml" | "web" | "coursework";
  /** Featured on the Projects section (coursework never is). */
  readonly featured: boolean;
  /** Year of the work. */
  readonly year: number;
  /** One or two sentences. */
  readonly description: L10n;
  /** What makes it worth reading, from its README. */
  readonly highlights: readonly Fact[];
  /** Technology tags. */
  readonly stack: readonly string[];
  /** Repository URL. */
  readonly repo: string;
  /** Live URL, if any. */
  readonly live?: string;
  /** SPDX licence id, if the repo has one. */
  readonly license?: string;
  /** Short credit note for team work, if any. */
  readonly credit?: L10n;
  /** Provenance. */
  readonly source: Sources;
}

/** One skill. */
export interface Skill {
  /** Name (tool names identical in both locales). */
  readonly name: L10n;
  /** LinkedIn endorsement count, where shown on his profile. */
  readonly endorsements?: number;
  /** Passed the LinkedIn skill assessment. */
  readonly assessmentPassed?: boolean;
  /** Where it is demonstrated (may be empty for endorsed-only skills). */
  readonly evidence: readonly EvidenceRef[];
  /** Provenance. */
  readonly source: Sources;
}

/** A group of skills. */
export interface SkillGroup {
  /** Stable id. */
  readonly id: string;
  /** Group title. */
  readonly title: L10n;
  /** One line on how he uses this group. */
  readonly summary: L10n;
  /** Skills, strongest first. */
  readonly skills: readonly Skill[];
}

/** A degree or diploma. */
export interface Education {
  /** Stable id. */
  readonly id: string;
  /** Degree name. */
  readonly degree: L10n;
  /** Institution (and faculty). */
  readonly institution: L10n;
  /** Logo. */
  readonly logo: Logo;
  /** Dates. For a degree in progress, `end` is the expected completion year. */
  readonly period: Period;
  /** `in-progress` degrees show "(expected)" after the end year and are never described as held. */
  readonly status: "completed" | "in-progress";
  /** Notes (programme length, partner, field). */
  readonly notes?: L10n;
  /** Courses, where listed. */
  readonly courses: readonly L10n[];
  /** Lead with this in intros? (Binding: never lead with the engineering degree.) */
  readonly leadWith: boolean;
  /** Provenance. */
  readonly source: Sources;
}

/** A certification or assessment. */
export interface Certification {
  /** Stable id. */
  readonly id: string;
  /** Official name (Latin in both locales). */
  readonly name: L10n;
  /** Issuer. */
  readonly issuer: L10n;
  /** Logo, if any. */
  readonly logo: Logo | null;
  /** Issue date at the precision the sources agree on, or `null` if not stated. */
  readonly issued: IsoMonth | IsoYear | null;
  /**
   * Shown prominently. None is since round 6 (HM-10): the AWS certification (2022) is a plain entry, never in a
   * highlight box or a summary.
   */
  readonly featured: boolean;
  /** Listed on the CV (the CV keeps only the AWS certification; the site lists them all; round 6, HM-23). */
  readonly onCv: boolean;
  /** Provenance. */
  readonly source: Sources;
}

/** An award. */
export interface Honor {
  /** Stable id. */
  readonly id: string;
  /** Award name. */
  readonly title: L10n;
  /** Awarding organisation. */
  readonly issuer: L10n;
  /** The role it belongs to. */
  readonly roleId: RoleId;
  /** When it was awarded, or `null` when the sources don't say (shown without a date, never with the role's dates). */
  readonly period: Period | null;
  /** One line from the source. */
  readonly description: L10n;
  /** Provenance. */
  readonly source: Sources;
}

/** The whole profile. */
export interface Profile {
  /** Identity, positioning, contact. */
  readonly basics: Basics;
  /** Headline numbers. */
  readonly metrics: readonly Metric[];
  /** Roles, newest first. */
  readonly experience: readonly Role[];
  /** Case studies, in display order. */
  readonly caseStudies: readonly CaseStudy[];
  /** Projects: featured open source first, then client work, then coursework. */
  readonly projects: readonly Project[];
  /** Skills by group. */
  readonly skills: readonly SkillGroup[];
  /** Degrees and diplomas, newest first. */
  readonly education: readonly Education[];
  /** Certifications and assessments. */
  readonly certifications: readonly Certification[];
  /** Awards. */
  readonly honors: readonly Honor[];
  /** Extra data for the generated CV (PDF + /cv page); roles supply `cvBullets`. */
  readonly cv: Cv;
  /** Site constants. */
  readonly site: {
    /** Canonical origin, no trailing slash. */
    readonly url: "https://mohamedhatem.dev";
    /** Day the site went live (first publication of the home, CV and case-study pages). */
    readonly published: IsoDate;
    /** Last content change of the home page (JSON-LD `dateModified`, sitemap `<lastmod>`). */
    readonly updated: IsoDate;
    /** Public source repository of this site. */
    readonly repo: string;
    /** Default locale (served at `/`). */
    readonly defaultLocale: Locale;
    /** Section anchor ids on the home page, in order. Labels live in `content/i18n`. */
    readonly sections: readonly SectionId[];
    /** Standalone pages (paths per locale, trailing slash). */
    readonly pages: {
      /** The CV page; the PDF download lives there. */
      readonly cv: { readonly en: "/cv/"; readonly ar: "/ar/cv/" };
    };
  };
}

/** One line of the CV's skills summary. */
export interface CvSkillLine {
  /** Group label, e.g. "LLMs & agents". */
  readonly label: L10n;
  /** Items, in order (tool names identical in both locales). Join with Intl.ListFormat or " · ". */
  readonly items: readonly L10n[];
  /**
   * Optional: skills he has used without a project on the site to show for them (the site's "Also worked with"), set
   * after the core items as "; also used: …" (round 7, HM-17: the keywords stay, the weighting is honest).
   */
  readonly alsoUsed?: readonly L10n[];
  /** Provenance. */
  readonly source: Sources;
}

/** A public repository on the CV's Open source block: the name links to the repository. */
export interface CvProject {
  /** The project (its name and repository come from `projects`). */
  readonly id: ProjectId;
  /** One or two sentences, with the measured result where the repository has one. */
  readonly line: L10n;
  /** Provenance. */
  readonly source: Sources;
}

/** Contract work on the CV: a case study done outside the experience list (`roleId: null`), with its own bullets. */
export interface CvContract {
  /** The case study (its client, period, tile and page come from `caseStudies`). */
  readonly slug: CaseStudySlug;
  /** His title on that work. */
  readonly title: L10n;
  /** Bullets for the CV (1 to 3), strongest first. */
  readonly bullets: readonly Fact[];
}

/** Data used only by the generated CV. */
export interface Cv {
  /** Header summary paragraph (3-4 sentences, no pronoun, outcome first). */
  readonly summary: L10n;
  /** Phrases of `summary` set in bold (each verbatim in both locales), as in the design's CV. */
  readonly summaryStrong: readonly L10n[];
  /** Skills summary, one line per group. */
  readonly skills: readonly CvSkillLine[];
  /**
   * Open source on the CV (round 7, R7-06): the LLM-evaluation repositories, with the one measured result, after the
   * experience. Text from `projects` (the repositories' READMEs), nothing new.
   */
  readonly openSource: readonly CvProject[];
  /** Contract work, after the experience (2026-10-28): the case studies done outside a role, newest first. */
  readonly contract: readonly CvContract[];
  /**
   * "Open to" on the CV: the roles of `basics.openTo` (one list everywhere), team lead first, then the arrangements in
   * three short lines (the site's About splits relocation by region).
   */
  readonly openTo: {
    /** Roles, in order. */
    readonly roles: readonly L10n[];
    /** Work arrangements, in order. */
    readonly arrangements: readonly L10n[];
    /** Provenance. */
    readonly source: Sources;
  };
  /** Suggested PDF file names. */
  readonly fileName: L10n;
  /** Day the CV content was last reviewed (shown as month and year). */
  readonly updated: IsoDate;
}

/** Home-page section anchors (`#work`, `#experience`, ...). */
export type SectionId = "work" | "experience" | "projects" | "skills" | "education" | "about" | "assistant" | "contact";

/* ------------------------------------------------------------------------------------------------------------ */
/* Helpers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

/** Pick one locale's text. */
export function t(text: L10n, locale: Locale): string {
  return text[locale];
}

/** The same string in both locales: brand names, tool names, code identifiers. */
export function same(text: string): L10n {
  return { en: text, ar: text };
}

/** Shorthand for a sourced fact. */
function fact(en: string, ar: string, ...source: Sources): Fact {
  return { text: { en, ar }, source };
}

/** A sourced fact with its bold phrase (`strong`: [en, ar], each verbatim in the text). */
function factB(strong: readonly [string, string], en: string, ar: string, ...source: Sources): Fact {
  return { text: { en, ar }, source, strong: { en: strong[0], ar: strong[1] } };
}

/** Shorthand for a bilingual string. */
function l(en: string, ar: string): L10n {
  return { en, ar };
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Data                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

/**
 * The roles he is open to, team lead first: one list for the site's About, the CV, llms.txt and the assistant
 * (round 6, HM-13: "AI/ML Team Lead or Senior AI / LLM Engineer, remote, relocation to the Gulf or Europe, or hybrid in
 * Cairo").
 */
const OPEN_TO_ROLES: readonly L10n[] = [
  l("AI/ML Team Lead", "قائد فريق ذكاء اصطناعي / تعلّم آلة"),
  l("Senior AI / LLM Engineer", "مهندس ذكاء اصطناعي أول (LLM)"),
];

const basics: Basics = {
  name: l("Mohamed Hatem", "محمد حاتم"),
  fullName: l("Mohamed Hatem Radwan", "محمد حاتم رضوان"),
  shortName: l("Hatem", "حاتم"),
  title: l("AI Team Lead", "قائد فريق ذكاء اصطناعي"),
  employer: "Globant",
  employerUrl: "https://www.globant.com",
  headline: l("AI Team Lead at Globant", "قائد فريق ذكاء اصطناعي في Globant"),
  tagline: l(
    "I build agentic LLM systems in Arabic and English, from the agent graph down to the GPU.",
    "أبني أنظمة LLM وكيلية بالعربية والإنجليزية، من مخطط الوكلاء حتى وحدات GPU.",
  ),
  // Round 6 (HM-05, HM-08): the Saudi Tourism Authority and the team of 7 on the first screen; the multi-agent work
  // comes after "Before that", so it never reads as the Globant work.
  // The person chip right above the headline states the role, so the lede starts with the experience. Round 7
  // (R7-13): the 7 years and the team of 7 are two sentences apart, the employer is named, and the self-hosted part is
  // the Qwen model, not the GPUs. Four lines at 1440 px, so the metric strip still peeks above the fold ("bilingual" is
  // the headline's "in Arabic and English").
  intro: l(
    "7 years in data and AI. At Globant I lead a team of 7 on the Saudi Tourism Authority's AI assistants. Before that, I built a 14-agent assistant for ArabsStock and a 6-agent chatbot on self-hosted Qwen and A100 GPUs at Wakeb Data.",
    "لديّ 7 سنوات من الخبرة في البيانات والذكاء الاصطناعي، وأقود اليوم في Globant فريقًا من 7 أعضاء يعمل على مساعدَي الهيئة السعودية للسياحة. وقبل ذلك بنيت مساعدًا من 14 وكيلًا لمنصة ArabsStock، وفي Wakeb Data روبوت محادثة ثنائي اللغة من 6 وكلاء على Qwen مستضاف ذاتيًا بوحدات A100.",
  ),
  // Round 7 (R7-13): two systems, not one ("14- and 6-agent" read as a single system). Three lines on an iPhone SE, so
  // the ask bar stays inside Safari's visible area.
  introShort: l(
    "Leading a team of 7 on the Saudi Tourism Authority's AI assistants. Before: 14-agent and 6-agent systems.",
    "أقود فريقًا من 7 أعضاء يعمل على مساعدَي الهيئة السعودية للسياحة. وقبلها بنيت نظامين من 14 وكيلًا و6 وكلاء.",
  ),
  bio: [
    // Round 6 (HM-01): the Globant paragraph opens with the approved STA sentence; "multi-agent … in production" is
    // said only of the work before Globant. The team of 7 is Mohamed's own figure (2026-10-11); nothing else about it.
    // Round 7 (R7-19): the runtime follows "the AI engineering", not "a team of 7".
    fact(
      "I'm an AI Team Lead at Globant, based in Cairo. On the Saudi Tourism Authority (STA) project I lead a team of 7 and the AI engineering: an agentic LLM runtime (LangGraph) with retrieval, human-approval gates and evaluation, serving Noura, the public visitor assistant, and an internal staff assistant, in Arabic and English. Before Globant, I designed, shipped and ran multi-agent LLM systems in production, with retrieval, self-hosted model serving, and the evaluation and monitoring that keep them honest.",
      "أعمل قائدًا لفريق ذكاء اصطناعي في Globant، وأقيم في القاهرة. وفي مشروع الهيئة السعودية للسياحة (STA) أقود فريقًا من 7 أعضاء وهندسة الذكاء الاصطناعي: بيئة تشغيل على LangGraph لوكيل ذكي قائم على النماذج اللغوية، تجمع الاسترجاع ونقاط الموافقة البشرية والتقييم، وتخدم «نورة»، المساعد الافتراضي للزوار، ومساعدًا داخليًا للموظفين، بالعربية والإنجليزية. وقبل Globant صمّمت أنظمة LLM متعددة الوكلاء وأطلقتها وشغّلتها في بيئة الإنتاج، مع الاسترجاع وخدمة النماذج ذاتية الاستضافة والتقييم والمراقبة اللذين يضمنان موثوقية إجاباتها.",
      "mohamed",
      "github",
      "linkedin",
    ),
    fact(
      "I came to AI through data: I started in 2020 writing SQL for a payments company, moved into data science, then built AI platforms in production. At ArabsStock I architected a 14-agent assistant, and at Wakeb Data a 6-agent bilingual chatbot whose Qwen models I served with vLLM on A100 GPUs.",
      "دخلت مجال الذكاء الاصطناعي من باب البيانات: بدأت عام 2020 بكتابة SQL لشركة مدفوعات رقمية، ثم انتقلت إلى علم البيانات، ثم إلى بناء منصات ذكاء اصطناعي تعمل في بيئة الإنتاج. صمّمت في ArabsStock مساعدًا من 14 وكيلًا، وبنيت في Wakeb Data روبوت محادثة ثنائي اللغة من 6 وكلاء، وتولّيت تشغيل نماذج Qwen الخاصة به عبر vLLM على وحدات A100.",
      "github",
      "cv",
      "linkedin",
    ),
    // The AWS certification is listed under Certifications only (round 6, HM-10). Round 7: "I've worked" (the only US
    // work is the 2022 freelance role, R7-19), and the teaching, his longest people-facing work, in one sentence (R7-12,
    // from the BUID and MTC roles).
    fact(
      "Most of what I ship works in Arabic and English, and I've worked remotely with teams in the Gulf and the US. In 2022 I lectured master's students at The British University in Dubai on machine learning, deep learning, natural language understanding and recommender systems, mentored master's research there and at Umm Al-Qura University, and taught AI to engineers at the Military Technical College. I'm completing an M.Sc. in Data Science at Cairo University (expected 2027).",
      "معظم ما أطلقه يعمل بالعربية والإنجليزية، وقد عملت عن بُعد مع فرق في الخليج والولايات المتحدة. وفي عام 2022 حاضرتُ طلاب ماجستير في الجامعة البريطانية في دبي في تعلّم الآلة والتعلّم العميق وفهم اللغة الطبيعية ونظم التوصية، ووجّهتُ أبحاث ماجستير فيها وفي جامعة أم القرى، ودرّستُ الذكاء الاصطناعي لمهندسين في الكلية الفنية العسكرية. وأستكمل حاليًا ماجستير علم البيانات في جامعة القاهرة (التخرج المتوقع عام 2027).",
      "github",
      "cv",
      "linkedin",
      "mohamed",
    ),
  ],
  yearsOfExperience: 7,
  careerStart: "2020-01",
  location: {
    city: l("Cairo", "القاهرة"),
    country: l("Egypt", "مصر"),
    timeZone: "Africa/Cairo",
    utcOffset: l("UTC+2 (UTC+3 in summer)", "UTC+2 (وUTC+3 في التوقيت الصيفي)"),
    workStyle: l(
      "I've worked remotely with teams in the Gulf and the US, in English and Arabic.",
      "عملت عن بُعد مع فرق في الخليج والولايات المتحدة، بالإنجليزية والعربية.",
    ),
  },
  photo: {
    file: "profile-photo.jpg",
    alt: l("Portrait of Mohamed Hatem", "صورة شخصية لمحمد حاتم"),
  },
  contacts: [
    {
      id: "email",
      label: l("Email", "البريد الإلكتروني"),
      display: "hatem@mohamedhatem.dev",
      href: "mailto:hatem@mohamedhatem.dev",
      preferred: true,
    },
    {
      id: "whatsapp",
      label: l("WhatsApp", "WhatsApp"),
      display: "+20 114 207 0946",
      href: "https://wa.me/201142070946",
      preferred: true,
    },
    {
      id: "gmail",
      label: l("Gmail", "Gmail"),
      display: "mhatem5351@gmail.com",
      href: "mailto:mhatem5351@gmail.com",
      preferred: false,
    },
  ],
  links: [
    {
      id: "linkedin",
      label: l("LinkedIn", "LinkedIn"),
      display: "linkedin.com/in/mohamed-hatem-6a5790173",
      href: "https://www.linkedin.com/in/mohamed-hatem-6a5790173",
    },
    {
      id: "github",
      label: l("GitHub", "GitHub"),
      display: "github.com/mhatem5351",
      href: "https://github.com/mhatem5351",
    },
    {
      id: "website",
      label: l("Website", "الموقع"),
      display: "mohamedhatem.dev",
      href: "https://mohamedhatem.dev",
    },
    {
      id: "site-source",
      label: l("Source of this site", "الشيفرة المصدرية لهذا الموقع"),
      display: "github.com/mhatem5351/mohamedhatem.dev",
      href: "https://github.com/mhatem5351/mohamedhatem.dev",
    },
  ],
  languages: [
    { name: l("Arabic", "العربية"), level: l("Native", "اللغة الأم"), source: ["cv"] },
    {
      name: l("English", "الإنجليزية"),
      level: l("Professional working proficiency", "إجادة مهنية"),
      source: ["cv"],
    },
  ],
  openTo: {
    // Round 6 (HM-13): one list everywhere (site, CV, llms.txt): the CV's `cv.openTo` reuses these roles.
    roles: OPEN_TO_ROLES,
    arrangements: [
      { id: "remote", label: l("Remote, from Cairo", "عن بُعد من القاهرة") },
      {
        id: "relocate-gulf",
        label: l("Relocation to the Gulf", "الانتقال إلى الخليج"),
        detail: l("Saudi Arabia, UAE, Qatar and nearby", "السعودية والإمارات وقطر والدول المجاورة"),
      },
      { id: "relocate-europe", label: l("Relocation to Europe", "الانتقال إلى أوروبا") },
      { id: "cairo-onsite", label: l("Hybrid in Cairo", "عمل هجين في القاهرة") },
    ],
    // Confirmed by Mohamed (round 7 triage, 2026-10-11). Visa and work authorisation are deliberately not stated.
    noticePeriod: l("2 weeks to 1 month", "من أسبوعين إلى شهر"),
    line: l(
      "Open to AI/ML Team Lead or Senior AI / LLM Engineer roles: remote, relocation to the Gulf or Europe, or hybrid in Cairo. Notice period: 2 weeks to 1 month.",
      "أرحّب بأدوار قائد فريق ذكاء اصطناعي / تعلّم آلة أو مهندس ذكاء اصطناعي أول (LLM): عن بُعد، أو بالانتقال إلى الخليج أو أوروبا، أو بنظام هجين في القاهرة. فترة الإشعار: من أسبوعين إلى شهر.",
    ),
    source: ["mohamed", "linkedin"],
  },
};

const metrics: readonly Metric[] = [
  {
    id: "years",
    value: same("7"),
    label: l("years in data and AI, now leading an AI team", "سنوات في البيانات والذكاء الاصطناعي، وأقود اليوم فريق ذكاء اصطناعي"),
    detail: l(
      "From SQL development in 2020 to data science, production AI platforms, and now leading an AI engineering team.",
      "من تطوير SQL عام 2020 إلى علم البيانات، ثم منصات الذكاء الاصطناعي في بيئة الإنتاج، وصولًا إلى قيادة فريق هندسة ذكاء اصطناعي.",
    ),
    featured: true,
    evidence: ["role:mdp", "role:globant"],
    source: ["github"],
  },
  // Round 6 (HM-05, HM-31): the Saudi Tourism Authority on the strip, with its one approved figure (it replaces the
  // A100 tile, which named hardware, not a result). Each agent count names its company, so nothing next to this
  // tile reads as the STA work.
  {
    id: "sta-tools",
    value: same("96"),
    label: l(
      "tools behind one agent for the Saudi Tourism Authority, 27 for visitors",
      // Round 7 (R7-28): «يستدعيها» rather than the calque «خلف».
      "أداة يستدعيها وكيل واحد للهيئة السعودية للسياحة، منها 27 للزوار",
    ),
    detail: l(
      "Noura, the visitor assistant, and a staff assistant run on one LangGraph agent; 27 of its 96 tools are visible to visitors.",
      "يعمل مساعدا الهيئة، «نورة» للزوار ومساعد الموظفين، على وكيل LangGraph واحد، و27 من أدواته الـ96 متاحة للزوار.",
    ),
    featured: true,
    evidence: ["case:sta-tourism-assistants", "role:globant"],
    source: ["mohamed"],
  },
  {
    id: "arabsstock-agents",
    value: same("14"),
    label: l("agents in ArabsStock's LangGraph assistant", "وكيلًا في مساعد ArabsStock على LangGraph"),
    detail: l(
      "The ArabsStock Assistant: semantic search, AI image generation, database operations and content moderation.",
      "مساعد ArabsStock: بحث دلالي، وتوليد صور بالذكاء الاصطناعي، وعمليات قواعد بيانات، وإشراف على المحتوى.",
    ),
    featured: true,
    evidence: ["case:arabsstock-assistant", "role:arabsstock"],
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "wakeb-agents",
    value: same("6"),
    label: l("agents in Wakeb Data's bilingual production chatbot", "وكلاء في روبوت محادثة ثنائي اللغة لدى Wakeb Data، في بيئة الإنتاج"),
    detail: l(
      "Fully async, Arabic and English, on Qwen served with vLLM on A100 GPUs.",
      "بمعالجة غير متزامنة بالكامل، بالعربية والإنجليزية، على Qwen المستضاف عبر vLLM على وحدات A100.",
    ),
    featured: true,
    evidence: ["case:wakeb-bilingual-chatbot", "role:wakeb"],
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "assets-indexed",
    value: l("Millions", "ملايين"),
    label: l("of ArabsStock media files made searchable", "من ملفات الوسائط في ArabsStock مفهرسة للبحث الذكي"),
    detail: l(
      "Semantic search (OpenAI embeddings + Pinecone) and visual-similarity search over ArabsStock's photos, videos and vector graphics.",
      "بحث دلالي (تضمينات OpenAI مع Pinecone) وبحث بالتشابه البصري في صور ArabsStock ومقاطع الفيديو والرسومات المتجهة.",
    ),
    featured: true,
    evidence: ["case:arabsstock-assistant", "role:arabsstock"],
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "gpu-serving",
    value: same("A100"),
    label: l("GPUs serving Qwen through vLLM", "وحدات GPU تشغّل Qwen عبر vLLM"),
    detail: l(
      "Serving configuration, GPU allocation, model versions, health checks and automated restarts across multiple production GPU servers.",
      "إعدادات الخدمة، وتخصيص وحدات GPU، وإصدارات النماذج، وفحوص الحالة، وإعادة التشغيل التلقائي على عدة خوادم GPU في بيئة الإنتاج.",
    ),
    featured: false,
    evidence: ["case:wakeb-bilingual-chatbot", "role:wakeb"],
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "developers-unified",
    value: same("3,008+"),
    label: l("real-estate developers' data unified", "من المطوّرين العقاريين توحّدت بياناتهم"),
    detail: l(
      "Each with its own schema, merged to scale Empoweromics' real-time e-map.",
      "لكلٍّ منهم مخطط بيانات مختلف، ودُمجت بياناتهم جميعًا لدعم توسّع الخريطة الإلكترونية المحدثة لحظيًا في Empoweromics.",
    ),
    featured: false,
    evidence: ["case:empoweromics-ml", "role:empoweromics"],
    source: ["linkedin", "github"],
  },
  {
    id: "bilingual",
    value: same("AR + EN"),
    label: l("in most of what I've shipped", "في معظم ما أطلقته"),
    detail: l(
      "The Wakeb chatbot, the assistant for a Saudi government client and Empoweromics' Smart Search all work in Arabic and English.",
      "روبوت المحادثة في Wakeb، والمساعد المؤسسي لجهة حكومية سعودية، والبحث الذكي في Empoweromics، تعمل جميعها بالعربية والإنجليزية.",
    ),
    featured: false,
    evidence: ["case:wakeb-bilingual-chatbot", "case:gov-bilingual-assistant", "case:empoweromics-ml"],
    source: ["github", "cv"],
  },
];

const experience: readonly Role[] = [
  {
    id: "globant",
    company: same("Globant"),
    companyUrl: "https://www.globant.com",
    logo: { file: "globant", monogram: "G" },
    title: l("AI Team Lead", "قائد فريق ذكاء اصطناعي"),
    employmentType: "full-time",
    period: { start: "2026-04", end: null },
    location: l("Remote, from Cairo", "عن بُعد من القاهرة"),
    workMode: "remote",
    summary: l(
      "Leading a team of 7 and the AI engineering on the Saudi Tourism Authority (STA) project.",
      "قيادة فريق من 7 أعضاء وهندسة الذكاء الاصطناعي في مشروع الهيئة السعودية للسياحة (STA).",
    ),
    bullets: [
      // Confirmed by Mohamed (2026-10-10) from the project documents: one agentic LangGraph runtime (not multi-agent)
      // on managed models, accepted in the client's UAT (so never "in production"). He approved naming the client and
      // the visitor assistant, Noura. Nothing beyond this sentence until the STA case study is written.
      factB(
        ["Saudi Tourism Authority (STA) project", "مشروع الهيئة السعودية للسياحة (STA)"],
        "Leading AI engineering on the Saudi Tourism Authority (STA) project: an agentic LLM runtime (LangGraph) with retrieval, human-approval gates and evaluation, serving Noura, the public visitor assistant, and an internal staff assistant, in Arabic and English.",
        "قيادة هندسة الذكاء الاصطناعي في مشروع الهيئة السعودية للسياحة (STA): بيئة تشغيل على LangGraph لوكيل ذكي قائم على النماذج اللغوية، تجمع الاسترجاع ونقاط الموافقة البشرية والتقييم، وتخدم «نورة»، المساعد الافتراضي للزوار، ومساعدًا داخليًا للموظفين، بالعربية والإنجليزية.",
        "mohamed",
      ),
      // Round 6 (HM-08): the team of 7 is Mohamed's figure (2026-10-11); no team practices, hiring or reports beyond
      // it. The rest is the CV's approved second bullet (one agent, the tool counts, the approval rule, the UAT).
      // Round 7 (R7-03): the approval rule as the case study defines it (a booking or an order waits for the user), not
      // "human approval before every action", which reads as a person approving each of 96 tool calls.
      factB(
        ["team of 7", "فريق من 7 أعضاء"],
        "Leading a team of 7. The runtime is one LangGraph agent behind 96 tools (27 visible to visitors); every booking or order waits for the user's confirmation. Noura was accepted in the client's UAT in September 2026.",
        "قيادة فريق من 7 أعضاء. تقوم بيئة التشغيل على وكيل LangGraph واحد مزوّد بـ96 أداة، منها 27 متاحة للزوار، ولا يُنفَّذ أي حجز أو طلب إلا بعد تأكيد المستخدم. واعتمد العميل «نورة» في اختبار قبول المستخدم (UAT) في سبتمبر 2026.",
        "mohamed",
      ),
    ],
    cvBullets: [
      // Round 7 (R7-14): the CV summary carries the approved STA sentence, so this bullet adds the case study's facts
      // instead of repeating it: the audience gate (the case study's name for the permission layer) and the sourced
      // answers. One agent, never "multi-agent"; never "in production".
      factB(
        ["Saudi Tourism Authority (STA) project", "مشروع الهيئة السعودية للسياحة (STA)"],
        "Saudi Tourism Authority (STA) project: one agent serves both assistants; an audience gate sets the tools and knowledge each session may use, so a visitor never reaches staff tools or data. Answers cite the authority's content.",
        "مشروع الهيئة السعودية للسياحة (STA): وكيل واحد يخدم المساعدَين، وطبقة صلاحيات تحدّد الأدوات والمعرفة المتاحة لكل جلسة، فلا يصل الزائر إلى أدوات الموظفين أو بياناتهم، والإجابات تستند إلى محتوى الهيئة مع مصادرها.",
        "mohamed",
      ),
      // Approved for the CV by Mohamed (2026-10-10), from the STA case study: one agent (never "multi-agent"), the
      // tool counts, the approval rule and the UAT acceptance (never "in production" or "launched").
      // Round 6 (HM-08): led by the team of 7 (the CV summary bolds it, so this line keeps its own receipt).
      // Round 7 (R7-03): the precise approval rule (see the site bullet above).
      factB(
        ["one LangGraph agent behind 96 tools", "وكيل LangGraph واحد مزوّد بـ96 أداة"],
        "Leading a team of 7. The runtime is one LangGraph agent behind 96 tools (27 visible to visitors); every booking or order waits for the user's confirmation. Noura was accepted in the client's UAT in September 2026.",
        "قيادة فريق من 7 أعضاء. تقوم بيئة التشغيل على وكيل LangGraph واحد مزوّد بـ96 أداة، منها 27 متاحة للزوار، ولا يُنفَّذ أي حجز أو طلب إلا بعد تأكيد المستخدم. واعتمد العميل «نورة» في اختبار قبول المستخدم (UAT) في سبتمبر 2026.",
        "mohamed",
      ),
    ],
    // Round 7 (R7-18): the case study's stack, so the role, the card and the case page name the same tools.
    tech: ["LangGraph", "Python", "FastAPI", "RAG", l("LLM evaluation", "تقييم النماذج اللغوية"), "React", "TypeScript"],
    caseStudies: ["sta-tourism-assistants"],
    honors: [],
    primary: true,
    source: ["mohamed", "linkedin", "github"],
  },
  {
    id: "wakeb",
    company: same("Wakeb Data"),
    logo: { file: "wakeb", monogram: "W" },
    title: l("Senior AI & MLOps Engineer", "مهندس ذكاء اصطناعي وMLOps أول"),
    employmentType: "full-time",
    period: { start: "2024-09", end: "2026-04" },
    location: l("Giza, Egypt", "الجيزة، مصر"),
    workMode: "hybrid",
    summary: l(
      "Built and ran a 6-agent bilingual chatbot in production, with hybrid RAG and self-hosted Qwen on A100 GPUs.",
      "بناء روبوت محادثة ثنائي اللغة من 6 وكلاء وتشغيله في بيئة الإنتاج، مع بحث هجين لخطوط RAG ونموذج Qwen ذاتي الاستضافة على وحدات A100.",
    ),
    bullets: [
      factB(
        ["6-agent bilingual (Arabic/English) chatbot", "روبوت محادثة ثنائي اللغة (عربي/إنجليزي) من 6 وكلاء"],
        "Architected and deployed a 6-agent bilingual (Arabic/English) chatbot in LangGraph: fully async, built from modular subgraphs, with agents routed by LangGraph's Command instead of fixed edges.",
        "تصميم روبوت محادثة ثنائي اللغة (عربي/إنجليزي) من 6 وكلاء على LangGraph ونشره، بمعالجة غير متزامنة بالكامل ومخططات فرعية معيارية، مع توجيه بين وكلائه عبر Command بدلًا من الحواف الثابتة.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["model-serving lifecycle for Qwen on vLLM", "دورة حياة خدمة النماذج لـQwen على vLLM"],
        "Owned the model-serving lifecycle for Qwen on vLLM: serving configuration, A100 GPU allocation, model versions, health monitoring and automated restarts across multiple production GPU servers.",
        "إدارة دورة حياة خدمة النماذج لـQwen على vLLM بالكامل: إعدادات الخدمة، وتخصيص وحدات A100، وإصدارات النماذج، ومراقبة الحالة، وإعادة التشغيل التلقائي على عدة خوادم GPU في بيئة الإنتاج.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["hybrid retrieval for RAG", "استرجاع هجين لخطوط RAG"],
        "Built hybrid retrieval for RAG (vector + BM25, reranked by an LLM) with SQLite node-level caching and web search through the Brave Search MCP server, shipped as Dockerised FastAPI services behind Nginx.",
        "بناء استرجاع هجين لخطوط RAG (بحث متجهي مع BM25 وإعادة ترتيب بنموذج لغوي)، مع تخزين مؤقت على مستوى العُقد عبر SQLite، وبحث على الويب من خلال خادم Brave Search MCP، ونشره كخدمات FastAPI في حاويات Docker خلف Nginx.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["version 2 of the AI semantic search", "الإصدار الثاني من البحث الدلالي"],
        "Designed version 2 of the AI semantic search for the AIP project: more accurate retrieval, faster search and better image search.",
        "تصميم الإصدار الثاني من البحث الدلالي المدعوم بالذكاء الاصطناعي لمشروع AIP: استرجاع أدق، وبحث أسرع، وقدرات أفضل في البحث بالصور.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["bilingual enterprise assistant", "مساعد مؤسسي ثنائي اللغة"],
        "Built a bilingual enterprise assistant (Arabic/English) for a Saudi government client, with LLM evaluation and observability to monitor answer quality.",
        "بناء مساعد مؤسسي ثنائي اللغة (عربي/إنجليزي) لجهة حكومية سعودية، مع تقييم للنماذج اللغوية ومراقبة مستمرة لجودة الإجابات.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["Wakeb Papers Research Agent", "Wakeb Papers Research Agent"],
        "Developed the Wakeb Papers Research Agent for searching and analysing academic papers, with agent memory and multi-turn conversational context.",
        "تطوير Wakeb Papers Research Agent للبحث في الأوراق العلمية وتحليلها، مع ذاكرة للوكيل وسياق محادثة متعدد الجولات.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["REST to gRPC", "من REST إلى gRPC"],
        "Migrated key APIs from REST to gRPC to cut latency between microservices.",
        "نقل واجهات برمجية أساسية من REST إلى gRPC لخفض زمن الاستجابة بين الخدمات المصغّرة.",
        "cv",
        "linkedin",
        "github",
      ),
      fact(
        "Ran CI/CD and containerised deployments (Docker, Git, shell-scripted automation) across development and production.",
        "إدارة CI/CD وعمليات النشر بالحاويات (Docker وGit وأتمتة بسكربتات shell) في بيئتي التطوير والإنتاج.",
        "cv",
        "linkedin",
      ),
    ],
    // Round 7 (R7-04): each bullet a line shorter (same facts), so the ArabsStock role fits on the CV's first page.
    cvBullets: [
      factB(
        ["6-agent bilingual (Arabic/English) LangGraph chatbot", "روبوت محادثة ثنائي اللغة (عربي/إنجليزي) من 6 وكلاء"],
        "Architected and deployed a fully async 6-agent bilingual (Arabic/English) LangGraph chatbot on Qwen, served with vLLM on NVIDIA A100 GPUs.",
        "تصميم روبوت محادثة ثنائي اللغة (عربي/إنجليزي) من 6 وكلاء على LangGraph ونشره، بمعالجة غير متزامنة بالكامل، على Qwen المستضاف عبر vLLM على وحدات NVIDIA A100.",
        "cv", "linkedin", "github",
      ),
      factB(
        ["model serving on multiple production GPU servers", "خدمة النماذج على عدة خوادم GPU"],
        "Owned model serving on multiple production GPU servers: vLLM setup, GPU allocation, model versions, health checks, automated restarts.",
        "تولّي خدمة النماذج على عدة خوادم GPU: إعدادات vLLM، وتخصيص وحدات GPU، وإصدارات النماذج، ومراقبة الحالة، وإعادة التشغيل التلقائي.",
        "cv", "linkedin", "github",
      ),
      factB(
        ["hybrid RAG", "بحث هجين لخطوط RAG"],
        "Built hybrid RAG (vector + BM25, LLM reranking), node caching and Brave Search over MCP, as Dockerised FastAPI services behind Nginx.",
        "بناء بحث هجين لخطوط RAG (متجهي مع BM25 وإعادة ترتيب بنموذج لغوي)، وتخزين مؤقت للعُقد، وBrave Search عبر MCP، كخدمات FastAPI في Docker خلف Nginx.",
        "cv", "linkedin", "github",
      ),
      // Round 6 (HM-03): the government assistant stays off the CV, which names this role's client (GADD) right above
      // the bullets: the two must never sit in the same block. The site keeps it as a brief case study.
      factB(
        ["AIP semantic search v2", "الإصدار الثاني من البحث الدلالي لمشروع AIP"],
        "Designed AIP semantic search v2, built the Wakeb Papers Research Agent with agent memory, and moved key APIs from REST to gRPC.",
        "تصميم الإصدار الثاني من البحث الدلالي لمشروع AIP، وتطوير Wakeb Papers Research Agent بذاكرة للوكيل، ونقل واجهات أساسية من REST إلى gRPC.",
        "cv", "linkedin", "github",
      ),
    ],
    tech: [
      "LangGraph",
      "Qwen",
      "vLLM",
      "NVIDIA A100",
      "RAG",
      "BM25",
      l("LLM reranking", "إعادة الترتيب بنموذج لغوي"),
      "MCP",
      "FastAPI",
      "gRPC",
      "Docker",
      "Nginx",
      "SQLite",
      "CI/CD",
    ],
    caseStudies: ["wakeb-bilingual-chatbot", "aip-semantic-search", "gov-bilingual-assistant"],
    honors: [],
    primary: true,
    // Named by Mohamed (2026-10-10) for the CV, at the role level only. It is not attached to any project or bullet,
    // and the bilingual government assistant (whose client stays unnamed) is not in this role's CV block at all.
    client: {
      name: l("Saudi Ministry of Defense (GADD)", "وزارة الدفاع السعودية (GADD)"),
      source: ["mohamed"],
    },
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "arabsstock",
    company: same("ArabsStock"),
    logo: { file: "arabsstock", monogram: "AS" },
    title: l("AI Engineer", "مهندس ذكاء اصطناعي"),
    employmentType: "full-time",
    period: { start: "2023-04", end: "2024-12" },
    location: l("Remote (Dubai, UAE)", "عن بُعد (دبي، الإمارات)"),
    workMode: "remote",
    summary: l(
      "Built a 14-agent assistant and the AI search behind millions of stock photos, videos and vector graphics.",
      "بناء مساعد من 14 وكيلًا، والبحث الذكي في ملايين الصور ومقاطع الفيديو والرسومات المتجهة.",
    ),
    bullets: [
      factB(
        ["ArabsStock Assistant", "مساعد ArabsStock"],
        "Architected and built the ArabsStock Assistant: 14 specialised agents orchestrated with LangGraph for semantic search, AI image generation, database operations, content moderation and other AI services across the platform.",
        "تصميم مساعد ArabsStock وبناؤه: 14 وكيلًا متخصصًا ينسّقها LangGraph، تغطي البحث الدلالي، وتوليد الصور بالذكاء الاصطناعي، وعمليات قواعد البيانات، والإشراف على المحتوى، وخدمات ذكاء اصطناعي أخرى على المنصة.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["semantic search pipeline", "خط البحث الدلالي"],
        "Built the semantic search pipeline (OpenAI embeddings + Pinecone) with automated batch ingestion, indexing millions of royalty-free photos, videos and vector graphics.",
        "بناء خط البحث الدلالي (تضمينات OpenAI مع Pinecone) مع إدخال آلي على دفعات، وفهرسة ملايين الصور ومقاطع الفيديو والرسومات المتجهة.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["visual-similarity image search", "بحث بالصور يعتمد على التشابه البصري"],
        "Added visual-similarity image search across the whole media library.",
        "إضافة بحث بالصور يعتمد على التشابه البصري في مكتبة الوسائط كاملة.",
        "linkedin",
        "cv",
        "github",
      ),
      factB(
        ["into audio", "لتشمل الصوت"],
        "Took the platform into audio: sound generation and search for a beta sound library, instrument classification, BPM detection and audio watermarking. The model endpoints ran as containerised FastAPI microservices.",
        "توسيع المنصة لتشمل الصوت: توليد الأصوات والبحث فيها لمكتبة صوتية تجريبية، وتصنيف الآلات الموسيقية، واكتشاف سرعة الإيقاع (BPM)، والعلامات المائية الصوتية، مع تشغيل نقاط النماذج كخدمات FastAPI مصغّرة في حاويات.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["LLM agent evaluation", "سير عمل لتقييم الوكلاء"],
        "Set up LLM agent evaluation to track reliability, response accuracy and agent routing in production.",
        "بناء سير عمل لتقييم الوكلاء يتابع موثوقية النظام ودقة الإجابات وجودة التوجيه بين الوكلاء في بيئة الإنتاج.",
        "cv",
      ),
      factB(
        ["raw video and audio", "الفيديو والصوت الخام"],
        "Built production pipelines for raw video and audio, including footage from ArabsStock studios: quality optimisation and metadata enrichment.",
        "بناء خطوط معالجة في بيئة الإنتاج لمواد الفيديو والصوت الخام، ومنها لقطات من استوديوهات ArabsStock: تحسين الجودة وإثراء البيانات الوصفية.",
        "cv",
        "linkedin",
      ),
    ],
    // Round 7 (R7-04): tighter wording (same facts), so the whole role, its evaluation bullet included, stays on the
    // CV's first page instead of leaving that bullet alone at the top of page 2.
    cvBullets: [
      factB(
        ["ArabsStock Assistant: 14 LangGraph agents", "14 وكيلًا على LangGraph"],
        "Architected the ArabsStock Assistant: 14 LangGraph agents for semantic search, AI image generation, database operations and moderation.",
        "تصميم مساعد ArabsStock وبناؤه: 14 وكيلًا على LangGraph للبحث الدلالي، وتوليد الصور، وعمليات قواعد البيانات، والإشراف على المحتوى.",
        "cv", "linkedin", "github",
      ),
      factB(
        ["millions of photos, videos and vector graphics", "ملايين الصور ومقاطع الفيديو والرسومات المتجهة"],
        "Built semantic search (OpenAI embeddings, Pinecone, batch ingestion) over millions of photos, videos and vector graphics, plus visual search.",
        "بناء بحث دلالي (تضمينات OpenAI وPinecone وإدخال على دفعات) في ملايين الصور ومقاطع الفيديو والرسومات المتجهة، مع بحث بصري.",
        "cv", "linkedin", "github",
      ),
      factB(
        ["audio AI", "قدرات صوتية"],
        "Shipped audio AI for a beta sound library (generation, search, instrument classification, BPM detection, watermarking) as FastAPI services.",
        "إطلاق قدرات صوتية لمكتبة صوتية تجريبية (توليد وبحث، وتصنيف الآلات، واكتشاف سرعة الإيقاع، وعلامات مائية) كخدمات FastAPI.",
        "cv", "linkedin", "github",
      ),
      factB(
        ["agent evaluation", "تقييم للوكلاء"],
        "Set up agent evaluation to track reliability, response accuracy and routing in production.",
        "بناء تقييم للوكلاء يتابع الموثوقية ودقة الإجابات وجودة التوجيه في بيئة الإنتاج.",
        "cv",
      ),
    ],
    // Round 7 (HM-32): no vLLM or NVIDIA A100 here: no bullet of this role says how they were used (LinkedIn tags them).
    tech: ["LangGraph", "OpenAI API", "Pinecone", "Python", "FastAPI", "PostgreSQL", "Docker"],
    caseStudies: ["arabsstock-assistant"],
    honors: [],
    primary: true,
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "tabaqat",
    company: same("Tabaqat"),
    logo: { file: null, monogram: "T" },
    title: l("Software Engineer", "مهندس برمجيات"),
    employmentType: "part-time",
    period: { start: "2023-02", end: "2024-05" },
    location: l("Remote (Saudi Arabia)", "عن بُعد (السعودية)"),
    workMode: "remote",
    summary: l(
      "Designed and ran the GIS data pipelines and deployed map serving, part-time.",
      "تصميم خطوط بيانات GIS وتشغيلها ونشر حلول خدمة الخرائط، بدوام جزئي.",
    ),
    bullets: [
      factB(
        ["all data pipelines in Prefect", "جميع خطوط البيانات"],
        "Designed and managed all data pipelines in Prefect, including ETL for GIS data from Saudi government sources.",
        "تصميم جميع خطوط البيانات وإدارتها باستخدام Prefect، ومنها عمليات ETL لبيانات GIS من مصادر حكومية سعودية.",
        "cv",
      ),
      factB(
        ["AWS Athena and DuckDB", "AWS Athena وDuckDB"],
        "Queried geospatial data from Overture Maps with AWS Athena and DuckDB for spatial analytics.",
        "استعلام البيانات الجغرافية المكانية من Overture Maps عبر AWS Athena وDuckDB لتطبيقات التحليل المكاني.",
        "cv",
      ),
      fact(
        "Deployed map serving and visualisation with MapProxy, Kepler.gl, MapLibre and MBTileServer.",
        "نشر حلول عرض الخرائط والتمثيل المرئي للبيانات باستخدام MapProxy وKepler.gl وMapLibre وMBTileServer.",
        "cv",
      ),
    ],
    cvBullets: [
      factB(
        ["all data pipelines in Prefect", "جميع خطوط البيانات"],
        "Designed and managed all data pipelines in Prefect, including ETL for GIS data from Saudi government sources.",
        "تصميم جميع خطوط البيانات وإدارتها عبر Prefect، ومنها عمليات ETL لبيانات GIS من مصادر حكومية سعودية.",
        "cv",
      ),
      fact(
        "Queried Overture Maps with AWS Athena and DuckDB; deployed map serving with MapProxy, MBTileServer, MapLibre and Kepler.gl.",
        "الاستعلام في Overture Maps عبر AWS Athena وDuckDB، ونشر خدمة الخرائط باستخدام MapProxy وMBTileServer وMapLibre وKepler.gl.",
        "cv",
      ),
    ],
    tech: ["Prefect", "AWS Athena", "DuckDB", "Overture Maps", "MapProxy", "Kepler.gl", "MapLibre", "MBTileServer"],
    caseStudies: ["tabaqat-gis"],
    honors: [],
    primary: false,
    source: ["cv"],
  },
  {
    id: "empoweromics",
    company: same("Empoweromics"),
    logo: { file: "empoweromics", monogram: "E" },
    title: l("Data Scientist", "عالم بيانات"),
    employmentType: "full-time",
    period: { start: "2022-01", end: "2023-03" },
    location: l("Cairo, Egypt", "القاهرة، مصر"),
    workMode: null,
    summary: l(
      "Unified data from 3,008+ real-estate developers and built lead-scoring and message-routing models. Named Best Engineer of the Year.",
      "توحيد بيانات أكثر من 3,008 من المطوّرين العقاريين، وبناء نماذج لترتيب أولوية العملاء وتوجيه الرسائل، ونيل جائزة أفضل مهندس للعام.",
    ),
    bullets: [
      factB(
        ["3,008+ real-estate developers", "أكثر من 3,008 من المطوّرين العقاريين"],
        "Designed a data integration system that merged data from 3,008+ real-estate developers, each with its own schema, to scale the company's real-time e-map.",
        "تصميم نظام لتكامل البيانات يدمج بيانات أكثر من 3,008 من المطوّرين العقاريين، لكلٍّ منهم مخطط بيانات مختلف، لدعم توسّع الخريطة الإلكترونية المحدثة لحظيًا للشركة.",
        "linkedin",
        "github",
      ),
      factB(
        ["7 client lifecycle stages", "7 مراحل في دورة حياته"],
        "Built classification models for 7 client lifecycle stages (Inactive, Assigned, In Progress, Lost, Won, Void, Active) so brokers could prioritise high-value leads.",
        "بناء نماذج تصنيف تتنبأ بمرحلة العميل من بين 7 مراحل في دورة حياته (غير نشط، ومُسنَد، وقيد المتابعة، ومفقود، ومكسوب، وملغى، ونشط)، ليُركّز الوسطاء على العملاء الأعلى قيمة.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["WhatsApp message classification", "نظام لتصنيف رسائل WhatsApp"],
        "Built automatic WhatsApp message classification for text and images (NLP + computer vision), routing each message to Tech, HR, Accounting, Operations or Marketing.",
        "بناء نظام لتصنيف رسائل WhatsApp تلقائيًا، نصوصًا وصورًا (NLP ورؤية حاسوبية)، وتوجيه كل رسالة إلى القسم المختص: قسم التقنية أو الموارد البشرية أو المحاسبة أو العمليات أو التسويق.",
        "cv",
        "linkedin",
        "github",
      ),
      factB(
        ["Smart Search", "Smart Search"],
        "Built Smart Search: fuzzy client lookup that finds the right record from misspelled or partial Arabic and English names.",
        "بناء «Smart Search»: بحث تقريبي (fuzzy) عن العملاء يصل إلى السجل الصحيح حتى مع الأخطاء الإملائية أو الأسماء الناقصة، بالعربية والإنجليزية.",
        "cv",
        "linkedin",
        "github",
      ),
      fact(
        "Designed ETL from Cosmos DB (NoSQL) to Microsoft SQL Server, scheduled with Azure Functions.",
        "تصميم عمليات ETL لنقل البيانات من Cosmos DB (NoSQL) إلى Microsoft SQL Server، مجدولة عبر Azure Functions.",
        "cv",
        "linkedin",
        "github",
      ),
    ],
    cvBullets: [
      factB(
        ["3,008+ real-estate developers", "أكثر من 3,008 من المطوّرين العقاريين"],
        "Unified data from 3,008+ real-estate developers, each with its own schema, to scale the company's real-time e-map.",
        // "لكل" without shadda and tanween here: the PDF's text layer copied the marks as U+0000 (audit cvpdf-13).
        "توحيد بيانات أكثر من 3,008 من المطوّرين العقاريين، لكل منهم مخطط بيانات مختلف، لدعم توسّع الخريطة الإلكترونية المحدثة لحظيًا للشركة.",
        "linkedin", "github",
      ),
      factB(
        ["text + image WhatsApp classification", "تصنيف لرسائل WhatsApp نصًا وصورة"],
        "Built lead-lifecycle models (7 stages) for broker prioritisation, and text + image WhatsApp classification that routes messages to the right department.",
        "بناء نماذج لمراحل دورة حياة العميل (7 مراحل) لترتيب أولويات الوسطاء، وتصنيف لرسائل WhatsApp نصًا وصورة يوجّهها إلى القسم المختص.",
        "cv", "linkedin",
      ),
      // Round 6 (HM-25): the name-to-gender model is no longer listed (a sensitive-attribute inference).
      fact(
        "Built Smart Search: fuzzy lookup over misspelled or partial Arabic/English names.",
        "بناء Smart Search: بحث تقريبي يتحمّل الأخطاء الإملائية والأسماء الناقصة بالعربية والإنجليزية.",
        "cv", "linkedin",
      ),
      fact(
        "Designed ETL from Cosmos DB to SQL Server, scheduled with Azure Functions.",
        "تصميم عمليات ETL من Cosmos DB إلى SQL Server مجدولة عبر Azure Functions.",
        "cv", "linkedin",
      ),
    ],
    tech: ["Python", "PyTorch", "NLP", l("Computer vision", "الرؤية الحاسوبية"), "Azure Functions", "Cosmos DB", "SQL Server", "Firebase", "Flutter"],
    caseStudies: ["empoweromics-ml"],
    honors: ["best-engineer-empoweromics"],
    primary: true,
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "buid",
    company: l(
      "The British University in Dubai · Umm Al-Qura University",
      "الجامعة البريطانية في دبي · جامعة أم القرى",
    ),
    logo: { file: "buid", monogram: "BU" },
    title: l("AI Research Assistant", "مساعد باحث في الذكاء الاصطناعي"),
    employmentType: "part-time",
    period: { start: "2022-03", end: "2022-11" },
    location: l("Remote (Dubai, UAE)", "عن بُعد (دبي، الإمارات)"),
    workMode: "remote",
    summary: l(
      "Research assistant, AI lecturer and mentor for master's students at two universities.",
      "مساعد باحث ومحاضر وموجّه في الذكاء الاصطناعي لطلاب ماجستير في جامعتين.",
    ),
    bullets: [
      fact(
        "Primary research assistant to two master's students in biomedical informatics at The British University in Dubai, an engineer and a pharmacist.",
        "مساعد باحث رئيسي لطالبَي ماجستير في المعلوماتية الطبية الحيوية بالجامعة البريطانية في دبي، أحدهما مهندس والآخر صيدلي.",
        "linkedin",
        "github",
      ),
      fact(
        "Gave lectures and training sessions on linear algebra, probability and statistics, machine learning, deep learning, data mining, recommender systems and natural language understanding.",
        "تقديم محاضرات وجلسات تدريبية في الجبر الخطي، والاحتمالات والإحصاء، وتعلّم الآلة، والتعلّم العميق، والتنقيب في البيانات، ونظم التوصية، وفهم اللغة الطبيعية.",
        "linkedin",
      ),
      fact(
        "Mentored master's research at BUID and Umm Al-Qura University on text summarisation, recommender systems and classification models.",
        "توجيه طلاب ماجستير في مشروعاتهم البحثية في الجامعة البريطانية في دبي وجامعة أم القرى، في تلخيص النصوص ونظم التوصية ونماذج التصنيف.",
        "cv",
        "linkedin",
      ),
    ],
    cvBullets: [
      fact(
        "Research assistant and AI lecturer for master's students in biomedical informatics at BUID; mentored master's research at BUID and Umm Al-Qura University.",
        "مساعد باحث ومحاضر في الذكاء الاصطناعي لطلاب ماجستير المعلوماتية الطبية الحيوية في الجامعة البريطانية في دبي، وتوجيه أبحاث ماجستير فيها وفي جامعة أم القرى.",
        "linkedin", "cv",
      ),
    ],
    tech: [l("Machine learning", "تعلّم الآلة"), l("Deep learning", "التعلّم العميق"), "NLP", l("Recommender systems", "نظم التوصية")],
    caseStudies: [],
    honors: [],
    primary: false,
    source: ["linkedin", "cv", "github"],
  },
  {
    id: "mtc",
    company: l("Military Technical College", "الكلية الفنية العسكرية"),
    logo: { file: null, monogram: "MTC" },
    title: l("AI Instructor", "محاضر في الذكاء الاصطناعي"),
    employmentType: "part-time",
    period: { start: "2022-08", end: "2022-08" },
    location: l("Cairo, Egypt", "القاهرة، مصر"),
    workMode: null,
    summary: l(
      "Taught AI to engineers in the Egyptian Armed Forces.",
      "تدريس الذكاء الاصطناعي لمهندسين في القوات المسلحة المصرية.",
    ),
    bullets: [
      fact(
        "Delivered specialised AI courses to engineers in the Egyptian Armed Forces: machine-learning fundamentals, deep learning and practical deployment.",
        "تقديم دورات متخصصة في الذكاء الاصطناعي لمهندسين في القوات المسلحة المصرية: أساسيات تعلّم الآلة، والتعلّم العميق، والتطبيق العملي ونشر النماذج.",
        "cv",
        "linkedin",
      ),
    ],
    cvBullets: [
      fact(
        "Taught AI courses (ML fundamentals, deep learning, deployment) to engineers in the Egyptian Armed Forces.",
        "تدريس دورات في الذكاء الاصطناعي (أساسيات تعلّم الآلة، والتعلّم العميق، ونشر النماذج) لمهندسين في القوات المسلحة المصرية.",
        "cv", "linkedin",
      ),
    ],
    tech: [l("Machine learning", "تعلّم الآلة"), l("Deep learning", "التعلّم العميق")],
    caseStudies: [],
    honors: [],
    primary: false,
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "aestheticspro",
    company: l("AestheticsPro (US healthcare software)", "AestheticsPro (برمجيات رعاية صحية أمريكية)"),
    logo: { file: "aestheticspro", monogram: "AP" },
    title: l("Freelance Data Scientist", "عالم بيانات مستقل"),
    employmentType: "freelance",
    period: { start: "2022-02", end: "2022-04" },
    location: l("Remote (Washington, US)", "عن بُعد (واشنطن، الولايات المتحدة)"),
    workMode: "remote",
    summary: l(
      "Healthcare data analytics, dashboards and patient-retention modelling for AestheticsPro, a US healthcare software company.",
      "تحليلات بيانات صحية ولوحات معلومات ونمذجة الاحتفاظ بالمرضى لشركة AestheticsPro الأمريكية لبرمجيات الرعاية الصحية.",
    ),
    bullets: [
      fact(
        "Scraped and cleaned healthcare data and loaded it into SQL Server for structured storage and retrieval.",
        "جمع بيانات صحية من الويب وتنظيفها وتحميلها إلى SQL Server لتخزينها واسترجاعها بشكل منظّم.",
        "linkedin",
      ),
      fact(
        "Explored the data and built a detailed dashboard for stakeholders.",
        "تحليل استكشافي للبيانات وبناء لوحة معلومات تفصيلية لأصحاب القرار.",
        "linkedin",
      ),
      fact(
        "Built ML models that flag patients likely to leave, used to target retention offers.",
        "بناء نماذج تعلّم آلة ترصد المرضى المرجّح انقطاعهم، لاستهدافهم بعروض تحافظ عليهم.",
        "linkedin",
      ),
    ],
    cvBullets: [
      fact(
        "Scraped, cleaned and loaded healthcare data into SQL Server; built EDA and a stakeholder dashboard.",
        "جمع بيانات صحية وتنظيفها وتحميلها إلى SQL Server، مع تحليل استكشافي ولوحة معلومات لأصحاب القرار.",
        "linkedin",
      ),
      fact(
        "Built ML models predicting patient retention, used to target retention offers.",
        "بناء نماذج تعلّم آلة تتنبأ باحتفاظ المرضى بالخدمة، لاستهدافهم بعروض تحافظ عليهم.",
        "linkedin",
      ),
    ],
    tech: [l("Web scraping", "جمع البيانات من الويب"), "SQL Server", l("Exploratory data analysis", "التحليل الاستكشافي للبيانات"), l("Dashboards", "لوحات المعلومات"), l("Machine learning", "تعلّم الآلة")],
    caseStudies: [],
    honors: [],
    primary: false,
    source: ["linkedin", "mohamed"],
  },
  {
    id: "mdp",
    company: same("Misria Digital Payments (MDP)"),
    logo: { file: "mdp", monogram: "MDP" },
    title: l("SQL Developer", "مطوّر SQL"),
    employmentType: "full-time",
    period: { start: "2020-01", end: "2021-01" },
    location: l("Cairo, Egypt", "القاهرة، مصر"),
    workMode: null,
    summary: l(
      "SQL development and performance tuning for production payment systems.",
      "تطوير SQL وتحسين الأداء لأنظمة مدفوعات تعمل في بيئة الإنتاج.",
    ),
    bullets: [
      fact(
        "Wrote and optimised complex SQL stored procedures for production payment systems.",
        "كتابة إجراءات SQL مخزّنة معقّدة لأنظمة مدفوعات في بيئة الإنتاج وتحسينها.",
        "cv",
        "linkedin",
      ),
      fact(
        "Tuned large SQL statements, stored procedures and views to cut execution time, and looked after database integrity and security.",
        "ضبط استعلامات SQL الكبيرة والإجراءات المخزّنة وطرق العرض لتقليل زمن التنفيذ، والحفاظ على سلامة قواعد البيانات وأمانها.",
        "linkedin",
        "cv",
      ),
    ],
    cvBullets: [
      fact(
        "Developed and optimised complex SQL stored procedures for production payment systems; query tuning and database administration.",
        "تطوير إجراءات SQL مخزّنة معقّدة لأنظمة مدفوعات في بيئة الإنتاج وتحسينها، مع ضبط الاستعلامات وإدارة قواعد البيانات.",
        "cv", "linkedin",
      ),
    ],
    tech: ["SQL", l("Stored procedures", "الإجراءات المخزّنة"), l("Query tuning", "ضبط الاستعلامات"), "RDBMS"],
    caseStudies: [],
    honors: [],
    primary: false,
    source: ["cv", "linkedin", "github"],
  },
];

const caseStudies: readonly CaseStudy[] = [
  // Saudi Tourism Authority (STA), through Globant. Named with written approval from Globant and STA (relayed
  // 2026-10-10), as are the products: Noura (the public visitor assistant) and the internal staff assistant. Kept
  // deliberately light at Mohamed's request: the only figure is "96 tools, 27 visible to visitors" behind one agent;
  // it is one agentic runtime (never "multi-agent") and Noura was accepted in the client's UAT in September 2026
  // (never "in production" or "launched"). He leads the AI engineering (present tense: his current role), with a team
  // of 7 (round 7, R7-02), not the project.
  {
    slug: "sta-tourism-assistants",
    order: 1,
    featured: true,
    depth: "full",
    title: l(
      "Saudi Tourism Authority: Noura for visitors and an AI assistant for staff",
      "الهيئة السعودية للسياحة: «نورة» للزوار ومساعد ذكي للموظفين",
    ),
    shortTitle: l("STA: Noura and the staff assistant", "هيئة السياحة: نورة ومساعد الموظفين"),
    context: l("Globant, for the Saudi Tourism Authority (STA)", "Globant، لصالح الهيئة السعودية للسياحة"),
    roleId: "globant",
    contribution: l(
      "Leading the AI engineering and a team of 7 (AI Team Lead)",
      "قيادة هندسة الذكاء الاصطناعي وفريق من 7 أعضاء (قائد فريق ذكاء اصطناعي)",
    ),
    period: { start: "2026-04", end: null },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Leading the AI engineering, with a team of 7, for two Saudi Tourism Authority assistants on one LangGraph agent: Noura for visitors and one for staff.",
      "قيادة هندسة الذكاء الاصطناعي، مع فريق من 7 أعضاء، لمساعدَين للهيئة السعودية للسياحة على وكيل LangGraph واحد: «نورة» للزوار ومساعد للموظفين.",
    ),
    problem: l(
      "The Saudi Tourism Authority wanted two assistants: Noura, a public travel assistant for visitors, and an internal assistant for its staff. Both had to answer from the authority's own content, in Arabic and English, and a visitor could never reach staff tools or data.",
      "أرادت الهيئة السعودية للسياحة مساعدَين: «نورة»، المساعدَ الافتراضي للزوار، ومساعدًا داخليًا لموظفيها. وكان على كليهما أن يجيب من محتوى الهيئة نفسها بالعربية والإنجليزية، دون أن يصل الزائر أبدًا إلى أدوات الموظفين أو بياناتهم.",
    ),
    approach: [
      fact(
        "One agent, two audiences: a single LangGraph agent serves both assistants, and an audience gate decides which tools and knowledge each session can use, so a visitor never reaches staff tools or data.",
        "وكيل واحد لجمهورين: وكيل LangGraph واحد يخدم المساعدَين، وطبقة صلاحيات تحدّد الأدوات والمعرفة المتاحة لكل جلسة حسب نوع المستخدم، فلا يصل الزائر أبدًا إلى أدوات الموظفين أو بياناتهم.",
        "mohamed",
      ),
      fact(
        "Tools that answer with cards: destinations, events, visas, weather and trip plans for visitors; meeting rooms, leave and office requests for staff.",
        "أدوات تجيب ببطاقات: الوجهات والفعاليات والتأشيرات والطقس وخطط الرحلات للزوار، وقاعات الاجتماعات والإجازات وطلبات المكتب للموظفين.",
        "mohamed",
      ),
      fact(
        "Answers grounded in the authority's own documents and tourism content, with their sources shown.",
        "إجابات تستند إلى وثائق الهيئة ومحتواها السياحي، مع عرض مصادرها.",
        "mohamed",
      ),
      // Round 7 (R7-03): what waits for the user is an action that changes something, not every tool call.
      fact(
        "The user confirms before anything changes: booking a room, placing an order or building an itinerary waits for their yes.",
        "يؤكد المستخدم قبل أي تغيير: حجز قاعة أو تنفيذ طلب أو بناء برنامج رحلة لا يتم إلا بعد موافقته.",
        "mohamed",
      ),
      fact(
        "Arabic and English throughout, right to left and left to right, on desktop and phone.",
        "العربية والإنجليزية في كل شيء، من اليمين إلى اليسار ومن اليسار إلى اليمين، على الحاسوب والهاتف.",
        "mohamed",
      ),
      fact(
        "Answer quality and retrieval measured by evaluations, not assumed.",
        "قياس جودة الإجابات ودقة الاسترجاع بالتقييم بدل افتراضهما.",
        "mohamed",
      ),
    ],
    architecture: {
      caption: l(
        "Capability view: one LangGraph agent serves visitors and staff; an audience gate decides what each session may use, answers come from the authority's own content with their sources, and every booking or order waits for the user's confirmation.",
        "عرض للقدرات: وكيل LangGraph واحد يخدم الزوار والموظفين، وطبقة الصلاحيات تحدّد ما يتاح لكل جلسة، والإجابات تأتي من محتوى الهيئة مع مصادرها، وكل حجز أو طلب ينتظر تأكيد المستخدم.",
      ),
      nodes: [
        { id: "visitors", label: l("Visitors (Noura)", "الزوار (نورة)"), kind: "user" },
        { id: "staff", label: l("Staff (staff assistant)", "الموظفون (مساعد الموظفين)"), kind: "user" },
        {
          id: "gate",
          label: l("Audience gate", "طبقة الصلاحيات"),
          kind: "quality",
          note: l("Tools and knowledge per audience", "الأدوات والمعرفة حسب نوع المستخدم"),
        },
        {
          id: "agent",
          label: l("One LangGraph agent", "وكيل LangGraph واحد"),
          kind: "orchestrator",
          note: l("96 tools, 27 visible to visitors", "96 أداة، منها 27 متاحة للزوار"),
        },
        // Round 7 (R7-22): no "Models: LLM" row (no model family can be published); the retrieval node says what it
        // searches.
        {
          id: "tools",
          label: l("Typed tools and cards", "أدوات محددة الأنواع وبطاقات"),
          kind: "service",
          note: l("Destinations, events, visas, weather, trip plans, staff requests", "الوجهات والفعاليات والتأشيرات والطقس وخطط الرحلات وطلبات الموظفين"),
        },
        { id: "approval", label: l("Human approval", "الموافقة البشرية"), kind: "quality", note: l("Before any booking or order", "قبل أي حجز أو طلب") },
        { id: "retrieval", label: l("Search over the authority's documents, with citations", "بحث في وثائق الهيئة مع ذكر المصادر"), kind: "retrieval" },
        { id: "content", label: l("The authority's documents and tourism content", "وثائق الهيئة ومحتواها السياحي"), kind: "data" },
        { id: "evals", label: l("Evaluation", "التقييم"), kind: "quality", note: l("Answer quality, retrieval", "جودة الإجابات والاسترجاع") },
      ],
      edges: [
        { from: "visitors", to: "gate" },
        { from: "staff", to: "gate" },
        { from: "gate", to: "agent", label: l("what each audience may use", "ما يتاح لكل جمهور") },
        { from: "agent", to: "tools" },
        { from: "approval", to: "tools", label: l("before any booking or order", "قبل أي حجز أو طلب") },
        { from: "agent", to: "retrieval" },
        { from: "retrieval", to: "content" },
        { from: "evals", to: "agent" },
      ],
    },
    outcome: [
      fact(
        "One agent serves both Noura and the staff assistant, kept apart by the audience gate.",
        "وكيل واحد يخدم «نورة» ومساعد الموظفين، وتفصل بينهما طبقة الصلاحيات.",
        "mohamed",
      ),
      fact(
        "Noura was accepted in the client's user-acceptance testing (UAT) in September 2026.",
        "اعتمد العميل «نورة» في اختبار قبول المستخدم (UAT) في سبتمبر 2026.",
        "mohamed",
      ),
      fact(
        "Every booking or order waits for the user's confirmation, and answers show their sources.",
        "كل حجز أو طلب ينتظر تأكيد المستخدم، والإجابات تعرض مصادرها.",
        "mohamed",
      ),
    ],
    // Round 6 (HM-20): the tool count leads (a lone "1" read as small beside the other cards' 14 and 6), and the one
    // outcome, Noura's UAT acceptance, joins the strip. Same approved facts, nothing new.
    figures: [
      // Round 7 (R7-28): «محددة الأنواع» is "typed" («منظّمة» read as "organised"); one Arabic name for UAT.
      { value: same("96"), unit: l("tools", "أداة"), label: l("typed, behind one LangGraph agent", "محددة الأنواع يستدعيها وكيل LangGraph واحد"), source: ["mohamed"] },
      { value: same("27"), label: l("of them visible to visitors", "منها متاحة للزوار"), source: ["mohamed"] },
      { value: l("Sep 2026", "سبتمبر 2026"), label: l("Noura accepted in the client's UAT", "اعتماد «نورة» في اختبار قبول المستخدم (UAT) لدى العميل"), source: ["mohamed"] },
    ],
    stack: ["LangGraph", "Python", "FastAPI", "RAG", "LLM evaluation", "React", "TypeScript"],
    links: [],
    client: { name: l("Saudi Tourism Authority", "الهيئة السعودية للسياحة"), abbreviation: "STA" },
    // Cleaned captures (personal data, persona photo and internal names removed in the pixels before export).
    screens: [
      {
        file: "01-noura-home-en.webp",
        density: 2,
        frame: "desktop",
        product: l("Noura, for visitors", "نورة للزوار"),
        alt: l("Noura's home screen in English", "الشاشة الرئيسية لنورة بالإنجليزية"),
        caption: l(
          "Noura's home screen: top attractions and live events from Visit Saudi, with saved favourites.",
          "الشاشة الرئيسية لنورة: أبرز المعالم والفعاليات الجارية من «روح السعودية»، مع المفضّلة المحفوظة.",
        ),
      },
      {
        file: "02-noura-answer-ar.webp",
        density: 2,
        frame: "desktop",
        product: l("Noura, for visitors", "نورة للزوار"),
        alt: l("Noura answering in Arabic, right to left", "نورة تجيب بالعربية من اليمين إلى اليسار"),
        caption: l(
          "Noura answering in Arabic, right to left: a destination card for AlUla and a sourced summary.",
          "نورة تجيب بالعربية من اليمين إلى اليسار: بطاقة وجهة للعُلا وملخّص يذكر مصدره.",
        ),
      },
      {
        file: "04-noura-itinerary-en.webp",
        density: 2,
        frame: "desktop",
        product: l("Noura, for visitors", "نورة للزوار"),
        alt: l("A one-day AlUla itinerary built by Noura", "برنامج يوم واحد في العُلا بنته نورة"),
        caption: l(
          "A one-day AlUla itinerary built from the traveller's preferences, including the sunset viewpoint they asked for.",
          "برنامج يوم واحد في العُلا مبني على تفضيلات المسافر، ويشمل نقطة مشاهدة الغروب التي طلبها.",
        ),
      },
      {
        file: "06-noura-mobile-en.webp",
        density: 1,
        frame: "phone",
        product: l("Noura, for visitors", "نورة للزوار"),
        alt: l("Noura on a phone", "نورة على الهاتف"),
        caption: l(
          "Noura on a phone: the same answers and follow-up suggestions in a narrow layout.",
          "نورة على الهاتف: الإجابات نفسها واقتراحات المتابعة في تخطيط مناسب للشاشة الصغيرة.",
        ),
      },
      {
        file: "08-employee-home-ar.webp",
        density: 2,
        frame: "desktop",
        product: l("The staff assistant", "مساعد الموظفين"),
        alt: l("The staff assistant's home screen in Arabic", "الشاشة الرئيسية لمساعد الموظفين بالعربية"),
        caption: l(
          "The staff assistant's home screen in Arabic, with suggested questions and memory controls.",
          "الشاشة الرئيسية لمساعد الموظفين بالعربية، مع أسئلة مقترحة وإعدادات الذاكرة.",
        ),
      },
      {
        file: "10-employee-approval-en.webp",
        density: 1,
        frame: "panel",
        product: l("The staff assistant", "مساعد الموظفين"),
        alt: l("An approval request before a coffee order", "طلب موافقة قبل تنفيذ طلب قهوة"),
        caption: l(
          "The user confirms first: the assistant asks before placing a coffee order.",
          "تأكيد المستخدم أولًا: المساعد يستأذن قبل تنفيذ طلب القهوة.",
        ),
      },
    ],
    source: ["mohamed"],
  },
  // Al Majed Oud (الماجد للعود): contract work outside the experience list (roleId null), April to August 2026. Named,
  // with the branded login screen, by Mohamed's decision (2026-10-28). Public-safe facts only (the fact sheet's
  // sections 1, 2 and 4): no infrastructure names, schema, row counts, business figures, store count ("across the
  // GCC"), usage or adoption numbers, incidents, people or costs. Status: went into production on Azure in June 2026
  // and was delivered and handed over in August 2026; never "live today" and never "used by N staff". He was the sole
  // engineer on the codebase ("Sole AI engineer, end to end"); never imply employment.
  {
    slug: "almajed-sales-assistant",
    order: 2,
    featured: true,
    depth: "full",
    title: l(
      "Al Majed Oud: an Arabic-first AI sales assistant with 9 agents, eval-gated",
      "الماجد للعود: مساعد مبيعات ذكي بالعربية أولًا من 9 وكلاء، بإصدارات تحرسها التقييمات",
    ),
    shortTitle: l("Al Majed Oud: AI sales assistant", "الماجد للعود: مساعد المبيعات الذكي"),
    context: l("Al Majed Oud, a Saudi oud and fragrance house (contract)", "الماجد للعود، دار سعودية للعود والعطور (عمل بعقد)"),
    roleId: null,
    contribution: l("Sole AI engineer, end to end (contract)", "مهندس الذكاء الاصطناعي الوحيد، من البداية إلى النهاية (بعقد)"),
    period: { start: "2026-04", end: "2026-08" },
    published: "2026-10-28",
    updated: "2026-10-28",
    summary: l(
      "Built Al Majed Oud's Arabic-first AI sales assistant end to end on contract: 9 agents answer from the warehouse; a 155-case eval gate guards each deploy.",
      "بناء مساعد مبيعات ذكي بالعربية أولًا لشركة الماجد للعود من البداية إلى النهاية (بعقد): 9 وكلاء يجيبون من المستودع، وبوابة تقييم من 155 حالة تحرس كل نشر.",
    ),
    problem: l(
      "Al Majed Oud's staff across the GCC relied on analysts and Power BI reports for everyday sales numbers, mostly in English, while most of them work in Arabic. An assistant that improvises figures would do more harm than good: a plausible wrong number is worse than no answer.",
      "كان موظفو الماجد للعود في دول الخليج يعتمدون على المحللين وتقارير Power BI لمعرفة أرقام المبيعات اليومية، ومعظمها بالإنجليزية، بينما يعمل أغلبهم بالعربية. ومساعد يرتجل الأرقام يضرّ أكثر مما ينفع: فالرقم الخاطئ المقنع أسوأ من غياب الإجابة.",
    ),
    approach: [
      fact(
        "Text-to-SQL over the warehouse, not RAG over documents: sales questions are arithmetic with one right answer, so every figure comes from SQL run against the company's own data, never from the model's memory.",
        "تحويل السؤال إلى SQL على مستودع البيانات بدل RAG على المستندات: أسئلة المبيعات حسابية ولها إجابة صحيحة واحدة، لذا يأتي كل رقم من استعلام SQL على بيانات الشركة نفسها، لا من ذاكرة النموذج.",
        "mohamed",
      ),
      fact(
        "A router and 9 specialist agents on LangGraph: sales, customers, products, staff, stores, loyalty, payments, discounts, and one that clarifies or declines. A planner splits compound questions across agents.",
        "موجّه و9 وكلاء متخصصين على LangGraph: المبيعات، والعملاء، والمنتجات، والموظفون، والفروع، والولاء، وطرق الدفع، والخصومات، ووكيل يطلب التوضيح أو يعتذر. ومخطِّط يوزّع الأسئلة المركّبة على أكثر من وكيل.",
        "mohamed",
      ),
      fact(
        "SQL guardrails on every query: read-only, one statement, a table whitelist per agent, a row cap and a time limit. An answer never states a figure that isn't in the returned rows.",
        "حواجز حماية على كل استعلام SQL: قراءة فقط، وعبارة واحدة، وقائمة جداول مسموح بها لكل وكيل، وحدّ لعدد الصفوف وآخر للوقت. ولا تذكر الإجابة أي رقم غير موجود في الصفوف المسترجعة.",
        "mohamed",
      ),
      fact(
        "Clarifying or declining is a feature: with no period in the question, it asks for one; when the data can't answer, it says so. 64 test cases check exactly that.",
        "التوضيح أو الاعتذار ميزة مقصودة: إذا خلا السؤال من فترة زمنية سأل عنها، وإذا لم تكفِ البيانات قال ذلك صراحة. و64 حالة اختبار تتحقق من ذلك تحديدًا.",
        "mohamed",
      ),
      fact(
        "Arabic first: hybrid name search (dense and sparse vectors) for the many spellings of Arabic names, Hijri dates with Ramadan and Eid, and a right-to-left interface.",
        "العربية أولًا: بحث هجين عن الأسماء (متجهات كثيفة ومتناثرة) يتعامل مع تعدد كتابات الأسماء العربية، وتواريخ هجرية تشمل رمضان والعيد، وواجهة من اليمين إلى اليسار.",
        "mohamed",
      ),
      fact(
        "A query-optimised copy of the Microsoft Fabric warehouse in PostgreSQL, with today's sales refreshed every 15 minutes.",
        "نسخة من مستودع Microsoft Fabric على PostgreSQL مهيّأة للاستعلام، تُحدَّث فيها مبيعات اليوم كل 15 دقيقة.",
        "mohamed",
      ),
      fact(
        "Answers stream in as they are written (SSE), with a chart the backend picks from the same rows, behind Microsoft Entra single sign-on.",
        "إجابات تظهر أثناء كتابتها (SSE) مع رسم بياني يختاره الخادم من الصفوف نفسها، خلف تسجيل الدخول الموحّد عبر Microsoft Entra.",
        "mohamed",
      ),
      fact(
        "Eval-gated CI/CD and tracing: a bilingual test suite runs against each new build in the production environment and blocks any deploy that regresses; Langfuse traces every request, and an admin dashboard shows latency, quality scores and negative feedback.",
        "تكامل ونشر مستمران تحرسهما التقييمات، مع تتبّع كامل: مجموعة اختبارات ثنائية اللغة تعمل على كل بناء جديد داخل بيئة الإنتاج وتوقف أي نشر يتراجع أداؤه، وLangfuse يتتبّع كل طلب، ولوحة إدارة تعرض زمن الاستجابة ودرجات الجودة والتقييمات السلبية.",
        "mohamed",
      ),
    ],
    architecture: {
      caption: l(
        "Capability view: staff sign in with Microsoft Entra; a router sends each question to one of 9 agents, which write SQL through a guardrail layer over a PostgreSQL copy of the Fabric warehouse; an eval gate blocks any deploy that regresses.",
        "عرض للقدرات: يسجّل الموظفون دخولهم عبر Microsoft Entra، ويوجّه الموجّه كل سؤال إلى أحد 9 وكلاء يكتبون SQL عبر طبقة حماية فوق نسخة PostgreSQL من مستودع Fabric، وبوابة تقييم توقف أي نشر يتراجع أداؤه.",
      ),
      nodes: [
        { id: "staff", label: l("Company staff (Arabic or English)", "موظفو الشركة (بالعربية أو الإنجليزية)"), kind: "user" },
        { id: "sso", label: l("Microsoft Entra SSO", "الدخول الموحّد عبر Microsoft Entra"), kind: "quality" },
        { id: "chat", label: l("Chat: streamed answers and charts", "المحادثة: إجابات متدفقة ورسوم بيانية"), kind: "service" },
        { id: "router", label: l("Router", "الموجّه"), kind: "orchestrator", note: l("Picks the agent and the language", "يختار الوكيل واللغة") },
        {
          id: "agents",
          label: l("9 specialist agents", "9 وكلاء متخصصين"),
          kind: "agent",
          note: l("Sales, customers, products, staff, stores, loyalty, payments, discounts, clarify or decline", "المبيعات والعملاء والمنتجات والموظفون والفروع والولاء وطرق الدفع والخصومات، والتوضيح أو الاعتذار"),
        },
        { id: "models", label: l("Tiered Azure OpenAI models", "نماذج Azure OpenAI متدرّجة"), kind: "model" },
        { id: "names", label: l("Hybrid name search", "بحث هجين عن الأسماء"), kind: "retrieval", note: l("Arabic and Latin spellings", "الكتابة العربية واللاتينية") },
        { id: "guard", label: l("SQL guardrails", "حواجز حماية SQL"), kind: "quality", note: l("Read-only, whitelisted, row and time limits", "قراءة فقط، جداول مسموح بها، حدود للصفوف والوقت") },
        { id: "warehouse", label: l("PostgreSQL copy of the warehouse", "نسخة PostgreSQL من المستودع"), kind: "data" },
        { id: "sync", label: l("Sync every 15 minutes", "مزامنة كل 15 دقيقة"), kind: "pipeline" },
        { id: "fabric", label: l("Microsoft Fabric warehouse", "مستودع Microsoft Fabric"), kind: "data" },
        { id: "evals", label: l("Eval gate in CI/CD", "بوابة التقييم في CI/CD"), kind: "quality", note: l("155 cases block every deploy", "155 حالة تحرس كل نشر") },
        { id: "tracing", label: l("Langfuse tracing and admin dashboard", "تتبّع Langfuse ولوحة الإدارة"), kind: "quality" },
      ],
      edges: [
        { from: "staff", to: "sso" },
        { from: "sso", to: "chat" },
        { from: "chat", to: "router" },
        { from: "router", to: "agents" },
        { from: "agents", to: "models" },
        { from: "agents", to: "names", label: l("names to ids", "من الاسم إلى المعرّف") },
        { from: "agents", to: "guard", label: l("generated SQL", "SQL المولَّد") },
        { from: "guard", to: "warehouse" },
        { from: "fabric", to: "sync" },
        { from: "sync", to: "warehouse" },
        { from: "evals", to: "router", label: l("blocks a deploy that regresses", "يوقف النشر المتراجع") },
        { from: "tracing", to: "router", label: l("every request", "كل طلب") },
      ],
    },
    outcome: [
      fact(
        "Went into production on Azure in June 2026, behind Microsoft Entra SSO and available to all staff; delivered and handed over in August 2026.",
        "دخل بيئة الإنتاج على Azure في يونيو 2026 خلف تسجيل الدخول الموحّد عبر Microsoft Entra ومتاحًا لجميع الموظفين، ثم سُلِّم في أغسطس 2026.",
        "mohamed",
      ),
      fact(
        "The final release passed its release gate at 155/155, and the full nightly suite of 399 bilingual cases (248 Arabic, 151 English) reached 399/399.",
        "اجتاز الإصدار الأخير بوابة الإصدار بنتيجة 155/155، وبلغت المجموعة الليلية الكاملة من 399 حالة ثنائية اللغة (248 بالعربية و151 بالإنجليزية) نتيجة 399/399.",
        "mohamed",
      ),
      fact(
        "Answers in Arabic or English, streamed with charts, with figures built to match the company's financial reports.",
        "إجابات بالعربية أو الإنجليزية، متدفقة ومعها رسوم بيانية، وأرقام مصمَّمة لتطابق التقارير المالية للشركة.",
        "mohamed",
      ),
      fact(
        "Handed over with runbooks, a mobile integration kit for the company's app team, and a disaster-recovery path rehearsed with a restore in about 2 minutes.",
        "التسليم مع أدلة التشغيل، وحزمة تكامل لفريق تطبيق الجوال في الشركة، ومسار للتعافي من الكوارث جرى التدرّب عليه باستعادة في نحو دقيقتين.",
        "mohamed",
      ),
    ],
    figures: [
      { value: same("9"), unit: l("agents", "وكلاء"), label: l("specialists behind one router", "متخصصون خلف موجّه واحد"), source: ["mohamed"] },
      { value: same("155/155"), label: l("on the release gate that blocks every deploy", "في بوابة الإصدار التي تحرس كل نشر"), source: ["mohamed"] },
      { value: same("399"), label: l("bilingual eval cases, 248 of them in Arabic", "حالة تقييم ثنائية اللغة، منها 248 بالعربية"), source: ["mohamed"] },
      { value: same("15"), unit: l("min", "دقيقة"), label: l("data sync from Microsoft Fabric", "لمزامنة البيانات من Microsoft Fabric"), source: ["mohamed"] },
    ],
    stack: ["LangGraph", "Azure OpenAI", "PostgreSQL", "Qdrant", "FastAPI", "Next.js", "Langfuse", "Microsoft Fabric", "Microsoft Entra ID", "Azure Container Apps", "Python"],
    // The product is internal: no public link.
    links: [],
    client: { name: l("Al Majed Oud", "الماجد للعود"), tile: { file: "almajed", monogram: "م" } },
    // The sign-in screen is the product's own (the framework's dev badge and the e-mail domain hint removed in the
    // pixels; the desktop sign-in's brand panel is not used: it carries a store count). The chat screens run on
    // illustrative demo data ("Demo branch 1", made-up figures), never company data, and their captions say so.
    screensNote: l(
      "Screens from the app. The chat screens run on illustrative demo data, not company figures.",
      "لقطات من التطبيق، وشاشات المحادثة فيها ببيانات توضيحية لا بأرقام الشركة.",
    ),
    screens: [
      {
        file: "01-arabic-answer-chart.webp",
        density: 2,
        frame: "desktop",
        product: l("The sales assistant", "مساعد المبيعات"),
        alt: l("An Arabic answer about a branch's sales, with its sources and a bar chart", "إجابة بالعربية عن مبيعات فرع، مع مصادرها ورسم بياني بالأعمدة"),
        caption: l(
          "An Arabic answer, right to left: the figure, its sources and a chart drawn from the same rows, with illustrative demo data, not company figures.",
          "إجابة بالعربية من اليمين إلى اليسار: الرقم ومصادره ورسم بياني من الصفوف نفسها، ببيانات توضيحية لا بأرقام الشركة.",
        ),
      },
      {
        file: "02-chat-home-desktop.webp",
        density: 2,
        frame: "desktop",
        product: l("The sales assistant", "مساعد المبيعات"),
        alt: l("The assistant's home screen with starter questions in Arabic and English", "الشاشة الرئيسية للمساعد مع أسئلة مقترحة بالعربية والإنجليزية"),
        caption: l(
          "The home screen: starter questions in Arabic and English and past conversations, with illustrative demo data, not company figures.",
          "الشاشة الرئيسية: أسئلة مقترحة بالعربية والإنجليزية والمحادثات السابقة، ببيانات توضيحية لا بأرقام الشركة.",
        ),
      },
      {
        file: "03-english-table.webp",
        density: 2,
        frame: "desktop",
        product: l("The sales assistant", "مساعد المبيعات"),
        alt: l("An English follow-up answered by the sales agent with a comparison table", "سؤال متابعة بالإنجليزية يجيب عنه وكيل المبيعات بجدول مقارنة"),
        caption: l(
          "An English follow-up in the same conversation: the sales agent compares branches in a table and a chart, with illustrative demo data, not company figures.",
          "سؤال متابعة بالإنجليزية في المحادثة نفسها: وكيل المبيعات يقارن الفروع في جدول ورسم بياني، ببيانات توضيحية لا بأرقام الشركة.",
        ),
      },
      {
        file: "04-sign-in-phone.webp",
        density: 1,
        frame: "phone",
        product: l("The sales assistant", "مساعد المبيعات"),
        alt: l("The Al Majed Oud sign-in screen with a Microsoft sign-in button", "شاشة الدخول إلى مساعد الماجد للعود مع زر الدخول بحساب Microsoft"),
        caption: l(
          "Sign-in on a phone: staff use their company Microsoft account (Entra single sign-on), with no password field.",
          "الدخول على الهاتف: يستخدم الموظفون حساب Microsoft الخاص بالشركة (الدخول الموحّد عبر Entra) دون حقل لكلمة المرور.",
        ),
      },
      {
        file: "05-arabic-answer-phone.webp",
        density: 1,
        frame: "phone",
        product: l("The sales assistant", "مساعد المبيعات"),
        alt: l("The Arabic answer and its chart on a phone", "الإجابة العربية ورسمها البياني على الهاتف"),
        caption: l(
          "The same Arabic answer on a phone, with illustrative demo data, not company figures.",
          "الإجابة العربية نفسها على الهاتف، ببيانات توضيحية لا بأرقام الشركة.",
        ),
      },
    ],
    source: ["mohamed"],
  },
  {
    slug: "arabsstock-assistant",
    order: 3,
    featured: true,
    depth: "full",
    title: l(
      "ArabsStock Assistant: 14 agents and AI search over millions of assets",
      "مساعد من 14 وكيلًا وبحث ذكي في ملايين ملفات الوسائط لمنصة ArabsStock",
    ),
    shortTitle: l("ArabsStock Assistant: 14 agents", "مساعد ArabsStock من 14 وكيلًا"),
    context: l("ArabsStock, an Arab stock-media platform", "ArabsStock، منصة عربية للصور ومقاطع الفيديو المرخّصة"),
    roleId: "arabsstock",
    contribution: l("Architecture and build (AI Engineer)", "التصميم المعماري والبناء (مهندس ذكاء اصطناعي)"),
    period: { start: "2023-04", end: "2024-12" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Architected a 14-agent LangGraph assistant for ArabsStock and the semantic and visual search over millions of its photos, videos and vector graphics.",
      "تصميم مساعد من 14 وكيلًا على LangGraph لمنصة ArabsStock، وبحث دلالي وبصري في ملايين الصور ومقاطع الفيديو والرسومات المتجهة.",
    ),
    problem: l(
      "ArabsStock is an Arab library of millions of royalty-free photos, videos and vector graphics. The platform needed one assistant for very different jobs (finding assets, generating images, running database operations, moderating content) and search that finds assets by meaning and by visual similarity.",
      "ArabsStock مكتبة عربية تضم ملايين الصور ومقاطع الفيديو والرسومات المتجهة. احتاجت المنصة إلى مساعد واحد يؤدي مهام مختلفة تمامًا (العثور على المحتوى، وتوليد الصور، وتنفيذ عمليات قواعد البيانات، والإشراف على المحتوى)، وإلى بحث يجد المحتوى بمعناه وبتشابهه البصري.",
    ),
    approach: [
      // Round 6 (HM-15): the "why", from the problem as the sources state it (very different jobs) and the routing the
      // diagram shows. No reason beyond the sources. Round 7 (HM-15): five kinds of job and 14 agents add up: each kind
      // got one or more agents (the sources give the total, not the split).
      fact(
        "Why 14 agents: the jobs were very different (semantic search, AI image generation, database operations, content moderation and other platform AI services), so each kind of job got one or more specialised agents, 14 in all, and one LangGraph orchestrator routes every request.",
        "لماذا 14 وكيلًا: كانت المهام مختلفة تمامًا (البحث الدلالي، وتوليد الصور، وعمليات قواعد البيانات، والإشراف على المحتوى، وخدمات ذكاء اصطناعي أخرى على المنصة)، فخُصّص لكل نوع منها وكيل متخصص أو أكثر، 14 وكيلًا في المجموع، ومنسّق LangGraph واحد يوجّه كل طلب إلى وكيله.",
        "cv",
        "linkedin",
      ),
      fact(
        "Built the semantic search pipeline: OpenAI embeddings into a Pinecone index, filled by automated batch ingestion across millions of assets.",
        "بناء خط البحث الدلالي: تضمينات OpenAI تُخزَّن في فهرس Pinecone، يغذّيه إدخال آلي على دفعات لملايين ملفات الوسائط.",
        "cv",
        "linkedin",
      ),
      fact(
        "Added visual-similarity search, so users can find visually similar assets across the library.",
        "إضافة بحث بالتشابه البصري يتيح للمستخدم العثور على محتوى متشابه بصريًا في المكتبة كلها.",
        "linkedin",
        "cv",
      ),
      fact(
        "Served image search, sound generation, instrument classification, BPM detection and audio watermarking as containerised FastAPI microservices, and added sound search for a beta sound library.",
        "تشغيل البحث بالصور، وتوليد الأصوات، وتصنيف الآلات الموسيقية، واكتشاف سرعة الإيقاع (BPM)، والعلامات المائية الصوتية كخدمات FastAPI مصغّرة في حاويات، مع إضافة البحث الصوتي لمكتبة صوتية تجريبية.",
        "cv",
        "linkedin",
      ),
      fact(
        "Added agent evaluation workflows that track reliability, response accuracy and routing in production.",
        "إضافة سير عمل لتقييم الوكلاء يتابع الموثوقية ودقة الإجابات وجودة التوجيه في بيئة الإنتاج.",
        "cv",
      ),
    ],
    architecture: {
      caption: l(
        "Component view: a LangGraph orchestrator routes requests to specialised agents; a batch pipeline keeps the vector index current; model services run as separate containers; evaluation watches routing and accuracy.",
        "عرض للمكوّنات: منسّق LangGraph يوجّه الطلبات إلى وكلاء متخصصين، وخط دفعات يُبقي الفهرس المتجهي محدّثًا، وخدمات النماذج تعمل في حاويات مستقلة، والتقييم يراقب التوجيه والدقة.",
      ),
      nodes: [
        { id: "users", label: l("Platform users", "مستخدمو المنصة"), kind: "user" },
        { id: "orchestrator", label: l("LangGraph orchestrator", "منسّق LangGraph"), kind: "orchestrator" },
        { id: "search-agents", label: l("Semantic search", "البحث الدلالي"), kind: "agent" },
        { id: "image-gen", label: l("Image generation", "توليد الصور"), kind: "agent" },
        { id: "db-ops", label: l("Database operations", "عمليات قواعد البيانات"), kind: "agent" },
        { id: "moderation", label: l("Content moderation", "الإشراف على المحتوى"), kind: "agent" },
        // One name for the fifth kind of job, here, in the decision and in the diagram (HM-15).
        { id: "ai-services", label: l("Other platform AI services", "خدمات ذكاء اصطناعي أخرى على المنصة"), kind: "agent" },
        {
          id: "ingestion",
          label: l("Batch ingestion", "إدخال على دفعات"),
          kind: "pipeline",
          note: l("Millions of photos, videos, vector graphics", "ملايين الصور والفيديو والرسومات"),
        },
        { id: "embeddings", label: l("OpenAI embeddings", "تضمينات OpenAI"), kind: "model" },
        { id: "pinecone", label: l("Pinecone vector index", "فهرس Pinecone المتجهي"), kind: "data" },
        { id: "visual-search", label: l("Visual-similarity search", "بحث بالتشابه البصري"), kind: "retrieval" },
        {
          id: "audio",
          label: l("Audio model services", "خدمات نماذج الصوت"),
          kind: "service",
          note: l("Generation, search, instruments, BPM, watermarking", "توليد، بحث، آلات، BPM، علامات مائية"),
        },
        { id: "evaluation", label: l("Agent evaluation", "تقييم الوكلاء"), kind: "quality" },
      ],
      edges: [
        { from: "users", to: "orchestrator" },
        { from: "orchestrator", to: "search-agents" },
        { from: "orchestrator", to: "image-gen" },
        { from: "orchestrator", to: "db-ops" },
        { from: "orchestrator", to: "moderation" },
        { from: "orchestrator", to: "ai-services" },
        { from: "ingestion", to: "embeddings" },
        { from: "embeddings", to: "pinecone" },
        { from: "evaluation", to: "orchestrator", label: l("routing, accuracy", "التوجيه والدقة") },
      ],
    },
    outcome: [
      fact(
        "A production assistant whose 14 agents cover search, image generation, data operations and moderation.",
        "مساعد يعمل في بيئة الإنتاج، يغطي وكلاؤه الأربعة عشر البحث وتوليد الصور وعمليات البيانات والإشراف على المحتوى.",
        "cv",
        "linkedin",
      ),
      fact(
        "Millions of photos, videos and vector graphics indexed for semantic search, plus visual-similarity search across the library.",
        "فهرسة ملايين الصور ومقاطع الفيديو والرسومات المتجهة للبحث الدلالي، مع بحث بالتشابه البصري في المكتبة كلها.",
        "cv",
        "linkedin",
      ),
      fact(
        "A new audio line for the platform: a beta sound library with generation and search.",
        "مجال جديد للمنصة هو الصوت: مكتبة صوتية تجريبية تدعم التوليد والبحث.",
        "linkedin",
        "cv",
      ),
      fact(
        "Agent reliability, accuracy and routing measured in production rather than assumed.",
        "قياس موثوقية الوكلاء ودقتهم وجودة التوجيه في بيئة الإنتاج بدل افتراضها.",
        "cv",
      ),
    ],
    figures: [
      { value: same("14"), label: l("specialised agents in one LangGraph assistant", "وكيلًا متخصصًا في مساعد واحد على LangGraph"), source: ["cv", "linkedin", "github"] },
      // Image search, sound generation, instrument classification, BPM detection, audio watermarking.
      { value: same("5"), label: l("vision and audio model services, each a FastAPI container", "خدمات نماذج للصورة والصوت، كلٌّ منها حاوية FastAPI"), source: ["cv", "linkedin"] },
      { value: l("Millions", "ملايين"), label: l("of photos, videos and vector graphics behind semantic search", "من الصور ومقاطع الفيديو والرسومات المتجهة خلف البحث الدلالي"), source: ["cv", "linkedin", "github"] },
      // The role's own dates, counted inclusively like LinkedIn ("1 yr 9 mos").
      { value: same("21"), unit: l("months", "شهرًا"), label: l("Apr 2023 – Dec 2024, full-time and remote", "أبريل 2023 – ديسمبر 2024، بدوام كامل وعن بُعد"), source: ["linkedin", "cv"] },
    ],
    // vLLM and NVIDIA A100 stay in the role's LinkedIn tags but not here: this page has no story for them (HM-32).
    stack: ["LangGraph", "OpenAI API", "Pinecone", "Python", "FastAPI", "PostgreSQL", "Docker"],
    links: [],
    source: ["cv", "linkedin", "github"],
  },
  {
    slug: "wakeb-bilingual-chatbot",
    order: 4,
    featured: true,
    depth: "full",
    title: l(
      "A 6-agent bilingual chatbot on self-hosted Qwen",
      "روبوت محادثة ثنائي اللغة من 6 وكلاء على Qwen ذاتي الاستضافة",
    ),
    shortTitle: l("6-agent bilingual chatbot on vLLM", "روبوت محادثة من 6 وكلاء على vLLM"),
    context: l("Wakeb Data, production chatbot", "Wakeb Data، روبوت محادثة في بيئة الإنتاج"),
    roleId: "wakeb",
    contribution: l(
      "Architecture, build and model serving (Senior AI & MLOps Engineer)",
      "التصميم المعماري والبناء وخدمة النماذج (مهندس ذكاء اصطناعي وMLOps أول)",
    ),
    period: { start: "2024-09", end: "2026-04" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Architected a fully async 6-agent LangGraph chatbot in Arabic and English, and ran its Qwen models on vLLM across production A100 servers.",
      "تصميم روبوت محادثة من 6 وكلاء على LangGraph بالعربية والإنجليزية بمعالجة غير متزامنة، وتشغيل نماذج Qwen عبر vLLM على خوادم A100 في بيئة الإنتاج.",
    ),
    problem: l(
      "The chatbot had to answer in Arabic and English, run on self-hosted models on A100 GPU servers, ground its answers in documents and live web results, and guide users through multi-turn service configuration. In production, the model servers had to recover on their own when something failed.",
      "كان على روبوت المحادثة أن يجيب بالعربية والإنجليزية، وأن يعمل على نماذج ذاتية الاستضافة على خوادم A100، وأن يستند في إجاباته إلى المستندات ونتائج الويب الحية، وأن يرشد المستخدم في إعداد الخدمات عبر محادثة متعددة الجولات. وفي بيئة الإنتاج، كان على خوادم النماذج أن تتعافى تلقائيًا عند حدوث أي عطل.",
    ),
    approach: [
      fact(
        "Six specialised LangGraph agents built from modular subgraphs. LangGraph's Command routes between them instead of fixed edges, and the whole graph is async.",
        "ستة وكلاء متخصصين على LangGraph، مبنيّون من مخططات فرعية معيارية، مع توجيه ديناميكي بينهم عبر Command من دون حواف ثابتة، ومعالجة غير متزامنة في المخطط كله.",
        "cv",
        "linkedin",
      ),
      fact(
        "Hybrid retrieval for RAG: vector search and BM25, reranked by an LLM, with SQLite caching at the graph-node level.",
        "استرجاع هجين لخطوط RAG: بحث متجهي مع BM25، ثم إعادة ترتيب بنموذج لغوي، مع تخزين مؤقت عبر SQLite على مستوى عُقد المخطط.",
        "cv",
        "linkedin",
      ),
      fact(
        "Live web search through the Brave Search MCP server.",
        "بحث حي على الويب عبر خادم Brave Search MCP.",
        "cv",
        "linkedin",
      ),
      fact(
        "Served Qwen with vLLM on NVIDIA A100 GPUs and owned the lifecycle: serving configuration, GPU allocation, model versions, health monitoring and automated restarts across multiple production GPU servers.",
        "خدمة Qwen عبر vLLM على وحدات NVIDIA A100، مع تولّي دورة حياتها كاملة: إعدادات الخدمة، وتخصيص وحدات GPU، وإصدارات النماذج، ومراقبة الحالة، وإعادة التشغيل التلقائي على عدة خوادم GPU في بيئة الإنتاج.",
        "cv",
        "linkedin",
      ),
      fact(
        "Shipped as Dockerised FastAPI services behind Nginx, with CI/CD.",
        "النشر كخدمات FastAPI في حاويات Docker خلف Nginx، مع CI/CD.",
        "cv",
        "linkedin",
      ),
    ],
    architecture: {
      caption: l(
        "Component view: async LangGraph agents call self-hosted Qwen on vLLM, retrieve through hybrid search with LLM reranking, and reach the web through MCP; FastAPI services sit behind Nginx.",
        "عرض للمكوّنات: وكلاء LangGraph يعملون بمعالجة غير متزامنة ويستدعون Qwen ذاتي الاستضافة على vLLM، ويسترجعون عبر بحث هجين مع إعادة ترتيب بنموذج لغوي، ويصلون إلى الويب عبر MCP، فيما تعمل خدمات FastAPI خلف Nginx.",
      ),
      nodes: [
        { id: "users", label: l("Users (Arabic / English)", "المستخدمون (عربي / إنجليزي)"), kind: "user" },
        { id: "nginx", label: same("Nginx"), kind: "infra" },
        { id: "api", label: l("FastAPI services (Docker)", "خدمات FastAPI (Docker)"), kind: "service" },
        {
          id: "graph",
          label: l("LangGraph orchestration", "تنسيق LangGraph"),
          kind: "orchestrator",
          note: l("Command-based routing, async", "توجيه عبر Command، ومعالجة غير متزامنة"),
        },
        { id: "agents", label: l("6 specialised agents", "6 وكلاء متخصصين"), kind: "agent", note: l("Modular subgraphs", "مخططات فرعية معيارية") },
        { id: "cache", label: l("SQLite node cache", "تخزين مؤقت للعُقد (SQLite)"), kind: "data" },
        { id: "hybrid", label: l("Hybrid search: vector + BM25", "بحث هجين: متجهي + BM25"), kind: "retrieval" },
        { id: "rerank", label: l("LLM reranker", "إعادة ترتيب بنموذج لغوي"), kind: "retrieval" },
        { id: "mcp", label: l("Brave Search via MCP", "البحث في الويب: Brave Search عبر MCP"), kind: "service" },
        { id: "vllm", label: l("vLLM serving Qwen", "تشغيل Qwen عبر vLLM"), kind: "model" },
        {
          id: "gpus",
          label: l("A100 GPU servers", "خوادم A100"),
          kind: "infra",
          note: l("Versions, health checks, auto-restart", "إصدارات، فحوص حالة، إعادة تشغيل تلقائي"),
        },
      ],
      edges: [
        { from: "users", to: "nginx" },
        { from: "nginx", to: "api" },
        { from: "api", to: "graph" },
        { from: "graph", to: "agents" },
        { from: "graph", to: "cache" },
        { from: "agents", to: "hybrid" },
        { from: "hybrid", to: "rerank" },
        { from: "agents", to: "mcp" },
        { from: "agents", to: "vllm" },
        { from: "vllm", to: "gpus" },
      ],
    },
    outcome: [
      fact(
        "Deployed to production as a fully async, bilingual Arabic/English system.",
        "نظام ثنائي اللغة (عربي/إنجليزي) يعمل في بيئة الإنتاج بمعالجة غير متزامنة بالكامل.",
        "cv",
        "linkedin",
      ),
      fact(
        "Self-hosted model serving with health monitoring and automated restarts across multiple production GPU servers.",
        "خدمة نماذج ذاتية الاستضافة مع مراقبة الحالة وإعادة التشغيل التلقائي على عدة خوادم GPU في بيئة الإنتاج.",
        "cv",
        "linkedin",
      ),
      fact(
        "Answers grounded in retrieved documents and live web results.",
        "إجابات تستند إلى المستندات المسترجعة ونتائج الويب الحية.",
        "cv",
        "linkedin",
      ),
    ],
    figures: [
      { value: same("6"), label: l("specialised agents, fully async, in LangGraph", "وكلاء متخصصين على LangGraph، في مخطط غير متزامن بالكامل"), source: ["cv", "linkedin", "github"] },
      { value: same("A100"), label: l("GPU servers running Qwen through vLLM", "خوادم GPU تشغّل Qwen عبر vLLM"), source: ["cv", "linkedin"] },
      // Round 7 (R7-23): no "AR + EN" tile; it repeated the title's "bilingual".
    ],
    stack: ["LangGraph", "Qwen", "vLLM", "NVIDIA A100", "FastAPI", "Docker", "Nginx", "BM25", "SQLite", "MCP", "Brave Search", "CI/CD"],
    links: [],
    source: ["cv", "linkedin", "github"],
  },
  {
    slug: "gov-bilingual-assistant",
    order: 6,
    featured: false,
    depth: "brief",
    title: l(
      "A bilingual enterprise assistant with answer-quality monitoring",
      "مساعد مؤسسي ثنائي اللغة مع مراقبة لجودة الإجابات",
    ),
    shortTitle: l("Bilingual assistant, government client", "مساعد ثنائي اللغة لجهة حكومية"),
    context: l("Wakeb Data, for a Saudi government client (not named)", "Wakeb Data، لجهة حكومية سعودية (غير مسمّاة)"),
    roleId: "wakeb",
    contribution: l("Built the assistant", "بناء المساعد"),
    period: { start: "2024-09", end: "2026-04" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Built a bilingual enterprise assistant (Arabic/English) for a Saudi government client, with LLM evaluation and observability on answer quality.",
      "بناء مساعد مؤسسي ثنائي اللغة (عربي/إنجليزي) لجهة حكومية سعودية، مع تقييم للنماذج اللغوية ومراقبة لجودة الإجابات.",
    ),
    problem: l(
      "A Saudi government client needed an enterprise-grade bilingual (Arabic/English) assistant, with evaluation and monitoring of answer quality.",
      "احتاجت جهة حكومية سعودية إلى مساعد مؤسسي ثنائي اللغة (عربي/إنجليزي)، مع تقييم جودة الإجابات ومراقبتها.",
    ),
    approach: [
      fact(
        "Built the enterprise-grade bilingual (Arabic/English) assistant.",
        "بناء المساعد المؤسسي ثنائي اللغة (عربي/إنجليزي).",
        "cv",
        "linkedin",
      ),
      fact(
        "Added LLM evaluation and observability monitoring focused on response quality.",
        "إضافة تقييم للنماذج اللغوية ومراقبة مستمرة تركّز على جودة الإجابات.",
        "cv",
        "linkedin",
      ),
    ],
    architecture: {
      caption: l(
        "Capability view: the public description covers the assistant, its evaluation and its monitoring; implementation details are not public.",
        "عرض للقدرات: الوصف المنشور يشمل المساعد وتقييمه ومراقبته، أما تفاصيل التنفيذ فغير منشورة.",
      ),
      nodes: [
        { id: "users", label: l("Users (Arabic / English)", "المستخدمون (عربي / إنجليزي)"), kind: "user" },
        { id: "assistant", label: l("Bilingual assistant", "مساعد ثنائي اللغة"), kind: "orchestrator" },
        { id: "llm", label: l("LLM", "نموذج لغوي"), kind: "model" },
        { id: "eval", label: l("LLM evaluation", "تقييم النموذج"), kind: "quality" },
        { id: "observability", label: l("Observability: answer quality", "المراقبة: جودة الإجابات"), kind: "quality" },
      ],
      edges: [
        { from: "users", to: "assistant" },
        { from: "assistant", to: "llm" },
        { from: "eval", to: "assistant" },
        { from: "observability", to: "assistant" },
      ],
    },
    outcome: [
      fact(
        // Round 7 (HM-22): the outcome adds what the summary doesn't say (quality measured, not assumed).
        "Answer quality is measured and monitored, not assumed: LLM evaluation and observability were part of the build.",
        "جودة الإجابات تُقاس وتُراقَب ولا تُفترَض: التقييم والمراقبة جزء من البناء نفسه.",
        "cv",
        "linkedin",
      ),
    ],
    figures: [{ value: same("AR + EN"), label: l("languages", "اللغتان"), source: ["cv", "github"] }],
    stack: ["LLM evaluation", "Observability", "Arabic NLP"],
    links: [],
    source: ["cv", "linkedin", "github"],
  },
  {
    slug: "empoweromics-ml",
    order: 5,
    featured: true,
    depth: "full",
    title: l(
      "Lead scoring, message routing and smart search for a real-estate platform",
      "ترتيب أولوية العملاء المحتملين وتوجيه الرسائل والبحث الذكي لمنصة عقارية",
    ),
    shortTitle: l("Real-estate ML at Empoweromics", "تعلّم الآلة للعقارات في Empoweromics"),
    context: l("Empoweromics, real-estate technology, Cairo", "Empoweromics، تقنيات عقارية، القاهرة"),
    roleId: "empoweromics",
    contribution: l("Data integration and ML models (Data Scientist)", "تكامل البيانات ونماذج تعلّم الآلة (عالم بيانات)"),
    period: { start: "2022-01", end: "2023-03" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Unified data from 3,008+ real-estate developers, built lead-prioritisation and WhatsApp-routing models, and shipped typo-tolerant client search.",
      "توحيد بيانات أكثر من 3,008 من المطوّرين العقاريين، وبناء نماذج لترتيب أولويات العملاء وتوجيه رسائل WhatsApp وبحث يتسامح مع الأخطاء الإملائية.",
    ),
    problem: l(
      "Empoweromics runs a real-time e-map for real estate. Its data came from 3,008+ developers, each with its own schema. Brokers needed to know which leads to chase, inbound WhatsApp messages (text and images) had to reach the right department, and staff had to find clients even when a name was misspelled.",
      "تدير Empoweromics خريطة إلكترونية للعقارات محدثة لحظيًا، وتأتي بياناتها من أكثر من 3,008 من المطوّرين العقاريين لكلٍّ منهم مخطط بيانات مختلف. احتاج الوسطاء إلى معرفة العملاء الأجدر بالمتابعة، واحتاجت رسائل WhatsApp الواردة (نصوصًا وصورًا) إلى الوصول للقسم المختص، واحتاج الفريق إلى إيجاد العملاء حتى مع الأخطاء الإملائية في الأسماء.",
    ),
    approach: [
      fact(
        "A data integration system that merged 3,008+ developer schemas to scale the e-map.",
        "نظام لتكامل البيانات يدمج مخططات أكثر من 3,008 من المطوّرين العقاريين لدعم توسّع الخريطة الإلكترونية.",
        "linkedin",
        "github",
      ),
      fact(
        "Classification models for 7 client lifecycle stages (Inactive, Assigned, In Progress, Lost, Won, Void, Active) to rank leads for brokers.",
        "نماذج تصنيف لـ7 مراحل في دورة حياة العميل (غير نشط، ومُسنَد، وقيد المتابعة، ومفقود، ومكسوب، وملغى، ونشط) لترتيب العملاء أمام الوسطاء.",
        "cv",
        "linkedin",
      ),
      fact(
        "WhatsApp classification with NLP for text and computer vision for images, routing to Tech, HR, Accounting, Operations or Marketing.",
        "تصنيف رسائل WhatsApp بمعالجة اللغة الطبيعية للنصوص والرؤية الحاسوبية للصور، وتوجيهها إلى قسم التقنية أو الموارد البشرية أو المحاسبة أو العمليات أو التسويق.",
        "cv",
        "linkedin",
      ),
      fact(
        "Smart Search: fuzzy matching over Arabic and English names, robust to misspelled or partial input.",
        "Smart Search: مطابقة تقريبية لأسماء العملاء بالعربية والإنجليزية، تصمد أمام الأخطاء الإملائية والمدخلات الناقصة.",
        "cv",
        "linkedin",
      ),
      fact(
        "ETL from Cosmos DB to SQL Server, scheduled with Azure Functions.",
        "عمليات ETL من Cosmos DB إلى SQL Server، مجدولة عبر Azure Functions.",
        "cv",
        "linkedin",
      ),
    ],
    architecture: {
      caption: l(
        "Component view: developer data is unified for the e-map; ETL moves data from Cosmos DB to SQL Server; separate models serve brokers, client lookup and message routing.",
        "عرض للمكوّنات: توحيد بيانات المطوّرين للخريطة الإلكترونية، وETL ينقل البيانات من Cosmos DB إلى SQL Server، ونماذج مستقلة تخدم الوسطاء والبحث عن العملاء وتوجيه الرسائل.",
      ),
      nodes: [
        { id: "developers", label: l("3,008+ developer data sources", "بيانات أكثر من 3,008 من المطوّرين العقاريين"), kind: "data" },
        { id: "integration", label: l("Schema integration", "توحيد المخططات"), kind: "pipeline" },
        { id: "emap", label: l("Real-time e-map", "الخريطة الإلكترونية المحدثة لحظيًا"), kind: "user" },
        { id: "cosmos", label: same("Cosmos DB"), kind: "data" },
        { id: "etl", label: l("ETL (Azure Functions)", "ETL (Azure Functions)"), kind: "pipeline" },
        { id: "sql", label: same("SQL Server"), kind: "data" },
        { id: "lifecycle", label: l("Lifecycle-stage models", "نماذج مراحل العميل"), kind: "model" },
        { id: "brokers", label: l("Brokers", "الوسطاء"), kind: "user" },
        { id: "smart-search", label: l("Smart Search (fuzzy)", "بحث تقريبي (Smart Search)"), kind: "retrieval" },
        { id: "clients", label: l("Client records", "سجلات العملاء"), kind: "data" },
        { id: "whatsapp", label: l("WhatsApp inbox", "رسائل WhatsApp"), kind: "user" },
        { id: "classifier", label: l("Text + image classifier", "مصنِّف النصوص والصور"), kind: "model" },
        { id: "departments", label: l("Department queues", "قوائم الأقسام"), kind: "service" },
      ],
      edges: [
        { from: "developers", to: "integration" },
        { from: "integration", to: "emap" },
        { from: "cosmos", to: "etl" },
        { from: "etl", to: "sql" },
        { from: "lifecycle", to: "brokers", label: l("lead priority", "أولوية العميل") },
        { from: "smart-search", to: "clients" },
        { from: "whatsapp", to: "classifier" },
        { from: "classifier", to: "departments" },
      ],
    },
    outcome: [
      fact(
        "Data from 3,008+ developers unified so the real-time e-map could scale.",
        "توحيد بيانات أكثر من 3,008 من المطوّرين العقاريين لتتمكن الخريطة الإلكترونية المحدثة لحظيًا من التوسع.",
        "linkedin",
        "github",
      ),
      fact(
        "Brokers prioritise leads by predicted lifecycle stage; inbound WhatsApp messages reach the right department automatically.",
        "يرتّب الوسطاء العملاء حسب المرحلة المتوقعة، وتصل رسائل WhatsApp الواردة إلى القسم المختص تلقائيًا.",
        "cv",
        "linkedin",
      ),
    ],
    figures: [
      { value: same("3,008+"), label: l("real-estate developers' data unified", "من المطوّرين العقاريين توحّدت بياناتهم"), source: ["linkedin", "github"] },
      { value: same("7"), label: l("client lifecycle stages the lead models predict", "مراحل لدورة حياة العميل تتنبأ بها النماذج"), source: ["cv", "linkedin"] },
      // Tech, HR, Accounting, Operations, Marketing.
      { value: same("5"), label: l("departments that WhatsApp messages are routed to", "أقسام توجَّه إليها رسائل WhatsApp"), source: ["cv", "linkedin"] },
    ],
    stack: ["Python", "PyTorch", "NLP", "Computer vision", "Azure Functions", "Cosmos DB", "SQL Server"],
    links: [],
    source: ["cv", "linkedin", "github"],
  },
  {
    slug: "logic-controls-website",
    // Round 6 (HM-14): in "More work", after the AI briefs; the case-study page stays.
    order: 9,
    featured: false,
    depth: "full",
    title: l(
      "logic-controls.com: a 4-language site, accessible and tested end to end",
      "موقع logic-controls.com بأربع لغات، متوافق مع معايير الإتاحة ومختبَر من طرف إلى طرف",
    ),
    shortTitle: l("logic-controls.com, 4 languages", "موقع logic-controls.com بأربع لغات"),
    context: l("Logic Controls, industrial automation, Egypt (freelance)", "Logic Controls، أتمتة صناعية، مصر (عمل حر)"),
    roleId: null,
    contribution: l("Build and delivery, freelance", "البناء والتسليم، عمل حر"),
    period: { start: "2026", end: "2026" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Freelance build of logic-controls.com in English, Arabic (RTL), Chinese and Turkish: Astro on Cloudflare Workers, WCAG 2.2 AA, Lighthouse 98–100 mobile.",
      "بناء موقع logic-controls.com بأربع لغات (عمل حر) بـAstro على Cloudflare Workers، متوافقًا مع WCAG 2.2 AA، وبنتيجة Lighthouse بين 98 و100 على الجوال.",
    ),
    problem: l(
      "An industrial-automation company in Egypt needed one site for two audiences: local factories, Arabic first, and foreign manufacturers setting up plants in Egypt, in English, Chinese and Turkish. It had to be fast, accessible and cheap to run: the domain is the only paid item.",
      "احتاجت شركة أتمتة صناعية في مصر إلى موقع واحد لجمهورين: المصانع المحلية بالعربية أولًا، والمصنّعين الأجانب الذين يؤسّسون مصانع في مصر بالإنجليزية والصينية والتركية. وكان المطلوب أن يكون سريعًا ومتوافقًا مع معايير الإتاحة ومنخفض تكلفة التشغيل: اسم النطاق هو البند المدفوع الوحيد.",
    ),
    approach: [
      fact(
        "Static Astro + TypeScript + Tailwind CSS build in 4 locales, with Arabic in RTL, served from Cloudflare Workers on the free tier.",
        "موقع ثابت مبني بـAstro وTypeScript وTailwind CSS بأربع لغات، والعربية من اليمين إلى اليسار، ومستضاف على Cloudflare Workers ضمن الخطة المجانية.",
        "logic-controls",
        "github",
      ),
      fact(
        "An interactive HMI demo and motion design that respects reduced-motion settings.",
        "عرض تفاعلي لواجهة HMI وتصميم حركي يحترم إعداد تقليل الحركة.",
        "logic-controls",
        "github",
      ),
      fact(
        "A contact form with spam protection (Turnstile, honeypot, validation) and email delivery from the Worker.",
        "نموذج تواصل محمي من الرسائل المزعجة (Turnstile وحقل خفي وتحقق من المدخلات) يرسل البريد مباشرة من الـWorker.",
        "logic-controls",
        "github",
      ),
      fact(
        "CI with about 950 unit tests and 900 end-to-end tests across Chrome, Android and iPhone Safari, plus axe accessibility checks.",
        "تكامل مستمر يضم نحو 950 اختبار وحدة و900 اختبار من طرف إلى طرف على Chrome وAndroid وSafari على iPhone، مع فحوص إتاحة عبر axe.",
        "logic-controls",
        "github",
      ),
    ],
    architecture: {
      caption: l(
        "Component view: a static Astro build served by Cloudflare Workers; a small Worker handles the language redirect and the contact form; automated tests run in CI and before every deploy.",
        "عرض للمكوّنات: بناء Astro ثابت تقدّمه Cloudflare Workers، وWorker صغير يتولّى توجيه اللغة ونموذج التواصل، واختبارات آلية تعمل في التكامل المستمر وقبل كل نشر.",
      ),
      nodes: [
        { id: "visitors", label: l("Visitors (EN, AR, ZH, TR)", "الزوار (EN, AR, ZH, TR)"), kind: "user" },
        { id: "edge", label: l("Cloudflare Workers (free tier)", "Cloudflare Workers (الخطة المجانية)"), kind: "infra" },
        { id: "worker", label: l("Worker: language redirect, form API", "Worker: توجيه اللغة وواجهة نموذج التواصل"), kind: "orchestrator" },
        { id: "static", label: l("Astro static build, 4 locales", "بناء Astro ثابت بأربع لغات"), kind: "service" },
        { id: "hmi", label: l("Interactive HMI demo", "عرض HMI تفاعلي"), kind: "service" },
        { id: "turnstile", label: same("Turnstile"), kind: "quality" },
        { id: "email", label: l("Email delivery", "إرسال البريد"), kind: "service" },
        { id: "ci", label: l("CI: ~950 unit, ~900 E2E, axe", "CI: نحو 950 اختبار وحدة و900 اختبار E2E وaxe"), kind: "quality" },
      ],
      edges: [
        { from: "visitors", to: "edge" },
        { from: "edge", to: "worker" },
        { from: "edge", to: "static" },
        { from: "static", to: "hmi" },
        { from: "worker", to: "turnstile" },
        { from: "worker", to: "email" },
        { from: "ci", to: "static", label: l("tests every push and deploy", "يختبر كل دفع ونشر") },
      ],
    },
    outcome: [
      fact("Live at logic-controls.com in 4 languages.", "إطلاق الموقع على logic-controls.com بأربع لغات.", "logic-controls", "github"),
      fact(
        "WCAG 2.2 AA with zero axe violations; Lighthouse 98–100 on mobile and 100 on desktop.",
        "متوافق مع WCAG 2.2 AA دون أي مخالفة في axe، ونتيجة Lighthouse بين 98 و100 على الجوال و100 على سطح المكتب.",
        "logic-controls",
        "github",
      ),
      fact(
        "About 950 unit and 900 end-to-end tests run in CI.",
        "نحو 950 اختبار وحدة و900 اختبار من طرف إلى طرف تعمل في التكامل المستمر.",
        "logic-controls",
        "github",
      ),
    ],
    figures: [
      { value: same("4"), label: l("languages", "لغات"), source: ["logic-controls", "github"] },
      { value: same("98–100"), label: l("Lighthouse, mobile", "Lighthouse على الجوال"), source: ["logic-controls", "github"] },
      { value: l("950 + 900", "950 و900"), label: l("unit + end-to-end tests", "اختبار وحدة واختبار شامل"), source: ["logic-controls", "github"] },
    ],
    stack: ["Astro", "TypeScript", "Tailwind CSS", "Cloudflare Workers", "Turnstile", "Vitest", "Playwright", "axe-core"],
    links: [
      { label: l("Live site", "الموقع"), href: "https://logic-controls.com" },
      { label: l("Source code", "الشيفرة المصدرية"), href: "https://github.com/mhatem5351/logic-controls-website" },
    ],
    source: ["logic-controls", "github"],
  },
  {
    slug: "aip-semantic-search",
    order: 7,
    featured: false,
    depth: "brief",
    title: l("AIP semantic search, version 2", "الإصدار الثاني من البحث الدلالي لمشروع AIP"),
    shortTitle: l("AIP semantic search v2", "البحث الدلالي في AIP، الإصدار 2"),
    // Round 7 (HM-22): no "flagship" (AIP is not described anywhere public).
    context: l("Wakeb Data, the AIP project", "Wakeb Data، مشروع AIP"),
    roleId: "wakeb",
    contribution: l("Design of version 2", "تصميم الإصدار الثاني"),
    period: { start: "2024-09", end: "2026-04" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Designed the second version of the AI semantic search for the AIP project: more accurate retrieval, faster search, better image search.",
      "تصميم الإصدار الثاني من البحث الدلالي لمشروع AIP: استرجاع أدق، وبحث أسرع، وبحث أفضل بالصور.",
    ),
    problem: l(
      "AIP already had AI-powered semantic search. Version 2 had to return more relevant results, answer faster and handle image search better.",
      "كان لدى AIP بحث دلالي مدعوم بالذكاء الاصطناعي، والمطلوب من الإصدار الثاني نتائج أدق، واستجابة أسرع، وبحث أفضل بالصور.",
    ),
    approach: [
      fact(
        "Designed the second version of the semantic search system around three targets: retrieval accuracy, search speed and image search.",
        "تصميم الإصدار الثاني من نظام البحث الدلالي حول ثلاثة أهداف: دقة الاسترجاع، وسرعة البحث، والبحث بالصور.",
        "cv",
        "linkedin",
      ),
    ],
    architecture: {
      caption: l(
        "Capability view: searches go through the version 2 semantic search, which also improved image search; implementation details are not public.",
        "عرض للقدرات: عمليات البحث تمر عبر الإصدار الثاني من البحث الدلالي الذي حسّن البحث بالصور أيضًا، أما تفاصيل التنفيذ فغير منشورة.",
      ),
      nodes: [
        { id: "users", label: l("Searches", "عمليات البحث"), kind: "user" },
        {
          id: "search",
          label: l("Semantic search v2", "البحث الدلالي، الإصدار 2"),
          kind: "retrieval",
          note: l("Accuracy, speed, image search", "الدقة والسرعة والبحث بالصور"),
        },
        { id: "results", label: l("Results", "النتائج"), kind: "service" },
      ],
      edges: [
        { from: "users", to: "search" },
        { from: "search", to: "results" },
      ],
    },
    outcome: [
      fact(
        "Improved retrieval accuracy, search speed and image search over version 1 (no public figures).",
        "تحسين دقة الاسترجاع وسرعة البحث والبحث بالصور مقارنة بالإصدار الأول (لا توجد أرقام منشورة).",
        "cv",
        "linkedin",
      ),
    ],
    figures: [{ value: same("v2"), label: l("of the search system", "من نظام البحث"), source: ["cv", "linkedin"] }],
    stack: ["Semantic search", "Image search"],
    links: [],
    source: ["cv", "linkedin", "github"],
  },
  {
    slug: "tabaqat-gis",
    order: 8,
    featured: false,
    depth: "brief",
    title: l("GIS data pipelines and map serving", "خطوط بيانات GIS وخدمة الخرائط"),
    shortTitle: l("GIS pipelines at Tabaqat", "خطوط بيانات GIS في Tabaqat"),
    // Round 7 (R7-27): the role card already says part-time and remote.
    context: l("Tabaqat, spatial analytics, Saudi Arabia", "Tabaqat، تحليلات مكانية، السعودية"),
    roleId: "tabaqat",
    contribution: l("All data pipelines, plus map deployment", "جميع خطوط البيانات، إلى جانب نشر الخرائط"),
    period: { start: "2023-02", end: "2024-05" },
    published: "2026-10-10",
    updated: "2026-10-11",
    summary: l(
      "Designed and ran all data pipelines in Prefect (ETL for Saudi government GIS data), queried Overture Maps with Athena and DuckDB, and deployed map serving.",
      "تصميم جميع خطوط البيانات وإدارتها عبر Prefect (ETL لبيانات GIS حكومية سعودية)، والاستعلام في Overture Maps عبر Athena وDuckDB، ونشر حلول خدمة الخرائط.",
    ),
    problem: l(
      "Spatial analytics needed reliable ETL from Saudi governmental GIS sources, queries over Overture Maps' open map data, and map serving for rendering and visualisation.",
      "احتاجت التحليلات المكانية إلى عمليات ETL موثوقة من مصادر GIS حكومية سعودية، واستعلامات على بيانات Overture Maps المفتوحة، وخدمة خرائط للعرض والتمثيل المرئي للبيانات.",
    ),
    approach: [
      fact(
        "Orchestrated the data pipelines in Prefect, including ETL for GIS data from Saudi government sources.",
        "تنسيق خطوط البيانات عبر Prefect، ومنها عمليات ETL لبيانات GIS من مصادر حكومية سعودية.",
        "cv",
      ),
      fact(
        "Queried Overture Maps with AWS Athena and DuckDB for spatial analytics.",
        "الاستعلام في Overture Maps عبر AWS Athena وDuckDB للتحليل المكاني.",
        "cv",
      ),
      fact(
        "Served and visualised maps with MapProxy, MBTileServer, MapLibre and Kepler.gl.",
        "خدمة الخرائط وعرضها مرئيًا عبر MapProxy وMBTileServer وMapLibre وKepler.gl.",
        "cv",
      ),
    ],
    architecture: {
      caption: l(
        "Component view, three workstreams: Prefect ETL from government GIS sources; Athena and DuckDB queries over Overture Maps; tile servers behind web maps.",
        "عرض للمكوّنات في ثلاثة محاور عمل: ETL عبر Prefect من مصادر GIS حكومية، واستعلامات Athena وDuckDB في Overture Maps، وخوادم بلاطات الخرائط (tile servers) التي تغذّي خرائط الويب.",
      ),
      nodes: [
        { id: "gov", label: l("Saudi government GIS sources", "مصادر GIS حكومية سعودية"), kind: "data" },
        { id: "prefect", label: l("Prefect ETL flows", "خطوط ETL في Prefect"), kind: "pipeline" },
        { id: "gis-data", label: l("Processed GIS data", "بيانات GIS معالجة"), kind: "data" },
        { id: "overture", label: same("Overture Maps"), kind: "data" },
        { id: "query", label: same("AWS Athena + DuckDB"), kind: "retrieval" },
        { id: "analytics", label: l("Spatial analytics", "التحليل المكاني"), kind: "user" },
        { id: "tiles", label: same("MapProxy + MBTileServer"), kind: "service" },
        { id: "maps", label: same("MapLibre + Kepler.gl"), kind: "user" },
      ],
      edges: [
        { from: "gov", to: "prefect" },
        { from: "prefect", to: "gis-data" },
        { from: "overture", to: "query" },
        { from: "query", to: "analytics" },
        { from: "tiles", to: "maps" },
      ],
    },
    outcome: [
      fact(
        "The company's data pipelines designed and run in Prefect, plus a map-serving stack for rendering and visualisation.",
        "خطوط بيانات الشركة مصمَّمة ومُدارة في Prefect، مع منظومة لخدمة الخرائط وعرضها.",
        "cv",
      ),
    ],
    figures: [],
    stack: ["Prefect", "AWS Athena", "DuckDB", "Overture Maps", "MapProxy", "MBTileServer", "MapLibre", "Kepler.gl"],
    links: [],
    source: ["cv"],
  },
];

const projects: readonly Project[] = [
  {
    id: "staged-llm-evaluator",
    name: "staged-llm-evaluator",
    kind: "llm",
    featured: true,
    year: 2026,
    description: l(
      "A replayable LangGraph pipeline that grades LLM outputs in separate quality, safety and retry stages, then computes the pass / review / fail verdict in plain Python, not with the model. Its tests check that the validator catches tampering, such as a flipped verdict or a paraphrased quote.",
      "خط معالجة على LangGraph قابل لإعادة التشغيل يقيّم مخرجات النماذج اللغوية على مراحل منفصلة للجودة والسلامة وإعادة المحاولة، ثم يحسب الحكم النهائي (نجاح / مراجعة / رسوب) بشيفرة Python عادية، لا بالنموذج. وتتحقق اختباراته من أن المدقّق يكشف التلاعب، مثل حكم مقلوب أو اقتباس مُعاد الصياغة.",
    ),
    highlights: [
      fact(
        "Every LLM call is logged with its stage, model and a SHA-256 hash of the prompt; a standalone validator re-checks all artifacts without calling a model.",
        "يُسجَّل كل استدعاء للنموذج مع مرحلته واسم النموذج وبصمة SHA-256 للموجّه، ويعيد مدقّق مستقل فحص جميع المخرجات دون استدعاء أي نموذج.",
        "github",
      ),
      fact(
        "Judge evidence must be an exact quote from the output: unverifiable quality evidence is nulled and unverifiable safety findings are dropped.",
        "يجب أن يكون دليل المقيّم اقتباسًا حرفيًا من المخرجات: يُلغى دليل الجودة الذي لا يمكن التحقق منه، وتُستبعد ملاحظات السلامة غير الموثّقة.",
        "github",
      ),
      fact(
        "The retry stage never sees scores, enforced in the graph, the prompt builder and the validator.",
        "مرحلة إعادة المحاولة لا ترى الدرجات أبدًا، ويُفرض ذلك في المخطط وفي دالة بناء الموجّه وفي المدقّق.",
        "github",
      ),
      fact(
        "Offline tests with a stubbed client, run by GitHub Actions on Python 3.11 and 3.13.",
        "اختبارات تعمل دون اتصال بالشبكة عبر عميل بديل (stub)، وتشغّلها GitHub Actions على Python 3.11 و3.13.",
        "github",
      ),
      // Round 7 (R7-11): from the README's Tests section.
      fact(
        "Its tests check that the validator catches five kinds of tampering: a flipped verdict, a score leaked into retry output, a paraphrased quote, a missing log record and parsing after the first model call.",
        "تتحقق اختباراته من أن المدقّق يكشف خمسة أنواع من التلاعب: حكمًا مقلوبًا، ودرجةً مسرّبة إلى مخرجات إعادة المحاولة، واقتباسًا مُعاد الصياغة، وسجلًا ناقصًا، وتحليلًا يجري بعد أول استدعاء للنموذج.",
        "github",
      ),
    ],
    stack: ["Python", "LangGraph", "OpenAI API", "pytest", "GitHub Actions"],
    repo: "https://github.com/mhatem5351/staged-llm-evaluator",
    license: "MIT",
    source: ["github"],
  },
  {
    id: "prompt-reliability-harness",
    name: "prompt-reliability-harness",
    kind: "llm",
    featured: true,
    year: 2026,
    description: l(
      "Measures how consistently an LLM answers when the same question is paraphrased, misspelled, padded with noise, reordered or given distractors. Result (gpt-4o-mini): regex correctness 1.00, yet mean consistency 0.49, mostly the same answer worded differently.",
      "يقيس مدى ثبات إجابة النموذج اللغوي حين يُطرح السؤال نفسه بصياغة أخرى، أو بأخطاء إملائية، أو مع ضوضاء، أو بترتيب مختلف، أو مع معلومات تشتّت الانتباه. النتيجة (gpt-4o-mini): صحة 1.00 وفق التعبيرات النمطية، لكن متوسط الثبات 0.49، ومعظم ذلك من صياغة الإجابة نفسها بكلمات مختلفة.",
    ),
    highlights: [
      fact(
        "Invariance tests (the answer must not change) and perturbation tests (measure how often it does).",
        "اختبارات ثبات (يجب ألا تتغير الإجابة) واختبارات اضطراب (تقيس كم مرة تتغير).",
        "github",
      ),
      fact(
        "Scores exact match, regex match and embedding similarity, plus consistency and flip rate.",
        "يقيس التطابق التام، والتطابق بالتعبيرات النمطية، والتشابه عبر التضمينات، إضافة إلى الثبات ومعدل انقلاب الإجابة.",
        "github",
      ),
      fact(
        "In the committed run (gpt-4o-mini, 3 runs per variant), every answer was correct by regex, yet mean consistency was 0.49, mostly from the same answer worded differently.",
        "في التشغيل المحفوظ في المستودع (gpt-4o-mini، 3 مرات لكل صيغة) كانت كل الإجابات صحيحة وفق التعبيرات النمطية، لكن متوسط الثبات بلغ 0.49، ويعود معظم ذلك إلى صياغة الإجابة نفسها بكلمات مختلفة.",
        "github",
      ),
    ],
    stack: ["Python", "OpenAI API", "Embeddings"],
    repo: "https://github.com/mhatem5351/prompt-reliability-harness",
    license: "MIT",
    source: ["github"],
  },
  {
    id: "rag-answering-service",
    name: "rag-answering-service",
    kind: "llm",
    featured: true,
    year: 2026,
    description: l(
      "A small retrieval-only FastAPI service: OpenAI embeddings, cosine and dot-product indexes side by side, a guardrail in front, and latency and hit-rate metrics.",
      "خدمة FastAPI صغيرة للاسترجاع فقط: تضمينات OpenAI، وفهرسا تشابه جيب التمام والضرب النقطي جنبًا إلى جنب، وحاجز حماية في المقدمة، ومقاييس لزمن الاستجابة ونسبة الإصابة.",
    ),
    highlights: [
      fact(
        "A /compare endpoint runs cosine and dot-product retrieval at k=3 and k=5 side by side.",
        "نقطة النهاية ⁦/compare⁩ تشغّل الاسترجاع بجيب التمام وبالضرب النقطي عند k=3 وk=5 جنبًا إلى جنب.",
        "github",
      ),
      fact(
        "A denylist guardrail blocks prompt injection, SQL/XSS probes and oversized queries before any API call.",
        "حاجز حماية بقائمة حظر يوقف حقن الموجّهات ومحاولات SQL/XSS والاستعلامات المفرطة الطول قبل أي استدعاء للواجهة.",
        "github",
      ),
      fact(
        "P50 / P95 / P99 latency and retrieval hit rate at /metrics.",
        "زمن الاستجابة عند P50 وP95 وP99 ونسبة الإصابة في الاسترجاع عبر ⁦/metrics⁩.",
        "github",
      ),
    ],
    stack: ["Python", "FastAPI", "OpenAI embeddings", "pydantic-settings"],
    repo: "https://github.com/mhatem5351/rag-answering-service",
    license: "MIT",
    source: ["github"],
  },
  {
    id: "arabic-sentiment-analysis",
    name: "Arabic-Sentiment-Analysis-With-Multiple-Models",
    kind: "ml",
    featured: true,
    year: 2022,
    description: l(
      "Arabic sentiment classification on about 455k tweets and reviews, comparing recurrent models (BiGRU, BiLSTM), CNNs on AraVec embeddings and classical ML. Result: a BiGRU (2 layers) at 0.816 accuracy, against a 0.595 baseline.",
      "تصنيف المشاعر في نحو 455 ألف تغريدة ومراجعة عربية، مع مقارنة نماذج تكرارية (BiGRU وBiLSTM)، وشبكات CNN على تضمينات AraVec، ونماذج تعلّم آلة تقليدية. النتيجة: BiGRU من طبقتين بدقة 0.816، مقابل 0.595 لخط الأساس.",
    ),
    highlights: [
      fact(
        "Best held-out result: a 2-layer BiGRU at 0.816 accuracy, against a 0.595 majority-class baseline.",
        "أفضل نتيجة على بيانات الاختبار: BiGRU من طبقتين بدقة 0.816، مقابل 0.595 لخط الأساس (الفئة الأكثر تكرارًا).",
        "github",
      ),
      fact(
        "Arabic preprocessing: diacritics removed, alef forms normalised, repeated letters collapsed, ISRI stemming.",
        "معالجة مسبقة للعربية: حذف التشكيل، وتوحيد صور الألف، واختصار الحروف المكرّرة، والتجذيع بخوارزمية ISRI.",
        "github",
      ),
    ],
    stack: ["Python", "TensorFlow", "Keras", "gensim", "AraVec", "NLTK", "scikit-learn"],
    repo: "https://github.com/mhatem5351/Arabic-Sentiment-Analysis-With-Multiple-Models",
    source: ["github"],
  },
  {
    id: "text-summarization",
    name: "Text-Summarization-NLP",
    kind: "ml",
    featured: true,
    year: 2022,
    description: l(
      "A Dash app that summarises a news article or URL with DistilBART, T5 and TextRank side by side, showing time and length for each.",
      "تطبيق Dash يلخّص مقالًا إخباريًا أو رابطًا بثلاث طرق جنبًا إلى جنب (DistilBART وT5 وTextRank)، مع زمن كل ملخص وطوله.",
    ),
    highlights: [
      fact(
        "Sentence-aligned chunking to get past each model's input limit.",
        "تقسيم النص إلى أجزاء على حدود الجمل لتجاوز حد المدخلات في كل نموذج.",
        "github",
      ),
    ],
    stack: ["Python", "Hugging Face Transformers", "Dash", "BeautifulSoup"],
    repo: "https://github.com/mhatem5351/Text-Summarization-NLP",
    credit: l("Team project, ITI AI diploma (2022)", "مشروع جماعي ضمن دبلوم الذكاء الاصطناعي في ITI عام 2022"),
    source: ["github"],
  },
  {
    id: "logic-controls-website",
    name: "logic-controls-website",
    kind: "web",
    featured: true,
    year: 2026,
    description: l(
      "Source of logic-controls.com: a 4-language Astro site on Cloudflare Workers with an interactive HMI demo.",
      "الشيفرة المصدرية لموقع logic-controls.com: موقع Astro بأربع لغات على Cloudflare Workers مع عرض HMI تفاعلي.",
    ),
    highlights: [
      fact(
        "WCAG 2.2 AA (axe-clean); Lighthouse 98–100 on mobile, 100 on desktop.",
        "متوافق مع WCAG 2.2 AA دون مخالفات في axe، وLighthouse بين 98 و100 على الجوال و100 على سطح المكتب.",
        "logic-controls",
        "github",
      ),
      fact(
        "About 950 unit and 900 end-to-end tests in CI, across Chrome, Android and iPhone Safari.",
        "نحو 950 اختبار وحدة و900 اختبار من طرف إلى طرف في التكامل المستمر، على Chrome وAndroid وSafari على iPhone.",
        "logic-controls",
        "github",
      ),
    ],
    stack: ["Astro", "TypeScript", "Tailwind CSS", "Cloudflare Workers"],
    repo: "https://github.com/mhatem5351/logic-controls-website",
    live: "https://logic-controls.com",
    source: ["logic-controls", "github"],
  },
  {
    id: "stroke-prediction-pyspark",
    name: "stroke-prediction-pyspark",
    kind: "coursework",
    featured: false,
    year: 2021,
    description: l(
      "Stroke prediction with a Spark MLlib logistic-regression pipeline, using class weights for a dataset where about 5% of patients are positive (ITI exam).",
      "التنبؤ بالسكتة الدماغية عبر خط انحدار لوجستي في Spark MLlib، مع أوزان للفئات لأن نحو 5% فقط من المرضى إيجابيون (اختبار في ITI).",
    ),
    highlights: [],
    stack: ["PySpark", "Spark MLlib"],
    repo: "https://github.com/mhatem5351/stroke-prediction-pyspark",
    source: ["github"],
  },
  {
    id: "covid19-dashboard",
    name: "covid19-dashboard-plotly",
    kind: "coursework",
    featured: false,
    year: 2021,
    description: l(
      "A COVID-19 dashboard in Plotly Dash on Kaggle's daily-case data, with country and date filters.",
      "لوحة معلومات عن COVID-19 بـPlotly Dash على بيانات الحالات اليومية من Kaggle، مع عوامل تصفية للدول والتواريخ.",
    ),
    highlights: [],
    stack: ["Python", "Plotly Dash", "pandas"],
    repo: "https://github.com/mhatem5351/covid19-dashboard-plotly",
    credit: l("Built with a colleague (2021)", "بالتعاون مع زميل (2021)"),
    source: ["github"],
  },
  {
    id: "telco-churn",
    name: "Telco-Customer-Churn",
    kind: "coursework",
    featured: false,
    year: 2021,
    description: l(
      "Telecom churn classification: 6 scikit-learn and XGBoost models compared with cross-validation; best test accuracy 0.818 (ITI coursework).",
      "تصنيف تسرّب عملاء الاتصالات: مقارنة 6 نماذج من scikit-learn وXGBoost بالتحقق المتقاطع، وأفضل دقة اختبار 0.818 (تكليف في ITI).",
    ),
    highlights: [],
    stack: ["Python", "scikit-learn", "XGBoost"],
    repo: "https://github.com/mhatem5351/Telco-Customer-Churn",
    source: ["github"],
  },
  {
    id: "house-price-hyderabad",
    name: "HousesPrice_Prediction_india",
    kind: "coursework",
    featured: false,
    year: 2021,
    description: l(
      "Hyderabad house-price regression with geocoded locations and a KNN / random forest / gradient boosting voting ensemble; test RMSLE 0.227 (ITI coursework).",
      "انحدار لأسعار المنازل في حيدر آباد مع تحويل المواقع إلى إحداثيات، ومجموعة تصويت من KNN والغابة العشوائية والتعزيز التدرّجي؛ RMSLE على الاختبار 0.227 (تكليف في ITI).",
    ),
    highlights: [],
    stack: ["Python", "scikit-learn", "geopy"],
    repo: "https://github.com/mhatem5351/HousesPrice_Prediction_india",
    source: ["github"],
  },
];

const skills: readonly SkillGroup[] = [
  {
    id: "llm-agents",
    title: l("LLMs & agents", "النماذج اللغوية والوكلاء"),
    summary: l(
      "Multi-agent orchestration in production, from 6 to 14 agents.",
      "أنظمة متعددة الوكلاء في بيئة الإنتاج، من 6 وكلاء إلى 14 وكيلًا.",
    ),
    skills: [
      { name: same("LangGraph"), evidence: ["case:arabsstock-assistant", "case:wakeb-bilingual-chatbot", "role:globant", "project:staged-llm-evaluator", "case:almajed-sales-assistant"], source: ["cv", "linkedin", "github", "mohamed"] },
      // Round 6 (HM-17): "agentic AI" is in his LinkedIn About and the STA runtime; generative AI is the image and sound
      // generation at ArabsStock and the LLM systems themselves.
      { name: l("Agentic AI", "الذكاء الاصطناعي الوكيلي"), evidence: ["role:globant", "case:arabsstock-assistant", "case:wakeb-bilingual-chatbot"], source: ["linkedin", "mohamed"] },
      { name: l("Generative AI", "الذكاء الاصطناعي التوليدي"), evidence: ["case:arabsstock-assistant", "case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin"] },
      { name: l("Multi-agent systems", "الأنظمة متعددة الوكلاء"), evidence: ["case:arabsstock-assistant", "case:wakeb-bilingual-chatbot", "case:almajed-sales-assistant"], source: ["cv", "linkedin", "github"] },
      { name: same("LangChain"), evidence: [], source: ["cv", "linkedin"] },
      { name: same("OpenAI API"), evidence: ["role:arabsstock", "project:staged-llm-evaluator", "project:prompt-reliability-harness"], source: ["cv", "linkedin", "github"] },
      { name: same("Qwen"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: same("MCP (Model Context Protocol)"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: l("Agent memory", "ذاكرة الوكلاء"), evidence: ["role:wakeb"], source: ["cv", "linkedin"] },
      { name: l("Prompt engineering", "هندسة الموجّهات"), evidence: ["project:prompt-reliability-harness"], source: ["cv"] },
      { name: same("Azure OpenAI"), evidence: ["case:almajed-sales-assistant"], source: ["github", "mohamed"] },
      { name: same("Hugging Face Transformers"), evidence: ["project:text-summarization"], source: ["github"] },
      // Two skills, not "Whisper وBLIP": a Latin-led Arabic phrase reads backwards in an isolate (round 6, A-01).
      { name: same("Whisper"), evidence: [], source: ["cv"] },
      { name: same("BLIP"), evidence: [], source: ["cv"] },
    ],
  },
  {
    id: "retrieval",
    title: l("Retrieval & search", "الاسترجاع والبحث"),
    summary: l(
      "RAG and semantic search, from hybrid BM25 + dense retrieval to visual search over millions of assets.",
      "RAG والبحث الدلالي، من الاسترجاع الهجين (BM25 مع المتجهات) إلى البحث البصري في ملايين ملفات الوسائط.",
    ),
    skills: [
      { name: l("RAG pipelines", "خطوط RAG"), evidence: ["case:wakeb-bilingual-chatbot", "project:rag-answering-service", "role:globant"], source: ["cv", "linkedin", "github"] },
      { name: l("Hybrid search (vector + BM25)", "البحث الهجين (متجهي + BM25)"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: l("LLM reranking", "إعادة الترتيب بنموذج لغوي"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: l("Semantic & visual search", "البحث الدلالي والبصري"), evidence: ["case:arabsstock-assistant", "case:aip-semantic-search"], source: ["cv", "linkedin", "github"] },
      { name: same("Pinecone"), evidence: ["case:arabsstock-assistant"], source: ["cv", "linkedin", "github"] },
      { name: same("ChromaDB"), evidence: [], source: ["cv", "linkedin"] },
      { name: same("Qdrant"), evidence: ["case:almajed-sales-assistant"], source: ["github", "mohamed"] },
      { name: same("pgvector"), evidence: [], source: ["github"] },
    ],
  },
  {
    id: "serving-mlops",
    title: l("LLM serving & MLOps", "خدمة النماذج وMLOps"),
    summary: l(
      "Self-hosted models on GPUs, kept healthy in production.",
      "نماذج ذاتية الاستضافة على وحدات GPU، مع الحفاظ على استقرارها في بيئة الإنتاج.",
    ),
    skills: [
      { name: same("vLLM"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: l("NVIDIA A100 GPU serving", "خدمة النماذج على NVIDIA A100"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: l("Model versioning & registry", "إدارة إصدارات النماذج وسجلّها"), evidence: ["role:wakeb"], source: ["cv", "linkedin"] },
      { name: l("Health monitoring & auto-restart", "مراقبة الحالة وإعادة التشغيل التلقائي"), evidence: ["role:wakeb"], source: ["cv", "linkedin", "github"] },
      { name: l("Docker & Docker Compose", "Docker وDocker Compose"), evidence: ["role:wakeb", "role:arabsstock"], source: ["cv", "linkedin", "github"] },
      { name: same("Kubernetes (AWS EKS)"), evidence: [], source: ["cv", "github"] },
      { name: same("CI/CD"), evidence: ["role:wakeb", "case:logic-controls-website", "case:almajed-sales-assistant"], source: ["cv", "linkedin", "github"] },
      { name: same("Nginx"), evidence: ["case:wakeb-bilingual-chatbot"], source: ["cv", "linkedin", "github"] },
      { name: same("Prefect"), evidence: ["case:tabaqat-gis"], source: ["cv", "linkedin"] },
      { name: same("Celery"), evidence: [], source: ["cv", "linkedin"] },
      { name: l("Linux & shell scripting", "Linux وسكربتات shell"), evidence: ["role:wakeb"], source: ["cv", "linkedin"] },
    ],
  },
  {
    id: "quality",
    title: l("Evaluation & observability", "التقييم والمراقبة"),
    summary: l(
      "Knowing a model is right before users find out it isn't.",
      // Round 7 (R7-31): the old line read as a contradiction in Arabic.
      "أن تكتشف خطأ النموذج قبل أن يكتشفه المستخدم.",
    ),
    skills: [
      { name: l("LLM evaluation", "تقييم النماذج اللغوية"), evidence: ["case:gov-bilingual-assistant", "role:arabsstock", "role:globant", "project:staged-llm-evaluator", "case:almajed-sales-assistant"], source: ["cv", "linkedin", "github", "mohamed"] },
      { name: l("Observability & tracing", "المراقبة والتتبّع"), evidence: ["case:gov-bilingual-assistant", "case:almajed-sales-assistant"], source: ["cv", "linkedin", "github"] },
      { name: l("Prompt robustness testing", "اختبار ثبات الموجّهات"), evidence: ["project:prompt-reliability-harness"], source: ["github"] },
      { name: l("Guardrails", "حواجز الحماية"), evidence: ["project:rag-answering-service", "project:staged-llm-evaluator", "case:almajed-sales-assistant"], source: ["github"] },
      { name: same("Langfuse"), evidence: ["case:almajed-sales-assistant"], source: ["github", "mohamed"] },
    ],
  },
  {
    id: "backend",
    title: l("Backend & data", "الواجهات الخلفية والبيانات"),
    summary: l(
      "Python services and the databases behind them.",
      "خدمات Python وقواعد البيانات التي تقف خلفها.",
    ),
    skills: [
      { name: same("Python"), endorsements: 10, evidence: ["role:wakeb", "role:arabsstock", "role:empoweromics"], source: ["cv", "linkedin", "github"] },
      { name: same("FastAPI"), evidence: ["case:wakeb-bilingual-chatbot", "case:arabsstock-assistant", "project:rag-answering-service"], source: ["cv", "linkedin", "github"] },
      { name: same("gRPC"), evidence: ["role:wakeb"], source: ["cv", "linkedin", "github"] },
      { name: same("PostgreSQL"), endorsements: 11, evidence: ["role:arabsstock", "case:almajed-sales-assistant"], source: ["cv", "linkedin", "github"] },
      { name: same("SQL"), endorsements: 9, evidence: ["role:mdp", "role:empoweromics"], source: ["cv", "linkedin"] },
      { name: same("SQL Server"), evidence: ["role:empoweromics", "role:aestheticspro"], source: ["cv", "linkedin", "github"] },
      { name: same("Cosmos DB"), evidence: ["role:empoweromics"], source: ["cv", "linkedin"] },
      { name: same("DuckDB"), evidence: ["case:tabaqat-gis"], source: ["cv"] },
      { name: same("MongoDB"), endorsements: 12, evidence: [], source: ["linkedin"] },
      { name: l("ETL pipeline design", "تصميم خطوط ETL"), evidence: ["role:empoweromics", "case:tabaqat-gis"], source: ["cv", "linkedin"] },
      { name: same("Go"), evidence: [], source: ["cv"] },
    ],
  },
  {
    id: "ml",
    title: l("Machine learning & data science", "تعلّم الآلة وعلم البيانات"),
    summary: l(
      "The foundation: models, features and the analysis around them.",
      "الأساس: النماذج والخصائص والتحليل المحيط بها.",
    ),
    skills: [
      { name: l("Artificial intelligence", "الذكاء الاصطناعي"), endorsements: 19, evidence: ["role:arabsstock", "role:wakeb"], source: ["linkedin"] },
      { name: l("Machine learning", "تعلّم الآلة"), endorsements: 17, assessmentPassed: true, evidence: ["case:empoweromics-ml", "role:aestheticspro"], source: ["linkedin", "cv"] },
      { name: l("Deep learning", "التعلّم العميق"), endorsements: 17, evidence: ["role:empoweromics", "project:arabic-sentiment-analysis"], source: ["linkedin", "cv"] },
      { name: l("Data science", "علم البيانات"), endorsements: 15, evidence: ["role:empoweromics", "role:aestheticspro"], source: ["linkedin"] },
      { name: l("Data analysis", "تحليل البيانات"), endorsements: 15, evidence: ["role:aestheticspro"], source: ["linkedin"] },
      { name: l("Algorithms", "الخوارزميات"), endorsements: 16, evidence: [], source: ["linkedin"] },
      { name: l("Data visualisation", "التمثيل المرئي للبيانات"), endorsements: 12, evidence: ["project:covid19-dashboard", "case:tabaqat-gis"], source: ["linkedin"] },
      { name: same("PyTorch"), evidence: ["role:empoweromics"], source: ["cv", "linkedin", "github"] },
      { name: same("TensorFlow"), evidence: ["project:arabic-sentiment-analysis"], source: ["cv", "github"] },
      { name: same("scikit-learn"), evidence: ["project:telco-churn", "project:house-price-hyderabad"], source: ["cv", "github"] },
      { name: l("NLP (Arabic and English)", "معالجة اللغة الطبيعية (عربي وإنجليزي)"), evidence: ["case:empoweromics-ml", "project:arabic-sentiment-analysis"], source: ["cv", "linkedin", "github"] },
      { name: l("Computer vision", "الرؤية الحاسوبية"), evidence: ["case:empoweromics-ml", "case:arabsstock-assistant"], source: ["cv"] },
      { name: same("Spark"), evidence: ["project:stroke-prediction-pyspark"], source: ["github"] },
    ],
  },
  {
    id: "cloud",
    title: l("Cloud", "الحوسبة السحابية"),
    // The AWS certification is listed under Certifications only (round 6, HM-10).
    summary: l(
      "Athena on AWS at Tabaqat; Functions and Cosmos DB on Azure at Empoweromics; Cloudflare Workers for logic-controls.com and this site.",
      "Athena على AWS في Tabaqat، وFunctions وCosmos DB على Azure في Empoweromics، وCloudflare Workers لموقع logic-controls.com ولهذا الموقع.",
    ),
    skills: [
      { name: same("AWS (SageMaker, EC2, S3, Athena, EKS)"), evidence: ["case:tabaqat-gis"], source: ["cv", "linkedin"] },
      { name: same("Azure (Functions, Cosmos DB, DevOps)"), evidence: ["role:empoweromics", "case:almajed-sales-assistant"], source: ["cv", "linkedin"] },
      { name: same("GCP"), evidence: [], source: ["cv"] },
      { name: same("Cloudflare Workers"), evidence: ["case:logic-controls-website"], source: ["logic-controls", "github"] },
    ],
  },
  {
    id: "frontend",
    title: l("Frontend", "الواجهات الأمامية"),
    summary: l(
      "Accessible, multilingual sites with Arabic RTL, tested end to end.",
      "مواقع متعددة اللغات تراعي معايير الإتاحة، وتدعم العربية من اليمين إلى اليسار، ومختبرة من طرف إلى طرف.",
    ),
    skills: [
      { name: same("TypeScript"), evidence: ["case:logic-controls-website"], source: ["logic-controls", "github"] },
      { name: same("Astro"), evidence: ["case:logic-controls-website"], source: ["logic-controls", "github"] },
      { name: same("Tailwind CSS"), evidence: ["case:logic-controls-website"], source: ["logic-controls", "github"] },
      { name: l("Accessibility (WCAG 2.2 AA)", "إتاحة الوصول (WCAG 2.2 AA)"), evidence: ["case:logic-controls-website"], source: ["logic-controls", "github"] },
      { name: l("Arabic RTL & internationalisation", "دعم العربية (RTL) وتعدد اللغات"), evidence: ["case:logic-controls-website"], source: ["logic-controls", "github"] },
      { name: l("Testing (Vitest, Playwright)", "الاختبارات (Vitest وPlaywright)"), evidence: ["case:logic-controls-website"], source: ["logic-controls"] },
    ],
  },
  {
    id: "ways-of-working",
    title: l("Ways of working", "أسلوب العمل"),
    summary: l(
      // Round 7 (R7-12): the team of 7 and what the teaching was (the About text has the details).
      "Leading a team of 7 at Globant; earlier, lecturing and mentoring master's students and teaching AI to engineers.",
      "قيادة فريق من 7 أعضاء في Globant، وقبلها إلقاء المحاضرات لطلاب الماجستير وتوجيههم، وتدريس الذكاء الاصطناعي لمهندسين.",
    ),
    skills: [
      { name: l("Team leadership", "قيادة الفرق"), evidence: ["role:globant"], source: ["github", "linkedin"] },
      { name: same("Scrum"), endorsements: 15, evidence: [], source: ["linkedin"] },
      { name: same("Agile"), endorsements: 15, evidence: [], source: ["linkedin"] },
      { name: l("Teaching & mentoring", "التدريس والتوجيه"), evidence: ["role:buid", "role:mtc"], source: ["linkedin", "cv", "github"] },
      { name: l("System design", "تصميم الأنظمة"), evidence: [], source: ["cv"] },
    ],
  },
];

const education: readonly Education[] = [
  {
    id: "msc-data-science",
    degree: l("M.Sc. in Data Science", "ماجستير في علم البيانات"),
    institution: l(
      "Cairo University, Faculty of Graduate Studies for Statistical Research",
      "جامعة القاهرة، كلية الدراسات العليا للبحوث الإحصائية",
    ),
    logo: { file: "cairo-university", monogram: "CU" },
    period: { start: "2023-09", end: "2027" },
    status: "in-progress",
    notes: l("In progress, expected 2027", "قيد الدراسة، والتخرج المتوقع عام 2027"),
    courses: [
      l("Advanced Machine Learning", "تعلّم الآلة المتقدم"),
      l("Advanced Bayesian Inference", "الاستدلال البايزي المتقدم"),
      l("Pattern Recognition", "التعرّف على الأنماط"),
      l("Deep Neural Networks", "الشبكات العصبية العميقة"),
      l("Time Series Forecasting", "التنبؤ بالسلاسل الزمنية"),
      l("Data Science Decision Support Systems", "نظم دعم القرار في علم البيانات"),
      l("Recommender Systems (project)", "نظم التوصية (مشروع)"),
    ],
    leadWith: true,
    source: ["mohamed", "linkedin", "cv"],
  },
  {
    id: "iti-ai-diploma",
    degree: l("Diploma in Artificial Intelligence", "دبلوم الذكاء الاصطناعي"),
    institution: l("Information Technology Institute (ITI)", "معهد تكنولوجيا المعلومات (ITI)"),
    logo: { file: "iti", monogram: "ITI" },
    period: { start: "2021-04", end: "2022-02" },
    status: "completed",
    notes: l("9-month programme in partnership with EPITA, Paris", "برنامج مدته 9 أشهر بالشراكة مع EPITA في باريس"),
    courses: [],
    leadWith: true,
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "beng-structural",
    degree: l("B.Eng. in Structural Engineering", "بكالوريوس الهندسة، تخصص الهندسة الإنشائية"),
    institution: l("Tanta University, Faculty of Engineering", "جامعة طنطا، كلية الهندسة"),
    logo: { file: "tanta-university", monogram: "TU" },
    period: { start: "2015-09", end: "2020-08" },
    status: "completed",
    courses: [],
    leadWith: false,
    source: ["cv", "linkedin", "github"],
  },
];

const certifications: readonly Certification[] = [
  {
    id: "aws-mls",
    name: same("AWS Certified Machine Learning – Specialty"),
    issuer: l("Amazon Web Services", "Amazon Web Services"),
    logo: { file: "aws", monogram: "AWS" },
    issued: "2022",
    featured: false,
    onCv: true,
    source: ["cv", "linkedin", "github"],
  },
  {
    id: "datacamp-data-scientist-python",
    name: same("Data Scientist with Python"),
    issuer: same("DataCamp"),
    logo: null,
    issued: "2021-10",
    featured: false,
    onCv: false,
    source: ["linkedin"],
  },
  {
    id: "datacamp-data-analyst-sql-server",
    name: same("Data Analyst with SQL Server"),
    issuer: same("DataCamp"),
    logo: null,
    issued: "2022-05",
    featured: false,
    onCv: false,
    source: ["linkedin"],
  },
  {
    id: "365-tableau",
    name: same("Introduction to Tableau"),
    issuer: same("365 Data Science"),
    logo: null,
    issued: null,
    featured: false,
    onCv: false,
    source: ["linkedin"],
  },
  {
    id: "aws-academy-cloud-foundations",
    name: same("AWS Academy Cloud Foundations"),
    issuer: same("AWS Academy"),
    logo: { file: "aws", monogram: "AWS" },
    issued: null,
    featured: false,
    onCv: false,
    source: ["linkedin"],
  },
];

const honors: readonly Honor[] = [
  {
    id: "best-engineer-empoweromics",
    title: l("Best Engineer of the Year", "جائزة أفضل مهندس للعام"),
    issuer: same("Empoweromics"),
    roleId: "empoweromics",
    // The sources don't date the award (LinkedIn shows it under the 2022–2023 role without a year).
    period: null,
    description: l(
      "Awarded at Empoweromics for innovation and excellence in AI engineering.",
      "مُنحت في Empoweromics تقديرًا للابتكار والتميّز في هندسة الذكاء الاصطناعي.",
    ),
    source: ["linkedin"],
  },
];

const cvData: Cv = {
  // Round 6 (HM-09, HM-01, HM-08, HM-10): Globant and the STA project first, in the approved wording, with the team of
  // 7; "multi-agent … in production" only after "Before Globant"; the AWS certification under Certifications only.
  // Round 7 (R7-13, CV-04, AR-06): the 7 years and the team of 7 in separate sentences, no subjectless "Leads its …",
  // and one «يقود» in Arabic. The approved STA clause follows "the AI engineering" verbatim.
  summary: l(
    "AI Team Lead at Globant with 7 years in data and AI. On the Saudi Tourism Authority (STA) project, leads a team of 7 and the AI engineering: an agentic LLM runtime (LangGraph) with retrieval, human-approval gates and evaluation, serving Noura, the public visitor assistant, and an internal staff assistant, in Arabic and English. Before Globant, designed, shipped and ran multi-agent LLM systems in production: a 14-agent assistant for ArabsStock and a 6-agent Arabic/English chatbot on self-hosted Qwen (vLLM on NVIDIA A100) at Wakeb Data.",
    "قائد فريق ذكاء اصطناعي في Globant، بخبرة 7 سنوات في البيانات والذكاء الاصطناعي. وفي مشروع الهيئة السعودية للسياحة (STA) يقود فريقًا من 7 أعضاء وهندسة الذكاء الاصطناعي: بيئة تشغيل على LangGraph لوكيل ذكي قائم على النماذج اللغوية، تجمع الاسترجاع ونقاط الموافقة البشرية والتقييم، وتخدم «نورة»، المساعد الافتراضي للزوار، ومساعدًا داخليًا للموظفين، بالعربية والإنجليزية. وقبل Globant صمّم أنظمة LLM متعددة الوكلاء وأطلقها وشغّلها في بيئة الإنتاج: مساعدًا من 14 وكيلًا لمنصة ArabsStock، وروبوت محادثة ثنائي اللغة من 6 وكلاء على Qwen مستضاف ذاتيًا (vLLM وNVIDIA A100) في Wakeb Data.",
  ),
  summaryStrong: [
    l("7 years in data and AI", "بخبرة 7 سنوات في البيانات والذكاء الاصطناعي"),
    l("team of 7", "فريقًا من 7 أعضاء"),
    l("Saudi Tourism Authority (STA) project", "مشروع الهيئة السعودية للسياحة (STA)"),
    l("14-agent assistant", "مساعدًا من 14 وكيلًا"),
    l("6-agent Arabic/English chatbot", "روبوت محادثة ثنائي اللغة من 6 وكلاء"),
  ],
  // Round 7 (HM-17): the site's tiers on the CV: the evidenced skills first, then "also used" for the ones the site
  // lists under "Also worked with" (the keywords stay, the weighting is honest). Plus the screening words a team-lead
  // search uses: vector databases, LLMOps and a Leadership line (the team of 7, the teaching), all already sourced.
  skills: [
    {
      label: l("LLMs & agents", "النماذج اللغوية والوكلاء"),
      // Round 6 (HM-17): Generative AI, Agentic AI, Azure OpenAI and Hugging Face Transformers, each sourced (see the
      // site's skills: LinkedIn About, the ArabsStock generation work, the GitHub profile, Text-Summarization-NLP).
      items: [
        l("Generative AI", "الذكاء الاصطناعي التوليدي"),
        l("Agentic AI", "الذكاء الاصطناعي الوكيلي"),
        same("LangGraph"),
        l("Multi-agent systems", "الأنظمة متعددة الوكلاء"),
        same("MCP"),
        same("OpenAI API"),
        same("Qwen"),
        same("Hugging Face Transformers"),
        l("Prompt engineering", "هندسة الموجّهات"),
      ],
      alsoUsed: [same("LangChain"), same("Azure OpenAI")],
      source: ["cv", "linkedin", "github"],
    },
    {
      label: l("Retrieval", "الاسترجاع"),
      items: [
        same("RAG"),
        l("Hybrid search (vector + BM25)", "البحث الهجين (متجهي + BM25)"),
        l("LLM reranking", "إعادة الترتيب بنموذج لغوي"),
        l("Vector databases (Pinecone)", "قواعد البيانات المتجهية (Pinecone)"),
      ],
      alsoUsed: [same("ChromaDB"), same("Qdrant"), same("pgvector")],
      source: ["cv", "linkedin", "github"],
    },
    {
      label: l("Serving, MLOps & LLMOps", "خدمة النماذج وMLOps وLLMOps"),
      items: [l("vLLM on NVIDIA A100", "vLLM على NVIDIA A100"), l("Model versioning", "إدارة إصدارات النماذج"), l("Health monitoring", "مراقبة الحالة"), same("Docker"), same("CI/CD"), same("Nginx"), same("Prefect")],
      alsoUsed: [same("Kubernetes (EKS)")],
      source: ["cv", "linkedin", "github"],
    },
    {
      label: l("Evaluation", "التقييم"),
      items: [l("LLM and agent evaluation", "تقييم النماذج اللغوية والوكلاء"), l("Observability", "المراقبة"), l("Guardrails", "حواجز الحماية")],
      alsoUsed: [same("Langfuse")],
      source: ["cv", "github"],
    },
    {
      label: l("Backend & data", "الواجهات الخلفية والبيانات"),
      items: [same("Python"), same("FastAPI"), same("gRPC"), same("PostgreSQL"), same("SQL Server"), same("Cosmos DB"), same("DuckDB"), same("ETL")],
      source: ["cv", "linkedin", "github"],
    },
    {
      label: l("Machine learning", "تعلّم الآلة"),
      items: [same("PyTorch"), same("TensorFlow"), same("scikit-learn"), l("NLP (Arabic and English)", "NLP (عربي وإنجليزي)"), l("Computer vision", "الرؤية الحاسوبية"), same("Spark")],
      source: ["cv", "linkedin", "github"],
    },
    {
      label: l("Cloud", "الحوسبة السحابية"),
      items: [same("AWS (SageMaker, EC2, S3, Athena, EKS)"), same("Azure (Functions, Cosmos DB)"), same("Cloudflare Workers")],
      source: ["cv", "linkedin", "logic-controls"],
    },
    {
      // The team of 7 (Mohamed, 2026-10-11) and the teaching (BUID, MTC); Agile and Scrum are endorsed on LinkedIn
      // without a project, like the site's "Also worked with".
      label: l("Leadership", "القيادة"),
      items: [
        l("Team leadership (team of 7)", "قيادة الفرق (فريق من 7 أعضاء)"),
        l("Mentoring and teaching", "التوجيه والتدريس"),
        l("System design", "تصميم الأنظمة"),
      ],
      alsoUsed: [same("Agile/Scrum")],
      source: ["mohamed", "linkedin", "cv"],
    },
    // No Frontend line on the CV since round 6 (HM-14): the site's toolbox keeps it, with the logic-controls.com work.
  ],
  openSource: [
    {
      id: "prompt-reliability-harness",
      line: l(
        "Measures how consistently an LLM answers paraphrased, noisy or reordered questions. Result (gpt-4o-mini): regex correctness 1.00, yet mean consistency 0.49.",
        "يقيس ثبات إجابات النموذج حين يُعاد السؤال بصياغة أخرى أو بضوضاء أو بترتيب مختلف. النتيجة (gpt-4o-mini): صحة 1.00 وفق التعبيرات النمطية، لكن متوسط الثبات 0.49.",
      ),
      source: ["github"],
    },
    {
      id: "staged-llm-evaluator",
      line: l(
        "Replayable LangGraph grading in quality, safety and retry stages; the verdict is computed in plain Python, and every LLM call is logged with a SHA-256 prompt hash.",
        "تقييم على LangGraph قابل لإعادة التشغيل بمراحل للجودة والسلامة وإعادة المحاولة، حكمه النهائي بشيفرة Python عادية، وكل استدعاء للنموذج مسجَّل مع بصمة SHA-256 للموجّه.",
      ),
      source: ["github"],
    },
  ],
  // Contract work (2026-10-28): Al Majed Oud, from its case study's public-safe facts only (no usage numbers, no store
  // count, never "live today": in production from June 2026, handed over in August 2026).
  contract: [
    {
      slug: "almajed-sales-assistant",
      title: l("Sole AI Engineer", "مهندس الذكاء الاصطناعي الوحيد"),
      bullets: [
        factB(
          ["a LangGraph router and 9 specialist agents", "موجّه LangGraph و9 وكلاء متخصصين"],
          "Arabic-first sales assistant, built end to end: a LangGraph router and 9 specialist agents answer staff in Arabic and English via guarded text-to-SQL over data synced from Microsoft Fabric every 15 minutes.",
          "مساعد مبيعات بالعربية أولًا من البداية إلى النهاية: موجّه LangGraph و9 وكلاء متخصصين يجيبون الموظفين بالعربية والإنجليزية عبر SQL محميّ على بيانات من Microsoft Fabric تُحدَّث كل 15 دقيقة.",
          "mohamed",
        ),
        factB(
          ["155/155", "155/155"],
          "Releases gated by 399 bilingual evals; the final one passed its 155-case gate 155/155. On Azure with Entra SSO and Langfuse from June 2026; handed over in August 2026.",
          "إصدارات تحرسها 399 حالة تقييم ثنائية اللغة، واجتاز آخرها بوابة الـ155 حالة بنتيجة 155/155. على Azure مع Entra SSO وLangfuse منذ يونيو 2026، وسُلِّم في أغسطس 2026.",
          "mohamed",
        ),
      ],
    },
  ],
  // Round 6 (HM-13): the same roles as the site (basics.openTo) and three arrangements: "AI/ML Team Lead or Senior
  // AI / LLM Engineer, remote, relocation to the Gulf or Europe, or hybrid in Cairo". The notice period is
  // basics.openTo.noticePeriod (round 7).
  openTo: {
    roles: OPEN_TO_ROLES,
    arrangements: [
      l("Remote", "عن بُعد"),
      l("Relocation to the Gulf or Europe", "الانتقال إلى الخليج أو أوروبا"),
      l("Hybrid in Cairo", "عمل هجين في القاهرة"),
    ],
    source: ["mohamed"],
  },
  // The file name a recruiter's downloads folder or ATS shows: name and role (round 6, HM-39).
  fileName: l("Mohamed-Hatem-AI-Team-Lead-CV.pdf", "Mohamed-Hatem-AI-Team-Lead-CV-Arabic.pdf"),
  updated: "2026-10-28",
};

/** The profile the whole site renders from. */
export const profile: Profile = {
  basics,
  metrics,
  experience,
  caseStudies,
  projects,
  skills,
  education,
  certifications,
  honors,
  cv: cvData,
  site: {
    url: "https://mohamedhatem.dev",
    published: "2026-10-10",
    updated: "2026-10-11",
    repo: "https://github.com/mhatem5351/mohamedhatem.dev",
    defaultLocale: "en",
    sections: ["work", "experience", "projects", "skills", "education", "about", "assistant", "contact"],
    pages: { cv: { en: "/cv/", ar: "/ar/cv/" } },
  },
};

export default profile;
