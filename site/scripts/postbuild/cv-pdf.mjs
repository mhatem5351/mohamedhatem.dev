#!/usr/bin/env node
/**
 * Renders the CV pages of a build to PDF, so the PDF is always generated from the same data and print CSS as /cv/.
 *
 *   default export async ({ dist, site })   used by scripts/postbuild.mjs after `astro build`
 *   node scripts/postbuild/cv-pdf.mjs [--dist <dir>] [--no-downloads]
 *
 * 1. Serves <dist> with scripts/serve.mjs on a free port and opens /cv/ and /ar/cv/ in headless Chromium (light
 *    theme, print media), waits for the fonts, prints A4 with the page's own @page rules (12 mm × 13 mm margins).
 * 2. Checks each PDF: at most 2 pages (fails the build otherwise) and real text (Chromium embeds fonts as text, so it
 *    stays selectable and searchable; a PDF with no text objects fails).
 * 3. Writes site/public/cv/Mohamed-Hatem-CV.pdf and Mohamed-Hatem-CV-ar.pdf (next build's /cv/ shows their size)
 *    and the same files into <dist>/cv/, then copies the English one to the owner's Downloads folder.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "../serve.mjs";

const SITE = fileURLToPath(new URL("../../", import.meta.url));
const MAX_PAGES = 2;
const FILES = [
  { path: "/cv/", file: "Mohamed-Hatem-CV.pdf", lang: "en" },
  { path: "/ar/cv/", file: "Mohamed-Hatem-CV-ar.pdf", lang: "ar" },
];
const OWNER_COPY = join(homedir(), "Downloads", "Mohamed_Hatem_CV_AI_Team_Lead.pdf");

/** Page objects in a PDF ("/Type /Page", not "/Type /Pages"). */
export function countPages(buf) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
}

/** True when the PDF contains text-showing operators inside its (possibly compressed) content: font resources present. */
function hasText(buf) {
  return /\/Font\b/.test(buf.toString("latin1"));
}

export default async function cvPdf({ dist, site = SITE, downloads = true } = {}) {
  if (!dist || !existsSync(join(dist, "cv", "index.html"))) throw new Error(`cv-pdf: no built CV page in ${dist}`);
  const server = await startServer({ dir: dist, port: 0, quiet: true });
  const port = server.address().port;
  const browser = await chromium.launch();
  const results = [];
  try {
    const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
    // Keep the chat bubble's first-visit state out of the render (it is hidden in print anyway).
    await context.addInitScript(() => {
      try {
        localStorage.setItem("mh-theme", "light");
      } catch {}
    });
    const page = await context.newPage();
    const publicDir = join(site, "public", "cv");
    const distDir = join(dist, "cv");
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
    for (const f of FILES) {
      const res = await page.goto(`http://127.0.0.1:${port}${f.path}`, { waitUntil: "networkidle" });
      if (!res || !res.ok()) throw new Error(`cv-pdf: ${f.path} answered ${res?.status()}`);
      await page.emulateMedia({ media: "print" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        // Every face the sheet uses must be loaded, not just requested (Arabic weights load lazily).
        await Promise.all([...document.fonts].filter((ff) => ff.status !== "error").map((ff) => ff.load().catch(() => {})));
      });
      const buf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, outline: false });
      const pages = countPages(buf);
      if (pages < 1 || pages > MAX_PAGES) throw new Error(`cv-pdf: ${f.path} prints to ${pages} pages (max ${MAX_PAGES})`);
      if (!hasText(buf)) throw new Error(`cv-pdf: ${f.path} has no text layer`);
      writeFileSync(join(publicDir, f.file), buf);
      copyFileSync(join(publicDir, f.file), join(distDir, f.file));
      results.push({ ...f, pages, kb: Math.round(buf.length / 1024) });
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  for (const r of results) console.log(`cv-pdf: ${r.path} → cv/${r.file} (${r.pages} pages, ${r.kb} KB)`);
  if (downloads && existsSync(join(homedir(), "Downloads"))) {
    copyFileSync(join(site, "public", "cv", FILES[0].file), OWNER_COPY);
    console.log(`cv-pdf: copied the English CV to ${OWNER_COPY} (${Math.round(statSync(OWNER_COPY).size / 1024)} KB)`);
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--dist");
  const dist = resolve(i >= 0 ? args[i + 1] : fileURLToPath(new URL("../../../dist", import.meta.url)));
  await cvPdf({ dist, downloads: !args.includes("--no-downloads") });
}
