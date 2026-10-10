/**
 * The vCard behind "Add to contacts" (/mohamed-hatem.vcf): parsed back and compared field by field with
 * content/profile.ts, plus the format rules (CRLF, 75-octet folding, escaping) and the photo budget.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { profile, type Profile } from "@content/profile.ts";
import { VCARD_PATH, VCARD_PHOTO, e164FromWhatsApp, escapeText, foldLine, mailAddress, vcard, vcardPhoto } from "~/lib/vcard";

interface Prop {
  group?: string;
  name: string;
  params: Record<string, string[]>;
  value: string;
}

/** Unfolds and parses a vCard 3.0 text into properties (no quoted parameters are used, so ":" ends the name part). */
function parse(text: string): Prop[] {
  return text
    .replace(/\r\n[ \t]/g, "")
    .split("\r\n")
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(":");
      const [head = "", ...rawParams] = line.slice(0, colon).split(";");
      const dot = head.indexOf(".");
      const params: Record<string, string[]> = {};
      for (const p of rawParams) {
        const [k = "", v = ""] = p.split("=");
        params[k.toUpperCase()] = [...(params[k.toUpperCase()] ?? []), ...v.split(",")];
      }
      return {
        ...(dot >= 0 ? { group: head.slice(0, dot) } : {}),
        name: (dot >= 0 ? head.slice(dot + 1) : head).toUpperCase(),
        params,
        value: line.slice(colon + 1),
      };
    });
}

