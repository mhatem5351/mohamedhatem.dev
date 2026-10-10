/**
 * Confidentiality guard for the one unnamed client (the Saudi government client of the bilingual assistant at Wakeb
 * Data). Its names must never reach a visitor, not even when the visitor supplies them and the model repeats them.
 *
 * The names are not in this repository (it is public): only SHA-256 hashes of their 1-3 word forms are, in
 * confidential-hashes.json. `canonical` is the same list content/scripts/check-content.mjs uses to keep the names out
 * of every tracked file; `variants` adds Arabic forms with a one-letter prefix (و ف ب ل ك …), Arabic letter-folded
 * spellings and a few extra phrasings, generated from a gitignored names file by worker/scripts/confidential-hashes.mjs.
 *
 * Matching: the text is normalised exactly like check-content.mjs (NFKC, lower case, combining marks removed, split on
 * anything that isn't a letter or digit), then every 1-, 2- and 3-word sequence is hashed and looked up, once as
 * written and once with Arabic letters folded (أ إ آ ٱ → ا, ة → ه, ى → ي, no tatweel).
 *
 * Streaming ({@link ConfidentialScanner}): a name can span chunks, so the last complete words and any unfinished word
 * are held back (at most 3 words) until the next chunk shows they can't start a name.
 */
import HASHES from "./confidential-hashes.json";

/* ------------------------------------------------------------------ SHA-256 (synchronous; Web Crypto is async) */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);
const H = new Uint32Array(8);
const enc = new TextEncoder();
/** Reused for every short input (1-3 words); longer inputs get their own buffer. */
const SCRATCH = new Uint8Array(256);
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

/** Hex SHA-256 of the UTF-8 bytes of `text`. Allocation-free for inputs up to 247 bytes (every 1-3 word phrase). */
export function sha256Hex(text: string): string {
  let msg = SCRATCH;
  let len = enc.encodeInto(text, SCRATCH).written;
  if (text.length * 3 > SCRATCH.length - 9) {
    const bytes = enc.encode(text);
    len = bytes.length;
    msg = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
    msg.set(bytes);
  }
  const total = Math.ceil((len + 9) / 64) * 64;
  msg.fill(0, len, total);
  msg[len] = 0x80;
  const bits = len * 8;
  msg[total - 5] = (bits / 0x100000000) & 0xff;
  msg[total - 4] = bits >>> 24;
  msg[total - 3] = (bits >>> 16) & 0xff;
  msg[total - 2] = (bits >>> 8) & 0xff;
  msg[total - 1] = bits & 0xff;
  H[0] = 0x6a09e667; H[1] = 0xbb67ae85; H[2] = 0x3c6ef372; H[3] = 0xa54ff53a;
  H[4] = 0x510e527f; H[5] = 0x9b05688c; H[6] = 0x1f83d9ab; H[7] = 0x5be0cd19;
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      W[i] = (msg[j]! << 24) | (msg[j + 1]! << 16) | (msg[j + 2]! << 8) | msg[j + 3]!;
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15]!;
      const b = W[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0;
    }
    let a: number = H[0]!, b: number = H[1]!, c: number = H[2]!, d: number = H[3]!;
    let e: number = H[4]!, f: number = H[5]!, g: number = H[6]!, h: number = H[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i]! + W[i]!) | 0;
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
    H[0] = H[0]! + a; H[1] = H[1]! + b; H[2] = H[2]! + c; H[3] = H[3]! + d;
    H[4] = H[4]! + e; H[5] = H[5]! + f; H[6] = H[6]! + g; H[7] = H[7]! + h;
  }
  let hex = "";
  for (let i = 0; i < 8; i++) {
    const v = H[i]!;
    hex += HEX[v >>> 24]! + HEX[(v >>> 16) & 0xff]! + HEX[(v >>> 8) & 0xff]! + HEX[v & 0xff]!;
  }
  return hex;
}

/* ------------------------------------------------------------------ normalisation */

/** check-content.mjs's word split: NFKC, lower case, combining marks removed, split on non-letters/digits. */
export function normWords(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Arabic spelling variants folded together (أ إ آ ٱ → ا, ة → ه, ى → ي, tatweel removed). */
export function foldArabic(word: string): string {
  return word.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "");
}

/* ------------------------------------------------------------------ matcher */

/** The shipped list: check-content's canonical hashes plus the generated variants. */
export const CONFIDENTIAL_SHA256: readonly string[] = [...HASHES.canonical, ...HASHES.variants];

export class ConfidentialMatcher {
  private readonly hashes: ReadonlySet<string>;

