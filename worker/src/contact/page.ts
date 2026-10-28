/**
 * The contact form posted WITHOUT JavaScript (audit RES-01). The page's script normally sends JSON and shows the
 * Worker's answer in place; a native form post navigates to /api/contact instead, and used to land on raw JSON. Such a
 * post can never pass Turnstile (its widget needs JavaScript), so it is answered with a small HTML page in the
 * visitor's language: what happened, and one-tap email and WhatsApp links that start a message with the text they
 * typed (also shown, read-only, to copy). The spam check is not relaxed: nothing is sent without a valid token.
 *
 * Only a form post that asks for a document gets HTML (Sec-Fetch-Mode: navigate, or an Accept that prefers HTML over
 * JSON); the page script's fetch (JSON, Accept: application/json) and API clients keep the JSON contract. The visitor's
 * text is echoed only for posts from the site itself (an allowed Origin), so another site can't make this origin
 * display text of its choosing. Everything echoed is HTML-escaped; the page has no script, and its CSP allows only
 * its own nonce-tagged style block.
 */
import { PERMISSIONS_POLICY, SECURITY_HEADERS } from "../http";
import { escapeHtml } from "./email";

/** The site's public channels (content/profile.ts → basics.contacts; worker/test/contact-page.test.ts keeps them equal). */
export const CHANNELS = {
  email: "hatem@mohamedhatem.dev",
  whatsapp: { display: "+20 114 207 0946", href: "https://wa.me/201142070946" },
} as const;

export type PageLang = "en" | "ar";

/** Why nothing was sent ("sent": it was). "nojs": no Turnstile token at all, the usual case for a native post. */
export type PageOutcome = "sent" | "nojs" | "check_failed" | "invalid" | "rate_limited" | "send_failed" | "unreadable" | "forbidden";

export interface PageInput {
  lang: PageLang;
  outcome: PageOutcome;
  /** What the visitor typed (already sanitised; only for posts from the site). */
  echo?: { name: string; company: string; message: string };
  /** On "sent": the visitor's name and address (empty when unknown) and the reference. */
  sent?: { name: string; email: string; ref: string };
}

/** Does this POST want a document back (a native form submission) rather than JSON? */
export function wantsHtml(req: Request): boolean {
  const type = req.headers.get("Content-Type") ?? "";
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type)) return false;
  if (req.headers.get("Sec-Fetch-Mode") === "navigate") return true;
  const accept = req.headers.get("Accept") ?? "";
  return /\btext\/html\b/i.test(accept) && !/\bapplication\/json\b/i.test(accept);
}

/** The page's language when the form fields can't be read: the page the form was on (Referer /ar/…). */
export function langFromReferer(req: Request): PageLang {
  try {
    return new URL(req.headers.get("Referer") ?? "").pathname.startsWith("/ar/") ? "ar" : "en";
  } catch {
    return "en";
  }
}

