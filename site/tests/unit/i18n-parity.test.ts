/**
 * Every i18n key exists in both languages, with the same kind of value and the same {placeholders}.
 * (content/i18n/ar.ts is typed as Messages, so the compiler already rejects a missing key; this also catches
 * placeholder drift, empty strings and Eastern Arabic digits at test time.)
 */
import { describe, expect, it } from "vitest";
import { en } from "@content/i18n/en.ts";
import { ar } from "@content/i18n/ar.ts";

type Tree = { [k: string]: unknown };
const PLURAL_EXTRA = new Set(["zero", "two", "few", "many"]);

function flatten(obj: Tree, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Tree, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" && item ? flatten(item as Tree, `${key}.${i}`, out) : (out[`${key}.${i}`] = item)));
    else out[key] = v;
  }
  return out;
}

const fe = flatten(en as unknown as Tree);
const fa = flatten(ar as unknown as Tree);
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
/** For plural objects, Arabic adds categories; compare against English "other". */
const enValue = (key: string) => (key in fe ? fe[key] : fe[key.replace(/\.(zero|two|few|many)$/, ".other")]);

describe("i18n parity (content/i18n)", () => {
  it("has every English key in Arabic", () => {
    const missing = Object.keys(fe).filter((k) => !(k in fa));
    expect(missing).toEqual([]);
  });

  it("has no Arabic key that English lacks (except plural categories)", () => {
    const extra = Object.keys(fa).filter((k) => !(k in fe) && !PLURAL_EXTRA.has(k.split(".").pop()!));
    expect(extra).toEqual([]);
  });

  it("uses the same {placeholders} in both languages", () => {
    const drift: string[] = [];
    for (const [k, v] of Object.entries(fa)) {
      const e = enValue(k);
      if (typeof v !== "string" || typeof e !== "string") continue;
      // Plural forms may omit {count} when the word itself carries the number ("سنة", "سنتان").
      const strip = (list: string[]) => (PLURAL_EXTRA.has(k.split(".").pop()!) || /\.(one|other)$/.test(k) ? list.filter((p) => p !== "count") : list);
      if (strip(placeholders(v)).join() !== strip(placeholders(e)).join()) drift.push(`${k}: en ${placeholders(e)} / ar ${placeholders(v)}`);
    }
    expect(drift).toEqual([]);
  });

  it("has no empty strings (placeholders excepted) and Western digits only in Arabic", () => {
    const empty = Object.entries({ ...fe, ...Object.fromEntries(Object.entries(fa).map(([k, v]) => [`ar:${k}`, v])) })
      .filter(([k, v]) => v === "" && !k.endsWith(".placeholder"))
      .map(([k]) => k);
    expect(empty).toEqual([]);
    const eastern = Object.entries(fa).filter(([, v]) => typeof v === "string" && /[٠-٩۰-۹]/.test(v)).map(([k]) => k);
    expect(eastern).toEqual([]);
  });

  it("keeps the same value types (string vs list vs object)", () => {
    const mismatched = Object.keys(fe).filter((k) => k in fa && typeof fe[k] !== typeof fa[k]);
    expect(mismatched).toEqual([]);
  });
});
