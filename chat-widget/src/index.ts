/**
 * mohamedhatem.dev chat widget: the loader. This module is all a page pays for up front (≈2.6 KB gzip): a floating
 * "Ask my AI" bubble in a shadow root. The panel (panel.ts and the rest) is fetched and built on the first hover,
 * focus or touch of the bubble, so it is usually ready before the click lands, or at once when it was open on the
 * previous page of this tab (desktop only). Page code can do the same earlier with `window.MHChat.warm()`: on the
 * intent to open it from its own buttons (pointerdown, focus), or once the page is idle.
 *
 *   import { mountChat } from "…/chat-widget/src/index";
 *   mountChat({ turnstileSiteKey: "…", avatarSrc: "/images/mh-square-96.webp" });
 *
 * Other page elements can open the chat with `window.MHChat.open({ question })`, `openChat({ question })` or
 * `document.dispatchEvent(new CustomEvent("mh:open-chat", { detail: { question } }))`. The panel announces open and
 * close with a `mh:chat-state` event on document (`detail: { open: boolean }`). Focus returns to whatever had it when
 * the chat was opened (falling back to the bubble).
 */
import type { ChatLauncher, ChatWidgetConfig, OpenOptions, PanelApi } from "./types";

export type { ChatLauncher, ChatWidgetConfig, ContactConfig, OpenOptions, SectionConfig } from "./types";

/**
 * Short aliases for the design tokens (design/tokens.css), each with the brand fallback. Custom properties
 * inherit into the shadow root, so light/dark and the Arabic font switch with the page.
 */
const VARS =
  ":host{all:initial;--bg:var(--color-surface,#fefdfc);--bg2:var(--color-surface-2,#f1efea);--ink:var(--color-ink,#131d36);--ink2:var(--color-ink-2,#323d55);--mut:var(--color-muted,#5b6375);--line:var(--color-line,#e2dfda);--line2:var(--color-line-strong,#cfccc5);--lin:var(--color-line-input,#7b808d);--acc:var(--color-accent,#2b51aa);--accs:var(--color-accent-solid,#2348a1);--acch:var(--color-accent-solid-hover,#1a3788);--onacc:var(--color-on-accent,#fff);--tint:var(--color-accent-tint,#e7f0fe);--tintl:var(--color-accent-tint-line,#bcd3fe);--inv:var(--color-surface-inverse,#131d36);--oninv:var(--color-on-inverse,#f7f6f3);--focus:var(--color-focus,#2b51aa);--dtint:var(--color-danger-tint,#ffeae4);--warnt:var(--color-saffron-tint,#faeddb);--glow:var(--color-glow-1,rgb(62 109 200/.1));--teal:var(--color-teal-fill,#038586);--saf:var(--color-saffron-fill,#b47d19);--cor:var(--color-coral-fill,#b84d30);--sh:var(--shadow-xl,0 32px 72px -18px rgb(19 29 54/.24),0 12px 24px -12px rgb(19 29 54/.1));--ease:var(--ease-out,cubic-bezier(.16,1,.3,1));--font:var(--font-sans,Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif);--fontd:var(--font-display,var(--font));--fontar:var(--font-arabic,'IBM Plex Sans Arabic',Tahoma,sans-serif);--mono:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);--z:var(--z-widget,80)}";

/**
 * The bubble is lapis ink in both themes (the glyph's colours are the dark theme's category fills, tuned for it), with a
 * hairline ring for dark pages.
 * Its transparent border becomes the button's edge in forced colors (Windows High Contrast).
 * Lines end in a backslash (a template-literal line continuation), as in panel-css.ts: no newlines ship.
 */
