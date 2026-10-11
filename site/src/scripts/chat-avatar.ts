/**
 * The chat launcher's avatar: Hatem as a small flat illustration (design/assets/avatar/mh-avatar.svg) that waves,
 * blinks and talks, with a comic speech bubble (copy: chat.avatar, a short hello, a 👋, then "Ask my AI assistant about
 * my work.") that pops out of it behind two little balls. chat.ts imports this module once the page has loaded and
 * the browser is idle, so none of it competes with first paint; until then the launcher is hidden (site.css), so it
 * never changes shape on screen.
 *
 * It dresses the widget's launcher through its hook (window.MHChat.launcher: host, open shadow root, button) and
 * returns the panel header's avatar (ChatWidgetConfig.avatar), which talks while an answer streams in (pure CSS: the
 * panel shows a cursor then) and blinks with the launcher.
 *
 * Quiet by default (audit L-04, M-08): the first screen keeps one motion of its own (the hero graph). The avatar fades
 * in, then rests until the visitor has scrolled and the page has settled. Only then does it say hello, once per
 * session, for about 5 s, and only where its bubble lands on empty page: never over text, a control, a picture or a
 * card (`clearUnder`, below). Where the page is busy it waits for the next rest; the visitor moving on (a scroll)
 * ends the greeting. Pages that ask for quiet (the CV and the 404: data-av-greet="off" in ChatMount.astro) never
 * greet on their own.
 *
 * Motion (transform and opacity only), in short bursts that each end within 5 s (WCAG 2.2.2). All of it stops with
 * prefers-reduced-motion and with the site's own pause control (motion-pref.ts: the hero graph's and the charts'
 * "Pause animations" buttons), which then show a still avatar and a still bubble:
 *   - first appearance: a short fade-in;
 *   - the greeting: a wave, a 2 px float (composited), the mouth talking while the bubble's words appear, a blink;
 *   - hover or keyboard focus: a wave, the float while it lasts, a blink, and the bubble (on demand, wherever it is);
 *   - the header's avatar blinks twice after the panel opens and talks while an answer streams in.
 * The bubble's × hides it for the session (sessionStorage), so does opening the chat. Escape hides it; it stays while
 * hovered or focused (WCAG 1.4.13); it hides when page focus lands under it (2.4.11). site.ts sets data-hush on the
 * host while it would cover a [data-chat-avoid] element, and the host's data-dodge (site.ts) and data-aside (chat.ts)
 * hide it with the launcher. Its words are a visual teaser (aria-hidden), read once as the launcher's description.
 */
import source from "../../../design/assets/avatar/mh-avatar.svg?raw";
import type { ChatLauncher } from "@chat/index.ts";
import { motionPaused, onMotionChange } from "./motion-pref";

export interface AvatarCopy {
  /** The launcher's accessible name ("Ask Hatem's AI assistant"). */
  name: string;
  /** First line of the bubble (a short hello); the 👋 is added after it. */
  hi: string;
  /** The rest of the bubble ("Ask my AI assistant about my work."). */
  text: string;
  /** The ×'s accessible name ("Hide message"). */
  hide: string;
}

/** The art without its comment and line breaks (it has no text, so whitespace between tags never matters). */
const SVG = source.replace(/<!--[\s\S]*?-->|\n\s*/g, "");
/** The header copy: its own ids (two copies share the shadow root) and a crop on the face. */
const HEADER_SVG = SVG.replaceAll("mha-", "mhh-").replace('viewBox="-14 -10 148 140"', 'viewBox="14 6 92 92"');
const CLOSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7m0-7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/**
 * Shadow-root styles. The rest read the site tokens through the widget's aliases (--z, --ease, --focus, --saf, --inv,
 * --fontd, --fontar).
 * The disc is themable: --mh-av-disc / --mh-av-rim / --mh-av-glow / --mh-av-glow-o. The default is a lapis-night disc
 * with a lapis inner glow, set in a gold rim (the launcher's edge: the rim is 9.5:1 on the dark page, and the disc
 * itself 15.5:1 on the light one; the rim is 8.3:1 against its disc); data-disc="teal" is the turquoise preset.
 * Open, the launcher is the panel's close button: its × keeps its own ivory ink (`.b.av` outranks the panel sheet's
 * `.av`, which is the header avatar's rule; audit M-01).
 * The bubble: alabaster paper with lapis ink in the light theme (the defaults below); site.css gives the dark theme a
 * "night comic" (surface paper, ivory text, a gold outline) through --mh-bubble-paper / --mh-bubble-ink /
 * --mh-bubble-text / --mh-bubble-accent (audit M-09).
 * design/scripts/check-contrast.mjs reads these defaults from this file and checks them.
 */
