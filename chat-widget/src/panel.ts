/**
 * The chat panel: loaded on demand by index.ts (first hover / focus / tap on the bubble). Owns the conversation,
 * the streaming request, Turnstile, persistence and every tool UI. Protocol: worker/src/chat/protocol.ts.
 */
import { CHAT_LIMITS, SECTION_IDS } from "../../worker/src/chat/protocol";
import type { ChatMessage, DoneEvent, MetaEvent, SectionId, ToolEvent } from "../../worker/src/chat/protocol";
import { streamChat, type Outcome } from "./api";
import { h, icon } from "./dom";
import { SUGGESTIONS } from "./generated/suggestions";
import { CONTACT_ON_ERROR, FINAL_ERRORS, SECTION_LABELS, STRINGS, errorKey, fill } from "./i18n";
import { detectLang } from "./lang";
import { renderMarkdown } from "./markdown";
import { PANEL_CSS } from "./panel-css";
import { getSessionExp, loadEntries, saveEntries, setSessionExp, type Entry } from "./store";
import { contactCard, jumpLink } from "./tools";
import { createVerifier } from "./turnstile";
import type { ContactConfig, OpenOptions, PanelApi, PanelContext } from "./types";

const DEFAULT_CONTACT: ContactConfig = {
  whatsapp: "201142070946",
  email: "hatem@mohamedhatem.dev",
  linkedin: "https://www.linkedin.com/in/mohamed-hatem-6a5790173",
};
/** Full-screen modal sheet below this (phones, and short landscape windows). */
const SHEET = "(max-width: 639.98px), (max-height: 520px)";
const SLOW_MS = 9000;
const SESSION_MARGIN_MS = 60_000;

const uid = () => Math.random().toString(36).slice(2, 10);

