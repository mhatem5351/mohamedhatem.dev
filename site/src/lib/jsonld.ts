/**
 * JSON-LD (schema.org) for every page, built only from content/profile.ts and content/i18n:
 *   home:        Person + WebSite + ProfilePage
 *   case study:  Article (genre "case study", about the system) + BreadcrumbList
 *   cv:          Person + ProfilePage + BreadcrumbList
 *   privacy:     WebPage + BreadcrumbList
 *
 * Honesty rules applied here (content/README.md): alumniOf lists only completed programmes (the M.Sc. is in
 * progress, so it is not claimed); the AWS certification is a credential "earned 2022" with no validity claim; the
 * unnamed client is never named (case studies only carry the employer / context the content discloses).
 * Pure functions (no I/O), so tests can call them directly.
 */
import type { CaseStudy, Locale } from "@content/profile.ts";
import { format, localePath, messages, parseIso } from "./i18n";
import { PATHS, absolute, caseStudyBySlug, contact, link, ogImage, profile } from "./site";

export const PERSON_ID = `${profile.site.url}/#person`;
export const WEBSITE_ID = `${profile.site.url}/#website`;
/** Stable photo URL for structured data (public/mohamed-hatem.jpg, the square crop at 480 px). */
export const PERSON_IMAGE = absolute("/mohamed-hatem.jpg");

const CONTEXT = "https://schema.org";
const LANG = { en: "en", ar: "ar" } as const;

/** "2024-09" → "2024-09"; "2027" → "2027" (ISO 8601 as schema.org accepts). */
const isoDate = (v: string): string => v;

/** schema.org temporalCoverage interval for a period ("2023-04/2024-12", open end "2026-04/.."). */
export function temporalCoverage(period: CaseStudy["period"]): string {
  return `${isoDate(period.start)}/${period.end === null ? ".." : isoDate(period.end)}`;
}

function organization(name: string, url?: string): Record<string, unknown> {
  return { "@type": "Organization", name, ...(url ? { url } : {}) };
}

/** Topics he works on, from the CV's skills summary (first items of each line, in the page's language). */
export function knowsAbout(locale: Locale): string[] {
  const seen = new Set<string>();
  for (const line of profile.cv.skills) for (const item of line.items.slice(0, 3)) seen.add(item[locale]);
  return [...seen];
}

/** The Person, in the page's language. */
export function person(locale: Locale): Record<string, unknown> {
  const b = profile.basics;
  const other: Locale = locale === "en" ? "ar" : "en";
  const completed = profile.education.filter((e) => e.status === "completed");
  return {
    "@context": CONTEXT,
    "@type": "Person",
    "@id": PERSON_ID,
    name: b.name[locale],
    alternateName: [...new Set([b.fullName[locale], b.name[other], b.fullName[other]])],
    givenName: locale === "en" ? "Mohamed" : "محمد",
    familyName: locale === "en" ? "Hatem" : "حاتم",
    jobTitle: b.title[locale],
    description: b.headline[locale],
    url: absolute(localePath("/", locale)),
    image: PERSON_IMAGE,
    email: `mailto:${contact("email").display}`,
    worksFor: organization(b.employer, b.employerUrl),
    address: {
      "@type": "PostalAddress",
      addressLocality: b.location.city[locale],
      addressCountry: "EG",
    },
    alumniOf: completed.map((e) => ({
      "@type": "EducationalOrganization",
      name: e.institution[locale],
    })),
    knowsAbout: knowsAbout(locale),
    knowsLanguage: b.languages.map((l) => ({
      "@type": "Language",
      name: l.name[locale],
      alternateName: l.name.en === "Arabic" ? "ar" : "en",
    })),
    hasCredential: profile.certifications
      .filter((c) => c.featured)
      .map((c) => ({
        "@type": "EducationalOccupationalCredential",
        name: c.name[locale],
        credentialCategory: "certification",
        recognizedBy: organization(c.issuer[locale]),
        ...(c.issued ? { dateCreated: c.issued } : {}),
      })),
    award: profile.honors.map((h) => `${h.title[locale]}, ${h.issuer[locale]}`),
    sameAs: [link("linkedin").href, link("github").href],
  };
}

export function website(locale: Locale): Record<string, unknown> {
  const m = messages(locale);
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: absolute("/"),
    name: m.meta.siteName,
    description: m.meta.home.description,
    inLanguage: [LANG.en, LANG.ar],
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
  };
}

function profilePage(locale: Locale, path: string, title: string, description: string): Record<string, unknown> {
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
    dateModified: profile.cv.updated,
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
  return [person(locale), website(locale), profilePage(locale, PATHS.home, m.meta.home.title, m.meta.home.description)];
}

/** Organisation a case study belongs to, at the level the content discloses (employer or freelance client). */
function caseOrganisation(cs: CaseStudy, locale: Locale): string {
  const role = cs.roleId ? profile.experience.find((r) => r.id === cs.roleId) : undefined;
  if (role) return role.company[locale];
  // Freelance work outside the experience list: the context's first clause names the client ("Logic Controls, …").
  return cs.context[locale].split(/[،,]/)[0]!.trim();
}

export function caseStudyJsonLd(slug: string, locale: Locale): object[] {
  const cs = caseStudyBySlug(slug);
  if (!cs) return [];
  const m = messages(locale);
  const url = absolute(localePath(PATHS.work(cs.slug), locale));
  const live = cs.links.find((l) => /^https?:\/\//.test(l.href) && !l.href.includes("github.com"));
  const code = cs.links.find((l) => l.href.includes("github.com"));
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
    image: absolute(ogImage(`work-${cs.slug}`, locale)),
    author: { "@id": PERSON_ID, "@type": "Person", name: profile.basics.name[locale], url: absolute(localePath("/", locale)) },
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
    dateModified: profile.cv.updated,
    keywords: cs.stack.join(", "),
    about: {
      "@type": "CreativeWork",
      name: cs.title[locale],
      description: cs.problem[locale],
      creator: { "@id": PERSON_ID },
      producer: organization(caseOrganisation(cs, locale)),
      temporalCoverage: temporalCoverage(cs.period),
      dateCreated: String(parseIso(cs.period.start).y),
      ...(live ? { url: live.href } : {}),
      ...(code ? { codeRepository: code.href } : {}),
    },
  };
  return [
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
    person(locale),
    profilePage(locale, PATHS.cv, m.meta.cv.title, m.meta.cv.description),
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
    {
      "@context": CONTEXT,
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: m.meta.privacy.title,
      description: m.meta.privacy.description,
      inLanguage: LANG[locale],
      isPartOf: { "@id": WEBSITE_ID },
      author: { "@id": PERSON_ID },
      dateModified: profile.cv.updated,
    },
    breadcrumbs([
      { name: m.nav.home, url: at("/", locale) },
      { name: m.footer.privacy, url },
    ]),
  ];
}

/** Used by the 404 page title helper and tests: the localized "{title} · Mohamed Hatem". */
export const caseMetaTitle = (cs: CaseStudy, locale: Locale): string => format(messages(locale).meta.caseStudy.title, { title: cs.shortTitle[locale] });
