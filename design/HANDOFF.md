# HANDOFF: design → build (Astro 7 + Tailwind 4)

Read `DESIGN.md` for the why. This file is the what and how: setup, the component map, assets, motion specs and the
acceptance criteria the build is checked against. Copy (all words) comes from `content/` (`profile.ts`, `i18n/*.ts`,
`chat/*`); the prototypes use the same strings where content exists, so lengths are realistic.

---

## 0. Look at the prototypes first

The prototypes need http (fonts, SVG `<use>`, fetch). From the repo root:

```bash
npx -y serve design -l 4321          # or: python3 -m http.server -d design 4321
open http://localhost:4321/prototypes/index.html
```

| URL param | Effect |
|---|---|
| `?theme=dark` / `?theme=light` | force a theme (otherwise system) |
| `?notes=1` | show design annotations (component name, tokens, behaviour) on every annotated block; or press the "Notes" button bottom-start |
| `?shots=1` | screenshot mode (no reveal animation, frozen clock, no prototype toolbar) |
| `?menu=1` | open the mobile menu sheet |
| `?static=1` | hero graph without the enhancement script |

| Prototype | Shows |
|---|---|
| `prototypes/index.html` · `index-ar.html` | Home, EN and AR (RTL), every section |
| `prototypes/case-study.html` · `case-study-ar.html` | Case-study detail template (ArabsStock), EN and AR |
| `prototypes/cv.html` | `/cv` printable CV (screen + print) |
| `prototypes/404.html` | 404 (both locales) |
| `prototypes/chat-widget.html` · `chat-widget-ar.html` | every chat-widget state + a live instance |
| `prototypes/system.html` | tokens, type scale (EN + AR), controls and states, radii, shadows, easings, spacing |
| `prototypes/diagrams.html` | architecture-diagram grammar and every diagram |
| `prototypes/icons.html` | icon set at 16 / 20 / 24 / 32 |
| `assets/hero-graph/demo.html` | the hero graph in isolation (themes, locales, reduced motion) |

Render everything again with `node design/scripts/screenshots.mjs` (see the script header for flags). Reference
renders are in `design/screens/` (section 9).

---

## 1. Project setup

### 1.1 Tokens → Tailwind 4

Copy `design/tokens.tailwind.css` to `src/styles/tokens.tailwind.css` (regenerate it with
`node design/scripts/build-tokens.mjs`; never edit the generated files by hand). `src/styles/global.css`:

```css
@import "tailwindcss";
@import "./tokens.tailwind.css";                       /* @theme static { light + static tokens } + dark + :lang(ar) overrides */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

/* Astro Fonts API variables -> our font tokens (after the tokens import) */
:root {
  --font-display: var(--font-face-display);
  --font-sans: var(--font-face-sans);
  --font-mono: var(--font-face-mono);
  --font-arabic: var(--font-face-arabic);
}
:root:lang(ar) {
  --font-sans: var(--font-face-arabic), var(--font-face-sans);
  --font-display: var(--font-face-arabic), var(--font-face-display);
}

@layer base { /* port section 1 "Base" of design/prototypes/proto.css (body, headings, focus ring, selection, .sr-only, skip link, 1920/2400 root steps) */ }
```

- Semantic utilities switch themes automatically: `bg-bg`, `bg-bg-subtle`, `bg-surface`, `bg-surface-2`,
  `text-ink`, `text-ink-2`, `text-muted`, `border-line`, `border-line-strong`, `text-accent`, `bg-accent-solid`,
  `text-on-accent`, `bg-teal-tint`, `text-saffron`, `shadow-md`, `rounded-lg`, `ease-out`, `font-display`,
  `text-display` (size + line-height + tracking from the companion vars). Use `dark:` only for non-colour differences.
- Non-namespace tokens are plain variables (emitted by `@theme static`): `var(--space-section)`, `--space-block`,
  `--space-gutter`, `--space-stack`, `--grid-gap`, `--container-max`, `--duration-*`, `--z-*`, `--lh-*`,
  `--script-scale*`, `--tracking-*`. Use them via arbitrary values (`py-(--space-section)`, `duration-(--duration-fast)`).
- Logical properties only: `ms-/me-/ps-/pe-/text-start/text-end/border-s/border-e/rounded-s*/rounded-e*`, and
  **`inset-s-*` / `inset-e-*`** (Tailwind 4.2 deprecated `start-*` / `end-*`). No `left-*`/`right-*`/`ml-*`/`mr-*`.
- Contrast gate: add `node design/scripts/check-contrast.mjs src/styles/tokens.css` (or the design copy) to CI; it
  exits 1 on any failing pair or if a colour token has no dark (default) value.

### 1.2 Theme (no flash): dark by default

Dark is every visitor's default, whatever the OS; light only when chosen. The tokens already make the page dark
without any script (`:root:not([data-theme="light"])`), so the boot script only has to apply a stored "light":

```astro
<meta name="theme-color" content="#080E1C" data-light="#F7F6F3" data-dark="#080E1C">
<meta name="color-scheme" content="dark">
<script is:inline>
  (() => { const d = document.documentElement; let m; try { m = localStorage.getItem("mh-theme"); } catch {}
    const light = m === "light"; d.dataset.theme = light ? "light" : "dark";
    if (light) { const c = document.querySelector('meta[name="theme-color"]'); if (c) c.content = c.dataset.light;
      document.querySelector('meta[name="color-scheme"]').content = "light"; } })();
</script>
```
Toggle: every click flips the visible theme (dark ↔ light) and stores the choice (`"light"` or `"dark"`); the metas
follow. Mobile menu: a 2-way segmented control (Light / Dark). Labels from `content/i18n` `theme.*`.

