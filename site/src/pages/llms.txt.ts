/** /llms.txt (https://llmstxt.org), generated from content/profile.ts at build time (src/lib/llms.ts). */
import type { APIRoute } from "astro";
import { llmsTxt } from "~/lib/llms";

export const GET: APIRoute = () => new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
