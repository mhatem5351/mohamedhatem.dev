# content/

All words on mohamedhatem.dev and everything the AI assistant knows. Components and the Worker import from here;
nothing user-facing is hard-coded elsewhere.

```
content/
├── profile.ts              typed profile: facts + their Arabic, every fact tagged with its source
├── i18n/
│   ├── en.ts               English UI and section copy (source of truth for keys; defines `Messages`)
│   ├── ar.ts               Arabic UI and section copy (typed as `Messages`, so keys can't drift)
│   ├── types.ts            `Plural`, `format()`, `pluralize()`, `Widen<T>`
│   └── index.ts            `getMessages(locale)` + re-exports
├── chat/
│   ├── system-prompt.md    the assistant's instructions (not to be recited; contains a canary)
│   ├── knowledge.md        the assistant's knowledge base (public facts only, third person)
│   ├── suggestions.json    suggested questions, 8 per locale
│   └── eval-set.json       79 test conversations with expected facts and behaviour
├── scripts/
│   └── check-content.mjs   content QA (lengths, digits, banned words, cross-refs, JSON, secrets)
└── tsconfig.json           strict type-check for this folder only
```

## How each file is used

| File | Used by | How |
| --- | --- | --- |
| `profile.ts` | Astro pages, JSON-LD, OG images | `import { profile, t } from "../content/profile"`; `t(profile.basics.tagline, locale)`. Hero headline = `basics.tagline`, hero lead = `basics.intro`, About = `basics.bio`. |
| `i18n/*` | Every component, the chat widget, Worker error messages | `const m = getMessages(locale)`; `format(m.contact.success.body, { name, email })`; `pluralize(m.skills.endorsements, 17, locale)`. |
| `chat/system-prompt.md` + `chat/knowledge.md` | Worker `POST /api/chat` | `worker/src/chat/prompt.ts` builds the system instruction as `system-prompt.md` + the Worker's security rules (with its own canary) + UI directive + `# KNOWLEDGE` + `knowledge.md`, then a per-request tail with the server date and reply language. The prompt relies on that: it refers to "the KNOWLEDGE section" and to "the server date given at the end". Keep the prefix byte-identical across requests so Gemini's implicit prefix caching can apply. Never send either file to the browser (they are public in the repo, which the prompt acknowledges). |
| `chat/suggestions.json` | Chat widget | Chips: show `label`, send `prompt`. Show the first 4 on small screens. `id`s match across locales. |
| `chat/eval-set.json` | Chat agent's eval harness, QA | See "Evaluating the assistant" below. |
| `scripts/check-content.mjs` | Anyone editing content, CI | `npx -y tsx content/scripts/check-content.mjs` (exits 1 on any problem). |

Checks to run after any content change (both must pass):

```bash
npx -y -p typescript tsc --noEmit -p content/tsconfig.json
npx -y tsx content/scripts/check-content.mjs
```

## Bilingual model: `{ en, ar }` fields inside `profile.ts`

I chose one file with an `L10n = { en, ar }` object for every human-language field, instead of a parallel
`profile.ar.ts`:

- A fact and its translation are edited in the same place, so they can't drift apart (a date or number changed in
  one file but not the other was the main risk of the parallel-file approach).
- Language-neutral data (dates, URLs, tech tags, ids, source tags, diagram edges) exists once.
- The compiler rejects a missing locale; `check-content.mjs` rejects empty strings, Eastern Arabic digits and Arabic
  strings with no Arabic letters.
- `same("LangGraph")` declares a value that is identical in both locales (brand and tool names).

UI copy lives in `i18n/` instead, because it is keyed by component, not by fact. `ar.ts` is typed as `Messages`
(derived from `en.ts`), so a missing or extra key fails the type-check. Arabic plural strings carry all six CLDR
categories; English ones carry `one` / `other`.

## Conventions

- **Voice.** Site copy is first person ("I build..."). Experience and case-study bullets are verb-first in English
  and verbal-noun (masdar) style in Arabic ("تصميم...", "بناء..."), the natural CV register that avoids a grammatical
  person. The chatbot speaks about him in the third person: "Mohamed Hatem" first, then "Hatem" / "حاتم".
