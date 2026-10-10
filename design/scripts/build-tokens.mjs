#!/usr/bin/env node
// Single source of truth for the mohamedhatem.dev design tokens.
// Generates:
//   design/tokens.css           plain CSS custom properties: dark is the default for every visitor (and without JS);
//                               the light values apply only once the visitor picks light (html[data-theme="light"])
//   design/tokens.tailwind.css  the same tokens wrapped for Tailwind CSS 4 (`@theme` carries the light values, the
//                               default dark overrides sit outside it)
//   design/tokens.json          machine-readable copy (used by check-contrast.mjs and the build agent)
// Run: node design/scripts/build-tokens.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------------------------
// 1. Colour. "Lapis & Gold": Pharaonic jewellery, engineered. By night (the default theme) lapis-night surfaces,
//    warm ivory ink and one gold accent; by day alabaster paper, lapis ink and lapis links (gold cannot carry a
//    light-mode button or link at AA, so the lead accent flips to lapis; gold stays for details). The category
//    colours are the jewellery's quiet partners: faience turquoise (teal), gold (saffron), carnelian (coral),
//    lapis (sky), amethyst (sage) and slate. Token names are kept from the first palette, so `teal` is turquoise and
//    `sage` is amethyst (no longer green: availability dots and "success" read turquoise).
//    Authored in OKLCH (lapis-night hue 266, gold 80-88, turquoise 192-195, carnelian 35, amethyst 318) and rounded
//    to sRGB hex. Every *text* colour below is checked against every surface it may sit on (4.5:1, and 6:1 for the
//    colours set at 12 px or less), every -fill against the page as a graphic (3:1), and the six category fills are
//    kept apart under deuteranopia and protanopia (check-contrast.mjs).
// ---------------------------------------------------------------------------------------------
export const COLOR = {
  //                      light        dark
  "bg":                ["#F7F6F3", "#080E1C"], // page (alabaster / lapis night)
  "bg-subtle":         ["#F2F0EC", "#0B1222"], // alternate section band
  "surface":           ["#FEFDFC", "#0F1728"], // cards, panels, chat
  "surface-2":         ["#F1EFEA", "#161E31"], // insets inside cards, code, neutral chips
  "surface-inverse":   ["#131D36", "#F4F0E7"], // primary button, user chat bubble, tooltips
  "line":              ["#E2DFDA", "#242C40"], // hairlines, card borders (decorative)
  "line-strong":       ["#CFCCC5", "#363F54"], // hover borders, dividers that must be seen
  "line-input":        ["#7B808D", "#6B748A"], // form-control boundaries (>= 3:1, WCAG 1.4.11)
  "ink":               ["#131D36", "#F4F0E7"], // primary text (lapis ink / warm ivory)
  "ink-2":             ["#323D55", "#CBD1DC"], // secondary text, body copy on cards
  "muted":             ["#525A6C", "#A1A9BC"], // meta text, captions, placeholders: the 12 px colour, so >= 6:1 on every
                                                // surface (light oklch(0.4675 0.031 266): lightness 0.50 -> 0.4675 for surface-2)
  "subtle":            ["#7A808E", "#7E8698"], // decorative / disabled only. Not for body text in light.
  "on-inverse":        ["#F7F6F3", "#080E1C"], // text on surface-inverse

  // lead accent: lapis by day, gold by night
  "accent":            ["#2B51AA", "#E9BB61"], // links, icons, active states (text-safe)
  "accent-strong":     ["#1C3A8B", "#F3D68F"], // hover / pressed text-accent
  "accent-solid":      ["#2348A1", "#E8B458"], // accent button background
  "accent-solid-hover":["#1A3788", "#F0CA78"],
  "on-accent":         ["#FFFFFF", "#091123"], // text on accent-solid
  "accent-fill":       ["#3E6DC8", "#E4AD4B"], // decorative strokes, monogram node, portrait ring, progress
  "accent-tint":       ["#E7F0FE", "#2F2005"], // chip / badge background
  "accent-tint-line":  ["#BCD3FE", "#4E370C"],

  // category colours: <name> = text-safe, -fill = stroke/fill (>= 3:1 on the page), -tint = chip bg, -tint-line = chip border.
  // The light text values of teal, coral, sage and slate sit a hair darker than first authored (OKLCH lightness only,
  // -0.003 to -0.014) so their 12 px chip and group labels reach 6:1 on every surface and on their own tint.
  "teal":              ["#0C6464", "#82D9D5"], // faience turquoise: agents, orchestration, current role
  "teal-fill":         ["#038586", "#5AC0BC"],
  "teal-tint":         ["#E0F4F4", "#0B2827"],
  "teal-tint-line":    ["#B3DCDC", "#184442"],
  "saffron":           ["#885716", "#E9BB61"], // gold: retrieval, data; honours
  "saffron-fill":      ["#B47D19", "#E8B458"],
  "saffron-tint":      ["#FAEDDB", "#2E2006"],
  "saffron-tint-line": ["#E8CEAA", "#4D3810"],
  "on-saffron":        ["#091123", "#091123"], // numerals on saffron-fill discs (diagram callouts, flow steps)
  "coral":             ["#9D381F", "#F3957B"], // carnelian: generation, LLM output; errors
  "coral-fill":        ["#B84D30", "#DA6C50"],
  "coral-tint":        ["#FFEAE4", "#371911"],
  "coral-tint-line":   ["#FAC4B5", "#5C2C20"],
  "sky":               ["#2B51AA", "#9EBEF8"], // lapis: evaluation, observability
  "sky-fill":          ["#2855AD", "#6591E1"],
  "sky-tint":          ["#E7F0FE", "#162339"],
  "sky-tint-line":     ["#BCD4FE", "#293B5E"],
  "sage":              ["#784488", "#E5C3EF"], // amethyst: guard, safety; bilingual; teaching
  "sage-fill":         ["#A66BB9", "#DFBCEB"],
  "sage-tint":         ["#F7EAFC", "#281F2B"],
  "sage-tint-line":    ["#E3C7EC", "#443649"],
  "slate":             ["#505A6B", "#B3BFCE"], // slate: serving, infra, tools/MCP, storage
  "slate-fill":        ["#515B6C", "#7C8795"],
  "slate-tint":        ["#EDEFF4", "#202327"],
  "slate-tint-line":   ["#CED3DC", "#373C42"],

  // status (aliases of the category colours, kept separate so they can diverge later)
  "success":           ["#0C6464", "#82D9D5"],
  "warning":           ["#885716", "#E9BB61"],
  "danger":            ["#9D381F", "#F3957B"],
  "danger-tint":       ["#FFEAE4", "#371911"],
  "info":              ["#2B51AA", "#9EBEF8"],

  // utility
  "focus":             ["#2B51AA", "#E9BB61"], // focus ring (2px solid + 2px offset)
  "focus-halo":        ["rgb(62 109 200 / 0.22)", "rgb(228 173 75 / 0.3)"],
  "selection":         ["#F0DEB3", "#274172"], // pale gold by day, lapis by night
  "scrim":             ["rgb(19 29 54 / 0.46)", "rgb(2 4 8 / 0.68)"],
  "graph-edge":        ["#CECAC2", "#384258"], // hero graph + diagrams: idle edges
  "graph-grid":        ["#DAD7D0", "#222A3C"], // dot grid
  "graph-node":        ["#FEFDFC", "#0B1222"], // node fill
  "glow-1":            ["rgb(62 109 200 / 0.1)", "rgb(58 108 206 / 0.22)"],   // lapis (behind the hero graph)
  "glow-2":            ["rgb(232 180 88 / 0.14)", "rgb(233 187 97 / 0.09)"],  // gold
  "glow-3":            ["rgb(90 192 188 / 0.06)", "rgb(90 192 188 / 0.06)"],  // turquoise
};

