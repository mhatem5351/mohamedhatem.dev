/// <reference types="node" />
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import HASHES from "../src/chat/confidential-hashes.json";
import { CONFIDENTIAL_REPLY, ConfidentialMatcher, ConfidentialScanner, CONFIDENTIAL_SHA256, foldArabic, normWords, sha256Hex } from "../src/chat/confidential";
import { OutputGuard } from "../src/chat/guard";

/*
 * The real names never appear in this file (the repository is public): every test injects hashes of dummy names.
 * The last block reads the real ones from the gitignored _inputs/forbidden-names.txt and is skipped without it.
 */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const norm = (s: string) => normWords(s).join(" ");
/** Hashes the way worker/scripts/confidential-hashes.mjs does: the phrase, Arabic prefixes, folded forms. */
function hashesOf(...phrases: string[]): string[] {
  const out = new Set<string>();
  for (const p of phrases) {
    const w = normWords(p);
    const forms = [w, ...(/[؀-ۿ]/.test(w[0]!) ? ["و", "ل", "ب"].map((pre) => [pre + w[0], ...w.slice(1)]) : [])];
    for (const f of forms) {
      out.add(sha(f.join(" ")));
      out.add(sha(f.map(foldArabic).join(" ")));
    }
  }
  return [...out];
}

const DUMMY = new ConfidentialMatcher(hashesOf("zebracorp", "ministry of zebras", "هيئة الزرافات"));

describe("sha256Hex (synchronous, pure JS)", () => {
  it("matches node:crypto on ASCII, Arabic, emoji and block-boundary lengths", () => {
    const inputs = ["", "a", "abc", "zebracorp", "ministry of zebras", "هيئة الزرافات", "😀 mixed نص", "x".repeat(55), "y".repeat(56), "z".repeat(64), "q".repeat(119), "w".repeat(1000)];
    for (const s of inputs) expect(sha256Hex(s)).toBe(sha(s));
  });
});

