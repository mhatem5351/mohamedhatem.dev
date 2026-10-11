/**
 * JSON-LD (schema.org) for every page, built only from content/profile.ts and content/i18n:
 *   home:        Person + WebSite + ProfilePage
 *   case study:  WebSite + Article (genre "case study", about the system: its producer, the employer or freelance
 *                client, and its sponsor, the client where it approved being named) + BreadcrumbList
 *   cv:          Person + WebSite + ProfilePage + BreadcrumbList
 *   privacy:     WebSite + WebPage + BreadcrumbList
 *
 * One entity, one description: the Person (#person) and the WebSite (#website) have the same content on every page
 * and in both languages (English values; the Arabic names are `alternateName`), so the same @id never carries two
 * different names or URLs. Page-level nodes (ProfilePage, Article, WebPage) are per locale, with their own URL.
 * Every node that points at #website has the WebSite node on the same page.
 *
 * Dates are full ISO dates (src/lib/dates.ts). A case study dated only by its role (the sources don't date the
 * project itself) gets no dateCreated / temporalCoverage: the role's dates aren't presented as the project's.
 *
 * Honesty rules applied here (content/README.md): alumniOf lists only completed programmes (the M.Sc. is in
 * progress, so it is not claimed); the AWS certification is a credential "earned 2022" with no validity claim; the
 * unnamed client is never named (case studies only carry the employer / context the content discloses). No
 * givenName / familyName: the sources give the full name (Mohamed Hatem Radwan) but not which part is the family
 * name, so only `name` and `alternateName` are stated.
 * Pure functions (no I/O), so tests can call them directly.
 */
import type { CaseStudy, Certification, Client, Locale, Period } from "@content/profile.ts";
import { datedByRole } from "./case";
import { PRIVACY_UPDATED, SITE_PUBLISHED, HOME_UPDATED } from "./dates";
import { format, localePath, messages, parseIso } from "./i18n";
import { PATHS, absolute, caseStudyBySlug, contact, byLocale, link, ogImage, profile } from "./site";
import { versioned } from "./og-version";

export const PERSON_ID = `${profile.site.url}/#person`;
export const WEBSITE_ID = `${profile.site.url}/#website`;
/** Stable photo URL for structured data (public/mohamed-hatem.jpg, the square crop at 480 px). */
export const PERSON_IMAGE = absolute("/mohamed-hatem.jpg");
const HOME = absolute("/");

const CONTEXT = "https://schema.org";
const LANG = { en: "en", ar: "ar" } as const;

/** schema.org temporalCoverage for a period: "2023-04/2024-12", an open end "2026-04/..", one value "2026". */
export function temporalCoverage(period: Period): string {
  if (period.end === period.start) return period.start;
  return `${period.start}/${period.end === null ? ".." : period.end}`;
}

/**
 * The certifications the CV lists (round 6, HM-10: none is "featured" any more, so `featured` would leave
 * hasCredential empty). Today that is "AWS Certified Machine Learning – Specialty" (2022). Content from before
 * round 6 has no `onCv` and falls back to `featured`.
 */
export const onCv = (c: Certification): boolean => ("onCv" in c ? c.onCv === true : c.featured);

function organization(name: string, url?: string): Record<string, unknown> {
  return { "@type": "Organization", name, ...(url ? { url } : {}) };
}

/** Topics he works on, from the CV's skills summary (the first items of each line). */
export function knowsAbout(): string[] {
  const seen = new Set<string>();
  for (const line of profile.cv.skills) for (const item of line.items.slice(0, 3)) seen.add(item.en);
  return [...seen];
}

/** The Person: identical on every page and in both languages (see the header). */
export function person(): Record<string, unknown> {
  const b = profile.basics;
  const completed = profile.education.filter((e) => e.status === "completed");
  return {
    "@context": CONTEXT,
    "@type": "Person",
    "@id": PERSON_ID,
    name: b.name.en,
    alternateName: [...new Set([b.fullName.en, b.name.ar, b.fullName.ar])],
    jobTitle: b.title.en,
    description: b.headline.en,
    url: HOME,
    image: PERSON_IMAGE,
    email: `mailto:${contact("email").display}`,
    worksFor: organization(b.employer, b.employerUrl),
    address: { "@type": "PostalAddress", addressLocality: b.location.city.en, addressCountry: "EG" },
    alumniOf: completed.map((e) => ({ "@type": "EducationalOrganization", name: e.institution.en })),
    knowsAbout: knowsAbout(),
    knowsLanguage: b.languages.map((l) => ({
      "@type": "Language",
      name: l.name.en,
      alternateName: l.name.en === "Arabic" ? "ar" : "en",
    })),
    hasCredential: profile.certifications
      .filter(onCv)
      .map((c) => ({
        "@type": "EducationalOccupationalCredential",
        name: c.name.en,
        credentialCategory: "certification",
        recognizedBy: organization(c.issuer.en),
        ...(c.issued ? { dateCreated: c.issued } : {}),
      })),
    award: profile.honors.map((h) => `${h.title.en}, ${h.issuer.en}`),
    sameAs: [link("linkedin").href, link("github").href],
  };
}

/** The WebSite: identical on every page and in both languages; its languages are listed in inLanguage. */
export function website(): Record<string, unknown> {
  const en = messages("en");
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: HOME,
    name: en.meta.siteName,
    alternateName: [messages("ar").meta.siteName, new URL(HOME).hostname],
    description: en.meta.home.description,
    inLanguage: [LANG.en, LANG.ar],
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
  };
}

/** The author reference used by page-level nodes (the same name and URL as the Person node). */
const author = (): Record<string, unknown> => ({ "@id": PERSON_ID, "@type": "Person", name: profile.basics.name.en, url: HOME });

