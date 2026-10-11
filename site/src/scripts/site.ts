/**
 * Site-wide behaviour, one small module on every page (no framework):
 *   theme (dark by default for every visitor; the toggle flips dark ↔ light and the choice persists; segmented
 *   control in the menu), nav hairline after scroll, the header sliding away on phones, the mobile menu (modal while
 *   open), the language switch landing on the same section, home scroll-spy, reveal on scroll, copy buttons, live
 *   Cairo time, "open the assistant" triggers ("?ask=1" from the installed app's shortcut, and the "/" key), and the
 *   phone action dock (dock.ts).
 * Everything degrades: without JS the page is complete (in the default dark theme, menu links are reachable in the
 * footer, the assistant offers email/WhatsApp in a <noscript> card).
 * Start-up never forces a style or layout pass (audit PERF-01): nothing here reads geometry while the module runs.
 * Measurements come from ResizeObserver / IntersectionObserver callbacks (after the frame's own layout) or the first
 * animation frame, and writes that would restyle the whole document (custom properties on <html>, the theme) happen
 * only when the value actually changes.
 */

type Theme = "light" | "dark";
type OpenRequest = { question?: string };
type ChatWindow = Window & {
  MHChat?: { open(o?: OpenRequest): void; launcher?: { host: HTMLElement; root: ShadowRoot; button: HTMLElement } };
  MHChatQueue?: OpenRequest[];
};

import "./dock";

const root = document.documentElement;
const KEY = "mh-theme";
const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");

// iOS Safari applies :active (the pressed states in components.css 21c) only when a touch listener exists.
document.addEventListener("touchstart", () => {}, { passive: true });

/* ------------------------------------------------------------------ theme */
/** Dark unless the visitor chose light (the head's boot script applies the same rule before first paint). */
function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
let theme: Theme = readTheme();

function applyTheme(): void {
  // Same value as the head's boot script on load: no write, so no restyle of the whole document.
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  for (const b of document.querySelectorAll<HTMLElement>("[data-theme-toggle]")) {
    if (b.dataset.mode !== theme) b.dataset.mode = theme;
    if (b.hasAttribute("data-cycle-only")) continue;
    const label = b.dataset[theme === "light" ? "labelLight" : "labelDark"];
    if (label && b.getAttribute("aria-label") !== label) {
      b.setAttribute("aria-label", label);
      b.title = label;
    }
  }
  for (const b of document.querySelectorAll<HTMLElement>("[data-set-theme]")) {
    const pressed = String(b.dataset.setTheme === theme);
    if (b.getAttribute("aria-pressed") !== pressed) b.setAttribute("aria-pressed", pressed);
  }
  // The browser chrome and the canvas follow the page (each page's own colours, from Head.astro).
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const chrome = meta?.dataset[theme];
  if (meta && chrome && meta.content !== chrome) meta.content = chrome;
  const scheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (scheme && scheme.content !== theme) scheme.content = theme;
}

