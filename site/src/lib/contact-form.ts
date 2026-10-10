/**
 * Contact form: client-side validation that mirrors the Worker (worker/src/contact/validate.ts), so the browser
 * catches what the server would reject (422) before a Turnstile token is spent. Pure: no DOM, unit-tested.
 *
 * Limits (FIELD_LIMITS in the Worker): name 2–100, email ≤ 254 + EMAIL_RE, company ≤ 120, message 10–5,000,
 * subject ∈ hiring | project | other. The form's four topics map onto the Worker's three subjects.
 */
import type { Messages } from "./i18n";

export const LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  company: { max: 120 },
  message: { min: 10, max: 5000 },
} as const;

/** Same pattern as the Worker's EMAIL_RE (one @, no spaces, dotted domain, 2+ letter TLD). */
export const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** The form's topics (content/i18n contact.form.topic.options), in display order. */
export const TOPICS = ["role", "project", "collaboration", "other"] as const;
export type Topic = (typeof TOPICS)[number];

/** The Worker's subjects (CONTACT_SUBJECTS in worker/src/chat/protocol.ts). */
export type Subject = "hiring" | "project" | "other";

const TOPIC_SUBJECT: Record<Topic, Subject> = { role: "hiring", project: "project", collaboration: "other", other: "other" };

/** Topic → Worker subject. */
export const topicToSubject = (topic: Topic): Subject => TOPIC_SUBJECT[topic];

export type Field = "name" | "email" | "company" | "subject" | "message";

/** Keys of `contact.errors` used for field errors. */
export type FieldErrorKey =
  | "nameRequired"
  | "nameTooLong"
  | "emailRequired"
  | "emailInvalid"
  | "companyTooLong"
  | "topicRequired"
  | "messageRequired"
  | "messageTooShort"
  | "messageTooLong";

export interface FieldError {
  field: Field;
  key: FieldErrorKey;
  /** Values for the message's placeholders ({min}, {max}). */
  values?: Record<string, number>;
}

export interface ContactValues {
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
}

/** Collapses whitespace the way the Worker's oneLine() does (single-line fields). */
export const oneLine = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Validates in field order (name, email, company, subject, message); returns every error, empty when valid. */
export function validateContact(v: ContactValues): FieldError[] {
  const errors: FieldError[] = [];
  const name = oneLine(v.name);
  const email = oneLine(v.email).toLowerCase();
  const company = oneLine(v.company);
  const message = v.message.trim();

  if (name.length < LIMITS.name.min) errors.push({ field: "name", key: "nameRequired" });
  else if (name.length > LIMITS.name.max) errors.push({ field: "name", key: "nameTooLong", values: { max: LIMITS.name.max } });

  if (!email) errors.push({ field: "email", key: "emailRequired" });
  else if (email.length > LIMITS.email.max || !EMAIL_RE.test(email) || email.includes("..")) errors.push({ field: "email", key: "emailInvalid" });

  if (company.length > LIMITS.company.max) errors.push({ field: "company", key: "companyTooLong", values: { max: LIMITS.company.max } });

  if (!(["hiring", "project", "other"] as const).includes(v.subject as Subject)) errors.push({ field: "subject", key: "topicRequired" });

  if (!message) errors.push({ field: "message", key: "messageRequired" });
  else if (message.length < LIMITS.message.min) errors.push({ field: "message", key: "messageTooShort", values: { min: LIMITS.message.min } });
  else if (message.length > LIMITS.message.max) errors.push({ field: "message", key: "messageTooLong", values: { max: LIMITS.message.max } });

  return errors;
}

/** The Worker's 422 `fields` list → field errors (the generic message for each field). */
export function serverFieldErrors(fields: readonly string[]): FieldError[] {
  const map: Record<string, FieldError> = {
    name: { field: "name", key: "nameRequired" },
    email: { field: "email", key: "emailInvalid" },
    company: { field: "company", key: "companyTooLong", values: { max: LIMITS.company.max } },
    subject: { field: "subject", key: "topicRequired" },
    message: { field: "message", key: "messageTooShort", values: { min: LIMITS.message.min } },
  };
  return fields.map((f) => map[f]).filter((e): e is FieldError => !!e);
}

/** The localised text of a field error. */
export function errorText(m: Messages, e: FieldError): string {
  const template = m.contact.errors[e.key];
  return Object.entries(e.values ?? {}).reduce((s, [k, val]) => s.replaceAll(`{${k}}`, String(val)), template);
}

/**
 * JSON body for POST /api/contact (contract: worker/README.md). The honeypot is `mh_hp`, a deliberately neutral
 * name: browsers and password managers autofill fields called website/url/company and would silently drop real
 * messages.
 */
export function contactPayload(v: ContactValues, extra: { turnstileToken: string; honeypot: string; lang: "en" | "ar" }) {
  return {
    name: oneLine(v.name),
    email: oneLine(v.email),
    company: oneLine(v.company),
    subject: v.subject,
    message: v.message.trim(),
    turnstileToken: extra.turnstileToken,
    mh_hp: extra.honeypot,
    lang: extra.lang,
  };
}
