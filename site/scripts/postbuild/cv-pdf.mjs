#!/usr/bin/env node
/**
 * Renders the CV pages of a build to PDF, so the PDF is always generated from the same data and print CSS as /cv/.
 *
 *   default export async ({ dist, site })   used by scripts/postbuild.mjs after `astro build`
 *   node scripts/postbuild/cv-pdf.mjs [--dist <dir>] [--no-downloads]
 *   CV_PDF_NO_DOWNLOADS=1 npm run build      (a branch or worktree build: leave the owner's Downloads copy alone)
 *
 * 1. Serves <dist> with scripts/serve.mjs on a free port and opens /cv/ and /ar/cv/ in headless Chromium (light
 *    theme, print media), waits for the fonts, prints A4 with the page's own @page rules (12 mm × 13 mm margins).
 *    The Latin text is set in static font instances (src/assets/fonts/print/, scripts/subset-fonts.mjs) swapped in
 *    for the page's variable fonts just before printing: Chromium embeds variable fonts as Type 3 fonts, which split
 *    words in copied text and defeat search in Preview and Quick Look; static ones embed as TrueType. The build fails
 *    if a Type 3 font is left.
 * 2. Rewrites the Arabic text layer (scripts/lib/pdf-rtl-text.mjs) so every reader extracts and searches it the same
 *    way: Chromium maps a joined letter pair (ص+ر, lam-alef…) or a letter with its mark to several characters, which
 *    Chrome's, Firefox's and MuPDF's readers put backwards (مصر → مرص) while Preview reads them right; afterwards each
 *    glyph stands for one character. The page looks exactly the same.
 * 3. Sets the document metadata Chromium leaves empty (pdf-lib): Author, Subject, Keywords and Creator, keeping the
 *    title, the language and the tag tree. Applicant-tracking systems and document managers show these fields.
 * 4. Checks each PDF: at most 2 pages (fails the build otherwise), real text (Chromium embeds fonts as text, so it
 *    stays selectable and searchable; a PDF with no text objects fails), still tagged, with its language and author,
 *    and the page breaks (scripts/lib/pdf-text.mjs reads each page's text): every sidebar heading shares a page with
 *    its first entry, a section the sheet keeps whole (Education, Awards, Languages, Open to) is on one page, heading
 *    included, and so is every main role (round 7, R7-04: a role's last bullet alone at the top of page 2 reads, to a
 *    parser, as part of whatever was printed before it). Right-to-left text: no run left that readers would read differently, every run's text
 *    found in the sheet's own text (a reversed word is not), and the words in SEARCH_WORDS found.
 * 5. Writes site/public/cv/Mohamed-Hatem-CV.pdf and Mohamed-Hatem-CV-ar.pdf (next build's /cv/ shows their size)
 *    and the same files into <dist>/cv/, then copies the English one to the owner's Downloads folder.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";
import { startServer } from "../serve.mjs";
import { loadContent } from "../lib/content.mjs";
import { contains, pdfPagesText, sectionBreakProblems } from "../lib/pdf-text.mjs";
import { normalizeRtlRuns, rtlTextProblems } from "../lib/pdf-rtl-text.mjs";

const SITE = fileURLToPath(new URL("../../", import.meta.url));
const MAX_PAGES = 2;
const FILES = [
  { path: "/cv/", file: "Mohamed-Hatem-CV.pdf", lang: "en" },
  { path: "/ar/cv/", file: "Mohamed-Hatem-CV-ar.pdf", lang: "ar" },
];
const OWNER_COPY = join(homedir(), "Downloads", "Mohamed_Hatem_CV_AI_Team_Lead.pdf");
/** Words a reader of the Arabic CV searches for; each must be found in the PDF's text (when the sheet has it). */
const SEARCH_WORDS = { ar: ["مصر", "القاهرة", "سبتمبر", "الهيئة", "السعودية", "للسياحة", "الذكاء", "الاصطناعي", "قائد", "فريق", "الخبرات"] };

/** Page objects in a PDF ("/Type /Page", not "/Type /Pages"). */
export function countPages(buf) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
}

