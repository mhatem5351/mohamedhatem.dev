/**
 * Platform routes outside the chat: CSP violation reports, the health check's methods, the 404 pages' own URLs and the
 * contact form posted without JavaScript (an HTML answer instead of JSON). Audit round 6: SEC-H01, SEC-H04, SEO-03,
 * RES-01.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSP_ISOLATE_DAILY_POINTS, cleanBlocked, cleanPage, parseCspReports, resetIsolatePoints, takeIsolatePoint } from "../src/csp-report";
import { CHANNELS, renderContactPage, wantsHtml } from "../src/contact/page";
import { PERMISSIONS_POLICY } from "../src/http";
import worker from "../src/index";
import { fakeLimiter, makeCtx, makeEnv, ORIGIN } from "./helpers";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url).href), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ headers and methods */

describe("API headers and methods (SEC-H04)", () => {
  it("/api/health answers other methods with 405 and Allow: GET, HEAD", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/health`, { method: "POST", headers: { Origin: ORIGIN } }), makeEnv(), makeCtx());
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
    const head = await worker.fetch(new Request(`${ORIGIN}/api/health`, { method: "HEAD" }), makeEnv(), makeCtx());
    expect(head.status).toBe(200);
  });

  it("the POST routes keep Allow: POST, OPTIONS", async () => {
    for (const path of ["/api/chat", "/api/contact", "/api/csp-report"]) {
      const res = await worker.fetch(new Request(`${ORIGIN}${path}`), makeEnv(), makeCtx());
      expect(res.status, path).toBe(405);
      expect(res.headers.get("Allow"), path).toBe("POST, OPTIONS");
    }
  });

  it("Permissions-Policy is the site's (no retired interest-cohort), the same value as site/public/_headers", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/health`), makeEnv(), makeCtx());
    expect(res.headers.get("Permissions-Policy")).toBe(PERMISSIONS_POLICY);
    expect(PERMISSIONS_POLICY).not.toContain("interest-cohort");
    expect(read("../../site/public/_headers")).toContain(`  Permissions-Policy: ${PERMISSIONS_POLICY}\n`);
  });
});

/* ------------------------------------------------------------------ 404 pages */