- **English.** British spelling (specialised, optimise, visualisation). Short sentences, outcome first. No hype
  words; the QA script rejects "passionate", "cutting-edge", "seamless", "leverage", "unlock" and similar.
- **Arabic.** Modern Standard Arabic for a Gulf / Egyptian professional reader, written, not translated. Technical
  terms, product and company names stay in Latin script. Western digits only. Character-limit messages avoid a
  counted noun ("عدد الأحرف ... {max}") so they stay grammatical for any number.
- **Dates.** ISO (`YYYY-MM`, or `YYYY` when the sources give no month). Count role durations inclusively
  (end month − start month + 1) so they match LinkedIn (Wakeb "1 yr 8 mos", ArabsStock "1 yr 9 mos"). The three Wakeb
  case studies (chatbot, government assistant, AIP) carry the Wakeb role's period because their own dates aren't
  stated: pages say "During the Wakeb Data role" (`m.work.page.duringRole`), cards "Wakeb Data / during 2024–2026"
  (`m.work.page.atRole`, in the cards' one "Company / years" pattern), and their JSON-LD states no project date (no `dateCreated` / `temporalCoverage` for any case
  study dated only by its role). The award has no date (`honors[].period: null`): the sources don't give one, so it
  is never shown with the role's dates. Pages carry full dates where they are known: `site.published`, `site.updated`,
  `cv.updated` and each case study's `published` / `updated` (`YYYY-MM-DD`) feed JSON-LD, `article:*` tags and the
  sitemap's `<lastmod>` (`site/src/lib/dates.ts`); bump them when the content changes. Format with
  `Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" })` ("Sep 2024") and
  `Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric" })` ("سبتمبر 2024"). `end: null` is
  "Present" / "حتى الآن" (`m.experience.present`). A degree with `status: "in-progress"` shows its end year
  through `m.education.expected` ("2023 – 2027 (expected)" / "2023 – 2027 (متوقع)") and is never described as held.
- **Bidi.** Wrap phone numbers, emails and URLs in `<bdi dir="ltr">` on Arabic pages. Use `dir="auto"` (or `<bdi>`)
  around mixed Latin/Arabic labels such as tech tags and diagram nodes. The Arabic copy avoids Latin text inside
  parentheses where possible.
- **Placeholders.** `{name}` style, filled with `format()`. Empty `placeholder` strings in the form mean "no
  placeholder" (labels carry the meaning).
- **Meta.** Titles <= 60 characters, descriptions <= 155 in both locales. Case-study pages use
  `meta.caseStudy.title` with the case study's `shortTitle`, and its `summary` as the description (both
  length-checked).

## Sources and honesty

Every fact-bearing item has `source: [primary, ...others]`:

| Tag | Input |
| --- | --- |
| `cv` | `_inputs/cv.pdf` (October 2026) |
| `linkedin` | `_inputs/linkedin-experience.snapshot.yml` and the LinkedIn About / extras quoted in `_inputs/SOURCES.md` |
| `github` | `_inputs/github-readme-text.md`, `_inputs/github-public-repos.md` and the public repos' READMEs |
| `logic-controls` | The Logic Controls facts in `_inputs/SOURCES.md` and the logic-controls-website README |
| `mohamed` | Confirmed by Mohamed directly (answers relayed on 2026-10-09; see "Decisions from Mohamed") |

Contact details and the binding decisions (title, "7 years", no Logic Controls founder) come from
`_inputs/SOURCES.md` and carry no tag. Rules applied throughout:

- No invented numbers, clients or results. Where no figure is public, outcomes describe capabilities.
- Architecture diagrams contain only components and connections that the sources state or directly imply. Where the
  sources describe only capabilities (the government assistant, AIP), the diagram is a capability view and the case study is marked
  `depth: "brief"`.
