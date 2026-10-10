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
// 1. Colour. "Nile & Saffron": warm paper + ink, teal primary, saffron + coral accents,
//    sky / sage / slate as category colours. Same family as github.com/mhatem5351.
//    Every *text* colour below is checked against every surface it may sit on (check-contrast.mjs).
// ---------------------------------------------------------------------------------------------
export const COLOR = {
  //                      light        dark
  "bg":                ["#FBF8F3", "#0C151D"], // page (paper / deep ink)
  "bg-subtle":         ["#F4EFE6", "#0F1A23"], // alternate section band
  "surface":           ["#FFFEFB", "#111D27"], // cards, panels, chat
  "surface-2":         ["#F6F1E8", "#162430"], // insets inside cards, code, neutral chips
  "surface-inverse":   ["#14212B", "#ECF1F4"], // primary button, user chat bubble, tooltips
  "line":              ["#E7E0D3", "#213140"], // hairlines, card borders (decorative)
  "line-strong":       ["#D6CCBA", "#2C3E4D"], // hover borders, dividers that must be seen
  "line-input":        ["#8E8676", "#5E7384"], // form-control boundaries (>= 3:1, WCAG 1.4.11)
  "ink":               ["#14212B", "#ECF1F4"], // primary text
  "ink-2":             ["#33414C", "#C9D3DA"], // secondary text, body copy on cards
  "muted":             ["#5A6670", "#97A5B1"], // meta text, captions, placeholders (>= 4.5:1)
  "subtle":            ["#727C85", "#7D8D9A"], // decorative / disabled only. Not for body text in light.
  "on-inverse":        ["#FBF8F3", "#0C151D"], // text on surface-inverse

  // primary accent (teal)
  "accent":            ["#0A766C", "#3DD6C3"], // links, icons, active states (text-safe)
  "accent-strong":     ["#075E56", "#6FE3D4"], // hover / pressed text-accent
  "accent-solid":      ["#0A766C", "#3DD6C3"], // accent button background
  "accent-solid-hover":["#086A61", "#5FDECD"],
  "on-accent":         ["#FFFFFF", "#06201D"], // text on accent-solid
  "accent-fill":       ["#16A394", "#2CC2B0"], // decorative strokes, graph orchestrator, stripe
  "accent-tint":       ["#E3F1EE", "#10302E"], // chip / badge background
  "accent-tint-line":  ["#B9DFD8", "#1E4B47"],

  // category colours: <name> = text-safe, -fill = decorative stroke/fill, -tint = chip bg, -tint-line = chip border
  "teal":              ["#0A766C", "#3DD6C3"],
  "teal-fill":         ["#16A394", "#2CC2B0"],
  "teal-tint":         ["#E3F1EE", "#10302E"],
  "teal-tint-line":    ["#B9DFD8", "#1E4B47"],
  "saffron":           ["#9C5800", "#F4B95A"],
  "saffron-fill":      ["#E9A23B", "#EFAE48"],
  "saffron-tint":      ["#FAEFDC", "#2E2614"],
  "saffron-tint-line": ["#F0D3A4", "#4D3C1A"],
  "on-saffron":        ["#14212B", "#14212B"], // numerals on saffron-fill discs (diagram callouts, flow steps)
  "coral":             ["#B3421C", "#FF916E"],
  "coral-fill":        ["#E4683F", "#F57A54"],
  "coral-tint":        ["#FAE7DF", "#33201A"],
  "coral-tint-line":   ["#F0BFA9", "#563226"],
  "sky":               ["#2B65A6", "#7DB6F0"],
  "sky-fill":          ["#4A8FD6", "#5EA2E6"],
  "sky-tint":          ["#E4EDF7", "#15283A"],
  "sky-tint-line":     ["#B7CDE8", "#23405C"],
  "sage":              ["#55702A", "#B2CC72"],
  "sage-fill":         ["#89A447", "#9DB95A"],
  "sage-tint":         ["#ECF1DF", "#1F2A17"],
  "sage-tint-line":    ["#CBD8A9", "#344524"],
  "slate":             ["#4A6072", "#AFC3D3"],
  "slate-fill":        ["#7F99AE", "#8AA5BB"],
  "slate-tint":        ["#E8EDF1", "#1C2A35"],
  "slate-tint-line":   ["#C3CFD9", "#2D4050"],

  // status (aliases of the category colours, kept separate so they can diverge later)
  "success":           ["#0A766C", "#3DD6C3"],
  "warning":           ["#9C5800", "#F4B95A"],
  "danger":            ["#B3421C", "#FF916E"],
  "danger-tint":       ["#FAE7DF", "#33201A"],
  "info":              ["#2B65A6", "#7DB6F0"],

  // utility
  "focus":             ["#0A766C", "#3DD6C3"], // focus ring (2px solid + 2px offset)
  "focus-halo":        ["rgb(10 118 108 / 0.22)", "rgb(61 214 195 / 0.28)"],
  "selection":         ["#CDEAE4", "#1E4B47"],
  "scrim":             ["rgb(12 21 29 / 0.46)", "rgb(2 6 10 / 0.66)"],
  "graph-edge":        ["#D3C8B5", "#2B3C4A"], // hero graph + diagrams: idle edges
  "graph-grid":        ["#DDD3C2", "#1F2E3A"], // dot grid
  "graph-node":        ["#FFFEFB", "#0F1A23"], // node fill
  "glow-1":            ["rgb(22 163 148 / 0.13)", "rgb(44 194 176 / 0.16)"],
  "glow-2":            ["rgb(233 162 59 / 0.12)", "rgb(239 174 72 / 0.10)"],
  "glow-3":            ["rgb(228 104 63 / 0.06)", "rgb(245 122 84 / 0.07)"],
};

