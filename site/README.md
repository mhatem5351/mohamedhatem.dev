# site/: mohamedhatem.dev (Astro)

The static website: English at `/`, Arabic (RTL) at `/ar/`. It is built with Astro 7, TypeScript (strict) and
Tailwind CSS 4. The build goes to `../dist`, and the Cloudflare Worker in `../worker` serves it as static assets;
`/api/*` (the chat and the contact form) runs the Worker.

This folder has its own `package.json` and `node_modules`. Run every command below **inside `site/`**.

```bash
cd site
npm install
npm run dev          # http://localhost:4321 (Turnstile test key; no CSP in dev)
npm run build        # content:gen → OG images → astro build → ../dist → 404 relocation → CV PDFs
npm run serve        # serve ../dist like Workers static assets (404 pages, _headers) on :4321
npm test             # unit tests + static checks of ../dist (secrets, CSP, links, budgets, HTML validity)
npm run test:e2e     # Playwright: Chromium desktop, Pixel 7, iPhone 15 (WebKit) against ../dist
npm run lighthouse   # Lighthouse mobile + desktop on key pages → lighthouse/
npm run screenshots  # every page × 1440/768/390 × light/dark → screenshots/ (needs `npm run serve -- --port 4380`)
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
│   ├── postbuild.mjs       runs postbuild/relocate-404.mjs (ar/404.html) then postbuild/cv-pdf.mjs
│   ├── subset-fonts.mjs    builds src/assets/fonts from design/assets/fonts (see "Fonts")
│   ├── check-dist.mjs      static checks of the build (see "Tests")
│   ├── check-budgets.mjs   performance budgets
│   ├── lighthouse.mjs      Lighthouse runner (serve + Brotli proxy like Cloudflare)
│   ├── serve.mjs           static server that behaves like Workers static assets
│   └── screenshots.mjs     visual review renders
├── src/
│   ├── pages/              thin routes: index, ar/index, work/[slug], ar/work/[slug], cv, privacy, 404 (+ ar/),
│   │                       robots.txt, llms.txt, llms-full.txt
│   ├── views/              one view per page type, shared by both locales (HomePage, CaseStudyPage, CvPage, …)
│   ├── layouts/            Base (site chrome) and Document (the CV: own toolbar); both use components/Head.astro
│   ├── components/
│   │   ├── Head.astro      meta, canonical + hreflang, fonts + preloads, OG/Twitter, JSON-LD, analytics beacon
│   │   ├── nav/ Footer     nav + mobile menu sheet, footer
│   │   ├── home/           the home sections (Hero + hero/, Capabilities, SelectedWork, ExperienceTrace,
│   │   │                   OpenSource, AssistantSection, Showcase, Skills, Education, About, Contact + contact/)
│   │   ├── work/           CaseCard, ArchThumb, DateRun
│   │   ├── case/           case-study template parts (hero, figure, component view, TOC, next case, CTA…)
│   │   ├── cv/ notfound/   CV sheet + toolbar, 404 art
│   │   ├── hero-graph/     the live agent graph (from design/assets/hero-graph: SSR render + runtime module)
│   │   ├── chat/ChatMount  thin wrapper around ../chat-widget (see "Chat widget")
│   │   └── ui/             Icon (inline from the design's sprite), LogoTile, Ltr, SectionHeader
│   ├── lib/                pure helpers (unit-tested): i18n, site, trace, skills-matrix, contact-form, case,
│   │                       home-work, diagrams, jsonld, icons, env
│   ├── scripts/            site.ts (theme, menu, scroll-spy, reveal, copy, Cairo clock, "/" and data-open-chat),
│   │                       chat.ts (mounts the widget)
│   ├── styles/             global.css (Tailwind + tokens + layers), base/components (ported from
│   │                       design/prototypes/proto.css), diagram.css, site.css (CSP-safe additions), page CSS
│   └── assets/             fonts (subset), photo, logo tiles, showcase screenshots, diagrams, icon sprite
└── tests/
    ├── unit/               Vitest
    └── e2e/                Playwright
```

## Adding a case study

1. Add it to `content/profile.ts`: extend the `CaseStudySlug` union and add the entry to `caseStudies` (both
   languages, `source`, `order`, `featured`, `depth: "full" | "brief"`, architecture nodes and edges, figures, stack).
   Run the content checks: `shortTitle` ≤ 40 characters, `summary` ≤ 155 (it is the meta description).
2. That's enough for a page in both languages: `/work/<slug>/` and `/ar/work/<slug>/` are generated, with a component
   view of the architecture from `profile.ts`, the home-page card, the OG images, JSON-LD, the sitemap and llms.txt.
3. Optional:
   - **Designed diagram:** add its SVGs (wide, compact, thumb) and its `diagrams.json` entry under
     `src/assets/diagrams/`, then map the slug in `CASE_DIAGRAMS` (`src/lib/diagrams.ts`).
   - **Card accent:** `CASE_ACCENT` in `src/lib/home-work.ts`.
4. Add the slug to `tests/e2e/pages.ts`. A unit test fails until you do.

## Security

- **CSP**, hash-only, with no `'unsafe-inline'` for scripts or styles:
  - `astro.config.mjs` (`security.csp`) puts a `<meta>` policy on every page. `integrations/csp-hashes.mjs` then
    rewrites its `script-src` / `style-src` with the SHA-256 of exactly the inline `<script>` and `<style>` elements
    on that page, and moves it right after `<meta charset>`.
  - The build fails if any element has a `style="…"` attribute. Per-element values use classes; the trace bars use
    digit classes, see `src/lib/trace.ts`.
  - Allowed origins: self, `challenges.cloudflare.com` (Turnstile: script and frame) and
    `static.cloudflareinsights.com` / `cloudflareinsights.com` (Web Analytics).
