/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Hasher, keyIdOf, Matcher, parseKey, phraseForms, SCHEME, Scanner } from "../src/chat/confidential-core.mjs";
import HASHES from "../src/chat/confidential-hashes.json";
import { CONFIDENTIAL_CHIPS, CONFIDENTIAL_REPLY, ConfidentialMatcher, ConfidentialScanner, confidentialFor, normWords, sha256Hex } from "../src/chat/confidential";
import { OutputGuard } from "../src/chat/guard";
import { PLACEHOLDERS, TEST_KEY, testLists, testMatcher } from "./confidential-fixtures";

/*
 * The real names never appear in this file (the repository is public): every test hashes synthetic placeholder
 * names with a fixed test key. The last block reads the real names from the gitignored _inputs/forbidden-names.txt
 * and the real key from the environment or .env, and is skipped without them (CI has neither).
 */
const root = fileURLToPath(new URL("../../", import.meta.url).href);
const DUMMY = testMatcher();
const norm = (s: string) => normWords(s).join(" ");

/** The real key, if this machine has it (never printed). */
function realKey(): string | undefined {
  if (process.env.CONFIDENTIAL_HMAC_KEY) return process.env.CONFIDENTIAL_HMAC_KEY;
  const env = `${root}.env`;
  if (!existsSync(env)) return undefined;
  return /^\s*CONFIDENTIAL_HMAC_KEY\s*=\s*"?([0-9a-fA-F]{64})"?\s*$/m.exec(readFileSync(env, "utf8"))?.[1];
}

describe("HMAC-SHA-256 (synchronous, pure JS)", () => {
  const inputs = ["", "a", "abc", "zebracorp", "ministry of zebras", "هيئة الزرافات", "😀 mixed نص", "x".repeat(55), "y".repeat(56), "z".repeat(64), "q".repeat(119), "w".repeat(1000)];

  it("matches node:crypto's HMAC on ASCII, Arabic, emoji and block-boundary lengths", () => {
    const key = randomBytes(32);
    const h = new Hasher(new Uint8Array(key));
    for (const s of inputs) expect(h.hex(s)).toBe(createHmac("sha256", key).update(s).digest("hex"));
  });

  it("handles keys longer than a block (hashed first, per RFC 2104)", () => {
    const key = randomBytes(100);
    expect(new Hasher(new Uint8Array(key)).hex("zebracorp")).toBe(createHmac("sha256", key).update("zebracorp").digest("hex"));
  });

  it("unkeyed, it is plain SHA-256", () => {
    for (const s of inputs) expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });

  it("the key is 64 hex characters; anything else is rejected", () => {
    expect(parseKey(TEST_KEY)).toHaveLength(32);
    expect(parseKey(` "${TEST_KEY.toUpperCase()}" `)).toHaveLength(32);
    for (const bad of [undefined, "", "abc", TEST_KEY.slice(1), `${TEST_KEY}00`, "g".repeat(64)]) expect(parseKey(bad)).toBeNull();
  });

  it("the key id is stable for a key, differs between keys and doesn't contain the key", () => {
    const id = keyIdOf(new Hasher(parseKey(TEST_KEY)));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(keyIdOf(new Hasher(parseKey(TEST_KEY)))).toBe(id);
    expect(keyIdOf(new Hasher(parseKey("ab".repeat(32))))).not.toBe(id);
    expect(TEST_KEY).not.toContain(id);
  });
});

