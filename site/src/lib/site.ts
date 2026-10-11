/**
 * Site-wide constants and links derived from ../../content/profile.ts.
 */
import { profile, type CaseStudy, type CaseStudySlug, type ContactChannel, type ProfileLink } from "@content/profile.ts";
import { localePath, messages, type Locale } from "./i18n";

export { profile };

export const SITE_URL = profile.site.url;

/**
 * Cloudflare Turnstile site key (public by design). The production key only works on mohamedhatem.dev, so `astro dev`
 * uses Cloudflare's always-pass test key (pairs with the Worker's dev test secret). PUBLIC_TURNSTILE_SITE_KEY
 * overrides both, e.g. `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB npm run build` to test a build locally
 * against `wrangler dev`.
 */
export const TURNSTILE_SITE_KEY: string =
  import.meta.env.PUBLIC_TURNSTILE_SITE_KEY || (import.meta.env.DEV ? "1x00000000000000000000BB" : "0x4AAAAAAFSgKXNi27pxPG5n");

/**
 * A value that may differ per language: a link (round 7, SEO-04: logic-controls.com's /en/ and /ar/ home pages) or a
 * stack tag (R7-30: "LLM evaluation" / «تقييم النماذج اللغوية»), given as one string for both or one per locale.
 */
export const byLocale = (href: string | Readonly<Record<Locale, string>>, locale: Locale): string => (typeof href === "string" ? href : href[locale]);

/** Absolute URL for a site path. */
export const absolute = (path: string): string => new URL(path, SITE_URL).href;

/** Paths (English form; pass through localePath for Arabic). */
export const PATHS = {
  home: "/",
  cv: "/cv/",
  privacy: "/privacy/",
  work: (slug: CaseStudySlug | string) => `/work/${slug}/`,
} as const;

/** File names of the generated CV PDFs (scripts/build-pdf.mjs writes them to public/cv/ and dist/cv/). */
export const CV_PDF = {
  en: "/cv/Mohamed-Hatem-CV.pdf",
  ar: "/cv/Mohamed-Hatem-CV-ar.pdf",
} as const;

/** OG image for a page key ("home", "cv", "privacy", "work-<slug>") in a locale (scripts/og.mjs renders them). */
export const ogImage = (key: string, locale: Locale): string => `/og/${key}-${locale}.png`;

/** Case studies in display order. */
export const caseStudies: readonly CaseStudy[] = [...profile.caseStudies].sort((a, b) => a.order - b.order);

export const caseStudyBySlug = (slug: string): CaseStudy | undefined => caseStudies.find((c) => c.slug === slug);

/** Next case study in display order (wraps around). */
export function nextCaseStudy(slug: string): CaseStudy {
  const i = caseStudies.findIndex((c) => c.slug === slug);
  return caseStudies[(i + 1) % caseStudies.length]!;
}

export const contact = (id: ContactChannel["id"]): ContactChannel => profile.basics.contacts.find((c) => c.id === id)!;
export const link = (id: ProfileLink["id"]): ProfileLink => profile.basics.links.find((l) => l.id === id)!;

/** wa.me link with the locale's prefilled message. */
export function whatsappHref(locale: Locale): string {
  return `${contact("whatsapp").href}?text=${encodeURIComponent(messages(locale).contact.whatsappPrefill)}`;
}

/** mailto: with the locale's default subject. */
export function mailtoHref(locale: Locale, address: ContactChannel["id"] = "email"): string {
  return `${contact(address).href}?subject=${encodeURIComponent(messages(locale).contact.emailSubject)}`;
}

/** Home-page anchor in a locale: on the home page itself just "#id", elsewhere "/#id" or "/ar/#id". */
export const homeAnchor = (id: string, locale: Locale, onHome: boolean): string => (onHome ? `#${id}` : `${localePath("/", locale)}#${id}`);