const CSS = `${VARS}\
.b{position:fixed;z-index:var(--z);inset-block-end:max(1rem,env(safe-area-inset-bottom));inset-inline-end:max(1rem,env(safe-area-inset-right));display:flex;align-items:center;gap:.5rem;height:3.5rem;min-width:3.5rem;padding:0 1.125rem 0 .875rem;border:1px solid transparent;border-radius:999px;background:#131d36;color:#f7f6f3;font:600 .9375rem/1 var(--font);cursor:pointer;box-shadow:0 0 0 1px rgb(255 255 255/.14),0 18px 40px -12px rgb(19 29 54/.4),0 6px 12px -6px rgb(19 29 54/.2);transition:transform .25s var(--ease),padding .3s var(--ease),gap .3s var(--ease);animation:in .5s var(--ease) .4s both;-webkit-tap-highlight-color:transparent}\
:host([dir=rtl]) .b{padding:0 .875rem 0 1.125rem}\
@media (hover:hover){.b:hover{transform:translateY(-2px)}}\
.b:active{transform:scale(.94)}\
.b:focus-visible{outline:2px solid var(--focus);outline-offset:3px}\
.g,.x{flex:none;width:1.75rem;height:1.75rem}\
.x{display:none;width:1.375rem;margin:0 .1875rem}\
.b[aria-expanded=true] .g,.b[aria-expanded=true] .l{display:none}\
.b[aria-expanded=true] .x{display:block}\
.l{overflow:hidden;white-space:nowrap;max-width:12em;transition:max-width .35s var(--ease),opacity .25s}\
.b.c:not(:hover):not(:focus-visible),.b[aria-expanded=true]{gap:0;padding:0 .875rem}\
.b.c:not(:hover):not(:focus-visible) .l{max-width:0;opacity:0}\
.p{opacity:0;animation:mv 3.6s var(--ease) infinite}\
.p1{--x:-8.5px;--y:-7.5px}.p2{--x:8.5px;--y:7.5px;animation-delay:1.2s}.p3{--x:8.5px;--y:-7.5px;animation-delay:2.4s}\
@keyframes mv{0%{transform:none;opacity:0}12%,72%{opacity:1}100%{transform:translate(var(--x),var(--y));opacity:0}}\
@keyframes in{from{opacity:0;transform:translateY(.5rem) scale(.92)}}\
@media (max-width:639.98px){.l{display:none}.b,:host([dir=rtl]) .b{gap:0;padding:0 .875rem}}\
@media (prefers-reduced-motion:reduce){.b,.l{transition:none;animation:none}.p{display:none}}\
@media (forced-colors:active){.b{border-color:ButtonText}.b:focus-visible{outline-color:Highlight}}\
@media print{.b{display:none}}`;

/** The animated agent glyph: an orchestrator with four agents (turquoise/gold/carnelian/lapis) and pulses along the edges. */
const GLYPH =
  '<svg class="g" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 14 5.5 6.5M14 14l8.5-7.5M14 14l-8.5 7.5M14 14l8.5 7.5" stroke="#f7f6f3" stroke-opacity=".38" stroke-width="1.3" stroke-linecap="round"/><circle class="p p1" cx="14" cy="14" r="1.3" fill="#f7f6f3"/><circle class="p p2" cx="14" cy="14" r="1.3" fill="#f7f6f3"/><circle class="p p3" cx="14" cy="14" r="1.3" fill="#f7f6f3"/><circle cx="5.5" cy="6.5" r="2.6" fill="#5ac0bc"/><circle cx="22.5" cy="6.5" r="2.6" fill="#e8b458"/><circle cx="5.5" cy="21.5" r="2.6" fill="#da6c50"/><circle cx="22.5" cy="21.5" r="2.6" fill="#6591e1"/><circle cx="14" cy="14" r="4.4" fill="#f7f6f3"/><circle cx="14" cy="14" r="1.7" fill="#5ac0bc"/></svg>';

const CLOSE =
  '<svg class="x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

let api: { open(o?: OpenOptions): void; close(): void; warm(): void; launcher: ChatLauncher } | undefined;

