// @ts-check
/**
 * mohamedhatem.dev: static Astro build. Output goes to ../dist, which the Worker in ../worker serves
 * (wrangler.jsonc → assets.directory "./dist"; /api/* runs the Worker, everything else is a static file).
 *
 * Content lives outside this folder (../content: profile.ts + i18n); the chat widget too (../chat-widget/src).
 * Vite is allowed to read the whole repo (server.fs.allow) and both have aliases (@content, @chat).
 */
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import cspHashes from "./integrations/csp-hashes.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://mohamedhatem.dev";

/**
 * Arabic code points only (Latin inside Arabic text falls through to Inter / Space Grotesk, DESIGN.md 4.1). The Plex
 * Arabic files are cut to exactly this set by scripts/subset-fonts.mjs (its ARABIC must match).
 * @type {[string, ...string[]]}
 */
const ARABIC = ["U+0600-065F", "U+066A-066D", "U+0670", "U+200C-200F"];
/**
 * The Latin faces' coverage after scripts/subset-fonts.mjs (Google's "latin" range + arrows, ≤ ≥, ✓): declared so a
 * browser never fetches a Latin file for Arabic text. Keep in sync with LATIN there.
 * @type {[string, ...string[]]}
 */
const LATIN = ["U+0000-00FF", "U+0131", "U+0152-0153", "U+02BB-02BC", "U+02C6", "U+02DA", "U+02DC", "U+0304", "U+0308", "U+0329", "U+2000-206F", "U+20AC", "U+2122", "U+2190-2199", "U+2212", "U+2215", "U+2264-2265", "U+2713", "U+FEFF", "U+FFFD"];

export default defineConfig({
  site: SITE,
  outDir: "../dist",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "never", assets: "_astro" },
  // Astro 7 defaults to 'jsx' whitespace handling, which joins inline elements; the markup relies on HTML whitespace.
  compressHTML: true,
  i18n: {
    locales: ["en", "ar"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
  },
  prefetch: false,
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", ar: "ar" } },
      filter: (page) => !/\/404\/?$/.test(page),
      serialize(item) {
        // x-default: the English page (same target as the <link rel="alternate" hreflang="x-default"> in <head>).
        const url = new URL(item.url);
        const en = url.pathname.startsWith("/ar/") ? new URL(url.pathname.slice(3), SITE).href : item.url;
        const links = item.links?.length ? [...item.links, { url: en, lang: "x-default" }] : item.links;
        return { ...item, ...(links ? { links } : {}) };
      },
    }),
    // Last: rewrites each page's CSP <meta> with the hashes of exactly the inline scripts and styles it contains.
    cspHashes(),
  ],
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Space Grotesk",
      cssVariable: "--font-face-display",
      fallbacks: ["sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/space-grotesk-latin-500-700.woff2"], weight: "500 700", style: "normal", unicodeRange: LATIN }] },
    },
    {
      provider: fontProviders.local(),
      name: "Inter",
      cssVariable: "--font-face-sans",
      fallbacks: ["sans-serif"],
      options: { variants: [{ src: ["./src/assets/fonts/inter-latin-400-700.woff2"], weight: "400 700", style: "normal", unicodeRange: LATIN }] },
    },
    {
      provider: fontProviders.local(),
      name: "JetBrains Mono",
      cssVariable: "--font-face-mono",
      fallbacks: ["monospace"],
      options: { variants: [{ src: ["./src/assets/fonts/jetbrains-mono-400-700.woff2"], weight: "400 700", style: "normal", unicodeRange: LATIN }] },
    },
    {
      provider: fontProviders.local(),
      name: "IBM Plex Sans Arabic",
      cssVariable: "--font-face-arabic",
      // No fallbacks: the stacks in global.css put this family first and Inter / Space Grotesk after it, so Latin
      // characters inside Arabic text use the Latin faces (a system Arabic fallback would also catch Latin).
      fallbacks: [],
      optimizedFallbacks: false,
      options: {
        variants: [
          { src: ["./src/assets/fonts/ibm-plex-sans-arabic-400-msa.woff2"], weight: 400, style: "normal", unicodeRange: ARABIC },
          { src: ["./src/assets/fonts/ibm-plex-sans-arabic-600-msa.woff2"], weight: 600, style: "normal", unicodeRange: ARABIC },
          { src: ["./src/assets/fonts/ibm-plex-sans-arabic-700-msa.woff2"], weight: 700, style: "normal", unicodeRange: ARABIC },
        ],
      },
    },
  ],
  // No Markdown pages: no Shiki inline styles.
  markdown: { syntaxHighlight: false },
  // Content-Security-Policy <meta> on every page. integrations/csp-hashes.mjs completes it after the build with the
  // sha256 of each page's inline <script> and <style> elements; there is no 'unsafe-inline' for either. The rest of
  // the policy (frame-ancestors, HSTS, …) is in public/_headers; browsers enforce both. Not applied by `astro dev`.
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com",
        "child-src https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  image: { responsiveStyles: false },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@content": fileURLToPath(new URL("../content", import.meta.url)),
        "@chat": fileURLToPath(new URL("../chat-widget/src", import.meta.url)),
        "~": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: { fs: { allow: [repo] } },
    build: { assetsInlineLimit: 0 },
  },
});
