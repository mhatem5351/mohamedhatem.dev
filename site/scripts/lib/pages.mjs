/** Page lists shared by the scripts (screenshots, PDF, budgets, Lighthouse). Reads slugs from content/profile.ts. */
import { readFileSync } from "node:fs";

/** Case-study slugs in profile.ts order (parsed from the type union, so plain Node can run the scripts). */
export async function caseSlugs() {
  const src = readFileSync(new URL("../../../content/profile.ts", import.meta.url), "utf8");
  const union = src.match(/export type CaseStudySlug =([\s\S]*?);/)?.[1] ?? "";
  return [...union.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/** Every built HTML page, EN and AR. */
export async function allPages() {
  const slugs = await caseSlugs();
  const en = ["/", ...slugs.map((s) => `/work/${s}/`), "/cv/", "/privacy/"];
  return [...en, ...en.map((p) => (p === "/" ? "/ar/" : `/ar${p}`))];
}
