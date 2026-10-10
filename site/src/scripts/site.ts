/**
 * Site-wide behaviour, one small module on every page (no framework):
 *   theme (the toggle flips light ↔ dark and returns to "system" on the OS's own theme, persisted; segmented control in
 *   the menu), nav hairline after scroll, mobile menu,
 *   home scroll-spy, reveal on scroll, copy buttons, live Cairo clock, "open the assistant" triggers and the "/" key.
 * Everything degrades: without JS the page is complete (theme follows the OS, menu links are reachable in the
 * footer, the assistant offers email/WhatsApp in a <noscript> card).
 */

type Mode = "system" | "light" | "dark";
type OpenRequest = { question?: string };
type ChatWindow = Window & { MHChat?: { open(o?: OpenRequest): void }; MHChatQueue?: OpenRequest[] };

const root = document.documentElement;
const KEY = "mh-theme";
const darkMq = matchMedia("(prefers-color-scheme: dark)");
const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");

/* ------------------------------------------------------------------ theme */
function readMode(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
let mode: Mode = readMode();

function applyTheme(): void {
  const resolved = mode === "system" ? (darkMq.matches ? "dark" : "light") : mode;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  for (const b of document.querySelectorAll<HTMLElement>("[data-theme-toggle]")) {
    b.dataset.mode = mode;
    if (b.hasAttribute("data-cycle-only")) continue;
    const label = b.dataset[`label${mode[0]!.toUpperCase()}${mode.slice(1)}` as "labelSystem"];
    if (label) {
      b.setAttribute("aria-label", label);
      b.title = label;
    }
  }
  for (const b of document.querySelectorAll<HTMLElement>("[data-set-theme]")) b.setAttribute("aria-pressed", String(b.dataset.setTheme === mode));
  // Keep the browser chrome colour in step when the visitor forces a theme.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (!meta.dataset.original) meta.dataset.original = meta.content;
    meta.content = mode === "system" ? meta.dataset.original : resolved === "dark" ? "#0C151D" : "#FBF8F3";
  }
}

function setMode(next: Mode): void {
  mode = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  applyTheme();
}

applyTheme();
darkMq.addEventListener("change", () => mode === "system" && applyTheme());
addEventListener("storage", (e) => {
  if (e.key === KEY) {
    mode = readMode();
    applyTheme();
  }
});

/* ------------------------------------------------------------------ chat */
function openChat(req: OpenRequest = {}): void {
  const w = window as ChatWindow;
  if (w.MHChat?.open) w.MHChat.open(req);
  else (w.MHChatQueue ??= []).push(req);
}
(window as Window & { mhOpenChat?: typeof openChat }).mhOpenChat = openChat;

/* ------------------------------------------------------------------ clicks */
document.addEventListener("click", async (e) => {
  const target = e.target as Element | null;
  if (!target) return;

  const toggle = target.closest<HTMLElement>("[data-theme-toggle]");
  if (toggle) {
    // Every click flips what you see (light ↔ dark). Landing on the OS's own theme goes back to following the OS
    // ("system"), so a light-OS visitor gets system → dark → system …; the menu's segmented control can pin either.
    const next: Mode = root.dataset.theme === "dark" ? "light" : "dark";
    setMode(next === (darkMq.matches ? "dark" : "light") ? "system" : next);
    return;
  }
  const seg = target.closest<HTMLElement>("[data-set-theme]");
  if (seg) {
    setMode((seg.dataset.setTheme as Mode) || "system");
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

/* ------------------------------------------------------------------ nav: hairline + mobile menu */
const nav = document.querySelector<HTMLElement>("[data-nav]");
if (nav) {
  const onScroll = () => (nav.dataset.scrolled = String(scrollY > 8));
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
  // The chat panel's top edge sits below the sticky header (chat-widget README: --mh-chat-top). The widget measures it
  // too when it opens; this keeps the page-level value right from the start and whenever the header's height changes
  // (zoom, text size, a wrapped nav). The header is sticky at the top, so its height is its bottom edge.
  const setChatTop = () => root.style.setProperty("--mh-chat-top", `${Math.round(nav.getBoundingClientRect().height) + 12}px`);
  setChatTop();
  if ("ResizeObserver" in window) new ResizeObserver(setChatTop).observe(nav);
}

const menuBtn = document.querySelector<HTMLButtonElement>("[data-menu-button]");
const sheet = document.querySelector<HTMLElement>("[data-menu-sheet]");
if (menuBtn && sheet) {
  const set = (open: boolean, focusButton: boolean = true) => {
    sheet.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", (open ? menuBtn.dataset.labelClose : menuBtn.dataset.labelOpen) || "");
    if (open) sheet.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    else if (focusButton) menuBtn.focus({ preventScroll: true });
  };
  menuBtn.addEventListener("click", () => set(Boolean(sheet.hidden)));
  sheet.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a")) set(false, false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) set(false);
  });
  document.addEventListener("click", (e) => {
    const t = e.target as Node;
    if (!sheet.hidden && !sheet.contains(t) && !menuBtn.contains(t)) set(false, false);
  });
  // Tabbing out of the open sheet (past its last control, or back past the menu button) closes it, leaving focus
  // where it went, so the sheet never lingers over the element that has focus.
  for (const el of [sheet, menuBtn])
    el.addEventListener("focusout", (e) => {
      const next = (e as FocusEvent).relatedTarget as Node | null;
      if (!sheet.hidden && next && !sheet.contains(next) && !menuBtn.contains(next)) set(false, false);
    });
  // Closing the sheet when the layout grows past the breakpoint keeps aria-expanded truthful.
  matchMedia("(min-width: 64rem)").addEventListener("change", (e) => e.matches && !sheet.hidden && set(false, false));
}

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
  update();
  if ("ResizeObserver" in window) new ResizeObserver(update).observe(wrap);
  void document.fonts?.ready.then(update);
}

/* ------------------------------------------------------------------ toolbox disclosure (phones) */
// Below 40rem the long tool list sits behind "Show all N tools" (home-b.css hides it while .js is set, so there is no
// shift on load); the button only toggles it. Without JS the list is always shown.
for (const box of document.querySelectorAll<HTMLElement>("[data-toolbox]")) {
  const btn = box.querySelector<HTMLButtonElement>("[data-toolbox-toggle]");
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
const avoidEls = [...document.querySelectorAll<HTMLElement>("[data-chat-avoid]")];
const afterEl = document.querySelector<HTMLElement>("[data-chat-after]");
if (avoidEls.length || afterEl) {
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
    let hide = !!afterEl && phone.matches && afterEl.getBoundingClientRect().bottom > 0;
    for (const el of onScreen) {
      if (hide) break;
      const r = el.getBoundingClientRect();
      hide = r.width > 0 && r.right + PAD > b.left && r.left - PAD < b.right && r.bottom + PAD > b.top && r.top - PAD < b.bottom;
    }
    host.toggleAttribute("data-dodge", hide && !chatOpen && !host.matches(":focus-within"));
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
  document.addEventListener("mh:chat-state", (e) => {
    chatOpen = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    // At once, not on the next frame: the panel focuses its composer right after this event, and a hidden host
    // can't take focus.
    if (chatOpen) hostEl()?.removeAttribute("data-dodge");
    schedule();
  });
  // The widget mounts its host after this module runs: decide as soon as it exists, before its entrance animation.
  if (hostEl()) schedule();
  else {
    const mo = new MutationObserver(() => {
      if (!hostEl()) return;
      mo.disconnect();
      update();
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