- **`public/_headers`:**
  - A header CSP with `frame-ancestors 'none'`, `object-src`, `base-uri` and `form-action`. Script and style rules
    stay in the per-page meta, so the header can't weaken them.
  - HSTS, Referrer-Policy, Permissions-Policy, `nosniff`, `X-Frame-Options: DENY` and COOP.
  - Immutable caching for `/_astro/*`.
- **Secrets:** the analytics token (public by design) is read from `../.env` at build time. Only that one key is read
  (`src/lib/env.ts`). `scripts/check-dist.mjs` fails if anything secret-looking ends up in `../dist`.
- **Turnstile site key:** `0x4AAAAAAFSgKXNi27pxPG5n` in production builds, and Cloudflare's test key in `astro dev`.
  `PUBLIC_TURNSTILE_SITE_KEY` overrides both.

## Chat widget

`src/components/chat/ChatMount.astro` mounts `../chat-widget/src/index.ts`. It loads a 2.4 KB loader up front; the
panel arrives on the first interaction and isn't counted in the JS budget.

- **Config:** Turnstile key, avatar (built by `astro:assets`) and contact details from `profile.ts`. They are passed
  through data attributes, so there is no inline script.
- **Opening it:** any `[data-open-chat]` element (with an optional `data-question`), the hero input, and the `/` key
  all call `window.MHChat.open({ question })`. Calls made before the loader is ready are queued.
- **No JavaScript:** a `<noscript>` card offers email and WhatsApp instead.
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

Preloads:
- **English pages:** Space Grotesk (the H1 face).
- **Arabic pages:** the three Plex Arabic weights. Preloading only 700 let 400/600 swap in late: the lede is the LCP
  element on phones, and the page shifted.
- **Arabic case-study pages:** Space Grotesk and Inter as well. Latin names in the H1 and summary otherwise re-wrapped
  when the fonts swapped in.

## Budgets (`scripts/check-budgets.mjs`, part of `npm test`)

- **JS:** ≤ 60 KB gzip loaded on first view of each page. The lazy chat panel is excluded; the loader counts.
  Today: home 15.5 KB, other pages 5–6 KB, hero graph 6.8 KB.
- **CSS:** ≤ 40 KB gzip per page. Today: 18–24 KB.
- **Fonts:** self-hosted woff2 only, with exactly the preloads listed under "Fonts".
- **Images:** any high-priority image must be preloaded. The LCP element is text (the H1, or the lede on Arabic
  phones), so there are none today.

Lighthouse (`npm run lighthouse`; mobile = simulated slow 4G, desktop preset):

| Page | Mobile | Desktop |
|---|---|---|
| Home, English | 98 | 100 |
| Home, Arabic | 97 | 100 |
| ArabsStock case study, EN and AR | 99 | 100 |
| CV, EN and AR | 99 | 100 |

Accessibility, best practices and SEO are 100 on every run. CLS ≤ 0.008, TBT is 0 ms, and mobile LCP is 1.8–2.3 s.

The runner blocks the Cloudflare analytics beacon (`--with-analytics` keeps it). From localhost, CORS refuses the
beacon's report, which logs a console error the live site doesn't have.

## Tests

**Unit (`npm run test:unit`, Vitest):**
- **i18n:** parity, placeholders, digits, and the date and duration helpers.
- **Trace geometry:** checked against the prototype's numbers.
- **Skills matrix:** every dot must have a receipt in `profile.ts`, in the right column.
- **Contact form:** validation, which must match the Worker's limits and email regex.
- **Case studies, JSON-LD and diagrams:** case-study helpers; JSON-LD content, including the honesty checks (the
  unnamed client, the M.Sc. status); diagram inlining.
- **CSP integration.**

**Static (`npm run test:static`):** run on `../dist` after a build.
- `check-dist.mjs`:
  - **Secrets:** `AIza…`, `TURNSTILE_SECRET`, `SESSION_SECRET` and the real `.env` values, compared by containment
    and never printed.
  - **Honesty:** the unnamed client (hashed check) and "holds an M.Sc." wording.
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
- **axe** reports 0 WCAG 2.2 AA violations on every page in the light theme, and on key pages in dark too. The mobile
  menu is also checked.
- **Layout and keyboard:**
  - No horizontal overflow at 320–1920 px.
  - The skip link is the first tab stop.
  - The trace works with ArrowUp/Down/Home/End and keeps one row open.
  - The hero graph is one tab stop, with arrow keys and a text alternative.
- **Motion:**
  - The hero graph is a still frame under reduced motion, and no transform animation runs.
  - Its pause button works and the choice persists.
- **Preferences:** the language switch keeps the page; the theme cycles system → light → dark and persists across
  pages; the mobile menu closes on Escape and returns focus.
- **CV:** `/cv/` and `/ar/cv/` print to ≤ 2 A4 pages, the generated PDFs are served, and print hides the site chrome.
- **Contact form** (API mocked, Turnstile stubbed):
  - Client-side validation, with errors linked to their fields and focus on the error summary.
  - The Worker contract: subject mapping, `mh_hp` honeypot, language, token.
  - The success state with its reference.
  - The 429, 502 and offline messages, and the Arabic messages.
- **Ask my AI:**
  - The hero input opens the widget with the question.
  - `data-open-chat` buttons, the `/` key, and the case-study "ask about this project" button all open it.
  - The no-JS fallback is present.

One WebKit quirk is filtered in `tests/e2e/fixtures.ts`. WebKit logs a CSP message for every `<select>` under a
hash-only `style-src`: it checks its own user-agent stylesheet against the page policy. The select renders and works;
the stylesheet isn't ours.