const CSS = `
.b.av{--avs:4rem;width:var(--avs);height:var(--avs);min-width:0;padding:0!important;gap:0!important;display:flex;justify-content:center;color:#f7f6f3;border-radius:50%;background:none;box-shadow:0 14px 30px -10px rgb(4 8 18/.42),0 4px 10px -4px rgb(4 8 18/.24)}
:host{--avd:var(--mh-av-disc,#131d36);--avr:var(--mh-av-rim,#e4ad4b);--bi:var(--mh-bubble-ink,#131d36);--ba:var(--mh-bubble-accent,#2b51aa)}
.b.av[aria-expanded=true]{background:var(--avd);box-shadow:inset 0 0 0 2px var(--avr),0 14px 30px -10px rgb(4 8 18/.42)}
.av .g,.av .l{display:none}
.b.av.in{animation:mhin .45s var(--ease)}
.ava{position:absolute;inset:-1px;pointer-events:none}
.ava.lively{animation:mhfl 2.4s ease-in-out infinite}
.ava svg{position:absolute;left:-13.793%;top:-10.345%;width:127.586%;height:120.69%;overflow:visible}
.ava svg,.avh svg{forced-color-adjust:none}
.av[aria-expanded=true] .ava{visibility:hidden}
:host([dir=rtl]) .ava svg,:host([dir=rtl]) .avh svg{transform:scaleX(-1)}
.avh{overflow:hidden;background:none!important}
.avh svg{display:block;width:100%;height:100%}
.avh .av-arm{display:none}
.av-disc{fill:var(--avd)}
.av-rim{stroke:var(--avr)}
.av-glow,.av-glow0{stop-color:var(--mh-av-glow,#6591e1)}
.av-glow{stop-opacity:var(--mh-av-glow-o,.3)}
:host([data-disc=teal]){--mh-av-disc:#038586;--mh-av-rim:#136868;--mh-av-glow:#fff;--mh-av-glow-o:.1}
.av-hand{transform-box:view-box;transform-origin:0 0}
.av-wave{transform-box:view-box;transform-origin:19px 108px}
.av-head{transform-box:view-box;transform-origin:60px 90px}
.av-eyes{transform-box:view-box;transform-origin:60px 45.25px}
.av-jaw{transform-box:view-box;transform-origin:60px 65.4px}
.wave .av-hand{animation:mhwv 1.7s ease-in-out}
.wave .av-wave{animation:mhsw 1.7s ease-in-out}
.wave .av-head{animation:mhnd 1.7s ease-in-out}
.blink .av-eyes{animation:mhbl .18s linear}
.talk .av-jaw,.pn:has(.cursor) .avh .av-jaw{animation:mhtk .36s linear infinite}
.mhb{--pp:var(--mh-bubble-paper,color-mix(in srgb,#fefdfc 94%,var(--color-bg,#f7f6f3)));position:fixed;z-index:var(--z);inset-block-end:max(1rem,env(safe-area-inset-bottom));inset-inline-end:max(1rem,env(safe-area-inset-right));width:4rem;height:4rem;pointer-events:none;font:500 .9375rem/1.38 var(--fontd);color:var(--mh-bubble-text,var(--bi))}
.mhb>*{position:absolute;visibility:hidden;opacity:0;transition:opacity .2s,visibility 0s .2s}
.mhb[data-s=on]>*{visibility:inherit;opacity:1;transition:none}
:host([data-hush]) .mhb>*,:host([data-modal]) .mhb>*{visibility:hidden;opacity:0}
.ball{box-sizing:border-box;border-radius:50%;border:2px solid var(--bi);background:var(--pp)}
.b1{width:.5rem;height:.5rem;inset-block-end:calc(100% + .3rem);inset-inline-end:1.05rem}
.b2{width:.8rem;height:.8rem;inset-block-end:calc(100% + 1rem);inset-inline-end:.35rem}
.bub{inset-block-end:calc(100% + 2.1rem);inset-inline-end:-.35rem;width:max-content;max-width:min(14rem,calc(100vw - 2.5rem));isolation:isolate;border-radius:1.35rem 1.15rem 1.3rem 1.2rem/1.15rem 1.3rem 1.2rem 1.35rem;rotate:-2.2deg;transform-origin:90% 110%}
:host([dir=rtl]) .bub{rotate:2.2deg;transform-origin:10% 110%}
.mhb[data-s=on] .bub{pointer-events:auto}
.bub::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;translate:.42rem .46rem;background:radial-gradient(circle,var(--saf) .09rem,transparent .105rem) 0 0/.28rem .28rem}
.bbx{position:relative;padding:.6rem 1.05rem .7rem;border:2.5px solid var(--bi);border-radius:inherit;background:var(--pp);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--inv) 25%,transparent);cursor:pointer}
.bbx p{margin:0;text-wrap:balance}
.bbx b{display:block;font-weight:700;font-size:1.0625rem;letter-spacing:-.01em;color:var(--ba)}
:host([lang=ar]) .bbx{font-family:var(--fontar);font-weight:600;line-height:1.55}
:host([lang=ar]) .bbx b{letter-spacing:0}
.e{font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;font-weight:400}
.bx{position:absolute;inset-block-start:-.7rem;inset-inline-end:-.7rem;display:grid;place-items:center;box-sizing:border-box;width:1.5rem;height:1.5rem;padding:0;border:2px solid var(--bi);border-radius:50%;background:var(--pp);color:var(--mh-bubble-text,var(--bi));cursor:pointer}
.bx::before{content:"";position:absolute;inset:-10px}
.bbx,.bx{-webkit-tap-highlight-color:transparent}
.bbx:active{scale:.97}
.bx:active{scale:.88}
.bx svg{width:.625rem;height:.625rem}
.bx:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.mhb[data-s=on] .ball{animation:mhpop .35s var(--ease) both}
.mhb[data-s=on] .b2{animation-delay:.12s}
.mhb[data-s=on] .bub{animation:mhbub .45s var(--ease) .24s both}
.mhb[data-s=on] .w{animation:mhw .25s both}
@keyframes mhwv{12%{transform:rotate(17deg)}26%{transform:rotate(-12deg)}40%{transform:rotate(15deg)}54%{transform:rotate(-9deg)}68%{transform:rotate(10deg)}82%{transform:rotate(-3deg)}}
@keyframes mhsw{22%{transform:rotate(-3deg)}50%{transform:rotate(2deg)}78%{transform:rotate(-1.5deg)}}
@keyframes mhnd{30%{transform:rotate(-2.5deg)}70%{transform:rotate(1.5deg)}}
@keyframes mhbl{50%{transform:scaleY(.08)}}
@keyframes mhtk{25%{transform:scaleY(.42)}50%{transform:scaleY(1.1)}75%{transform:scaleY(.58)}}
@keyframes mhfl{50%{transform:translateY(-2px)}}
@keyframes mhin{from{opacity:0;transform:translateY(.375rem) scale(.92)}}
@keyframes mhpop{from{opacity:0;transform:scale(0)}60%{opacity:1;transform:scale(1.2)}}
@keyframes mhbub{from{opacity:0;transform:scale(.35)}65%{opacity:1;transform:scale(1.05)}}
@keyframes mhw{from{opacity:0}}
@media (max-width:639.98px){.b.av{--avs:3.5rem}.mhb{width:3.5rem;height:3.5rem}}
:host([data-still]) .b.av,:host([data-still]) .ava,:host([data-still]) .ava *,:host([data-still]) .avh *,:host([data-still]) .mhb *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){.b.av,.ava,.ava *,.avh *,.mhb *{animation:none!important;transition:none!important}}
@media (forced-colors:active){.bbx,.ball,.bx{border-color:CanvasText}.bbx b{color:CanvasText}.bub::before{display:none}}
@media print{.mhb{display:none}}`;

