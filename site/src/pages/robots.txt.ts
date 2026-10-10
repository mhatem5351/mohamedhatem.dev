/**
 * robots.txt: everything public is crawlable; the sitemap lists both locales (with hreflang alternates).
 * /api/* is the Worker (POST only) and has nothing to index.
 */
import type { APIRoute } from "astro";
import { SITE_URL } from "~/lib/site";

export const GET: APIRoute = () =>
  new Response(
    ["User-agent: *", "Allow: /", "Disallow: /api/", "", `Sitemap: ${SITE_URL}/sitemap-index.xml`, ""].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
