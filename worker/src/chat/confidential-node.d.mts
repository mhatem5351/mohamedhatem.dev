/** Types for confidential-node.mjs (the Node side of the unnamed-client check; see that file's header). */
import type { Hasher, Matcher } from "./confidential-core.mjs";

export declare const KEY_ENV: "CONFIDENTIAL_HMAC_KEY";
export declare const ROOT: string;
export declare const HASHES_PATH: string;
export declare const MIN_CANONICAL: number;
export declare const BINARY: RegExp;

type Env = Record<string, string | undefined>;

export declare function readKeyText(opts?: { root?: string; env?: Env }): string | null;
export declare function readKey(opts?: { root?: string; env?: Env }): { missing?: true; error?: string; hasher?: Hasher; keyId?: string; hex?: string };

export interface Confidential {
  matcher: Matcher | null;
  /** Why the check can't run (fail closed). */
  error?: string;
  /** The key is missing and `optional` was set (CI without the secret). */
  skipped?: string;
  counts?: { canonical: number; variants: number };
  /** True when `text` contains the key itself. */
  containsKey?: (text: string) => boolean;
}
export declare function loadConfidential(opts?: { root?: string; env?: Env; optional?: boolean; cacheSize?: number }): Confidential;
export declare function redactConfidential(text: string, matcher: Matcher | null, mark?: string): string;
export declare function scanTree(conf: Confidential, opts?: { root?: string }): { files: number; problems: string[] };