/** An explicit choice, remembered (dark included, so a later change of default never overrides it). */
function setTheme(next: Theme): void {
  theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  // The switch is instant (DESIGN.md 7.2; audit M-04): the header's and the buttons' colour transitions are off for
  // the frame that changes theme, so the header never shows a half-switched grey band. The class goes after that frame
  // has been styled (two frames later), when nothing is left to transition.
  root.classList.add("theme-switching");
  applyTheme();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

applyTheme();
addEventListener("storage", (e) => {
  if (e.key === KEY || e.key === null) {
    theme = readTheme();
    applyTheme();
  }
});

/* ------------------------------------------------------------------ chat */
/** Closes the mobile menu if it is open (set by the menu below): the chat can't open behind an inert page. */
let closeMenu: () => void = () => {};
function openChat(req: OpenRequest = {}): void {
  closeMenu();
  const w = window as ChatWindow;
  const go = () => {
    const chat = w.MHChat;
    if (!chat?.open) return void (w.MHChatQueue ??= []).push(req);
    const wasOpen = chat.launcher?.button.getAttribute("aria-expanded") === "true";
    chat.open(req);
    // The desktop panel is non-modal: a keyboard user who tabbed out of it gets back in with the page's own "Ask" button
    // or "/", straight to the composer (audit A11Y-01). (Opening it moves focus there already.)
    if (wasOpen) chat.launcher?.root.querySelector<HTMLElement>("textarea")?.focus({ preventScroll: true });
  };
  // A modal dialog (a case study's enlarge view; "/" still reaches the page from inside it) sits in the top layer, over
  // the chat, and keeps it inert: it closes first. zoom-dialog.ts reports the close ("mh:dialog") once it has taken
  // back its history entry (touch screens), so the phone sheet's own entry comes after it and Back closes the sheet.
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open][data-zoom-dialog]");
  if (!dialog) return go();
  document.addEventListener("mh:dialog", go, { once: true });
  dialog.close();
}
(window as Window & { mhOpenChat?: typeof openChat }).mhOpenChat = openChat;
// The page's own "Ask" buttons are the chat's openers too (aria-haspopup="dialog"): they expose its state.
document.addEventListener("mh:chat-state", (e) => {
  const open = String(!!(e as CustomEvent<{ open?: boolean }>).detail?.open);
  for (const b of document.querySelectorAll<HTMLElement>("button[data-open-chat][aria-haspopup]")) b.setAttribute("aria-expanded", open);
});

// The installed app's "Ask my AI" shortcut (site.webmanifest: /?ask=1): open the assistant once and drop the parameter
// (the hash stays), so a reload or a shared link doesn't open it again.
{
  const url = new URL(location.href);
  if (url.searchParams.has("ask")) {
    url.searchParams.delete("ask");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    openChat({});
  }
}

/* ------------------------------------------------------------------ clicks */
document.addEventListener("click", async (e) => {
  const target = e.target as Element | null;
  if (!target) return;

  const toggle = target.closest<HTMLElement>("[data-theme-toggle]");
  if (toggle) {
    // Every click flips what you see (dark ↔ light) and remembers it.
    setTheme(theme === "dark" ? "light" : "dark");
    return;
  }
  const seg = target.closest<HTMLElement>("[data-set-theme]");
  if (seg) {
    setTheme(seg.dataset.setTheme === "light" ? "light" : "dark");
    return;
  }
  const chat = target.closest<HTMLElement>("[data-open-chat]");
  if (chat) {
    e.preventDefault();
    openChat(chat.dataset.question ? { question: chat.dataset.question } : {});
    return;
  }
  const copy = target.closest<HTMLElement>("[data-copy]");
  if (copy) {
    e.preventDefault();
    const text = copy.dataset.copy === "url" ? location.href.split("#")[0]! : copy.dataset.copy || "";
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    announce(ok ? copy.dataset.copied || "" : copy.dataset.copyFailed || "");
    if (ok) {
      copy.dataset.state = "copied";
      setTimeout(() => delete copy.dataset.state, 1800);
    }
  }
});

/** Polite announcement through the page's live region (#live in Base.astro). */
export function announce(text: string): void {
  const live = document.getElementById("live");
  if (!live || !text) return;
  live.textContent = "";
  requestAnimationFrame(() => (live.textContent = text));
}

/* ------------------------------------------------------------------ "/" opens the assistant */
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const t = e.target as Element | null;
  if (t?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
  e.preventDefault();
  openChat({});
});

