/**
 * The unnamed client's name check, shared by everything that runs it: the Worker's output guard (confidential.ts),
 * the repository check (content/scripts/check-content.mjs: pre-commit hook, deploy gate, CI), the commit-msg hook,
 * the site's build check and the local chat scripts. Plain JavaScript without imports, so the Worker bundle, Vitest,
 * tsx and plain Node all run this exact code; confidential-core.d.mts types it for TypeScript.
 *
 * KEYED HASHES. The repository is public, so it holds only HMAC-SHA-256(key, form) of each normalised name form
 * (confidential-hashes.json), never a name and never an unkeyed hash: a plain SHA-256 of a short name can be reversed
 * by brute force or a short candidate list. The key (CONFIDENTIAL_HMAC_KEY: 32 random bytes as 64 hex characters)
 * lives in the gitignored .env, the Worker's secrets and the CI secret only. `keyId` (a truncated HMAC of a constant)
 * is stored with the list so a wrong key fails loudly instead of silently matching nothing.
 *
 * NORMALISATION (normWord, applied to the generated forms and to every scanned word alike): NFKD (fullwidth and
 * mathematical letters, ligatures, presentation forms), default-ignorable and format characters removed (zero-width
 * joiners and spaces, soft hyphen, bidi marks, variation selectors: invisible once rendered), Cyrillic, Greek and
 * small-capital look-alikes mapped to Latin and Persian look-alikes to Arabic, lower case, combining marks removed
 * (accents, Arabic diacritics, and the hamza of أ إ آ ؤ ئ), Arabic letters folded (ٱ → ا, ة → ه, ى → ي, no tatweel).
 *
 * WHAT IS MATCHED, per word stream (a word is a run of letters, digits, marks and invisible characters):
 *   - every 1-, 2- and 3-word sequence, spaced ("ministry of x") and, across soft separators only, joined
 *     ("ministryofx": a name split with spaces or hyphens, or written without them);
 *   - a second stream where leetspeak is read as letters (0→o 1→i 3→e 4→a 5→s 7→t 8→b 9→g, and @ $ ! | + between
 *     letters); only sequences containing such a word are hashed;
 *   - runs of single-character words, joined: letters spelled out with spaces, hyphens or dots, and Arabic letters
 *     written apart (every window of SKELETON_MIN..SKELETON_MAX letters);
 *   - base64 runs (4+ bytes, padded or not) that decode to readable UTF-8 text, checked as text.
 * Reversed names (whole phrase, or each word) are generated forms, so they cost nothing at run time.
 *
 * COST (the guard runs on every chunk of a streamed answer; Workers Free allows 10 ms of CPU per request): one HMAC
 * is two SHA-256 compressions with the padded key blocks precomputed (~0.5 µs in V8). Each distinct word is hashed
 * once per isolate (cached); 2-3 word sequences are hashed only when their first word starts a listed phrase
 * (`starts`), and joined sequences and spelled-out windows only when their first three letters start a listed form
 * (`prefixes`, keyed and domain-separated). Ordinary prose therefore costs about one HMAC per new word.
 */

/* ------------------------------------------------------------------ SHA-256 and HMAC-SHA-256 (synchronous) */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
const W = new Int32Array(64);
const enc = new TextEncoder();
/** Message scratch buffer, reused for every input up to ~330 characters (every word and phrase the scanner hashes). */
const SCRATCH = new Uint8Array(1024);
/** The outer HMAC block: 32-byte inner digest + padding. */
const OUTER = new Uint8Array(64);
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/** One SHA-256 compression of buf[off..off+64) into the state H. */
function compress(H, buf, off) {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  H[0] = (H[0] + a) | 0;
  H[1] = (H[1] + b) | 0;
  H[2] = (H[2] + c) | 0;
  H[3] = (H[3] + d) | 0;
  H[4] = (H[4] + e) | 0;
  H[5] = (H[5] + f) | 0;
  H[6] = (H[6] + g) | 0;
  H[7] = (H[7] + h) | 0;
}

/** SHA-256 of `bytes` (used to shorten an over-long HMAC key, per RFC 2104). */
function sha256Bytes(bytes) {
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  writeLength(buf, total, bytes.length * 8);
  const S = new Int32Array(IV);
  for (let off = 0; off < total; off += 64) compress(S, buf, off);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) writeWord(out, i * 4, S[i]);
  return out;
}

