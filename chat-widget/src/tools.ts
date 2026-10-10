/**
 * Rich UI for the model's tool calls. The model only chooses *which* card to show; every URL, number and address
 * comes from the widget config, so a hallucinated contact detail can never be rendered as a button.
 */
import { h, icon } from "./dom";
import type { Strings } from "./i18n";
import type { ContactConfig } from "./types";

/** "201142070946" → "+20 114 207 0946" (Egyptian mobile grouping), other numbers → "+<digits>". */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("20") ? `+20 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`;
}

const external = { target: "_blank", rel: "noopener noreferrer" };

export function contactCard(c: ContactConfig, t: Strings, announce: (msg: string) => void): HTMLElement {
  const phone = c.phoneDisplay ?? formatPhone(c.whatsapp);
  const wa = `https://wa.me/${c.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(t.waText)}`;
  const mail = `mailto:${c.email}?subject=${encodeURIComponent(t.mailSubject)}`;
  const heading = h("p", { class: "ch" }, t.contactTitle);
  return h(
    "div",
    { class: "card", role: "group", "aria-label": t.contactTitle },
    heading,
    h(
      "div",
      { class: "acts" },
      h("a", { class: "btn pri", href: wa, ...external }, icon("chat"), t.whatsapp),
      h("a", { class: "btn", href: mail }, icon("mail"), t.email),
      h("a", { class: "btn", href: c.linkedin, ...external }, icon("in"), t.linkedin),
    ),
    copyRow(c.email, t.copyEmail, t.copiedEmail, t, announce),
    ...(c.altEmail ? [copyRow(c.altEmail, t.copyEmail, t.copiedEmail, t, announce)] : []),
    copyRow(phone, t.copyPhone, t.copiedPhone, t, announce),
  );
}

function copyRow(value: string, label: string, done: string, t: Strings, announce: (msg: string) => void): HTMLElement {
  const text = h("span", { dir: "ltr" }, value);
  const btnLabel = h("span", {}, t.copy);
  const btn = h("button", { type: "button", class: "cb", "aria-label": `${label}: ${value}` }, icon("copy"), btnLabel);
  let timer = 0;
  const show = (copied: boolean) => {
    btn.replaceChildren(icon(copied ? "check" : "copy"), btnLabel);
    btnLabel.textContent = copied ? t.copied : t.copy;
  };
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // No clipboard permission (or an old browser): copy the selected text the old way; if even that fails, the
      // text stays selected for Ctrl+C.
      getSelection()?.setBaseAndExtent(text, 0, text, 1);
      if (!document.execCommand("copy")) return;
    }
    show(true);
    announce(done);
    clearTimeout(timer);
    timer = window.setTimeout(show, 2000, false);
  });
  return h("div", { class: "cr" }, text, btn);
}

export function jumpLink(href: string, label: string): HTMLAnchorElement {
  return h("a", { class: "jump", href }, label, icon("arrow", "fl"));
}
