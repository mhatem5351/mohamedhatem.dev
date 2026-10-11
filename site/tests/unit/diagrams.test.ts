import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASE_DIAGRAMS, DIAGRAMS, diagramSvg } from "~/lib/diagrams";
import { profile } from "@content/profile.ts";

type El = { tag: string; cls: string[] };

/**
 * Font size (px, in drawing units) of every <text> in an SVG, resolved from a stylesheet's class / type descendant
 * selectors (the only kind diagram.css uses) by specificity then order; with `inline`, style attributes win.
 */
function textSizes(svg: string, css: string, inline: boolean): { size: number; text: string }[] {
  const rules: { sel: string[][]; size: number; spec: number }[] = [];
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let i = 0, depth = 0, start = 0; i < flat.length; i++) {
    if (flat[i] === "{") depth++;
    else if (flat[i] === "}" && --depth === 0) {
      const rule = flat.slice(start, i + 1).trim();
      start = i + 1;
      if (rule.startsWith("@")) continue; // @media / @keyframes set no font sizes
      const body = rule.slice(rule.indexOf("{") + 1, -1);
      const m = /font-size:\s*([\d.]+)px/.exec(body) ?? /(?:^|;)\s*font:[^;]*?([\d.]+)px/.exec(body);
      if (!m) continue;
      for (const s of rule.slice(0, rule.indexOf("{")).split(",")) {
        const sel = s.trim().split(/\s+/).map((part) => part.split(/(?=\.)/));
        rules.push({ sel, size: Number(m[1]), spec: sel.flat().reduce((a, p) => a + (p.startsWith(".") ? 10 : 1), 0) });
      }
    }
  }
  const is = (part: string[], el: El) => part.every((p) => (p.startsWith(".") ? el.cls.includes(p.slice(1)) : el.tag === p));
  const within = (sel: string[][], anc: El[]) => {
    let j = anc.length - 1;
    for (let i = sel.length - 2; i >= 0; i--, j--) {
      while (j >= 0 && !is(sel[i]!, anc[j]!)) j--;
      if (j < 0) return false;
    }
    return true;
  };
  const out: { size: number; text: string }[] = [];
  const stack: El[] = [];
  for (const [, close, tag, attrs, self, after] of svg.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>([^<]*)/g)) {
    if (close) {
      stack.pop();
      continue;
    }
    const el: El = { tag: tag!, cls: /\sclass="([^"]*)"/.exec(attrs!)?.[1]!.split(/\s+/) ?? [] };
    if (tag === "text") {
      let best: { size: number; spec: number } | undefined;
      for (const r of rules) if (is(r.sel.at(-1)!, el) && within(r.sel, stack) && (!best || r.spec >= best.spec)) best = r;
      const own = inline ? /font-size:\s*([\d.]+)px/.exec(/\sstyle="([^"]*)"/.exec(attrs!)?.[1] ?? "") : null;
      out.push({ size: own ? Number(own[1]) : (best?.size ?? 16), text: after!.trim() });
    }
    if (!self) stack.push(el);
  }
  return out;
}

/** Every drawing the site can inline: each diagram's variants, in English and (where drawn) in Arabic. */
const VARIANTS = ["wide", "compact", "thumb"] as const;
const DRAWINGS = DIAGRAMS.flatMap((d) =>
  (["en", "ar"] as const).flatMap((locale) =>
    VARIANTS.filter((v) => (locale === "en" ? d.files : d.ar?.files)?.[v]).map((v) => ({ d, v, locale })),
  ),
);