### 1.3 Fonts (Astro 6+ Fonts API, stable)

Copy `design/assets/fonts/*.woff2` to `src/assets/fonts/`.

```js
// astro.config.mjs
import { defineConfig, fontProviders } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
const AR = "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F";
export default defineConfig({
  site: "https://mohamedhatem.dev",
  output: "static",
  compressHTML: true,           // Astro 7 defaults to 'jsx', which removes whitespace between inline elements; the markup relies on normal HTML whitespace
  i18n: { locales: ["en", "ar"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },
  vite: { plugins: [tailwindcss()] },
  fonts: [
    { provider: fontProviders.local(), name: "Space Grotesk", cssVariable: "--font-face-display", fallbacks: ["sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/space-grotesk-latin-wght.woff2"], weight: "300 700", style: "normal" }] } },
    { provider: fontProviders.local(), name: "Inter", cssVariable: "--font-face-sans", fallbacks: ["sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/inter-latin-wght.woff2"], weight: "100 900", style: "normal" }] } },
    { provider: fontProviders.local(), name: "JetBrains Mono", cssVariable: "--font-face-mono", fallbacks: ["monospace"],
      options: { variants: [{ src: ["./src/assets/fonts/jetbrains-mono-ascii-wght.woff2"], weight: "100 800", style: "normal" }] } },
    { provider: fontProviders.local(), name: "IBM Plex Sans Arabic", cssVariable: "--font-face-arabic", fallbacks: ["sans-serif"],
      options: { variants: [400, 600, 700].map(w => ({ src: [`./src/assets/fonts/ibm-plex-sans-arabic-${w}.woff2`], weight: w, style: "normal", unicodeRange: AR })) } },
  ],
});
```
In the layout `<head>`: `<Font cssVariable="--font-face-display" preload={lang === "en"} />`,
`<Font cssVariable="--font-face-sans" />`, `<Font cssVariable="--font-face-mono" />`,
`<Font cssVariable="--font-face-arabic" preload={lang === "ar" ? [{ weight: 700 }] : false} />`.
Inter features: `font-feature-settings: "cv05", "calt"` on body (EN only). Optional: a ~2 KB Plex Arabic micro-subset
for the "العربية" switch label on EN pages (DESIGN.md 4.4).

### 1.4 Locale, direction, routes

`<html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>`. EN pages in `src/pages/`, AR in `src/pages/ar/`.
`<link rel="alternate" hreflang="en|ar|x-default">` on every page. The language switch links to the same page in the
other locale (`getRelativeLocaleUrl`), shows the other language in its own script, with `lang`/`hreflang`.

### 1.5 Astro 7 gotchas we hit in the markup

- `compressHTML: 'jsx'` (default) joins `<span>a</span> <em>b</em>` into "ab". Set `compressHTML: true` or use `{" "}`.
- The Rust compiler rejects invalid nesting (`<p><div>`); the prototypes avoid it (the person chip is a `<p>` with
  inline children only; the ask bar is a `<button>` with `<span>` children only).
- `<script>` without attributes is bundled as a module, deduplicated and rendered where declared (not hoisted).
  Use `is:inline` only for the theme script.

---

## 2. Component map

Classes refer to `design/prototypes/proto.css` (port them into components with Tailwind utilities or a component
`<style>`; values must stay token-driven). "JS" = a small `<script>` in the component (no framework islands needed).

### 2.1 Layout and shared

| Astro component | Prototype (selector) | Data | JS |
|---|---|---|---|
| `layouts/Base.astro` | `<head>`, skip link, sprite, nav, footer, chat launcher | `i18n.meta`, `a11y.skipToContent` | theme init (inline) |
| `components/nav/Nav.astro` | `.nav` | `i18n.nav`, `basics.name`, `basics.title` | scroll border (`data-scrolled`), menu toggle |
| `components/nav/MobileMenu.astro` | `.menu-sheet` | same | Esc / outside / link closes, focus return |
| `components/nav/LanguageSwitch.astro` | `.lang-switch` | `i18n.language` | none |
| `components/nav/ThemeToggle.astro` | `.theme-toggle`, `.segmented` | `i18n.theme` | cycle + persist |
| `components/nav/AskButton.astro` | `.nav__ask` (accent sm) | `i18n.chat.launcher` | `[data-open-chat]` |
| `components/brand/Monogram.astro` | `.brand__mark` | `assets/brand/monogram.svg` inlined (currentColor + gold node) | none |
| `components/ui/Icon.astro` | `<svg class="icon"><use href="#i-…"></svg>` | sprite `assets/icons/sprite.svg` inlined once in Base | none |
| `components/ui/Button.astro` | `.btn` + `--primary/--accent/--secondary/--ghost`, `--sm/--lg/--icon` | | none |
| `components/ui/Chip.astro`, `Badge.astro`, `Kbd.astro`, `IconTile.astro`, `Stripe.astro`, `Card.astro` | `.chip*`, `.badge`, `.kbd`, `.icon-tile*`, `.stripe`, `.card*` | | none |
| `components/SectionHeader.astro` | `.sec-head` (index, mono label, H2, lede, optional action) | `i18n.<section>.{eyebrow,title,lead}` | none |
| `components/Footer.astro` | `.footer` | `i18n.footer`, contacts | none |

### 2.2 Home (`src/pages/index.astro`, `src/pages/ar/index.astro`)

Order and bands (P = plain `bg`, B = `bg-subtle` band): Hero (P) · 01 What I build (P) · 02 Selected work (B) ·
03 Experience (P) · 04 About (B) · 05 Open source (P) · 06 AI assistant (B) · 07 Skills (P) · 08 Education (B) ·
09 Contact (P) · Footer. (The former 06 Front-end craft section is figure 1 of the logic-controls.com case study;
`/#craft` lands on its card in Selected work.)