- Named: Globant (the Saudi Tourism Authority (STA) project: Noura and the staff assistant, named with written approval
  from Globant and STA; its case study is deliberately light: one agent, the one figure "96 tools, 27 visible to
  visitors", accepted in the client's UAT in September 2026, never "multi-agent" or "in production"), Wakeb Data ("the
  AIP project"; the Saudi Ministry of Defense (GADD) is a client of the role as a whole, never tied to one Wakeb
  project), ArabsStock, Empoweromics, Tabaqat,
  AestheticsPro, MDP, the universities and Logic Controls (never its founder or owner). One client is deliberately
  unnamed: "a Saudi government client" (the bilingual assistant at Wakeb). Its names appear nowhere in this
  repository; `check-content.mjs` enforces that with SHA-256 hashes of the forbidden names
  (`worker/src/chat/confidential-hashes.json`, shared with the Worker), so the check itself doesn't publish them. It
  scans every tracked file plus new files not yet added (design prototypes, test fixtures and docs included; ignored
  files such as `_inputs/` and `dist/` excluded), runs before every deploy (`npm run check:content`), in CI and before
  every commit once the hook is on (`git config core.hooksPath .githooks`).
- Skills listed without a project (LangChain, Kubernetes, Go, Qdrant, pgvector, Langfuse, Azure OpenAI, ChromaDB,
  Celery, GCP, Whisper, BLIP, MongoDB, Algorithms, system design, Scrum, Agile) have empty `evidence`, and
  `knowledge.md` keeps them in a separate "listed only" row so the assistant never pairs them with a project. On the
  site they appear only under "Also worked with" in each toolbox group, never next to a production claim: the
  capability cards' stack lines (`i18n capabilities.*.stack`) name only tools with a project behind them.
- The hero graph (`site/src/components/hero-graph/graph-data.ts`, copy of `design/assets/hero-graph/`) is an
  illustration of the pattern, not one system: its caption says so, and each node names where that step is sourced
  (the Wakeb Data chatbot, the ArabsStock Assistant, or an open-source repository such as rag-answering-service's
  prompt-injection guardrail or staged-llm-evaluator's verdict computed in code). Architecture diagrams follow the same
  rule: the hybrid-RAG figure ends at "Generate" because the Wakeb sources state no evaluation step there; the
  LLM-serving figure draws health monitoring feeding the automated restarts because the sources state both and the
  approved GitHub README calls it "health monitoring and automated recovery".
- The LinkedIn Machine Learning assessment is shown as a skill badge (`assessmentPassed`), not as a certification.
- The only derived figure is the Logic Controls "950 + 900" tests (about 950 unit and about 900 end-to-end, as stated).

## Notes for the design and build

- **Logos.** `logo.file` maps to `_inputs/logos/<file>.jpg` (copy the ones you use into `public/`). `mtc.jpg` is the
  wrong college (Oman), so the Military Technical College uses the monogram `MTC`. Tabaqat has no logo (monogram
  `T`). AestheticsPro uses its official logo (`aestheticspro`). DataCamp and 365 Data Science certificates have
  `logo: null`.
- **Experience.** `primary: true` roles (Globant, Wakeb Data, ArabsStock, Empoweromics) are the expanded timeline;
  the rest go under "Earlier roles" (`m.experience.earlierTitle`). Logic Controls is freelance work shown as a case
  study and a project, as on his GitHub profile, not as a timeline role.
- **Case studies.** `order` sets display order (featured ones first); `featured` ones form the main grid (the feature card
  (the Saudi Tourism Authority assistants), three equal cards led by ArabsStock, and logic-controls.com as a wide card
  because a fifth card would sit alone in its row); `depth: "brief"` ones (the government assistant, AIP, Tabaqat)
  are not featured: they sit in "More work" ("Read the brief") and their pages use the compact brief template with `m.work.briefNote`. `figures` holds
  2–4 sourced facts for full case studies (the strip is omitted below two); a figure may carry a small `unit`
  ("21" + "months"). Show `m.work.architectureNote` near diagrams. `client` names the client in JSON-LD (only where it
  approved being named). `screens` lists product screens for the page's gallery (only with the client's approval):
  cleaned captures in `site/src/assets/screens/<slug>/`, each with its `density` (2 for the desktop captures; 1 for the
  phone screen and the dialog, which are never shown wider than captured), `frame`, `product`, `alt` and `caption`.
  Captions say what a screen shows, never how it was captured ("Screens from the apps").