/** Splits a structured value on unescaped ";" and unescapes each component. */
const components = (value: string): string[] => value.split(/(?<!\\);/).map(unescape);
const unescape = (value: string): string => value.replace(/\\([\\,;nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

const b = profile.basics;
const contactHref = (id: string) => b.contacts.find((c) => c.id === id)!.href;
const link = (id: string) => b.links.find((l) => l.id === id)!;
const photoSource = readFileSync(new URL(`../../src/${VCARD_PHOTO.source}`, import.meta.url));

let photo = "";
let text = "";
let props: Prop[] = [];
const one = (name: string, group?: string) => {
  const found = props.filter((p) => p.name === name && (group === undefined || p.group === group));
  expect(found, name).toHaveLength(1);
  return found[0]!;
};

beforeAll(async () => {
  photo = await vcardPhoto(photoSource);
  text = vcard(profile, { photo });
  props = parse(text);
});

describe("vCard (src/lib/vcard.ts)", () => {
  it("is served at /mohamed-hatem.vcf", () => {
    expect(VCARD_PATH).toBe("/mohamed-hatem.vcf");
  });

  it("is a vCard 3.0 with CRLF line endings and lines of at most 75 octets", () => {
    expect(text.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(text.endsWith("\r\nEND:VCARD\r\n")).toBe(true);
    expect(text).not.toMatch(/\r(?!\n)|(?<!\r)\n/);
    const physical = text.split("\r\n").slice(0, -1);
    const long = physical.filter((l) => Buffer.byteLength(l, "utf8") > 75);
    expect(long).toEqual([]);
    expect(physical.some((l) => l.startsWith(" "))).toBe(true); // the photo is folded
    expect(props.map((p) => p.name).filter((n) => n === "BEGIN" || n === "END")).toEqual(["BEGIN", "END"]);
  });

  it("names him from profile.basics (N, FN) with his title and employer", () => {
    const words = b.name.en.split(" ");
    expect(components(one("N").value)).toEqual([words.at(-1), words.slice(0, -1).join(" "), "", "", ""]);
    expect(unescape(one("FN").value)).toBe(b.name.en);
    expect(unescape(one("TITLE").value)).toBe(b.title.en);
    expect(components(one("ORG").value)).toEqual([b.employer]);
  });

  it("has the professional e-mail (preferred), the Gmail address and the WhatsApp number", () => {
    const emails = props.filter((p) => p.name === "EMAIL");
    const work = emails.find((p) => p.params.TYPE?.includes("WORK"));
    const home = emails.find((p) => p.params.TYPE?.includes("HOME"));
    expect(`mailto:${work?.value}`).toBe(contactHref("email"));
    expect(work?.params.TYPE).toEqual(["INTERNET", "WORK", "PREF"]);
    expect(`mailto:${home?.value}`).toBe(contactHref("gmail"));
    const tel = one("TEL");
    expect(tel.params.TYPE).toEqual(["CELL"]);
    expect(tel.value).toMatch(/^\+[1-9]\d{6,14}$/);
    expect(`https://wa.me/${tel.value.slice(1)}`).toBe(contactHref("whatsapp"));
    // The displayed number is the same one.
    expect(b.contacts.find((c) => c.id === "whatsapp")!.display.replace(/\s/g, "")).toBe(tel.value);
  });

  it("links the site, LinkedIn and GitHub as URLs both iOS and Android read", () => {
    const urls = props.filter((p) => p.name === "URL");
    expect(urls.find((u) => !u.group)?.value).toBe(link("website").href);
    for (const id of ["linkedin", "github"]) {
      const url = urls.find((u) => u.value === link(id).href);
      expect(url?.group, id).toBeTruthy();
      expect(unescape(one("X-ABLABEL", url!.group).value)).toBe(link(id).label.en);
    }
    const social = one("X-SOCIALPROFILE");
    expect(social.params.TYPE).toEqual(["linkedin"]);
    expect(social.value).toBe(link("linkedin").href);
  });

  it("places him in his city and country (ADR) and dates the card from site.updated (REV)", () => {
    const adr = one("ADR");
    expect(adr.params.TYPE).toEqual(["WORK"]);
    expect(components(adr.value)).toEqual(["", "", "", b.location.city.en, "", "", b.location.country.en]);
    expect(one("REV").value).toBe(`${profile.site.updated}T00:00:00Z`);
  });

  it("embeds a small square JPEG portrait within the budget", async () => {
    const p = one("PHOTO");
    expect(p.params).toEqual({ ENCODING: ["b"], TYPE: ["JPEG"] });
    expect(p.value).toBe(photo);
    expect(p.value.length).toBeLessThanOrEqual(VCARD_PHOTO.maxBase64);
    const jpeg = Buffer.from(p.value, "base64");
    expect(jpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
    const meta = await sharp(jpeg).metadata();
    expect([meta.format, meta.width, meta.height, meta.isProgressive]).toEqual(["jpeg", VCARD_PHOTO.size, VCARD_PHOTO.size, false]);
    expect(meta.exif).toBeUndefined();
  });

  it("has no PHOTO when none is given", () => {
    expect(parse(vcard(profile)).some((p) => p.name === "PHOTO")).toBe(false);
  });

  it("escapes text values and structured components, and they parse back", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const tricky: Profile = {
      ...profile,
      basics: {
        ...b,
        title: { ...b.title, en: "Lead, AI; R\\D\nTeam" },
        employer: "Acme; Inc, Ltd",
        location: { ...b.location, city: { ...b.location.city, en: "Cairo; Giza" }, country: { ...b.location.country, en: "Egypt, Africa" } },
      },
    };
    const parsed = parse(vcard(tricky));
    expect(unescape(parsed.find((p) => p.name === "TITLE")!.value)).toBe("Lead, AI; R\\D\nTeam");
    expect(components(parsed.find((p) => p.name === "ORG")!.value)).toEqual(["Acme; Inc, Ltd"]);
    const adr = components(parsed.find((p) => p.name === "ADR")!.value);
    expect([adr[3], adr[6]]).toEqual(["Cairo; Giza", "Egypt, Africa"]);
  });

  it("folds at 75 octets without splitting a UTF-8 character, and unfolds to the same line", () => {
    for (const line of [`NOTE:${"x".repeat(300)}`, `NOTE:${"محمد حاتم ".repeat(40)}`, `NOTE:${"a😀".repeat(60)}`]) {
      const folded = foldLine(line);
      for (const physical of folded.split("\r\n")) expect(Buffer.byteLength(physical, "utf8")).toBeLessThanOrEqual(75);
      expect(folded).not.toContain("�");
      expect(folded.replace(/\r\n /g, "")).toBe(line);
    }
    expect(foldLine("FN:Mohamed Hatem")).toBe("FN:Mohamed Hatem");
  });

  it("reads e-mail addresses and the E.164 number from the profile's links, and refuses anything else", () => {
    expect(mailAddress("mailto:a@b.co?subject=Hi")).toBe("a@b.co");
    expect(e164FromWhatsApp("https://wa.me/201142070946")).toBe("+201142070946");
    expect(() => mailAddress("https://example.com")).toThrow();
    expect(() => e164FromWhatsApp("https://wa.me/message/ABC")).toThrow();
  });
});
