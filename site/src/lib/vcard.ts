/**
 * The contact card behind "Add to contacts": /mohamed-hatem.vcf, rendered at build time by
 * src/pages/mohamed-hatem.vcf.ts from content/profile.ts, so it never drifts from the site.
 *
 * vCard 3.0 (RFC 2426), the version iOS Contacts and Android's importer both read in full:
 * - lines end in CRLF and are folded at 75 octets (a continuation line starts with one space), never inside a UTF-8
 *   sequence;
 * - text values escape "\", ",", ";" and newlines; structured values (N, ADR) escape each component;
 * - URLs, the phone number, the e-mail addresses and the photo are written as they are.
 *
 * Profile links: iOS shows `itemN.URL` + `itemN.X-ABLabel` as a labelled link and Android's importer reads the same
 * `URL` as a website (it ignores the label), so LinkedIn and GitHub are both labelled URLs. LinkedIn is also an
 * `X-SOCIALPROFILE` (iOS files it under social profiles; Android ignores it).
 *
 * The photo is embedded (`PHOTO;ENCODING=b`): iOS ignores a photo given by URL. `vcardPhoto()` cuts the site's
 * portrait to a small baseline JPEG; the unit test keeps it within `VCARD_PHOTO.maxBase64`.
 */
import type { ContactChannel, Profile, ProfileLink } from "@content/profile.ts";

/** Public URL of the card (the route is src/pages/mohamed-hatem.vcf.ts; public/_headers serves it as text/vcard). */
export const VCARD_PATH = "/mohamed-hatem.vcf";

/** The embedded portrait: source (relative to src/), output size and the budget for its base64 text. */
export const VCARD_PHOTO = { source: "assets/photo/mh-avatar-320.jpg", size: 160, quality: 80, maxBase64: 12 * 1024 } as const;

const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** Escapes a vCard 3.0 TEXT value (or one component of a structured value). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/**
 * Folds one content line at 75 octets: the first line holds up to 75, each continuation a space plus up to 74. Cuts
 * never fall inside a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let start = 0;
  let room = MAX_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + room, bytes.length);
    // Step back off UTF-8 continuation bytes (10xxxxxx) so a character stays on one line.
    while (end < bytes.length && end > start && (bytes[end]! & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    room = MAX_OCTETS - 1;
  }
  return parts.join(`${CRLF} `);
}

/** "mailto:a@b.c?subject=…" → "a@b.c". */
export function mailAddress(href: string): string {
  const address = href.replace(/^mailto:/i, "").split("?")[0] ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error(`vcard: not an e-mail link: ${href}`);
  return address;
}

/** "https://wa.me/201142070946" → "+201142070946" (E.164). */
export function e164FromWhatsApp(href: string): string {
  const digits = new URL(href).pathname.replace(/^\/+/, "");
  if (!/^[1-9]\d{6,14}$/.test(digits)) throw new Error(`vcard: no E.164 number in ${href}`);
  return `+${digits}`;
}

const contactOf = (profile: Profile, id: ContactChannel["id"]): ContactChannel | undefined => profile.basics.contacts.find((c) => c.id === id);
const linkOf = (profile: Profile, id: ProfileLink["id"]): ProfileLink | undefined => profile.basics.links.find((l) => l.id === id);

export interface VcardOptions {
  /** Base64 JPEG (no data: prefix), from vcardPhoto(). Without it the card has no PHOTO. */
  readonly photo?: string;
}

/** The card: one for both site languages, with the English values. Ends with CRLF. */
export function vcard(profile: Profile, options: VcardOptions = {}): string {
  const b = profile.basics;
  const en = "en" as const;
  const name = b.name[en].trim().split(/\s+/);
  const family = name.length > 1 ? name[name.length - 1]! : "";
  const given = name.length > 1 ? name.slice(0, -1).join(" ") : name[0]!;
  const structured = (parts: readonly string[]) => parts.map(escapeText).join(";");

  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0", `N:${structured([family, given, "", "", ""])}`, `FN:${escapeText(b.name[en])}`];
  lines.push(`ORG:${escapeText(b.employer)}`, `TITLE:${escapeText(b.title[en])}`);

  const work = contactOf(profile, "email");
  const home = contactOf(profile, "gmail");
  const whatsapp = contactOf(profile, "whatsapp");
  if (work) lines.push(`EMAIL;TYPE=INTERNET,WORK,PREF:${mailAddress(work.href)}`);
  if (home) lines.push(`EMAIL;TYPE=INTERNET,HOME:${mailAddress(home.href)}`);
  if (whatsapp) lines.push(`TEL;TYPE=CELL:${e164FromWhatsApp(whatsapp.href)}`);
  lines.push(`ADR;TYPE=WORK:${structured(["", "", "", b.location.city[en], "", "", b.location.country[en]])}`);

  const website = linkOf(profile, "website");
  if (website) lines.push(`URL:${website.href}`);
  let item = 0;
  for (const id of ["linkedin", "github"] as const) {
    const link = linkOf(profile, id);
    if (!link) continue;
    item++;
    lines.push(`item${item}.URL:${link.href}`, `item${item}.X-ABLabel:${escapeText(link.label[en])}`);
    if (id === "linkedin") lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${link.href}`);
  }

  if (options.photo) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${options.photo}`);
  lines.push(`REV:${profile.site.updated}T00:00:00Z`, "END:VCARD");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * The portrait for PHOTO: a square VCARD_PHOTO.size px baseline JPEG (no metadata), as base64. Build time only
 * (sharp is loaded on first use, so importing this module stays cheap).
 */
export async function vcardPhoto(source: Uint8Array): Promise<string> {
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp(source)
    .resize(VCARD_PHOTO.size, VCARD_PHOTO.size, { fit: "cover" })
    .jpeg({ quality: VCARD_PHOTO.quality, progressive: false, mozjpeg: false, optimiseCoding: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
  return jpeg.toString("base64");
}