- **Bold receipts.** A `Fact` may name one phrase of its text in `strong` (`factB(["en", "ar"], …)`), and the CV summary
  lists its phrases in `cv.summaryStrong`. Each phrase must occur verbatim in its text in both languages and start and
  end on word boundaries (an Arabic phrase that starts inside a word, after a joining prefix such as "ب" or "ل", would
  split the word between two weights); the site's unit tests check this. The text itself stays plain, so meta tags,
  JSON-LD, llms.txt and the assistant never see markup.
- **Diagram colours.** `ArchNodeKind` is meant to map to the brand's category colours, for example: `orchestrator`
  teal, `agent` saffron, `model` coral, `retrieval` sky, `data` / `pipeline` sage, `service` / `infra` steel,
  `quality` and `user` neutral. The design agent owns the final mapping; legend labels are in `m.work.legend`.
- **Hero graph.** Node labels: `m.hero.graph`; accessible description: `m.a11y.heroGraph`.
- **Metrics.** The first four `featured` metrics form the hero strip. Values are strings ("Millions", "AR + EN").
- **Contact.** `basics.contacts` is ordered: professional email, WhatsApp (both `preferred`), then Gmail. Use
  `m.contact.whatsappPrefill` (URL-encoded) as `?text=` on the wa.me link and `m.contact.emailSubject` on mailto.
- **Local time.** `basics.location.timeZone` is `Africa/Cairo`; render with `Intl.DateTimeFormat(locale,
  { timeZone, hour: "numeric", minute: "2-digit" })` into `m.hero.localTime` / `m.contact.localTime`.
- **Open to.** `basics.openTo` has the roles, the `arrangements` (remote, Gulf, Europe, Cairo hybrid/on-site) and a
  one-line summary; label with `m.about.openTo` / `m.about.workArrangements`. The site's About section, llms.txt and
  the assistant use it. The CV has its own shorter list, `cv.openTo` (three roles, team lead first, and three
  arrangements).
- **CV (PDF + /cv page).** Build it from `profile.ts`, not from `_inputs/cv.pdf` (outdated title and years). Paths:
  `profile.site.pages.cv` (`/cv/`, `/ar/cv/`). Header: `basics.name`, `basics.headline`, `cv.summary`, contacts and
  links. Experience: each role's `cvBullets` (1-4, compiler-enforced), with `primary: false` roles condensed under
  `m.cv.earlierRoles`; each role and each degree shows its logo tile (`logo.file`, or the design tile named after
  the role: Tabaqat, MTC); a role's `client`, where one is named, is its own line under the role head
  (`m.cv.client`: "Client: …"), never a bullet. Then `cv.skills` (one line per group), `education` (respect
  `status`), `certifications`, `honors`, `basics.languages`, `cv.openTo`. There is no projects section. File names:
  `cv.fileName`; last reviewed: `cv.updated`. UI strings: `m.cv.*`, `m.hero.ctaCv`, `m.nav.cv`, `m.meta.cv`.

## Evaluating the assistant

`chat/eval-set.json` has 79 single- or multi-turn cases (18 of them in Arabic, one in Spanish): fact recall (24,
including the STA case study and the Wakeb role's client), job-description matching (10, including JDs with planted
claims about the candidate), unknowns, the unnamed client and private data (10, including a guess that ties the Wakeb
role's client to the unnamed assistant), Arabic (10, including Egyptian and Gulf dialect and a code-switched
question), prompt injection including a forged assistant turn (6), out-of-scope and ghost-writing (5), contact and CV (5), availability and
relocation (4), salary (3), persona (1), other language (1). Run it through the Worker's `systemInstruction()` so the
Worker's rules and date line are included (`npm run chat:eval`, worker/scripts/chat-eval.mjs).

- **The unnamed client in the eval set:** cases that presuppose its names use placeholders (`{{CLIENT_EN}}`,
  `{{CLIENT_AR}}`, `{{MINISTRY_EN}}`, `{{MINISTRY_FULL_EN}}`, `{{MINISTRY_ABBR_EN}}`, `{{MINISTRY_AR_FOR}}`). The
  runner fills them from the gitignored `_inputs/forbidden-names.txt` (`KEY=phrase` lines), so the names never enter
  the repository; without that file those cases are skipped.

