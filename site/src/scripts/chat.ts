/**
 * Mounts the chat widget from ../chat-widget with the config ChatMount.astro rendered into #mh-chat-config, then
 * replays any "open chat" requests that arrived before it was ready (window.MHChatQueue, filled by site.ts).
 *
 * The launcher is then dressed as Hatem's avatar with its speech bubble (chat-avatar.ts), loaded once the page has
 * loaded and the browser is idle. Until it is in, the launcher is hidden (site.css: [data-mh-chat]:not([data-art])),
 * so the default launcher never shows and then changes shape; if the module can't load, data-art="off" shows the
 * default one. The panel header uses the same avatar once it has loaded (ChatWidgetConfig.avatar).
 */
import { mountChat, type ChatLauncher } from "@chat/index.ts";

type OpenRequest = { question?: string };
type ChatWindow = Window & { MHChatQueue?: OpenRequest[]; MHChat?: { open(o?: OpenRequest): void; launcher?: ChatLauncher } };

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
  const fallback = () => (launcher.host.dataset.art ||= "off");
  if (!d.avName || !d.avHi || !d.avText || !d.avHide) return void fallback();
  const copy = { name: d.avName, hi: d.avHi, text: d.avText, hide: d.avHide };
  const load = () =>
    import("./chat-avatar")
      .then((m) => (header = m.mountAvatar(launcher, copy, { disc: d.avDisc || "dark" }).header))
      .catch(fallback);
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(() => void load(), { timeout: 1500 }) : setTimeout(load, 300));
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}
