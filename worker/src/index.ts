/**
 * mohamedhatem.dev Worker. Static assets (./dist) are served without running this code; only /api/* and the two
 * 404 page URLs reach it (wrangler.jsonc → assets.run_worker_first).
 *
 *   POST /api/chat        streamed answers from Gemini, grounded in content/chat/knowledge.md (chat/handler.ts)
 *   POST /api/contact     contact form → email to the owner (contact/handler.ts); a form posted without JavaScript
 *                         gets an HTML page back (contact/page.ts)
 *   POST /api/csp-report  CSP violation reports → an anonymous counter (csp-report.ts)
 *   GET  /api/health      { ok, version } for smoke tests and uptime checks
 *   GET  /404, /ar/404    the 404 pages with status 404 (as static assets they would answer 200: a soft 404)
 *
 * Contract, security model and limits: worker/README.md.
 */
import { handleChat } from "./chat/handler";
import { handleContact } from "./contact/handler";
import { handleCspReport } from "./csp-report";
import type { Env } from "./env";
import { CONTENT_VERSION } from "./generated/content";
import { json, methodNotAllowed, preflight } from "./http";

/**
 * The 404 pages' own URLs (Workers static assets serve dist/404.html at /404 with 200, a soft 404). Answered with the
 * same page and status 404, exactly what a missing path gets: the asset handler's not_found_handling for a path that
 * can't exist, in the page's language (/ar/… → dist/ar/404.html). Keep in step with run_worker_first.
 */
const NOT_FOUND_PAGES = new Set(["/404", "/ar/404"]);

async function notFoundPage(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = url.pathname.startsWith("/ar/") ? "/ar/__404__" : "/__404__";
  url.search = "";
  // No conditional or range headers: a 404 is always answered in full (a matching If-None-Match would get a 304).
  const headers = new Headers();
  for (const name of ["Accept", "Accept-Encoding", "Accept-Language", "User-Agent"]) {
    const v = req.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  const res = await env.ASSETS.fetch(new Request(url, { method: req.method === "HEAD" ? "HEAD" : "GET", headers }));
  return new Response(res.body, { status: 404, headers: res.headers });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (NOT_FOUND_PAGES.has(pathname)) return notFoundPage(req, env);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.method === "OPTIONS") return preflight(req, env);

    try {
      switch (pathname) {
        case "/api/chat":
          return req.method === "POST" ? await handleChat(req, env, ctx) : methodNotAllowed(req, env);
        case "/api/contact":
          return req.method === "POST" ? await handleContact(req, env) : methodNotAllowed(req, env);
        case "/api/csp-report":
          return req.method === "POST" ? await handleCspReport(req, env) : methodNotAllowed(req, env, "POST, OPTIONS");
        case "/api/health":
          return req.method === "GET" || req.method === "HEAD"
            ? json(req, env, 200, { ok: true, version: CONTENT_VERSION })
            : methodNotAllowed(req, env, "GET, HEAD");
        default:
          return json(req, env, 404, { ok: false, error: "not_found", message: "Not found" });
      }
    } catch (e) {
      console.error("api error", e instanceof Error ? e.name : "unknown");
      return json(req, env, 500, { ok: false, error: "internal", message: "Something went wrong on our side. Please try again." });
    }
  },
} satisfies ExportedHandler<Env>;