describe("ConfidentialMatcher (test key, placeholder names)", () => {
  it("finds a listed 1-3 word phrase in any casing, accents or punctuation", () => {
    expect(DUMMY.mentions("Built for ZebraCorp.")).toBe(true);
    expect(DUMMY.mentions("zebracorp's assistant")).toBe(true);
    expect(DUMMY.mentions("the Ministry   of\nZebras, in 2024")).toBe(true);
    expect(DUMMY.mentions("the ministry-of-zebras project")).toBe(true);
    expect(DUMMY.mentions("Zébracorp")).toBe(true);
    expect(DUMMY.mentions("A Saudi government client; the ministry of horses")).toBe(false);
    expect(DUMMY.mentions("")).toBe(false);
  });

  it("finds Arabic forms: with a prefix, folded letters, diacritics, tatweel", () => {
    expect(DUMMY.mentions("بنى المساعد لهيئة الزرافات")).toBe(true); // ل prefix
    expect(DUMMY.mentions("وهيئة الزرافات")).toBe(true); // و prefix
    expect(DUMMY.mentions("هيئه الزرافات")).toBe(true); // ة written as ه
    expect(DUMMY.mentions("هَيْئَة الزَّرافات")).toBe(true); // diacritics
    expect(DUMMY.mentions("هـيـئـة الزرافـات")).toBe(true); // tatweel
    expect(DUMMY.mentions("جهة حكومية سعودية")).toBe(false);
  });

  it("an empty matcher never matches; a fail-closed one always does", () => {
    expect(new ConfidentialMatcher([]).mentions("zebracorp")).toBe(false);
    const closed = new Matcher({ blockAll: true });
    expect(closed.mentions("anything at all")).toBe(true);
    expect(new Scanner(closed).push("Hello")).toBe(-1);
  });

  it("without a key, the default matcher matches nothing outside the Workers runtime but still holds back words", () => {
    const m = new ConfidentialMatcher();
    expect(m.blocksAll).toBe(false);
    expect(m.mentions("zebracorp")).toBe(false);
    expect(new ConfidentialScanner(m).push("He works at the min")).toBe("He works ".length);
  });

  it("a list hashed with another key matches nothing (the key is what protects the names)", () => {
    const lists = testLists(PLACEHOLDERS);
    const other = new ConfidentialMatcher(undefined, new Matcher({ ...lists, hasher: new Hasher(parseKey("ab".repeat(32))) }));
    expect(other.size).toBe(testMatcher().size);
    expect(other.mentions("zebracorp")).toBe(false);
  });

  it("finds where a name is (for redacting saved results)", () => {
    const text = "It was built for Ministry of Zebras, in Riyadh.";
    const span = DUMMY.find(text)!;
    expect(text.slice(span.start, span.end)).toBe("Ministry of Zebras");
    expect(DUMMY.find("nothing here")).toBeNull();
  });

  it("older unkeyed digests still work for tests that pass them", () => {
    const legacy = new ConfidentialMatcher([createHash("sha256").update("zebracorp").digest("hex")]);
    expect(legacy.mentions("ZebraCorp built it")).toBe(true);
  });
});

