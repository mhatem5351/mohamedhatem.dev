# Chat widget ("Ask my AI")

Framework-agnostic TypeScript + CSS-in-TS, no dependencies. The page pays for a ~2.4 KB gzip bubble; the panel
(~15 KB gzip) loads on the first hover, focus, touch or click of the bubble (budget: 18 KB gzip total, checked by
`npm run widget:size`). Styles live in a shadow root and read the design tokens (`design/tokens.css`) through CSS
custom properties, so light/dark and the Arabic font follow the page. Talks to `POST /api/chat` (contract:
`worker/src/chat/protocol.ts`, `worker/README.md`).

## Public API (stable)

```ts
import { mountChat, openChat } from "<repo>/chat-widget/src/index";

mountChat(config?: ChatWidgetConfig): void          // idempotent: once per document (call again after a view transition)
openChat(options?: { question?: string; send?: boolean }): void

window.MHChat.open({ question?, send? })           // same as openChat, for inline scripts
window.MHChat.close()
document.dispatchEvent(new CustomEvent("mh:open-chat", { detail: { question } }))   // same, decoupled
```

`open({ question })` opens the panel and sends the question at once (`send: false` only puts it in the input).
These work right after `mountChat`; the panel code is fetched on demand.

### `ChatWidgetConfig` (all optional; full TSDoc in `src/types.ts`)

| Option | Default | Notes |
|---|---|---|
| `apiBase` | `""` (same origin) | Origin of the Worker. Cross-origin (local demo) sends credentials so the session cookie works |
| `lang` | from `<html lang>` (`ar…` → `ar`, else `en`) | UI language and panel direction (RTL for Arabic; the bubble moves to the left) |
| `turnstileSiteKey` | none (Turnstile off) | **Required in production**: the Worker answers 401 without a session or a token |
| `avatarSrc` | "MH" monogram | Square image ≥ 72 px |
| `contact` | Hatem's WhatsApp `201142070946`, `hatem@mohamedhatem.dev`, LinkedIn | Used by the contact card (never taken from the model) |
| `sections` | `#<id>` on the page, else `/#id` or `/ar/#id`, built-in EN/AR labels | Targets of "Go to …" links: `about`, `work`, `experience`, `projects`, `skills`, `education`, `contact` |
| `suggestions` | `content/chat/suggestions.json` (bundled at build time) | `{ en, ar }` arrays of strings or `{ label, prompt }`; first 4 on phones, up to 8 otherwise |
| `storageKey` | `"mh-chat"` | Prefix of the sessionStorage / localStorage keys |

UI strings the content agent owns (title, disclaimer, privacy notice, greeting, placeholder, button labels) come
from `content/i18n/{en,ar}.ts` → `chat` at build time; the rest are built in (`src/i18n.ts`).

## Build requirements

- Run `node worker/scripts/gen-content.mjs` before bundling: it writes `src/generated/suggestions.ts` and
  `src/generated/copy.ts` (gitignored) from `content/`.
- No Vite-specific imports: Vite/Astro can import `src/index.ts` directly (the panel becomes its own chunk);
  `npm run widget:build` bundles it with esbuild for the demo and the size check.
- CSP: `script-src` and `frame-src` must allow `https://challenges.cloudflare.com` (Turnstile, loaded only when a
  session is needed); `connect-src 'self'`. Styles use constructed stylesheets, so no `'unsafe-inline'` is needed.

## What it does

- Bubble: bottom-right (bottom-left in RTL), animated multi-agent glyph (static with reduced motion), "Ask my AI"
  label on the first visit, then icon-only; `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`.
- Panel: `role="dialog"`; full-screen modal sheet below 640 px (safe-area insets, focus trap, scroll lock); Escape
  closes and focus returns to the bubble. Header with avatar, title, disclaimer, New chat, Close. Empty state:
  greeting, the privacy notice (messages go to Google's Gemini API, which may use them to improve its services on
  the free tier) and starter suggestions.
- Answers stream with a cursor, rendered by a tiny safe markdown renderer (DOM nodes only, no `innerHTML`, link
  protocol allow-list); Latin terms inside Arabic are bidi-isolated. Stop button aborts the request.
- Tool UIs from the Worker: contact card (WhatsApp, email, LinkedIn, copy buttons), "Go to <section>" links,
  follow-up chips.
- States: thinking / "still thinking", offline, rate limit with a countdown, errors with Retry; when the assistant
  is busy or unavailable (every free model over quota) the error offers the contact card. A stream that goes silent
  for 30 s is treated as dropped.
- Turnstile: rendered invisibly in the panel (light DOM, slotted) only when there is no valid chat session.
- History in sessionStorage (last 40 messages); New chat clears it.

## Development

```sh
npm run widget:demo        # http://localhost:5173/chat-widget/demo.html (?lang=ar, ?theme=dark, ?api=http://127.0.0.1:8790)
npm run test:widget        # Playwright: desktop + mobile, mocked API, axe
npm run test:widget:unit   # Vitest: markdown, SSE, language, API client, tools
npm run widget:size        # gzip budget
```