  /** `hashes`: lowercase hex SHA-256 of normalised 1-3 word phrases (tests inject their own). */
  constructor(hashes: Iterable<string> = CONFIDENTIAL_SHA256) {
    this.hashes = new Set([...hashes].map((h) => h.toLowerCase()));
  }

  get size(): number {
    return this.hashes.size;
  }

  /** True when the last 1-3 words of `ws` (normalised words, oldest first) form a listed phrase. */
  endsWithName(ws: readonly string[]): boolean {
    if (!this.hashes.size) return false;
    const n = ws.length;
    for (let k = 1; k <= 3 && k <= n; k++) {
      const gram = ws.slice(n - k);
      const plain = gram.join(" ");
      if (this.hashes.has(sha256Hex(plain))) return true;
      const folded = gram.map(foldArabic).join(" ");
      if (folded !== plain && this.hashes.has(sha256Hex(folded))) return true;
    }
    return false;
  }

  /** True when any 1-3 word sequence of `text` is a listed phrase. */
  mentions(text: string): boolean {
    if (!this.hashes.size || !text) return false;
    const ws = normWords(text);
    for (let i = 1; i <= ws.length; i++) if (this.endsWithName(ws.slice(Math.max(0, i - 3), i))) return true;
    return false;
  }
}

/* ------------------------------------------------------------------ streaming */

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

/**
 * Incremental scan of a growing answer. Words are checked as they complete (a word completes when a non-word
 * character follows it, or at the end of the answer); `push` returns how much of the text is safe to show: everything
 * before the last two complete words and any unfinished word, because those could still begin a listed phrase.
 */
export class ConfidentialScanner {
  private text = "";
  /** Text before this index has been split into words. */
  private pos = 0;
  /** The last (up to 3) normalised words, with the text index of the raw word each came from. */
  private recent: { w: string; start: number }[] = [];
  private tripped = false;

  constructor(private readonly matcher: ConfidentialMatcher) {}

  get hit(): boolean {
    return this.tripped;
  }

  /** Adds text; returns the safe end index into the whole text, or -1 once a listed phrase has appeared. */
  push(chunk: string, final = false): number {
    if (this.tripped) return -1;
    this.text += chunk;
    if (!this.matcher.size) return this.text.length;
    WORD.lastIndex = this.pos;
    let partialStart = -1;
    for (let m = WORD.exec(this.text); m; m = WORD.exec(this.text)) {
      const end = m.index + m[0].length;
      if (end === this.text.length && !final) {
        partialStart = m.index; // may continue in the next chunk
        break;
      }
      this.pos = end;
      for (const w of normWords(m[0])) {
        this.recent.push({ w, start: m.index });
        if (this.recent.length > 3) this.recent.shift();
        if (this.matcher.endsWithName(this.recent.map((r) => r.w))) {
          this.tripped = true;
          return -1;
        }
      }
    }
    if (final) return this.text.length;
    const held = [this.recent.at(-2)?.start, this.recent.at(-1)?.start, partialStart >= 0 ? partialStart : undefined].filter(
      (i): i is number => i !== undefined,
    );
    return held.length ? Math.min(...held) : this.text.length;
  }
}

/* ------------------------------------------------------------------ the reply that replaces a tripped answer */

/** Fixed, polite answer shown instead of anything that would name the client. Neither confirms nor denies a name. */
export const CONFIDENTIAL_REPLY: Record<"en" | "ar", string> = {
  en:
    "For confidentiality, that client is described only as **a Saudi government client**, so I can't confirm or deny any name. " +
    "What is public: at Wakeb Data, Hatem built a bilingual (Arabic/English) enterprise assistant for it, with LLM evaluation and observability monitoring for response quality.",
  ar:
    "حفاظًا على السرية، يُشار إلى هذا العميل فقط بأنه **جهة حكومية سعودية**، لذلك لا يمكنني تأكيد أي اسم أو نفيه. " +
    "المعلَن هو أن حاتم بنى لهذه الجهة في Wakeb Data مساعدًا مؤسسيًا ثنائي اللغة (العربية والإنجليزية)، مع تقييم النماذج اللغوية ومراقبة جودة الإجابات.",
};

/** Follow-up chips sent with {@link CONFIDENTIAL_REPLY} (both answerable from the knowledge base). */
export const CONFIDENTIAL_FOLLOWUPS: Record<"en" | "ar", string[]> = {
  en: ["What else did he build at Wakeb Data?", "How does he evaluate LLM answers?"],
  ar: ["ماذا بنى أيضًا في Wakeb Data؟", "كيف يقيّم إجابات النماذج اللغوية؟"],
};
