import { sanitizeText } from "../chat/parse";
import { CONTACT_SUBJECTS, type ContactSubject, type Lang } from "../chat/protocol";
import { TURNSTILE_TOKEN_MAX } from "../turnstile";

export const CONTACT_MAX_BODY = 32 * 1024;

export const FIELD_LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  company: { max: 120 },
  message: { min: 10, max: 5000 },
} as const;

export interface ContactData {
  name: string;
  email: string;
  company: string;
  subject: ContactSubject;
  message: string;
  lang: Lang;
}

export type ContactField = "name" | "email" | "company" | "subject" | "message";

export interface ContactInput {
  data: ContactData;
  turnstileToken: string;
  honeypot: string;
}

export type ContactValidation = { ok: true; value: ContactInput } | { ok: false; fields: ContactField[] };

/** One line: no line breaks or controls (these values end up in email headers). */
export const oneLine = (s: string) => sanitizeText(s).replace(/\s+/g, " ").trim();

/**
 * A pragmatic address check: one @, no spaces or header-breaking characters, a dotted domain with a 2+ letter TLD.
 * (Full RFC 5322 is neither needed nor wanted: the address is only used as Reply-To.)
 */
export const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** `get` reads a field from a JSON body or form data alike. */
export function validateContact(get: (key: string) => unknown): ContactValidation {
  const str = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v : "";
  };
  const name = oneLine(str("name"));
  const email = oneLine(str("email")).toLowerCase();
  const company = oneLine(str("company"));
  const subjectRaw = oneLine(str("subject")).toLowerCase();
  const message = sanitizeText(str("message"));
  const lang: Lang = str("lang") === "ar" ? "ar" : "en";
  const token = str("turnstileToken") || str("cf-turnstile-response");
  const honeypot = str("mh_hp");

  const fields: ContactField[] = [];
  if (name.length < FIELD_LIMITS.name.min || name.length > FIELD_LIMITS.name.max) fields.push("name");
  if (email.length > FIELD_LIMITS.email.max || !EMAIL_RE.test(email) || email.includes("..")) fields.push("email");
  if (company.length > FIELD_LIMITS.company.max) fields.push("company");
  if (!(CONTACT_SUBJECTS as readonly string[]).includes(subjectRaw)) fields.push("subject");
  if (message.length < FIELD_LIMITS.message.min || message.length > FIELD_LIMITS.message.max) fields.push("message");
  if (fields.length) return { ok: false, fields };

  return {
    ok: true,
    value: {
      data: { name, email, company, subject: subjectRaw as ContactSubject, message, lang },
      turnstileToken: token.length <= TURNSTILE_TOKEN_MAX ? token : "",
      honeypot,
    },
  };
}

const REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Crockford-like: no 0/O, 1/I

/** Short reference the visitor can quote: MH-YYMMDD-XXXXX. */
export function contactRef(now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rnd = crypto.getRandomValues(new Uint8Array(5));
  return `MH-${d}-${Array.from(rnd, (b) => REF_ALPHABET[b % 32]).join("")}`;
}
