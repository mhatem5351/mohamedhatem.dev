/**
 * Test helpers for the confidentiality guard. Tests never see the real names or the real key: they hash synthetic
 * placeholder names with a fixed test key, exactly as worker/scripts/confidential-hashes.mjs hashes the real list.
 */
import { Hasher, hashForms, Matcher, parseKey, phraseForms } from "../src/chat/confidential-core.mjs";
import { ConfidentialMatcher } from "../src/chat/confidential";

/** Fixed test key (64 hex characters). Never the production key. */
export const TEST_KEY = "7e57".repeat(16);

/** Synthetic placeholder names used across the guard tests. */
export const PLACEHOLDERS = ["zebracorp", "ministry of zebras", "هيئة الزرافات"] as const;

/** Keyed lists for `phrases`, as the generator would write them. */
export function testLists(phrases: readonly string[], key = TEST_KEY) {
  const hasher = new Hasher(parseKey(key));
  const names: string[] = [];
  const starts: string[] = [];
  const prefixes: string[] = [];
  for (const p of phrases) {
    const forms = phraseForms(p);
    if (!forms) throw new Error(`placeholder phrase too long: ${p}`);
    const h = hashForms(hasher, forms);
    names.push(...h.names);
    starts.push(...h.starts);
    prefixes.push(...h.prefixes);
  }
  return { hasher, names, starts, prefixes };
}

/** A keyed matcher for synthetic placeholder names (defaults to {@link PLACEHOLDERS}). */
export function testMatcher(...phrases: string[]): ConfidentialMatcher {
  return new ConfidentialMatcher(undefined, new Matcher(testLists(phrases.length ? phrases : [...PLACEHOLDERS])));
}
