# mohamedhatem.dev: art direction and design system

Version 1.0 · 2026-10-09 · owner: design (phase 1) · consumers: the Astro build (phase 2), the chat widget, content.

Everything in this document is implemented in `design/prototypes/*.html` (open them over http, see `HANDOFF.md`)
and in `design/tokens.css`. Where this document and a prototype disagree, the prototype's CSS is the more precise
statement of intent; tell design and fix one of them.

---

## 1. Concept: "Production, made visible"

Mohamed builds multi-agent LLM systems that run in production. Most AI portfolios *say* that with adjectives,
purple gradients and stock "neural" imagery. This one **shows the system**:

- The hero is a live multi-agent graph: a request enters, the orchestrator dispatches it through `guard`,
  `retrieve`, `rerank`, `generate`, `evaluate` (and sometimes `tools · mcp`), and an answer leaves. It illustrates the
  pattern behind his agent systems, not one system (its caption says so: not every system uses every step), and every
  node can be opened to read where he has used that step: the Wakeb Data chatbot, the ArabsStock Assistant or one of
  his open-source tools, each as the sources state it.
- The "Ask my AI" assistant is a working product, one click from anywhere. It is the portfolio's strongest proof.
- Experience is drawn like a **trace view** (the spans-on-a-timeline screen he reads every day in observability tools):
  overlapping roles, part-time work and study are honest and readable at a glance.
- Case studies are drawn like **design docs**: an architecture diagram with numbered callouts, then the decisions.
- Skills come **with receipts**: a matrix where every dot points to the role or repository where the skill was used.

The visual voice is **warm precision**: paper and ink, hairline rules, mono annotation labels, one calm teal accent,
saffron and coral as punctuation. It reads like a beautifully typeset engineering notebook with live instruments in it.
It is the same brand as his GitHub profile (palette "Nile & Saffron", Space Grotesk, the agent graph, the tri-colour
stripe), elevated to a product-grade site.

### What each visitor should feel

| Visitor | Time | Must leave with | Delivered by |
|---|---|---|---|
| Recruiter / talent partner | 10–30 s | "AI Team Lead at Globant, 7 years, LangGraph / RAG / vLLM, AWS ML certified, bilingual, easy to reach." | person chip, H1, metric strip, logo row, CV link, sticky "Ask my AI", contact |
| Hiring manager / CTO | 2–5 min | "He has run LLMs in production at real companies, thinks in systems, explains trade-offs, and has taste." | hero graph, case-study diagrams, trace, skills-with-receipts, open-source tools, the assistant itself |
| Arabic-speaking stakeholder | any | "The Arabic site is first-class, not a translation." | `/ar/` mirror with native copy, Arabic type tuned separately, RTL-correct components |
| Everyone | first paint | "Fast, calm, careful." | text-first LCP, no layout shift, motion that means something, AA contrast in both themes |

### How each home section earns attention

| # | Section | Job | Hook | Proof | Exit |
|---|---|---|---|---|---|
| 0 | Hero | Who, what, why believe | H1 = person chip (name · role) + the content tagline "I build multi-agent LLM systems that hold up in **production**, in Arabic and English." (one heading, so search and heading navigation get his name and role; the chip and the tagline keep their looks) + the live graph | person chip with photo, the 7-year intro, the assistant is *right there* (ask bar), "Open to new roles · 14:32 in Cairo" | ask bar, "See the work", CV |
| 0b | Metric strip + logo row | Scan in 5 seconds | five hard facts in display numerals (7 · 14 · 6 · Millions · A100) | every fact is in `content/profile.ts` metrics; employer marks | (scroll) |
| 01 | What I build | Map his skills to a stack | "from the agent graph down to the GPU" | bento with a real diagram in the feature card | Front-end card → logic-controls.com case study |
| 02 | Selected work | Depth | 4 case studies: the feature card, then three equal cards; the brief ones (details not public) in "More work" | architecture thumbnails, factual bullets, stack chips | case-study pages |
| 03 | Experience (trace) | Chronology + overlap | the trace metaphor itself | dates, logos, bullets per role (bold receipts), study lanes | open a span |
| 04 | About | Who he is, and availability | orbit portrait + bio | based in, time zone, languages, **open to** (roles, work arrangements) | (contact) |
| 05 | Open source | Verifiable code | "small tools that test LLMs the way I test them at work" | GitHub repos with honest descriptions | GitHub |
| 06 | AI assistant | The proof that he builds AI products | "Ask about my work." + a preview of the real widget | how-it-works flow (widget → Worker → Gemini → streamed answer), JD-fit tip | opens the chat |
| 07 | Skills | Credibility of the long list | "Skills, with receipts." | dot matrix by role (a per-skill list on phones) | (contact) |
| 08 | Education & certs | Formal credentials | AWS ML Specialty featured | degrees with logos | (contact) |
| 09 | Contact | Convert | "Let's talk." | WhatsApp / email (Gmail as "or …" in the email card) / LinkedIn / GitHub, form | message sent / chat |

About sits right after the career so a recruiter reaches availability and relocation early (the hero meta line
already says "Open to new roles · remote, in Cairo, or relocating to the Gulf or Europe"). The front-end showcase
(logic-controls.com in device frames) is figure 1 of its case study, not a home section; `/#craft` lands on that
case study's card. Bands alternate: What (P) · Work (B) · Experience (P) · About (B) · Open source (P) · Assistant
(B) · Skills (P) · Education (B) · Contact (P).

Testimonials: **omitted** (no real testimonials exist). The component is specified in section 12.20 so it can be added
the day real, attributable quotes exist; never placeholder or paraphrased quotes.

---

## 2. Principles

1. **Show the system.** Prefer a diagram, a trace, a live graph or the working assistant over an adjective.
2. **Receipts, not claims.** Every number and claim maps to `_inputs/` (CV, LinkedIn, GitHub). If a slot would need an
   invented number, the slot disappears. (See section 17.)
3. **Motion means data flow.** Things move only to show a request travelling, a panel opening or state changing.
   Nothing loops for decoration except the hero graph, which has a pause button and stops offscreen.
4. **Two languages, one design.** Arabic is designed, not mirrored-and-hoped: its own sizes, line-heights and copy.
5. **Fast is a feature.** Text is the LCP, fonts are subset and preloaded, JS is islands only.
6. **Warm precision.** Paper and ink, hairlines, mono annotations, one accent. Colour encodes category quietly.

---

## 3. Colour

Source of truth: `design/scripts/build-tokens.mjs` → generates `tokens.css` (plain CSS), `tokens.tailwind.css`
(Tailwind 4 `@theme static` + dark overrides) and `tokens.json`. Contrast is verified by
`node design/scripts/check-contrast.mjs` (220 pairs, both themes, exits non-zero on any failure; currently 0 failures).

### 3.1 Semantic tokens