/* ------------------------------------------------------------------ nav: hairline, height, sliding away */
const nav = document.querySelector<HTMLElement>("[data-nav]");
const menuBtn = document.querySelector<HTMLButtonElement>("[data-menu-button]");
const sheet = document.querySelector<HTMLElement>("[data-menu-sheet]");
const menuOpen = () => !!sheet && !sheet.hidden;
if (nav) {
  // --nav-real is the header's height (the menu sheet, its scrim, the case-study TOC bar) and the chat panel's top edge
  // follows it (chat-widget README: --mh-chat-top; 12 px from the top while the header has slid away, below). The
  // stylesheet's default is the header's natural height (components.css 7), so --nav-real is written only while the
  // header is taller (zoom, text size, a wrapped nav): the start-up never restyles the whole page for it.
  let navH = 0;
  let natural = true;
  let written = false;
  const setNavReal = () => {
    if (natural && !written) return;
    written = !natural;
    if (natural) root.style.removeProperty("--nav-real");
    else root.style.setProperty("--nav-real", `${navH}px`);
  };
  /** Measured after layout (no forced reflow): the observer's first callback comes with the first frame. */
  const measure = (box?: ResizeObserverSize) => {
    navH = Math.round(box?.blockSize ?? nav.getBoundingClientRect().height);
    const cs = getComputedStyle(nav);
    natural = Math.abs(navH - parseFloat(cs.minHeight) - parseFloat(cs.borderBottomWidth)) < 1;
    setNavReal();
  };

  // Below 64rem the header slides up on scroll down (after 200 px, 8 px hysteresis) and comes back on any scroll up,
  // the way phone browsers treat their own toolbars (audit NAV-03). Never while the menu is open or focus is in the
  // header, and not for an in-page jump (a menu or TOC link scrolls down to its target: the header stays, so the target
  // lands clear of it). <html data-nav-hidden> drives the CSS (components.css 21e, case.css: the TOC bar follows).
  const narrow = matchMedia("(max-width: 63.99rem)");
  let lastY = 0;
  let holdUntil = 0;
  const setHidden = (hide: boolean) => {
    if (hide === root.hasAttribute("data-nav-hidden")) return;
    // The panel's top edge follows (components.css: :root[data-nav-hidden] --mh-chat-top).
    root.toggleAttribute("data-nav-hidden", hide);
    // The open panel measured the header when it opened (the widget's own --mh-chat-top on its host): from here the
    // page's value, which follows the header, applies (the widget measures again on resize, to the same value).
    document.querySelector<HTMLElement>("[data-mh-chat]")?.style.removeProperty("--mh-chat-top");
  };
  const onScroll = () => {
    const y = scrollY;
    if ((nav.dataset.scrolled === "true") !== y > 8) nav.dataset.scrolled = String(y > 8);
    // Keyboard focus in the header keeps it (a tap leaves no visible focus there, so it doesn't).
    const kbFocus = !!nav.querySelector(":focus-visible");
    if (!narrow.matches || menuOpen() || kbFocus || performance.now() < holdUntil || y < 200) {
      setHidden(false);
      lastY = y;
      return;
    }
    const dy = y - lastY;
    if (Math.abs(dy) < 8) return;
    setHidden(dy > 0);
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  narrow.addEventListener("change", onScroll);
  // The first measurement and the first scroll state come after the first layout (a page restored mid-scroll gets its
  // hairline there).
  let first = true;
  const startUp = () => {
    if (!first) return;
    first = false;
    lastY = scrollY;
    onScroll();
  };
  if ("ResizeObserver" in window)
    new ResizeObserver(([e]) => {
      measure(e?.borderBoxSize?.[0]);
      startUp();
    }).observe(nav);
  else
    requestAnimationFrame(() => {
      measure();
      startUp();
    });
  nav.addEventListener("focusin", (e) => (e.target as Element).matches(":focus-visible") && setHidden(false));
  /** An in-page jump keeps the header (its target lands below it); scrolling resumes the rule once it settles. */
  const hold = () => {
    holdUntil = performance.now() + 1200;
    setHidden(false);
  };
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[href*='#']");
    if (a && a.pathname === location.pathname && a.hash) hold();
  });
  addEventListener("hashchange", hold);
  addEventListener("scrollend", () => {
    if (performance.now() < holdUntil) {
      holdUntil = 0;
      lastY = scrollY;
    }
  });
}