| Astro component | Prototype (selector) | Data | JS |
|---|---|---|---|
| `home/Hero.astro` | `.hero` (`.hero__bg`, `.hero__grid`, `.person-chip`, `.hero__title`, `.hero__lede`, `.ask-bar`, `.hero__actions`, `.hero__meta`) | `basics.name/headline/tagline/intro`, `i18n.hero.*` (availability, localTime, ctaWork), photo `mh-square-96` | ask-bar typed examples (stops under reduced motion / hidden tab), "/" shortcut, Cairo clock (`Intl.DateTimeFormat`, `timeZone: "Africa/Cairo"`) |
| `home/HeroGraph.astro` | `.hero__art` + `.hero__art-frame` (aspect 600/520) + `.hero__caption` | graph copy from `assets/hero-graph/graph-data.ts` (or `i18n.hero.graph`) | `assets/hero-graph` module (see 4.1) |
| `home/MetricStrip.astro` | `.metrics` / `.metric` (`<dl>`) | `profile.metrics` featured first, max 5 | none |
| `home/LogoRow.astro` | `.logos` / `.logo-mark` (mask + name) | `experience[].logo` + `assets/logos/logos.json` (monoWidth/monoHeight) | none |
| `home/Capabilities.astro` + `CapabilityCard.astro` | `.bento`, `.bento__feature`, `.cap`, `.feature-art` | `profile.skills` groups or i18n capability copy; feature art = `assets/diagrams/wakeb-multi-agent-chatbot-thumb.svg` | none |
| `home/SelectedWork.astro` + `CaseCard.astro` | `.work-list`, `.work`, `.work--feature`, `.work__media/body/meta/title/summary/facts/foot/cta` | `profile.caseStudies` (feature = first), thumbs `assets/diagrams/*-thumb.svg` | none |
| `home/ExperienceTrace.astro` + `TraceRow.astro` | `.trace`, `.trace__head`, `.axis`, `.trace__grid`, `details.span`, `.span__lane`, `.span__bar(--pt/--study/--live)`, `.span__dates(--before)`, `.span__detail`, `.trace__foot` | `profile.experience` + `profile.education` (study lanes), tiles `assets/logos/tiles/*-96.webp` | arrow keys + single-open (section 6.2) |
| `home/OpenSource.astro` + `RepoCard.astro` | `.repos`, `.repo`, `.repo--small`, `.repos__more` | `profile.projects` (featured OSS, then client site), `i18n.projects` | none |
| `home/AssistantSection.astro` + `ChatPreview.astro` | `.assist`, `.assist-flow`, `.chat-preview*` | `i18n.assistant`, `i18n.chat` (title, subtitle, greeting, placeholder, jdHint), `chat/suggestions.json` first 4 | preview + CTA carry `data-open-chat` |
| `home/Showcase.astro` + `BrowserFrame.astro` + `PhoneFrame.astro` | `.show`, `.show__stats`, `.devices`, `.browser`, `.phone` | `profile.projects` (logic-controls) | none |
| `home/SkillsMatrix.astro` | `.matrix-wrap` (position relative!), `table.matrix`, `.grp`, `.y`/`.n`, `.matrix-legend` | section 6.1 mapping | none |
| `home/Education.astro` | `.edu`, `.edu__item`, `.cert-feature` | `profile.education`, `certifications`, `honors` | none |
| `home/Contact.astro` + `AboutFacts.astro` + `ChannelList.astro` + `ContactForm.astro` + `CopyButton.astro` | `.contact`, `.contact__intro`, `.portrait` (+ `orbit-ring.svg`), `.facts`, `.channels`, `.channel`, `.form`, `.field`, `.input`, `select.input`, `.turnstile-slot`, `.form__foot` | `basics.location/openTo/contacts`, `i18n.contact.*` | form validation + Turnstile + POST `/api/contact`; copy button announces via `#live` |

### 2.3 Other pages

| Route | Astro | Prototype | Notes |
|---|---|---|---|
| `/work/[slug]/`, `/ar/work/[slug]/` | `pages/work/[slug].astro` + `components/case/*` | `case-study.html`, `case-study-ar.html`, `pages.css` | see section 2.5 |
| `/cv/`, `/ar/cv/` | `pages/cv.astro` | `cv.html` | print CSS, two A4 pages |
| `404` | `pages/404.astro` | `404.html` | one file, both locales |

### 2.4 Chat widget

The chat agent owns `chat-widget/`. The visual and interaction spec is `prototypes/chat.css` + `chat.js` +
`chat-widget.html` (every state). Copy: `content/i18n` `chat.*`, `content/chat/suggestions.json`.
Integration contract used across the pages: any element with `[data-open-chat]` (optional `data-question`) opens the
widget; `window.MHChat.open({ question })` if loaded, else `document` event `mh:open-chat`. The launcher markup
`button.chat-launcher` is server-rendered in `Base.astro` (tiny inline CSS); the widget JS + CSS load on the first
`pointerenter` / `focus` / `click` of any `[data-open-chat]` and then open.

### 2.5 Case-study template (`prototypes/case-study.html`, `case-study-ar.html`, `pages.css`)

Route `src/pages/work/[slug].astro` (+ `ar/work/[slug].astro`) renders an entry of a `work` content collection
(or `profile.caseStudies`). Every section label comes from `i18n.work.labels`.

