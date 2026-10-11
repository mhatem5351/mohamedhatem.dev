/** Types for confidential-core.mjs (the shared name check; see that file's header). */

export declare class Hasher {
  /** HMAC-SHA-256 with `key`, or plain SHA-256 when null (legacy unkeyed lists and tests only). */
  constructor(key: Uint8Array | null);
  readonly keyed: boolean;
  /** Digest of the UTF-8 bytes of `text` as eight 32-bit words (shared buffer, overwritten by the next call). */
  digest(text: string): Int32Array;
  /** Lowercase hex digest of `text`. */
  hex(text: string): string;
}

/** Hex SHA-256 of the UTF-8 bytes of `text` (unkeyed). */
export declare function sha256Hex(text: string): string;

export declare const KEY_ENV: "CONFIDENTIAL_HMAC_KEY";
export declare const SCHEME: string;
/** The 32-byte key from its 64-hex-character form; null when missing or malformed. */
export declare function parseKey(value: unknown): Uint8Array | null;
/** Public fingerprint of a key (first 16 hex characters of the HMAC of a fixed string). */
export declare function keyIdOf(hasher: Hasher): string;

export declare function foldArabic(word: string): string;
export declare function normWord(raw: string): string;
export declare function normWords(text: string): string[];
export declare function leetWord(raw: string): string;

export declare const SKELETON_MIN: number;
export declare const SKELETON_MAX: number;
export declare const MAX_WORDS: number;
export declare const MAX_JOINED_WORDS: number;
export declare const JOINED_MIN: number;
export declare const JOIN_MAX_WORDS: number;

export interface PhraseForms {
  /** The phrase's normalised words, space-joined. */
  base: string;
  names: Set<string>;
  starts: Set<string>;
  prefixes: Set<string>;
}
export declare function phraseForms(phrase: string): PhraseForms | null;
export declare function hashForms(hasher: Hasher, forms: Pick<PhraseForms, "names" | "starts" | "prefixes">): { names: string[]; starts: string[]; prefixes: string[] };

export interface MatcherOptions {
  hasher?: Hasher;
  names?: Iterable<string>;
  starts?: Iterable<string> | null;
  prefixes?: Iterable<string> | null;
  blockAll?: boolean;
  /** Distinct words remembered per matcher (default 4096). */
  cacheSize?: number;
}
export interface Span {
  start: number;
  end: number;
}

export declare class Matcher {
  constructor(options?: MatcherOptions);
  readonly blockAll: boolean;
  readonly size: number;
  mentions(text: string, base64?: boolean): boolean;
  find(text: string): Span | null;
}

export declare class Scanner {
  constructor(matcher: Matcher, base64?: boolean);
  readonly hit: boolean;
  readonly span: Span | null;
  /** Adds text; returns the safe end index into the whole text, or -1 once a listed form has appeared. */
  push(chunk: string, final?: boolean): number;
}

export declare function decodeBase64Text(run: string): string | null;

/** Compiles the Unicode regexes and warms the hashing and scanning code (call once at isolate start). */
export declare function warmUp(matcher: Matcher): void;
