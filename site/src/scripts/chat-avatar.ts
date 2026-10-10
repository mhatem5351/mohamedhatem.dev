/**
 * The chat launcher's avatar: Hatem as a small flat illustration (design/assets/avatar/mh-avatar.svg) that waves,
 * blinks and talks, with a comic speech bubble ("Hi, I'm Hatem! 👋 Ask my AI assistant about my work.") that pops
 * out of it behind two little balls. chat.ts imports this module once the page has loaded and the browser is idle,
 * so none of it competes with first paint; until then the launcher is hidden (site.css), so it never changes shape
 * on screen.
 *
 * It dresses the widget's launcher through its hook (window.MHChat.launcher: host, open shadow root, button) and
 * returns the panel header's avatar (ChatWidgetConfig.avatar), which talks while an answer streams in (pure CSS: the
 * panel shows a cursor then) and blinks with the launcher.
 *
 * Motion (transform and opacity only, all off with prefers-reduced-motion, which shows a still avatar and a still
 * bubble), in short bursts that each end within 5 s (WCAG 2.2.2):
 *   - on first appearance: a pop-in, a wave, a 2 px float (composited), the bubble with the mouth talking while its
 *     words appear, a blink; then a wave and a blink 13 s and 26 s later, and nothing more on its own;
 *   - hover or keyboard focus: a wave, the float while it lasts, a blink;
 *   - the header's avatar blinks twice after the panel opens and talks while an answer streams in.
 * The bubble shows a few seconds after the launcher first appears, at most twice per session, and on hover / focus of
 * the launcher. Its × hides it for the session (sessionStorage), so does opening the chat. Escape hides it; it stays
 * while hovered or focused (WCAG 1.4.13); it hides when page focus lands under it (2.4.11). site.ts sets data-hush
 * on the host while it would cover a [data-chat-avoid] element, and the host's data-dodge hides it with the launcher.
 */
import source from "../../../design/assets/avatar/mh-avatar.svg?raw";
import type { ChatLauncher } from "@chat/index.ts";