function writeLength(buf, total, bits) {
  buf[total - 8] = 0;
  buf[total - 7] = 0;
  buf[total - 6] = 0;
  buf[total - 5] = Math.floor(bits / 0x100000000) & 0xff;
  buf[total - 4] = bits >>> 24;
  buf[total - 3] = (bits >>> 16) & 0xff;
  buf[total - 2] = (bits >>> 8) & 0xff;
  buf[total - 1] = bits & 0xff;
}

function writeWord(buf, off, v) {
  buf[off] = v >>> 24;
  buf[off + 1] = (v >>> 16) & 0xff;
  buf[off + 2] = (v >>> 8) & 0xff;
  buf[off + 3] = v & 0xff;
}

function toHex(S) {
  let hex = "";
  for (let i = 0; i < 8; i++) {
    const v = S[i];
    hex += HEX[v >>> 24] + HEX[(v >>> 16) & 0xff] + HEX[(v >>> 8) & 0xff] + HEX[v & 0xff];
  }
  return hex;
}

/**
 * HMAC-SHA-256 with a fixed key (the padded key blocks are compressed once), or plain SHA-256 when `key` is null
 * (legacy unkeyed lists and tests only; the shipped list is always keyed).
 */
export class Hasher {
  constructor(key) {
    this.keyed = key != null;
    /** Digest of the last call (overwritten by the next one). */
    this.out = new Int32Array(8);
    this.inner = new Int32Array(IV);
    this.outer = new Int32Array(IV);
    if (this.keyed) {
      const k = key.length > 64 ? sha256Bytes(key) : key;
      const pad = new Uint8Array(64);
      pad.set(k);
      for (let i = 0; i < 64; i++) pad[i] ^= 0x36;
      compress(this.inner, pad, 0);
      pad.fill(0);
      pad.set(k);
      for (let i = 0; i < 64; i++) pad[i] ^= 0x5c;
      compress(this.outer, pad, 0);
    }
  }

  /** Digest of the UTF-8 bytes of `text` as eight 32-bit words (shared buffer). */
  digest(text) {
    let buf = SCRATCH;
    let len;
    if (text.length * 3 + 72 <= SCRATCH.length) len = enc.encodeInto(text, SCRATCH).written;
    else {
      const bytes = enc.encode(text);
      len = bytes.length;
      buf = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
      buf.set(bytes);
    }
    const total = Math.ceil((len + 9) / 64) * 64;
    buf.fill(0, len, total);
    buf[len] = 0x80;
    writeLength(buf, total, (len + (this.keyed ? 64 : 0)) * 8);
    const S = this.out;
    S.set(this.keyed ? this.inner : IV);
    for (let off = 0; off < total; off += 64) compress(S, buf, off);
    if (this.keyed) {
      for (let i = 0; i < 8; i++) writeWord(OUTER, i * 4, S[i]);
      OUTER.fill(0, 32, 64);
      OUTER[32] = 0x80;
      OUTER[62] = 0x03; // (64 + 32) bytes = 768 bits
      S.set(this.outer);
      compress(S, OUTER, 0);
    }
    return S;
  }

  /** Lowercase hex digest of `text`. */
  hex(text) {
    return toHex(this.digest(text));
  }
}

/** Hex SHA-256 of the UTF-8 bytes of `text` (unkeyed). */
export function sha256Hex(text) {
  return new Hasher(null).hex(text);
}

/* ------------------------------------------------------------------ the key */

export const KEY_ENV = "CONFIDENTIAL_HMAC_KEY";
/** Hashing scheme of confidential-hashes.json: the key, the normalisation and the generated forms together. */
export const SCHEME = "hmac-sha256/norm-2";
const KEY_ID_INPUT = "\u0000key-id\u0000mohamedhatem.dev confidential names";
const PREFIX_TAG = "\u0000prefix\u0000";

/** The 32-byte key from its 64-hex-character form (surrounding quotes and spaces allowed); null when malformed. */
export function parseKey(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return key;
}

/** Public fingerprint of a key: the first 16 hex characters of the HMAC of a fixed string (reveals nothing). */
export function keyIdOf(hasher) {
  return hasher.hex(KEY_ID_INPUT).slice(0, 16);
}

/* ------------------------------------------------------------------ normalisation */

const IGNORABLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
const MARKS = /\p{M}/gu;
const NON_WORD = /[^\p{L}\p{N}]/gu;
const ASCII = /^[\x00-\x7f]*$/;