describe("diagrams", () => {
  it("maps case studies only to diagrams that exist", () => {
    const ids = new Set(DIAGRAMS.map((d) => d.id));
    for (const [slug, list] of Object.entries(CASE_DIAGRAMS)) {
      expect(profile.caseStudies.some((c) => c.slug === slug)).toBe(true);
      for (const id of list!) expect(ids.has(id)).toBe(true);
    }
  });

  it("inlines SVGs without <style> blocks or style attributes (hash-only CSP)", () => {
    for (const { d, v, locale } of DRAWINGS) {
      const svg = diagramSvg(d.id, v, { locale });
      expect(svg).not.toMatch(/<style/);
      expect(svg).not.toMatch(/\sstyle="/);
      expect(svg).toMatch(/role="img"/);
    }
  });

  it("keeps the motion values as data-vars: every pulse has a length and hop, every lit node an arrival", () => {
    for (const { d, v, locale } of DRAWINGS) {
      const svg = diagramSvg(d.id, v, { locale });
      const pulses = [...svg.matchAll(/<path [^>]*class="dg-p[ "][^>]*>/g)].map((x) => x[0]);
      expect(pulses.length, `${d.id}/${v}/${locale} pulses`).toBeGreaterThan(0);
      for (const p of pulses) expect(p, `${d.id}/${v}/${locale}`).toMatch(/data-vars="--L:\d+px;--i:\d+"/);
      // each highlight overlay sits in a node that says when the request reaches it
      const nodes = [...svg.matchAll(/<g class="dg-n[^"]*"([^>]*)>(?:(?!<\/?g[ >])[\s\S])*?class="dg-hl"/g)];
      expect(nodes.length, `${d.id}/${v}/${locale} lit nodes`).toBeGreaterThan(1);
      for (const [, attrs] of nodes) expect(attrs).toMatch(/data-vars="--at:\d+(;--k:\d+)?"/);
      expect(svg.match(/class="dg-hl"/g)!.length).toBe(nodes.length);
    }
  });

  it("makes thumbnails decorative and keeps internal references unique", () => {
    const svg = diagramSvg("arabsstock-assistant", "thumb", { decorative: true, idSuffix: "card" });
    expect(svg).toMatch(/aria-hidden="true"/);
    expect(svg).not.toMatch(/<title|<desc|role="img"/);
    for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(svg).toContain(`id="${ref}"`);
  });

  it("keeps every compact label at 11 px on the smallest phones (320 px: the drawing renders about 270 px wide)", () => {
    // 13 units at scale 270 / 320 is 10.97 px: 11.0 px rounded (audit C-45); a 375 px phone shows it 294 px wide.
    const PHONE = 270;
    const siteCss = readFileSync(new URL("../../src/styles/diagram.css", import.meta.url), "utf8");
    for (const { d, locale } of DRAWINGS.filter((x) => x.v === "compact")) {
      // as the site inlines it (no <style>, no style attributes: the global diagram.css applies) and as a standalone file
      const inlined = diagramSvg(d.id, "compact", { locale });
      const file = readFileSync(new URL(`../../src/assets/diagrams/${d.id}-compact${locale === "ar" ? "-ar" : ""}.svg`, import.meta.url), "utf8");
      for (const [how, svg, css, inline] of [
        ["inlined", inlined, siteCss, false],
        ["standalone", file, /<style>([\s\S]*?)<\/style>/.exec(file)?.[1] ?? "", true],
      ] as const) {
        const width = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
        const texts = textSizes(svg, css, inline);
        expect(texts.length, `${d.id} ${locale} ${how}`).toBeGreaterThan(10);
        for (const t of texts) expect((t.size * PHONE) / width, `${d.id} ${locale} ${how}: "${t.text}" at ${t.size}/${width}`).toBeGreaterThanOrEqual(10.95);
      }
    }
  });

  it("draws the STA figure in Arabic on Arabic pages: right to left, Arabic labels, its own ids (audit HM-41)", () => {
    const d = DIAGRAMS.find((x) => x.id === "sta-tourism-assistants")!;
    expect(d.ar).toBeTruthy();
    for (const v of VARIANTS) {
      const ar = diagramSvg(d.id, v, { locale: "ar" });
      const en = diagramSvg(d.id, v, { locale: "en" });
      expect(ar).toMatch(/^<svg[^>]*class="dg dg-[a-z]+ dg-ar"/);
      expect(ar).toMatch(/^<svg[^>]*lang="ar"/);
      expect(ar).not.toMatch(/Audience gate|Visitors|96 tools/i);
      expect(en).not.toMatch(/dg-ar|lang="ar"/);
      for (const [, id] of ar.matchAll(/\sid="([^"]+)"/g)) expect(id).toMatch(/-ar(-|$)/);
    }
    const wide = diagramSvg(d.id, "wide", { locale: "ar" });
    for (const label of ["طبقة الصلاحيات", "وكيل واحد", "الموافقة البشرية", "قبل أي حجز أو طلب", "بحث في وثائق الهيئة", "96 أداة · 27 منها للزوار", "«نورة» · عربي · إنجليزي"]) expect(wide).toContain(label);
    // the drawing names what the profile names: approval before any booking or order, a search with citations, no
    // separate "LLM" box (R7-03, R7-22)
    const en = diagramSvg(d.id, "wide", { locale: "en" });
    expect(en).toContain("before any booking");
    expect(en).toMatch(/Search over the authority(&apos;|')s documents/);
    expect(en).not.toMatch(/>LLM</);
    // the site's diagram grammar sets these drawings right to left, in Plex Arabic
    const siteCss = readFileSync(new URL("../../src/styles/diagram.css", import.meta.url), "utf8");
    expect(siteCss).toMatch(/\.dg\.dg-ar\{direction:rtl\}/);
    expect(siteCss).toMatch(/\.dg-ar \.dg-t,\.dg-ar \.dg-tab\{font-family:"IBM Plex Sans Arabic"/);
  });

  it("draws every case-study system wide, compact and as a thumbnail; the orchestration pattern as a thumbnail", () => {
    for (const d of DIAGRAMS) expect(Object.keys(d.files).sort(), d.id).toEqual(d.id === "agent-orchestration" ? ["thumb"] : ["compact", "thumb", "wide"]);
  });

  it("numbers the callouts in reading order and lists one note per number", () => {
    for (const d of DIAGRAMS) expect(d.callouts.map((c) => c.n)).toEqual(d.callouts.map((_, i) => i + 1));
    const as = DIAGRAMS.find((x) => x.id === "arabsstock-assistant")!;
    expect(as.callouts.map((c) => c.term?.en)).toEqual(["Orchestrator", "Evaluation", "Specialised agents", "Semantic search", "AI services", "Media pipelines"]);
    // the compact drawing reads top to bottom: platform, assistant, indexing, serving, media pipelines last (C-43)
    const compact = diagramSvg("arabsstock-assistant", "compact");
    const y = (label: string) => Number(new RegExp(`<text [^>]*\\by="([\\d.]+)"[^>]*class="dg-tab"[^>]*>${label}<`).exec(compact)?.[1]);
    expect(y("ASSISTANT")).toBeGreaterThan(0);
    expect(y("ASSISTANT")).toBeLessThan(y("INDEXING"));
    expect(y("MODEL SERVING")).toBeLessThan(y("MEDIA PIPELINES"));
  });

  it("translates the accessible title and description on Arabic pages", () => {
    const d = DIAGRAMS.find((x) => x.id === "wakeb-multi-agent-chatbot")!;
    const svg = diagramSvg(d.id, "wide", { locale: "ar" });
    expect(svg).toContain(`lang="ar"`);
    expect(svg).toContain(d.title.ar.replace(/&/g, "&amp;"));
  });
});
