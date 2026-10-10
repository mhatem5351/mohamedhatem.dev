/**
 * Build-time configuration read on the server only (never shipped as a module to the browser).
 *
 * CF_WEB_ANALYTICS_TOKEN is the Cloudflare Web Analytics beacon token. It is public by design (it ends up in every
 * page), but it lives in the repo's .env (gitignored) so it isn't committed. Only that one key is read: the file
 * also holds real secrets, which this parser never touches.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The repo's .env. Resolved from the working directory (the build runs in site/), not from import.meta.url: this
 * module is bundled into a chunk somewhere else at build time.
 */
const ENV_FILE = [join(process.cwd(), "..", ".env"), join(process.cwd(), ".env")].find((f) => existsSync(f));

function fromDotEnv(key: string): string | undefined {
  if (!ENV_FILE) return undefined;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2]!.replace(/^["']|["']$/g, "").trim() || undefined;
  }
  return undefined;
}

/** Web Analytics beacon token, or undefined (then no beacon is rendered, e.g. in tests). */
export function analyticsToken(): string | undefined {
  if (process.env.MH_DISABLE_ANALYTICS === "1") return undefined;
  const token = process.env.CF_WEB_ANALYTICS_TOKEN || fromDotEnv("CF_WEB_ANALYTICS_TOKEN");
  // Tokens are 32 hex characters; anything else is a misconfiguration, not something to embed.
  return token && /^[a-f0-9]{32}$/i.test(token) ? token : undefined;
}
