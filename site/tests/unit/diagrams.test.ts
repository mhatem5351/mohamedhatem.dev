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

describe("diagrams", () => {
  it("maps case studies only to diagrams that exist", () => {
    const ids = new Set(DIAGRAMS.map((d) => d.id));
    for (const [slug, list] of Object.entries(CASE_DIAGRAMS)) {
      expect(profile.caseStudies.some((c) => c.slug === slug)).toBe(true);
      for (const id of list!) expect(ids.has(id)).toBe(true);
    }
  });

  it("inlines SVGs without <style> blocks or style attributes (hash-only CSP)", () => {
    for (const d of DIAGRAMS)
      for (const v of ["wide", "compact", "thumb"] as const) {
        const svg = diagramSvg(d.id, v);
        expect(svg).not.toMatch(/<style/);
        expect(svg).not.toMatch(/\sstyle="/);
        expect(svg).toMatch(/role="img"/);
      }
  });

  it("keeps the motion values as data-vars: every pulse has a length and hop, every lit node an arrival", () => {
    for (const d of DIAGRAMS)
      for (const v of ["wide", "compact", "thumb"] as const) {
        const svg = diagramSvg(d.id, v);
        const pulses = [...svg.matchAll(/<path [^>]*class="dg-p[ "][^>]*>/g)].map((x) => x[0]);
        expect(pulses.length, `${d.id}/${v} pulses`).toBeGreaterThan(0);
        for (const p of pulses) expect(p, `${d.id}/${v}`).toMatch(/data-vars="--L:\d+px;--i:\d+"/);
        // each highlight overlay sits in a node that says when the request reaches it
        const nodes = [...svg.matchAll(/<g class="dg-n[^"]*"([^>]*)>(?:(?!<\/?g[ >])[\s\S])*?class="dg-hl"/g)];
        expect(nodes.length, `${d.id}/${v} lit nodes`).toBeGreaterThan(1);
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

  it("keeps every compact label at 11 px or more on a 375 px phone (the drawing renders about 294 px wide)", () => {
    const PHONE = 294;
    const siteCss = readFileSync(new URL("../../src/styles/diagram.css", import.meta.url), "utf8");
    for (const d of DIAGRAMS) {
      // as the site inlines it (no <style>, no style attributes: the global diagram.css applies) and as a standalone file
      const inlined = diagramSvg(d.id, "compact");
      const file = readFileSync(new URL(`../../src/assets/diagrams/${d.id}-compact.svg`, import.meta.url), "utf8");
      for (const [how, svg, css, inline] of [
        ["inlined", inlined, siteCss, false],
        ["standalone", file, /<style>([\s\S]*?)<\/style>/.exec(file)?.[1] ?? "", true],
      ] as const) {
        const width = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
        const texts = textSizes(svg, css, inline);
        expect(texts.length, `${d.id} ${how}`).toBeGreaterThan(10);
        for (const t of texts) expect((t.size * PHONE) / width, `${d.id} ${how}: "${t.text}" at ${t.size}/${width}`).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it("translates the accessible title and description on Arabic pages", () => {
    const d = DIAGRAMS.find((x) => x.id === "wakeb-multi-agent-chatbot")!;
    const svg = diagramSvg(d.id, "wide", { locale: "ar" });
    expect(svg).toContain(`lang="ar"`);
    expect(svg).toContain(d.title.ar.replace(/&/g, "&amp;"));
  });
});