/** @font-face rules for the static print instances (data: URLs) and the sheet's font stacks pointed at them. */
function printFontCss() {
  const dir = join(SITE, "src", "assets", "fonts", "print");
  const faces = [
    ["MH Print Text", "inter", [400, 500, 600, 700]],
    ["MH Print Display", "space-grotesk", [500, 600, 700]],
    ["MH Print Mono", "jetbrains-mono", [400, 500, 600, 700]],
  ];
  const rules = faces.flatMap(([family, file, weights]) =>
    weights.map((w) => {
      const data = readFileSync(join(dir, `${file}-${w}.woff2`)).toString("base64");
      return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:${w};font-style:normal}`;
    }),
  );
  // Latin runs (the whole English sheet, and lang="en" runs on the Arabic one) use the static faces; Arabic keeps
  // IBM Plex Sans Arabic (already static) first, with the static Latin faces after it for mixed text.
  return `${rules.join("")}
.sheet, .sheet [lang="en"] { --font-sans: "MH Print Text"; --font-display: "MH Print Display"; --font-mono: "MH Print Mono"; }
.sheet:lang(ar), .sheet [lang="ar"] { --font-sans: var(--font-face-arabic), "MH Print Text"; --font-display: var(--font-face-arabic), "MH Print Display"; }`;
}

/** Type 3 fonts left in a PDF (variable fonts that weren't swapped for static ones). */
const type3Count = (buf) => (buf.toString("latin1").match(/\/Subtype\s*\/Type3\b/g) ?? []).length;

/** True when the PDF contains text-showing operators inside its (possibly compressed) content: font resources present. */
function hasText(buf) {
  return /\/Font\b/.test(buf.toString("latin1"));
}

/**
 * Adds Author, Subject, Keywords and Creator (Chromium writes only Title, Creator "Chromium" and Producer "Skia/PDF").
 * `updateMetadata: false` keeps the original Producer and dates; the catalog (Lang, StructTreeRoot, MarkInfo) is kept.
 */
export async function withMetadata(buf, lang) {
  const { profile, messages } = await loadContent();
  const m = messages(lang);
  const b = profile.basics;
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  doc.setAuthor(b.name[lang]);
  // "AI Team Lead at Globant · Agentic LLM systems, RAG, LLM serving": never "multi-agent" beside Globant (round 6,
  // HM-01). The keywords are skills, not a claim about one role, so "multi-agent systems" (ArabsStock, Wakeb) stays.
  doc.setSubject(`${b.headline[lang]} · ${m.cv.focus}`);
  // pdf-lib joins keywords with spaces; one comma-separated string keeps multi-word keywords readable. Round 7 (HM-17):
  // the team-lead and evaluation words a screener searches for, each shown on the CV itself.
  doc.setKeywords([[b.name.en, b.name.ar, b.title.en, "CV", "team leadership", "LLM", "agentic AI", "generative AI", "multi-agent systems", "LangGraph", "RAG", "LLM evaluation", "vLLM", "MLOps", "LLMOps"].join(", ")]);
  doc.setCreator("mohamedhatem.dev");
  // No object streams: every object stays readable in the file (page objects, /Lang, the tag tree), as Chromium wrote it.
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export default async function cvPdf({ dist, site = SITE, downloads = !process.env.CV_PDF_NO_DOWNLOADS } = {}) {
  if (!dist || !existsSync(join(dist, "cv", "index.html"))) throw new Error(`cv-pdf: no built CV page in ${dist}`);
  const server = await startServer({ dir: dist, port: 0, quiet: true });
  const port = server.address().port;
  const browser = await chromium.launch();
  const results = [];
  try {
    // bypassCSP: the print fonts are added as an inline stylesheet, which the page's hash-only CSP would refuse.
    const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce", bypassCSP: true });
    const fontCss = printFontCss();
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
      await page.addStyleTag({ content: fontCss });
      await page.evaluate(async () => {
        await document.fonts.ready;
        // Every face the sheet uses must be loaded, not just requested (Arabic weights load lazily).
        await Promise.all([...document.fonts].filter((ff) => ff.status !== "error").map((ff) => ff.load().catch(() => {})));
      });
      // The sidebar's sections as text (as printed: innerText follows text-transform), for the page-break check.
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll(".cv-side .cv-sec")].map((sec) => ({
          heading: sec.querySelector("h2")?.innerText ?? "",
          first: sec.querySelector(".side-list > li, .skill-g")?.innerText ?? "",
          all: sec.innerText,
          keep: sec.classList.contains("cv-sec--keep"),
        })),
      );
      // Each main role as printed (head, client line, bullets), for the check that no role is split across pages.
      const roles = await page.evaluate(() => [...document.querySelectorAll(".cv-main .job:not(.job--brief)")].map((job) => job.innerText));
      // The sheet's own text, for the right-to-left check below.
      const source = await page.evaluate(() => document.querySelector(".sheet")?.innerText ?? "");
      const raw = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, outline: false });
      const rtl = await normalizeRtlRuns(raw);
      const buf = await withMetadata(rtl.buf, f.lang);
      const pages = (await PDFDocument.load(buf, { updateMetadata: false })).getPageCount();
      if (pages < 1 || pages > MAX_PAGES) throw new Error(`cv-pdf: ${f.path} prints to ${pages} pages (max ${MAX_PAGES})`);
      if (!hasText(buf)) throw new Error(`cv-pdf: ${f.path} has no text layer`);
      if (type3Count(buf)) throw new Error(`cv-pdf: ${f.path} embeds ${type3Count(buf)} Type 3 font(s): text would not be searchable`);
      const latin1 = buf.toString("latin1");
      if (!/\/StructTreeRoot/.test(latin1) || !/\/MarkInfo/.test(latin1)) throw new Error(`cv-pdf: ${f.path} lost its tag tree`);
      const meta = await PDFDocument.load(buf, { updateMetadata: false });
      if (!meta.getAuthor() || !meta.getSubject() || !meta.getTitle()) throw new Error(`cv-pdf: ${f.path} is missing its title, author or subject`);
      if (sections.length < 5) throw new Error(`cv-pdf: ${f.path}: found ${sections.length} sidebar sections, expected the CV's six`);
      const pagesText = await pdfPagesText(buf);
      const breaks = sectionBreakProblems(pagesText, sections);
      if (breaks.length) throw new Error(`cv-pdf: ${f.path}: ${breaks.join("; ")}`);
      const split = roles.filter((r) => !pagesText.some((p) => contains(p, r))).map((r) => r.split("\n")[0]);
      if (split.length) throw new Error(`cv-pdf: ${f.path}: split across pages (shorten the role or the ones before it): ${split.join("; ")}`);
      const text = await rtlTextProblems(buf, { source, words: SEARCH_WORDS[f.lang] ?? [] });
      if (text.length) throw new Error(`cv-pdf: ${f.path}: the right-to-left text would not read back: ${text.join("; ")}`);
      writeFileSync(join(publicDir, f.file), buf);
      copyFileSync(join(publicDir, f.file), join(distDir, f.file));
      results.push({ ...f, pages, kb: Math.round(buf.length / 1024), rtl: rtl.rewritten });
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  for (const r of results) console.log(`cv-pdf: ${r.path} → cv/${r.file} (${r.pages} pages, ${r.kb} KB${r.rtl ? `, ${r.rtl} right-to-left runs re-encoded` : ""})`);
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