/* ------------------------------------------------------------------ mobile menu (modal while open) */
if (menuBtn && sheet) {
  const scrim = document.querySelector<HTMLElement>("[data-menu-scrim]");
  /**
   * While open, the menu is modal (audit NAV-01): the page behind can't scroll (overflow on <html>, plus the sheet's
   * overscroll containment), a scrim covers it and closes the menu on tap, and everything behind the header is inert
   * (main, the footer, the skip link, the dock, the chat), so screen-reader swipes stay in the header and the sheet. The
   * sheet stays the menu button's disclosure: the button (now "Close menu") remains reachable right above it.
   */
  const background = () =>
    [...document.querySelectorAll<HTMLElement>("main, body > footer, .skip-link, [data-dock], [data-mh-chat]")];
  const set = (open: boolean, focusButton: boolean = true) => {
    sheet.hidden = !open;
    if (scrim) scrim.hidden = !open;
    root.classList.toggle("menu-open", open);
    for (const el of background()) el.inert = open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", (open ? menuBtn.dataset.labelClose : menuBtn.dataset.labelOpen) || "");
    document.dispatchEvent(new CustomEvent("mh:menu", { detail: { open } }));
    if (open) sheet.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    else if (focusButton) menuBtn.focus({ preventScroll: true });
  };
  menuBtn.addEventListener("click", () => set(Boolean(sheet.hidden)));
  closeMenu = () => {
    if (!sheet.hidden) set(false, false);
  };
  sheet.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a")) set(false, false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) set(false);
  });
  document.addEventListener("click", (e) => {
    const t = e.target as Node;
    // A tap on the scrim gives focus back to the menu button; a click elsewhere leaves focus where it went.
    if (!sheet.hidden && !sheet.contains(t) && !menuBtn.contains(t)) set(false, !!scrim?.contains(t));
  });
  // Tabbing out of the open sheet (past its last control, or back past the menu button) closes it, leaving focus
  // where it went, so the sheet never lingers over the element that has focus. Past the last control the page behind
  // is still inert at keydown, so the menu closes first and the Tab then moves on into the page.
  sheet.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    const all = [...sheet.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    if (document.activeElement === all[all.length - 1]) set(false, false);
  });
  for (const el of [sheet, menuBtn])
    el.addEventListener("focusout", (e) => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (!sheet.hidden && next && !sheet.contains(next) && !menuBtn.contains(next)) set(false, false);
    });
  // Closing the sheet when the layout grows past the breakpoint keeps aria-expanded truthful.
  matchMedia("(min-width: 64rem)").addEventListener("change", (e) => e.matches && !sheet.hidden && set(false, false));
}

/* ------------------------------------------------------------------ language switch: same section, other language */
// Both languages share their section ids (home: #work, #experience…; case studies: #problem, #approach…), so a
// visitor switching language mid-page lands on the section they were reading instead of the top (audit NAV-02). The
// section is read from the page's geometry (the last section whose top has passed 40 % of the viewport), not from
// the desktop scroll-spy, which phones don't have.
function currentSectionId(): string | null {
  const line = innerHeight * 0.4;
  let id: string | null = null;
  for (const s of document.querySelectorAll<HTMLElement>("main section[id]")) {
    const r = s.getBoundingClientRect();
    if (r.height > 0 && r.top <= line) id = s.id;
  }
  return id && id !== "top" ? id : null;
}
document.addEventListener("click", (e) => {
  const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a.lang-switch, .footer a[hreflang]");
  if (!a || a.origin !== location.origin) return;
  const id = currentSectionId();
  if (id) a.hash = id;
});

/* ------------------------------------------------------------------ scroll regions (skills table) */
// A wide table is a keyboard-focusable, labelled region only while it actually scrolls sideways; when it fits, the
// tab stop and the "scrolls sideways" label would only mislead. Without JS the markup keeps the region (safe default).
for (const wrap of document.querySelectorAll<HTMLElement>("[data-scroll-region]")) {
  const label = wrap.getAttribute("aria-label") ?? "";
  const update = () => {
    if (wrap.scrollWidth > wrap.clientWidth + 1) {
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", label);
    } else {
      wrap.removeAttribute("tabindex");
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-label");
    }
  };
  // Measured after layout: the observer's first callback comes with the first frame (no forced reflow at start-up).
  if ("ResizeObserver" in window) new ResizeObserver(update).observe(wrap);
  else requestAnimationFrame(update);
  void document.fonts?.ready.then(update);
}