export function createPanel(ctx: PanelContext): PanelApi {
  const { host, root, bubble, config, lang, key } = ctx;
  const t = STRINGS[lang];
  const contact: ContactConfig = { ...DEFAULT_CONTACT, ...config.contact };
  const apiUrl = `${(config.apiBase ?? "").replace(/\/+$/, "")}/api/chat`;
  const credentials: RequestCredentials = new URL(apiUrl, location.href).origin === location.origin ? "same-origin" : "include";
  const sheet = matchMedia(SHEET);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  let entries: Entry[] = loadEntries(key);
  let isOpen = false;
  let busy: AbortController | null = null;
  let phase: "verifying" | "thinking" | "slow" = "thinking";
  let current: { entry: Entry; el: HTMLElement; body: HTMLElement } | null = null;
  let frame = 0;
  let slowTimer = 0;
  let tick = 0;
  let chips: HTMLElement | null = null;
  let inerted: HTMLElement[] = [];
  let overflow: string | null = null;

  /* ---------------------------------------------------------------- DOM */

  const avatar = config.avatarSrc
    ? h("img", { class: "av", src: config.avatarSrc, alt: "", width: "40", height: "40", decoding: "async" })
    : h("span", { class: "av", "aria-hidden": "true" }, "MH");
  const newBtn = h("button", { type: "button", class: "ib", "aria-label": t.newChat, title: t.newChat }, icon("new"));
  const closeBtn = h("button", { type: "button", class: "ib", "aria-label": t.close, title: t.close }, icon("close"));
  const offline = h("p", { class: "off", role: "status", hidden: navigator.onLine }, t.offline);
  const log = h("div", { class: "log", role: "log", "aria-live": "off", "aria-label": t.conversation, tabindex: "0" });
  const verify = h("p", { class: "vf", role: "status", hidden: true }, t.verifyPrompt);
  const ta = h("textarea", {
    rows: "1",
    maxlength: String(CHAT_LIMITS.maxUserChars),
    placeholder: t.placeholder,
    "aria-label": t.input,
    "aria-describedby": "mhc-count",
    enterkeyhint: "send",
    dir: "auto",
  });
  const count = h("span", { id: "mhc-count", class: "ct", hidden: true });
  const send = h("button", { type: "submit", class: "go", "aria-label": t.send, title: t.send, disabled: true }, icon("send"));
  const stop = h("button", { type: "button", class: "go stop", "aria-label": t.stop, title: t.stop, hidden: true }, icon("stop"));
  const form = h("form", { class: "cp" }, ta, count, send, stop);
  const live = h("div", { class: "sr", "aria-live": "polite", "aria-atomic": "true" });
  const panel = h(
    "div",
    { class: "pn", id: "mhc-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "mhc-title", "aria-describedby": "mhc-disc" },
    h(
      "div",
      { class: "hd" },
      h("span", { class: "avw" }, avatar),
      h("div", { class: "hx" }, h("h2", { id: "mhc-title", class: "ti" }, t.title), h("p", { id: "mhc-disc", class: "di" }, t.disclaimer)),
      newBtn,
      closeBtn,
    ),
    offline,
    log,
    verify,
    h("slot", { name: "turnstile" }),
    form,
    live,
  );
  ctx.addStyles(PANEL_CSS);
  root.append(panel);
  bubble.setAttribute("aria-controls", "mhc-panel");

  // Turnstile lives in the light DOM (slotted into the panel): its iframe is unreliable inside shadow roots.
  const verifier = config.turnstileSiteKey
    ? createVerifier(host.appendChild(h("div", { slot: "turnstile" })), config.turnstileSiteKey, lang, (visible) => (verify.hidden = !visible))
    : null;

  /* ---------------------------------------------------------------- rendering */

  const announce = (msg: string) => {
    live.textContent = "";
    setTimeout(() => (live.textContent = msg), 50);
  };
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 72;
  const toBottom = () => (log.scrollTop = log.scrollHeight);
  /** While an answer streams in, scroll with it, but never past the point where the question reaches the top. */
  const follow = () => {
    const q = current?.el.previousElementSibling;
    const max = log.scrollHeight - log.clientHeight;
    log.scrollTop = q ? Math.min(max, log.scrollTop + q.getBoundingClientRect().top - log.getBoundingClientRect().top - 12) : max;
  };
  const dirOf = (text: string) => (detectLang(text, lang) === "ar" ? "ar" : "en");

  function thinking(): HTMLElement {
    const label = phase === "verifying" ? t.verifying : phase === "slow" ? t.slow : t.thinking;
    return h("p", { class: "th" }, h("span", { class: "dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")), label);
  }

  function fillBody(body: HTMLElement, e: Entry): void {
    const streaming = e.status === "streaming";
    if (streaming && !e.content) {
      body.replaceChildren(thinking());
      return;
    }
    const l = e.content ? dirOf(e.content) : lang;
    body.dir = l === "ar" ? "rtl" : "ltr";
    body.lang = l;
    body.replaceChildren(renderMarkdown(e.content, { isolate: l === "ar", cursor: streaming }));
  }

  function toolsEl(e: Entry): HTMLElement | null {
    const nodes: HTMLElement[] = [];
    const seen = new Set<string>();
    for (const tool of e.tools ?? []) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      if (tool.name === "show_contact_card") nodes.push(contactCard(contact, t, announce));
      if (tool.name === "open_section") {
        const id = tool.args?.id as SectionId;
        if (!SECTION_IDS.includes(id)) continue;
        const sec = config.sections?.[id];
        nodes.push(jumpLink(sec?.href ?? `#${id}`, fill(t.jump, { s: sec?.label[lang] ?? SECTION_LABELS[id][lang] })));
      }
    }
    return nodes.length ? h("div", { class: "tl" }, ...nodes) : null;
  }

  function errorEl(e: Entry): HTMLElement {
    const code = e.error?.code ?? "internal";
    const msg = h("p", {}, t[errorKey(code)]);
    const box = h("div", { class: "err" }, msg);
    // Every model busy or over its free quota, or the API is down: offer the direct contact options right here.
    if (CONTACT_ON_ERROR.has(code) && !e.tools?.some((x) => x.name === "show_contact_card")) box.append(contactCard(contact, t, announce));
    if (FINAL_ERRORS.has(code) || e !== entries.at(-1)) return box;
    const retry = h("button", { type: "button", class: "rt" }, icon("retry"), t.retry);
    retry.addEventListener("click", () => {
      if (busy) return;
      entries = entries.filter((x) => x !== e);
      const last = entries.at(-1);
      if (last?.role === "user") void ask(last.content, true);
    });
    box.append(retry);
    const until = (e.error?.until ?? 0) - Date.now();
    if (code === "rate_limited" && until > 0) {
      // Count down to the moment the rate limit lifts, then enable Retry.
      retry.disabled = true;
      const update = () => {
        const s = Math.ceil(((e.error?.until ?? 0) - Date.now()) / 1000);
        if (s > 0) return void (msg.textContent = fill(t.e_rate, { s }));
        clearInterval(tick);
        msg.textContent = t.e_rateReady;
        retry.disabled = false;
      };
      update();
      clearInterval(tick);
      tick = window.setInterval(update, 1000);
    } else if (code === "rate_limited") {
      msg.textContent = t.e_rateReady;
    }
    return box;
  }

  function entryEl(e: Entry): HTMLElement {
    if (e.role === "user") {
      const l = dirOf(e.content);
      return h("div", { class: "msg u" }, h("p", { class: "ub", dir: l === "ar" ? "rtl" : "ltr", lang: l }, e.content));
    }
    const body = h("div", { class: "md" });
    fillBody(body, e);
    const el = h("div", { class: "msg a" }, body);
    const tools = toolsEl(e);
    if (tools) el.append(tools);
    if (e.status === "stopped") el.append(h("p", { class: "note" }, t.stopped));
    if (e.status === "done" && e.cut) el.append(h("p", { class: "note" }, t.cut));
    if (e.status === "error") el.append(errorEl(e));
    if (e.status === "streaming") current = { entry: e, el, body };
    return el;
  }

  function renderChips(): void {
    chips?.remove();
    chips = null;
    if (busy) return;
    const last = entries.at(-1);
    let qs: (string | { label: string; prompt: string })[] = [];
    if (!entries.length) qs = (config.suggestions?.[lang] ?? SUGGESTIONS[lang]).slice(0, sheet.matches ? 4 : 8);
    else if (last?.role === "assistant" && last.status === "done") {
      const f = last.tools?.find((x) => x.name === "suggest_followups");
      if (f?.name === "suggest_followups" && Array.isArray(f.args?.questions)) qs = f.args.questions.slice(0, 3);
    }
    chips = h("div", { class: "chips", role: "group", "aria-label": t.suggested });
    for (const q of qs) {
      const label = (typeof q === "string" ? q : q?.label)?.trim().slice(0, 160);
      const prompt = (typeof q === "string" ? q : q?.prompt)?.trim();
      if (!label || !prompt) continue;
      const b = h("button", { type: "button", class: "chip", dir: "auto", lang: dirOf(label) }, label);
      b.addEventListener("click", () => void ask(prompt));
      chips.append(b);
    }
    if (!chips.childElementCount) return void (chips = null);
    log.append(chips);
  }

  function renderAll(): void {
    clearInterval(tick);
    current = null;
    log.replaceChildren();
    if (!entries.length) {
      log.append(
        h(
          "div",
          { class: "msg a" },
          h("div", { class: "md", dir: lang === "ar" ? "rtl" : "ltr" }, h("p", {}, t.welcome), h("p", { class: "pv" }, t.privacy)),
        ),
      );
    }
    for (const e of entries) log.append(entryEl(e));
    renderChips();
    toBottom();
  }

  /** Streaming: re-render the current answer at most once per frame, keeping the view pinned to the end. */
  function schedule(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!current) return;
      const stick = nearBottom();
      fillBody(current.body, current.entry);
      if (stick) follow();
    });
  }

  function setPhase(p: typeof phase): void {
    phase = p;
    if (current && !current.entry.content) fillBody(current.body, current.entry);
  }

  /* ---------------------------------------------------------------- conversation */

  const save = () => saveEntries(key, entries);
  const sessionValid = () => getSessionExp(key) - SESSION_MARGIN_MS > Date.now();

  /** What the Worker gets: role + content of the last 12 settled messages, within the 16 KB body cap. */
  function outgoing(): ChatMessage[] {
    const msgs = entries
      .filter((e) => e.status !== "streaming" && (e.role === "user" || (e.content.trim() && e.status !== "error")))
      .map((e) => ({
        role: e.role,
        content: e.content.slice(0, e.role === "user" ? CHAT_LIMITS.maxUserChars : CHAT_LIMITS.maxAssistantChars),
      }))
      .slice(-CHAT_LIMITS.maxMessages);
    const enc = new TextEncoder();
    while (msgs.length > 1 && enc.encode(JSON.stringify(msgs)).length > CHAT_LIMITS.maxBodyBytes - 3072) msgs.shift();
    return msgs;
  }

  function setBusy(on: boolean): void {
    const active = root.activeElement;
    send.hidden = on;
    stop.hidden = !on;
    log.setAttribute("aria-busy", String(on));
    if (on && active === send) stop.focus();
    if (!on && active === stop) ta.focus();
    updateSend();
  }

  function updateSend(): void {
    send.disabled = !ta.value.trim() || !navigator.onLine;
    const n = ta.value.length;
    count.hidden = n < CHAT_LIMITS.maxUserChars - 200;
    count.textContent = fill(t.counter, { n, max: CHAT_LIMITS.maxUserChars });
  }

  async function request(entry: Entry, ctrl: AbortController, question: string): Promise<Outcome> {
    for (let attempt = 0; ; attempt++) {
      let turnstileToken: string | undefined;
      if (verifier && !sessionValid()) {
        setPhase("verifying");
        try {
          turnstileToken = await verifier.token(ctrl.signal);
        } catch {
          return ctrl.signal.aborted ? { kind: "aborted" } : { kind: "error", code: "turnstile_failed", pre: true };
        }
        setPhase("thinking");
      }
      const out = await streamChat(
        apiUrl,
        { messages: outgoing(), lang: detectLang(question, lang), ...(turnstileToken ? { turnstileToken } : {}) },
        ctrl.signal,
        credentials,
        (event, data) => onEvent(entry, event, data),
      );
      // No (valid) session after all: get a fresh token and try once more.
      if (out.kind === "error" && out.pre && /^turnstile_/.test(out.code) && verifier && attempt === 0) {
        setSessionExp(key, null);
        verifier.discard();
        continue;
      }
      return out;
    }
  }

  function onEvent(entry: Entry, event: string, data: unknown): void {
    if (event === "meta") {
      const exp = (data as MetaEvent | null)?.sessionExp;
      if (typeof exp === "number") setSessionExp(key, exp);
    } else if (event === "token") {
      const piece = (data as { t?: unknown } | null)?.t;
      if (typeof piece !== "string") return;
      if (!entry.content) clearTimeout(slowTimer);
      entry.content += piece;
      schedule();
    } else if (event === "done") {
      if ((data as DoneEvent | null)?.finish === "length") entry.cut = true;
    } else if (event === "tool") {
      const tool = data as ToolEvent | null;
      if (!tool || typeof tool.name !== "string") return;
      (entry.tools ??= []).push(tool);
      if (current?.entry === entry) {
        current.el.querySelector(".tl")?.remove();
        const stick = nearBottom();
        const tools = toolsEl(entry);
        if (tools) current.el.append(tools);
        if (stick) follow();
      }
    }
  }

  async function ask(raw: string, retry = false): Promise<void> {
    const text = raw.trim().slice(0, CHAT_LIMITS.maxUserChars);
    if (!text || busy) return;
    if (!navigator.onLine) return void (offline.hidden = false);
    if (!retry) entries.push({ id: uid(), role: "user", content: text });
    const entry: Entry = { id: uid(), role: "assistant", content: "", status: "streaming" };
    entries.push(entry);
    save();
    const ctrl = new AbortController();
    busy = ctrl;
    phase = "thinking";
    setBusy(true);
    renderAll();
    follow();
    announce(t.thinking);
    clearTimeout(slowTimer);
    slowTimer = window.setTimeout(() => phase === "thinking" && setPhase("slow"), SLOW_MS);

    const out = await request(entry, ctrl, text);

    clearTimeout(slowTimer);
    cancelAnimationFrame(frame);
    frame = 0;
    if (busy === ctrl) busy = null;
    if (!entries.includes(entry)) return void setBusy(!!busy); // "New chat" while streaming
    if (out.kind === "done") entry.status = "done";
    else if (out.kind === "aborted") entry.status = "stopped";
    else {
      entry.status = "error";
      entry.error = { code: out.code, ...(out.retryAfter ? { until: Date.now() + out.retryAfter * 1000 } : {}) };
    }
    save();
    setBusy(false);
    const stick = nearBottom();
    const el = entryEl(entry);
    current?.el.replaceWith(el);
    current = null;
    renderChips();
    if (stick || out.kind !== "done") toBottom();
    const body = el.querySelector(".md")?.textContent?.trim() ?? "";
    announce(out.kind === "done" ? t.answered + body : out.kind === "aborted" ? t.stopped : el.querySelector(".err p")?.textContent ?? "");
  }

  /* ---------------------------------------------------------------- open / close / modal sheet */

  function applyMode(): void {
    const modal = isOpen && sheet.matches;
    panel.setAttribute("aria-modal", String(modal));
    host.toggleAttribute("data-modal", modal);
    if (modal && !inerted.length) {
      // Modal sheet: everything else is inert (unfocusable, hidden from assistive tech) and the page can't scroll.
      for (const el of Array.from(document.body.children) as HTMLElement[]) {
        if (el !== host && !el.inert && el.tagName !== "SCRIPT") {
          el.inert = true;
          inerted.push(el);
        }
      }
      overflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
    } else if (!modal && inerted.length) {
      for (const el of inerted) el.inert = false;
      inerted = [];
      document.documentElement.style.overflow = overflow ?? "";
    }
  }

  function open(o?: OpenOptions): void {
    if (!isOpen) {
      isOpen = true;
      panel.setAttribute("data-open", "");
      bubble.setAttribute("aria-expanded", "true");
      applyMode();
      if (verifier && !sessionValid()) verifier.prepare();
      toBottom();
      ta.focus({ preventScroll: true });
    }
    const q = o?.question?.trim();
    if (q) {
      if (o?.send === false) {
        ta.value = q;
        autosize();
        ta.focus();
      } else void ask(q);
    }
  }

  function close(returnFocus = true): void {
    if (!isOpen) return;
    isOpen = false;
    panel.removeAttribute("data-open");
    bubble.setAttribute("aria-expanded", "false");
    applyMode();
    if (returnFocus) bubble.focus();
  }

  /* ---------------------------------------------------------------- events */

  function autosize(): void {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight + 2, 144)}px`;
    updateSend();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy || !ta.value.trim()) return;
    const v = ta.value;
    ta.value = "";
    autosize();
    void ask(v);
  });
  ta.addEventListener("input", autosize);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  stop.addEventListener("click", () => busy?.abort());
  closeBtn.addEventListener("click", () => close());
  newBtn.addEventListener("click", () => {
    busy?.abort();
    busy = null;
    entries = [];
    save();
    setBusy(false);
    renderAll();
    ta.focus();
    announce(t.newChat);
  });

  root.addEventListener("keydown", (e) => {
    const ev = e as KeyboardEvent;
    if (!isOpen) return;
    if (ev.key === "Escape" && !ev.isComposing) {
      ev.preventDefault();
      close();
    } else if (ev.key === "Tab" && sheet.matches) {
      // Focus trap for the modal sheet (Turnstile's slotted iframe sits between the ends, in natural order).
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button,textarea,a[href],[tabindex='0']")).filter(
        (x) => !(x as HTMLButtonElement).disabled && x.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items.at(-1);
      const active = root.activeElement;
      if (ev.shiftKey && (active === first || !panel.contains(active))) {
        ev.preventDefault();
        last?.focus();
      } else if (!ev.shiftKey && (active === last || !panel.contains(active))) {
        ev.preventDefault();
        first?.focus();
      }
    }
  });

  // In-page links (#section, or this page's URL + hash): scroll there instead of navigating.
  log.addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.("a");
    const href = a?.getAttribute("href");
    if (!href) return;
    let id = "";
    try {
      const u = new URL(href, location.href);
      if (u.origin === location.origin && u.pathname === location.pathname && u.hash) id = decodeURIComponent(u.hash.slice(1));
    } catch {
      return;
    }
    if (!id) return;
    const target = document.getElementById(id);
    e.preventDefault();
    if (!target) {
      location.href = `${lang === "ar" ? "/ar/" : "/"}#${encodeURIComponent(id)}`;
      return;
    }
    const modal = sheet.matches;
    if (modal) close(false);
    target.scrollIntoView({ behavior: reduced.matches ? "auto" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${id}`);
    if (modal) {
      if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  });

  const onNetwork = () => {
    offline.hidden = navigator.onLine;
    updateSend();
  };
  addEventListener("online", onNetwork);
  addEventListener("offline", onNetwork);
  sheet.addEventListener("change", () => {
    applyMode();
    if (!entries.length) renderChips();
  });

  renderAll();

  return {
    open,
    close: () => close(),
    toggle: () => (isOpen ? close() : open()),
    get isOpen() {
      return isOpen;
    },
  };
}
