// The web app manifests: site.webmanifest (English, linked from every English page) and ar.webmanifest (Arabic,
// linked from /ar/), written to design/assets/brand/ and site/public/.
//
//   node design/scripts/brand/manifest.mjs        (brand.mjs runs it too)
//
// Nothing is typed here: the names, labels and description come from content/ (profile.ts and the i18n `pwa` group),
// the theme and background colours from the dark `bg` token in design/tokens.json (dark is every visitor's default
// theme, DESIGN.md 3.4). site/tests/unit/palette.test.ts rebuilds both with webManifest() and fails when a shipped
// file differs, so a content or palette change can't leave them behind.
//
// Both manifests share id "/", so the site installs as one app; each starts in its own language. The "Ask my AI
// assistant" shortcut opens the home page with ?ask=1, which site/src/scripts/site.ts answers by opening the chat once
// and dropping the parameter.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

/** File name per locale (served from the site root). */
export const MANIFESTS = { en: "site.webmanifest", ar: "ar.webmanifest" };

/** Query parameter of the "Ask my AI assistant" shortcut (`/?ask=1`, `/ar/?ask=1`). */
export const ASK_PARAM = "ask";

const ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
];
// Chrome wants a shortcut icon of at least 96 px; the app tile reads as "this site" in the long-press menu.
const SHORTCUT_ICONS = [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }];

/**
 * One locale's manifest (pure: the same inputs give the same object).
 * @param {"en" | "ar"} locale
 * @param {{
 *   profile: { basics: { name: { en: string, ar: string }, headline: { en: string, ar: string } },
 *              site: { defaultLocale: string, pages: { cv: { en: string, ar: string } } } },
 *   messages: { locale: { code: string, dir: string }, pwa: { shortName: string, description: string,
 *               shortcuts: { ask: { name: string, shortName: string }, cv: { name: string }, contact: { name: string } } } },
 *   format: (template: string, values: Record<string, string>) => string,
 *   tokens: { color: Record<string, string[]> },
 * }} input `messages` is that locale's; `tokens` is design/tokens.json ([light, dark] per colour)
 */
export function webManifest(locale, { profile, messages: m, format, tokens }) {
  const bg = tokens.color.bg?.[1];
  if (!bg) throw new Error("manifest: design/tokens.json has no dark bg");
  const name = profile.basics.name[locale];
  const home = locale === profile.site.defaultLocale ? "/" : `/${locale}/`;
  const s = m.pwa.shortcuts;
  return {
    name,
    short_name: m.pwa.shortName,
    description: format(m.pwa.description, { name, headline: profile.basics.headline[locale] }),
    id: "/",
    start_url: home,
    scope: "/",
    lang: m.locale.code,
    dir: m.locale.dir,
    display: "standalone",
    background_color: bg,
    theme_color: bg,
    icons: ICONS,
    shortcuts: [
      { name: s.ask.name, short_name: s.ask.shortName, url: `${home}?${ASK_PARAM}=1`, icons: SHORTCUT_ICONS },
      { name: s.cv.name, url: profile.site.pages.cv[locale], icons: SHORTCUT_ICONS },
      { name: s.contact.name, url: `${home}#contact`, icons: SHORTCUT_ICONS },
    ],
  };
}

/** The file text: 2-space JSON and a final newline. */
export const manifestText = (manifest) => JSON.stringify(manifest, null, 2) + "\n";

/**
 * Builds both manifests from content/ and the tokens and writes them to design/assets/brand/ and site/public/.
 * @returns {Promise<string[]>} the files written
 */
export async function writeManifests() {
  // content/ is TypeScript: load it through tsx (a devDependency of site/), as the site's scripts do.
  const { loadContent } = await import(pathToFileURL(path.join(REPO, "site/scripts/lib/content.mjs")).href);
  const { profile, messages, format } = await loadContent();
  const tokens = JSON.parse(fs.readFileSync(path.join(REPO, "design/tokens.json"), "utf8"));
  const written = [];
  for (const [locale, file] of Object.entries(MANIFESTS)) {
    const text = manifestText(webManifest(locale, { profile, messages: messages(locale), format, tokens }));
    for (const dir of ["design/assets/brand", "site/public"]) {
      const out = path.join(REPO, dir, file);
      fs.writeFileSync(out, text);
      written.push(path.relative(REPO, out));
    }
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const f of await writeManifests()) console.log(`manifest: ${f}`);
}
