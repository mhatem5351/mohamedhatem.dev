/** /llms-full.txt (https://llmstxt.org), generated from content/profile.ts at build time (src/lib/llms.ts). */
import type { APIRoute } from "astro";
import { llmsFullTxt } from "~/lib/llms";

export const GET: APIRoute = () => new Response(llmsFullTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