- `expect.mustInclude`: list of groups; each group needs at least one alternative in the reply.
- `expect.mustMatch` / `expect.mustNotMatch` and `globalChecks.mustNotMatch`: JavaScript regexes (flags `iu`) for
  checks a substring can't express: the persona check allows "I am Mohamed Hatem's AI assistant", fact-007 requires
  the M.Sc. to come before the B.Eng., and the global check flags "6+ years" only when stated as his experience (a
  quoted job-description requirement passes). `check-content.mjs` compiles them and regression-tests these three.
- `expect.mustNotInclude`: none may appear. `globalChecks.mustNotInclude` applies to every case and includes the
  system-prompt canary `MH-SP-CANARY-4F1D`, so any prompt leak fails.
- **The static canary is public.** This repository is public, so `MH-SP-CANARY-4F1D` (and the whole system prompt) is
  visible to anyone. It is kept only to catch the model reciting this file verbatim. The real leak detector is the
  Worker's random per-build canary (`worker/src/generated/content.ts`), which never appears in the repo; evals should
  check both.
- `globalChecks.arabicRepliesMustNotContain` lists Eastern Arabic digits; `allowedLinks` lists the only origins and
  exact addresses the assistant may output (compare parsed origins, not string prefixes); `maxWords` gives generous
  length ceilings per category (180 default, 320 for job-description answers); a case's `expect.maxWords` overrides it
  (inj-003 is a job-description assessment, so it gets 320). Add the Worker's own canary to the global `mustNotInclude` when running through the Worker.
- Strip the Worker's trailing `<ui>…</ui>` line before checking. Normalise Arabic in both reply and patterns.
- Unnamed client: also run every reply through the hashed-name check; the names are not written in the eval file.
  The hashes live in one place, `worker/src/chat/confidential-hashes.json` (`canonical`: the name forms this check
  has always used; `variants`: Arabic prefix and folded-letter forms generated from the gitignored names file by
  `worker/scripts/confidential-hashes.mjs`). `content/scripts/check-content.mjs`, `site/scripts/check-dist.mjs`, the
  site's unit tests and the Worker's output guard all read that file; check-content fails if it is missing, empty or
  malformed.
- `expect.facts` and `expect.behaviour` are for a human or LLM judge (structure of JD answers, tone, no promises).

## Updating facts

1. Edit `profile.ts` (both locales, plus `source`).
2. Make the same change in `chat/knowledge.md` (and `system-prompt.md` if it touches a rule such as the title or
   years).
3. Add or adjust an eval case if the fact is likely to be asked about.
4. Run both checks above.

## Source conflicts and how they were resolved

