/**
 * Mounts the chat widget from ../chat-widget with the config ChatMount.astro rendered into #mh-chat-config, then
 * replays any "open chat" requests that arrived before it was ready (window.MHChatQueue, filled by site.ts).
 *
 * The launcher is then dressed as Hatem's avatar with its speech bubble (chat-avatar.ts), loaded once the page has
 * loaded and the browser is idle. Until it is in, the launcher is hidden (site.css: [data-mh-chat]:not([data-art])),
 * so the default launcher never shows and then changes shape; if the module can't load, data-art="off" shows the
 * default one. The panel header uses the same avatar once it has loaded (ChatWidgetConfig.avatar).
 *
 * Two more things for phones (see `warmUp` and `manners` below): the panel is ready before the first tap, and the
 * launcher keeps off what the visitor is reading or typing.
 */
import { mountChat, type ChatLauncher } from "@chat/index.ts";

type OpenRequest = { question?: string };
type ChatWindow = Window & { MHChatQueue?: OpenRequest[]; MHChat?: { open(o?: OpenRequest): void; warm?(): void; launcher?: ChatLauncher } };
type Connection = { saveData?: boolean; effectiveType?: string };

export function mountChatWidget(): void {
  const el = document.getElementById("mh-chat-config");
  if (!el) return;
  const d = el.dataset;
  let header: (() => Element) | undefined;
  mountChat({
    lang: d.lang === "ar" ? "ar" : "en",
    turnstileSiteKey: d.turnstile || null,
    ...(d.avatar ? { avatarSrc: d.avatar } : {}),
    ...(d.subtitle ? { subtitle: d.subtitle } : {}),
    avatar: () => header?.(),
    contact: {
      whatsapp: d.whatsapp ?? "",
      phoneDisplay: d.phone ?? "",
      email: d.email ?? "",
      altEmail: d.altEmail ?? "",
      linkedin: d.linkedin ?? "",
      github: d.github ?? "",
    },
  });
  const w = window as ChatWindow;
  const queued = w.MHChatQueue ?? [];
  w.MHChatQueue = [];
  for (const req of queued) w.MHChat?.open(req);

  const launcher = w.MHChat?.launcher;
  if (!launcher) return;
  manners(launcher.host, launcher.button);
  const prefetch = warmUp(w);
  const afterLoad = (fn: () => void) => (document.readyState === "complete" ? fn() : addEventListener("load", fn, { once: true }));
  const fallback = () => (launcher.host.dataset.art ||= "off");
  if (!d.avName || !d.avHi || !d.avText || !d.avHide) {
    fallback();
    return afterLoad(prefetch);
  }
  const copy = { name: d.avName, hi: d.avHi, text: d.avText, hide: d.avHide };
  const load = () =>
    import("./chat-avatar")
      .then((m) => (header = m.mountAvatar(launcher, copy, { disc: d.avDisc || "dark", greet: d.avGreet !== "off" }).header))
      .catch(fallback)
      .finally(prefetch); // after the avatar, which the panel header shows too
  afterLoad(() => ("requestIdleCallback" in window ? requestIdleCallback(() => void load(), { timeout: 1500 }) : setTimeout(load, 300)));
}

/**
 * The first open feels instant: the panel (its code, then the panel itself) is fetched and built as soon as the
 * visitor shows the intent to open it (pointerdown or focus on any [data-open-chat] button or the hero's ask bar; the
 * launcher does the same on its own), and otherwise once the page is idle, except with Save-Data or on 2G.
 * Safari doesn't focus a button it taps or clicks: the button that opens the chat takes focus here, so focus can go
 * back to it when the chat closes (the widget returns it to whatever had focus when it opened).
 * Returns the idle prefetch, to run once the avatar is in.
 */
