import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The palette (Lapis & Gold) lives in design/scripts/build-tokens.mjs; the site ships copies of its output. */
const REPO = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(REPO(p), "utf8");
const tokens = JSON.parse(read("design/tokens.json")) as {
  color: Record<string, [string, string]>;
  text: Record<string, [string, string, string, string]>;
};
const [lightBg, darkBg] = tokens.color.bg!;

describe("palette (design/tokens.json → the site)", () => {
  it("the site's token stylesheets are the generated ones, unedited", () => {
    expect(read("site/src/styles/tokens.css")).toBe(read("design/tokens.css"));
    expect(read("site/src/styles/tokens.tailwind.css")).toBe(read("design/tokens.tailwind.css"));
  });

  it("passes the contrast and colour-vision check, with a dark value for every token", () => {
    const out = execFileSync(process.execPath, [REPO("design/scripts/check-contrast.mjs"), REPO("site/src/styles/tokens.css"), "--json"], { encoding: "utf8" });
    type Row = { theme: string; fg: string; bg: string; min: number; pass: boolean; small?: boolean; pending?: boolean };
    const result = JSON.parse(out) as { failures: number; drift: string[]; total: number; rows: Row[]; vision: { pass: boolean }[] };
    expect(result.drift).toEqual([]);
    expect(result.failures).toBe(0);
    expect(result.total).toBeGreaterThan(250);
    expect(result.vision.length).toBe(16);
    // the small-text rule (<= 12 px: 6:1 on every surface, both themes) is in force, starting with the meta colour
    const small = result.rows.filter((r) => r.small && !r.pending);
    expect(small.length).toBeGreaterThan(80);
    for (const theme of ["light", "dark"])
      for (const bg of ["bg", "bg-subtle", "surface", "surface-2"])
        expect(small.find((r) => r.theme === theme && r.fg === "muted" && r.bg === bg), `${theme} muted on ${bg}`).toMatchObject({ min: 6, pass: true });
  });

  it("keeps every type step at 12 px or more at every width (the phone floor)", () => {
    for (const [name, [size]] of Object.entries(tokens.text)) {
      const min = parseFloat(size.startsWith("clamp(") ? size.slice("clamp(".length) : size);
      expect(min, `--text-${name}`).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("the browser chrome follows the page: theme-color defaults and the web manifests (EN and AR)", () => {
    expect(read("site/src/components/Head.astro")).toContain(`themeColor = { light: "${lightBg}", dark: "${darkBg}" }`);
    const [cvLight, cvDark] = tokens.color["bg-subtle"]!;
    expect(read("site/src/layouts/Document.astro")).toContain(`themeColor={{ light: "${cvLight}", dark: "${cvDark}" }}`);
    for (const file of ["site/public/site.webmanifest", "site/public/ar.webmanifest"]) {
      const manifest = JSON.parse(read(file)) as { theme_color: string; background_color: string };
      expect(manifest.theme_color, file).toBe(darkBg);
      expect(manifest.background_color, file).toBe(darkBg);
    }
  });

  it("the shipped web manifests are exactly what design/scripts/brand/manifest.mjs builds from the tokens and content/", async () => {
    const { MANIFESTS, manifestText, webManifest } = await import("../../../design/scripts/brand/manifest.mjs");
    const { profile } = await import("@content/profile.ts");
    const { format, getMessages } = await import("@content/i18n/index.ts");
    for (const locale of ["en", "ar"] as const) {
      const file = `site/public/${MANIFESTS[locale]}`;
      const built = manifestText(webManifest(locale, { profile, messages: getMessages(locale), format, tokens }));
      expect(read(file), `${file} is stale: run node design/scripts/brand/manifest.mjs`).toBe(built);
      expect(read(`design/assets/brand/${MANIFESTS[locale]}`)).toBe(built);
    }
  });
});
