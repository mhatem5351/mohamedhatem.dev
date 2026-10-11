import { describe, expect, it } from "vitest";
import { profile } from "@content/profile.ts";
import { redirectRules } from "../../scripts/postbuild/redirects.mjs";
import { linkHeader } from "../../scripts/postbuild/early-hints.mjs";
import { HOME_UPDATED, PRIVACY_UPDATED, lastModified } from "~/lib/dates";

describe("_redirects rules", () => {
  const pages = ["/", "/ar/", "/cv/", "/ar/cv/", "/work/x/", "/ar/work/x/"];
  const rules = new Map(redirectRules(pages));

  it("sends every slash-less page URL and its index.html form to the page, permanently", () => {
    for (const p of pages.filter((x) => x !== "/")) expect(rules.get(p.slice(0, -1)), p).toBe(p);
    for (const p of pages) expect(rules.get(`${p}index.html`), p).toBe(p);
  });

  it("sends the /work/ parents to the home page's work section, in each language", () => {
    expect(rules.get("/work")).toBe("/#work");
    expect(rules.get("/work/")).toBe("/#work");
    expect(rules.get("/ar/work")).toBe("/ar/#work");
    expect(rules.get("/ar/work/")).toBe("/ar/#work");
  });

  it("sends guessed URLs to the real ones: sitemap, resume, CV PDFs, security.txt, the unused /en/ prefix", () => {
    expect(rules.get("/sitemap.xml")).toBe("/sitemap-index.xml");
    expect(rules.get("/resume")).toBe("/cv/");
    expect(rules.get("/ar/resume/")).toBe("/ar/cv/");
    expect(rules.get("/cv.pdf")).toBe("/cv/Mohamed-Hatem-CV.pdf");
    expect(rules.get("/security.txt")).toBe("/.well-known/security.txt");
    expect(rules.get("/en")).toBe("/");
    expect(rules.get("/en/*")).toBe("/:splat");
    // The splat is the only dynamic rule (Workers allow 100).
    expect([...rules.keys()].filter((from) => from.includes("*"))).toEqual(["/en/*"]);
  });

  it("never redirects a page to itself or loops", () => {
    for (const [from, to] of rules) {
      expect(from).not.toBe(to);
      expect(rules.get(to.replace(/#.*$/, ""))).toBeUndefined();
    }
  });
});

describe("Early Hints Link header", () => {
  it("preloads the page's stylesheets and preloaded fonts, nothing else", () => {
    const html = `<html><head>
      <link rel="preload" href="/_astro/fonts/a.woff2" as="font" type="font/woff2" crossorigin>
      <link rel="icon" href="/favicon.svg">
      <link rel="stylesheet" href="/_astro/Head.x.css">
      <link rel="stylesheet" href="https://example.com/x.css">
      </head><body><link rel="stylesheet" href="/_astro/late.css"></body></html>`;
    expect(linkHeader(html)).toBe('</_astro/fonts/a.woff2>; rel=preload; as=font; type="font/woff2"; crossorigin, </_astro/Head.x.css>; rel=preload; as=style');
  });
});

describe("page dates", () => {
  it("dates every page with a full ISO date", () => {
    for (const p of ["/", "/ar/", "/cv/", "/ar/cv/", "/privacy/", "/ar/privacy/", ...profile.caseStudies.map((c) => `/work/${c.slug}/`)])
      expect(lastModified(p), p).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(lastModified("/nope/")).toBeUndefined();
  });

  it("dates the home page by its newest content", () => {
    for (const d of [profile.site.updated, profile.cv.updated, ...profile.caseStudies.map((c) => c.updated)]) expect(HOME_UPDATED >= d).toBe(true);
    expect(lastModified("/privacy/")).toBe(PRIVACY_UPDATED);
  });
});
