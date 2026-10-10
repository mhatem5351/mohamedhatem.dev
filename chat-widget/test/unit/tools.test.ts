import { describe, expect, it } from "vitest";
import { STRINGS } from "../../src/i18n";
import { contactCard, formatPhone } from "../../src/tools";

describe("formatPhone", () => {
  it("groups Egyptian mobile numbers", () => expect(formatPhone("201142070946")).toBe("+20 114 207 0946"));
  it("prefixes other numbers with +", () => expect(formatPhone("971 50 123")).toBe("+97150123"));
});

describe("contact card", () => {
  const card = contactCard(
    { whatsapp: "201142070946", email: "hatem@mohamedhatem.dev", linkedin: "https://www.linkedin.com/in/mohamed-hatem-6a5790173" },
    STRINGS.en,
    () => {},
  );
  it("links WhatsApp (with a greeting), email and LinkedIn from config", () => {
    const hrefs = Array.from(card.querySelectorAll("a"), (a) => a.getAttribute("href"));
    expect(hrefs[0]).toMatch(/^https:\/\/wa\.me\/201142070946\?text=Hi%20Hatem/);
    expect(hrefs[1]).toMatch(/^mailto:hatem@mohamedhatem\.dev\?subject=/);
    expect(hrefs[2]).toBe("https://www.linkedin.com/in/mohamed-hatem-6a5790173");
    expect(card.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("has named copy buttons for the email and the phone number", () => {
    const labels = Array.from(card.querySelectorAll("button"), (b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Copy email address: hatem@mohamedhatem.dev", "Copy phone number: +20 114 207 0946"]);
  });
});
