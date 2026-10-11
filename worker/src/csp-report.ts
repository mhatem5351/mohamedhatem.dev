/**
 * POST /api/csp-report: Content-Security-Policy violation reports → an anonymous counter in Analytics Engine.
 *
 * The header policy (site/public/_headers) names this endpoint twice, so every browser can report:
 *   report-to csp + Reporting-Endpoints: csp="/api/csp-report"   Chrome 96+, Safari 16.4+, Firefox 149+
 *                                                                 (application/reports+json, batched up to a minute)
 *   report-uri /api/csp-report                                    older browsers (application/csp-report, no-cors)
 * A page script may also send one violation as application/json (the Reporting API body shape).
 *
 * Only three coarse facts are kept per violation: the directive, what was blocked (a keyword such as "inline", or a
 * host name, never a full URL) and which kind of page it was (a known site path, otherwise "other"). Never the IP,
 * the user agent, the referrer, a query string, a script sample or a source line. The endpoint always answers 204
 * once a report is readable, also when it is dropped (rate limit, foreign page), so browsers don't retry it.
 *
 * Analytics Engine schema (dataset mh_events, positional, keep stable):
 *   index1 "csp" · blob1 "csp" · blob2 directive · blob3 blocked · blob4 page · blob5 disposition ("enforce" | "report")
 *   blob6 format ("reporting-api" | "report-uri" | "beacon") · blob8 country (2 letters or "") · double1 count (1)
 * (blob8 is the country in the chat and contact events too.)
 */
import { countryOf } from "./analytics";
import type { Env } from "./env";
import { allowedOrigin, clientKey, parseJsonBytes, readCapped, SECURITY_HEADERS } from "./http";
import { checkLimits } from "./ratelimit";

/** Chromium batches reports; 16 KB holds a full batch of ordinary ones. */
export const CSP_REPORT_MAX_BODY = 16 * 1024;
/** At most this many data points per request (a batch of identical violations is one fact, not ten). */
export const CSP_REPORT_MAX_POINTS = 5;

export type CspFormat = "reporting-api" | "report-uri" | "beacon";

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
  disposition: "enforce" | "report";
}

/** Keywords browsers put in blockedURL / blocked-uri instead of a URL. */
const BLOCKED_KEYWORDS = new Set(["inline", "eval", "wasm-eval", "data", "blob", "self", "trusted-types-policy", "trusted-types-sink"]);
/** The site's page paths (EN and AR): anything else (404 URLs people typed, query strings) becomes "other". */
const PAGE = /^\/(?:ar\/)?(?:(?:work\/[a-z0-9-]{1,60}|cv|privacy)\/)?$/;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** First token of the directive, lower-case, e.g. "script-src-elem" ("other" for anything odd). */
export function cleanDirective(raw: string): string {
  const d = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z][a-z-]{1,39}$/.test(d) ? d : "other";
}

/** A keyword, or the host of a blocked URL (no path, no query: those can carry personal data). */
export function cleanBlocked(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "none";
  if (BLOCKED_KEYWORDS.has(v)) return v;
  if (/^(data|blob|about|chrome-extension|moz-extension|safari-web-extension|safari-extension):/.test(v)) return v.split(":")[0]!;
  try {
    const host = new URL(v).host;
    return host && host.length <= 100 ? host : "other";
  } catch {
    return "other";
  }
}

/** The page the violation happened on: a known site path, or "other" (a foreign or unparsable URL included). */
export function cleanPage(raw: string, siteHosts: readonly string[]): string {
  try {
    const u = new URL(raw);
    if (!siteHosts.includes(u.host)) return "foreign";
    return PAGE.test(u.pathname) ? u.pathname : "other";
  } catch {
    return "other";
  }
}

/** Reads a report body in any of the three formats into violations (unknown shapes → []). */
export function parseCspReports(data: unknown, siteHosts: readonly string[]): { format: CspFormat; violations: CspViolation[] } | null {
  const one = (b: Record<string, unknown>, legacy: boolean): CspViolation => ({
    directive: cleanDirective(str(legacy ? (b["effective-directive"] ?? b["violated-directive"]) : (b.effectiveDirective ?? b.violatedDirective))),
    blocked: cleanBlocked(str(legacy ? b["blocked-uri"] : (b.blockedURL ?? b.blockedURI))),
    page: cleanPage(str(legacy ? b["document-uri"] : (b.documentURL ?? b.documentURI)), siteHosts),
    disposition: str(b.disposition) === "report" ? "report" : "enforce",
  });
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

  if (Array.isArray(data)) {
    const violations = data
      .filter(isObj)
      .filter((r) => r.type === "csp-violation" && isObj(r.body))
      .map((r) => one(r.body as Record<string, unknown>, false));
    return { format: "reporting-api", violations };
  }
  if (isObj(data) && isObj(data["csp-report"])) return { format: "report-uri", violations: [one(data["csp-report"], true)] };
  if (isObj(data) && (typeof data.effectiveDirective === "string" || typeof data.violatedDirective === "string"))
    return { format: "beacon", violations: [one(data, false)] };
  return null;
}

/** Host names whose pages may report here: the Worker's own host and the allowed origins' hosts. */
function siteHostsOf(req: Request, env: Env): string[] {
  const hosts = new Set<string>([new URL(req.url).host]);
  for (const o of (env.ALLOWED_ORIGINS ?? "").split(",")) {
    try {
      hosts.add(new URL(o.trim()).host);
    } catch {
      /* ignore malformed entries */
    }
  }
  return [...hosts];
}

const done = (status = 204) => new Response(null, { status, headers: SECURITY_HEADERS });

export async function handleCspReport(req: Request, env: Env): Promise<Response> {
  // Reports from our pages are same-origin. A foreign Origin is another site posting here: refused. report-uri
  // deliveries are no-cors and may carry "Origin: null" (or none): the page URL inside the report is checked instead
  // (cleanPage → "foreign").
  const origin = req.headers.get("Origin");
  if (origin !== null && origin !== "null" && allowedOrigin(req, env) === null) return done(403);

  const type = req.headers.get("Content-Type") ?? "";
  if (!/^application\/(reports\+json|csp-report|json)\b/i.test(type)) return done(415);

  const limited = await checkLimits([
    { binding: env.RL_CSP, key: `csp:${clientKey(req)}`, retryAfter: 60 },
    { binding: env.RL_CSP_GLOBAL, key: "csp:all", retryAfter: 60 },
  ]);
  if (!limited.ok) return done(); // dropped quietly: a 429 would only make the browser send it again

  const body = await readCapped(req, CSP_REPORT_MAX_BODY);
  if (!body.ok) return done(body.code === "too_large" ? 413 : 400);
  const parsed = parseCspReports(parseJsonBytes(body.bytes), siteHostsOf(req, env));
  if (!parsed) return done(400);

  const country = countryOf(req);
  const seen = new Set<string>();
  for (const v of parsed.violations) {
    if (v.page === "foreign") continue;
    const key = `${v.directive}|${v.blocked}|${v.page}|${v.disposition}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > CSP_REPORT_MAX_POINTS) break;
    try {
      env.EVENTS?.writeDataPoint({
        indexes: ["csp"],
        blobs: ["csp", v.directive, v.blocked, v.page, v.disposition, parsed.format, "", country],
        doubles: [1],
      });
    } catch {
      /* analytics must never break a response */
    }
  }
  return done();
}