// ---------------------------------------------------------------------------------------------
// 2. Type. Fluid between 360px and 1440px viewports (Utopia-style clamp), except 2xs and xs, which are fixed. Caps at 1440;
//    from 1920px the root font-size steps up (see base rules) so 2560 screens stay proportional.
//    AR pages multiply text sizes by --script-scale (body) / --script-scale-display (headings).
// ---------------------------------------------------------------------------------------------
export const FONT = {
  "display": `"Space Grotesk Variable", "Space Grotesk", "Space Grotesk Fallback", ui-sans-serif, system-ui, sans-serif`,
  "sans":    `"Inter Variable", "Inter", "Inter Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  "mono":    `"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
  "arabic":  `"IBM Plex Sans Arabic", "IBM Plex Sans Arabic Fallback", "Geeza Pro", "Segoe UI", Tahoma, sans-serif`,
};

// name: [size (clamp, or fixed), line-height, letter-spacing, which script multiplier]
export const TEXT = {
  // 2xs and xs are fixed at their old desktop size: no content text under 12 px on phones (they were 11 -> 12 and 12 -> 13)
  "2xs":     ["0.75rem",                                           "1.45", "0",        "text"],
  "xs":      ["0.8125rem",                                         "1.5",  "0",        "text"],
  "sm":      ["clamp(0.875rem, 0.8542rem + 0.0926vw, 0.9375rem)",  "var(--lh-ui)",   "0", "text"],
  "base":    ["clamp(1rem, 0.9792rem + 0.0926vw, 1.0625rem)",      "var(--lh-body)", "0", "text"],
  "md":      ["clamp(1.125rem, 1.0833rem + 0.1852vw, 1.25rem)",    "var(--lh-lead)", "-0.005em", "text"],
  "lg":      ["clamp(1.25rem, 1.1667rem + 0.3704vw, 1.5rem)",      "var(--lh-snug)", "-0.012em", "display"],
  "xl":      ["clamp(1.5rem, 1.375rem + 0.5556vw, 1.875rem)",      "var(--lh-snug)", "-0.018em", "display"],
  "2xl":     ["clamp(1.875rem, 1.5833rem + 1.2963vw, 2.75rem)",    "var(--lh-tight)", "-0.025em", "display"],
  "3xl":     ["clamp(2rem, 1.5833rem + 1.8519vw, 3.25rem)",       "var(--lh-tight)", "-0.03em", "display"],
  "display": ["clamp(2.25rem, 1.6667rem + 2.5926vw, 4rem)",      "var(--lh-display)", "-0.035em", "display"],
  "mega":    ["clamp(4rem, 2.6667rem + 5.9259vw, 8rem)",           "0.95", "-0.045em", "display"],
};

