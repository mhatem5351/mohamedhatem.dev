/**
 * Loads ../content (TypeScript: profile.ts + i18n) from plain Node scripts, through tsx's loader API
 * (tsx is a devDependency of site/). Usage:
 *   const { profile, messages, format } = await loadContent();
 */
import { register } from "tsx/esm/api";

let cached;

export async function loadContent() {
  if (cached) return cached;
  const unregister = register();
  try {
    const p = await import(new URL("../../../content/profile.ts", import.meta.url).href);
    const i = await import(new URL("../../../content/i18n/index.ts", import.meta.url).href);
    cached = { profile: p.profile, messages: i.getMessages, format: i.format, pluralize: i.pluralize };
    return cached;
  } finally {
    await unregister();
  }
}

/** "2023-04" → 2023. */
export const yearOf = (iso) => Number(String(iso).slice(0, 4));

/** "2023–2024" (or one year), with an open end counted to the current year. */
export function yearsOf(period, now = new Date()) {
  const s = yearOf(period.start);
  const e = period.end === null ? now.getUTCFullYear() : yearOf(period.end);
  return s === e ? String(s) : `${s}–${e}`;
}
