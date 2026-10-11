/**
 * Search and sharing: permanent redirects (dist/_redirects, served by scripts/serve.mjs and by Workers static assets),
 * the home H1 naming him, per-page sharing-card descriptions, UTF-8 text files and sitemap dates.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { profile } from "@content/profile.ts";
import { en } from "@content/i18n/en.ts";
import { expect, test } from "./fixtures";
import { PAGES } from "./pages";

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
    // URLs people and tools guess (postbuild/redirects.mjs → ALIASES).
    ["/sitemap.xml", "/sitemap-index.xml"],
    ["/resume", "/cv/"],
    ["/ar/resume/", "/ar/cv/"],
    ["/cv.pdf", "/cv/Mohamed-Hatem-CV.pdf"],
    ["/ar/cv.pdf", "/cv/Mohamed-Hatem-CV-ar.pdf"],
    ["/security.txt", "/.well-known/security.txt"],
    ["/en", "/"],
    ["/en/", "/"],
    ["/en/cv/", "/cv/"],
    ["/en/work/tabaqat-gis/", "/work/tabaqat-gis/"],
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
    for (const f of ["/robots.txt", "/llms.txt", "/llms-full.txt", "/.well-known/security.txt"])
      expect((await request.get(f)).headers()["content-type"], f).toBe("text/plain; charset=utf-8");
  });

  test("the guessed URLs' targets answer 200 (no redirect chain into a 404)", async ({ request }) => {
    for (const to of ["/sitemap-index.xml", "/cv/Mohamed-Hatem-CV.pdf", "/cv/Mohamed-Hatem-CV-ar.pdf", "/.well-known/security.txt"])
      expect((await request.get(to, { maxRedirects: 0 })).status(), to).toBe(200);
  });

  test("the 404 pages' own URLs answer 404, not 200 (no soft 404)", async ({ request }) => {
    for (const [path, lang] of [["/404", "en"], ["/ar/404", "ar"]] as const) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
      expect(await res.text(), path).toContain(`<html lang="${lang}"`);
    }
    const html = await request.get("/404.html", { maxRedirects: 0 });
    expect(html.status()).toBe(307);
    expect(html.headers()["location"]).toBe("/404");
  });

  test("security.txt (RFC 9116) names a contact and an expiry at least 30 days away", async ({ request }) => {
    const txt = await (await request.get("/.well-known/security.txt")).text();
    expect(txt).toMatch(/^Contact: mailto:hatem@mohamedhatem\.dev$/m);
    expect(txt).toMatch(/^Preferred-Languages: en, ar$/m);
    const expires = Date.parse(txt.match(/^Expires: (.+)$/m)?.[1] ?? "");
    expect(expires - Date.now()).toBeGreaterThan(30 * 86_400_000);
  });

  test("the IndexNow key file serves the key", async ({ request }) => {
    const key = readdirSync(fileURLToPath(new URL("../../public/", import.meta.url))).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))!.slice(0, -4);
    const res = await request.get(`/${key}.txt`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe(key);
  });

  test("indexable pages allow large image previews; 404 pages stay noindex", async ({ request }) => {
    for (const path of ["/", "/ar/", "/work/sta-tourism-assistants/", "/ar/cv/"])
      expect(await (await request.get(path)).text(), path).toContain('<meta name="robots" content="max-image-preview:large">');
    expect(await (await request.get("/no-such-page/")).text()).toContain('<meta name="robots" content="noindex">');
  });

  test("every sitemap URL has a <lastmod>", async ({ request }) => {
    const xml = await (await request.get("/sitemap-0.xml")).text();
    const urls = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    // Every page in both languages (home, each case study, CV, privacy), and nothing else.
    expect(urls.length).toBe(PAGES.length);
    expect(PAGES.length).toBe(2 * (3 + profile.caseStudies.length));
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