export interface AvatarCopy {
  /** The launcher's accessible name ("Ask Hatem's AI assistant"). */
  name: string;
  /** First line of the bubble ("Hi, I'm Hatem!"); the 👋 is added after it, hidden from assistive tech. */
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
 * Shadow-root styles. Colours that must hold in both themes are fixed (the bubble is always paper with ink, like a
 * comic); the rest read the site tokens through the widget's aliases (--z, --ease, --focus, --teal, --fontd, --fontar).
 * The disc is themable: --mh-av-disc / --mh-av-rim / --mh-av-glow / --mh-av-glow-o. The default is the deep ink disc
 * with a teal glow and rim (the rim keeps ≥ 3:1 against the page in both themes: 8.3:1 on the dark page, and the ink
 * disc itself 15.5:1 on the light one); data-disc="teal" is the brand-teal preset (teal disc, dark-teal rim).
 */
const CSS = `
.b.av{--avs:4rem;width:var(--avs);height:var(--avs);min-width:0;padding:0!important;gap:0!important;justify-content:center;border-radius:50%;background:none;box-shadow:0 14px 30px -10px rgb(20 33 43/.42),0 4px 10px -4px rgb(20 33 43/.24)}
.b.av[aria-expanded=true]{background:var(--mh-av-disc,#14212b);box-shadow:inset 0 0 0 2px var(--mh-av-rim,#2cc2b0),0 14px 30px -10px rgb(20 33 43/.42)}
.av .g,.av .l{display:none}
.b.av.in{animation:mhin .55s var(--ease)}
.ava{position:absolute;inset:-1px;pointer-events:none}
.ava.lively{animation:mhfl 2.4s ease-in-out infinite}
.ava svg{position:absolute;left:-13.793%;top:-10.345%;width:127.586%;height:120.69%;overflow:visible}
.ava svg,.avh svg{forced-color-adjust:none}
.av[aria-expanded=true] .ava{visibility:hidden}
:host([dir=rtl]) .ava svg,:host([dir=rtl]) .avh svg{transform:scaleX(-1)}
.avh{overflow:hidden;background:none!important}
.avh svg{display:block;width:100%;height:100%}
.avh .av-arm{display:none}
.av-disc{fill:var(--mh-av-disc,#14212b)}
.av-rim{stroke:var(--mh-av-rim,#2cc2b0)}
.av-glow,.av-glow0{stop-color:var(--mh-av-glow,#2cc2b0)}
.av-glow{stop-opacity:var(--mh-av-glow-o,.22)}
:host([data-disc=teal]){--mh-av-disc:#16a394;--mh-av-rim:#0a766c;--mh-av-glow:#fff;--mh-av-glow-o:.1}
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
.mhb{--pp:color-mix(in srgb,#fffefb 94%,var(--color-bg,#fbf8f3));position:fixed;z-index:var(--z);inset-block-end:max(1rem,env(safe-area-inset-bottom));inset-inline-end:max(1rem,env(safe-area-inset-right));width:4rem;height:4rem;pointer-events:none;font:500 .9375rem/1.38 var(--fontd);color:#14212b}
.mhb>*{position:absolute;visibility:hidden;opacity:0;transition:opacity .2s,visibility 0s .2s}
.mhb[data-s=on]>*{visibility:inherit;opacity:1;transition:none}
:host([data-hush]) .mhb>*,:host([data-modal]) .mhb>*{visibility:hidden;opacity:0}
.ball{box-sizing:border-box;border-radius:50%;border:2px solid #14212b;background:var(--pp)}
.b1{width:.5rem;height:.5rem;inset-block-end:calc(100% + .3rem);inset-inline-end:1.05rem}
.b2{width:.8rem;height:.8rem;inset-block-end:calc(100% + 1rem);inset-inline-end:.35rem}
.bub{inset-block-end:calc(100% + 2.1rem);inset-inline-end:-.35rem;width:max-content;max-width:min(14rem,calc(100vw - 2.5rem));isolation:isolate;border-radius:1.35rem 1.15rem 1.3rem 1.2rem/1.15rem 1.3rem 1.2rem 1.35rem;rotate:-2.2deg;transform-origin:90% 110%}
:host([dir=rtl]) .bub{rotate:2.2deg;transform-origin:10% 110%}
.mhb[data-s=on] .bub{pointer-events:auto}
.bub::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;translate:.42rem .46rem;background:radial-gradient(circle,var(--teal) .09rem,transparent .105rem) 0 0/.28rem .28rem}
.bbx{position:relative;padding:.6rem 1.05rem .7rem;border:2.5px solid #14212b;border-radius:inherit;background:var(--pp);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--inv) 25%,transparent);cursor:pointer}
.bbx p{margin:0;text-wrap:balance}
.bbx b{display:block;font-weight:700;font-size:1.0625rem;letter-spacing:-.01em;color:#0a766c}
:host([lang=ar]) .bbx{font-family:var(--fontar);font-weight:600;line-height:1.55}
.e{font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;font-weight:400}
.bx{position:absolute;inset-block-start:-.7rem;inset-inline-end:-.7rem;display:grid;place-items:center;box-sizing:border-box;width:1.5rem;height:1.5rem;padding:0;border:2px solid #14212b;border-radius:50%;background:var(--pp);color:#14212b;cursor:pointer}
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
@keyframes mhin{from{opacity:0;transform:translateY(.5rem) scale(.6)}}
@keyframes mhpop{from{opacity:0;transform:scale(0)}60%{opacity:1;transform:scale(1.2)}}
@keyframes mhbub{from{opacity:0;transform:scale(.35)}65%{opacity:1;transform:scale(1.05)}}
@keyframes mhw{from{opacity:0}}
@media (max-width:639.98px){.b.av{--avs:3.5rem}.mhb{width:3.5rem;height:3.5rem}}
@media (prefers-reduced-motion:reduce){.b.av,.ava,.ava *,.avh *,.mhb *{animation:none!important;transition:none!important}}
@media (forced-colors:active){.bbx,.ball,.bx{border-color:CanvasText}.bbx b{color:CanvasText}.bub::before{display:none}}
@media print{.mhb{display:none}}`;

/** sessionStorage, guarded (private modes and blocked storage throw): the bubble then just shows on every page. */
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

/**
 * Dresses the launcher. Returns the panel header's avatar factory. Throws when the browser can't take constructed
 * stylesheets (the CSP forbids <style> elements): the caller then keeps the default launcher.
 */
export function mountAvatar({ host, root, button }: ChatLauncher, copy: AvatarCopy, { disc = "dark", key = "mh-chat" } = {}): { header: () => Element } {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  host.dataset.disc = disc;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => reduce.matches;
  const flag = `${key}:greet`; // "1" / "2": auto-shown that many times this session; "x": dismissed or chat opened
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => Object.assign(document.createElement(tag), { className: cls });

  // ---- the avatar in the launcher
  const ava = el("span", "ava");
  ava.setAttribute("aria-hidden", "true");
  ava.innerHTML = SVG;
  button.prepend(ava);
  button.classList.add("av");
  button.setAttribute("aria-label", copy.name);
  button.setAttribute("aria-describedby", "mhb-t");

  // ---- the two balls and the bubble; words are separate spans so they can appear one after the other
  const box = el("div", "mhb");
  box.innerHTML = `<i class="ball b1"></i><i class="ball b2"></i><div class="bub"><div class="bbx"><p id="mhb-t"></p><button type="button" class="bx">${CLOSE}</button></div></div>`;
  const text = box.querySelector("p")!;
  const close = box.querySelector<HTMLButtonElement>(".bx")!;
  close.setAttribute("aria-label", copy.hide);
  const hi = el("b", "");
  let n = 0;
  const words = (parent: HTMLElement, s: string) => {
    for (const w of s.trim().split(/\s+/)) {
      const span = el("span", "w");
      span.textContent = w;
      span.style.animationDelay = `${0.5 + n++ * 0.11}s`; // CSSOM, allowed by the CSP (no style attribute markup)
      parent.append(span, " ");
    }
  };
  words(hi, copy.hi);
  const wave = el("span", "w e");
  wave.textContent = "👋";
  wave.setAttribute("aria-hidden", "true");
  wave.style.animationDelay = `${0.5 + n++ * 0.11}s`;
  hi.append(wave);
  text.append(hi, " ");
  words(text, copy.text);
  const talkMs = 600 + n * 110;
  root.append(box);

  // ---- motion: short bursts, each over within 5 s (WCAG 2.2.2), three in all per page view; after that the avatar
  // only moves while it is hovered or has keyboard focus (and the header's mouth while an answer streams)
  const open = () => button.getAttribute("aria-expanded") === "true";
  let waves = 0;
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
  const doWave = (auto: boolean) => {
    if (quiet() || open() || ava.classList.contains("wave") || (auto && waves >= 3)) return;
    if (auto) waves++;
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
  root.addEventListener("animationend", (e) => {
    const a = (e.target as Element).closest?.(".ava,.avh");
    if (e.animationName === "mhbl") a?.classList.remove("blink");
    if (e.animationName === "mhwv") a?.classList.remove("wave");
  });

  // ---- the bubble
  let shown = false;
  let held = false; // hovered or focused: stays until that ends
  let hideTimer = 0;
  const allowed = () => read(flag) !== "x" && !open();
  const show = (auto: boolean) => {
    if (shown || !allowed()) return;
    if (auto) {
      const count = Number(read(flag)) || 0;
      if (count >= 2) return;
      write(flag, String(count + 1));
    }
    shown = true;
    box.dataset.s = "on";
    talk();
    clearTimeout(hideTimer);
    if (auto) hideTimer = window.setTimeout(() => hide(), 9000);
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
    doWave(false);
    blink(ava, 900);
    show(false);
  };
  const leave = () => {
    held = hovered = false;
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => hide(), 1500);
    lively(1200);
  };
  for (const t of [button, box.querySelector<HTMLElement>(".bub")!]) {
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
    const b = box.querySelector(".bub")!.getBoundingClientRect();
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hide(true);
  });

  // ---- first appearance: when the launcher is first on screen (on phones only once the hero has scrolled past)
  let started = false;
  const start = () => {
    if (started || host.hasAttribute("data-dodge")) return;
    // A page opened in a background tab greets once it is seen, not unseen.
    if (document.hidden) return void document.addEventListener("visibilitychange", start, { once: true });
    started = true;
    mo.disconnect();
    if (!still()) button.classList.add("in");
    lively(5000);
    setTimeout(() => doWave(true), 700);
    setTimeout(() => show(true), 2600);
    blink(ava, 3600);
    let rounds = 0;
    const again = () => {
      lively(2600);
      doWave(true);
      blink(ava, 2000);
      if (++rounds < 2) setTimeout(again, 13000);
    };
    setTimeout(again, 13700);
  };
  const mo = new MutationObserver(start);
  mo.observe(host, { attributes: true, attributeFilter: ["data-dodge"] });
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