// ---------------------------------------------------------------------------------------------
// 3. Space, layout, radii, elevation, motion, layers
// ---------------------------------------------------------------------------------------------
export const SCALAR = {
  // Tailwind 4 base spacing unit: p-4 = 1rem etc.
  "spacing": "0.25rem",
  // fluid layout spacing
  "space-gutter":  "clamp(1.25rem, 0.6667rem + 2.5926vw, 3rem)",     // page side padding: 20 -> 48
  "space-section": "clamp(4.5rem, 3.5rem + 4.4444vw, 7.5rem)",       // between sections: 72 -> 120
  "space-block":   "clamp(2.5rem, 1.6667rem + 3.7037vw, 5rem)",      // section header -> content: 40 -> 80
  "space-stack":   "clamp(1.5rem, 1.1667rem + 1.4815vw, 2.5rem)",    // between cards / groups: 24 -> 40
  "grid-gap":      "clamp(1rem, 0.75rem + 1.1111vw, 1.5rem)",        // 16 -> 24
  // containers
  "container-max":   "78rem",  // 1248 content
  "container-wide":  "90rem",  // 1440 bleed elements (hero art, showcase)
  "container-prose": "40rem",  // 640 long-form reading measure (~68ch Inter 17px)
  "container-narrow":"52rem",
  // radii
  "radius-xs": "0.375rem",   // 6  chips, kbd, tags
  "radius-sm": "0.5rem",     // 8  small buttons, inputs inside panels
  "radius-md": "0.75rem",    // 12 buttons, inputs, message bubbles
  "radius-lg": "1rem",       // 16 cards
  "radius-xl": "1.5rem",     // 24 panels, chat window, hero graph card
  "radius-2xl":"2rem",       // 32 large feature blocks
  "radius-full":"9999px",
  // line-heights (locale-aware; overridden for :lang(ar))
  "lh-display": "1.02",
  "lh-tight": "1.08",
  "lh-snug": "1.25",
  "lh-ui": "1.45",
  "lh-lead": "1.55",
  "lh-body": "1.65",
  // tracking
  "tracking-label": "0.08em",   // uppercase mono labels
  "tracking-scale": "1",        // multiplies every negative display tracking; 0 for Arabic (tracking breaks joining)
  // script scaling (1 for Latin)
  "script-scale": "1",
  "script-scale-display": "1",
  // motion
  "ease-out":      "cubic-bezier(0.16, 1, 0.3, 1)",      // entrances, reveals (expo-out)
  "ease-in":       "cubic-bezier(0.55, 0, 1, 0.45)",     // exits
  "ease-in-out":   "cubic-bezier(0.65, 0, 0.35, 1)",     // moves between two states (graph pulses)
  "ease-standard": "cubic-bezier(0.2, 0, 0, 1)",         // hovers, colour, small UI
  "ease-spring":   "linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 15.5%, 0.938 20.7%, 1.017 24.3%, 1.061 27.9%, 1.072 31.2%, 1.065 35.1%, 1.024 45.7%, 1.004 55%, 0.996 66%, 1)", // chat panel open
  "duration-instant": "90ms",   // press feedback
  "duration-fast": "160ms",     // hover, colour, focus
  "duration-base": "240ms",     // small enters (tooltip, chip, menu)
  "duration-slow": "380ms",     // panels, accordions, chat open
  "duration-slower": "640ms",   // section reveals, graph node arrival halo
  "duration-graph-loop": "9s",  // hero graph pulse cycle
  // layers
  "z-base": "0", "z-raised": "10", "z-sticky": "40", "z-nav": "50", "z-widget": "80", "z-overlay": "90", "z-toast": "100",
};