/** Look-alikes (after NFKD, before lower case, so upper- and lower-case forms can differ). */
const CONFUSABLES = new Map(
  Object.entries({
    // Cyrillic
    А: "a", а: "a", В: "b", в: "b", С: "c", с: "c", Ԁ: "d", ԁ: "d", Е: "e", е: "e", Н: "h", н: "h", Һ: "h", һ: "h",
    І: "i", і: "i", Ӏ: "i", ӏ: "i", Ј: "j", ј: "j", К: "k", к: "k", М: "m", м: "m", П: "n", п: "n", О: "o", о: "o",
    Р: "p", р: "p", Ԛ: "q", ԛ: "q", Ѕ: "s", ѕ: "s", Т: "t", т: "t", Ѵ: "v", ѵ: "v", Ԝ: "w", ԝ: "w", Ѡ: "w", ѡ: "w",
    Х: "x", х: "x", У: "y", у: "y", Ү: "y", ү: "y", Ь: "b", ь: "b",
    // Greek
    Α: "a", α: "a", Β: "b", β: "b", Ϲ: "c", ϲ: "c", Ε: "e", ε: "e", Η: "h", η: "n", Ι: "i", ι: "i", ϳ: "j", Κ: "k",
    κ: "k", Μ: "m", μ: "u", Ν: "n", ν: "v", Ο: "o", ο: "o", Ρ: "p", ρ: "p", Τ: "t", τ: "t", Υ: "y", υ: "u", Χ: "x",
    χ: "x", ω: "w", Ζ: "z",
    // Latin small capitals and other look-alikes
    ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n",
    ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z", ı: "i", ȷ: "j", ɑ: "a",
    ɡ: "g", ɩ: "i", ǀ: "i",
    // Armenian and Cherokee capitals that look like Latin letters
    օ: "o", Օ: "o", ս: "u", Ս: "u", հ: "h", ո: "n", ց: "g", Ꭺ: "a", Ᏼ: "b", Ꮯ: "c", Ꭼ: "e", Ꮐ: "g", Ꮋ: "h", Ꭻ: "j",
    Ꮶ: "k", Ꮮ: "l", Ꮇ: "m", Ꮲ: "p", Ꮪ: "s", Ꭲ: "t", Ꮩ: "v", Ꮃ: "w", Ꮓ: "z",
    // Persian / Urdu letters that look like Arabic ones
    ک: "ك", ڪ: "ك", ی: "ي", ہ: "ه", ھ: "ه", ە: "ه", ۃ: "ه",
  }),
);
/**
 * Enclosed letters NFKD leaves alone: negative circled 🅐, negative squared 🅰 and regional indicators 🇦 (circled ⓐ,
 * squared 🄰 and parenthesised ⒜ decompose by themselves).
 */
const ENCLOSED = /[\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}\u{1F1E6}-\u{1F1FF}]/gu;
const enclosedLetter = (c) => {
  const cp = c.codePointAt(0);
  const base = cp >= 0x1f1e6 ? 0x1f1e6 : cp >= 0x1f170 ? 0x1f170 : 0x1f150;
  return String.fromCharCode(97 + cp - base);
};
const CONFUSABLE = new RegExp(`[${[...CONFUSABLES.keys()].join("")}]`, "gu");

/** Arabic spelling variants folded together (ٱ أ إ آ → ا, ة → ه, ى → ي, tatweel removed). */
export function foldArabic(word) {
  return word.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "");
}

/** One word (or phrase) normalised for hashing; see the header. Characters that aren't letters or digits are dropped. */
export function normWord(raw) {
  if (ASCII.test(raw)) return raw.toLowerCase().replace(NON_WORD, "");
  return foldArabic(
    raw
      .replace(ENCLOSED, enclosedLetter)
      .normalize("NFKD")
      .replace(IGNORABLE, "")
      .replace(CONFUSABLE, (c) => CONFUSABLES.get(c))
      .toLowerCase()
      .replace(MARKS, ""),
  ).replace(NON_WORD, "");
}

const WORD_CLASS = "\\p{L}\\p{N}\\p{M}\\p{Alphabetic}\\p{Cf}\\p{Default_Ignorable_Code_Point}\\u2460-\\u24ff\\u{1F100}-\\u{1F1FF}";
/**
 * A word: letters (with "fancy" enclosed letters such as ⓩ 🄰 🅩 🇿), digits, combining marks and invisible characters
 * (which normWord then removes).
 */
