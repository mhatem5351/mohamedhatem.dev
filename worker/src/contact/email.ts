import type { ContactData } from "./validate";
import { oneLine } from "./validate";

/**
 * The notification email, as a `send_email` message builder (the binding composes the MIME itself: multipart/
 * alternative text + HTML, encoded headers). No MIME library needed in Workers today.
 */
export interface ContactEmail {
  from: { email: string; name: string };
  to: string;
  replyTo: { email: string; name: string };
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

const SUBJECT_LABEL: Record<ContactData["subject"], string> = {
  hiring: "Hiring / job opportunity",
  project: "Project / consulting",
  other: "Other",
};

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface EmailMeta {
  ref: string;
  from: string;
  to: string;
  receivedAt: Date;
  /** request.cf.country, e.g. "SA" (never the IP). */
  country?: string;
}

export function buildContactEmail(d: ContactData, meta: EmailMeta): ContactEmail {
  const who = d.company ? `${d.name} (${d.company})` : d.name;
  // Header values: one line, capped (the binding encodes non-ASCII; we only make sure nothing can break a header).
  const subject = oneLine(`[mohamedhatem.dev] ${SUBJECT_LABEL[d.subject]}: ${who} · ${meta.ref}`).slice(0, 180);
  const when = meta.receivedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const rows: [string, string][] = [
    ["Name", d.name],
    ["Email", d.email],
    ...(d.company ? ([["Company", d.company]] as [string, string][]) : []),
    ["Subject", SUBJECT_LABEL[d.subject]],
    ["Site language", d.lang === "ar" ? "Arabic" : "English"],
    ...(meta.country ? ([["Country (network)", meta.country]] as [string, string][]) : []),
    ["Received", when],
    ["Reference", meta.ref],
  ];

  const text =
    `New message from the contact form on mohamedhatem.dev\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessage:\n${d.message}\n\n` +
    `Reply to this email to answer ${d.name} directly (Reply-To is ${d.email}).\n`;

  const cell = "padding:6px 12px 6px 0;vertical-align:top";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F6F3">
<div style="max-width:600px;margin:0 auto;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#131D36">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2B51AA">mohamedhatem.dev · contact form</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(SUBJECT_LABEL[d.subject])} from ${escapeHtml(who)}</h1>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px">
${rows.map(([k, v]) => `<tr><td style="${cell};color:#5B6375;white-space:nowrap">${escapeHtml(k)}</td><td style="${cell}">${k === "Email" ? `<a href="mailto:${escapeHtml(v)}" style="color:#2B51AA">${escapeHtml(v)}</a>` : escapeHtml(v)}</td></tr>`).join("\n")}
</table>
<div dir="auto" style="white-space:pre-wrap;padding:16px;border:1px solid #E2DFDA;border-radius:12px;background:#FEFDFC">${escapeHtml(d.message)}</div>
<p style="margin:16px 0 0;font-size:13px;color:#5B6375">Reply to this email to answer ${escapeHtml(d.name)} directly.</p>
</div></body></html>`;

  return {
    from: { email: meta.from, name: "mohamedhatem.dev" },
    to: meta.to,
    replyTo: { email: d.email, name: oneLine(d.name).slice(0, 100) },
    subject,
    text,
    html,
    headers: { "X-Contact-Ref": meta.ref },
  };
}
