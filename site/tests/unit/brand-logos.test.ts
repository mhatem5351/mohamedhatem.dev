import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import brand from "~/assets/logos/brand/brand.json";

const SITE = (p: string) => fileURLToPath(new URL(`../../src/assets/logos/${p}`, import.meta.url));
const SOURCES = readFileSync(fileURLToPath(new URL("../../../design/assets/logos/SOURCES.md", import.meta.url)), "utf8");
type File = { file: string; aspect: number; height: number; width: number };
const logos = Object.entries(brand.logos as Record<string, { name: string; symbolOnly: boolean; files: { light: File; dark: File } }>);

describe('"Shipped at" logos (design/assets/logos/brand)', () => {
  it("lists the six employers in order, each with a file per theme that exists", () => {
    expect(logos.map(([k]) => k)).toEqual(["globant", "wakeb", "arabsstock", "empoweromics", "tabaqat", "mdp"]);
    for (const [key, e] of logos)
      for (const theme of ["light", "dark"] as const) {
        const f = e.files[theme];
        expect(existsSync(SITE(`brand/${f.file}`)), `${key} ${theme}: ${f.file}`).toBe(true);
        expect(f.file.startsWith(key), f.file).toBe(true);
      }
  });

  it("is optically balanced: equal visual area within 25 %, heights a row can hold", () => {
    for (const [key, e] of logos) {
      if (e.symbolOnly) continue;
      for (const f of [e.files.light, e.files.dark]) {
        expect(f.height, key).toBeGreaterThanOrEqual(14);
        expect(f.height, key).toBeLessThanOrEqual(40);
        expect(Math.abs((f.width * f.height) / brand.area - 1), key).toBeLessThan(0.25);
      }
    }
  });

  it("documents where every file comes from (SOURCES.md)", () => {
    for (const [key, e] of logos) {
      expect(SOURCES, key).toContain(`\`${e.files.light.file}\``);
      expect(SOURCES, key).toContain(`\`${e.files.dark.file}\``);
    }
    for (const tile of ["wakeb", "empoweromics", "tabaqat", "logic-controls"]) {
      expect(SOURCES).toContain(`\`${tile}\``);
      expect(existsSync(SITE(`tiles/${tile}-160.webp`)), tile).toBe(true);
    }
  });
});