const WORD_A = new RegExp(`[${WORD_CLASS}]+`, "gu");

/** The normalised words of `text`. */
export function normWords(text) {
  const out = [];
  for (const m of text.matchAll(WORD_A)) {
    const w = normWord(m[0]);
    if (w) out.push(w);
  }
  return out;
}

const LEET = new Map(
  Object.entries({ 0: "o", 1: "i", 2: "z", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i", "|": "i", "+": "t", "€": "e" }),
);
const LEET_SYMBOL = /[@$!|+€]/g;
/** A word with digits glued on ("zebracorp2024" → "zebracorp"); a plural s. */
const TRAILING_DIGITS = /^(\p{L}{4,})\p{N}+$/u;
const PLURAL = /[^s]s$/;
const LEET_DIGIT = /[0-9]/g;
const HAS_LEET = /[0-9@$!|+€]/;
const HAS_LETTER = /\p{L}/u;
/** In the leetspeak stream, @ $ ! | + € are part of a word when a word character follows. */
const WORD_B = new RegExp(`(?:[${WORD_CLASS}]|[@$!|+€](?=[${WORD_CLASS}]))+`, "gu");

/** A word read as leetspeak (digits and symbols as letters). */
export function leetWord(raw) {
  return normWord(raw.replace(LEET_SYMBOL, (c) => LEET.get(c))).replace(LEET_DIGIT, (c) => LEET.get(c));
}

/* ------------------------------------------------------------------ generated forms */

/** Arabic one- and two-letter prefixes (و ف ب ل ك …) a name can carry. */
const ARABIC_PREFIXES = ["و", "ف", "ب", "ل", "ك", "ول", "وب", "فل", "فب", "وك"];

/**
 * The first word of an Arabic phrase with the prefixes it can carry, as Arabic writes them: ل before the article
 * contracts (ل + الهيئة → للهيئة, ول + … → ولل…), and a one-word name (an acronym) also takes the article (الـ…, للـ…,
 * بالـ…).
 */
function arabicFirstWords(word, oneWord) {
  const out = new Set();
  const bases = oneWord && !word.startsWith("ال") ? [word, "ال" + word] : [word];
  for (const b of bases) {
    out.add(b);
    for (const pre of ARABIC_PREFIXES) {
      out.add(pre + b);
      if (b.startsWith("ال") && pre.endsWith("ل")) out.add(pre + b.slice(1));
    }
  }
  out.delete(word);
  return out;
}
const ARABIC = /[؀-ۿ]/;
/** Shortest and longest letters-only form checked in runs of spelled-out letters (public constants, not lengths of names). */
export const SKELETON_MIN = 3;
export const SKELETON_MAX = 40;
/**
 * Words are joined ("zebra corp" → "zebracorp", up to {@link JOIN_MAX_WORDS} fragments) only across soft separators
 * (spaces of any kind, dashes, dots, underscores, bullets, apostrophes, quotes, slashes, pipes, commas, colons,
 * brackets, markdown emphasis and code marks, invisible characters; up to 12 of them) and only into forms of at least
 * this many letters, so two short tokens of code or a URL can't add up to a short name. Four-letter forms are joined
 * only from fragments of one or two letters split by a single hyphen, dot or underscore ("ZB-CD").
 */
export const JOINED_MIN = 5;
export const JOIN_MAX_WORDS = 8;
/** Joined forms longer than this are not held back while they are being assembled. */
const JOIN_LETTERS_MAX = 64;
const SOFT_GAP = /^[\s\p{Zs}\p{Pd}\p{Pc}\p{Cf}\p{Default_Ignorable_Code_Point}⠀.·•∙⋅*'’‘`"“”\/\\+|,:;()\[\]~^]{1,12}$/u;
const SHORT_JOIN_GAP = /^[\-‐‑._·]$/u;
/** Spaced forms are generated for phrases of up to this many words (the scanner checks 1-3 word sequences). */
export const MAX_WORDS = 3;
/** Longer phrases (up to this many words) get only their space-free forms; beyond it they are eval placeholders only. */
export const MAX_JOINED_WORDS = 8;

const backwards = (s) => [...s].reverse().join("");
/** The first three code points of `s`. */
function head(s) {
  let i = 0;
  for (let n = 0; n < 3 && i < s.length; n++) i += s.charCodeAt(i) >= 0xd800 && s.charCodeAt(i) <= 0xdbff ? 2 : 1;
  return s.slice(0, i);
}

/**
 * Every normalised form of one phrase that the guard should catch, before hashing: the phrase spaced and joined,
 * reversed (whole, and each word in place), with l read as i (1, |, I and Ӏ for l), and Arabic phrases with a one- or
 * two-letter prefix (and the article on one-word names; see arabicFirstWords). `starts` are the first words of the multi-word forms, `prefixes` the first three letters of the
 * space-free forms (the run-time prefilters). Phrases of {@link MAX_WORDS}+1 to {@link MAX_JOINED_WORDS} words get only
 * their space-free forms (their spaced forms are caught through their shorter listed phrases). Null for an empty phrase
 * or a longer one.
 */
export function phraseForms(phrase) {
  const words = normWords(phrase);
  if (!words.length || words.length > MAX_JOINED_WORDS) return null;
  const spaced = words.length <= MAX_WORDS;
  const names = new Set();
  const starts = new Set();
  const prefixes = new Set();
  const add = (ws) => {
    if (spaced) {
      names.add(ws.join(" "));
      if (ws.length > 1) starts.add(ws[0]);
    }
    const joined = ws.join("");
    names.add(joined);
    prefixes.add(head(joined));
  };
  for (const ws of [words, words.map(backwards).reverse(), words.map(backwards)]) {
    add(ws);
    if (ws.some((w) => w.includes("l"))) add(ws.map((w) => w.replaceAll("l", "i")));
  }
  if (ARABIC.test(words[0]))
    for (const first of arabicFirstWords(words[0], words.length === 1)) {
      const ws = [first, ...words.slice(1)];
      if (spaced) {
        names.add(ws.join(" "));
        if (ws.length > 1) starts.add(first);
      }
      names.add(ws.join(""));
      prefixes.add(head(ws.join("")));
    }
  return { base: words.join(" "), names, starts, prefixes };
}

/** The keyed list entries of normalised forms (see {@link phraseForms}). */
export function hashForms(hasher, { names, starts, prefixes }) {
  return {
    names: [...names].map((s) => hasher.hex(s)),
    starts: [...starts].map((s) => hasher.hex(s)),
    prefixes: [...prefixes].map((s) => hasher.hex(PREFIX_TAG + s)),
  };
}

/* ------------------------------------------------------------------ matcher */

const NAME = 1;
const START = 2;
const CACHE_MAX = 4096;

/** A set of hex digests, looked up without building a hex string unless the first 32 bits match. */
class DigestSet {
  constructor(hexes) {
    this.full = new Set();
    this.firsts = new Set();
    for (const h of hexes) {
      const hex = String(h).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hex)) continue;
      this.full.add(hex);
      this.firsts.add(parseInt(hex.slice(0, 8), 16) | 0);
    }
  }
  get size() {
    return this.full.size;
  }
  has(S) {
    return this.firsts.has(S[0]) && this.full.has(toHex(S));
  }
}

export class Matcher {
  /**
   * @param {{ hasher?: Hasher, names?: Iterable<string>, starts?: Iterable<string> | null, prefixes?: Iterable<string> | null, blockAll?: boolean, cacheSize?: number }} o
   *   names: hex digests of every listed form; starts/prefixes: the prefilters (null: check every sequence, for
   *   lists that have none); blockAll: fail closed, every text counts as naming the client; cacheSize: distinct
   *   words remembered (per matcher, i.e. per isolate in the Worker).
   */
  constructor({ hasher = new Hasher(null), names = [], starts = null, prefixes = null, blockAll = false, cacheSize = CACHE_MAX } = {}) {
    this.hasher = hasher;
    this.cacheSize = cacheSize;
    this.names = new DigestSet(names);
    this.starts = starts ? new DigestSet(starts) : null;
    this.prefixes = prefixes ? new DigestSet(prefixes) : null;
    this.blockAll = blockAll;
    this.words = new Map();
    this.heads = new Map();
  }

  /** Number of listed forms (0 for an empty matcher). */
  get size() {
    return this.names.size;
  }

  /** NAME and START flags of one normalised word (cached per matcher, i.e. per isolate in the Worker). */
  wordFlags(w) {
    let f = this.words.get(w);
    if (f === undefined) {
      const S = this.hasher.digest(w);
      f = (this.names.has(S) ? NAME : 0) | (!this.starts || this.starts.has(S) ? START : 0);
      if (this.words.size >= this.cacheSize) this.words.clear();
      this.words.set(w, f);
    }
    return f;
  }

  /** True when a listed space-free form could start with `s` (its first three letters). */
  headOk(s) {
    if (!this.prefixes) return true;
    const h = head(s);
    let ok = this.heads.get(h);
    if (ok === undefined) {
      ok = this.prefixes.has(this.hasher.digest(PREFIX_TAG + h));
      if (this.heads.size >= this.cacheSize) this.heads.clear();
      this.heads.set(h, ok);
    }
    return ok;
  }

  /** True when the normalised form `s` is listed (not cached: sequences rarely repeat). */
  isName(s) {
    return this.names.has(this.hasher.digest(s));
  }

  /** True when `text` names the client. */
  mentions(text, base64 = true) {
    if (this.blockAll) return true;
    if (!this.size || !text) return false;
    return new Scanner(this, base64).push(text, true) < 0;
  }

  /** Where `text` first names the client ({start, end} indices into `text`), or null. */
  find(text) {
    if (this.blockAll) return text ? { start: 0, end: text.length } : null;
    if (!this.size || !text) return null;
    const s = new Scanner(this, true);
    return s.push(text, true) < 0 ? s.span : null;
  }
}

/* ------------------------------------------------------------------ streaming scanner */

/**
 * One tokenisation of the growing text. `leet`: the leetspeak stream (only sequences containing a word with a digit
 * or symbol are hashed; no spelled-out runs, the plain stream has those).
 */
class WordStream {
  constructor(matcher, leet) {
    this.m = matcher;
    this.leet = leet;
    this.re = new RegExp(leet ? WORD_B : WORD_A);
    /** Text before this index has been split into words. */
    this.pos = 0;
    /** The last (up to JOIN_MAX_WORDS) words: normalised form, raw span, whether to hash it, soft gap before it. */
    this.recent = [];
    /** The current run of single-character words: { c, start, end, ok } (ok: a listed form may start here). */
    this.run = [];
    this.span = null;
  }

  /**
   * A word is complete once a character follows that can't extend it: not the end of the text, not a lone high
   * surrogate at the end (a chunk may split a letter such as 𝐳 in two), and in the leetspeak stream not a symbol at
   * the end (it may join the next letter).
   */
  complete(text, end) {
    if (end < text.length - 1) return true;
    if (end === text.length - 1) {
      const c = text.charCodeAt(end);
      if (c >= 0xd800 && c <= 0xdbff) return false;
      return !this.leet || !HAS_LEET.test(text[end]);
    }
    return false;
  }

  /** Returns -1 when a listed form completed, else the first text index that must still be held back. */
  push(text, final) {
    this.text = text;
    const re = this.re;
    re.lastIndex = this.pos;
    let partial = -1;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const end = m.index + m[0].length;
      if (!final && !this.complete(text, end)) {
        partial = m.index;
        break;
      }
      this.pos = end;
      if (this.word(m[0], m.index, end)) return -1;
    }
    if (final) return text.length;
    return this.held(partial >= 0 ? partial : text.length);
  }

  /**
   * The first index that must stay hidden: an unfinished word, the last two complete words (a 2-3 word form may
   * still complete), the earliest word from which joined letters can still grow into a listed form (its first three
   * letters start one), and the earliest letter of a spelled-out run that can (same test).
   */
  held(limit) {
    let held = limit;
    const m = this.m;
    const r = this.recent;
    if (r.length) held = Math.min(held, r[Math.max(0, r.length - 2)].start);
    let joined = "";
    for (let i = r.length - 1; i >= 0 && r.length - i < JOIN_MAX_WORDS; i--) {
      joined = r[i].w + joined;
      if (joined.length > JOIN_LETTERS_MAX) break;
      if (joined.length < 3 || m.headOk(joined)) held = Math.min(held, r[i].start);
      if (!r[i].soft) break; // a hard separator before r[i]: no joined form reaches further back
    }
    const run = this.run;
    for (let i = Math.max(0, run.length - (SKELETON_MAX - 1)); i < run.length; i++)
      if (run[i].ok || run.length - i < 3) {
        held = Math.min(held, run[i].start);
        break;
      }
    return held;
  }

  /** Adds one complete word; true when a listed form now ends here. (Hot: allocation-light on purpose.) */
  word(raw, start, end) {
    const leetChars = this.leet && HAS_LEET.test(raw);
    const w = leetChars ? leetWord(raw) : normWord(raw);
    if (!w) return false;
    const m = this.m;
    const r = this.recent;
    const prev = r.length ? r[r.length - 1] : undefined;
    let soft = false;
    let gap = "";
    if (prev) {
      gap = this.text.slice(prev.end, start);
      soft = gap === " " || SOFT_GAP.test(gap);
    }
    const hashed = !this.leet || (leetChars && HAS_LETTER.test(raw));
    // flags: NAME/START of the word itself, computed once (-1: not yet); sg: the gap before it is a single - . _
    r.push({ w, start, end, hashed, soft, sg: SHORT_JOIN_GAP.test(gap), flags: -1 });
    if (r.length > JOIN_MAX_WORDS) r.shift();
    const n = r.length;
    const cur = r[n - 1];
    if (hashed) {
      cur.flags = m.wordFlags(w);
      if (cur.flags & NAME) return this.hit(start, end);
      // A name with something glued on: trailing digits ("ZebraCorp2024") or a plural s ("ZebraCorps").
      const glued = TRAILING_DIGITS.exec(w)?.[1] ?? (w.length >= 6 && PLURAL.test(w) ? w.slice(0, -1) : null);
      if (glued && m.wordFlags(glued) & NAME) return this.hit(start, end);
    }
    // 2- and 3-word spaced forms
    for (let k = 2; k <= Math.min(n, MAX_WORDS); k++) {
      const first = r[n - k];
      let any = first.hashed;
      for (let i = n - k + 1; i < n; i++) if (r[i].hashed) any = true;
      if (!any) continue;
      if (first.flags < 0) first.flags = m.wordFlags(first.w);
      if (first.flags & START) {
        let spaced = first.w;
        for (let i = n - k + 1; i < n; i++) spaced += " " + r[i].w;
        if (m.isName(spaced)) return this.hit(first.start, end);
      }
    }
    // Joined forms: up to JOIN_MAX_WORDS fragments across soft separators, assembled backwards from this word.
    let joined = w;
    let any = hashed;
    // "short": every fragment has 1-2 letters and every gap inside the join is a single - . _ (for 4-letter forms)
    let short = w.length <= 2;
    for (let i = n - 2; i >= 0; i--) {
      if (!r[i + 1].soft) break;
      short = short && r[i + 1].sg && r[i].w.length <= 2;
      joined = r[i].w + joined;
      if (r[i].hashed) any = true;
      if (!any || !(joined.length >= JOINED_MIN || (joined.length === 4 && short))) continue;
      if (m.headOk(joined) && m.isName(joined)) return this.hit(r[i].start, end);
    }

    if (this.leet) return false;
    // Spelled-out letters: a run of single-character words (digits read as leetspeak) is checked as one word.
    const single = w.length === 1 || (w.length === 2 && w.charCodeAt(0) >= 0xd800 && w.charCodeAt(0) <= 0xdbff);
    if (!single) {
      this.run.length = 0;
      return false;
    }
    const run = this.run;
    run.push({ c: LEET.get(w) ?? w, start, end, ok: false });
    const j = run.length - 1;
    if (j >= 2) run[j - 2].ok = m.headOk(run[j - 2].c + run[j - 1].c + run[j].c);
    for (let i = Math.max(0, j - SKELETON_MAX + 1); i <= j - (SKELETON_MIN - 1); i++) {
      if (!run[i].ok) continue;
      let s = "";
      for (let x = i; x <= j; x++) s += run[x].c;
      if (m.isName(s)) return this.hit(run[i].start, end);
    }
    return false;
  }

  hit(start, end) {
    this.span = { start, end };
    return true;
  }
}