function warmUp(w: ChatWindow): () => void {
  const warm = () => w.MHChat?.warm?.();
  const intent = (e: Event) => (e.target as Element).closest?.("[data-open-chat],[data-hero-ask]") && warm();
  document.addEventListener("pointerdown", intent, { capture: true, passive: true });
  document.addEventListener("focusin", intent);
  // Before site.ts's click handler opens the chat (capture phase).
  document.addEventListener(
    "click",
    (e) => (e.target as Element).closest?.<HTMLElement>("button[data-open-chat]")?.focus({ preventScroll: true }),
    { capture: true },
  );
  const net = (navigator as Navigator & { connection?: Connection }).connection;
  if (net?.saveData || /2g/.test(net?.effectiveType ?? "")) return () => {};
  return () => void ("requestIdleCallback" in window ? requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 1500));
}

/**
 * The launcher steps aside (data-aside on the widget's host, styled here like site.ts's data-dodge: it fades out, then
 * leaves the tab order) while
 *   - a text field outside the widget has focus on a touch screen: the keyboard is up, and with
 *     interactive-widget=resizes-content the launcher would ride up onto the field;
 *   - it is over a form (the contact form: its fields and its controls, not only Send);
 *   - on phones, the visitor scrolls down the page: nothing slides under it while they read on, and it comes back
 *     as soon as they stop (1.2 s), scroll up or reach the end of the page. Over a text to read ([data-chat-read]:
 *     the CV sheet, whose lines run to the screen's edge on a phone) it doesn't come back on its own after a scroll
 *     down: only on a scroll up, past that text or at the end of the page, so it never sits on the line ends being
 *     read. It is there when the page opens, and a small scroll up always brings it back.
 * Never while the chat is open or the launcher has focus. The avatar (chat-avatar.ts) waits for it to come back
 * before it greets. The phone action dock steps aside with it (dock.ts), so the two never look half there.
 */
function manners(host: HTMLElement, button: HTMLElement): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(
    "[data-mh-chat][data-aside]{opacity:0;visibility:hidden;transition:opacity var(--duration-fast) var(--ease-standard),visibility 0s linear var(--duration-fast)}" +
      "@media (prefers-reduced-motion:reduce){[data-mh-chat][data-aside]{transition:none}}",
  );
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const touch = matchMedia("(pointer: coarse), (max-width: 39.99rem)");
  const phone = matchMedia("(max-width: 39.99rem)");
  const FIELD = "input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=range],[type=color],[type=file],[type=image]),textarea,select,[contenteditable]:not([contenteditable=false])";
  const forms = [...document.querySelectorAll("form")];
  const texts = [...document.querySelectorAll("[data-chat-read]")];
  const PAD = 12;
  let open = false;
  let reading = false;
  let lastY = scrollY;
  let frame = 0;
  let pause = 0;

  /** The launcher (measured even while it is aside) is over one of `els`, with `pad` px around it. */
  const over = (els: Element[], pad: number) => {
    const b = button.getBoundingClientRect();
    return els.some((f) => {
      const r = f.getBoundingClientRect();
      return r.width > 0 && r.right + pad > b.left && r.left - pad < b.right && r.bottom + pad > b.top && r.top - pad < b.bottom;
    });
  };
  const update = () => {
    frame = 0;
    const a = document.activeElement;
    const typing = touch.matches && !!a && a !== host && a.matches(FIELD);
    host.toggleAttribute("data-aside", !open && !host.matches(":focus-within") && (typing || over(forms, PAD) || reading));
  };
  const schedule = () => void (frame ||= requestAnimationFrame(update));

  addEventListener(
    "scroll",
    () => {
      const y = scrollY;
      const end = y + innerHeight >= document.documentElement.scrollHeight - 48;
      // 8 px of hysteresis: jitter keeps the direction.
      if (end || Math.abs(y - lastY) >= 8) {
        reading = phone.matches && !end && y > lastY;
        lastY = y;
      }
      clearTimeout(pause);
      // Still for 1.2 s: back, unless it would sit on the text being read (then a scroll up or the end brings it).
      if (reading) pause = window.setTimeout(() => over(texts, 0) || ((reading = false), schedule()), 1200);
      schedule();
    },
    { passive: true },
  );
  addEventListener("resize", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  document.addEventListener("mh:chat-state", (e) => {
    open = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    // At once, not on the next frame: the panel is inside the host, which must be visible.
    if (open) host.removeAttribute("data-aside");
    else reading = false; // back from the chat: the launcher is where the visitor left it
    schedule();
  });
  update();
}
