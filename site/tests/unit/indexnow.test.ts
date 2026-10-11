/**
 * scripts/indexnow.mjs: only URLs whose sitemap <lastmod> changed since the last accepted submission are sent, plus
 * new and removed ones; without a record (or with --all) every URL is. The key is the public key file's name.
 */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { payload, readKey, serializeState, sitemapDates, toSubmit } from "../../scripts/indexnow.mjs";

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://mohamedhatem.dev/</loc><lastmod>2026-10-11</lastmod><xhtml:link rel="alternate" hreflang="ar" href="https://mohamedhatem.dev/ar/"/></url>
<url><loc>https://mohamedhatem.dev/ar/cv/</loc><lastmod>2026-10-09</lastmod></url>
<url><loc>https://mohamedhatem.dev/privacy/</loc></url></urlset>`;

describe("IndexNow submission", () => {
  it("reads every <loc> with its <lastmod> as a path map", () => {
    expect(sitemapDates([SITEMAP])).toEqual({ "/": "2026-10-11", "/ar/cv/": "2026-10-09", "/privacy/": "" });
  });

  it("submits new, re-dated and removed paths only", () => {
    const current = { "/": "b", "/ar/cv/": "a", "/work/new/": "a" };
    const submitted = { "/": "a", "/ar/cv/": "a", "/work/gone/": "a" };
    expect(toSubmit(current, submitted)).toEqual({
      paths: ["/", "/work/gone/", "/work/new/"],
      added: ["/work/new/"],
      changed: ["/"],
      removed: ["/work/gone/"],
      full: false,
    });
    expect(toSubmit(current, { ...current }).paths).toEqual([]);
  });

  it("no record of a submission, or --all: every sitemap path", () => {
    const current = { "/": "b", "/ar/": "a" };
    expect(toSubmit(current, undefined)).toMatchObject({ paths: ["/", "/ar/"], full: true });
    expect(toSubmit(current, { ...current }, { all: true })).toMatchObject({ paths: ["/", "/ar/"], full: true });
  });

  it("records the state with sorted paths, 2-space indent and a trailing newline", () => {
    expect(serializeState({ "/ar/": "b", "/": "a" })).toBe('{\n  "/": "a",\n  "/ar/": "b"\n}\n');
  });

  it("sends absolute URLs on the site's host, with the key file's location", () => {
    expect(payload("0123456789abcdef0123456789abcdef", ["/", "/ar/cv/"])).toEqual({
      host: "mohamedhatem.dev",
      key: "0123456789abcdef0123456789abcdef",
      keyLocation: "https://mohamedhatem.dev/0123456789abcdef0123456789abcdef.txt",
      urlList: ["https://mohamedhatem.dev/", "https://mohamedhatem.dev/ar/cv/"],
    });
  });

  it("the key is the one public <32 hex>.txt file, which holds exactly its own name", () => {
    const pub = fileURLToPath(new URL("../../public/", import.meta.url));
    const key = readKey(pub);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(readFileSync(join(pub, `${key}.txt`), "utf8")).toBe(key);
    expect(readdirSync(pub).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f))).toEqual([`${key}.txt`]);

    const dir = mkdtempSync(join(tmpdir(), "indexnow-"));
    writeFileSync(join(dir, "0123456789abcdef0123456789abcdef.txt"), "0123456789abcdef0123456789abcdef\n");
    expect(() => readKey(dir)).toThrow(/exactly its own name/);
  });
});
