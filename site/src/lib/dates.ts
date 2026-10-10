/**
 * Publication and last-change dates of every page (YYYY-MM-DD), for JSON-LD (datePublished / dateModified), the
 * article:* Open Graph tags and the sitemap's <lastmod>. Imported by astro.config.mjs too, so it uses a relative
 * import (the @content alias isn't available while the config loads) and no other site module.
 *
 * Bump the matching date in content/profile.ts (site.updated, cv.updated, a case study's `updated`) or
 * PRIVACY_UPDATED below when a page's content changes; the home page follows the newest of them.
 */
import { profile } from "../../../content/profile.ts";

/** Day the privacy page's facts were last checked against the Worker, the widget and wrangler.jsonc. */
export const PRIVACY_UPDATED = "2026-10-10";

/** First publication of the site's pages (all of today's pages went live together). */
export const SITE_PUBLISHED: string = profile.site.published;

const newest = (dates: readonly string[]): string => [...dates].sort().at(-1)!;

/** The home page shows the case-study cards and the CV facts, so it changes whenever they do. */
export const HOME_UPDATED: string = newest([profile.site.updated, profile.cv.updated, ...profile.caseStudies.map((c) => c.updated)]);

/** Last content change of the page at `pathname` (either locale, trailing slash), or undefined for unknown paths. */
export function lastModified(pathname: string): string | undefined {
  const path = pathname.replace(/^\/ar(?=\/)/, "");
  if (path === "/") return HOME_UPDATED;
  if (path === "/cv/") return profile.cv.updated;
  if (path === "/privacy/") return PRIVACY_UPDATED;
  const slug = /^\/work\/([^/]+)\/$/.exec(path)?.[1];
  return slug ? profile.caseStudies.find((c) => c.slug === slug)?.updated : undefined;
}