/* ------------------------------------------------------------------ phone disclosures (toolbox, more work, coursework) */
// Below 40rem a few long lists sit behind a "Show …" button (home-b.css / components.css hide them while .js is set,
// so there is no shift on load); the button only toggles them. Without JS the lists are always shown.
for (const box of document.querySelectorAll<HTMLElement>("[data-toolbox], [data-disclose]")) {
  const btn = box.querySelector<HTMLButtonElement>("[data-toolbox-toggle], [data-disclose-toggle]");
  btn?.addEventListener("click", () => {
    const open = !box.hasAttribute("data-open");
    box.toggleAttribute("data-open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
}

/* ------------------------------------------------------------------ chat bubble: never over the page's own CTAs */
// The floating "Ask my AI" bubble (chat-widget, fixed in the bottom inline-end corner) steps aside while it would
// cover an element marked [data-chat-avoid] (the hero ask bar, the case-study "Ask my AI about this project" buttons,
// the contact form's Send and copy actions), and on phones it waits until the hero's ask bar ([data-chat-after]) has
// scrolled past: the hero already offers the assistant, and the header's "Ask AI" button is always there.
// Stepping aside is `data-dodge` on the widget's host (site.css): it fades out, then leaves the tab order and the
// accessibility tree (visibility: hidden). Never while the chat is open or the bubble has keyboard focus.
// The avatar's comic speech bubble (chat-avatar.ts) sits above the launcher: while it would cover a marked element,
// `data-hush` on the host hides the speech bubble alone. Elements marked [data-chat-hush] (the phone action dock, which
// sits beside the launcher by design) only hush the bubble; they never move the launcher.
// A page that offers the assistant in its own actions (the 404: ChatMount data-launcher="off") keeps the launcher out of
// its corner altogether until the chat is open (audit L-05).
const avoidEls = [...document.querySelectorAll<HTMLElement>("[data-chat-avoid]")];
const hushEls = [...document.querySelectorAll<HTMLElement>("[data-chat-hush]")];
const afterEl = document.querySelector<HTMLElement>("[data-chat-after]");
const launcherOff = document.getElementById("mh-chat-config")?.dataset.launcher === "off";
if (avoidEls.length || hushEls.length || afterEl || launcherOff) {
  const phone = matchMedia("(max-width: 39.99rem)");
  const onScreen = new Set<HTMLElement>(avoidEls);
  const PAD = 12;
  let chatOpen = false;
  let frame = 0;
  const hostEl = () => document.querySelector<HTMLElement>("[data-mh-chat]");
  const update = () => {
    frame = 0;
    const host = hostEl();
    const b = host?.shadowRoot?.querySelector("button")?.getBoundingClientRect();
    if (!host || !b?.width) return;
    const hits = (r: DOMRect, o: DOMRect) => r.width > 0 && r.right + PAD > o.left && r.left - PAD < o.right && r.bottom + PAD > o.top && r.top - PAD < o.bottom;
    // The avatar's speech bubble (chat-avatar.ts), measured whether it is showing or not.
    const bub = host.shadowRoot?.querySelector(".bub")?.getBoundingClientRect();
    // While the mobile menu is open the launcher (and its greeting) step away too: the page behind is inert.
    let hide = launcherOff || (!!afterEl && phone.matches && afterEl.getBoundingClientRect().bottom > 0) || menuOpen();
    let hush = false;
    for (const el of onScreen) {
      const r = el.getBoundingClientRect();
      hide ||= hits(r, b);
      hush ||= !!bub?.width && hits(r, bub);
    }
    for (const el of hushEls) {
      if (el.hidden || el.hasAttribute("data-away")) continue;
      hush ||= !!bub?.width && hits(el.getBoundingClientRect(), bub);
    }
    host.toggleAttribute("data-dodge", hide && !chatOpen && !host.matches(":focus-within"));
    // The bubble alone steps aside while it would cover a marked element (the launcher may stay).
    host.toggleAttribute("data-hush", hush);
  };
  const schedule = () => void (frame ||= requestAnimationFrame(update));
  // Only the marked elements near the viewport are measured on scroll.
  if ("IntersectionObserver" in window) {
    onScreen.clear();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) en.isIntersecting ? onScreen.add(en.target as HTMLElement) : onScreen.delete(en.target as HTMLElement);
        schedule();
      },
      { rootMargin: "64px 0px" },
    );
    for (const el of avoidEls) io.observe(el);
  }
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  phone.addEventListener("change", schedule);
  document.addEventListener("focusout", schedule);
  document.addEventListener("mh:chat-art", schedule); // the avatar and its bubble have just been added
  document.addEventListener("mh:dock", schedule); // the dock has just come or gone
  document.addEventListener("mh:menu", schedule);
  document.addEventListener("mh:chat-state", (e) => {
    chatOpen = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    // At once, not on the next frame: the panel focuses its composer right after this event, and a hidden host
    // can't take focus.
    if (chatOpen) hostEl()?.removeAttribute("data-dodge");
    schedule();
  });
  // Decide in the first frame the host exists (it stays hidden until the avatar has dressed it, chat-avatar.ts).
  if (hostEl()) schedule();
  else {
    const mo = new MutationObserver(() => {
      if (!hostEl()) return;
      mo.disconnect();
      schedule();
    });
    mo.observe(document.body, { childList: true });
  }
}

