import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { completePage, inlineScriptHashes, inlineStyleHashes, parsePolicy } from "../../integrations/csp-hashes.mjs";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const page = (body: string, meta = `<meta http-equiv="content-security-policy" content="default-src 'self'; script-src 'self' 'sha256-old='; style-src 'self'">`) =>
  `<!doctype html><html><head><meta charset="utf-8">${meta}</head><body>${body}</body></html>`;

describe("CSP hash integration", () => {
  it("hashes inline scripts and styles, ignoring external and JSON-LD scripts", () => {
    const html = page(`<script>a()</script><script src="/x.js"></script><script type="application/ld+json">{"a":1}</script><style>.a{}</style>`);
    expect([...inlineScriptHashes(html)]).toEqual([sha("a()")]);
    expect([...inlineStyleHashes(html)]).toEqual([sha(".a{}")]);
  });

  it("rewrites the meta with exactly the page's hashes and moves it after <meta charset>", () => {
    const out = completePage(page(`<script>a()</script><style>.a{}</style>`), "x.html")!;
    const policy = parsePolicy(/content="([^"]*)"/.exec(out.match(/<meta http-equiv[^>]+>/)![0])![1]!);
    expect(policy.get("script-src")).toEqual(["'self'", sha("a()")]);
    expect(policy.get("style-src")).toEqual(["'self'", sha(".a{}")]);
    expect(out.indexOf("content-security-policy")).toBeGreaterThan(out.indexOf('<meta charset="utf-8">'));
  });

  it("fails closed on style attributes, missing meta and 'unsafe-inline'", () => {
    expect(() => completePage(page(`<p style="color:red">x</p>`), "x.html")).toThrow(/style=/);
    expect(() => completePage(`<html><head><meta charset="utf-8"></head><body><script>a()</script></body></html>`, "x.html")).toThrow(/no CSP/);
    expect(() =>
      completePage(page("<script>a()</script>", `<meta http-equiv="content-security-policy" content="script-src 'self' 'unsafe-inline'; style-src 'self'">`), "x.html"),
    ).toThrow(/unsafe-inline/);
  });
});