// shadows are colour-dependent, so themed
export const SHADOW = {
  //            light                                                                                         dark
  "shadow-xs": ["0 1px 1px rgb(19 29 54 / 0.04)",                                                           "0 1px 1px rgb(0 0 0 / 0.30)"],
  "shadow-sm": ["0 1px 2px rgb(19 29 54 / 0.05), 0 1px 3px rgb(19 29 54 / 0.04)",                          "0 1px 2px rgb(0 0 0 / 0.40), 0 1px 3px rgb(0 0 0 / 0.24)"],
  "shadow-md": ["0 6px 16px -4px rgb(19 29 54 / 0.08), 0 2px 4px -2px rgb(19 29 54 / 0.05)",               "0 8px 20px -6px rgb(0 0 0 / 0.55), 0 2px 6px -2px rgb(0 0 0 / 0.35)"],
  "shadow-lg": ["0 18px 40px -12px rgb(19 29 54 / 0.14), 0 6px 12px -6px rgb(19 29 54 / 0.06)",           "0 22px 48px -14px rgb(0 0 0 / 0.70), 0 6px 14px -6px rgb(0 0 0 / 0.40)"],
  "shadow-xl": ["0 32px 72px -18px rgb(19 29 54 / 0.24), 0 12px 24px -12px rgb(19 29 54 / 0.10)",          "0 36px 80px -18px rgb(0 0 0 / 0.80), 0 12px 28px -10px rgb(0 0 0 / 0.50)"],
  "inset-highlight": ["inset 0 1px 0 rgb(255 255 255 / 0.70)",                                              "inset 0 1px 0 rgb(255 255 255 / 0.05)"],
};