/* ------------------------------------------------------------------ home: section scroll-spy */
const spyLinks = [...document.querySelectorAll<HTMLAnchorElement>(".nav__links a[data-section]")].filter((a) => a.getAttribute("href")?.startsWith("#"));
if (spyLinks.length && "IntersectionObserver" in window) {
  const byId = new Map(spyLinks.map((a) => [a.dataset.section!, a]));
  const visible = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) en.isIntersecting ? visible.add(en.target.id) : visible.delete(en.target.id);
      const order = [...byId.keys()];
      const current = order.find((id) => visible.has(id));
      for (const [id, a] of byId) id === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current");
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const id of byId.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}

/* ------------------------------------------------------------------ reveal on scroll */
const reveal = document.querySelectorAll<HTMLElement>("[data-reveal]");
if (reveal.length) {
  if (reduceMq.matches || !("IntersectionObserver" in window)) for (const el of reveal) el.classList.add("is-in");
  else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries)
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of reveal) io.observe(el);
  }
}

/* ------------------------------------------------------------------ PDFs on touch screens */
// A PDF link marked data-open-on-touch opens in the browser's viewer on a phone (it has its own share and save) rather
// than downloading an A4 file the phone can't show (audit CV-01). With a mouse it still downloads.
if (matchMedia("(pointer: coarse)").matches)
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[download][data-open-on-touch]")) a.removeAttribute("download");

/* ------------------------------------------------------------------ CSP violations: one report per page view */
// The per-page policy is a <meta> tag, which can't report on its own (audit SEC-H01): the first violation of a page view
// goes to the Worker, which keeps only the directive, the blocked host and the known page path.
document.addEventListener(
  "securitypolicyviolation",
  (e) => {
    const body = { documentURL: location.href, blockedURL: e.blockedURI, effectiveDirective: e.effectiveDirective, disposition: e.disposition };
    navigator.sendBeacon?.("/api/csp-report", new Blob([JSON.stringify(body)], { type: "application/json" }));
  },
  { once: true },
);

/* ------------------------------------------------------------------ live Cairo time */
const clocks = document.querySelectorAll<HTMLTimeElement>("time[data-cairo-time]");
if (clocks.length) {
  const fmt = new Intl.DateTimeFormat(root.lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const tick = () => {
    const now = new Date();
    for (const t of clocks) {
      t.textContent = fmt.format(now);
      t.dateTime = now.toISOString();
    }
  };
  tick();
  setInterval(tick, 30_000);
}