describe("the 404 pages' own URLs answer 404 (SEO-03)", () => {
  it("/404 and /ar/404 serve their page through not_found_handling, with status 404 and no conditional headers", async () => {
    const seen: Request[] = [];
    const env = makeEnv({
      ASSETS: {
        fetch: async (r: Request) => {
          seen.push(r);
          return new Response(`page for ${new URL(r.url).pathname}`, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"x"' } });
        },
      } as unknown as Fetcher,
    });
    const en = await worker.fetch(new Request(`${ORIGIN}/404?x=1`, { headers: { "If-None-Match": '"x"', "Accept-Encoding": "br" } }), env, makeCtx());
    expect(en.status).toBe(404);
    expect(await en.text()).toBe("page for /__404__");
    expect(en.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const ar = await worker.fetch(new Request(`${ORIGIN}/ar/404`), env, makeCtx());
    expect(ar.status).toBe(404);
    expect(await ar.text()).toBe("page for /ar/__404__");
    expect(seen[0]!.headers.get("If-None-Match")).toBeNull();
    expect(seen[0]!.headers.get("Accept-Encoding")).toBe("br");
    expect(new URL(seen[0]!.url).search).toBe("");
  });

  it("run_worker_first routes exactly these URLs (and /api/*) to the Worker", () => {
    const config = read("../../wrangler.jsonc");
    expect(config).toMatch(/"run_worker_first": \["\/api\/\*", "\/404", "\/ar\/404"\]/);
  });
});

/* ------------------------------------------------------------------ CSP reports */

const REPORTING_API = [
  {
    type: "csp-violation",
    age: 10,
    url: "https://mohamedhatem.dev/work/x/?utm=1",
    user_agent: "Mozilla/5.0",
    body: {
      documentURL: "https://mohamedhatem.dev/work/sta-tourism-assistants/?email=a@b.c",
      blockedURL: "https://evil.example/x.js?token=secret",
      effectiveDirective: "script-src-elem",
      disposition: "enforce",
      sample: "alert(1)",
      sourceFile: "https://mohamedhatem.dev/_astro/x.js",
      lineNumber: 1,
    },
  },
  { type: "deprecation", body: { id: "x" } },
];
const LEGACY = {
  "csp-report": {
    "document-uri": "https://mohamedhatem.dev/ar/",
    "violated-directive": "frame-ancestors 'none'",
    "effective-directive": "frame-ancestors",
    "blocked-uri": "inline",
    disposition: "enforce",
  },
};

function cspRequest(body: unknown, type = "application/reports+json", headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/csp-report`, {
    method: "POST",
    headers: { "Content-Type": type, "CF-Connecting-IP": "198.51.100.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
type Point = { indexes: string[]; blobs: string[]; doubles: number[] };

describe("POST /api/csp-report (SEC-H01, R7-SEC-01)", () => {
  beforeEach(() => resetIsolatePoints());

  it("counts a Reporting API violation: directive, blocked host, page path; nothing about the visitor", async () => {
    const env = makeEnv();
    const res = await worker.fetch(cspRequest(REPORTING_API, "application/reports+json", { Origin: ORIGIN }), env, makeCtx());
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(env.points).toEqual([
      { indexes: ["csp"], blobs: ["csp", "script-src-elem", "evil.example", "/work/sta-tourism-assistants/", "enforce", "reporting-api", "", ""], doubles: [1, 1] },
    ]);
    const stored = JSON.stringify(env.points);
    for (const leak of ["198.51.100.9", "Mozilla", "secret", "email", "alert", "utm"]) expect(stored).not.toContain(leak);
  });

  it("reads report-uri (application/csp-report) and a page script's beacon (application/json)", async () => {
    const env = makeEnv();
    expect((await worker.fetch(cspRequest(LEGACY, "application/csp-report"), env, makeCtx())).status).toBe(204);
    const beacon = { documentURL: "https://mohamedhatem.dev/cv/", blockedURL: "eval", effectiveDirective: "script-src", disposition: "report" };
    expect((await worker.fetch(cspRequest(beacon, "application/json", { Origin: ORIGIN }), env, makeCtx())).status).toBe(204);
    expect((env.points as Point[]).map((p) => p.blobs.slice(1, 6))).toEqual([
      ["frame-ancestors", "inline", "/ar/", "enforce", "report-uri"],
      ["script-src", "eval", "/cv/", "report", "beacon"],
    ]);
  });

  it("reads Safari's single report (a Reporting API report on its own, sent as application/csp-report)", async () => {
    // Captured from WebKit (Playwright) on a local wrangler dev, for an inline script the page's <meta> refused.
    const safari = {
      type: "csp-violation",
      url: "https://mohamedhatem.dev/cv/",
      body: {
        documentURL: "https://mohamedhatem.dev/cv/",
        disposition: "report",
        referrer: "",
        effectiveDirective: "script-src-elem",
        blockedURL: "inline",
        originalPolicy: "default-src 'self'; script-src 'self'; report-uri /api/csp-report; report-to csp",
        statusCode: 200,
        sample: "",
      },
    };
    const env = makeEnv();
    expect((await worker.fetch(cspRequest(safari, "application/csp-report", { Origin: ORIGIN }), env, makeCtx())).status).toBe(204);
    expect((env.points as Point[]).map((p) => p.blobs.slice(1, 6))).toEqual([["script-src-elem", "inline", "/cv/", "report", "reporting-api"]]);
  });

  it("refuses foreign origins, other content types, oversized and unreadable bodies", async () => {
    const env = makeEnv();
    expect((await worker.fetch(cspRequest(LEGACY, "application/csp-report", { Origin: "https://evil.example" }), env, makeCtx())).status).toBe(403);
    // report-uri is sent no-cors: "Origin: null" is a browser's report, judged by the page URL inside it.
    expect((await worker.fetch(cspRequest(LEGACY, "application/csp-report", { Origin: "null" }), env, makeCtx())).status).toBe(204);
    env.points.length = 0;
    expect((await worker.fetch(cspRequest(LEGACY, "text/plain"), env, makeCtx())).status).toBe(415);
    expect((await worker.fetch(cspRequest("x".repeat(17 * 1024), "application/csp-report"), env, makeCtx())).status).toBe(413);
    expect((await worker.fetch(cspRequest("{nope", "application/csp-report"), env, makeCtx())).status).toBe(400);
    expect((await worker.fetch(cspRequest({ hello: 1 }, "application/json"), env, makeCtx())).status).toBe(400);
    expect(env.points).toHaveLength(0);
  });

  it("writes ONE data point per request: the first violation from the site's pages, with the batch's distinct count", async () => {
    const env = makeEnv();
    const report = (path: string, directive = "img-src") => ({
      type: "csp-violation",
      body: { documentURL: `https://mohamedhatem.dev${path}`, blockedURL: "https://cdn.example/a.png", effectiveDirective: directive, disposition: "enforce" },
    });
    const foreign = { type: "csp-violation", body: { ...report("/").body, documentURL: "https://other.example/" } };
    const batch = [foreign, report("/"), report("/"), ...["a", "b", "c", "d", "e", "f"].map((d) => report("/", `${d}-src`))];
    expect((await worker.fetch(cspRequest(batch, "application/reports+json", { Origin: ORIGIN }), env, makeCtx())).status).toBe(204);
    expect(env.points).toEqual([
      { indexes: ["csp"], blobs: ["csp", "img-src", "cdn.example", "/", "enforce", "reporting-api", "", ""], doubles: [1, 7] },
    ]);
  });

  it("a report without an Origin counts only when it names one of the site's pages; dropped ones spend no limit", async () => {
    const limiter = fakeLimiter(10);
    const env = makeEnv({ RL_CSP: limiter as unknown as RateLimit });
    const typed = { "csp-report": { ...LEGACY["csp-report"], "document-uri": "https://mohamedhatem.dev/wp-admin/x.php" } };
    for (const headers of [{}, { Origin: "null" }] as Record<string, string>[]) expect((await worker.fetch(cspRequest(typed, "application/csp-report", headers), env, makeCtx())).status).toBe(204);
    const foreign = { "csp-report": { ...LEGACY["csp-report"], "document-uri": "https://other.example/" } };
    expect((await worker.fetch(cspRequest(foreign, "application/csp-report"), env, makeCtx())).status).toBe(204);
    expect(env.points).toHaveLength(0);
    expect(limiter.keys).toHaveLength(0);
    // From the site's own pages (an allowed Origin), an unknown path is a real page view (a 404): counted as "other".
    await worker.fetch(cspRequest(typed, "application/csp-report", { Origin: ORIGIN }), env, makeCtx());
    expect((env.points as Point[]).map((p) => p.blobs[3])).toEqual(["other"]);
    expect(limiter.keys).toHaveLength(1);
  });

  it("each isolate writes at most CSP_ISOLATE_DAILY_POINTS a UTC day", async () => {
    const day = Date.parse("2026-10-11T12:00:00Z");
    for (let i = 0; i < CSP_ISOLATE_DAILY_POINTS; i++) expect(takeIsolatePoint(day)).toBe(true);
    expect(takeIsolatePoint(day)).toBe(false);
    expect(takeIsolatePoint(day + 11 * 3600_000)).toBe(false); // 23:00 the same day
    expect(takeIsolatePoint(day + 12 * 3600_000)).toBe(true); // 00:00 the next day
    // Spent today: the endpoint still answers 204 and writes nothing.
    resetIsolatePoints();
    for (let i = 0; i < CSP_ISOLATE_DAILY_POINTS; i++) takeIsolatePoint();
    const env = makeEnv();
    expect((await worker.fetch(cspRequest(LEGACY, "application/csp-report"), env, makeCtx())).status).toBe(204);
    expect(env.points).toHaveLength(0);
  });

  it("the limits keep the worst case well under 10 % of the account's 100,000 data points a day", () => {
    const config = read("../../wrangler.jsonc");
    const limitOf = (name: string) => Number(config.match(new RegExp(`"name": "${name}",[^}]*"limit": (\\d+), "period": (\\d+)`))?.[1]);
    const periodOf = (name: string) => Number(config.match(new RegExp(`"name": "${name}",[^}]*"limit": \\d+, "period": (\\d+)`))?.[1]);
    const perLocationPerDay = (limitOf("RL_CSP_GLOBAL") * 86_400) / periodOf("RL_CSP_GLOBAL");
    expect(perLocationPerDay).toBeLessThanOrEqual(5_000);
    expect(limitOf("RL_CSP")).toBeLessThanOrEqual(limitOf("RL_CSP_GLOBAL"));
  });

  it("rate limited per IP and per location: still 204 (a 429 would make the browser resend), nothing counted", async () => {
    const env = makeEnv({ RL_CSP: fakeLimiter(1) as unknown as RateLimit });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await worker.fetch(cspRequest(LEGACY, "application/csp-report"), env, makeCtx())).status);
    expect(statuses).toEqual([204, 204, 204]);
    expect(env.points).toHaveLength(1);
    const global = makeEnv({ RL_CSP_GLOBAL: fakeLimiter(0) as unknown as RateLimit });
    await worker.fetch(cspRequest(LEGACY, "application/csp-report"), global, makeCtx());
    expect(global.points).toHaveLength(0);
  });

  it("keeps only coarse values: known page paths, host names, keywords", () => {
    const hosts = ["mohamedhatem.dev"];
    expect(cleanPage("https://mohamedhatem.dev/ar/work/tabaqat-gis/", hosts)).toBe("/ar/work/tabaqat-gis/");
    expect(cleanPage("https://mohamedhatem.dev/someone@example.com/", hosts)).toBe("other");
    expect(cleanPage("https://mohamedhatem.dev/cv/?ref=x#y", hosts)).toBe("/cv/");
    expect(cleanPage("https://evil.example/", hosts)).toBe("foreign");
    expect(cleanPage("not a url", hosts)).toBe("other");
    expect(cleanBlocked("https://Static.Example:8443/path?q=1")).toBe("static.example:8443");
    expect(cleanBlocked("inline")).toBe("inline");
    expect(cleanBlocked("data:image/png;base64,AAAA")).toBe("data");
    expect(cleanBlocked("chrome-extension://abc/x.js")).toBe("chrome-extension");
    expect(cleanBlocked("")).toBe("none");
    expect(parseCspReports([{ type: "csp-violation", body: { effectiveDirective: "<script>" } }], hosts)?.violations[0]?.directive).toBe("other");
  });

  it("the site's header policy reports here (report-uri + report-to csp + Reporting-Endpoints)", () => {
    const headers = read("../../site/public/_headers");
    expect(headers).toMatch(/Content-Security-Policy: frame-ancestors 'none';[^\n]*; report-uri \/api\/csp-report; report-to csp\n/);
    expect(headers).toContain('Reporting-Endpoints: csp="/api/csp-report"');
  });
});