export const BREAKPOINT = { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem", "3xl": "120rem" };

// Arabic (RTL) overrides, applied with :lang(ar)
export const ARABIC = {
  "font-sans": `"IBM Plex Sans Arabic", "Inter Variable", "Inter", "IBM Plex Sans Arabic Fallback", "Geeza Pro", Tahoma, sans-serif`,
  "font-display": `"IBM Plex Sans Arabic", "Space Grotesk Variable", "Space Grotesk", "IBM Plex Sans Arabic Fallback", "Geeza Pro", Tahoma, sans-serif`,
  "lh-display": "1.3",
  "lh-tight": "1.3",
  "lh-snug": "1.45",
  "lh-ui": "1.6",
  "lh-lead": "1.8",
  "lh-body": "1.85",
  "tracking-label": "0",
  "tracking-scale": "0",
  "script-scale": "1.0625",
  "script-scale-display": "0.92",
};

// ---------------------------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------------------------
const HEADER = `/* mohamedhatem.dev design tokens. GENERATED by design/scripts/build-tokens.mjs. Do not edit by hand. */\n`;

function themeVars(i) {
  const out = [];
  for (const [k, v] of Object.entries(COLOR)) out.push(`  --color-${k}: ${v[i]};`);
  for (const [k, v] of Object.entries(SHADOW)) out.push(`  --${k}: ${v[i]};`);
  return out.join("\n");
}
function staticVars() {
  const out = [];
  for (const [k, v] of Object.entries(FONT)) out.push(`  --font-${k}: ${v};`);
  for (const [k, [size, lh, ls, scale]] of Object.entries(TEXT)) {
    const mul = scale === "display" ? "var(--script-scale-display)" : "var(--script-scale)";
    out.push(`  --text-${k}: calc(${size} * ${mul});`);
    out.push(`  --text-${k}--line-height: ${lh};`);
    out.push(`  --text-${k}--letter-spacing: ${ls === "0" ? "0" : `calc(${ls} * var(--tracking-scale))`};`);
  }
  for (const [k, v] of Object.entries(SCALAR)) out.push(`  --${k}: ${v};`);
  for (const [k, v] of Object.entries(BREAKPOINT)) out.push(`  --breakpoint-${k}: ${v};`);
  return out.join("\n");
}
const arabicVars = Object.entries(ARABIC).map(([k, v]) => `  --${k}: ${v};`).join("\n");
const darkBlock = themeVars(1);

const css = `${HEADER}
/* ---- static tokens (always) + the light theme values (in effect only with html[data-theme="light"], the visitor's choice) ---- */
:root {
  color-scheme: light;
${staticVars()}
${themeVars(0)}
}

/* ---- dark: the default for every visitor, whatever the OS setting (no saved choice, data-theme="dark", no JS) ---- */
:root:not([data-theme="light"]) {
  color-scheme: dark;
${darkBlock}
}

/* ---- Arabic / RTL: fonts, line-heights, size compensation, no tracking ---- */
:root:lang(ar), [lang="ar"] {
${arabicVars}
}
`;

// Tailwind 4: light defaults + static tokens go in @theme (so utilities like bg-surface, text-ink,
// font-display, text-2xl, rounded-lg, shadow-md, ease-out exist); dark + Arabic overrides stay plain CSS
// and simply re-assign the same custom properties.
const tw = `${HEADER}
/* Usage (src/styles/global.css):
     @import "tailwindcss";
     @import "./tokens.tailwind.css";
     @custom-variant dark (&:where(:root:not([data-theme=light]), :root:not([data-theme=light]) *));
   Dark is the default theme; light applies only with html[data-theme="light"] (the visitor's choice).
   Semantic colour utilities switch theme automatically (bg-bg, bg-surface, text-ink, text-muted,
   border-line, text-accent, bg-accent-solid, text-on-accent ...). Use the dark: variant only for
   non-colour differences. */
@theme static {
  --color-*: initial;
${staticVars()}
${themeVars(0)}
}

:root { color-scheme: light; }
:root:not([data-theme="light"]) {
  color-scheme: dark;
${darkBlock}
}
:root:lang(ar), [lang="ar"] {
${arabicVars}
}
`;

const json = { color: COLOR, shadow: SHADOW, font: FONT, text: TEXT, scalar: SCALAR, breakpoint: BREAKPOINT, arabic: ARABIC };

fs.writeFileSync(path.join(DIR, "tokens.css"), css);
fs.writeFileSync(path.join(DIR, "tokens.tailwind.css"), tw);
fs.writeFileSync(path.join(DIR, "tokens.json"), JSON.stringify(json, null, 2) + "\n");
console.log("wrote tokens.css, tokens.tailwind.css, tokens.json");