describe("the shipped list (worker/src/chat/confidential-hashes.json)", () => {
  it("is keyed HMAC-SHA-256 of the current scheme, holds only digests, and keeps at least 7 canonical forms", () => {
    expect(HASHES.scheme).toBe(SCHEME);
    expect(HASHES.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(HASHES.canonical.length).toBeGreaterThanOrEqual(7);
    for (const list of [HASHES.canonical, HASHES.variants, HASHES.starts, HASHES.prefixes]) {
      expect(list.length).toBeGreaterThan(0);
      for (const h of list) expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect([...list].sort()).toEqual(list);
    }
    expect(HASHES.variants.filter((h) => HASHES.canonical.includes(h))).toEqual([]);
  });

  it("is the one list for the whole repository (check-content reads it through the shared Node helper)", () => {
    const checkContent = readFileSync(`${root}content/scripts/check-content.mjs`, "utf8");
    expect(checkContent).toContain("worker/src/chat/confidential-node.mjs");
    expect(checkContent).not.toMatch(/createHash\(\s*"sha256"\s*\)\.update\(gram\)/);
    expect(checkContent).not.toMatch(/"[0-9a-f]{64}"/);
  });

  it("is useless without its key: a missing, malformed or wrong key gives no matcher (the chat fails closed)", () => {
    expect(confidentialFor(undefined)).toBeNull();
    expect(confidentialFor("")).toBeNull();
    expect(confidentialFor("not a key")).toBeNull();
    expect(confidentialFor(TEST_KEY)).toBeNull(); // a well-formed key, but not the list's
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

  it("is cheap enough for the 10 ms CPU budget (3,000-character answer, a list as large as the shipped one)", () => {
    // 14 placeholder phrases, like the real names file (the shipped list itself needs the real key).
    const big = testMatcher(
      ...PLACEHOLDERS,
      "national zebra center", "zbcd", "zebra digital authority", "وزارة الزرافات", "الهيئة الوطنية للزرافات", "زبكد",
      "zebra data office", "general zebra agency", "مركز الزرافات", "zebra analytics program", "مكتب الزرافات الرقمي",
    );
    expect(big.size).toBeGreaterThan(120);
    const g = new OutputGuard([], new Map(), big);
    const answer = "Hatem architected a production multi-agent system with LangGraph and served Qwen with vLLM on A100 GPUs. ".repeat(30);
    const t0 = performance.now();
    for (let i = 0; i < answer.length; i += 90) g.push(answer.slice(i, i + 90));
    g.flush();
    expect(performance.now() - t0).toBeLessThan(40); // Node in CI is slower than workerd; measured ~1-2 ms locally
  });
});

describe("the fixed reply and chips", () => {
  it("name nobody, neither confirm nor deny, and never compare the client with another organisation", () => {
    for (const text of [...Object.values(CONFIDENTIAL_REPLY), ...CONFIDENTIAL_CHIPS.en, ...CONFIDENTIAL_CHIPS.ar]) expect(DUMMY.mentions(text)).toBe(false);
    expect(CONFIDENTIAL_REPLY.en).toMatch(/Saudi government client/);
    expect(CONFIDENTIAL_REPLY.en).toMatch(/can't confirm or deny/);
    expect(CONFIDENTIAL_REPLY.ar).toMatch(/جهة حكومية سعودية/);
    expect(CONFIDENTIAL_REPLY.en).not.toMatch(/\b(?:another|different|other)\b|GADD|Defen[cs]e/i);
    expect(CONFIDENTIAL_REPLY.ar).not.toMatch(/أخرى|آخر|مختلف|الدفاع|GADD/);
  });
});

/* ------------------------------------------------------------------ local only: the real names and key */

const namesFile = `${root}_inputs/forbidden-names.txt`;
const key = realKey();
describe.skipIf(!existsSync(namesFile) || !key)("real names (local only: _inputs/forbidden-names.txt and the real key)", () => {
  const entries = existsSync(namesFile)
    ? readFileSync(namesFile, "utf8")
        .split(/\r?\n/)
        .map((l) => /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*$/.exec(l))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => ({ key: m[1]!, phrase: m[2]! }))
    : [];
  const shipped = confidentialFor(key)!;

  it("the real key is the shipped list's key", () => {
    expect(shipped).not.toBeNull();
    expect(shipped.size).toBe(new Set([...HASHES.canonical, ...HASHES.variants]).size);
  });

  it("every listed name and phrasing is caught by the shipped guard, alone and inside a sentence", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const { key: k, phrase } of entries) {
      expect(shipped.mentions(phrase), k).toBe(true);
      expect(shipped.mentions(`It was built for the ${phrase} last year.`), k).toBe(true);
    }
  });

  it("streams of the real names are blocked before any of their letters is sent", () => {
    for (const { key: k, phrase } of entries) {
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
      expect(blocked, k).toBe(true);
      expect(shipped.mentions(shown), k).toBe(false);
      expect(norm(shown).includes(norm(phrase)), k).toBe(false);
    }
  });

  it("the fixed reply and chips don't trip the shipped list", () => {
    for (const text of [...Object.values(CONFIDENTIAL_REPLY), ...CONFIDENTIAL_CHIPS.en, ...CONFIDENTIAL_CHIPS.ar]) expect(shipped.mentions(text)).toBe(false);
  });

  it("confidential-hashes.json is generated from this file (run worker/scripts/confidential-hashes.mjs after editing it)", () => {
    for (const { phrase } of entries) expect(phraseForms(phrase) === null || shipped.mentions(phrase)).toBe(true);
    const r = spawnSync(process.execPath, [`${root}worker/scripts/confidential-hashes.mjs`, "--check"], { encoding: "utf8" });
    expect(r.status, "confidential-hashes.json is out of date").toBe(0);
  });
});
