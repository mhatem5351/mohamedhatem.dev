/// <reference types="node" />
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Hasher, keyIdOf, parseKey, SCHEME } from "../src/chat/confidential-core.mjs";
import { loadConfidential, redactConfidential } from "../src/chat/confidential-node.mjs";
import { PLACEHOLDERS, TEST_KEY, testLists } from "./confidential-fixtures";

/*
 * The Node side (check-content, the git hooks, CI's check-tree, the site's build check, the chat scripts) must fail
 * closed: no list, a weakened list, an unkeyed list, or a missing, malformed or wrong key is an error, never a check
 * that silently passes. A temporary repository root holds a list made from placeholder names with the test key.
 */
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo(list: Record<string, unknown> | null) {
  const root = mkdtempSync(join(tmpdir(), "confidential-node-"));
  dirs.push(root);
  mkdirSync(join(root, "worker/src/chat"), { recursive: true });
  if (list) writeFileSync(join(root, "worker/src/chat/confidential-hashes.json"), JSON.stringify(list));
  return root;
}

const extra = ["placeholder one", "placeholder two", "placeholder three", "placeholder four"];
const lists = testLists([...PLACEHOLDERS, ...extra]);
const canonical = testLists([...PLACEHOLDERS, ...extra]).names.slice(0, 7);
const good = {
  scheme: SCHEME,
  keyId: keyIdOf(new Hasher(parseKey(TEST_KEY))),
  canonical,
  variants: lists.names.filter((h) => !canonical.includes(h)),
  starts: lists.starts,
  prefixes: lists.prefixes,
};
const withKey = { CONFIDENTIAL_HMAC_KEY: TEST_KEY };

describe("loadConfidential (fail closed)", () => {
  it("works with the list's key: matcher, key detection, redaction", () => {
    const conf = loadConfidential({ root: repo(good), env: withKey });
    expect(conf.error).toBeUndefined();
    expect(conf.matcher!.mentions("Built for Z-E-B-R-A-C-O-R-P.")).toBe(true);
    expect(conf.containsKey!(`KEY=${TEST_KEY.toUpperCase()}`)).toBe(true);
    expect(conf.containsKey!("nothing here")).toBe(false);
    const redacted = redactConfidential("Built for ZebraCorp, the Ministry of Zebras and z3br4c0rp.", conf.matcher);
    expect(redacted).toBe("Built for [redacted], the [redacted] and [redacted].");
  });

  it("a missing key is an error, or 'skipped' only when optional", () => {
    expect(loadConfidential({ root: repo(good), env: {} }).error).toMatch(/CONFIDENTIAL_HMAC_KEY is not set/);
    const optional = loadConfidential({ root: repo(good), env: {}, optional: true });
    expect(optional.matcher).toBeNull();
    expect(optional.skipped).toMatch(/not set/);
  });

  it("a malformed or wrong key is an error even when optional", () => {
    expect(loadConfidential({ root: repo(good), env: { CONFIDENTIAL_HMAC_KEY: "abc" }, optional: true }).error).toMatch(/malformed/);
    expect(loadConfidential({ root: repo(good), env: { CONFIDENTIAL_HMAC_KEY: "ab".repeat(32) }, optional: true }).error).toMatch(/not the key/);
  });

  it("the key can come from the repository's .env", () => {
    const root = repo(good);
    writeFileSync(join(root, ".env"), `OTHER=1\nCONFIDENTIAL_HMAC_KEY="${TEST_KEY}"\n`);
    expect(loadConfidential({ root, env: {} }).matcher?.mentions("zebracorp")).toBe(true);
  });

  it("a missing, unkeyed, weakened or malformed list is an error", () => {
    expect(loadConfidential({ root: repo(null), env: withKey }).error).toMatch(/can't be read/);
    expect(loadConfidential({ root: repo({ ...good, scheme: undefined }), env: withKey }).error).toMatch(/scheme/);
    expect(loadConfidential({ root: repo({ ...good, canonical: canonical.slice(0, 6) }), env: withKey }).error).toMatch(/expected at least 7/);
    expect(loadConfidential({ root: repo({ ...good, prefixes: [] }), env: withKey }).error).toMatch(/missing its variants, starts or prefixes/);
    expect(loadConfidential({ root: repo({ ...good, variants: [...good.variants, "not-a-digest"] }), env: withKey }).error).toMatch(/isn't a 64-hex/);
  });
});