| Token (`--color-*`) | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FBF8F3` paper | `#0C151D` deep ink | page |
| `bg-subtle` | `#F4EFE6` | `#0F1A23` | alternate section bands (02, 04, 06, 08) |
| `surface` | `#FFFEFB` | `#111D27` | cards, panels, chat |
| `surface-2` | `#F6F1E8` | `#162430` | insets, neutral chips, open trace row |
| `surface-inverse` | `#14212B` | `#ECF1F4` | primary button, user chat bubble, tooltips |
| `line` | `#E7E0D3` | `#213140` | hairlines, card borders (decorative) |
| `line-strong` | `#D6CCBA` | `#2C3E4D` | hover borders, rules that must be seen |
| `line-input` | `#8E8676` | `#5E7384` | form-control borders (≥ 3:1, WCAG 1.4.11) |
| `ink` | `#14212B` | `#ECF1F4` | primary text |
| `ink-2` | `#33414C` | `#C9D3DA` | body copy on cards, secondary text |
| `muted` | `#5A6670` | `#97A5B1` | meta, captions, placeholders (≥ 4.5:1 everywhere) |
| `subtle` | `#727C85` | `#7D8D9A` | decorative / disabled only (never body text in light) |
| `on-inverse` | `#FBF8F3` | `#0C151D` | text on `surface-inverse` |
| `accent` | `#0A766C` | `#3DD6C3` | links, active states, focus, emphasis word in H1 |
| `accent-strong` | `#075E56` | `#6FE3D4` | hover/pressed accent text |
| `accent-solid` / `-hover` | `#0A766C` / `#086A61` | `#3DD6C3` / `#5FDECD` | accent button ("Ask my AI") |
| `on-accent` | `#FFFFFF` | `#06201D` | label on accent button |
| `accent-fill` | `#16A394` | `#2CC2B0` | decorative strokes, stripe, graph hub |
| `accent-tint` / `-tint-line` | `#E3F1EE` / `#B9DFD8` | `#10302E` / `#1E4B47` | chips, hover tint |
| `focus` / `focus-halo` | `#0A766C` / teal 22% | `#3DD6C3` / teal 28% | 2 px focus ring + input halo |
| `selection` | `#CDEAE4` | `#1E4B47` | `::selection` |
| `scrim` | ink 46% | near-black 66% | mobile chat sheet backdrop |
| `graph-edge` / `graph-grid` / `graph-node` | `#D3C8B5` / `#DDD3C2` / `#FFFEFB` | `#2B3C4A` / `#1F2E3A` / `#0F1A23` | hero graph, diagrams, dot grid |
| `glow-1/2/3` | teal 13% / saffron 12% / coral 6% | teal 16% / saffron 10% / coral 7% | hero radial glows (never on text) |

### 3.2 Category colours (encode meaning, quietly)

Each has four tokens: `--color-<c>` (text-safe), `-fill` (decorative stroke/fill), `-tint` (chip bg), `-tint-line`.

| Category | Colour | Light text / fill | Dark text / fill | Means |
|---|---|---|---|---|
| teal | primary | `#0A766C` / `#16A394` | `#3DD6C3` / `#2CC2B0` | orchestration, agents, current role (Globant) |
| saffron | accent 1 | `#9C5800` / `#E9A23B` | `#F4B95A` / `#EFAE48` | retrieval, data; honours (award badge) |
| coral | accent 2 | `#B3421C` / `#E4683F` | `#FF916E` / `#F57A54` | generation, LLM output; errors (`danger`) |
| sky | category | `#2B65A6` / `#4A8FD6` | `#7DB6F0` / `#5EA2E6` | evaluation, observability, quality |
| sage | category | `#55702A` / `#89A447` | `#B2CC72` / `#9DB95A` | guard, safety; bilingual; teaching |
| slate | category | `#4A6072` / `#7F99AE` | `#AFC3D3` / `#8AA5BB` | serving, infra, tools/MCP, storage |

Rules: one accent per component; category colour appears as a 3 px top bar, an icon tile, a chip, a node ring or a
trace bar, never as a large fill. Never set text in a `-fill` colour. No gradients on text. No purple, no neon.
Glows ≤ 16% opacity and only behind the hero graph and OG images.

### 3.3 Verified pairs (excerpt; full list: `node design/scripts/check-contrast.mjs`)

| Pair (fg on bg) | Light | Dark | Min |
|---|---|---|---|
| `ink` on `bg` | #14212B / #FBF8F3 = **15.46** | #ECF1F4 / #0C151D = **16.18** | 4.5 |
| `ink-2` on `bg` | #33414C / #FBF8F3 = **9.91** | #C9D3DA / #0C151D = **12.11** | 4.5 |
| `muted` on `bg` | #5A6670 / #FBF8F3 = **5.55** | #97A5B1 / #0C151D = **7.31** | 4.5 |
| `muted` on `surface-2` | #5A6670 / #F6F1E8 = **5.23** | #97A5B1 / #162430 = **6.27** | 4.5 |
| `accent` on `bg` | #0A766C / #FBF8F3 = **5.19** | #3DD6C3 / #0C151D = **10.17** | 4.5 |
| `accent` on `surface` | #0A766C / #FFFEFB = **5.45** | #3DD6C3 / #111D27 = **9.44** | 4.5 |
| `saffron` on `bg` | #9C5800 / #FBF8F3 = **5.20** | #F4B95A / #0C151D = **10.46** | 4.5 |
| `coral` on `bg` | #B3421C / #FBF8F3 = **5.34** | #FF916E / #0C151D = **8.35** | 4.5 |
| `sky` on `bg` | #2B65A6 / #FBF8F3 = **5.64** | #7DB6F0 / #0C151D = **8.61** | 4.5 |
| `sage` on `bg` | #55702A / #FBF8F3 = **5.30** | #B2CC72 / #0C151D = **10.32** | 4.5 |
| `slate` on `bg` | #4A6072 / #FBF8F3 = **6.18** | #AFC3D3 / #0C151D = **10.14** | 4.5 |
| `teal` on `teal-tint` | #0A766C / #E3F1EE = **4.73** | #3DD6C3 / #10302E = **7.82** | 4.5 |
| `saffron` on `saffron-tint` | #9C5800 / #FAEFDC = **4.84** | #F4B95A / #2E2614 = **8.50** | 4.5 |
| `coral` on `coral-tint` | #B3421C / #FAE7DF = **4.73** | #FF916E / #33201A = **6.99** | 4.5 |
| `sky` on `sky-tint` | #2B65A6 / #E4EDF7 = **5.05** | #7DB6F0 / #15283A = **7.03** | 4.5 |
| `sage` on `sage-tint` | #55702A / #ECF1DF = **4.87** | #B2CC72 / #1F2A17 = **8.40** | 4.5 |
| `slate` on `slate-tint` | #4A6072 / #E8EDF1 = **5.55** | #AFC3D3 / #1C2A35 = **8.08** | 4.5 |
| `on-inverse` on `surface-inverse` | #FBF8F3 / #14212B = **15.46** | #0C151D / #ECF1F4 = **16.18** | 4.5 |
| `on-accent` on `accent-solid` | #FFFFFF / #0A766C = **5.50** | #06201D / #3DD6C3 = **9.42** | 4.5 |
| `danger` on `danger-tint` | #B3421C / #FAE7DF = **4.73** | #FF916E / #33201A = **6.99** | 4.5 |
| `line-input` on `surface` | #8E8676 / #FFFEFB = **3.58** | #5E7384 / #111D27 = **3.47** | 3 (UI) |
| `focus` on `bg` | #0A766C / #FBF8F3 = **5.19** | #3DD6C3 / #0C151D = **10.17** | 3 (UI) |
| `subtle` on `bg` | #727C85 / #FBF8F3 = **4.02** | #7D8D9A / #0C151D = **5.39** | 3 (large/UI only) |

### 3.4 Theme mechanics

- Default follows `prefers-color-scheme`. The desktop icon button **flips what you see** on every click (light ↔ dark);
  landing on the OS's own theme returns to "system" (so a light-OS visitor gets system → dark → system), and no click
  is ever a no-op. The mobile menu has a three-segment control (Auto / Light / Dark) that can pin either. Choice
  persists in `localStorage["mh-theme"]`; "system" removes the override.