describe("ConfidentialMatcher", () => {
  it("finds a listed 1-3 word phrase in any casing, accents or punctuation", () => {
    expect(DUMMY.mentions("Built for ZebraCorp.")).toBe(true);
    expect(DUMMY.mentions("zebracorp's assistant")).toBe(true);
    expect(DUMMY.mentions("the Ministry   of\nZebras, in 2024")).toBe(true);
    expect(DUMMY.mentions("the ministry-of-zebras project")).toBe(true);
    expect(DUMMY.mentions("A Saudi government client; the ministry of horses")).toBe(false);
    expect(DUMMY.mentions("")).toBe(false);
  });

  it("finds Arabic forms: as written, with a one-letter prefix, and with folded letters", () => {
    expect(DUMMY.mentions("بنى المساعد لهيئة الزرافات")).toBe(true); // ل prefix
    expect(DUMMY.mentions("وهيئة الزرافات")).toBe(true); // و prefix
    expect(DUMMY.mentions("هيئه الزرافات")).toBe(true); // ة written as ه
    expect(DUMMY.mentions("هَيْئَة الزَّرافات")).toBe(true); // diacritics
    expect(DUMMY.mentions("جهة حكومية سعودية")).toBe(false);
  });

  it("an empty list never matches", () => {
    expect(new ConfidentialMatcher([]).mentions("zebracorp")).toBe(false);
  });

  it("the shipped list holds the repository check's hashes (one source of truth) and only hashes", () => {
    const checkContent = readFileSync(fileURLToPath(new URL("../../content/scripts/check-content.mjs", import.meta.url).href), "utf8");
    const repoHashes = [.../FORBIDDEN_SHA256\s*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(checkContent)![1]!.matchAll(/[0-9a-f]{64}/g)].map((m) => m[0]);
    expect(repoHashes.length).toBeGreaterThan(0);
    expect(new Set(HASHES.canonical)).toEqual(new Set(repoHashes));
    for (const h of CONFIDENTIAL_SHA256) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(new ConfidentialMatcher().size).toBe(new Set(CONFIDENTIAL_SHA256).size);
  });

  it("the fixed reply names nobody and neither confirms nor denies", () => {
    const shipped = new ConfidentialMatcher();
    for (const text of Object.values(CONFIDENTIAL_REPLY)) expect(shipped.mentions(text)).toBe(false);
    expect(CONFIDENTIAL_REPLY.en).toMatch(/Saudi government client/);
    expect(CONFIDENTIAL_REPLY.en).toMatch(/can't confirm or deny/);
    expect(CONFIDENTIAL_REPLY.ar).toMatch(/جهة حكومية سعودية/);
  });
});

describe("ConfidentialScanner (streaming)", () => {
  const text = "Hatem built the assistant for the Ministry of Zebras in Riyadh, with evaluation.";
  const nameAt = text.indexOf("Ministry");

  it("never releases any part of a name, at every chunk size", () => {
    for (let size = 1; size <= 12; size++) {
      const s = new ConfidentialScanner(DUMMY);
      let safe = 0;
      let tripped = false;
      for (let i = 0; i < text.length && !tripped; i += size) {
        const end = s.push(text.slice(i, i + size));
        if (end < 0) tripped = true;
        else safe = Math.max(safe, end);
      }
      expect(tripped).toBe(true);
      expect(safe).toBeLessThanOrEqual(nameAt); // nothing from "Ministry" on was ever safe to send
    }
  });

  it("holds back at most the last two complete words and an unfinished one", () => {
    const s = new ConfidentialScanner(DUMMY);
    // "at" and "the" (last two complete words) and "min" (unfinished) could still start a three-word name
    expect(s.push("He works at the min")).toBe("He works ".length);
    // punctuation doesn't end a phrase (the word split ignores it), so the last two complete words stay held
    expect(s.push("istry today. ")).toBe("He works at the ".length);
  });

  it("releases everything at the end when no name appears", () => {
    const s = new ConfidentialScanner(DUMMY);
    const clean = "He leads AI engineering at Globant on the STA project.";
    expect(s.push(clean)).toBeLessThan(clean.length);
    expect(s.push("", true)).toBe(clean.length);
  });

  it("catches a single-word name that ends the answer", () => {
    const s = new ConfidentialScanner(DUMMY);
    expect(s.push("It was Zebra")).toBeGreaterThanOrEqual(0);
    expect(s.push("corp", true)).toBe(-1);
  });
});

describe("OutputGuard with confidential names", () => {
  it("blocks with reason 'confidential' before the name is emitted", () => {
    const g = new OutputGuard([], new Map(), DUMMY);
    let shown = "";
    let verdict: ReturnType<OutputGuard["push"]> = { ok: true, emit: "" };
    for (const chunk of ["The bilingual assistant was built for ", "Zebra", "Corp by Hatem."]) {
      verdict = g.push(chunk);
      if (!verdict.ok) break;
      shown += verdict.emit;
    }
    expect(verdict).toEqual({ ok: false, reason: "confidential" });
    expect(shown.toLowerCase()).not.toContain("zebra");
    expect(g.started).toBe(true);
  });

  it("passes clean answers through unchanged", () => {
    const g = new OutputGuard([], new Map(), DUMMY);
    const parts = ["Two production ", "multi-agent systems: ", "ArabsStock and Wakeb Data."];
    let out = "";
    for (const p of parts) {
      const v = g.push(p);
      if (v.ok) out += v.emit;
    }
    const tail = g.flush();
    expect(tail.ok && out + tail.emit).toBe(parts.join(""));
  });

  it("is cheap enough for the 10 ms CPU budget (3,000-character answer, shipped list)", () => {
    const g = new OutputGuard([], new Map(), new ConfidentialMatcher());
    const answer = "Hatem architected a production multi-agent system with LangGraph and served Qwen with vLLM on A100 GPUs. ".repeat(30);
    const t0 = performance.now();
    for (let i = 0; i < answer.length; i += 90) g.push(answer.slice(i, i + 90));
    g.flush();
    expect(performance.now() - t0).toBeLessThan(40); // Node in CI is slower than workerd; measured ~3-6 ms locally
  });
});

/* ------------------------------------------------------------------ local only: the real names */

const namesFile = fileURLToPath(new URL("../../_inputs/forbidden-names.txt", import.meta.url).href);
describe.skipIf(!existsSync(namesFile))("real names (local only, _inputs/forbidden-names.txt)", () => {
  const entries = existsSync(namesFile)
    ? readFileSync(namesFile, "utf8")
        .split(/\r?\n/)
        .map((l) => /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*$/.exec(l))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => ({ key: m[1]!, phrase: m[2]! }))
    : [];
  const shipped = new ConfidentialMatcher();

  it("every listed name and phrasing is caught by the shipped guard, alone and inside a sentence", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const { key, phrase } of entries) {
      expect(shipped.mentions(phrase), key).toBe(true);
      expect(shipped.mentions(`It was built for the ${phrase} last year.`), key).toBe(true);
    }
  });

  it("streams of the real names are blocked before any of their letters is sent", () => {
    for (const { key, phrase } of entries) {
      const g = new OutputGuard([], new Map(), shipped);
      const text = `The assistant was built for ${phrase} by Hatem.`;
      let shown = "";
      let blocked = false;
      for (let i = 0; i < text.length; i += 7) {
        const v = g.push(text.slice(i, i + 7));
        if (!v.ok) {
          blocked = true;
          break;
        }
        shown += v.emit;
      }
      blocked ||= !g.flush().ok;
      expect(blocked, key).toBe(true);
      expect(shipped.mentions(shown), key).toBe(false);
      expect(norm(shown).includes(norm(phrase)), key).toBe(false);
    }
  });

  it("confidential-hashes.json is generated from this file (run worker/scripts/confidential-hashes.mjs after editing it)", () => {
    for (const { phrase } of entries.filter((e) => normWords(e.phrase).length <= 3)) {
      const h = sha(norm(phrase));
      expect(HASHES.canonical.includes(h) || HASHES.variants.includes(h)).toBe(true);
    }
  });
});