/** sessionStorage, guarded (private modes and blocked storage throw): the greeting then may come once per page. */
function read(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string): void {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
}

/** Anything a visitor reads or uses: controls, pictures, drawings, tables, the header, and the page's marked spots. */
const BUSY =
  "a[href],button,input,select,textarea,summary,label,[role=button],[role=link],[role=img],[tabindex]:not([tabindex='-1']),img,svg,picture,video,canvas,iframe,figure,table,pre,[data-nav],[data-chat-avoid],[data-chat-hush]";

/**
 * True when the page under `r` (plus `pad` px around it) is empty: no text, no control, no picture, no card. The
 * area is sampled on a grid with document.elementsFromPoint (hit tests, run at a rest, when layout is already clean),
 * and every element met is judged once:
 *   - a control, a picture or a drawing (BUSY, or inside one) is busy;
 *   - an element's own text is busy wherever one of its line boxes meets the area (Range rects, so a line between two
 *     samples still counts);
 *   - a painted box (a background, a border or a shadow) is busy unless it spans the whole viewport (a section band
 *     is the page's gutter, a card is not).
 * Elements that ignore the pointer (decorative layers: glows, dot grids) are not hit, so they never count.
 */
export function clearUnder(r: { left: number; top: number; right: number; bottom: number }, skip: Element, pad: number): boolean {
  // Cut off by the viewport (a short or narrow window): no room to greet.
  if (r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight || r.right - r.left < 1) return false;
  // The area to keep clear: the bubble and `pad` px around it, within the viewport.
  const L = Math.max(0, r.left - pad);
  const T = Math.max(0, r.top - pad);
  const R = Math.min(innerWidth, r.right + pad);
  const B = Math.min(innerHeight, r.bottom + pad);
  const html = document.documentElement;
  const range = document.createRange();
  const meets = (q: DOMRect) => q.width > 0 && q.height > 0 && q.right > L && q.left < R && q.bottom > T && q.top < B;
  const judged = new Map<Element, boolean>();
  const busy = (el: Element): boolean => {
    if (el.closest(BUSY)) return true;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !/\S/.test(n.textContent ?? "")) continue;
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) if (meets(q)) return true;
    }
    if (el === html || el === document.body || el.getBoundingClientRect().width >= innerWidth - 2) return false;
    const cs = getComputedStyle(el);
    return (
      (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") ||
      cs.backgroundImage !== "none" ||
      cs.boxShadow !== "none" ||
      ["top", "right", "bottom", "left"].some((side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== "none")
    );
  };
  const COLS = 8;
  const ROWS = 10;
  for (let i = 0; i < COLS; i++)
    for (let j = 0; j < ROWS; j++) {
      const x = L + ((R - L) * (i + 0.5)) / COLS;
      const y = T + ((B - T) * (j + 0.5)) / ROWS;
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === skip || skip.contains(el)) continue;
        let b = judged.get(el);
        if (b === undefined) judged.set(el, (b = busy(el)));
        if (b) return false;
        if (el === html) break;
      }
    }
  return true;
}