const STRINGS = {
  en: {
    siteName: "Mohamed Hatem",
    sentTitle: "Message sent",
    sentBody: "Thanks, {name}. Your message is in my inbox, and I'll reply to {email}.",
    sentBodyPlain: "Thanks. Your message is in my inbox.",
    reference: "Reference: {ref}",
    notSentTitle: "Your message wasn't sent",
    reasons: {
      nojs: "The form needs JavaScript for its spam check, and JavaScript is off or blocked in this browser.",
      check_failed: "The spam check didn't pass.",
      invalid: "Some fields were empty or not valid.",
      rate_limited: "Too many messages in a short time.",
      send_failed: "Something went wrong on my side while sending it.",
      unreadable: "The message couldn't be read.",
      forbidden: "This form only accepts messages sent from mohamedhatem.dev.",
    },
    nextWithText: "Email or WhatsApp me instead: the links below start a message with your text.",
    next: "Email or WhatsApp me instead:",
    yourMessage: "Your message",
    copyHint: "You can select it and copy it.",
    emailIt: "Email it to {email}",
    whatsappIt: "Send it on WhatsApp",
    email: "Email: {email}",
    whatsapp: "WhatsApp: {phone}",
    back: "Back to the site",
    emailSubject: "Hello from mohamedhatem.dev",
    whatsappPrefill: "Hi Hatem, I found you through mohamedhatem.dev. ",
  },
  ar: {
    siteName: "محمد حاتم",
    sentTitle: "أُرسلت رسالتك",
    sentBody: "شكرًا يا {name}، وصلت رسالتك إلى بريدي، وسأراسلك على {email}.",
    sentBodyPlain: "شكرًا، وصلت رسالتك إلى بريدي.",
    reference: "الرقم المرجعي: {ref}",
    notSentTitle: "لم تُرسَل رسالتك",
    reasons: {
      nojs: "يحتاج النموذج إلى JavaScript للتحقق من الرسائل المزعجة، وJavaScript معطَّل أو محظور في هذا المتصفح.",
      check_failed: "لم يكتمل التحقق من الرسائل المزعجة.",
      invalid: "بعض الحقول فارغة أو قيمتها غير صحيحة.",
      rate_limited: "أُرسلت رسائل كثيرة في وقت قصير.",
      send_failed: "حدث خطأ من جهتي في أثناء الإرسال.",
      unreadable: "تعذّرت قراءة الرسالة.",
      forbidden: "لا يقبل هذا النموذج إلا الرسائل المرسلة من موقع mohamedhatem.dev.",
    },
    nextWithText: "يمكنك مراسلتي بالبريد الإلكتروني أو عبر WhatsApp بدلًا من النموذج؛ فكلٌّ من الرابطين أدناه يفتح رسالة جديدة فيها نصّك.",
    next: "يمكنك مراسلتي بالبريد الإلكتروني أو عبر WhatsApp بدلًا من النموذج:",
    yourMessage: "رسالتك",
    copyHint: "يمكنك تحديد النص ونسخه.",
    emailIt: "أرسلها بالبريد إلى {email}",
    whatsappIt: "أرسلها عبر WhatsApp",
    email: "البريد الإلكتروني: {email}",
    whatsapp: "WhatsApp: {phone}",
    back: "العودة إلى الموقع",
    emailSubject: "رسالة عبر موقع mohamedhatem.dev",
    whatsappPrefill: "مرحبًا، تعرّفت عليك عبر موقع mohamedhatem.dev. ",
  },
} as const;

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
/** Escapes, then fills: placeholders get escaped values; LTR runs (emails, numbers) are isolated in Arabic text. */
const fillHtml = (t: string, v: Record<string, string>) =>
  fill(escapeHtml(t), Object.fromEntries(Object.entries(v).map(([k, x]) => [k, `<bdi dir="auto">${escapeHtml(x)}</bdi>`])));

// The site's dark theme (site/src/styles/tokens.css), system fonts only (the page loads nothing).
const STYLE = `
:root{color-scheme:dark;--bg:#080E1C;--surface:#0F1728;--line:#242C40;--ink:#F4F0E7;--ink2:#CBD1DC;--muted:#A1A9BC;--accent:#E9BB61;--on-accent:#091123}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink2);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Geeza Pro",Tahoma,sans-serif}
main{max-width:40rem;margin:0 auto;padding:clamp(1.5rem,6vw,4rem) 1.25rem}
.site{margin:0 0 2rem;font-weight:600}
a{color:var(--accent);text-underline-offset:.2em}
a:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h1{color:var(--ink);font-size:clamp(1.6rem,5vw,2.1rem);line-height:1.2;margin:0 0 1rem}
p{margin:0 0 1rem}
.muted{color:var(--muted);font-size:.9rem}
label{display:block;color:var(--ink);font-weight:600;margin:1.5rem 0 .4rem}
textarea{display:block;width:100%;min-height:10rem;padding:.75rem;border:1px solid var(--line);border-radius:.5rem;background:var(--surface);color:var(--ink);font:inherit;resize:vertical}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.5rem 0 2rem}
.btn{display:inline-block;min-height:2.75rem;padding:.55rem 1.1rem;border:1px solid var(--accent);border-radius:1.4rem;text-decoration:none;font-weight:600;line-height:1.6}
.btn--primary{background:var(--accent);color:var(--on-accent)}
@media (forced-colors:active){.btn{border-color:LinkText}}
`;

