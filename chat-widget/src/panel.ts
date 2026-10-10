/**
 * The chat panel: loaded on demand by index.ts (first hover / focus / tap on the bubble). Owns the conversation,
 * the streaming request, Turnstile, persistence and every tool UI. Protocol: worker/src/chat/protocol.ts.
 */
import { CHAT_LIMITS, SECTION_IDS } from "../../worker/src/chat/protocol";
import type { ChatMessage, DoneEvent, MetaEvent, SectionId, TokenEvent, ToolEvent } from "../../worker/src/chat/protocol";
import { streamChat, type Outcome } from "./api";
import { h, icon, type IconName } from "./dom";
import { SUGGESTIONS } from "./generated/suggestions";
import { CONTACT_ON_ERROR, FINAL_ERRORS, SECTION_LABELS, STRINGS, errorKey, fill, num } from "./i18n";
import { detectLang } from "./lang";
import { renderMarkdown } from "./markdown";
import { PANEL_CSS } from "./panel-css";
import { getSessionExp, loadEntries, saveEntries, setOpenFlag, setSessionExp, type Entry } from "./store";
import { contactCard, jumpLink } from "./tools";
import { createVerifier } from "./turnstile";
import type { ContactConfig, OpenOptions, PanelApi, PanelContext } from "./types";

const DEFAULT_CONTACT: ContactConfig = {
  whatsapp: "201142070946",
  email: "hatem@mohamedhatem.dev",
  linkedin: "https://www.linkedin.com/in/mohamed-hatem-6a5790173",
};
/** Full-screen modal sheet below this (phones, and short landscape windows); spelled as in panel-css.ts. */
const SHEET = "(max-width:639.98px),(max-height:520px)";
const SLOW_MS = 9000;
const SESSION_MARGIN_MS = 60_000;
/** The visitor's latest message (a pasted job description fits); longer drafts get a notice, then are trimmed. */
const LIMIT = CHAT_LIMITS.maxLatestUserChars;
/** Share of an element's on-screen box under the desktop panel from which the element counts as hidden by it. */
const COVER = 0.4;