/**
 * Adds styles to the shadow root as a constructed stylesheet: CSSOM, so a strict Content-Security-Policy (no
 * 'unsafe-inline' styles) still applies them. Falls back to a <style> element on browsers without
 * adoptedStyleSheets.
 */
function addStyles(root: ShadowRoot, css: string): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    const el = document.createElement("style");
    el.textContent = css;
    root.prepend(el);
  }
}

let listening = false;

/** Mounts the bubble once per document (safe to call again, e.g. after an Astro view transition). */
export function mountChat(config: ChatWidgetConfig = {}): void {
  if (typeof document === "undefined" || document.querySelector("[data-mh-chat]")) return;
  const lang = config.lang ?? (/^ar\b/i.test(document.documentElement.lang) ? "ar" : "en");
  const ar = lang === "ar";
  const key = config.storageKey ?? "mh-chat";
  const host = document.createElement("div");
  host.setAttribute("data-mh-chat", "");
  host.lang = lang;
  host.dir = ar ? "rtl" : "ltr";
  const root = host.attachShadow({ mode: "open" });
  const label = ar ? "اسأل مساعدي الذكي" : "Ask my AI";
  root.innerHTML = `<button class="b" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="${ar ? label : "Ask my AI assistant"}">${GLYPH}${CLOSE}<span class="l">${label}</span></button>`;
  addStyles(root, CSS);
  const bubble = root.querySelector("button")!;

  // The label is shown for the first visit (this browser session) and collapses to the icon afterwards, or once
  // the chat has been opened. Hover / keyboard focus still reveal it.
  const seen = `${key}:seen`;
  const compact = () => {
    bubble.classList.add("c");
    try {
      sessionStorage.setItem(seen, "0");
    } catch {
      /* storage blocked */
    }
  };
  try {
    if (!localStorage.getItem(seen)) {
      localStorage.setItem(seen, "1");
      sessionStorage.setItem(seen, "1");
    } else if (sessionStorage.getItem(seen) !== "1") bubble.classList.add("c");
  } catch {
    /* storage blocked: keep the label */
  }

  document.body.append(host);

  let panel: Promise<PanelApi> | undefined;
  const load = () =>
    (panel ??= import("./panel").then(
      (m) => m.createPanel({ host, root, bubble, config, lang, key, addStyles: (css) => addStyles(root, css) }),
      (err: unknown) => {
        panel = undefined; // offline / chunk error: try again on the next interaction
        throw err;
      },
    ));
  const warm = () => void load().catch(() => {});
  bubble.addEventListener("pointerenter", warm, { once: true });
  bubble.addEventListener("focus", warm, { once: true });
  // A touch listener also lets iOS show the :active (pressed) states inside the widget.
  host.addEventListener("touchstart", warm, { passive: true });
  bubble.addEventListener("click", () => {
    compact();
    load().then((p) => p.toggle(), () => {});
  });

  // Open on the previous page of this tab (panel.ts keeps `${key}:open`, never for the phone sheet): reopen it,
  // without taking focus.
  try {
    if (sessionStorage.getItem(`${key}:open`)) load().then((p) => p.open(undefined, true), () => {});
  } catch {
    /* storage blocked */
  }

  api = {
    open: (o) => {
      compact();
      const by = document.activeElement; // now: the hero bar's input blurs right after asking
      load().then((p) => p.open(o, false, by), () => {});
    },
    close: () => void panel?.then((p) => p.close(), () => {}),
    warm,
    // For page code that dresses the launcher (mohamedhatem.dev: the avatar and its speech bubble, see the README).
    launcher: { host, root, button: bubble },
  };
  (window as Window & { MHChat?: typeof api }).MHChat = api;
  if (!listening) {
    listening = true;
    document.addEventListener("mh:open-chat", (e) => api?.open((e as CustomEvent<OpenOptions | undefined>).detail));
  }
}

/** Opens the chat (mounting must have happened); with `question`, asks it right away. */
export function openChat(options?: OpenOptions): void {
  api?.open(options);
}
