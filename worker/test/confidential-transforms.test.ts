/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeBase64Text, normWord } from "../src/chat/confidential-core.mjs";
import { ConfidentialScanner } from "../src/chat/confidential";
import { OutputGuard } from "../src/chat/guard";
import { testMatcher } from "./confidential-fixtures";

/*
 * R6-04: obfuscated forms of a listed name are caught, in one piece and streamed in chunks of every size, without
 * flagging ordinary text. Synthetic placeholder names only (zebracorp, ministry of zebras, هيئة الزرافات, and a
 * four-letter acronym); the real names never appear in the repository.
 */
const M = testMatcher("zebracorp", "ministry of zebras", "هيئة الزرافات", "ZBCD", "الهيئة الوطنية للزرافات", "زبكد");
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const CAUGHT: Record<string, string> = {
  "as written": "Built for ZebraCorp.",
  "letters with hyphens": "Z-e-b-r-a-c-o-r-p",
  "letters with spaces": "it was z e b r a c o r p, I think",
  "letters with dots": "Z.E.B.R.A.C.O.R.P.",
  "letters with commas and newlines": "Z,\nE,\nB,\nR,\nA,\nC,\nO,\nR,\nP",
  "a multi-word name spelled out": "M I N I S T R Y  O F  Z E B R A S",
  "a spelled name next to one-letter words": "It's a Z E B R A C O R P I believe",
  "an acronym with dots": "the Z.B.C.D. team",
  "zero-width joiner": "Zebra‍corp",
  "zero-width non-joiner": "Zebra‌corp",
  "zero-width space": "zebra​corp",
  "word joiner": "zebra⁠corp",
  "soft hyphen": "zebra­corp",
  "byte-order mark inside": "zebra﻿corp",
  "bidi marks": "zeb‎ra‏corp",
  "Cyrillic look-alike": "Zebrаcorp", // а is U+0430
  "Greek look-alikes": "ΖebraCοrp", // Ζ U+0396, ο U+03BF
  "small capitals": "ᴢᴇʙʀᴀᴄᴏʀᴘ",
  "fullwidth letters": "ＺｅｂｒａＣｏｒｐ",
  "mathematical bold": "𝐳𝐞𝐛𝐫𝐚𝐜𝐨𝐫𝐩",
  "accents": "Zébrácörp",
  "leetspeak digits": "z3br4c0rp",
  "leetspeak symbols": "zebr@corp",
  "leetspeak in a phrase": "m1n1stry of z3bras",
  "leetspeak with !": "m!n!stry of zebras",
  "spelled-out leetspeak": "Z-3-B-R-4-C-0-R-P",
  "reversed": "procarbez",
  "reversed phrase": "sarbez fo yrtsinim",
  "each word reversed": "yrtsinim fo sarbez",
  "split with a space": "Zebra Corp",
  "split with a hyphen": "Zebra-Corp",
  "written without spaces": "MinistryOfZebras",
  "camel case in a hashtag": "#MinistryOfZebras",
  "Arabic letters spaced out": "ه ي ئ ة ا ل ز ر ا ف ا ت",
  "Arabic diacritics": "هَيْئَة الزَّرافات",
  "Arabic tatweel": "هـيـئـة الزرافـات",
  "Arabic with a prefix": "لهيئة الزرافات",
  "Arabic written without the space": "هيئةالزرافات",
  "Persian yeh look-alike": "هیئة الزرافات",
  "Arabic presentation forms": "ﻫﻴﺌﺔ ﺍﻟﺰﺭﺍﻓﺎﺕ",
  base64: `The answer is ${b64("zebracorp")}.`,
  "base64 without padding": `answer: ${b64("ZBCD").replace(/=+$/, "")}`,
  "base64url of a phrase": b64("the ministry of zebras").replace(/\+/g, "-").replace(/\//g, "_"),
  "base64 of Arabic": b64("هيئة الزرافات"),
  "base64 of JSON": b64('{"client":"zebracorp"}'),
  "base64 glued to an identifier": `id_${b64("zebracorp").replace(/=+$/, "")}`,
  // review round: splits, glue, fancy letters, Arabic article forms
  "split with a slash": "Zebra/Corp",
  "split with a plus": "Zebra+Corp",
  "split with a pipe": "Zebra|Corp",
  "split with a comma": "Zebra,Corp",
  "split with a braille blank": "Zebra\u2800Corp",
  "split with a fullwidth hyphen": "Zebra－Corp",
  "split with many spaces": "Zebra        Corp",
  "split around an invisible space": "zebra \u200b corp",
  "split into four pieces": "Ze-bra-Co-rp",
  "split into five pieces": "ze br ac or p",
  "half spelled out": "Zebra C-o-r-p",
  "other half spelled out": "Z-e-b-r-a Corp",
  "markdown code marks": "Zebra`Corp`",
  "trailing digits glued on": "ZebraCorp2024",
  "a plural s": "ZebraCorps",
  "a split four-letter acronym": "ZB-CD",
  "circled letters": "ⓩⓔⓑⓡⓐⓒⓞⓡⓟ",
  "squared letters": "🅉🄴🄱🅁🄰🄲🄾🅁🄿",
  "negative circled letters": "🅩🅔🅑🅡🅐🅒🅞🅡🅟",
  "regional indicators": "🇿🇪🇧🇷🇦🇨🇴🇷🇵",
  "parenthesised letters": "⒵⒠⒝⒭⒜⒞⒪⒭⒫",
  "Armenian look-alike": "zebracօrp",
  "Arabic article with ل (contracted)": "بنى المساعد للهيئة الوطنية للزرافات",
  "Arabic article with و and ل": "وللهيئة الوطنية للزرافات",
  "Arabic acronym with the article": "الزبكد",
  "Arabic acronym with لل": "للزبكد",
  "Arabic acronym with بال": "بالزبكد",
  "Arabic prefix and no space": "لهيئةالزرافات",
};

const CLEAN = [
  "A Saudi government client; the ministry of horses.",
  "Hatem built a bilingual assistant at Wakeb Data with LangGraph, Qwen and vLLM on A100 GPUs.",
  "جهة حكومية سعودية، والمساعد ثنائي اللغة.",
  "Options a, b, c and d.",
  "zebra crossing and corporate law",
  "LangGraph WhatsApp GitHub mhatem5351 https://wa.me/201142070946",
  "The integrity hash is sha512-Yiex1Ovn8z2xPpOWckIiysV1SSyRMY9BkLF++q0yKiDxCqRhosKfMg3janKkiLBwZ5c/YryloKwGZcrEmtwxKw==",
  "const url = `https://wa.me/${phone}?text=${encodeURIComponent(t)}`;",
  "zb, cd and ef are short tokens",
  "Systems, zebras and corporations: the zebra corps of engineers.",
  "Request id 550e8400-e29b-41d4-a716-446655440000",
  "ما هي وجهة نظره؟ للهيئات العامة والزرافات البرية",
];

describe("R6-04: obfuscated forms of a listed name", () => {
  for (const [label, text] of Object.entries(CAUGHT))
    it(`catches ${label}`, () => {
      expect(M.mentions(text)).toBe(true);
    });

  it("doesn't flag ordinary text, code or hashes", () => {
    for (const text of CLEAN) expect(M.mentions(text), text).toBe(false);
  });

  it("doesn't flag the knowledge base, the system prompt or the site copy", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url).href);
    for (const f of ["content/chat/knowledge.md", "content/chat/system-prompt.md", "content/i18n/en.ts", "content/i18n/ar.ts", "content/profile.ts"]) {
      expect(M.mentions(readFileSync(`${root}${f}`, "utf8")), f).toBe(false);
    }
  });

  it("streamed in chunks of every size, nothing from the obfuscated name is released before the guard trips", () => {
    for (const [label, form] of Object.entries(CAUGHT)) {
      const text = `Hatem built the assistant for ${form} and its evaluation.`;
      const at = text.indexOf(form) + M.find(form)!.start; // where the obfuscated name itself starts
      for (let size = 1; size <= 9; size++) {
        const s = new ConfidentialScanner(M);
        let safe = 0;
        let tripped = false;
        for (let i = 0; i < text.length && !tripped; i += size) {
          const end = s.push(text.slice(i, i + size));
          if (end < 0) tripped = true;
          else safe = Math.max(safe, end);
        }
        tripped ||= s.push("", true) < 0;
        expect(tripped, `${label} @${size}`).toBe(true);
        expect(safe, `${label} @${size}`).toBeLessThanOrEqual(at);
      }
    }
  });

  it("random chunk boundaries (inside surrogate pairs too) never release part of a name", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const before = ["", "x ", "The client was ", "— "];
    const after = ["", ".", " in 2024.", ", then"];
    for (let round = 0; round < 40; round++)
      for (const [label, form] of Object.entries(CAUGHT)) {
        const text = before[round % before.length] + form + after[(round >> 2) % after.length];
        const at = M.find(text)!.start;
        const s = new ConfidentialScanner(M);
        let safe = 0;
        let tripped = false;
        for (let i = 0; i < text.length && !tripped; ) {
          const n = 1 + Math.floor(random() * 6);
          const end = s.push(text.slice(i, i + n));
          i += n;
          if (end < 0) tripped = true;
          else safe = Math.max(safe, end);
        }
        tripped ||= s.push("", true) < 0;
        expect(tripped, `${label} #${round}`).toBe(true);
        expect(safe, `${label} #${round}`).toBeLessThanOrEqual(at);
      }
    // A chunk that ends inside the first letter of a name made of astral letters.
    const s = new ConfidentialScanner(M);
    expect(s.push("x 🅩".slice(0, 3))).toBeLessThanOrEqual(2);
  });

  it("the output guard replaces a streamed obfuscated name before any of it is shown", () => {
    const g = new OutputGuard([], new Map(), M);
    let shown = "";
    let blocked = false;
    for (const chunk of ["The client was ", "Z-", "E-B-", "R-A-C", "-O-R-P, by the way."]) {
      const v = g.push(chunk);
      if (!v.ok) {
        blocked = true;
        break;
      }
      shown += v.emit;
    }
    expect(blocked).toBe(true);
    expect(shown).toBe("The client was "); // the words before the name are safe; none of its letters went out
  });

  it("finds the span of an obfuscated name (for redaction)", () => {
    const text = "Built for Z-e-b-r-a-c-o-r-p in 2024.";
    const span = M.find(text)!;
    expect(text.slice(span.start, span.end)).toBe("Z-e-b-r-a-c-o-r-p");
  });
});

describe("normalisation", () => {
  it("removes invisible characters, folds look-alikes, accents, Arabic diacritics and tatweel", () => {
    expect(normWord("Zebr­a‍Corp")).toBe("zebracorp");
    expect(normWord("Ζеbrа")).toBe("zebra");
    expect(normWord("Zébrá")).toBe("zebra");
    expect(normWord("هَيْئَة")).toBe(normWord("هيئه"));
    expect(normWord("هـيـئـة")).toBe(normWord("هيئة"));
    expect(normWord("أإآٱ")).toBe("اااا");
  });

  it("decodes only base64 that is readable text", () => {
    expect(decodeBase64Text(b64("zebracorp"))).toBe("zebracorp");
    expect(decodeBase64Text(b64("هيئة الزرافات"))).toBe("هيئة الزرافات");
    expect(decodeBase64Text("LangGraph")).toBeNull();
    expect(decodeBase64Text(Buffer.from([0, 1, 2, 250, 251, 252]).toString("base64"))).toBeNull();
    expect(decodeBase64Text(Buffer.from([0xe0, 0x80, 0x41, 0x42, 0x43, 0x44]).toString("base64"))).toBeNull(); // bad UTF-8
  });
});