/** base64 / base64url runs; one of 6+ characters (4+ bytes) that decodes to readable text is checked as text. */
const B64_RUN = /[A-Za-z0-9+/_-]+=*/g;
/** Prose words are all lower case; base64 of text almost never is (decoding is cheap, so the filter is loose). */
const B64_LIKELY = /[^a-z]/;
const utf8 = new TextDecoder("utf-8");

/**
 * True when `bin` (one byte per character, as atob returns) is well-formed UTF-8 without control characters. A plain
 * loop instead of a fatal TextDecoder: almost every run tried is not base64 at all, and exceptions are slow.
 */
function readableUtf8(bin) {
  for (let i = 0; i < bin.length; ) {
    const b = bin.charCodeAt(i);
    if (b < 0x80) {
      if ((b < 0x20 && (b < 9 || b > 13)) || b === 0x7f) return false;
      i++;
      continue;
    }
    const n = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : 0;
    if (!n || i + n >= bin.length) return false; // invalid lead byte, or a sequence cut off at the end
    for (let k = 1; k <= n; k++) if ((bin.charCodeAt(i + k) & 0xc0) !== 0x80) return false;
    i += n + 1;
  }
  return true;
}

/** The text a base64 run decodes to, when it is valid UTF-8 and mostly readable; else null. */
export function decodeBase64Text(run) {
  let t = run.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  if (t.length < 6 || /[^A-Za-z0-9+/]/.test(t)) return null;
  if (t.length % 4 === 1) t = t.slice(0, -1);
  while (t.length % 4) t += "=";
  let bin;
  try {
    bin = atob(t);
  } catch {
    return null;
  }
  if (!readableUtf8(bin)) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = utf8.decode(bytes);
  if (/[\u0080-\u009f�]/u.test(text)) return null;
  // Mostly letters, digits and spaces (JSON or punctuation around a name is fine); random bytes rarely are.
  const readable = text.match(/[\p{L}\p{N}\s]/gu)?.length ?? 0;
  return readable >= text.length * 0.5 ? text : null;
}