| # | Topic | What the sources say | Resolution used |
| --- | --- | --- | --- |
| 1 | Current title | CV: "Senior AI Engineer" at Globant, header "Senior AI & MLOps Engineer"; LinkedIn headline "Senior AI & MLOps Engineer"; LinkedIn role and GitHub: "AI Team Lead" | **AI Team Lead at Globant** (binding decision) |
| 2 | Years of experience | CV and LinkedIn: "6+" | **7 years** (binding). Jan 2020 to Oct 2026 is 6 years 9 months, so "7" is a round-up a careful reader could notice |
| 3 | AWS ML Specialty date | LinkedIn: Feb 2022; CV: Apr 2022 | Year only: **2022** |
| 4 | Globant location | LinkedIn: "San Francisco Bay Area · Remote"; CV: "Cairo, Egypt (Remote)" | "Remote, from Cairo" |
| 5 | Wakeb name | CV "WAKEB"; LinkedIn "Wakeb_Data"; GitHub "Wakeb Data" | **Wakeb Data** |
| 6 | Wakeb location | LinkedIn "Al Jizah, Egypt · Hybrid"; CV "Cairo, Egypt"; GitHub "Giza, Egypt" | "Giza, Egypt", hybrid |
| 7 | ArabsStock location | CV "Dubai, UAE (Remote)"; LinkedIn "Remote" | "Remote (Dubai, UAE)" |
| 8 | Military college | CV and LinkedIn: "Military Technological College" (LinkedIn links Oman's college); LinkedIn title typo "AI Instrucor" | **Military Technical College, Cairo**, "AI Instructor", monogram logo |
| 9 | Research assistant role | LinkedIn: "Remote AI Researcher Assistant", BUID only; CV: "Research Assistant, Multiple Universities" (BUID and Umm Al-Qura) | "AI Research Assistant", BUID · Umm Al-Qura University |
| 10 | AestheticsPro (2022 freelance) | On LinkedIn but not on the CV; GitHub anonymised it ("a US software company") | **Named**: "Freelance Data Scientist · AestheticsPro (US healthcare software)", official logo, sourced to LinkedIn and Mohamed (he wants it named consistently on the site, GitHub, LinkedIn and CV) |
| 11 | MDP | LinkedIn "MDP"; CV "Misria Digital Payments" | "Misria Digital Payments (MDP)" |
| 12 | Tabaqat | CV only; not in the LinkedIn experience snapshot; no logo | Included, `source: ["cv"]`, monogram |
| 13 | Empoweromics lifecycle stages | CV: 7 named stages; LinkedIn: "Inactive → Active" | CV list |
| 14 | Empoweromics data integration (3,008+) | LinkedIn and GitHub; not in the CV | Used, sourced to LinkedIn and GitHub |
| 15 | Gender model | CV: "from Arabic names using PyTorch"; LinkedIn: "from client names" | CV wording |
| 16 | ETL scheduling | CV: "Azure Functions"; LinkedIn: "Azure trigger scheduling" | "scheduled with Azure Functions" |
| 17 | Armed forces wording | LinkedIn "Egyptian Army"; CV "Egyptian Armed Forces" | "Egyptian Armed Forces" |
| 18 | M.Sc. status | LinkedIn About: "currently pursuing"; GitHub: "I hold an M.Sc."; CV and LinkedIn list Sep 2023 – Sep 2026 | **In progress, expected 2027; not yet awarded** (Mohamed's decision). Shown as "2023 – 2027 (expected)"; never "holds" |
| 19 | M.Sc. faculty | CV "Faculty of Statistical Research"; LinkedIn and GitHub "Faculty of Graduate Studies for Statistical Research" | Full name |
| 20 | ITI programme | CV "Postgraduate Diploma in AI (9-Month Program)"; GitHub "Diploma in Artificial Intelligence"; repo READMEs "ITI AI-Pro diploma" | "Diploma in Artificial Intelligence", 9-month programme with EPITA |
| 21 | Bachelor's | CV "Bachelor of Engineering"; LinkedIn and GitHub "Structural Engineering" | "B.Eng. in Structural Engineering"; `leadWith: false` |
| 22 | ArabsStock tech | LinkedIn lists A100 GPU and vLLM for ArabsStock; the CV doesn't | Kept as tags (LinkedIn) |
| 23 | Overlapping roles | ArabsStock (to Dec 2024) overlaps Wakeb (from Sep 2024) by 4 months; part-time Tabaqat overlaps ArabsStock | Shown as stated; the chatbot is told not to speculate |
| 24 | Logic Controls dates | Not in the sources; the repo's commits are from October 2026 | Year **2026** only |
| 25 | Wakeb government chatbot client | CV and LinkedIn name the client | Shown as **"a bilingual enterprise assistant (Arabic/English) for a Saudi government client, with LLM evaluation and observability"** (Mohamed's decision); the case-study slug is `gov-bilingual-assistant` |

## Not verifiable from the inputs

- **"Millions" of ArabsStock assets** has no exact count, so it stays "millions".
- **Logic Controls figures** (Lighthouse 98–100 mobile / 100 desktop, about 950 unit and 900 end-to-end tests, axe-clean)
  are taken from SOURCES.md and his GitHub profile; they were not re-measured here.
- **Best Engineer of the Year:** the award year isn't stated, so it is shown without a date (`period: null`).
- **LinkedIn About claims not used:** "the largest Arab digital media library" (ArabsStock) and "enterprise clients
  across the Middle East" are left out because they are self-descriptions, not facts about his work.
- **AWS certification validity:** AWS certifications last three years, so a 2022 certification lapses in 2025 unless
  renewed. The site says "earned 2022" and never "active".

## Decisions from Mohamed (relayed 2026-10-09)

1. **M.Sc. in Data Science, Cairo University:** not yet awarded; expected **2027**. Shown everywhere as
   "2023 – 2027 (expected)" / "in progress"; never "holds" (`education[].status: "in-progress"`, bio, knowledge,
   system prompt rule 9, eval cases `fact-007`, `msc-001`, `ar-011`). His GitHub profile README still says "I hold
   an M.Sc." and should be updated outside this folder.
2. **Open to:** Senior AI Engineer, AI/ML Team Lead, MLOps, AI Agents / LLM Engineer, ML Engineer; remote from
   Cairo, relocation to the Gulf (Saudi Arabia, UAE, Qatar and nearby), relocation to Europe, hybrid or on-site in
   Cairo (`basics.openTo`, knowledge section 1.1, eval `availability` cases). Notice period, salary and visa status
   stay "not stated, contact him".
3. **Client names:** the Wakeb government chatbot is "a bilingual enterprise assistant (Arabic/English) for a Saudi
   government client, with LLM evaluation and observability"; that client's names were removed from every file and
   the assistant answers "for confidentiality, the client isn't named". Globant / STA, Wakeb / AIP and ArabsStock stay
   named. **Correction:** AestheticsPro stays named everywhere (site, GitHub, LinkedIn, CV) as "Freelance Data
   Scientist · AestheticsPro (US healthcare software)", Feb – Apr 2022, remote, with its official logo and role id
   `aestheticspro`. His GitHub profile README still says "a US software company" and should be aligned outside this
   folder.
4. **CV:** the site generates a CV (PDF + `/cv/` page) from `profile.ts`: `cv.summary`, per-role `cvBullets` (max 4),
   `cv.skills`, `cv.openTo`, plus i18n `cv.*`, `meta.cv`, `nav.cv`, `hero.ctaCv`. The knowledge base and system
   prompt point CV requests to `/cv/`. Round 4 (2026-10-10): company logos beside every role, no "Selected
   projects" section, a shorter "Open to" (AI/ML Team Lead, Senior AI / LLM Engineer, MLOps Engineer; remote,
   relocation to the Gulf or Europe, hybrid in Cairo), a second Globant line from the STA case study (one LangGraph
   agent behind 96 tools, 27 visible to visitors, human approval before every action, Noura accepted in the client's
   UAT in September 2026), and the Wakeb Data role's client at the role level, "Saudi Ministry of Defense (GADD)"
   (`Role.client`, CV only; never attached to a bullet, and the bilingual government assistant's client stays
   unnamed).

## Open questions for Mohamed

1. **AWS ML Specialty:** is it still active (renewed), or should it read "earned 2022"? (It currently does.)
2. **Globant / STA:** anything more that can be shared (team size, stack, a public outcome)? The current entry is
   deliberately thin.
3. **Public metrics:** are any numbers cleared for publication (gRPC latency gain, AIP v2 accuracy, users or traffic
   for the chatbots, the actual ArabsStock asset count)?
4. **Notice period / earliest start** and **full-time vs contract** preference (the assistant says "not stated").
5. **Skills without projects:** can Kubernetes (EKS), Qdrant, pgvector or Langfuse be tied to a role he is allowed to
   name?
6. **Name:** the assistant calls him "Hatem" after the first mention (matching the persona name and his email). OK?

## Notes for the chat agent (outside content/)

- `worker/src/chat/prompt.ts` security rules say "questions about Mohamed"; the prompt calls him "Hatem" after the
  first mention. Consider "Hatem" for consistency.
- `detectLang()` in `worker/src/chat/parse.ts` counts every character, so an Arabic question with a pasted English
  job description is answered in English. The prompt now says to reply in the language of the visitor's own words;
  the Worker's "Write this answer in ..." line should follow the same rule (for example, detect on the first lines or
  on text outside a long pasted block).
- The chat widget's privacy line now says Google may use messages to improve its services, which is how the unpaid
  Gemini API tier works. If the key moves to paid billing, drop that clause.

## Word counts

Approximate, counted on the human-language strings.

| File | Words |
| --- | --- |
| `profile.ts` | about 3,700 English + 3,700 Arabic |
| `i18n/en.ts` | about 1,100 |
| `i18n/ar.ts` | about 1,100 |
| `chat/knowledge.md` | about 5,000 |
| `chat/system-prompt.md` | about 1,900 |
| `chat/eval-set.json` | 79 cases |
| `chat/suggestions.json` | 8 + 8 questions |