export function renderContactPage(input: PageInput, nonce: string): string {
  const s = STRINGS[input.lang];
  const dir = input.lang === "ar" ? "rtl" : "ltr";
  const home = input.lang === "ar" ? "/ar/" : "/";
  const parts: string[] = [];
  let title: string;

  if (input.outcome === "sent") {
    title = s.sentTitle;
    const sent = input.sent;
    parts.push(`<p>${sent?.name && sent.email ? fillHtml(s.sentBody, { name: sent.name, email: sent.email }) : escapeHtml(s.sentBodyPlain)}</p>`);
    if (sent?.ref) parts.push(`<p class="muted">${fillHtml(s.reference, { ref: sent.ref })}</p>`);
  } else {
    title = s.notSentTitle;
    const echo = input.outcome === "forbidden" ? undefined : input.echo;
    const text = echo?.message.trim() ? echo : undefined;
    parts.push(`<p>${escapeHtml(s.reasons[input.outcome])}</p>`);
    parts.push(`<p>${escapeHtml(text ? s.nextWithText : s.next)}</p>`);
    if (text) {
      const signature = [text.name, text.company].filter(Boolean).join(", ");
      const body = signature ? `${text.message}\n\n${signature}` : text.message;
      const mailto = `mailto:${CHANNELS.email}?subject=${encodeURIComponent(s.emailSubject)}&body=${encodeURIComponent(body)}`;
      const wa = `${CHANNELS.whatsapp.href}?text=${encodeURIComponent(s.whatsappPrefill + text.message)}`;
      parts.push(
        `<p class="actions"><a class="btn btn--primary" href="${escapeHtml(mailto)}">${fillHtml(s.emailIt, { email: CHANNELS.email })}</a>` +
          `<a class="btn" href="${escapeHtml(wa)}" rel="noopener">${escapeHtml(s.whatsappIt)}</a></p>`,
      );
      parts.push(
        `<label for="message">${escapeHtml(s.yourMessage)}</label>` +
          `<textarea id="message" readonly rows="8" dir="auto" aria-describedby="message-hint">${escapeHtml(text.message)}</textarea>` +
          `<p class="muted" id="message-hint">${escapeHtml(s.copyHint)}</p>`,
      );
    } else {
      const mailto = `mailto:${CHANNELS.email}?subject=${encodeURIComponent(s.emailSubject)}`;
      const wa = `${CHANNELS.whatsapp.href}?text=${encodeURIComponent(s.whatsappPrefill)}`;
      parts.push(
        `<p class="actions"><a class="btn btn--primary" href="${escapeHtml(mailto)}">${fillHtml(s.email, { email: CHANNELS.email })}</a>` +
          `<a class="btn" href="${escapeHtml(wa)}" rel="noopener">${fillHtml(s.whatsapp, { phone: CHANNELS.whatsapp.display })}</a></p>`,
      );
    }
  }

  return (
    `<!doctype html><html lang="${input.lang}" dir="${dir}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
    `<meta name="color-scheme" content="dark"><title>${escapeHtml(`${title} · ${s.siteName}`)}</title>` +
    `<style nonce="${nonce}">${STYLE}</style></head><body><main>` +
    `<p class="site"><a href="${home}">mohamedhatem.dev</a></p><h1>${escapeHtml(title)}</h1>${parts.join("")}` +
    `<p><a href="${home}#contact">${escapeHtml(s.back)}</a></p></main></body></html>`
  );
}

/** The HTML response: same hardening as the API, plus a document CSP that admits only the page's own style block. */
export function contactPage(status: number, input: PageInput): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return new Response(renderContactPage(input, nonce), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "Permissions-Policy": PERMISSIONS_POLICY,
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}
