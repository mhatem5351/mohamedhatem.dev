/**
 * Mounts the chat widget from ../chat-widget with the config ChatMount.astro rendered into #mh-chat-config, then
 * replays any "open chat" requests that arrived before it was ready (window.MHChatQueue, filled by site.ts).
 */
import { mountChat } from "@chat/index.ts";

type OpenRequest = { question?: string };
type ChatWindow = Window & { MHChatQueue?: OpenRequest[]; MHChat?: { open(o?: OpenRequest): void } };

export function mountChatWidget(): void {
  const el = document.getElementById("mh-chat-config");
  if (!el) return;
  const d = el.dataset;
  mountChat({
    lang: d.lang === "ar" ? "ar" : "en",
    turnstileSiteKey: d.turnstile || null,
    ...(d.avatar ? { avatarSrc: d.avatar } : {}),
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
}