- An `is:inline` script in `<head>` sets `html[data-theme]` before first paint; without JS the
  `@media (prefers-color-scheme: dark)` block in `tokens.css` applies the same values (the checker fails the build if
  the two dark blocks ever drift).
- `<meta name="theme-color">` twice, with `media="(prefers-color-scheme: light|dark)"` (#FBF8F3 / #0C151D).
- Dark mode is not inverted light mode: surfaces step *up* in lightness for elevation, shadows deepen, glows rise to
  16%, and a 1 px top inner highlight (`--inset-highlight`) gives cards their edge.

---

## 4. Typography

### 4.1 Families and roles

| Role | Family | Why |
|---|---|---|
| Display (H1–H3, metric numerals, names) | **Space Grotesk** variable (300–700; we use 500–600) | Brand continuity with the GitHub banner; engineered grotesque with character ("a", "G", "t") without being a gimmick. Alternatives considered: Geist (too Vercel), Satoshi/General Sans (license + less distinctive). |
| Text (body, UI) | **Inter** variable (opsz + wght) with `cv05` (tailed l, so "LLM" and "llm" never confuse) | Best-in-class UI text, huge language coverage, optical sizes. |
| Mono (labels, code, dates, identifiers) | **JetBrains Mono** variable, ASCII subset | The "engineering annotation" voice: eyebrows, trace dates, node names, chips. |
| Arabic (all roles) | **IBM Plex Sans Arabic** 400 / 600 / 700 (500 optional) | Designed to sit with grotesque Latins; clear naskh-influenced forms at small sizes; strong 700 for display. Latin inside Arabic text falls through to Inter / Space Grotesk (the Arabic files are subset to Arabic code points only). |

### 4.2 Scale (fluid between 360 px and 1440 px viewports; tokens `--text-*`)

| Token | Min → max | Line-height | Tracking | Use |
|---|---|---|---|---|
| `2xs` | 11 → 12 px | 1.45 | 0 | mono chips, trace dates, captions |
| `xs` | 12 → 13 | 1.5 | 0 | eyebrows (mono uppercase +0.08em), meta |
| `sm` | 14 → 15 | `--lh-ui` 1.45 | 0 | card body, nav, buttons |
| `base` | 16 → 17 | `--lh-body` 1.65 | 0 | body copy |
| `md` | 18 → 20 | `--lh-lead` 1.55 | −0.005em | ledes, hero sub-copy |
| `lg` | 20 → 24 | `--lh-snug` 1.25 | −0.012em | card titles |
| `xl` | 24 → 30 | 1.25 | −0.018em | case-card titles, prose H2 |
| `2xl` | 30 → 44 | `--lh-tight` 1.08 | −0.025em | metric numerals, feature titles |
| `3xl` | 32 → 52 | 1.08 | −0.03em | section titles (H2) |
| `display` | 40 → 70 | `--lh-display` 1.02 | −0.035em | hero H1 only |
| `mega` | 64 → 128 | 0.95 | −0.045em | 404 numeral |

Exact `clamp()` values live in `tokens.css` (`--text-*`, with Tailwind companion vars `--text-*--line-height` and
`--text-*--letter-spacing`). Headings use `text-wrap: balance`; paragraphs `text-wrap: pretty` (Firefox ignores it;
harmless). Weights: display 600, body 400, UI 500–600. Never bold Inter beyond 600.

### 4.3 Arabic (RTL) rules

- `:lang(ar)` switches `--font-sans` / `--font-display` to IBM Plex Sans Arabic first (Latin fallbacks after), and sets:
  `--script-scale: 1.0625` (Arabic text sizes +6.25%: Plex Arabic's tooth height reads small next to Inter),
  `--script-scale-display: 0.92` (Arabic headlines are wider and taller; slightly smaller keeps the same visual
  weight), line-heights `display 1.3`, `tight 1.3`, `snug 1.45`, `ui 1.6`, `lead 1.8`, `body 1.85`,
  `--tracking-scale: 0` (all negative tracking off) and `--tracking-label: 0`.
- Never letter-space, never uppercase, never italicise Arabic. Eyebrows switch from mono-uppercase to Plex Arabic 600
  at `--text-sm`. Headings use weight 700.
- Latin terms inside Arabic copy (LangGraph, vLLM, A100, Globant) stay Latin; wrap code-like runs, URLs, emails and
  phone numbers in `dir="ltr"` / `unicode-bidi: isolate` (`.latin` utility) so punctuation doesn't jump.
- Numeric ranges ("2023–2024", "2015 – 2020") must be isolated as LTR (`<bdi dir="ltr">` or a container with
  `direction: ltr; unicode-bidi: isolate`); otherwise the en dash lets the RTL paragraph reorder them to "2024–2023".
  Ranges with Arabic month names ("أبريل 2023 – ديسمبر 2024") are fine as they are.
- Digits: Western (0–9) everywhere, including Arabic UI (Gulf and Egyptian tech norm; keeps metrics, dates and code
  consistent). Use the Arabic comma "،" and Arabic question mark "؟" in Arabic sentences.
- Month names: Arabic Gregorian names (يناير … ديسمبر), "الآن" for present.
- Stack lines (mono, comma/dot separated Latin lists) are set `dir="ltr"` and aligned to the inline end.

### 4.4 Self-hosting plan

Files (already subset, in `design/assets/fonts/`; copy to `src/assets/fonts/`):

| File | Family / axis | Subset | Size | Loaded on |
|---|---|---|---|---|
| `space-grotesk-latin-wght.woff2` | Space Grotesk Variable, wght 300–700 | Latin | 22 KB | all pages; **preloaded on EN** (H1 = LCP) |
| `inter-latin-wght.woff2` | Inter Variable, wght 100–900 | Latin | 48 KB | all pages (swap) |
| `jetbrains-mono-ascii-wght.woff2` | JetBrains Mono Variable | ASCII + · – — ← → ↗ ✓ ≥ ≤ | 31 KB | all pages (swap) |
| `ibm-plex-sans-arabic-{400,600,700}.woff2` | IBM Plex Sans Arabic | U+0600–06FF, presentation forms, ZWNJ/ZWJ/RLM/LRM | 34–36 KB each | AR pages; **700 preloaded on AR** |
| `ibm-plex-sans-arabic-500.woff2` | same | same | 36 KB | optional; drop if unused |

- Astro 6+ Fonts API is stable (top-level `fonts`, `fontProviders.local()`, `<Font cssVariable preload>`), and it
  generates metric-matched fallbacks automatically when the last fallback is a generic family. Use it; map its CSS
  variables onto our tokens with `@theme inline { --font-display: var(--font-face-display); ... }`. Exact config in
  `HANDOFF.md`.
- `font-display: swap` + optimized fallbacks = no CLS on Latin. For Arabic, fallback metrics come from OS Arabic fonts
  and cannot be matched exactly: preload the 700 weight (H1) on AR pages and keep Arabic H1 line-height fixed (1.3) so
  the box height is stable on swap.
- EN pages show "العربية" in the language switch: to avoid pulling a 36 KB Arabic weight for one word, ship a
  micro-subset (`ibm-plex-sans-arabic-600` limited to the glyphs of "العربية" and "ع", ~2 KB) registered under the same
  family with a narrower `unicode-range`, or accept the swap (it is below the fold of importance). Recommended:
  micro-subset via the same pyftsubset pipeline.
- Budget: EN first view ≈ 22 KB font on the critical path; total fonts EN ≈ 101 KB, AR ≈ 206 KB (only Arabic weights
  actually used are fetched, thanks to `unicode-range`).

---

## 5. Layout, grid and spacing

- **Breakpoints** (`--breakpoint-*`): sm 40rem (640), md 48rem (768), lg 64rem (1024), xl 80rem (1280),
  2xl 96rem (1536), 3xl 120rem (1920).
- **Container**: content max `--container-max` 78rem (1248 px) + side padding `--space-gutter`
  (clamp 20 → 48 px). Wide art (hero graph, showcase) may bleed half a gutter. Prose measure `--container-prose`
  40rem (≈ 68 characters of Inter 17 px; Arabic ≈ 60).
- **Grid**: 4 columns < 640, 8 columns 640–1023, 12 columns ≥ 1024; gap `--grid-gap` (16 → 24 px). Common splits:
  hero 7 / 5, section header 7 / 5 (title / lede bottom-aligned), feature case card 5 / 7, contact 5 / 6.
- **Vertical rhythm**: `--space-section` 72 → 120 px between sections; `--space-block` 40 → 80 px from a section header
  to its content; `--space-stack` 24 → 40 px between groups. Alternate sections sit on `bg-subtle` bands with hairline
  borders, which gives the long page a calm cadence without dividers.
- **320 → 2560**: at 320 the gutter is 20 px, buttons wrap to full width in the hero, the nav keeps the monogram +
  "Ask AI" + menu. From 1920 px the root font-size steps to 106.25% and from 2400 px to 112.5%, so the whole system
  (rem-based) scales up proportionally instead of floating in empty space; the container grows with it
  (1248 → 1404 px at 2560).
- **Sticky nav** is 64 px; `scroll-padding-block-start: 5.5rem` keeps anchored headings and focused elements clear of
  it (WCAG 2.4.11).

---

## 6. Shape, borders, elevation

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 6 px | chips, kbd, tags |
| `--radius-sm` | 8 px | small buttons, nav items |
| `--radius-md` | 12 px | buttons, inputs, channel rows, bubbles |
| `--radius-lg` | 16 px | cards |
| `--radius-xl` | 24 px | chat panel, large panels, diagram frames |
| `--radius-2xl` | 32 px | reserved for hero art frames |
| `--radius-full` | pill | person chip, suggestion chips, badges, launcher |

Borders: 1 px `--color-line` on every card; `--color-line-strong` on hover; inputs `--color-line-input`.
Category cards get a 3 px top bar in their `-fill` colour (work + repo cards).

Elevation (warm, ink-tinted in light; deep black in dark):
`--shadow-xs` resting buttons · `--shadow-sm` cards at rest · `--shadow-md` hover / ask bar · `--shadow-lg` menus,
mobile sheet · `--shadow-xl` chat panel, device frames. Cards combine shadow + `--inset-highlight`.

---

## 7. Motion

Motion is an enhancement: every component is complete and usable with no motion at all.

### 7.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 90 ms | press feedback (`translateY(1px)`) |
| `--duration-fast` | 160 ms | hover, colour, focus, border |
| `--duration-base` | 240 ms | tooltip / chip / menu enter, arrow nudge |
| `--duration-slow` | 380 ms | chat panel open, accordion |
| `--duration-slower` | 640 ms | section reveal, graph arrival halo |
| `--duration-graph-loop` | 9 s | hero graph cycle |
| `--ease-out` | cubic-bezier(.16, 1, .3, 1) | entrances, reveals |
| `--ease-in` | cubic-bezier(.55, 0, 1, .45) | exits |
| `--ease-in-out` | cubic-bezier(.65, 0, .35, 1) | moves between two states (graph pulses) |
| `--ease-standard` | cubic-bezier(.2, 0, 0, 1) | hovers, colour |
| `--ease-spring` | `linear(...)` gentle spring, ~7% overshoot | chat panel open only |

### 7.2 Inventory (every animation on the site)

| Element | Animation | Timing | Trigger | Reduced motion |
|---|---|---|---|---|
| Hero graph | pulses travel query → guard → orchestrator → retrieve → rerank → generate → evaluate → answer (every 2nd loop detours via tools · mcp); arrival halos; outer hub ring rotates | 9 s loop, hops eased in-out, halos 640 ms | starts on idle after load; pauses offscreen / tab hidden; pause button | static snapshot frame, no rotation |
| Hero graph parallax | satellites ±6 px, hub ±2 px | rAF + lerp | pointer move (fine pointers) | off |
| Ask bar | typed example questions; caret blink | 45 ms/char, 1.1 s caret | auto | static placeholder, no caret blink |
| Live dot (hero caption) | single ping ring | 2.4 s | auto | static dot |
| Section reveal | opacity 0→1 + translateY 14→0, stagger 70 ms | 640 ms `--ease-out` | IntersectionObserver, once | none (content visible) |
| Card hover | lift −2 px + shadow-md | 240 ms | hover | colour/border only |
| Button / arrow | arrow nudges 3 px in reading direction | 240 ms | hover | none |
| Trace span | chevron rotates; row background | 240 ms | open/close | instant |
| Mobile menu | fade + 6 px drop | 240 ms | open | instant |
| Chat launcher (avatar) | pop-in (scale .6→1, y 8→0), then a wave (hand ±17° from the wrist, forearm ±3° from the elbow, head ±2.5°) and a 2 px float; a blink | 550 ms pop, 1.7 s wave, float 2.4 s period, blink 180 ms | first appearance (after load, on idle; on phones once the hero has scrolled past), then a wave + blink 13 s and 26 s later, three in all; afterwards only hover / keyboard focus | still avatar |
| Chat greeting bubble | two balls pop one after the other (scale 0→1.2→1), the comic bubble pops (scale .35→1.05→1, tilted 2.2°), words fade in one by one while the mouth talks (scaleY .42–1.1) | balls 350 ms (+120 ms), bubble 450 ms (+240 ms), words 110 ms apart | 2.6 s after the launcher first appears, at most twice per session; hover / keyboard focus | still bubble, all words shown |
| Chat header avatar | mouth talks; two blinks | 360 ms loop while an answer streams in (the cursor shows); blinks 1.2 s and 4.2 s after the panel opens | streaming / open | still |
| Chat panel | grows from launcher: scale .96→1, y 8→0, opacity | 380 ms `--ease-spring` | open | opacity 120 ms |
| Chat thinking | three-node pulse (graph motif) | 1.2 s loop while waiting | streaming | static dots + "Thinking…" text |
| Chat caret | teal block caret blink | 1 s steps | streaming | solid caret |
| Theme switch | none (instant) | n/a | n/a | n/a |

Rules: animate only `transform` and `opacity` (and SVG `stroke-dashoffset`); no scroll-jacking; no parallax on scroll;
nothing flashes more than 3 times per second; the only auto-playing loop longer than 5 s (hero graph) has a visible
pause control (WCAG 2.2.2) and the choice persists. The chat avatar's automatic motion comes in three short bursts,
each over within 5 s, and then stops; it moves again only while hovered or focused. CSS motion lives inside
`@media (prefers-reduced-motion: no-preference)`; JS checks `matchMedia` and listens for changes.

---

## 8. Iconography

`design/assets/icons/` (individual SVGs + `sprite.svg`, preview `prototypes/icons.html`).

- Grammar: 24 × 24 grid, **1.75 px stroke**, round caps and joins, `stroke="currentColor"`, no fills except small
  "node" dots (r 1–1.6). Same family as the GitHub-profile icons.
- Sizes: 16 (inline, chips), 20 (nav, buttons), 24 (tiles, feature). Icon tiles: 44 px rounded 13 px, category tint
  background, tint-line border, icon in the category text colour.
- Brand glyphs (WhatsApp, GitHub, LinkedIn) are monoline re-draws for consistency; official marks only where a
  platform's brand rules require it.
- RTL: directional icons flip (`.icon--flip`: arrow-right/left, chevron-left/right, arrow-up-right ("external") becomes
  up-left, send). Never flip: check, close, play/pause, clocks, brand glyphs, the graph glyphs, arrow-down/up.
- Icons are decorative (`aria-hidden="true"`) unless they are the only content of a control, in which case the control
  carries `aria-label`.

---

## 9. Imagery

- **Portrait** (`design/assets/photo/`): plain square crop (avatar, person chip 32 px, chat header), 4:5 portrait,
  duotone light/dark (ink → paper with a hint of teal; used where the photo must sit quietly, e.g. OG images, CV), and
  the **orchestrator composition**: the photo in a circle with a thin teal ring and a dashed orbit carrying three
  category-coloured nodes (`orbit-ring.svg` layered over a circle-cropped `<img>`), used in Contact. The beige studio
  backdrop of the original harmonises with the paper palette; no background removal.
  Formats: AVIF + WebP at 96 / 192 / 320 / 480 / 640, JPEG fallback at one size per crop.
- **Company logos** (`design/assets/logos/`): `tiles/` keep each official logo in a 22%-radius tile on its native
  background with an inner hairline, so it reads in both themes (trace rows, education, certs). `mono/` are
  single-colour vector marks for the "Shipped at" row, tinted `--color-muted` (ink-2 on hover), each paired with its
  name in Space Grotesk so symbol-only marks (G›, AR, house) are still recognisable. Crests (Cairo, Tanta) use text
  monograms in mono contexts. **MTC uses a monogram** (the LinkedIn logo is a different college). `logos.json` has the
  optically normalised widths/heights for a 28 px row.
- **Showcase screenshots** (`design/assets/showcase/`): logic-controls.com desktop (EN, AR) and phone (EN, AR) and the
  HMI panel, AVIF + WebP at 390 / 780 / 960 / 1440 / 1920. Shown inside a neutral browser frame and a dark phone
  bezel. Never show or name the Logic Controls founder.
- **OG images** (`design/assets/brand/og/`): 1200 × 630 PNG rendered from SVG templates, deep-ink theme for feed
  contrast, EN and AR, home and per case study (template + render script in `design/scripts/brand/`).
- **Chat avatar** (`design/assets/avatar/mh-avatar.svg`): Mohamed as a flat vector illustration, traced from the
  profile photo (rounder head, near-black buzz cut with the receding temples, light stubble, warm smile, navy blazer
  over an open white shirt, sky-blue pocket square), raising his right hand to wave. It sits on a **deep ink disc**
  (`#14212B`) with a soft teal inner glow and a `#2CC2B0` rim; the rim keeps the launcher's edge ≥ 3:1 on both themes
  (8.3:1 on the dark page; the disc itself is 15.5:1 on paper). The disc is CSS-driven (`--mh-av-disc`, `--mh-av-glow`,
  `--mh-av-glow-o`, `--mh-av-rim`), and `data-disc="teal"` is the brand-teal alternative (teal disc, `#0A766C` rim).
  Layers carry classes for the motion: `.av-head` (nods), `.av-eyes` (blink; centre y 45.25), `.av-jaw` (talks; hinge
  y 65.4), `.av-arm` > `.av-wave` (elbow) > `.av-hand` (wrist at 0,0). Skin `#E6B593`, stubble a cool near-black at
  11–26 %, hair `#1D1A17`. ≈ 2.6 KB gzip.
- No stock photography, no AI-generated imagery, no 3D blobs.

---

## 10. Signature visuals

### 10.1 Hero agent graph (`design/assets/hero-graph/`)
SVG rendered at build time (visible with JS off, zero CLS via fixed viewBox 600 × 520 and `aspect-ratio`), enhanced by
a tiny dependency-free module. Nodes: `orchestrator` (teal, centre), `guard` (sage), `retrieve` and `rerank`
(saffron), `generate` (coral), `evaluate` (sky), `tools · mcp` (slate), plus `query` and `answer` ports. Mono labels,
dotted spokes, solid curved pipeline edges, comet pulses. The request route keeps its category colours in every state
(teal query → guard, saffron retrieve → rerank, coral generate, sky evaluate → answer, at 65% opacity); while the flow
runs, the pulse lights the hop it travels to full strength and the edge settles back after it, so the animated graph
is never a pale wireframe. Interaction: hover/focus highlights a node's edges and dims
the rest; Enter/Space/click opens a short toggletip naming where he has used that step, with the source-backed
example (EN and AR copy in `graph-data.ts`; never a step claimed for every production system); the graph is one tab stop with arrow-key navigation; a pause button sits in its corner. RTL
mirrors the flow (query enters from the right). Budget ≤ 15 KB gzip JS + CSS (see `HANDOFF.md` for measured sizes).

### 10.2 Tri-colour stripe
Three rounded bars 54 / 30 / 16 × 5 px, 6 px apart, teal / saffron / coral `-fill`. Used under the footer brand, on OG
images, on the CV header. Never as a divider between sections.

### 10.3 Dot grid and glows
22 px dot grid (r 1.15, `--color-graph-grid`) masked by a radial fade behind the hero graph (18 px variant inside
diagram frames and feature art). Radial glows teal (behind the graph), saffron (top end), coral (bottom start).
In RTL the composition mirrors.

### 10.4 Architecture diagrams (`design/assets/diagrams/`)
A consistent grammar so every case study looks like it came from one design doc (full spec at the top of
`assets/diagrams/diagram.css`, preview `prototypes/diagrams.html`): 8 px grid; node boxes radius 10, 1.5 px strokes,
Inter 600 title + mono sublabel, a small glyph at the inline start; node kinds by category colour (agent / orchestrator
teal, retrieval & data saffron, model coral, evaluation sky, guard sage, infra / store / tools slate, external dashed);
dashed group containers with a mono tab label; orthogonal edges with 8 px rounded corners, open chevron arrowheads,
solid = synchronous, dashed = async / batch; numbered saffron callouts that the case-study text references. Themed via
CSS variables when inlined; standalone files carry a `prefers-color-scheme` fallback. Wide variant (~1120 px),
compact vertical variant (≤ 360 px) for phones, 16:10 thumbnail for cards. Diagrams stay **LTR in Arabic pages**
(technical flow notation), with Arabic captions and callout text.

---

## 11. Bilingual and RTL

- Routes: EN at `/`, AR at `/ar/` (Astro i18n, `prefixDefaultLocale: false`). `<html lang dir>` per locale;
  `hreflang` alternates both ways plus `x-default` → EN.
- Everything is built with logical properties (`margin-inline-start`, `inset-inline-end`, `padding-inline`,
  `text-align: start`, Tailwind `ms-/me-/ps-/pe-/inset-s-/inset-e-/text-start`), so layouts mirror without
  per-locale CSS. The few explicit RTL rules: icon flipping, hero glow/mask positions, the trace's "live" bar gradient,
  and the hero graph geometry (mirrored by its renderer).
- Timelines run right-to-left in Arabic (2020 at the right edge), matching reading order.
- Language switch: shows the *other* language in its own script ("العربية" on EN pages, "English" on AR pages),
  `lang` and `hreflang` set, and links to the equivalent page (not the home).
- The chat assistant answers in the language of the question; its UI chrome follows the page locale.
- Content parity: every EN section has an AR counterpart written natively (see `prototypes/index-ar.html`); technical
  names stay Latin.

---

## 12. Components

Each entry: anatomy · states · behaviour · a11y · RTL. Class names refer to `prototypes/proto.css`; the Astro
component mapping is in `HANDOFF.md`.

### 12.1 Nav (`.nav`)
Sticky, 64 px, `bg` at 82% with `backdrop-filter: saturate(1.5) blur(14px)`; hairline appears after 8 px of scroll.
Start: monogram (32 px) + "Mohamed Hatem" (Space Grotesk 600, 17 px) + role ("AI Team Lead", muted, separated by a
hairline; hidden < 768). Centre-end: links Work · Experience · Open source · CV · Contact (≥ 1024). End: language switch
(globe + other-language label), theme toggle (icon of the current mode; label "Theme: system/light/dark"), **Ask my AI**
(accent button, 36 px; "Ask AI" < 768), menu button (< 1024). Skip link is the first focusable element.
`aria-current="page"` on the active link (section scroll-spy optional, `aria-current="true"`).

### 12.2 Mobile menu (`.menu-sheet`)
Fixed sheet under the nav (< 1024): large Space Grotesk links with hairlines and arrows, then the language switch and
a three-way segmented theme control (Auto / Light / Dark, `aria-pressed`). Closes on Escape, outside click or link
click; focus returns to the menu button; `aria-expanded` on the button.

### 12.3 Buttons (`.btn`)
Heights 36 (sm) / 44 (md, default) / 52 (lg). Variants: **primary** (ink, `surface-inverse`), **accent** (teal; reserved
for "Ask my AI" and the chat send button, so the accent keeps meaning "talk to the AI"), **secondary** (surface +
line-strong), **ghost**. Icon 18 px, gap 8. Arrow icons nudge 3 px on hover. Press: 1 px down. Disabled: 45% opacity,
`aria-disabled`. Focus: 2 px `--color-focus` ring, 2 px offset.

### 12.4 Chips, badges, kbd
`.chip` mono 11–12 px, radius 6, neutral by default (`surface-2`), category variants for semantic tags only.
`.badge` (pill, saffron) for honours ("Best Engineer of the Year"). `.suggest` pill chips under the ask bar (sans 12–13 px).
`.kbd` for the "/" shortcut hint.

### 12.5 Hero (`.hero`)
Grid 7 / 5 (≥ 1024), stacked below with the graph after the copy. Copy column: **person chip** (photo 32 px +
name + role; name hidden < 480 where the nav shows it), **H1** = `basics.tagline` (display, `em` = "production",
4 lines at 1440; `max-width: 15.5ch`, which gives "I build multi-agent / LLM systems that / hold up in production, / in Arabic and English." from 768 to 2560; keep "multi-agent" unbroken and "hold&nbsp;up", "in&nbsp;Arabic" together),
**lede** = `basics.intro` (md, ink-2, ≤ 35rem), **ask bar** (a `<button>` that looks like an input: ask icon, typed
example questions including one in the other language, "/" kbd, accent go button; opens the chat with the composer
focused; keyboard shortcut "/" anywhere outside inputs), **actions** (secondary "See the work", ghost "CV"), **meta
line** (mono 2xs: sage dot + "Open to new roles · remote, in Cairo, or relocating to the Gulf or Europe", a link to
the About facts, then clock icon + live Cairo time). Suggestion chips live in the AI
assistant section and the chat welcome, not in the hero (the hero must fit 1440 × 900). Art column: hero graph +
mono caption with a live dot. Background: dot grid + glows (section 10.3). Below: metric strip and logo row, inside the
first viewport on 1440 × 900 (the strip's numerals peek above the fold as a scroll cue).

### 12.6 Metric strip (`.metrics`)
`<dl>` of five facts: value (Space Grotesk 600, `2xl`, tabular, optional small unit) over a label (sm, muted, ≤ 18ch).
Hairline top/bottom, vertical dividers; 2 columns on phones (last item spans both). Facts (from `profile.metrics`,
featured first): 7 years in data and AI, now leading an AI team · 14 agents in one LangGraph assistant · 6 agents in a bilingual production chatbot ·
Millions of stock assets made searchable · A100 GPUs serving Qwen through vLLM. No count-up animation (numbers are
content, not effects).

### 12.7 Logo row (`.logos`)
Mono label "Shipped at" + mono marks with names (Globant, Wakeb Data, ArabsStock, Empoweromics, Tabaqat (wordmark),
MDP), `--color-muted`, ink-2 on hover. Static (no marquee: nothing auto-moves, nothing to pause). Wraps on small
screens. Logos are not links (avoid sending recruiters away); names are real text for screen readers.

### 12.8 Section header (`.sec-head`)
Index number (mono, accent) + mono label on a hairline that runs to the container edge; H2 (`3xl`, ≤ 22ch) and an
optional lede (md, ink-2) bottom-aligned in a 7 / 5 grid. Optional action link at the end.

### 12.9 Capability cards (`.bento`, `.cap`)
3-column bento (≥ 1024): one feature card spanning 2 × 2 with a diagram thumbnail on a dot-grid inset, five standard
cards: icon tile, title (`lg`), two-line body (sm), mono stack line (first item emphasised). The "Front end, too" card
links to the logic-controls.com case study.

### 12.10 Case-study cards (`.work`)
Card with a 3 px category bar, a 16:10 media area (diagram thumbnail on an 18 px dot grid fading down), eyebrow
in one pattern everywhere, "COMPANY / YEARS" ("COMPANY / ROLE / YEARS" on the feature card; work dated only by a role
shared with other case studies reads "WAKEB DATA / DURING 2024–2026"), title (`xl`; `2xl` on the feature; hyphenated
compounds such as "self-hosted" never break at their hyphen), summary, optional 3 factual bullets with ring markers,
stack chips, "Read the case study →". The whole card is one link (stretched title anchor; inner interactive elements
sit above it). Feature card: 5 / 7 split with the media on the end side. Grid: feature full width, then 3 equal
columns (2 on tablets, 1 on phones); cards in a row share their tracks (CSS subgrid), so eyebrows, titles, summaries
and the "Read" cue line up. "More work" lists the brief case studies (implementation details not public) as three
compact text cards with "Read the brief →"; they never get flagship weight.

### 12.11 Case-study detail template
See `prototypes/case-study.html` / `case-study-ar.html`: breadcrumb, eyebrow, H1, summary, meta grid (role, company,
period, location, stack), framed architecture figure with numbered callouts, sticky table of contents with
scroll-spy (desktop) / collapsible "On this page" (mobile), reading-progress hairline, long-form prose (40rem measure),
key-facts strip (2–4 sourced facts with an optional small unit, four columns from 64rem whatever the count, omitted
below two), "decision" callouts, stack, "My role", next-case card, CTA band (ask the AI about this project with a
prefilled question; contact). The numbered notes under a figure start with a bold term ("**Orchestrator.** LangGraph
routes each request…", `term` in diagrams.json). Diagrams switch to the compact vertical variant < 640 px.
**Brief case studies** (implementation details not public) are compact and say so: a "Brief" tag in the eyebrow, no
key-facts strip, then "The problem", "What I did" and "Outcome" beside a note card (why the page is short, where the
facts come from, ask my AI, all work); the component view only when it has more than three parts.

### 12.12 Experience trace (`.trace`)
A card with a header row (mono "ROLE" + year axis 2020–2026) and one row per role: logo tile (36 px) + role + company
in a 19rem label column; a lane where the span bar sits at `--s` (start %) with width `--w` (duration %), coloured by
company category; date range in mono next to the bar (before it when the bar ends near the edge) from 64rem up;
below 64rem the dates move into the company line ("Wakeb Data · Sep 2024 – Apr 2026") and roles/companies may wrap
to two lines, only between units: each organisation name and the date range are unbreakable ("Umm Al-Qura
University", "Jan 2020 – Jan 2021"). Bullets carry one bold receipt each where the content names one (`Fact.strong`). Bar styles: solid =
full-time, tinted fill + outline = part-time / freelance, outline only = study; the current role's bar fades into a
dashed "now" line. Rows are `<details>/<summary>` (works without JS); open rows show an attribute list (mono keys:
type, stack, focus, honour) and bullets. Enhancement: single-open accordion, ArrowUp/ArrowDown/Home/End between rows.
Phones: the axis hides, each row shows a full-width mini lane under the role. Arabic: time runs right-to-left.

### 12.13 Repo cards (`.repo`)
Icon tile + "mhatem5351 /" (mono) + repo name (Space Grotesk 600) + external arrow; description; chips. Category bar on
top. Three primary + three small; footnote about coursework repos; "All repositories" button.

### 12.14 Device frames (logic-controls.com)
Figure 1 of the logic-controls.com case study (no longer a home section): a browser frame with URL pill (the page's
language) and a dark phone bezel overlapping the bottom end corner (the other language). The desktop captures are
1440 × 828, cut above the client site's angled section divider so the frame never ends in a slanted wedge. Images
are decorative (`alt=""`, `aria-hidden` on the frame); the caption and the case study state the facts.

### 12.14b AI assistant section (`.assist`)
Copy column: mono rule "06 AI assistant", H2 "Ask about my work.", lede (`i18n.assistant.lead`), a four-step
**how-it-works flow** (`.assist-flow`: numbered saffron counters, chevron joints that mirror in RTL: your question → Worker
→ Gemini → answer), the `howItWorks` sentence, accent "Start a conversation" + ghost "How it's built" (repo link).
Preview column: `.chat-preview`, a static, faithful miniature of the widget (header with avatar, title, subtitle,
greeting, "Try asking" with the first four suggestions, composer, JD tip) that is itself a button opening the real
widget. It never shows a fabricated answer.

### 12.15 Skills matrix (`.matrix`)
A real `<table>`: skills as row headers grouped under category rows (`colgroup` headers coloured by category), columns
= Globant, Wakeb, ArabsStock, Tabaqat, Empoweromics, Freelance & earlier, Open source. Filled category dot = used there
(with hidden "yes" text), small neutral dot = not used. Mapping comes only from the sources (see `HANDOFF.md` for the
data). Horizontal scroll inside the card below 46rem (`position: relative` on the scroller so hidden text can't
overflow the page), with the skill column first. **Phones (< 40rem):** the same data as a list, one entry per skill
followed by small group-coloured chips of the places it was used (no seven-column table to swipe). Legend + "Also:"
line for tools without receipts. The full toolbox below sits behind a "Show all N tools" disclosure on phones (with
JS; without it everything shows).

### 12.16 Education and certifications (`.edu`)
Two cards: Degrees (logo tile, title, institution, mono years) and Certifications & honours (AWS ML Specialty
featured on a saffron-tint gradient panel; then Best Engineer of the Year, DataCamp tracks, AWS Academy, Tableau).

### 12.17 Contact (`.contact`)
Left: mono rule, H2 "Let's talk.", orchestrator portrait + lede (with an inline "ask my AI" button), an
**about-facts** grid (`.facts`: Based in · Time zone with the live Cairo time · Open to (roles) · Languages), channel rows (WhatsApp, Email with copy button and the Gmail address as an "or …" line under it, LinkedIn, GitHub;
icon tile + label + value + arrow; copy announces "Copied" via the polite live region). Right: form card ("Or send a message"): Name, Email, Company (optional), What's it about? (select:
job opportunity / project or consulting / speaking or collaboration / something else), Message, honeypot, Turnstile slot (reserve **65 px** height, `size="flexible"`, or `"compact"` when the slot is narrower than 300 px so
a 320 px phone never scrolls sideways; `theme="auto"`, `language` = page locale),
hint, "Send message". Validation on submit and on blur after the first submit: inline error under the field
(`aria-invalid`, `aria-describedby`), an error summary at the top for screen readers, focus moves to the first
invalid field. Success state replaces the form with a confirmation card (and keeps the channels visible).

### 12.18 Footer
Monogram + name, one-line summary, tri-colour stripe; columns Site / Elsewhere / This site (source code link, other
language, theme); base row "© 2026 Mohamed Hatem" + "Built with Astro, served from Cloudflare. The assistant answers
from my CV and public profile."

### 12.19 Chat widget ("Ask my AI")
Full spec and every state in `prototypes/chat-widget.html` (+ `-ar`), styles `prototypes/chat.css`, behaviour
`prototypes/chat.js`; copy verbatim from `content/i18n` `chat.*` (launcher "Ask AI", title "Hatem's AI assistant",
subtitle "From his CV, LinkedIn and GitHub", one line) and `content/chat/suggestions.json`. The nav button and hero
CTAs keep the first-person "Ask my AI" (it is his site); the widget speaks about him in the third person. Summary:
closed launcher bottom-end, safe-area aware: **his avatar** (section 9) in a 64 px circle (56 px on phones), named
"Ask Hatem's AI assistant", that waves, blinks and floats (section 7.2). A **comic greeting** pops out of it behind two
little balls, like a comic-strip thought trail: a paper bubble with a 2.5 px ink outline, organic corners, a 2.2° tilt
and a teal Ben-Day dot offset, the first line in teal ("Hi, I'm Hatem! 👋"), then "Ask my AI assistant about my
work." (AR «أهلًا، أنا حاتم! 👋» / «اسأل مساعدي الذكي عن خبرتي.»), in the site's display / Arabic faces. It is the
launcher's description; its × ("Hide message") hides it for the session, Escape hides it, it stays while hovered or
focused, and it never shows once the chat has been opened. It stays paper in the dark theme (with a faint light
keyline). Mirrored on `/ar/` (launcher bottom-start, the hand on the page side). The avatar arrives after load;
until then the launcher is hidden, so nothing changes shape on screen. The launcher never covers the page's own CTAs:
it steps aside (fades, then leaves the tab order and the accessibility tree) while it would overlap any
`[data-chat-avoid]` element, and the greeting bubble alone steps aside while it would cover one (the hero ask bar, the case-study "Ask my AI
about this project" buttons, the contact form's Send and copy buttons, the assistant section's CTA), and on phones it
appears only once the hero's ask bar has scrolled past; never while the chat is open or the launcher has focus; the
header's "Ask my AI" button always opens the chat. Panel 400 × 640 (desktop) growing from the launcher; header with
the avatar (its face; the mouth talks while an answer streams in), title, one-line subtitle, new chat + close; the welcome message ends with the disclaimer ("AI answers can be
wrong…") and the privacy note (messages go to Google's Gemini API), which together describe the dialog; welcome with 8 suggestions (4 on phones), a
language switch chip and a job-description tip; long pasted job descriptions collapse with Show more; user bubbles (ink, end-aligned)
and unboxed assistant answers with markdown-lite; thinking indicator using the graph motif; streaming with a teal
block caret; copy answer; in-thread contact card (WhatsApp, Email, LinkedIn, CV); error, rate-limit, offline and
too-long states; mobile full-screen sheet with drag handle, sticky header, pinned composer and keyboard handling;
full RTL. Non-modal dialog on desktop, modal on mobile; Escape closes and returns focus; live region announces
completed answers. Loaded lazily on first intent (pointerenter / focus / click on any `[data-open-chat]`).

### 12.20 Testimonials (omitted)
Spec kept for later: a quiet two-column quote card (quote in `md` ink-2, attribution with name, role, company and
a link to the source, e.g. the LinkedIn recommendation). Only real, attributable, unedited quotes, with permission.
No section until at least two exist.

### 12.21 Forms and inputs
Inputs 46 px, radius 12, 1 px `line-input`, focus = accent border + 3 px `focus-halo`. Labels above (600), optional
marker in muted. Errors in `danger` with an icon, never colour alone.

### 12.22 404 and CV
`prototypes/404.html`: "This page doesn't exist" (content copy) beside the brand graph with one disconnected,
dashed coral node, the requested path in mono, and actions (Back to home, Selected work, Ask the assistant, other
language); one file serves both locales (Arabic when the path starts with `/ar/`). `prototypes/cv.html`: an A4 paper view with a toolbar (print /
download PDF, copy link, language) and print CSS that fits two pages (monogram header, contact row in mono, summary,
experience with mono date column, sidebar of education, skills, certifications with AWS featured, awards, languages
and open to); generated from the same content data as the site. The CV marks one bold receipt per bullet and three in
the summary ("7 years in data and AI", "14-agent assistant", "6-agent bilingual Arabic/English chatbot"); body 9.1 pt
(Arabic 9.4), sidebar 8.3–8.8 pt, small print ≥ 7.8 pt; roles may continue on the next page after their head and first
two bullets; a sidebar heading never ends a page, and Education, Awards, Languages and Open to stay whole (the build
checks the PDFs' page text). Names never break inside ("Umm Al-Qura University", "Learning – Specialty").

---

## 13. Pages and routes

| Route | Prototype | Notes |
|---|---|---|
| `/` · `/ar/` | `index.html` · `index-ar.html` | long scroll-told home (sections in section 1) |
| `/work/<slug>/` · `/ar/work/<slug>/` | `case-study.html` · `case-study-ar.html` | ArabsStock is the reference; Wakeb chatbot, LLM serving, Empoweromics follow the same template |
| `/cv/` · `/ar/cv/` | `cv.html` | printable, from content data |
| `404` | `404.html` | one file for both locales |
| chat (overlay, all pages) | `chat-widget.html` · `chat-widget-ar.html` | lazy island |

---

## 14. Accessibility (WCAG 2.2 AA)

- Contrast: all token pairs verified (section 3.3). UI boundaries ≥ 3:1 (inputs, focus ring, buttons against page).
- Focus: visible 2 px ring with 2 px offset on every interactive element, never removed; not obscured by the sticky
  nav or the chat launcher (scroll padding + the page reserves bottom space for the launcher on phones).
- Targets ≥ 24 × 24 (we use 36–56 px for controls).
- Keyboard: skip link; graph is one tab stop with arrow keys; trace rows are native `<summary>` with arrow-key
  movement; chat fully operable (Enter sends, Shift+Enter newline, Escape closes, focus returns); "/" opens the chat.
- Structure: one H1 per page; landmark regions (`header`, `nav` with labels, `main`, `footer`); sections labelled by
  their H2; tables with real headers; lists as lists.
- Motion: reduced-motion honoured everywhere; the hero graph has a pause control (2.2.2).
- Language: `lang` on `<html>` and on every other-language fragment (`lang="ar"` chip on EN pages, `lang="en"` terms
  where needed); `dir` on mixed runs.
- Images: portraits and logos decorative where adjacent text says the same; diagrams carry `<title>` + `<desc>` and a
  text explanation in the case study.
- Forms: labels, autocomplete tokens, inline errors linked by `aria-describedby`, no CAPTCHA puzzle (Turnstile managed).

## 15. Performance budget

- LCP ≤ 2.0 s on mobile 4G: LCP is the H1 text; only the display face is preloaded (22 KB EN / 35 KB AR); no hero
  image; hero graph SVG is inline (≈ few KB) and its module loads on idle.
- CLS 0: fixed aspect ratios for the graph, images (`width`/`height`), Turnstile slot (65 px), metric fallbacks.
- JS ≤ 60 KB gzip excluding the chat widget: theme + nav (~1 KB inline), hero graph (≤ 15 KB budget), trace
  enhancement (< 1 KB), copy buttons and ask-bar (< 2 KB). The chat widget loads on first intent; the launcher's avatar
  (art + motion CSS + behaviour, ≈ 7 KB gzip, target ≤ 12 KB) after load, on idle.
- CSS: one stylesheet, ≤ 25 KB gzip. Images: AVIF first, WebP fallback, `loading="lazy"` below the fold.

## 16. Voice (copy)

First person, plain, specific. Verbs over adjectives ("I built", "I owned"). British spelling as in his GitHub README
(specialised, optimisation). No hype words ("cutting-edge", "passionate", "revolutionary"). Numbers as numerals.

## 17. Honesty rules (binding)

Only facts from `_inputs/` (CV, LinkedIn snapshot, GitHub README and repos). Title **AI Team Lead at Globant**;
experience **7 years**; client names only at the disclosed level ("STA project", "AIP project"; ArabsStock is public); the Wakeb government
assistant's client is described only as "a Saudi government client". No invented metrics, team sizes, agent names, results or quotes; when a
design slot would need one, remove the slot. Never feature the Logic Controls founder. MTC is a monogram.

## 18. File index

| Path | What |
|---|---|
| `tokens.css` / `tokens.tailwind.css` / `tokens.json` | generated tokens (do not edit by hand) |
| `scripts/build-tokens.mjs` | token source of truth |
| `scripts/check-contrast.mjs` | WCAG checker for every token pair |
| `scripts/screenshots.mjs` | renders prototypes at 1440 / 768 / 390, light / dark |
| `scripts/sync-sprite.mjs` | inlines the icon sprite into prototypes |
| `scripts/compress-screens.mjs` | palette-compresses `screens/` PNGs (run after screenshots) |
| `prototypes/system.html` | live token, type, control-state, elevation and motion reference |
| `prototypes/` | annotated HTML prototypes (press "Notes" or add `?notes=1`) |
| `assets/hero-graph/` | hero graph source, build and dist |
| `assets/brand/` | monogram, lockups, favicons, manifest, OG templates and PNGs |
| `assets/photo/` | portrait crops and treatments |
| `assets/avatar/` | the chat launcher's illustrated avatar (layered SVG) |
| `assets/logos/` | tiles, mono marks, `logos.json` |
| `assets/diagrams/` | diagram CSS, SVGs (wide / compact / thumb), `diagrams.json` |
| `assets/icons/` | icon set + sprite |
| `assets/showcase/` | logic-controls.com screenshots |
| `assets/fonts/` | subset self-hosted fonts |
| `screens/` | rendered screenshots (pages, sections, assets) |
| `HANDOFF.md` | build instructions, component map, acceptance criteria |
