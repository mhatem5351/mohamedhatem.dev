import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The palette (Lapis & Gold) lives in design/scripts/build-tokens.mjs; the site ships copies of its output. */
const REPO = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(REPO(p), "utf8");
const tokens = JSON.parse(read("design/tokens.json")) as { color: Record<string, [string, string]> };
const [lightBg, darkBg] = tokens.color.bg;

describe("palette (design/tokens.json → the site)", () => {
  it("the site's token stylesheets are the generated ones, unedited", () => {
    expect(read("site/src/styles/tokens.css")).toBe(read("design/tokens.css"));
    expect(read("site/src/styles/tokens.tailwind.css")).toBe(read("design/tokens.tailwind.css"));
  });

  it("passes the contrast and colour-vision check, with a dark value for every token", () => {
    const out = execFileSync(process.execPath, [REPO("design/scripts/check-contrast.mjs"), REPO("site/src/styles/tokens.css"), "--json"], { encoding: "utf8" });
    const result = JSON.parse(out) as { failures: number; drift: string[]; total: number; vision: { pass: boolean }[] };
    expect(result.drift).toEqual([]);
    expect(result.failures).toBe(0);
    expect(result.total).toBeGreaterThan(250);
    expect(result.vision.length).toBe(16);
  });

  it("the browser chrome follows the page: theme-color defaults and the web manifest", () => {
    expect(read("site/src/components/Head.astro")).toContain(`themeColor = { light: "${lightBg}", dark: "${darkBg}" }`);
    const [cvLight, cvDark] = tokens.color["bg-subtle"];
    expect(read("site/src/layouts/Document.astro")).toContain(`themeColor={{ light: "${cvLight}", dark: "${cvDark}" }}`);
    const manifest = JSON.parse(read("site/public/site.webmanifest")) as { theme_color: string; background_color: string };
    expect(manifest.theme_color).toBe(darkBg);
    expect(manifest.background_color).toBe(darkBg);
  });
});