/**
 * Dresses the launcher. Returns the panel header's avatar factory. Throws when the browser can't take constructed
 * stylesheets (the CSP forbids <style> elements): the caller then keeps the default launcher.
 * `greet: false` keeps the greeting for hover and keyboard focus only (pages that ask for quiet: the CV, the 404).
 */
export function mountAvatar({ host, root, button }: ChatLauncher, copy: AvatarCopy, { disc = "dark", key = "mh-chat", greet = true } = {}): { header: () => Element } {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  host.dataset.disc = disc;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  /** Still: the visitor asked for no motion, in the system settings or with the site's pause control (WCAG 2.2.2). */
  const still = () => reduce.matches || motionPaused();
  /** Stepped aside (site.ts data-dodge, chat.ts data-aside): hidden with its bubble. */
  const away = () => host.matches("[data-dodge],[data-aside]");
  const flag = `${key}:greet`; // "1": greeted this session; "x": dismissed or chat opened
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });

  // ---- the avatar in the launcher
  const ava = el("span", "ava");
  ava.setAttribute("aria-hidden", "true");
  ava.innerHTML = SVG;
  button.prepend(ava);
  button.classList.add("av");
  button.setAttribute("aria-label", copy.name);
  // The greeting, read once as the launcher's description: a hidden copy (no emoji), since the bubble's own words
  // are a visual teaser outside every landmark (aria-hidden; audit A11Y-05).
  const desc = Object.assign(el("span", ""), { id: "mhb-d", hidden: true, textContent: `${copy.hi.trim()} ${copy.text.trim()}` });
  root.append(desc);
  button.setAttribute("aria-describedby", desc.id);

  // ---- the two balls and the bubble. The greeting's first line (the hello) arrives with the bubble, so it never
  // shows as an empty card; the wave and the rest follow word by word (separate spans) while the mouth talks.
  const box = el("div", "mhb");
  box.innerHTML = `<i class="ball b1"></i><i class="ball b2"></i><div class="bub"><div class="bbx"><p id="mhb-t" aria-hidden="true"></p><button type="button" class="bx">${CLOSE}</button></div></div>`;
  const text = box.querySelector("p")!;
  const bub = box.querySelector<HTMLElement>(".bub")!;
  const close = box.querySelector<HTMLButtonElement>(".bx")!;
  close.setAttribute("aria-label", copy.hide);
  const hi = el("b", "");
  let n = 0;
  /** A word that fades in after the bubble has landed (about 0.5 s), 0.11 s after the one before. */
  const word = (parent: HTMLElement, w: string, cls = "w") => {
    const span = el("span", cls);
    span.textContent = w;
    span.style.animationDelay = `${0.45 + n++ * 0.11}s`; // CSSOM, allowed by the CSP (no style attribute markup)
    parent.append(span, " ");
    return span;
  };
  hi.append(`${copy.hi.trim()} `);
  word(hi, "👋", "w e");
  text.append(hi, " ");
  for (const w of copy.text.trim().split(/\s+/)) word(text, w);
  const talkMs = 600 + n * 110;
  root.append(box);

  // ---- motion
  const open = () => button.getAttribute("aria-expanded") === "true";
  let talkTimer = 0;
  let liveTimer = 0;
  let hovered = false;
  const quiet = () => still() || document.hidden;
  const lively = (ms: number) => {
    if (quiet()) return;
    ava.classList.add("lively");
    clearTimeout(liveTimer);
    if (ms) liveTimer = window.setTimeout(() => !hovered && ava.classList.remove("lively"), ms);
  };
  const doWave = () => {
    if (quiet() || open() || ava.classList.contains("wave")) return;
    ava.classList.add("wave");
  };
  const talk = () => {
    if (still()) return;
    ava.classList.add("talk");
    clearTimeout(talkTimer);
    talkTimer = window.setTimeout(() => ava.classList.remove("talk"), talkMs);
  };
  /** One blink of `a` (the launcher's avatar or the header's) after `ms`. */
  const blink = (a: Element | null, ms: number) =>
    setTimeout(() => !quiet() && a?.isConnected && a.classList.add("blink"), ms);
  root.addEventListener("animationend", (ev) => {
    const e = ev as AnimationEvent;
    const a = (e.target as Element).closest?.(".ava,.avh");
    if (e.animationName === "mhbl") a?.classList.remove("blink");
    if (e.animationName === "mhwv") a?.classList.remove("wave");
  });
  /** The site's pause control stops the avatar too, at once (and a later "play" lets it move again on hover). */
  const setStill = () => {
    host.toggleAttribute("data-still", still());
    if (!still()) return;
    clearTimeout(liveTimer);
    clearTimeout(talkTimer);
    for (const a of root.querySelectorAll(".ava,.avh")) a.classList.remove("lively", "wave", "talk", "blink");
  };
  setStill();
  onMotionChange(setStill);
  reduce.addEventListener("change", setStill);

  // ---- the bubble
  let shown = false;
  let shownAt = 0;
  let held = false; // hovered or focused: stays until that ends
  let hideTimer = 0;
  const show = (auto: boolean) => {
    if (shown || read(flag) === "x" || open()) return;
    if (auto) write(flag, "1");
    shown = true;
    shownAt = performance.now();
    box.dataset.s = "on";
    talk();
    clearTimeout(hideTimer);
    if (auto) hideTimer = window.setTimeout(() => hide(), 5000);
  };
  const hide = (force = false) => {
    if (!shown || (held && !force)) return;
    shown = false;
    held = false;
    box.dataset.s = "";
    ava.classList.remove("talk");
  };
  const enter = () => {
    held = hovered = true;
    clearTimeout(hideTimer);
    lively(0);
    doWave();
    blink(ava, 900);
    show(false);
  };
  const leave = () => {
    held = hovered = false;
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => hide(), 1500);
    lively(1200);
  };
  for (const t of [button, bub]) {
    t.addEventListener("pointerenter", (e) => e.pointerType !== "touch" && enter());
    t.addEventListener("pointerleave", (e) => e.pointerType !== "touch" && leave());
    // Keyboard focus only: a click focuses the button too, and then opens the chat.
    t.addEventListener("focusin", (e) => (e.target as Element).matches(":focus-visible") && enter());
    t.addEventListener("focusout", (e) => {
      if (!box.contains(e.relatedTarget as Node) && e.relatedTarget !== button) leave();
    });
  }
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    write(flag, "x");
    const refocus = root.activeElement === close;
    hide(true);
    if (refocus) button.focus();
  });
  // The bubble itself is a pointer shortcut to the launcher (keyboard users have the launcher, right below it).
  box.querySelector(".bbx")!.addEventListener("click", () => (window as Window & { MHChat?: { open(): void } }).MHChat?.open());
  root.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && shown) hide(true);
  });
  // Opening the chat ends the greeting for this session.
  document.addEventListener("mh:chat-state", (e) => {
    if ((e as CustomEvent<{ open?: boolean }>).detail?.open) {
      write(flag, "x");
      hide(true);
      // The header's avatar blinks twice, then rests (it talks again while the next answer streams in).
      const head = root.querySelector(".avh");
      blink(head, 1200);
      blink(head, 4200);
    }
  });
  // Never over the element that has keyboard focus (WCAG 2.4.11).
  document.addEventListener("focusin", (e) => {
    if (!shown || host.contains(e.target as Node)) return;
    const a = (e.target as Element).getBoundingClientRect();
    const b = bub.getBoundingClientRect();
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hide(true);
  });

  // ---- the greeting: after the visitor's first scroll, at a rest, over empty page
  /**
   * Empty page under the bubble (12 px of air around it) and under its two balls (2 px: they sit just above the
   * launcher, level with the phone's action dock beside it, which is part of the same bottom bar). Measured whether
   * the bubble shows or not (no animation runs while it is off).
   */
  const clearSpot = () => {
    const balls = [...box.querySelectorAll(".ball")].map((x) => x.getBoundingClientRect());
    const union = { left: Math.min(...balls.map((q) => q.left)), top: Math.min(...balls.map((q) => q.top)), right: Math.max(...balls.map((q) => q.right)), bottom: Math.max(...balls.map((q) => q.bottom)) };
    return clearUnder(bub.getBoundingClientRect(), host, 12) && clearUnder(union, host, 2);
  };
  let started = false;
  let scrolled = false;
  let greetedHere = false;
  let rest = 0;
  const y0 = scrollY;
  /** A rest after the first scroll: say hello if this session hasn't been greeted and the spot is empty. */
  const atRest = () => {
    rest = 0;
    if (!started || !scrolled || greetedHere || shown || away() || open() || document.hidden) return;
    if (!greet || read(flag)) {
      // Greeted already (or a quiet page): one blink when the visitor settles, and nothing more on its own.
      greetedHere = true;
      blink(ava, 0);
      return;
    }
    if (host.hasAttribute("data-hush") || !clearSpot()) return; // busy here: the next rest may be clear
    greetedHere = true;
    lively(4200);
    doWave();
    show(true);
    blink(ava, 1700);
  };
  const soon = (ms: number) => {
    clearTimeout(rest);
    rest = window.setTimeout(atRest, ms);
  };
  addEventListener(
    "scroll",
    () => {
      // The visitor moving on ends the greeting (once it has been seen for a moment).
      if (shown && !held && performance.now() - shownAt > 1000) hide(true);
      if (!scrolled && Math.abs(scrollY - y0) < 64) return;
      scrolled = true;
      soon(700);
    },
    { passive: true },
  );

  // ---- first appearance: when the launcher is first on screen (on phones only once the hero has scrolled past)
  const start = () => {
    if (away()) return;
    // Back from stepping aside, with a greeting still to come: look again once it has faded in.
    if (started) return void (scrolled && !greetedHere && soon(600));
    // A page opened in a background tab shows up once it is seen, not unseen.
    if (document.hidden) return void document.addEventListener("visibilitychange", start, { once: true });
    started = true;
    if (!still()) button.classList.add("in");
    if (scrolled) soon(900);
  };
  const mo = new MutationObserver(start);
  mo.observe(host, { attributes: true, attributeFilter: ["data-dodge", "data-aside"] });
  host.dataset.art = "on";
  start();
  document.dispatchEvent(new Event("mh:chat-art")); // site.ts measures the bubble for [data-chat-avoid]

  return {
    header: () => {
      const s = el("span", "av avh");
      s.setAttribute("aria-hidden", "true");
      s.innerHTML = HEADER_SVG;
      return s;
    },
  };
}
