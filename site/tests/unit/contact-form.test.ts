import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@content/i18n/en.ts";
import { EMAIL_RE, LIMITS, TOPICS, contactPayload, errorText, serverFieldErrors, topicToSubject, validateContact, type ContactValues } from "~/lib/contact-form";

const valid: ContactValues = { name: "Sara Recruiter", email: "sara@example.com", company: "Acme AI", subject: "hiring", message: "We have a Senior AI Engineer role." } as ContactValues;
const keys = (v: Partial<ContactValues>) => validateContact({ ...valid, ...v }).map((e) => `${e.field}:${e.key}`);

describe("contact form validation (mirrors worker/src/contact/validate.ts)", () => {
  it("accepts a valid message", () => {
    expect(validateContact(valid)).toEqual([]);
  });

  it("flags each required field", () => {
    const errs = validateContact({ name: "", email: "", company: "", subject: "", message: "" } as ContactValues).map((e) => e.key);
    expect(errs).toEqual(expect.arrayContaining(["nameRequired", "emailRequired", "topicRequired", "messageRequired"]));
  });

  it("checks lengths and the email format like the Worker", () => {
    expect(keys({ email: "sara@" })).toContain("email:emailInvalid");
    expect(keys({ email: "a@b.c" })).toContain("email:emailInvalid");
    expect(keys({ message: "too short" })).toContain("message:messageTooShort");
    expect(keys({ message: "x".repeat(LIMITS.message.max + 1) })).toContain("message:messageTooLong");
    expect(keys({ name: "x".repeat(LIMITS.name.max + 1) })).toContain("name:nameTooLong");
    expect(keys({ company: "x".repeat(LIMITS.company.max + 1) })).toContain("company:companyTooLong");
  });

  it("uses the Worker's limits and email regex", () => {
    const worker = readFileSync(new URL("../../../worker/src/contact/validate.ts", import.meta.url), "utf8");
    expect(worker).toContain(`name: { min: ${LIMITS.name.min}, max: ${LIMITS.name.max} }`);
    expect(worker).toContain(`message: { min: ${LIMITS.message.min}, max: ${LIMITS.message.max} }`);
    expect(worker).toContain(`company: { max: ${LIMITS.company.max} }`);
    expect(worker).toContain(EMAIL_RE.source);
  });

  it("maps the four topics onto the Worker's three subjects", () => {
    expect(TOPICS.map(topicToSubject)).toEqual(["hiring", "project", "other", "other"]);
  });

  it("builds the request body with the neutral honeypot name", () => {
    const body = contactPayload({ ...valid, name: "  Sara \n Recruiter " }, { turnstileToken: "t", honeypot: "", lang: "ar" });
    expect(body).toEqual({ name: "Sara Recruiter", email: "sara@example.com", company: "Acme AI", subject: "hiring", message: valid.message, turnstileToken: "t", mh_hp: "", lang: "ar" });
    expect(body).not.toHaveProperty("website");
  });

  it("maps server field errors and fills message placeholders", () => {
    expect(serverFieldErrors(["email", "message"]).map((e) => e.field)).toEqual(["email", "message"]);
    const tooShort = validateContact({ ...valid, message: "short" }).find((e) => e.key === "messageTooShort")!;
    expect(errorText(en, tooShort)).toContain(String(LIMITS.message.min));
  });
});