/* ------------------------------------------------------------------ contact without JavaScript */

const form = {
  name: "Sara Recruiter",
  email: "sara@example.com",
  company: "Acme AI",
  subject: "hiring",
  message: "We have a role <script>alert(1)</script> & more \"quotes\" that fits.",
  mh_hp: "",
  lang: "en",
};

/** A native form post, as a browser sends it (no JavaScript ran: no Turnstile token). */
function nativePost(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Sec-Fetch-Mode": "navigate",
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      "CF-Connecting-IP": "198.51.100.5",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function stubSiteverify(result: Record<string, unknown>) {
  const fn = vi.fn(async () => new Response(JSON.stringify(result)));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("contact form posted without JavaScript (RES-01)", () => {
  beforeEach(() => {
    stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "contact" });
  });

  it("no token: nothing is sent, and an HTML page explains it and offers email and WhatsApp with the visitor's text", async () => {
    const siteverify = stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "contact" });
    const env = makeEnv();
    const res = await worker.fetch(nativePost(form), env, makeCtx());
    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(env.sent).toHaveLength(0);
    expect(siteverify).not.toHaveBeenCalled();
    const html = await res.text();
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain("Your message wasn&#39;t sent");
    expect(html).toContain("needs JavaScript for its spam check");
    // The visitor's text, escaped (never markup), in the read-only box and in the prefilled links.
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more &quot;quotes&quot;");
    const mailto = html.match(/href="(mailto:[^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(mailto).toBeDefined();
    const url = new URL(mailto!);
    expect(url.pathname).toBe(CHANNELS.email);
    expect(url.searchParams.get("body")).toBe(`${form.message}\n\nSara Recruiter, Acme AI`);
    expect(html).toContain(`${CHANNELS.whatsapp.href}?text=`);
    expect(html).toContain('href="/#contact"');
  });

  it("the page's CSP admits only its own style block (a fresh nonce), no scripts, no forms", async () => {
    const res = await worker.fetch(nativePost(form), makeEnv(), makeCtx());
    const csp = res.headers.get("Content-Security-Policy")!;
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(csp).toMatch(/^default-src 'none'; style-src 'nonce-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/);
    expect(await res.text()).toContain(`<style nonce="${nonce}">`);
    const again = await worker.fetch(nativePost(form), makeEnv(), makeCtx());
    expect(again.headers.get("Content-Security-Policy")).not.toBe(csp);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers in Arabic for the Arabic form, and from the Referer when the fields can't be read", async () => {
    const ar = await (await worker.fetch(nativePost({ ...form, lang: "ar" }), makeEnv(), makeCtx())).text();
    expect(ar).toContain('<html lang="ar" dir="rtl">');
    expect(ar).toContain("لم تُرسَل رسالتك");
    const big = await worker.fetch(nativePost({ ...form, message: "x".repeat(40_000) }, { Referer: `${ORIGIN}/ar/` }), makeEnv(), makeCtx());
    expect(big.status).toBe(413);
    const html = await big.text();
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).not.toContain("<textarea");
  });

  it("a post from another site gets the page without any of the posted text", async () => {
    const res = await worker.fetch(nativePost(form, { Origin: "https://evil.example" }), makeEnv(), makeCtx());
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("only accepts messages sent from mohamedhatem.dev");
    expect(html).not.toContain("Sara");
    expect(html).not.toContain("alert");
  });

  it("with a valid token (a browser that ran the widget, then posted natively) the message is sent and the page confirms it", async () => {
    const env = makeEnv();
    const res = await worker.fetch(nativePost({ ...form, "cf-turnstile-response": "tok" }), env, makeCtx());
    expect(res.status).toBe(200);
    expect(env.sent).toHaveLength(1);
    const html = await res.text();
    expect(html).toContain("Message sent");
    expect(html).toMatch(/Reference: <bdi dir="auto">MH-\d{6}-[2-9A-Z]{5}<\/bdi>/);
    expect(html).toContain("sara@example.com");
  });

  it("empty fields without a token read as 'needs JavaScript'; the honeypot still pretends success", async () => {
    const env = makeEnv();
    const empty = await worker.fetch(nativePost({ ...form, name: "", email: "" }), env, makeCtx());
    expect(empty.status).toBe(422);
    expect(await empty.text()).toContain("needs JavaScript");
    const bot = await worker.fetch(nativePost({ ...form, mh_hp: "http://spam.example" }), env, makeCtx());
    expect(bot.status).toBe(200);
    expect(await bot.text()).toContain("Message sent");
    expect(env.sent).toHaveLength(0);
  });

  it("the page script's JSON requests and other API clients keep the JSON contract", async () => {
    const json = new Request(`${ORIGIN}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: ORIGIN },
      body: JSON.stringify({ ...form, turnstileToken: "" }),
    });
    const res = await worker.fetch(json, makeEnv(), makeCtx());
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(wantsHtml(nativePost(form, { "Sec-Fetch-Mode": "cors", Accept: "*/*" }))).toBe(false);
    expect(wantsHtml(nativePost(form, { "Sec-Fetch-Mode": "cors", Accept: "application/json" }))).toBe(false);
    expect(wantsHtml(nativePost(form, { "Sec-Fetch-Mode": "", Accept: "text/html" }))).toBe(true);
  });

  it("names the site's real email and WhatsApp (content/profile.ts)", () => {
    const profile = read("../../content/profile.ts");
    expect(profile).toContain(`href: "mailto:${CHANNELS.email}"`);
    expect(profile).toContain(`display: "${CHANNELS.whatsapp.display}"`);
    expect(profile).toContain(`href: "${CHANNELS.whatsapp.href}"`);
  });

  it("renders without the visitor's text when there is none", () => {
    const html = renderContactPage({ lang: "en", outcome: "rate_limited", echo: { name: "", company: "", message: "  " } }, "n");
    expect(html).toContain("Too many messages");
    expect(html).not.toContain("<textarea");
    expect(html).toContain(`Email: <bdi dir="auto">${CHANNELS.email}</bdi>`);
  });
});