// ---------------------------------------------------------------------------------------------
// 2. Type. Fluid between 360px and 1440px viewports (Utopia-style clamp). Caps at 1440;
//    from 1920px the root font-size steps up (see base rules) so 2560 screens stay proportional.
//    AR pages multiply text sizes by --script-scale (body) / --script-scale-display (headings).
// ---------------------------------------------------------------------------------------------
export const FONT = {
  "display": `"Space Grotesk Variable", "Space Grotesk", "Space Grotesk Fallback", ui-sans-serif, system-ui, sans-serif`,
  "sans":    `"Inter Variable", "Inter", "Inter Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  "mono":    `"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
  "arabic":  `"IBM Plex Sans Arabic", "IBM Plex Sans Arabic Fallback", "Geeza Pro", "Segoe UI", Tahoma, sans-serif`,
};

// name: [clamp, line-height, letter-spacing, which script multiplier]
export const TEXT = {
  "2xs":     ["clamp(0.6875rem, 0.6667rem + 0.0926vw, 0.75rem)",   "1.45", "0",        "text"],
  "xs":      ["clamp(0.75rem, 0.7292rem + 0.0926vw, 0.8125rem)",   "1.5",  "0",        "text"],
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
  "shadow-xs": ["0 1px 1px rgb(20 33 43 / 0.04)",                                                           "0 1px 1px rgb(0 0 0 / 0.30)"],
  "shadow-sm": ["0 1px 2px rgb(20 33 43 / 0.05), 0 1px 3px rgb(20 33 43 / 0.04)",                          "0 1px 2px rgb(0 0 0 / 0.40), 0 1px 3px rgb(0 0 0 / 0.24)"],
  "shadow-md": ["0 6px 16px -4px rgb(20 33 43 / 0.08), 0 2px 4px -2px rgb(20 33 43 / 0.05)",               "0 8px 20px -6px rgb(0 0 0 / 0.55), 0 2px 6px -2px rgb(0 0 0 / 0.35)"],
  "shadow-lg": ["0 18px 40px -12px rgb(20 33 43 / 0.14), 0 6px 12px -6px rgb(20 33 43 / 0.06)",           "0 22px 48px -14px rgb(0 0 0 / 0.70), 0 6px 14px -6px rgb(0 0 0 / 0.40)"],
  "shadow-xl": ["0 32px 72px -18px rgb(20 33 43 / 0.24), 0 12px 24px -12px rgb(20 33 43 / 0.10)",          "0 36px 80px -18px rgb(0 0 0 / 0.80), 0 12px 28px -10px rgb(0 0 0 / 0.50)"],
  "inset-highlight": ["inset 0 1px 0 rgb(255 255 255 / 0.70)",                                              "inset 0 1px 0 rgb(255 255 255 / 0.045)"],
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