| Astro component | Prototype (selector) | Notes |
|---|---|---|
| `case/ReadingProgress.astro` | `.read-progress` | 2 px hairline on the nav edge; CSS scroll timeline where supported (Chrome, Safari 26), 10-line script otherwise (Firefox) |
| `case/Breadcrumbs.astro` | `.crumbs-row`, `.back-btn`, `.crumbs` | BreadcrumbList JSON-LD; back arrow flips in RTL |
| `case/CaseHero.astro` | `.cs-hero`, `.cs-hero__title`, `.cs-hero__summary`, `.cs-hero__actions` | eyebrow company / role / years; "Ask my AI about this project" carries a project-specific `data-question` |
| `case/CaseMeta.astro` | `.cs-meta` (`<dl>`) | role, company (mono logo mask), period + computed duration, where, stack chips (category colours) |
| `case/KeyFacts.astro` | `.metrics.metrics--4.cs-facts` | 0–4 facts from the entry; the strip disappears when there are none (never estimates) |
| `case/FigurePanel.astro` | `.fig`, `.fig-panel`, `.fig__caption`, `.callouts` | inlined diagram (wide / compact), caption + `.fig__note` disclaimer (`i18n.work.architectureNote`), numbered callouts from `diagrams.json` (numbers must match the drawing) |
| `case/CaseLayout.astro` + `case/Toc.astro` + `case/TocMobile.astro` | `.cs-layout`, `.toc-rail`, `.toc`, `.toc-m` | sticky TOC on the end side ≥ 64rem with scroll-spy (`aria-current`) and % read; collapsible sticky "On this page" bar below |
| `case/Section.astro` + prose | `.cs-sec`, `.cs-sec__rule`, `.cs-prose`, `.term`, `.co-ref` | 40rem measure; inline callout references link back to the figure |
| `case/Decision.astro` | `.decision` | engineering decision as a pull quote: statement + optional why + source line; each needs a unique `aria-label`; only decisions stated in the sources |
| `case/Flow.astro` | `.flow-fig`, `.flow`, `.flow__step--{ext,slate,coral,saffron,teal}` | small HTML pipelines (these DO mirror in RTL, unlike the SVG diagrams) |
| `case/ServiceRack.astro`, `case/Checks.astro` | `.rack`, `.checks` | one unit per deployed service; evaluation dimensions |
| `case/StackList.astro`, `case/Owned.astro`, `case/SourcesNote.astro` | `.stack-list`, `.owned`, `.sources` | stack grouped by category colour; "what I owned" list; where the facts come from |
| `case/NextCase.astro`, `case/CaseCTA.astro` | `.next-case`, `.cta-band` | next entry in collection order; dark CTA band with an ask bar and contact |