export function createPanel(ctx: PanelContext): PanelApi {
  const { host, root, bubble, config, lang, key } = ctx;
  const t = STRINGS[lang];
  const contact: ContactConfig = { ...DEFAULT_CONTACT, ...config.contact };
  const apiUrl = `${(config.apiBase ?? "").replace(/\/+$/, "")}/api/chat`;
  // Only these addresses may become mailto: links in answers (a planted one stays plain text).
  const emails = [contact.email, contact.altEmail ?? ""];
  const de = document.documentElement;
  const sheet = matchMedia(SHEET);

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

  const avatar =
    config.avatar?.() ??
    (config.avatarSrc
      ? h("img", { class: "av", src: config.avatarSrc, alt: "", width: "40", height: "40", decoding: "async" })
      : h("span", { class: "av", "aria-hidden": "true" }, "MH"));
  const button = (cls: string, label: string, ic: IconName, more = {}) =>
    h("button", { type: "button", class: cls, "aria-label": label, title: label, ...more }, icon(ic));
  const newBtn = button("ib", t.newChat, "new");
  const closeBtn = button("ib", t.close, "close");
  const offline = h("p", { class: "off", role: "status", hidden: navigator.onLine }, t.offline);
  const log = h("div", { class: "log", role: "log", "aria-live": "off", "aria-label": t.conversation, tabindex: "0" });
  const verify = h("p", { class: "vf", role: "status", hidden: true }, t.verifyPrompt);
  // Over-limit notice: always in the tree (a live region must exist before its text changes), empty otherwise.
  const notice = h("p", { id: "mhc-long", class: "ln", role: "status" });
  const ta = h("textarea", {
    rows: "1",
    placeholder: t.placeholder,
    "aria-label": t.input,
    "aria-describedby": "mhc-long mhc-count",
    enterkeyhint: "send",
    dir: "auto",
  });
  const count = h("span", { id: "mhc-count", class: "ct", hidden: true });
  const send = button("go", t.send, "send", { type: "submit", disabled: true });
  const stop = button("go stop", t.stop, "stop", { hidden: true });
  const form = h("form", { class: "cp" }, notice, ta, count, send, stop);
  const live = h("div", { class: "sr", "aria-live": "polite", "aria-atomic": "true" });
  const panel = h(
    "div",
    { class: "pn", id: "mhc-panel", role: "dialog", "aria-labelledby": "mhc-title", "aria-describedby": "mhc-sub mhc-disc" },
    h(
      "div",
      { class: "hd" },
      h("span", { class: "avw" }, avatar),
      h("div", { class: "hx" }, h("h2", { id: "mhc-title", class: "ti" }, t.title), h("p", { id: "mhc-sub", class: "di" }, config.subtitle ?? "")),
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
  /**
   * While an answer streams in, scroll with it, but never past the point where the question reaches the top. A very
   * long question (a pasted job description) shows only its end, so the answer stays in view.
   */
  const follow = () => {
    const a = current?.el;
    const q = a?.previousElementSibling;
    const max = log.scrollHeight - log.clientHeight;
    log.scrollTop = q
      ? Math.min(max, log.scrollTop + Math.max(q.getBoundingClientRect().top, a!.getBoundingClientRect().top - log.clientHeight * 0.4) - log.getBoundingClientRect().top - 12)
      : max;
  };
  const dirOf = (text: string) => detectLang(text, lang);

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
    body.replaceChildren(renderMarkdown(e.content, { isolate: l === "ar", cursor: streaming, emails }));
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
    // Every model busy, the site-wide limit reached, or the API down: offer the direct contact options right here.
    if (CONTACT_ON_ERROR.has(code) && !e.tools?.some((x) => x.name === "show_contact_card")) box.append(contactCard(contact, t, announce));
    if (FINAL_ERRORS.has(code) || e !== entries.at(-1)) return box;
    const retry = h("button", { type: "button", class: "rt" }, icon("retry"), t.retry);
    retry.addEventListener("click", () => {
      if (busy) return;
      entries = entries.filter((x) => x !== e);
      const last = entries.at(-1);
      // The button is about to be re-rendered away: keep focus in the panel.
      ta.focus({ preventScroll: true });
      if (last?.role === "user") void ask(last.content, true);
    });
    box.append(retry);
    if (code === "rate_limited") {
      // Count down to the moment the rate limit lifts, then enable Retry.
      const update = () => {
        const s = Math.ceil(((e.error?.until ?? 0) - Date.now()) / 1000);
        msg.textContent = s > 0 ? fill(t.e_rate, { s }) : t.e_rateReady;
        retry.disabled = s > 0;
        if (s <= 0) clearInterval(tick);
      };
      clearInterval(tick);
      tick = window.setInterval(update, 1000);
      update();
    }
    return box;
  }

  const note = (text: string) => h("p", { class: "note" }, text);

  function entryEl(e: Entry): HTMLElement {
    if (e.role === "user") {
      const l = dirOf(e.content);
      const el = h("div", { class: "msg u" }, h("p", { class: "ub", dir: l === "ar" ? "rtl" : "ltr", lang: l }, e.content));
      if (e.kept) el.append(note(fill(t.trimmed, { n: num(e.kept) })));
      return el;
    }
    const body = h("div", { class: "md" });
    fillBody(body, e);
    const el = h("div", { class: "msg a" }, body);
    const tools = toolsEl(e);
    if (tools) el.append(tools);
    const n = e.status === "stopped" ? t.stopped : e.status === "done" && e.cut && t.cut;
    if (n) el.append(note(n));
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
      const f = last.tools?.find((x) => x.name === "suggest_followups")?.args as { questions?: unknown } | undefined;
      if (Array.isArray(f?.questions)) qs = f.questions.slice(0, 3);
    }
    chips = h("div", { class: "chips", role: "group", "aria-label": t.suggested });
    for (const q of qs) {
      const [label, prompt] = (typeof q === "string" ? [q, q] : [q?.label, q?.prompt]).map((x) => x?.trim());
      if (!label || !prompt) continue;
      const b = h("button", { type: "button", class: "chip", dir: "auto", lang: dirOf(label) }, label.slice(0, 160));
      b.addEventListener("click", (e) => {
        // The chips are re-rendered away: keep focus in the panel. A tap in the sheet focuses the log, not the
        // textarea, so the on-screen keyboard doesn't cover the answer.
        (e.detail && sheet.matches ? log : ta).focus({ preventScroll: true });
        void ask(prompt);
      });
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
          h("div", { class: "md", dir: lang === "ar" ? "rtl" : "ltr" }, h("p", {}, t.welcome), h("p", { id: "mhc-disc", class: "pv" }, `${t.disclaimer} ${t.privacy}`)),
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

  /**
   * What the Worker gets: role + content of the last 12 settled messages (the latest visitor message up to 6,000
   * characters, earlier ones up to 1,200, answers up to 2,400), dropping the oldest to stay within the 32 KB body cap.
   */
  function outgoing(): ChatMessage[] {
    const msgs = entries
      .filter((e) => e.status !== "streaming" && (e.role === "user" || (e.content.trim() && e.status !== "error")))
      .map((e, i, all) => ({
        role: e.role,
        content: e.content.slice(
          0,
          e.role === "assistant" ? CHAT_LIMITS.maxAssistantChars : i === all.length - 1 ? LIMIT : CHAT_LIMITS.maxUserChars,
        ),
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

  /** Send button, the counter (near and over the limit) and the over-limit notice. */
  function updateSend(): void {
    const n = ta.value.length;
    const msg = n > LIMIT ? fill(t.long, { n: num(LIMIT) }) : "";
    send.disabled = !ta.value.trim() || !navigator.onLine;
    // Empty when hidden: aria-describedby reads hidden text too.
    count.textContent = n < LIMIT - 500 ? "" : fill(t.counter, { n: num(n), max: num(LIMIT) });
    count.hidden = !count.textContent;
    count.classList.toggle("over", !!msg);
    // Only on change, so screen readers hear the notice once, not on every keystroke.
    if (notice.textContent !== msg) notice.textContent = msg;
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
        (event, data) => onEvent(entry, event, data),
      );
      // No (valid) session after all (expired, or started on another network): get a fresh token silently, resend once.
      if (out.kind === "error" && out.pre && /^turnstile_/.test(out.code) && verifier && attempt === 0) {
        setSessionExp(key, null);
        continue;
      }
      return out;
    }
  }

  function onEvent(entry: Entry, event: string, data: unknown): void {
    if (event === "meta") {
      const m = data as MetaEvent | null;
      if (typeof m?.sessionExp === "number") {
        setSessionExp(key, m.sessionExp);
        verifier?.drop(); // a session exists: no Turnstile until it ends
      }
      // The Worker cut the latest message: say so under it (it never happens silently).
      const u = entries.at(-2); // the question this answer is for
      if (typeof m?.trimmed === "number" && u?.role === "user") {
        u.kept = m.trimmed;
        current?.el.previousElementSibling?.replaceWith(entryEl(u));
      }
    } else if (event === "token" || event === "replace") {
      const piece = (data as TokenEvent | null)?.t;
      if (typeof piece !== "string") return;
      clearTimeout(slowTimer);
      if (event === "replace") {
        // The Worker replaced the answer: drop the text and any tool UIs received so far.
        entry.content = "";
        delete entry.tools;
        retool(entry);
      }
      entry.content += piece;
      schedule();
    } else if (event === "done") {
      if ((data as DoneEvent | null)?.finish === "length") entry.cut = true;
    } else if (event === "tool") {
      const tool = data as ToolEvent | null;
      if (!tool || typeof tool.name !== "string") return;
      (entry.tools ??= []).push(tool);
      retool(entry);
    }
  }

  /** Re-render the tool UIs of the streaming answer. */
  function retool(entry: Entry): void {
    if (current?.entry !== entry) return;
    const stick = nearBottom();
    const tools = toolsEl(entry);
    current.el.querySelector(".tl")?.remove();
    if (tools) current.el.append(tools);
    if (stick) follow();
  }

  async function ask(raw: string, retry = false): Promise<void> {
    const text = raw.trim();
    if (!text || busy) return;
    if (!navigator.onLine) return void (offline.hidden = false);
    // Longer than the limit: send the first part and say so under the message (the composer warned before).
    if (!retry) entries.push({ role: "user", content: text.slice(0, LIMIT), ...(text.length > LIMIT ? { kept: LIMIT } : {}) });
    const entry: Entry = { role: "assistant", content: "", status: "streaming" };
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
      // Output guard or model refusal: the partial answer must not stay on screen or in storage.
      if (out.code === "blocked" || out.code === "safety") {
        entry.content = "";
        delete entry.tools;
      }
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

  /* ---------------------------------------------------------------- open / close / modal sheet / desktop layering */

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
      overflow = de.style.overflow;
      de.style.overflow = "hidden";
    } else if (!modal && inerted.length) {
      for (const el of inerted) el.inert = false;
      inerted = [];
      de.style.overflow = overflow ?? "";
    }
  }

  /**
   * The desktop panel's top stays below the page's fixed or sticky header (`[data-nav]`, else `body > header`) while
   * it is on screen: --mh-chat-top is its bottom + 0.75rem; without one, the CSS default (4.75rem) applies.
   */
  function measure(): void {
    const hd = document.querySelector("[data-nav]") ?? document.querySelector("body>header");
    const b = hd && /fixed|sticky/.test(getComputedStyle(hd).position) ? hd.getBoundingClientRect().bottom : 0;
    host.style.setProperty("--mh-chat-top", b > 0 ? `${b + 12}px` : "");
  }

  /** Share (0 to 1) of an element's on-screen box that the panel covers, once the page has scrolled by `dy`. */
  function under(el: Element, dy = 0): number {
    const p = panel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const span = (a: number, b: number, lo: number, hi: number) => Math.max(0, Math.min(b, hi) - Math.max(a, lo));
    const y = (lo: number, hi: number) => span(r.top - dy, r.bottom - dy, lo, hi);
    const x = (lo: number, hi: number) => span(r.left, r.right, lo, hi);
    return (x(p.left, p.right) * y(p.top, p.bottom)) / (x(0, innerWidth) * y(0, innerHeight) || 1);
  }

  /**
   * The desktop panel is non-modal, so the page stays usable around it. Escape closes it from anywhere (unless a
   * layer the page opened later, a dialog or popover, has focus); focus that lands on a page element the panel
   * hides closes it too, and focus stays on that element (WCAG 2.4.11).
   */
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
    const inside = host.contains(e.target as Node);
    if (!inside && !sheet.matches && (e.target as Element).closest?.("dialog[open],[aria-modal=true],[popover]")) return;
    e.preventDefault();
    close(inside || sheet.matches);
  }
  function onFocus(e: FocusEvent): void {
    const el = e.target as Element;
    if (sheet.matches || host.contains(el)) return;
    // After the browser has scrolled the element into view (at once, or smoothly: scrollend).
    const check = () => isOpen && document.activeElement === el && under(el) >= COVER && close(false);
    requestAnimationFrame(check);
    document.addEventListener("scrollend", check, { once: true });
  }

  function setOpen(on: boolean): void {
    isOpen = on;
    panel.toggleAttribute("data-open", on);
    bubble.setAttribute("aria-expanded", String(on));
    applyMode();
    // Reopened on the next page of this tab (index.ts), except as the phone sheet, which would cover that page.
    setOpenFlag(key, on && !sheet.matches);
    const listen = on ? addEventListener : removeEventListener;
    listen("resize", measure);
    listen("keydown", onKey as EventListener);
    listen("focusin", onFocus as EventListener);
    document.dispatchEvent(new CustomEvent("mh:chat-state", { detail: { open: on } }));
  }

  function open(o?: OpenOptions, quiet?: boolean): void {
    if (quiet && sheet.matches) return;
    if (!isOpen) {
      measure();
      setOpen(true);
      toBottom();
      if (!quiet) ta.focus({ preventScroll: true });
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
    setOpen(false);
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
    // Disabled while empty or offline: the draft then stays in the textarea.
    if (busy || send.disabled) return;
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
  // No session yet: start Turnstile while the visitor types (also after a quiet reopen, which doesn't load it).
  ta.addEventListener("focus", () => verifier && !busy && !sessionValid() && verifier.prepare());
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

  // Focus trap for the modal sheet (Turnstile's slotted iframe sits between the ends, in natural order). Escape: onKey.
  root.addEventListener("keydown", (e) => {
    const ev = e as KeyboardEvent;
    if (!isOpen || ev.key !== "Tab" || !sheet.matches) return;
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
  });

  // In-page links (#section, or this page's URL + hash): scroll there instead of navigating. A section of another
  // page of the site: the panel closes first, so it doesn't reopen there on top of that section.
  log.addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a?.hash || a.origin !== location.origin) return;
    if (a.pathname !== location.pathname) return close(false);
    const target = document.getElementById(a.hash.slice(1));
    e.preventDefault();
    if (!target) {
      // Not on this page after all (a section of the home page): go there.
      close(false);
      location.href = `${lang === "ar" ? "/ar/" : "/"}${a.hash}`;
      return;
    }
    // Where the target will sit once scrolled to (below the page's scroll-padding). If the panel would hide much of
    // it, or any of its form controls, close the panel (the sheet always closes).
    const dy = target.getBoundingClientRect().top - (parseFloat(getComputedStyle(de).scrollPaddingTop) || 0);
    const hide = sheet.matches || [target, ...target.querySelectorAll("input,select,textarea,button")].some((c) => under(c, dy) >= COVER);
    if (hide) close(false);
    // The page's own scroll-behavior applies (the site scrolls smoothly unless reduced motion is preferred).
    target.scrollIntoView();
    history.replaceState(history.state, "", a.hash);
    if (hide) {
      if (target.tabIndex < 0) target.tabIndex = -1; // a section: focusable from script only
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
  };
}