function profilePage(locale: Locale, path: string, title: string, description: string, modified: string): Record<string, unknown> {
  const url = absolute(localePath(path, locale));
  return {
    "@context": CONTEXT,
    "@type": "ProfilePage",
    "@id": `${url}#page`,
    url,
    name: title,
    description,
    inLanguage: LANG[locale],
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: { "@id": PERSON_ID },
    about: { "@id": PERSON_ID },
    datePublished: SITE_PUBLISHED,
    dateModified: modified,
    primaryImageOfPage: { "@type": "ImageObject", url: PERSON_IMAGE },
  };
}

interface Crumb {
  name: string;
  /** Absolute URL. */
  url: string;
}

export function breadcrumbs(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  };
}

/** Absolute URL of an English site path in a locale. */
const at = (path: string, locale: Locale): string => absolute(localePath(path, locale));

/* ------------------------------------------------------------------------------------------------------------ */
/* Pages                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------ */

export function homeJsonLd(locale: Locale): object[] {
  const m = messages(locale);
  return [person(), website(), profilePage(locale, PATHS.home, m.meta.home.title, m.meta.home.description, HOME_UPDATED)];
}

/** Organisation a case study belongs to, at the level the content discloses (employer or freelance client). */
function caseOrganisation(cs: CaseStudy, locale: Locale): string {
  const role = cs.roleId ? profile.experience.find((r) => r.id === cs.roleId) : undefined;
  if (role) return role.company[locale];
  // Freelance work outside the experience list: the context's first clause names the client ("Logic Controls, …").
  return cs.context[locale].split(/[،,]/)[0]!.trim();
}

/** A named client as an Organization: its name in the page's language, the other language and the abbreviation as alternates. */
function clientOrganisation(client: Client, locale: Locale): Record<string, unknown> {
  const other = locale === "en" ? "ar" : "en";
  return { "@type": "Organization", name: client.name[locale], alternateName: [client.name[other], ...(client.abbreviation ? [client.abbreviation] : [])] };
}

export function caseStudyJsonLd(slug: string, locale: Locale): object[] {
  const cs = caseStudyBySlug(slug);
  if (!cs) return [];
  const m = messages(locale);
  const url = absolute(localePath(PATHS.work(cs.slug), locale));
  // A link may be one URL per language (SEO-04): each page names its own.
  const links = cs.links.map((l) => ({ ...l, href: byLocale(l.href as string | Record<Locale, string>, locale) }));
  const live = links.find((l) => /^https?:\/\//.test(l.href) && !l.href.includes("github.com"));
  const code = links.find((l) => l.href.includes("github.com"));
  const article = {
    "@context": CONTEXT,
    "@type": "Article",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: url,
    headline: cs.title[locale],
    alternativeHeadline: cs.shortTitle[locale],
    description: cs.summary[locale],
    genre: m.experience.caseStudy,
    inLanguage: LANG[locale],
    image: absolute(versioned(ogImage(`work-${cs.slug}`, locale))),
    author: author(),
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
    datePublished: cs.published,
    dateModified: cs.updated,
    // A stack item may be a product name or a { en, ar } concept (round 7, R7-30).
    keywords: (cs.stack as readonly (string | Record<Locale, string>)[]).map((t) => byLocale(t, locale)).join(", "),
    about: {
      "@type": "CreativeWork",
      name: cs.title[locale],
      description: cs.problem[locale],
      creator: { "@id": PERSON_ID },
      producer: organization(caseOrganisation(cs, locale)),
      // The client, only where it approved being named (the Saudi Tourism Authority); never the unnamed client.
      ...(cs.client ? { sponsor: clientOrganisation(cs.client, locale) } : {}),
      // Dated only by its role: no project dates are claimed (audit FC-7).
      ...(datedByRole(cs) ? {} : { temporalCoverage: temporalCoverage(cs.period), dateCreated: String(parseIso(cs.period.start).y) }),
      ...(live ? { url: live.href } : {}),
      ...(code ? { hasPart: { "@type": "SoftwareSourceCode", name: new URL(code.href).pathname.split("/").filter(Boolean).at(-1), codeRepository: code.href } } : {}),
    },
  };
  return [
    website(),
    article,
    breadcrumbs([
      { name: m.nav.home, url: at("/", locale) },
      { name: m.nav.work, url: `${at("/", locale)}#work` },
      { name: cs.shortTitle[locale], url },
    ]),
  ];
}

export function cvJsonLd(locale: Locale): object[] {
  const m = messages(locale);
  return [
    person(),
    website(),
    profilePage(locale, PATHS.cv, m.meta.cv.title, m.meta.cv.description, profile.cv.updated),
    breadcrumbs([
      { name: m.nav.home, url: at("/", locale) },
      { name: m.nav.cv, url: at(PATHS.cv, locale) },
    ]),
  ];
}

export function privacyJsonLd(locale: Locale): object[] {
  const m = messages(locale);
  const url = absolute(localePath(PATHS.privacy, locale));
  return [
    website(),
    {
      "@context": CONTEXT,
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: m.meta.privacy.title,
      description: m.meta.privacy.description,
      inLanguage: LANG[locale],
      isPartOf: { "@id": WEBSITE_ID },
      author: author(),
      datePublished: SITE_PUBLISHED,
      dateModified: PRIVACY_UPDATED,
    },
    breadcrumbs([
      { name: m.nav.home, url: at("/", locale) },
      { name: m.footer.privacy, url },
    ]),
  ];
}

/** Used by the 404 page title helper and tests: the localized "{title} · Mohamed Hatem". */
export const caseMetaTitle = (cs: CaseStudy, locale: Locale): string => format(messages(locale).meta.caseStudy.title, { title: cs.shortTitle[locale] });
