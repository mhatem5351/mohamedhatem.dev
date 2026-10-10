/**
 * mohamedhatem.dev Worker. Static assets (./dist) are served without running this code; only /api/* reaches it
 * (wrangler.jsonc → assets.run_worker_first).
 *
 *   POST /api/chat      streamed answers from Gemini, grounded in content/chat/knowledge.md (chat/handler.ts)
 *   POST /api/contact   contact form → email to the owner (contact/handler.ts)
 *   GET  /api/health    { ok, version } for smoke tests and uptime checks
 *
 * Contract, security model and limits: worker/README.md.
 */
import { handleChat } from "./chat/handler";
import { handleContact } from "./contact/handler";
import type { Env } from "./env";
import { CONTENT_VERSION } from "./generated/content";
import { json, methodNotAllowed, preflight } from "./http";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.method === "OPTIONS") return preflight(req, env);

    try {
      switch (pathname) {
        case "/api/chat":
          return req.method === "POST" ? await handleChat(req, env, ctx) : methodNotAllowed(req, env);
        case "/api/contact":
          return req.method === "POST" ? await handleContact(req, env) : methodNotAllowed(req, env);
        case "/api/health":
          return req.method === "GET" || req.method === "HEAD"
            ? json(req, env, 200, { ok: true, version: CONTENT_VERSION })
            : methodNotAllowed(req, env);
        default:
          return json(req, env, 404, { ok: false, error: "not_found", message: "Not found" });
      }
    } catch (e) {
      console.error("api error", e instanceof Error ? e.name : "unknown");
      return json(req, env, 500, { ok: false, error: "internal", message: "Something went wrong on our side. Please try again." });
    }
  },
} satisfies ExportedHandler<Env>;
