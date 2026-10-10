# site/: mohamedhatem.dev (Astro)

The static website: English at `/`, Arabic (RTL) at `/ar/`. It is built with Astro 7, TypeScript (strict) and
Tailwind CSS 4. The build goes to `../dist`, and the Cloudflare Worker in `../worker` serves it as static assets;
`/api/*` (the chat and the contact form) runs the Worker.

This folder has its own `package.json` and `node_modules`. Run every command below **inside `site/`**.

```bash
cd site
npm install
npm run dev          # http://localhost:4321 (Turnstile test key; no CSP in dev)
npm run build        # content:gen → OG images → astro build → ../dist → 404 relocation, _redirects, early hints, CV PDFs
npm run serve        # serve ../dist like Workers static assets (404 pages, _headers) on :4321
npm test             # unit tests + static checks of ../dist (secrets, CSP, links, budgets, HTML validity)
npm run test:e2e     # Playwright: Chromium desktop, Pixel 7, iPhone 15 (WebKit) against ../dist
npm run lighthouse   # Lighthouse mobile + desktop on key pages → lighthouse/
npm run screenshots  # every page × 1440/768/390 × light/dark → screenshots/ (needs `npm run serve -- --port 4380`)
node scripts/verify-csp.mjs   # the CSP against the real Turnstile and analytics scripts (network), Chromium + WebKit
```