Brief variant (`depth: "brief"`, projects whose details aren't public: the government assistant, AIP, Tabaqat): same
hero + meta with a "Brief" tag in the eyebrow and no key-facts strip; then "The problem", "What I did" and "Outcome"
beside a note card (`i18n.work.briefNote`, the sources, "Ask my AI about this project", all work); the component view
only when it has more than three parts.

### 2.6 CV and 404

- `/cv` (`prototypes/cv.html`): toolbar (`.cv-bar`: back, language, copy link, Download PDF = `window.print()`) and
  an A4 sheet (`.sheet`, sizes in pt so screen and print match). Print CSS: `@page { size: A4; margin: 12mm 13mm }`,
  white paper, no chrome, `break-inside: avoid` on jobs, two pages (verified: `screens/cv-print-page1.png`,
  `cv-print-page2.png`). The sheet stays light in dark mode (it is a document). Generate `/ar/cv` from the same data
  with the AR strings in `profile.ts`. Optionally pre-render a PDF at build (`/cv.pdf`) with the same print CSS.
- `404` (`prototypes/404.html`): one file for both locales (EN default; an inline script switches `lang`/`dir`/copy
  when the path starts with `/ar/`), the requested path shown in mono, the brand graph with a disconnected coral
  node, actions Back to home · Selected work · Ask the assistant · other language. `<meta name="robots" content="noindex">`.

---

## 3. Assets

| Source (design/) | Destination | Use |
|---|---|---|
| `assets/fonts/*.woff2` | `src/assets/fonts/` | Fonts API (1.3) |
| `assets/brand/favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `site.webmanifest` | `public/` (root) | head links below |
| `assets/brand/monogram.svg`, `monogram-tile.svg`, `logo-lockup*.svg` | `src/assets/brand/` | inline (Monogram.astro), JSON-LD logo |
| `assets/brand/og/og-*.png` (+ `og-home.svg`, `og-case.svg` templates, `scripts/brand/render-og.mjs`) | `public/og/` | `og:image` 1200 × 630 per page and locale; generate per case study at build time with the script (dev dependency, not on Workers) |
| `assets/photo/mh-*.{avif,webp,jpg}`, `orbit-ring.svg`, `photo.json` | `src/assets/photo/` | `<Picture>` (formats avif + webp), sizes from `photo.json` |
| `assets/logos/tiles/*`, `mono/*.svg`, `logos.json` | `src/assets/logos/` (tiles via `<Image>`), `public/logos/mono/` (CSS mask URLs) | trace, education, logo row |
| `assets/showcase/lc-*` | `src/assets/showcase/` | Showcase (`<Picture>`), alt="" (decorative) |
| `assets/icons/sprite.svg` (+ individual) | `src/assets/icons/` | inline the sprite once per page in Base (or per-icon inline components) |
| `assets/diagrams/*.svg`, `diagram.css`, `diagrams.json` | `src/assets/diagrams/` | inline SVG (`?raw` import + `set:html`) so it themes; `diagram.css` global |
| `assets/hero-graph/*` | `src/components/hero-graph/` | see 4.1 |

Head links:
```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

The design scripts (`design/scripts/**`) are design-time tools, never shipped. Add their tools as devDependencies:
`playwright`, `sharp`, `svgo` (all scripts) and, for the brand scripts, `fontkit`, `wawoff2`, `potrace`,
`subset-font`. Until then they resolve from env vars: `PLAYWRIGHT_PATH` (screenshots), `SVGO_WORKSPACE` (diagrams,
icons), `BRAND_NODE_MODULES` (colon-separated roots for the brand scripts). Regenerate everything with:

```bash
node design/scripts/build-tokens.mjs && node design/scripts/check-contrast.mjs
node design/scripts/diagrams/build.mjs --strict          # diagrams + diagrams.html
node design/scripts/diagrams/icons.mjs                   # icons + sprite + icons.html
node design/scripts/brand/brand.mjs                      # monogram, lockups, favicons, manifest
node design/scripts/brand/render-og.mjs                  # OG images (EN/AR, home + case studies)
node design/scripts/brand/photo.mjs && node design/scripts/brand/logos.mjs
node design/assets/hero-graph/build.mjs                  # hero graph bundle/
node design/scripts/sync-sprite.mjs && node design/scripts/screenshots.mjs
```

---

## 4. Signature components in detail

### 4.1 Hero graph (`design/assets/hero-graph/`)

Files: `graph-data.ts` (nodes, edges, geometry, EN/AR copy: single source), `render.ts` (pure
`renderHeroGraph({ lang, dir })` → figure markup, `renderHeroGraphSVG()` → SVG only), `hero-graph.ts` (runtime),
`hero-graph.css`, `build.mjs` (esbuild; `node build.mjs` rebuilds `bundle/`, `--check` type-checks), `demo.html`
(`?theme=dark&lang=ar&motion=reduce&chrome=0`). `bundle/` holds the built `hero-graph.js`, the lazy
`hero-graph.render.js` (only fetched when a host is empty), `hero-graph.css` and static `hero-graph.{en,ar}.svg|html`.

Measured gzip: JS 5.24 KB + CSS 2.49 KB = **7.73 KB** (6.99 KB brotli); budget 15 KB. The SSR markup has no inline
styles (strict CSP friendly).

Astro (SSR, zero CLS, visible without JS):
```astro
---
import { renderHeroGraph } from "../components/hero-graph/render";
import "../components/hero-graph/hero-graph.css";
const dir = lang === "ar" ? "rtl" : "ltr";
---
<Fragment set:html={renderHeroGraph({ lang, dir })} />
<script>import "../components/hero-graph/hero-graph.ts";</script>
```
The module auto-mounts every `[data-hero-graph]` after idle; API `mountHeroGraph(host, { lang, dir }) → { play, pause,
destroy }` (also the default export) and `initHeroGraphs(root)` (call on `astro:page-load` if view transitions are
used). Behaviour: 9 s loop (every second loop adds the tools detour, ≈ 11.9 s at the same pulse speed; length from
`--duration-graph-loop`), pauses offscreen / hidden tab / pause button (persisted), static frame under reduced motion
(live media-query changes honoured), pointer parallax on fine pointers, hover/focus highlights a node's edges and dims
the rest to 35%, Enter/Space/click opens the toggletip, Escape closes. A11y: `<figure>` with a visually hidden flow
caption; SVG `role="group"`; nodes `role="button"` with roving tabindex (one tab stop, arrows mirrored in RTL,
Home/End); each accessible name starts with the visible label ("guard", "tools · mcp"; AR "guard، الحارس") and the
explanation is the accessible description; the pause button is a toggle (`aria-pressed`, fixed name "Pause
animation"). Container queries scale labels up on phones (1.15× ≤ 540 px, 1.36× ≤ 440 px).

### 4.2 Architecture diagrams (`design/assets/diagrams/`)

Six systems × three variants, generated from data by `design/scripts/diagrams/build.mjs` (`--strict` fails on layout
warnings, `--audit` prints the contrast table; specs in `specs.mjs`, captions in `captions.mjs`):

| Diagram | Wide (≈1120 w) | Compact (352 w, phones) | Thumb (400 × 250, cards) |
|---|---|---|---|
| `arabsstock-assistant` | 5.0 KB gz | 5.0 KB gz | 2.5 KB gz |
| `wakeb-multi-agent-chatbot` | 4.1 | 4.1 | 2.8 |
| `llm-serving-a100` | 4.0 | 3.8 | 2.4 |
| `hybrid-rag` | 3.2 | 3.2 | 2.3 |
| `empoweromics-message-routing` | 4.2 | 4.1 | 2.6 |
| `sta-tourism-assistants` (capability view) | 5.2 | 5.2 | 3.2 |

`diagrams.json` carries, per diagram and in EN + AR: title, caption, role / company / dates, long and short text
descriptions, numbered callouts, legend labels, file paths and element ids. `diagram.css` (9 KB) holds the grammar
(spec comment at the top) and can replace the per-SVG `<style>` blocks if loaded globally.

Inline (so the SVG follows the site theme) and switch variants with a container query:
```astro
---
import wide from "../assets/diagrams/arabsstock-assistant.svg?raw";
import compact from "../assets/diagrams/arabsstock-assistant-compact.svg?raw";
---
<figure aria-labelledby="cap-asa" class="dgf">
  <div class="dgf-art" dir="ltr"><div class="dgf-wide" set:html={wide} /><div class="dgf-compact" set:html={compact} /></div>
  <figcaption id="cap-asa"><p>{caption}</p><ol>{callouts}</ol><details><summary>{textDescriptionLabel}</summary>{desc}</details></figcaption>
</figure>
<style>.dgf-art{container-type:inline-size}.dgf-wide{display:none}@container (min-width:880px){.dgf-wide{display:block}.dgf-compact{display:none}}</style>
```
- Each SVG is `role="img"` labelled by its own `<title>`/`<desc>` (ids prefixed per diagram and variant, so wide and
  compact can coexist; the hidden one is `display:none`).
- Arabic pages keep the art `dir="ltr"`, swap `<title>`/`<desc>` for the AR strings from `diagrams.json` with
  `lang="ar"`, and translate captions and callouts only.
- Card thumbnails are decorative: strip `role`, `aria-*`, `<title>`, `<desc>` and ids, add `aria-hidden="true"`
  (the card title names the system). The prototypes do exactly this in `proto.js` ("inline diagram SVGs").
- Optional motion: add class `dg-play` to animate pulses along the main path (6 s loop) and provide a pause control
  (`dg-paused`); reduced motion removes pulses. Off by default on the site.
- Never use `.dg` or `dg-*` class names elsewhere: inline SVG styles are global.
- Edges use `--color-line-input` (the only line token ≥ 3:1); callout numerals use `--color-on-saffron`.
- Facts deliberately not drawn (no source detail): agent names for both systems (shown as counted slots / capability
  groups), server counts (two servers + "more"), which APIs moved to gRPC, merge/eval methods in the generic RAG. One
  inferred link to confirm with Mohamed: health monitoring → automated restart in `llm-serving-a100`.

### 4.3 Icons (`design/assets/icons/`)

84 icons (24 grid, 1.75 stroke, round caps, `currentColor`), individual SVGs + `sprite.svg` (22 KB, 3.8 KB gzip,
symbols `i-<name>`), preview `prototypes/icons.html`. Inline the sprite once per page in `Base.astro` (or tree-shake
to the ~35 used ids at build time) and use `<svg class="icon" aria-hidden="true"><use href="#i-name"/></svg>`. Names
used by the site include: agents, orchestrator, retrieve, rerank, guard, generate, evaluate, tools-mcp, serving,
bilingual, frontend, ask, arrow-right, arrow-down, arrow-up-right, chevron-down, menu, close, send, stop, copy, check,
refresh, mail, whatsapp, linkedin, github, globe, sun, moon, monitor (system theme), clock, award, certificate,
file-text (CV), pause, play. Directional icons get `.icon--flip` in RTL. The "ع" in `bilingual` reads poorly at
16 px: use it at 20 px and up.

---

## 5. Motion specs (exact)

| Element | Property | Duration | Easing | Delay / trigger | Reduced motion |
|---|---|---|---|---|---|
| Button hover | background, border, color, shadow | `--duration-fast` 160 ms | `--ease-standard` | hover | same (colour only) |
| Button press | `translateY(1px)` | `--duration-instant` 90 ms | `--ease-standard` | :active | none |
| Arrow nudge | `translateX(3px)` (mirrored in RTL) | 240 ms | `--ease-out` | parent hover | none |
| Card hover | `translateY(-2px)` + `--shadow-md` + `--color-line-strong` | 240 ms | `--ease-out` / `--ease-standard` | hover | shadow/border only |
| Section reveal | opacity 0→1, `translateY(14px)`→0 | `--duration-slower` 640 ms | `--ease-out` | IntersectionObserver (rootMargin -8% bottom), once; stagger `calc(var(--i) * 70ms)` | content visible, no transition |
| Nav border | border-color | 240 ms | `--ease-standard` | `scrollY > 8` | same |
| Mobile menu | opacity + `translateY(-6px)`→0 | 240 ms | `--ease-out` | open | instant |
| Trace chevron | `rotate(180deg)` | 240 ms | `--ease-out` | `[open]` | instant |
| Ask-bar typing | text content | 45 ms / char, 38-tick hold | linear | auto, paused when tab hidden | static placeholder |
| Ask-bar caret | opacity blink | 1.1 s steps(1) | n/a | auto | solid |
| Live dot ping | scale 1→2.6, opacity .5→0 | 2.4 s, infinite | `--ease-out` | auto | static dot |
| Hero graph | see 4.1 | 9 s loop | `--ease-in-out` hops | idle after load; pauses offscreen / hidden tab / pause button | static snapshot |
| Chat panel open | scale .96→1, `translateY(8px)`→0, opacity | `--duration-slow` 380 ms | `--ease-spring` | open | opacity 120 ms |
| Chat close | reverse | 240 ms | `--ease-in` | close | opacity 120 ms |

Animate only `transform`, `opacity` and SVG `stroke-dashoffset`. Wrap CSS motion in
`@media (prefers-reduced-motion: no-preference)`; JS checks `matchMedia("(prefers-reduced-motion: reduce)")` and
listens for `change`.

---

## 6. Data recipes

### 6.1 Skills matrix (only what the sources state)

Columns: Globant · Wakeb · ArabsStock · Tabaqat · Empoweromics · Freelance & earlier (Logic Controls, AestheticsPro,
MDP) · Open source. If `profile.skills[].usedIn` exists, derive from it; it must agree with this table.

| Group | Skill | Gl | Wa | AS | Ta | Em | Fr | OSS |
|---|---|---|---|---|---|---|---|---|
| Agents & LLMs | Multi-agent orchestration | ● | ● | ● | | | | |
| | LangGraph | | ● | ● | | | | ● |
| | MCP tool integration | | ● | | | | | |
| | OpenAI API | | | ● | | | | ● |
| Retrieval | RAG pipelines | ● | ● | | | | | ● |
| | Hybrid BM25 + dense, LLM reranking | | ● | | | | | |
| | Semantic and visual search | | ● | ● | | | | |
| Serving & MLOps | LLM serving (vLLM, GPUs) | ● | ● | ● | | | | |
| | FastAPI microservices | | ● | ● | | | | ● |
| | Docker, CI/CD | | ● | ● | | | ● | |
| | Workflow orchestration (Prefect) | | | | ● | | | |
| Quality | LLM evaluation and monitoring | | ● | ● | | | | ● |
| | Accessibility and testing (front end) | | | | | | ● | ● |
| Data & ML | NLP (Arabic and English) | | ● | | | ● | | ● |
| | Computer vision and audio ML | | | ● | | ● | | |
| | ETL and SQL | | | | ● | ● | ● | |
| | Cloud (AWS, Azure) | | | | ● | ● | ● | |

### 6.2 Trace geometry

Axis Jan 2020 → Dec 2026 = 84 months (extend the axis by a year each January). For a role `start = "YYYY-MM"`,
`end = "YYYY-MM" | null` (present = current month):

```ts
const AXIS_START = 2020, MONTHS = 84;
const idx = (ym: string) => { const [y, m] = ym.split("-").map(Number); return (y - AXIS_START) * 12 + (m - 1); };
const s = idx(start) / MONTHS * 100;                       // --s (%)
const w = (idx(end ?? nowYM) + 1 - idx(start)) / MONTHS * 100; // --w (%), inclusive of the end month
const labelBefore = s + w > 74;                            // .span__dates--before
const style = type === "study" ? "study" : (type === "full-time" ? "" : "pt"); // bar modifier; current role adds --live
```
Year ticks at `(year - 2020) * 12 / 84 * 100%`; the "now" line at the current month. Logical properties make the
whole thing run right-to-left in Arabic automatically. Rows: newest first; study lanes (M.Sc., ITI) last. The current
role is `open` by default. Bar colours (`--bar`): Globant teal, Wakeb saffron, ArabsStock coral, Empoweromics sky,
teaching (BUiD/UQU, MTC) sage, Tabaqat / AestheticsPro / MDP slate, study `--color-line-input`.

### 6.3 Text details

- Non-breaking hyphen in compound counts ("14‑agent", "6‑agent") and `&nbsp;` in "7&nbsp;years", "hold&nbsp;up",
  "in&nbsp;Arabic", "and&nbsp;English" in the hero tagline (it then breaks as: "I build multi-agent / LLM systems that /
  hold up in production, / in Arabic and English." at 1440 and 768).
- The hero H1 wraps the word "production" (EN) / "بيئة الإنتاج" (AR) in `<em>` (accent colour, no italics).
- Phone numbers, emails, URLs and code-like runs inside Arabic: `dir="ltr"` (`.latin`).
- Numeric year ranges inside Arabic ("2023–2024"): `<bdi dir="ltr">`, or the container gets `direction: ltr;
  unicode-bidi: isolate` (as `.edu__when` does). Without it they render reversed ("2024–2023").

---

## 7. Acceptance criteria

The build is accepted when all of these pass on `/`, `/ar/`, one case study in each locale, `/cv`, and the 404.

**Visual**
- Matches the reference renders in `design/screens/` at 1440, 768 and 390, light and dark, EN and AR: same section
  order, grid splits, type tokens, spacing tokens, radii, borders, colours. Pixel-perfection is not required; token
  fidelity is.
- No horizontal scrolling at any width from 320 to 2560 in either locale (`document.documentElement.scrollWidth ===
  clientWidth`).
- At 1440 × 900 the hero shows the person chip, H1, lede, ask bar, actions, the graph, and the top edge of the metric
  strip above the fold.
- From 1920 px the root steps to 106.25% and from 2400 px to 112.5%; the layout stays centred and proportional.

**Accessibility (WCAG 2.2 AA)**
- axe-core: 0 violations in both themes and both locales.
- `node design/scripts/check-contrast.mjs` passes; no text set in a `-fill` colour.
- Keyboard: skip link first; every control reachable and visible on focus (2 px ring, 2 px offset); focus never hidden
  behind the sticky nav or the chat launcher; hero graph is one tab stop with arrow keys and Enter/Space toggletips;
  trace rows open with Enter/Space and move with ArrowUp/Down/Home/End; "/" opens the chat; Escape closes chat and
  menu and returns focus.
- `prefers-reduced-motion: reduce`: no transform animations anywhere; hero graph renders the static frame; chat opens
  with opacity only. The hero graph pause button works and its state persists.
- Landmarks, one H1, labelled sections, real `<table>` for skills, `<details>` for the trace, form labels and errors
  linked with `aria-describedby`, error summary focused on failed submit, success focus moves to the heading.
- `lang`/`dir` correct on `<html>` and on every other-language fragment.

**Performance**
- Lighthouse mobile ≥ 95 in all four categories on `/` and `/ar/`.
- LCP ≤ 2.0 s (Lighthouse mobile, simulated 4G); LCP element is the H1. CLS ≤ 0.01. TBT < 100 ms.
- JS shipped on first load ≤ 60 KB gzip excluding the chat widget (which loads only on intent). Hero graph module
  within its budget (section 4.1).
- Only the display face is preloaded (Space Grotesk on EN, Plex Arabic 700 on AR); all fonts self-hosted.
- Images: AVIF + WebP via `<Picture>`, explicit width/height, `loading="lazy"` below the fold.

**Bilingual**
- `/ar/` has every section with native Arabic copy from `content/`; layouts mirrored; directional icons flipped;
  trace runs right-to-left; diagrams stay LTR with Arabic captions; Latin digits; no letter-spacing or uppercase on
  Arabic.

**Content**
- Every fact traces to `content/profile.ts` (which traces to `_inputs/`). `content/scripts/check-content.mjs` passes.
  Nothing from the honesty list in DESIGN.md section 17 is violated.

---

## 8. Notes from the asset tracks (things the build must not miss)

- **Chat widget** (`prototypes/chat.css` + `chat.js` + `chat-widget*.html`; the chat agent owns the production
  `chat-widget/`). Sizes: PART A of chat.css (launcher, inlined on every page) 1.26 KB min+gzip (1.56 KB with the
  noscript fallback); chat.css PART B 6.7 KB min+gzip; chat.js 18.7 KB min+gzip in the prototype (mock backend and
  gallery fixtures included), about 12.8 KB in production, about 9.9 KB if copy comes from `content/i18n` per locale.
  Lazy load: launcher markup + PART A inline + a 0.5 KB loader; first `pointerenter` / `focusin` / `touchstart` on any
  `[data-open-chat]` imports chat.js and injects chat.css; clicks before that are queued in `window.MHChatQueue`; no
  prefetch on Save-Data. Contract: `window.MHChat.open({ question, trigger })`, `close()`, `toggle()`, `isOpen()`;
  `document` event `mh:open-chat`; `"/"` shortcut. Transport: `POST /api/chat { messages, lang }` streaming text;
  429 = rate limited (Retry-After), 503 = unavailable, 504 / no first byte in 30 s = timeout.
  Page integration: launcher label is the content string ("Ask AI" / "اسأل المساعد") with `launcherLabel` only as
  `title` (WCAG 2.5.3); the footer reserves `var(--chat-clearance)` at the bottom (done in proto.css) so the launcher
  never hides focused content (2.4.11); add the `<noscript>` fallback (in the prototypes); optional
  `data-chat-compact-after` on the hero. Focus returns to the trigger on close, or to the launcher when the trigger
  is not focusable (e.g. the decorative chat preview).
  States: launcher (pill, hover, focus, compact circle, open = close, no-JS), welcome (8 suggestions, 4 on phones),
  thinking, streaming, answer (markdown-lite, copy, feedback), contact card, job description (6-line clamp + Show
  more), errors (network/offline, timeout, server, rate limit with countdown, unavailable), validation (empty, too
  long at 4,000), phone sheet (welcome, answer, keyboard open), all in AR/RTL.
  Content gaps for `content/i18n` (marked GAP in chat.js): "View CV", a LinkedIn label, the language-switch chip
  ("اسأل بالعربية" / "Ask in English"), "Stopped.", "Jump to latest", thread label "Conversation".
- **Hero graph**: see 4.1. The Arabic node names in the graph data are the graph agent's translations; they match
  `content/i18n` `hero.graph` closely but have them reviewed by a native speaker with the rest of the AR copy.
- **Brand**: favicon set + manifest go to `public/` (root paths). OG PNGs are about 240 KB each (full colour keeps
  the glows smooth). The OG and brand scripts need the brand devDependencies listed in section 3.
- **Logos**: Wakeb's mono mark is a redraw (the source is too small to trace); Empoweromics' mono mark is the house
  symbol only; crests (Cairo, Tanta) use text monograms in mono contexts; MTC, Tabaqat and UQU are monograms.
- **Diagrams**: one inferred link to confirm with Mohamed (health monitoring → automated restart in
  `llm-serving-a100`). Everything else is drawn only from the sources.
- **Content**: the prototypes use `content/` strings where they existed at design time. Where the prototype copy
  differs (section titles such as "Seven years, laid out like a trace." or "Skills, with receipts."), treat the
  prototype as a design proposal and move the final words into `content/i18n` so there is one source of truth.

---

## 9. Key reference renders (`design/screens/`)

Naming: `<page>-<width>-<theme>[-top].png` (full page, or first viewport with `-top`); `sections/` holds one PNG per
section; `assets/` holds the asset-track verification sheets. Regenerate with `node design/scripts/screenshots.mjs`.

| What | Files |
|---|---|
| Home hero, EN | `index-1440-light-top.png`, `index-1440-dark-top.png`, `index-390-light-top.png`, `index-390-dark-top.png`, `index-768-light-top.png`, `index-2560-light-top.png`, `index-320-light-top.png` |
| Home hero, AR | `index-ar-1440-light-top.png`, `index-ar-1440-dark-top.png`, `index-ar-390-light-top.png`, `index-ar-390-dark-top.png` |
| Home full page | `index-{1440,768,390}-{light,dark}.png`, `index-ar-{1440,768,390}-{light,dark}.png` |
| Home sections | `sections/index-1440-{light,dark}-NN-<section>.png`, `sections/index-ar-1440-…` |
| Case study | `case-study-{1440,768,390}-{light,dark}.png`, `case-study-ar-…` |
| CV | `cv-{1440,768,390}-{light,dark}.png`, `cv-print-page1.png`, `cv-print-page2.png` |
| 404 | `404-{1440,768,390}-{light,dark}.png`, `404-ar-…` |
| Chat | `chat-widget-{1440,390}-{light,dark}.png`, `chat-widget-ar-…`, live: `chat-live-index-1440-light.png`, `chat-live-index-390-dark.png`, `chat-live-index-ar-1440-dark.png`, `chat-live-index-ar-390-light.png` |
| Design system | `system-{1440,768,390}-{light,dark}.png`, `sections/system-…` |
| Annotated | `index-1440-light-notes-top.png` (component names and behaviour on the page) |
| Assets | `assets/hero-graph-*.png`, `assets/brand-*.png`, `assets/photo-*.png`, `assets/logos-*.png`, `assets/diagram-page-*.png`, `assets/icons-*.png` |
