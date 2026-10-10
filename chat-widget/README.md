# Chat widget ("Ask my AI")

Framework-agnostic TypeScript + CSS-in-TS, no dependencies. The page pays for a ~2.5 KB gzip bubble; the panel
(~15.5 KB gzip) loads on the first hover, focus, touch or click of the bubble, or at once when it was open on the
previous page of the tab (budget: 18 KB gzip total, checked by `npm run widget:size`). Styles live in a shadow root
and read the design tokens (`design/tokens.css`) through CSS custom properties, so light/dark and the Arabic font
follow the page. Talks to `POST /api/chat` (contract: `worker/src/chat/protocol.ts`, `worker/README.md`).

## Public API (stable)

```ts
import { mountChat, openChat } from "<repo>/chat-widget/src/index";

mountChat(config?: ChatWidgetConfig): void          // idempotent: once per document (call again after a view transition)
openChat(options?: { question?: string; send?: boolean }): void

window.MHChat.open({ question?, send? })           // same as openChat, for inline scripts
window.MHChat.close()
document.dispatchEvent(new CustomEvent("mh:open-chat", { detail: { question } }))   // same, decoupled

document.addEventListener("mh:chat-state", (e) => e.detail.open)                    // the panel opened (true) or closed (false)
```

`open({ question })` opens the panel and sends the question at once (`send: false` only puts it in the input).
These work right after `mountChat`; the panel code is fetched on demand. `mh:chat-state` fires on `document` every
time the panel opens or closes (also when it reopens after a navigation), so the page can coordinate its own layers.

### CSS custom property

| Property | Default | Notes |
|---|---|---|
| `--mh-chat-top` | `4.75rem` | Lowest top edge of the desktop panel (its height is capped so it never starts above). On open and on resize the widget sets it on its host to the bottom of the page's header (`[data-nav]`, else `body > header`) + 0.75rem while that header is on screen; a page without one can set it on `:root` |

### `ChatWidgetConfig` (all optional; full TSDoc in `src/types.ts`)

| Option | Default | Notes |
|---|---|---|
| `apiBase` | `""` (same origin) | Origin of the Worker. Requests always send credentials, so a cross-origin Worker (local demo) gets the session cookie too |
| `lang` | from `<html lang>` (`ar…` → `ar`, else `en`) | UI language and panel direction (RTL for Arabic; the bubble moves to the left) |
| `turnstileSiteKey` | none (Turnstile off) | **Required in production**: the Worker answers 401 without a session or a token |
| `avatarSrc` | "MH" monogram | Square image ≥ 72 px |
| `contact` | Hatem's WhatsApp `201142070946`, `hatem@mohamedhatem.dev`, LinkedIn | Used by the contact card (never taken from the model). `email` / `altEmail` are also the only addresses answers may turn into `mailto:` links |
| `sections` | `#<id>` on the page, else `/#id` or `/ar/#id`, built-in EN/AR labels | Targets of "Go to …" links: `about`, `work`, `experience`, `projects`, `skills`, `education`, `contact` |
| `suggestions` | `content/chat/suggestions.json` (bundled at build time) | `{ en, ar }` arrays of strings or `{ label, prompt }`; first 4 on phones, up to 8 otherwise |
| `storageKey` | `"mh-chat"` | Prefix of the sessionStorage / localStorage keys |

UI strings the content agent owns (title, disclaimer, privacy notice, greeting, placeholder, button labels) come
from `content/i18n/{en,ar}.ts` → `chat` at build time; the rest are built in (`src/i18n.ts`, whose values for the
content-owned keys mirror the content copy).

## Build requirements

- Run `node worker/scripts/gen-content.mjs` before bundling: it writes `src/generated/suggestions.ts` and
  `src/generated/copy.ts` (gitignored) from `content/`.