To test against the real Worker, build with the Turnstile test key and run `npm run dev:worker` from the repo root
(it serves `../dist` and `/api/*` on http://127.0.0.1:8790):

```bash
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB npm run build
```

Rebuild without that variable before deploying: the production key only works on mohamedhatem.dev.

## How content flows

Nothing user-facing is written in a component. All of it comes from `../content`:

| Source | What | Read through |
|---|---|---|
| `content/profile.ts` | facts: roles, case studies, projects, skills, education, CV data (EN + AR in one object) | `~/lib/site.ts` (`profile`, `caseStudies`, links), `tr(text, locale)` |
| `content/profile.ts` dates | `site.published` / `site.updated`, `cv.updated`, each case study's `published` / `updated` (YYYY-MM-DD) | `~/lib/dates.ts`: JSON-LD dates, `article:*` tags, sitemap `<lastmod>` (also read by astro.config.mjs) |
| `content/i18n/{en,ar}.ts` | every UI string (`ar.ts` is typed as `Messages`, so keys can't drift) | `messages(locale)`, `format()`, `pluralize()` in `~/lib/i18n.ts` |
| `content/chat/suggestions.json` | starter questions (hero examples, chat preview, widget) | imported directly |
| `design/assets/diagrams/diagrams.json` (copied to `src/assets/diagrams/`) | diagram titles, captions, callouts, text descriptions (EN + AR) | `~/lib/diagrams.ts` |

`~/lib/i18n.ts` also formats dates (`Sep 2024`, `سبتمبر 2024`, Western digits), periods ("Mar – Nov 2022",
"2023 – 2027 (expected)"), inclusive month counts ("1 yr 9 mos") and lists. In Arabic, numbers, year ranges, emails,
phone numbers and URLs are wrapped in `<Ltr>` (`<bdi dir="ltr">`).

When you change content, run the content checks from the repo root:
`site/node_modules/.bin/tsc --noEmit -p content/tsconfig.json && site/node_modules/.bin/tsx content/scripts/check-content.mjs`.
`npm test` also checks i18n parity: every key exists in both languages with the same `{placeholders}`.

## Structure

```
site/
├── astro.config.mjs        outDir ../dist, i18n (en default, ar under /ar/), Fonts API, CSP, sitemap, aliases
├── integrations/
│   └── csp-hashes.mjs      completes each page's CSP <meta> with its inline script/style hashes; fails on style=""
├── public/                 _headers, favicons + manifest, logo marks, mohamed-hatem.jpg (JSON-LD image)
│   ├── og/                 (generated) sharing images per page and language
│   └── cv/                 (generated) Mohamed-Hatem-CV.pdf, Mohamed-Hatem-CV-ar.pdf
├── scripts/
│   ├── og.mjs              renders OG PNGs from the design's templates (Playwright), skips unchanged inputs
│   ├── postbuild.mjs       runs postbuild/: relocate-404.mjs (ar/404.html), redirects.mjs (_redirects),
│   │                       early-hints.mjs (Link headers), cv-pdf.mjs (+ lib/pdf-text.mjs: page-break check)
│   ├── subset-fonts.mjs    builds src/assets/fonts from design/assets/fonts (see "Fonts")
│   ├── check-dist.mjs      static checks of the build (see "Tests")
│   ├── check-budgets.mjs   performance budgets
│   ├── lighthouse.mjs      Lighthouse runner (serve + Brotli proxy like Cloudflare)
│   ├── serve.mjs           static server that behaves like Workers static assets (_redirects, html_handling, _headers)
│   ├── verify-csp.mjs      CSP check with the real third-party scripts
│   └── screenshots.mjs     visual review renders
├── src/
│   ├── pages/              thin routes: index, ar/index, work/[slug], ar/work/[slug], cv, privacy, 404 (+ ar/),
│   │                       robots.txt, llms.txt, llms-full.txt
│   ├── views/              one view per page type, shared by both locales (HomePage, CaseStudyPage, CvPage, …)
│   ├── layouts/            Base (site chrome) and Document (the CV: own toolbar); both use components/Head.astro
│   ├── components/
│   │   ├── Head.astro      meta, canonical + hreflang, fonts + preloads, OG/Twitter, JSON-LD, analytics beacon
│   │   ├── nav/ Footer     nav + mobile menu sheet, footer
│   │   ├── home/           the home sections (Hero + hero/, Capabilities, SelectedWork, ExperienceTrace, About,
│   │   │                   OpenSource, AssistantSection, Skills, Education, Contact + contact/)
│   │   ├── work/           CaseCard, ArchThumb, DateRun
│   │   ├── case/           case-study template parts (hero, figure, component view, screens gallery, TOC, next
│   │   │                   case, CTA…)
│   │   ├── cv/ notfound/   CV sheet + toolbar, 404 art
│   │   ├── hero-graph/     the live agent graph (from design/assets/hero-graph: SSR render + runtime module)
│   │   ├── chat/ChatMount  thin wrapper around ../chat-widget (see "Chat widget")
│   │   └── ui/             Icon (inline from the design's sprite), LogoTile, Ltr, SectionHeader, Emph (bold receipts),
│   │                       MotionToggle (the charts' pause button)
│   ├── lib/                pure helpers (unit-tested): i18n, site, trace, skills-matrix, contact-form, case,
│   │                       home-work, diagrams, jsonld, icons, env
│   ├── scripts/            site.ts (theme, menu, scroll-spy, reveal, copy, Cairo clock, "/" and data-open-chat),
│   │                       chat.ts (mounts the widget), motion.ts + motion-pref.ts (the living charts, see "Motion")
│   ├── styles/             global.css (Tailwind + tokens + layers), base/components (ported from
│   │                       design/prototypes/proto.css), diagram.css, site.css (CSP-safe additions), page CSS
│   └── assets/             fonts (subset), photo, logo tiles and brand logos (design/assets/logos), showcase
│                           screenshots, product screens (screens/<slug>/), diagrams, icon sprite
└── tests/
    ├── unit/               Vitest
    └── e2e/                Playwright
```

## Theme

Dark is the default for every visitor, whatever the OS setting; light is the visitor's choice, kept in
`localStorage["mh-theme"]` ("light" or "dark").
- `src/styles/tokens*.css` (generated by `design/scripts/build-tokens.mjs`) put the dark values on
  `:root:not([data-theme="light"])`: the page is dark before any script runs, and without JS.
- The head boot script (`Head.astro`, `is:inline`, hashed into the CSP by the build) sets `html[data-theme]` before
  first paint and, for a visitor who chose light, switches `<meta name="theme-color">` (its `data-light`: each page's
  own colour) and `<meta name="color-scheme">` to light. The metas default to dark, so the browser's first frame and
  its chrome are dark.
- `site.ts`: the nav toggle flips dark ↔ light ("Theme: Dark" / "Theme: Light"); the menu's segmented control has
  Light and Dark. Both store the choice; another tab follows through the `storage` event.
- The CV sheet stays paper-white on the dark page; printing and the CV PDFs are unchanged (white, light theme).

## Motion: the living charts

`src/scripts/motion.ts` (imported by the components that have charts) runs the architecture diagrams (work cards,
the What I build feature, case-study figures, the next-case card), the experience trace and the skills matrix:
- **Diagrams** (`[data-motion]` around an inlined `svg.dg`): one request per loop travels the diagram's main path as a
  comet, each node it reaches lights up, packets drift along async edges, the orchestrator's ring breathes (grammar in
  `diagram.css`, from `design/scripts/diagrams/lib.mjs`). The comets and packets are Web Animations built from the
  drawing's own pulse tracks; the landings and the ring are CSS. The motion values (`--L`, `--i`, `--at`, `--k`) can't
  be style attributes under the hash-only CSP: `lib/diagrams.ts` turns them into `data-vars`, which the runtime applies
  through the CSSOM.
- **Trace** (`.trace`): bars grow in once; the current role's bar ends in a "now" dot that pings. **Matrix**: the dots
  pop in once. One-time entrances (`[data-motion-once]`) are only held back when the chart is below the fold at load.
- **When:** only while on screen (IntersectionObserver), the tab is visible, motion is allowed and the visitor hasn't
  paused; a figure animates only the drawing that shows (wide or compact). Only `transform` and `opacity` animate, on
  the compositor: measured with `Performance.getMetrics`, a chart on screen costs about as much main-thread time as a
  still page (0.03–0.17 %).
- **Pause (WCAG 2.2.2):** every loop has a visible pause button (`MotionToggle.astro`, styled like the hero graph's).
  The hero graph's button and all of them share one choice (`motion-pref.ts`, `localStorage["hero-graph:paused"]`):
  pausing anywhere shows the still drawings everywhere, and it persists.
- **prefers-reduced-motion:** nothing runs, no buttons; the charts are exactly the static drawings.

## Company logos

- "Shipped at" (`components/home/LogoRow.astro`): official logos in their real colours from `src/assets/logos/brand/`
  (copied from `design/assets/logos/brand/`, built by `design/scripts/brand/brand-logos.mjs`; sources and every change in
  `design/assets/logos/SOURCES.md`). One file per theme; the other is display:none and lazy, so it never downloads.
  Sizes come from `brand.json` (optically balanced).
- Work cards and the next-case card show the company's tile (`LogoTile`) beside the eyebrow: the employer's (Wakeb Data
  for the government assistant), Logic Controls for the freelance site.

## Adding a case study

1. Add it to `content/profile.ts`: extend the `CaseStudySlug` union and add the entry to `caseStudies` (both
   languages, `source`, `order`, `featured`, `depth: "full" | "brief"`, architecture nodes and edges, figures, stack).
   Run the content checks: `shortTitle` ≤ 40 characters, `summary` ≤ 155 (it is the meta description).
2. That's enough for a page in both languages: `/work/<slug>/` and `/ar/work/<slug>/` are generated, with a component
   view of the architecture from `profile.ts`, the home-page card, the OG images, JSON-LD, the sitemap and llms.txt.
3. Optional:
   - **Product screens** (only with the client's approval): put the cleaned captures in `src/assets/screens/<slug>/`
     and list them in the case study's `screens` (see below); add `client` to name the client in JSON-LD.
   - **Designed diagram:** add its SVGs (wide, compact, thumb) and its `diagrams.json` entry under
     `src/assets/diagrams/`, then map the slug in `CASE_DIAGRAMS` (`src/lib/diagrams.ts`).
   - **Card accent:** `CASE_ACCENT` in `src/lib/home-work.ts`.
4. Add the slug to `tests/e2e/pages.ts`. A unit test fails until you do.

## Product screens (the STA case study)

`components/case/ScreenGallery.astro` (styles: `src/styles/screens.css`) shows a case study's `screens` in their own
section between Approach and Architecture, grouped by product: desktop screens in a browser-like frame (no address bar:
the hosts aren't public), the phone screen in the home showcase's phone bezel, a cropped dialog on its own stage. From
48rem the grid has a wide and a narrow column (2 : 1): a group's first desktop screen spans both when it has three or
more, and phone or dialog captures sit beside the rest (`screenGroups()` in `lib/case.ts`).
- **Images:** `<Image>` in WebP (quality 88: the text in the screens stays sharp), `loading="lazy"`, `srcset` up to the
  capture's own width and `sizes` per slot (measured: the lead ≈ 56rem, the wide column ≈ 36rem from 80rem). The 2x
  desktop captures (1500–1600 px) offer 480/640/960/1280/native; the 1x
  captures (the phone screen, 390 px; the dialog, 448 px) offer only their native width and are never shown wider.
- **Enlarge:** each screen links to its full-size file (works without JS). With JS the link opens a modal `<dialog>`:
  on phones at the screen's natural size (a 2x capture at half its pixels) to pan and pinch-zoom; from 48rem as large
  as the window allows, never beyond the capture's pixels. Escape, the close button or the backdrop closes it, focus
  returns to the screen, and the chat launcher steps away while it is open.
- **Captions** come from `profile.ts` (EN/AR) and say what a screen shows, never how it was captured; the section
  says "Screens from the apps, with personal data removed" (`m.work.page.screensCredit`).

## Security

- **CSP**, hash-only, with no `'unsafe-inline'` for scripts or styles:
  - `astro.config.mjs` (`security.csp`) puts a `<meta>` policy on every page. `integrations/csp-hashes.mjs` then
    rewrites its `script-src` / `style-src` with the SHA-256 of exactly the inline `<script>` and `<style>` elements
    on that page, and moves it right after `<meta charset>`.
  - The build fails if any element has a `style="…"` attribute. Per-element values use classes; the trace bars use
    digit classes, see `src/lib/trace.ts`.
  - Allowed origins, each only where needed: `script-src` self, `challenges.cloudflare.com` (Turnstile) and
    `static.cloudflareinsights.com` (the analytics beacon); `frame-src` `challenges.cloudflare.com`; `connect-src` self
    and `cloudflareinsights.com` (the beacon's reports); `worker-src` self (no `blob:`); no `child-src` (frame-src and
    worker-src cover it). `tests/e2e/csp.spec.ts` fails on any `securitypolicyviolation` in Chromium and WebKit, with
    the chat panel open and after scrolling every page; `scripts/verify-csp.mjs` runs the same check with the real
    Turnstile (test key, solved) and beacon scripts.
- **Redirects (`postbuild/redirects.mjs` → `dist/_redirects`):** permanent 301s for every page's slash-less URL and
  its `index.html` form, and `/work/`, `/ar/work/` → the home page's `#work` section. Workers static assets apply
  `_redirects` before `html_handling` (whose own redirects are 307s) and before asset lookup; matching is exact, so
  `/cv/` never matches `/cv` (no loop), and the query string is kept. Generated from the built pages, so new pages are
  covered; `check-dist.mjs` and `tests/e2e/seo.spec.ts` check them, and `scripts/serve.mjs` applies them locally.
- **Early hints (`postbuild/early-hints.mjs`):** each page's stylesheets and preloaded fonts as a `Link` header in
  `dist/_headers`, so Cloudflare can send a 103 Early Hints response when the zone's (free) Early Hints setting is on.
- **`public/_headers`:**
  - A header CSP with `frame-ancestors 'none'`, `object-src`, `base-uri` and `form-action`. Script and style rules
    stay in the per-page meta, so the header can't weaken them.
  - HSTS, Referrer-Policy, Permissions-Policy, `nosniff`, `X-Frame-Options: DENY` and COOP.
  - Immutable caching for `/_astro/*`.
  - `Content-Type: text/plain; charset=utf-8` for `robots.txt`, `llms.txt` and `llms-full.txt` (Workers send `.txt`
    without a charset; one rule each, so the value replaces the default).
- **Secrets:** the analytics token (public by design) is read from `../.env` at build time. Only that one key is read
  (`src/lib/env.ts`). `scripts/check-dist.mjs` fails if anything secret-looking ends up in `../dist`.
- **Turnstile site key:** `0x4AAAAAAFSgKXNi27pxPG5n` in production builds, and Cloudflare's test key in `astro dev`.
  `PUBLIC_TURNSTILE_SITE_KEY` overrides both.

## Chat widget

`src/components/chat/ChatMount.astro` mounts `../chat-widget/src/index.ts`. It loads a 2.6 KB loader up front; the
panel arrives on the first interaction and isn't counted in the JS budget.

- **Config:** Turnstile key, avatar (built by `astro:assets`) and contact details from `profile.ts`. They are passed
  through data attributes, so there is no inline script.
- **Opening it:** any `[data-open-chat]` element (with an optional `data-question`), the hero input, and the `/` key
  all call `window.MHChat.open({ question })`. Calls made before the loader is ready are queued.
- **No JavaScript:** a `<noscript>` card offers email and WhatsApp instead.
- **Avatar launcher (`src/scripts/chat-avatar.ts`):** once the page has loaded and the browser is idle, `chat.ts`
  imports it and it dresses the widget's launcher through `window.MHChat.launcher` (the widget README's "Launcher
  hook"): Hatem's illustrated avatar (`design/assets/avatar/mh-avatar.svg`, imported `?raw`) on a deep ink disc with a
  teal rim, named "Ask Hatem's AI assistant", and a comic greeting that pops out of it behind two balls ("Hi, I'm
  Hatem! 👋 Ask my AI assistant about my work.", copy in `content/i18n` → `chat.avatar`), which is the launcher's
  description. The panel header uses the same avatar (`avatar` option) and its mouth talks while an answer streams.
  - Until it is in, `[data-mh-chat]:not([data-art])` keeps the launcher hidden (site.css), so the default launcher
    never shows and then changes shape; `data-art="off"` (the module failed to load) shows the default one.
  - Motion: three short bursts (first appearance, then a wave 13 s and 26 s later), each over within 5 s
    (WCAG 2.2.2), then only on hover / keyboard focus; none with reduced motion (a still avatar and bubble).
  - The greeting shows 2.6 s after the launcher first appears (on phones, once the hero has scrolled past), at most
    twice per session; its × hides it for the session (`sessionStorage` `mh-chat:greet`), so does opening the chat;
    Escape hides it; it stays while hovered or focused; it hides when page focus lands under it.
  - `site.ts` sets `data-hush` on the host while the greeting would cover a `[data-chat-avoid]` element (the greeting
    hides, the launcher may stay), alongside `data-dodge` for the launcher itself.
  - The disc: `data-av-disc` in ChatMount.astro (`dark`, the default, or `teal`), or `--mh-av-disc`, `--mh-av-rim`,
    `--mh-av-glow`, `--mh-av-glow-o` on `[data-mh-chat]`.
- **Build step:** `npm run content:gen` (part of `dev`, `build` and `check`) runs `../worker/scripts/gen-content.mjs`,
  which writes the widget's generated strings and suggestions.

## Fonts

All fonts are self-hosted through Astro's Fonts API (metric-matched Latin fallbacks). `scripts/subset-fonts.mjs` cuts
`design/assets/fonts` down to what the site renders:

| Face | Cut to | Size |
|---|---|---|
| Space Grotesk | weights 500–700 | 19 KB |
| Inter | weights 400–700 | 30 KB |
| JetBrains Mono | weights 400–700 | 23 KB |
| Plex Arabic 400/600/700 | Arabic-language block | 17.5 KB each |
| "MH Arabic Label" | the few Arabic words English pages show | 7 KB |

Before the cut these were 22, 47, 31 and 34 KB.

The same script writes static single-weight instances of the three Latin faces to `src/assets/fonts/print/`, for the
CV PDF only (nothing on the site imports them). `postbuild/cv-pdf.mjs` swaps them in just before printing: Chromium
embeds variable fonts in a PDF as Type 3 fonts, which split words in copied text and break search in Preview, Quick
Look and some ATS parsers; static ones embed as TrueType (and the PDFs dropped from 397 / 353 KB to 110 / 155 KB). The
build fails if a Type 3 font is left. The CV sheet also avoids positioned elements (they are written to the PDF's text
stream last, which separated bullets from their roles in extracted text). Its logo tiles are 64 px JPEGs (about 4 mm
on paper, about 400 dpi; the tile's rounded corners come from CSS): Chromium embeds a JPEG as it is, so the twelve
tiles add about 20 KB to each PDF, where PNGs were re-compressed to about 50 KB.

Preloads:
- **English pages:** Space Grotesk (the H1 face).
- **Arabic pages:** the three Plex Arabic weights. Preloading only 700 let 400/600 swap in late: the lede is the LCP
  element on phones, and the page shifted.
- **Arabic case-study pages:** Space Grotesk and Inter as well. Latin names in the H1 and summary otherwise re-wrapped
  when the fonts swapped in.

## Budgets (`scripts/check-budgets.mjs`, part of `npm test`)

- **JS:** ≤ 60 KB gzip loaded on first view of each page. The lazy chat panel and the launcher's avatar (loaded after
  `load`, 7.0 KB gzip; design target ≤ 12 KB) are excluded; the loader counts. Today: home 19.0 KB, case studies with a
  diagram 9.2 KB (9.7 KB with the screens gallery), other pages 6.3–7.1 KB, hero graph 7.0 KB.
- **CSS:** ≤ 40 KB gzip per page. Today: 19.8–26.1 KB.
- **Fonts:** self-hosted woff2 only, with exactly the preloads listed under "Fonts".
- **Images:** any high-priority image must be preloaded. The LCP element is text (the H1, or the lede on Arabic
  phones), so there are none today.

Lighthouse (`npm run lighthouse`; mobile = simulated slow 4G, desktop preset):

| Page | Mobile | Desktop |
|---|---|---|
| Home, English | 98 | 100 |
| Home, Arabic | 97 | 100 |
| Saudi Tourism Authority case study (screens gallery), English / Arabic | 99 / 98 | 100 |
| ArabsStock case study, English / Arabic | 99 / 98 | 100 |
| AIP semantic search (a brief case study) | 99 | 100 |
| CV, English / Arabic (logos, round 4) | 99 / 98 | 100 |

Accessibility, best practices and SEO are 100 on every run (measured 2026-10-10, after the design review fixes, again after the avatar launcher, and again with dark as the default theme, the living charts and the brand-colour logos: the same scores; again with the STA case study and the CV's logos).
CLS ≤ 0.001, TBT ≤ 30 ms (home, mobile; 0 ms elsewhere), and mobile LCP is 1.8–2.3 s.

The runner blocks the Cloudflare analytics beacon (`--with-analytics` keeps it). From localhost, CORS refuses the
beacon's report, which logs a console error the live site doesn't have.

## Tests

**Unit (`npm run test:unit`, Vitest):**
- **Postbuild:** the `_redirects` rules (every page, the /work/ parents, no loops), the early-hints `Link` header,
  and the page dates.
- **i18n:** parity, placeholders, digits, and the date and duration helpers.
- **Trace geometry:** checked against the prototype's numbers.
- **Diagram motion values:** every pulse carries its length and hop, every lit node its arrival (`data-vars`).
- **Brand logos:** the six employers in order, a file per theme that exists, equal visual area within 25 %, every file
  documented in `design/assets/logos/SOURCES.md`.
- **CV data:** no projects list; a logo tile for every role and degree; a client named only on the Wakeb Data role,
  never in a bullet or case study; the CV's "Open to" (three roles, team lead first, three arrangements); the Globant
  lines keep the STA wording and the approved facts only.
- **Skills matrix:** every dot must have a receipt in `profile.ts`, in the right column.
- **Contact form:** validation, which must match the Worker's limits and email regex.
- **Case studies, JSON-LD and diagrams:** case-study helpers; JSON-LD content, including the honesty checks (the
  unnamed client, the M.Sc. status); diagram inlining.
- **CSP integration.**
- **Bold receipts:** `emphasize()`, and every `Fact.strong` / `cv.summaryStrong` phrase occurs in its text in both
  languages, on word boundaries (a phrase starting inside an Arabic word would split it between two weights).
- **Home work layout:** the Saudi Tourism Authority assistants are the feature card, then three equal cards led by the
  14-agent assistant, then logic-controls.com as a wide card (a fifth card would sit alone); brief case studies sit in
  "More work".
- **Case studies:** the TOC lists Screens only where a case study has screens; the screens exist on disk, carry EN/AR
  alt text and captions, and keep their density (2x desktop, 1x phone and dialog); the gallery groups (lead across
  the grid, phone and dialog beside); the STA case study stays at the approved, light level (one agent, the one
  figure, no provider or infrastructure names, never "multi-agent", "in production" or "led the project").
- **JSON-LD:** a named client appears as `about.sponsor` only on the STA case study.
- **PDF page text:** `scripts/lib/pdf-text.mjs` (the CV build's page-break check).

**Static (`npm run test:static`):** run on `../dist` after a build.
- `check-dist.mjs`:
  - **Secrets:** `AIza…`, `TURNSTILE_SECRET`, `SESSION_SECRET` and the real `.env` values, compared by containment
    and never printed.
  - **Honesty:** the unnamed client (hashed check against `worker/src/chat/confidential-hashes.json`, the repository's one
    list) and "holds an M.Sc." wording.
  - **Redirects, headers, sitemap:** a 301 for every page's slash-less and `index.html` URL and for `/work/`; UTF-8
    text files; a `<lastmod>` on every sitemap URL.
  - **Structured data:** the Person and WebSite are identical on every page; a WebSite node wherever `#website` is
    referenced; Articles have full ISO `datePublished` / `dateModified`; `codeRepository` only on `SoftwareSourceCode`;
    each page's `og:image:alt` is its own.
  - **CSP:** the per-page policy contract, and no `style` attributes.
  - **Per page:** `lang`/`dir`, title, description, canonical and hreflang, the OG image exists, one H1, JSON-LD
    parses, and internal links and anchors resolve.
- `check-budgets.mjs`.
- **HTML validation:** `html-validate` with `.htmlvalidate.json`. Rules turned off and why:
  - `no-redundant-role`: `role="list"` is deliberate on unstyled lists, because WebKit/VoiceOver drops their
    semantics otherwise.
  - `unique-landmark`: the menu sheet's nav is hidden whenever the desktop nav shows.
  - Inline styles: already enforced, more strictly, by the CSP integration.

**End to end (`npm run test:e2e`, Playwright):** Chromium desktop, Pixel 7 and iPhone 15 (WebKit), against
`scripts/serve.mjs` on `../dist`. `E2E_SERVER=astro` uses `astro preview` instead, and `E2E_BASE_URL` points at a
running server such as `wrangler dev`.
- **Every page** in EN and AR returns 200, with correct `lang`/`dir`, one H1, canonical and hreflang, and no console
  errors. The 404 pages return 404 in the right language with `noindex`.
- **axe** reports 0 WCAG 2.2 AA violations on every page, EN and AR, in dark (the default: no stored choice) and in
  light. The mobile menu is also checked in both.
- **Layout and keyboard:**
  - No horizontal overflow at 320–1920 px.
  - The skip link is the first tab stop.
  - The trace works with ArrowUp/Down/Home/End and keeps one row open.
  - The hero graph is one tab stop, with arrow keys and a text alternative.
- **Motion (`motion.spec.ts`):**
  - The hero graph is a still frame under reduced motion, and no transform animation runs.
  - Its pause button works, the choice persists, and it pauses the living charts too.
  - Diagrams move only while on screen, with transform and opacity only; scrolled away, nothing runs. A figure animates
    the drawing that shows, not its hidden twin. A hidden tab stops them.
  - One pause control: visible, named, keyboard operable; every chart's button agrees; the choice persists.
  - The trace grows in once and pings "now". Reduced motion: still drawings, no pause buttons, no chart animation.
- **Logos (`logos.spec.ts`):** "Shipped at" shows the official logos for the page's theme (dark by default), named by
  alt text, loaded; one line on desktop, no overflow on phones; every work card has its company's tile (the employer's
  for client work).
- **Preferences:** the language switch keeps the page; a first visit is dark whatever the OS setting (and without
  JS), and an OS change doesn't override it; every click of the theme toggle changes what you see (dark → light →
  dark), its label names the theme, and the choice persists across pages with each page's chrome colour; a visitor who
  chose light gets light before first paint; the mobile menu closes on Escape and returns focus.
- **CV:** `/cv/` and `/ar/cv/` print to ≤ 2 A4 pages, the generated PDFs are served with title, author, subject,
  keywords and language, the Arabic CV links to `/ar/`, its degree years read in the same order on every row, and print
  hides the site chrome; the bold receipts are there in both languages, "Open to" starts with the team-lead role and
  lists the CV's three roles in order, then its three work arrangements, one per line; there is no "Selected projects"
  section; every role (main and earlier) has its logo tile, loaded, decorative (`alt=""`), square, not positioned,
  centred on the role's line and on its inline-start side (right in Arabic); the Wakeb Data role's client line
  ("Client: Saudi Ministry of Defense (GADD)" / «العميل: …») sits between the role head and the bullets, never in
  a bullet; each main role with a featured case study links it ("Case study", the CV's language: the STA case study
  on the Globant role) in the page and as a link in both PDFs; names ("Umm Al-Qura University", "Learning –
  Specialty") never break inside; and both PDFs are exactly two
  pages, contain the client line and no "Selected projects", keep every role head intact (a logo adds no text), read
  head → client → first bullet in order (English), and keep every sidebar heading on a page with its first entry and
  Education on one page (read from the PDFs' text, `scripts/lib/pdf-text.mjs`).
- **Contact form** (API mocked, Turnstile stubbed):
  - Client-side validation, with errors linked to their fields and focus on the error summary.
  - The Worker contract: subject mapping, `mh_hp` honeypot, language, token.
  - The success state with its reference.
  - The 429, 502 and offline messages, and the Arabic messages.
  - A non-JSON 429 or 5xx (Cloudflare answering instead of the Worker, e.g. once the daily request limit is reached)
    shows "the form isn't available" with email and WhatsApp links, never "wait a minute".
  - The error summary is an alert named by its heading.
- **Ask my AI:**
  - The hero input opens the widget with the question.
  - `data-open-chat` buttons, the `/` key, and the case-study "ask about this project" button all open it.
  - The no-JS fallback is present.
  - The page sets `--mh-chat-top` from the sticky header's height (the panel's top edge sits below it).
  - Neither the floating launcher nor its greeting ever covers a `[data-chat-avoid]` CTA: the contact form's Send
    button (1280, where the launcher steps aside, and 1440), a case study's "Ask my AI about this project" rail button
    (1440 × 900, EN and AR), the hero ask bar's send button on phones. On phones it waits until the hero's ask bar has
    scrolled past, and the header's "Ask AI" still opens the chat with the composer focused.
- **Avatar launcher (`chat-avatar.spec.ts`):** a real button named "Ask Hatem's AI assistant" (EN and AR) and described
  by the greeting, on the dark disc; it opens the panel and the header shows the avatar; the greeting shows a few
  seconds after load and its × hides it for the session (also after a reload); keyboard focus shows it, Escape hides
  it, its × returns focus to the launcher; reduced motion: nothing runs and every word shows; motion on first
  appearance (float, the mouth talking) is over within 5 s, and hover waves again; RTL: bottom-left, mirrored, the
  greeting on the page side; the greeting steps aside (`data-hush`) from the contact Send and the case-study ask
  buttons; on phones nothing greets (or is counted) until the hero has scrolled past; the header's mouth talks while
  an answer streams and stops after; forced colors keep the launcher's edge and the drawing's colours; axe with the
  greeting showing (EN/AR × light/dark × 1440/390/320).
- **Contact form at 320–375 px:** with a Turnstile stub that has Turnstile's real sizes, the widget is compact below a
  300 px slot, the form stays inside its card and the page never scrolls sideways; wide screens keep "flexible".
- **Case studies (`case.spec.ts`):** brief pages are labelled, compact (note card beside the text, no facts strip, a
  figure only with more than three parts); full pages show 2–4 facts that never stretch, ArabsStock's four with the unit
  set small, and bold lead-ins on every figure note; home: brief work in "More work", `/#craft` on the logic-controls.com
  card, and the cards in a row line up.
- **Skills on phones (`skills.spec.ts`):** below 40rem a list with exactly the table's receipts and no sideways scroll;
  the toolbox behind "Show all N tools" (open without JS); desktop keeps the table.
- **The STA case study (`sta.spec.ts`):** EN and AR: the title, the one approved figure, every section, no
  "multi-agent" / "in production" wording; the gallery's two product groups, every screen's alt text, caption, lazy
  loading and `srcset`, and every image loaded; 1x captures never wider than captured and no overflow at 1440, 390 and
  320; on desktop the phone beside the stacked screens and the dialog beside the staff screen; the enlarge dialog
  (named by its caption, focus on Close, larger than the page shows it and never beyond the capture's pixels; natural
  size on phones; Escape and Close close it, focus returns); without JS the links serve the WebP; axe with the gallery
  and with the dialog open (dark and light × 1440, 390 and 320); the Article JSON-LD (headline, language, Globant as
  producer, the authority as sponsor, its OG image); home: the feature card with the Globant tile and ArabsStock first
  in the grid, the trace's Globant role linking the case study, About naming the authority.
- **SEO (`seo.spec.ts`):** the 301 redirects and their targets (the brief case studies kept their URLs), every case study
  200 at its URL in both languages and in the sitemap, UTF-8 text files, sitemap `<lastmod>`, the home H1
  (name and role, then the tagline), per-page `og:image:alt`, `article:*` dates on case studies.
- **CSP (`csp.spec.ts`):** see "Security".
- **Accessibility details (`a11y-details.spec.ts`):** axe at 320 px (every page light, key pages dark); the home link's
  name below 360 px; user text spacing (WCAG 1.4.12) clips nothing in the work cards or the trace at 1440, 390 and
  320; focus outlines under forced colors; each role in the trace is an h3; the skills table is a focusable region
  only while it scrolls (between 40rem and its 46rem width; phones get the list); the mobile menu's language and theme controls sit in the nav landmark and the sheet closes
  when focus leaves it; Latin and number runs keep their order on Arabic pages.

One WebKit quirk is filtered in `tests/e2e/fixtures.ts` and `csp.spec.ts`. WebKit logs a CSP message (and fires a
`style-src-attr` violation with no source file) for every `<select>` under a hash-only `style-src`: it checks its own
user-agent styles against the page policy. A bare `<select>` added to a page without one reproduces it; the select
renders and works, and the styles aren't ours.
