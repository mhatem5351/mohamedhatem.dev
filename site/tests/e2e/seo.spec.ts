/**
 * Search and sharing: permanent redirects (dist/_redirects, served by scripts/serve.mjs and by Workers static assets),
 * the home H1 naming him, per-page sharing-card descriptions, UTF-8 text files and sitemap dates.
 */
import { profile } from "@content/profile.ts";
import { en } from "@content/i18n/en.ts";
import { expect, test } from "./fixtures";

test.describe("URLs @desktop-only", () => {
  const cases: [string, string][] = [
    ["/cv", "/cv/"],
    ["/ar", "/ar/"],
    ["/ar/cv", "/ar/cv/"],
    ["/privacy", "/privacy/"],
    ["/work/arabsstock-assistant", "/work/arabsstock-assistant/"],
    ["/ar/work/tabaqat-gis", "/ar/work/tabaqat-gis/"],
    // The brief case studies kept their URLs when they moved to "More work" (no new redirects needed).
    ["/work/gov-bilingual-assistant", "/work/gov-bilingual-assistant/"],
    ["/ar/work/aip-semantic-search", "/ar/work/aip-semantic-search/"],
    ["/work/gov-bilingual-assistant/index.html", "/work/gov-bilingual-assistant/"],
    ["/index.html", "/"],
    ["/cv/index.html", "/cv/"],
    ["/work", "/#work"],
    ["/work/", "/#work"],
    ["/ar/work", "/ar/#work"],
    ["/ar/work/", "/ar/#work"],
  ];
  for (const [from, to] of cases)
    test(`${from} → ${to} (301)`, async ({ request }) => {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status()).toBe(301);
      expect(new URL(res.headers()["location"]!, "http://x").pathname + (new URL(res.headers()["location"]!, "http://x").hash)).toBe(to);
    });

  test("the query string survives a redirect, and the targets answer 200 (no loop)", async ({ request }) => {
    const res = await request.get("/cv?ref=linkedin", { maxRedirects: 0 });
    expect(res.headers()["location"]).toMatch(/^\/cv\/\?ref=linkedin$/);
    for (const to of ["/cv/", "/ar/", "/work/arabsstock-assistant/", "/"]) expect((await request.get(to, { maxRedirects: 0 })).status(), to).toBe(200);
  });

  test("every case study answers 200 at its own URL in both languages, as listed in the sitemap", async ({ request }) => {
    const xml = await (await request.get("/sitemap-0.xml")).text();
    for (const cs of profile.caseStudies)
      for (const path of [`/work/${cs.slug}/`, `/ar/work/${cs.slug}/`]) {
        expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
        expect(xml, path).toContain(`https://mohamedhatem.dev${path}`);
      }
  });

  test("text files for crawlers declare UTF-8", async ({ request }) => {
    for (const f of ["/robots.txt", "/llms.txt", "/llms-full.txt"]) expect((await request.get(f)).headers()["content-type"], f).toBe("text/plain; charset=utf-8");
  });

  test("every sitemap URL has a <lastmod>", async ({ request }) => {
    const xml = await (await request.get("/sitemap-0.xml")).text();
    const urls = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urls.length).toBe(20);
    for (const u of urls) expect(u).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
  });
});

test.describe("home H1", () => {
  for (const [path, locale] of [["/", "en"], ["/ar/", "ar"]] as const)
    test(`${path}: the main heading names him and his role, then the tagline`, async ({ page }) => {
      await page.goto(path);
      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      const text = (await h1.innerText()).replace(/\s+/g, " ");
      expect(text).toContain(profile.basics.name[locale]);
      expect(text).toContain(profile.basics.headline[locale]);
      expect(text).toContain(profile.basics.tagline[locale].slice(0, 12));
      // The accessible name reads name, role, then tagline, in that order.
      const name = (await h1.evaluate((el) => el.textContent ?? "")).replace(/\s+/g, " ");
      expect(name.indexOf(profile.basics.name[locale])).toBeLessThan(name.indexOf(profile.basics.headline[locale]));
      expect(name.indexOf(profile.basics.headline[locale])).toBeLessThan(name.indexOf(profile.basics.tagline[locale].slice(0, 12)));
    });
});

test.describe("sharing cards", () => {
  test("each page's og:image:alt describes its own card @desktop-only", async ({ page }) => {
    const alts = new Map<string, string>();
    for (const path of ["/", "/cv/", "/privacy/", "/work/arabsstock-assistant/", "/work/tabaqat-gis/"]) {
      await page.goto(path);
      const alt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
      expect(alt, path).toBeTruthy();
      expect(await page.locator('meta[name="twitter:image:alt"]').getAttribute("content")).toBe(alt);
      alts.set(path, alt!);
    }
    expect(new Set(alts.values()).size).toBe(alts.size);
    expect(alts.get("/")).toBe(en.meta.ogImageAlt);
    expect(alts.get("/work/arabsstock-assistant/")).toContain(profile.caseStudies.find((c) => c.slug === "arabsstock-assistant")!.title.en);
  });

  test("case studies carry article dates @desktop-only", async ({ page }) => {
    await page.goto("/work/wakeb-bilingual-chatbot/");
    await expect(page.locator('meta[property="article:published_time"]')).toHaveAttribute("content", /^\d{4}-\d{2}-\d{2}$/);
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute("content", /^\d{4}-\d{2}-\d{2}$/);
  });
});