- No Vite-specific imports: Vite/Astro can import `src/index.ts` directly (the panel becomes its own chunk);
  `npm run widget:build` bundles it with esbuild for the demo and the size check. The bundle keeps Arabic text as
  UTF-8 (as the site's Vite build does), so the size check measures what visitors download.
- CSP: `script-src` and `frame-src` must allow `https://challenges.cloudflare.com` (Turnstile, loaded only when a
  session is needed); `connect-src 'self'`. Styles use constructed stylesheets, so no `'unsafe-inline'` is needed.

## What it does

- Bubble: bottom-right (bottom-left in RTL), animated multi-agent glyph (static with reduced motion), "Ask my AI"
  label on the first visit, then icon-only; `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`.
- Panel on phones (below 640 px wide or 520 px tall): full-screen modal sheet (`aria-modal`, the page is inert,
  focus trap, scroll lock, safe-area insets); Escape closes and focus returns to the bubble.
- Panel on desktop: non-modal (`role="dialog"`), anchored above the bubble and below the site's sticky header
  (`--mh-chat-top`). Because the page stays usable around it, it gets out of the way: Escape closes it from anywhere
  (focus stays where it is when it was on the page; a page `<dialog>`, `[aria-modal]` layer or popover gets the
  Escape instead); focus that lands on a page element the panel hides (40% or more of its on-screen box) closes it
  and stays on that element (WCAG 2.4.11); an in-answer jump link ("Go to Contact", a `#section` link) closes it when
  the panel would hide the target's form controls or a large part of it, and moves focus to the target.
- Header with avatar, title, disclaimer, New chat, Close. Empty state: greeting, the privacy notice (messages go to
  Google's Gemini API, which may use them to improve its services on the free tier) and starter suggestions. A chip
  (starter or follow-up) keeps focus in the panel: on the textarea, or on the conversation after a tap in the sheet
  (no on-screen keyboard over the answer).
- Open state: kept in sessionStorage (`<storageKey>:open`) while the desktop panel is open, so the next page of the
  tab (a link from an answer, e.g. the CV) reopens it with the conversation, without moving focus or scrolling.
  Closing clears it; the phone sheet is never reopened (it would cover the new page); a link to a section of another
  page closes the panel first, so it doesn't reopen on top of that section.
- Long messages (a pasted job description): the latest message may be up to 6,000 characters (earlier ones are sent
  up to 1,200, answers up to 2,400, within the 32 KB body). There is no `maxlength`: past the limit an inline notice
  (`role="status"`) says only the first 6,000 characters will be read, and the counter in the composer (shown from
  5,500, never over the conversation) is flagged. On send the message is trimmed and says so under it, as it does
  when the Worker reports `meta.trimmed`; nothing is cut silently. While an answer streams, a very long question
  scrolls out of the way so the answer stays in view.
- Answers stream with a cursor, rendered by a tiny safe markdown renderer (DOM nodes only, no `innerHTML`). Links:
  http(s), mailto, tel, `#section` and paths that resolve to this site; backslashes, whitespace and control
  characters are refused (the URL parser would turn `/\host` or `/<tab>/host` into another site). Bare URLs are
  linked; bare email addresses only when they are the configured contact addresses. Latin terms and phone numbers
  inside Arabic are bidi-isolated (`+20 114 207 0946` stays left-to-right with its `+` first, also as a link label).
  Stop aborts the request.
- `replace` events (the Worker swapped the answer): the text and tool UIs so far are dropped and the replacement is
  shown live. An answer that ends with `blocked` or `safety` keeps only the refusal, on screen and in storage.
- Tool UIs from the Worker: contact card (WhatsApp, email, LinkedIn, copy buttons), "Go to <section>" links,
  follow-up chips.
- States: thinking / "still thinking", offline, rate limit with a countdown, errors with Retry; when the assistant
  is busy or unavailable (every free model over quota, the site-wide limit (`503 upstream_busy`), the platform's own
  429 / 5xx without the Worker's JSON, or the API down) the error offers the contact card. A stream that goes silent
  for 30 s is treated as dropped.
- Turnstile ("interaction-only", `refresh-expired: "manual"`, light DOM slotted into the panel) exists only while a
  token is being made: it loads when the panel opens without a valid session (after a navigation, only once the
  input gets focus), and the widget is removed as soon as its token is handed out, when the token expires unused and
  when a session starts, so nothing re-challenges in the background mid-conversation. A `401 turnstile_*` (session
  over its 1 h, or started on another network) renders a fresh one silently and resends once.
- Forced colors (Windows High Contrast): the bubble and every borderless control or box carry a transparent border
  that the system paints, and focus rings use `Highlight`.
- History in sessionStorage (last 40 messages); New chat clears it.

## Development

```sh
npm run widget:demo        # http://localhost:5173/chat-widget/demo.html (?lang=ar, ?theme=dark, ?api=http://127.0.0.1:8790)
npm run test:widget        # Playwright: desktop + mobile, mocked API, axe, forced colors
npm run test:widget:unit   # Vitest: markdown (links, isolation), SSE, language, API client, tools, Turnstile
npm run widget:size        # gzip budget
```

`tests/fixtures/site.html` mirrors the site's layout for the desktop tests (`tests/e2e/desktop.spec.ts`, 1440×807):
64 px sticky header, scroll-padding, smooth scrolling, contact form in the right column.