/**
 * Incremental scan of a growing answer: `push` returns how much of the text is safe to show (everything before any
 * word, run of spelled-out letters or base64 run that could still become a listed form), or -1 once one appeared.
 */
export class Scanner {
  constructor(matcher, base64 = true) {
    this.m = matcher;
    this.base64 = base64;
    this.text = "";
    this.tripped = false;
    this.span = null;
    this.plain = new WordStream(matcher, false);
    this.leet = new WordStream(matcher, true);
    /** Text before this index has been checked for base64 runs. */
    this.b64 = 0;
  }

  get hit() {
    return this.tripped;
  }

  /** Adds text; returns the safe end index into the whole text, or -1 once a listed form has appeared. */
  push(chunk, final = false) {
    if (this.tripped) return -1;
    this.text += chunk;
    const m = this.m;
    if (m.blockAll) return this.trip({ start: 0, end: this.text.length });
    if (!m.size) return this.text.length;
    const text = this.text;
    const a = this.plain.push(text, final);
    if (a < 0) return this.trip(this.plain.span);
    const b = this.leet.push(text, final);
    if (b < 0) return this.trip(this.leet.span);
    let held = Math.min(a, b);
    if (this.base64) {
      B64_RUN.lastIndex = this.b64;
      for (let r = B64_RUN.exec(text); r; r = B64_RUN.exec(text)) {
        const end = r.index + r[0].length;
        if (end === text.length && !final) {
          held = Math.min(held, r.index);
          break;
        }
        this.b64 = end;
        if (r[0].length < 6 || !B64_LIKELY.test(r[0])) continue;
        const decoded = decodeBase64Text(r[0]);
        if (decoded && m.mentions(decoded, false)) return this.trip({ start: r.index, end });
        // A run glued to an identifier ("id_" + base64): also try what follows the last _ or -.
        const cut = Math.max(r[0].lastIndexOf("_"), r[0].lastIndexOf("-"));
        const tail = cut >= 0 ? decodeBase64Text(r[0].slice(cut + 1)) : null;
        if (tail && m.mentions(tail, false)) return this.trip({ start: r.index, end });
      }
    }
    if (final) return text.length;
    // Never split a surrogate pair: a chunk may end inside an astral letter (𝐳, 🅩) that starts the next word.
    const c = held > 0 ? text.charCodeAt(held - 1) : 0;
    return c >= 0xd800 && c <= 0xdbff ? held - 1 : held;
  }

  trip(span) {
    this.tripped = true;
    this.span = span;
    return -1;
  }
}

/**
 * Compiles the Unicode regexes and warms the hashing and scanning code once, so the first visitor's request doesn't
 * pay for it (the Worker calls this at isolate start, outside any request's CPU budget).
 */
export function warmUp(matcher) {
  normWord("Zébrа ⓩ 🅩 هَيْئَة");
  leetWord("z3br@");
  decodeBase64Text("emVicmFjb3Jw");
  matcher.mentions("Warm-up: Zébrа Corp, z-e-b-r-a, هـيـئـة الزرافات, 𝐳𝐞𝐛, z3br4, emVicmFjb3Jw, ZebraCorps2024.");
}
