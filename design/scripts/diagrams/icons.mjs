#!/usr/bin/env node
// mohamedhatem.dev icon set: single source of truth + builder.
//
// Grammar: 24x24 grid, 1.75 stroke, round caps and joins, stroke="currentColor", no fills except
// small "node" dots (r 1-1.6, fill="currentColor" stroke="none"). Live area 2..22. Optically
// consistent with the GitHub-profile icons (agents, retrieval, serving, frontend keep that geometry).
//
// ICONS[name] is inner markup in 24x24 coordinates with NO presentation attributes except on node
// dots, so callers can drop it into any <g> that sets stroke/fill/stroke-width (the diagram builder
// renders glyphs at 16 px with stroke-width 2).
//
// Brand glyphs (whatsapp, linkedin, github) are simplified monoline drawings in this grammar so the
// set stays consistent in UI chrome (footer, contact list). Where a brand's guidelines require its
// official mark (e.g. a "Chat on WhatsApp" button, a "Sign in with LinkedIn" control), use the
// official filled logo from the brand's press kit instead.
//
//   node design/scripts/diagrams/icons.mjs   -> writes design/assets/icons/<name>.svg, sprite.svg
//                                               and design/prototypes/icons.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.resolve(HERE, "..", "..");
const OUT = path.join(DESIGN, "assets", "icons");

export const STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

// node dot
const D = (cx, cy, r = 1.4) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
const P = (d) => `<path d="${d}"/>`;
const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const R = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;

// shared silhouettes
const MAGNIFIER = C(11, 11, 7) + P("M16 16l4.5 4.5");
const SHIELD = P("M12 3l7 2.8v5.3c0 4.6-3 8.2-7 9.9-4-1.7-7-5.3-7-9.9V5.8L12 3z");
const BUBBLE = P("M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-7.5L6 21v-3.5A2.5 2.5 0 0 1 3.5 15z");
const RING = (r = 9) => C(12, 12, r);

// [name, title, group, markup]
const DEFS = [
  // ---- AI / systems (diagram glyphs) ----
  ["agents", "Agents", "ai",
    C(12, 5, 2.3) + C(5, 18, 2.3) + C(19, 18, 2.3) + D(12, 12.6, 1.6) + P("M12 7.3v3.7M10.6 13.6l-3.8 2.9M13.4 13.6l3.8 2.9M7.3 18h9.4")],
  ["orchestrator", "Orchestrator", "ai",
    RING(9) + P("M12 12 7.2 9.2M12 12l4.8-2.8M12 12v5.6") + D(12, 12, 1.5) + D(7.2, 9.2, 1.2) + D(16.8, 9.2, 1.2) + D(12, 17.6, 1.2)],
  ["retrieve", "Retrieve", "ai", MAGNIFIER + P("M8 9.5h6M8 12.5h3.5")],
  ["rerank", "Rerank", "ai", P("M3.5 6h9M3.5 12h6.5M3.5 18h4") + P("M18 4.5v15M15.5 7 18 4.5 20.5 7M15.5 17l2.5 2.5 2.5-2.5")],
  ["guard", "Guard", "ai", SHIELD + D(12, 11.5, 1.6)],
  ["shield-check", "Moderation check", "ai", SHIELD + P("M8.7 11.9l2.3 2.3 4.4-4.6")],
  ["generate", "Generate", "ai", P("M4 5h16M4 11h16M4 17h6.5") + P("M14.5 14.25v5.5")],
  ["evaluate", "Evaluate", "ai", P("M5.4 18.6a8.6 8.6 0 1 1 13.2 0") + P("M8.6 13.4l2.4 2.4 4.4-4.8")],
  ["tools-mcp", "Tools (MCP)", "ai", P("M9 3v3.5M15 3v3.5") + P("M6.5 6.5h11V10a5.5 5.5 0 0 1-11 0z") + P("M12 15.5V21")],
  ["serving", "Model serving", "ai",
    R(3.5, 4, 17, 7, 2) + R(3.5, 13, 17, 7, 2) + D(7.2, 7.5, 1.1) + D(7.2, 16.5, 1.1) + P("M11 7.5h6M11 16.5h6")],
  ["gpu", "GPU", "ai", R(6, 6, 12, 12, 2) + R(9.5, 9.5, 5, 5, 1) + P("M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3")],
  ["pipeline", "Pipeline", "ai", R(2.75, 8.5, 5.5, 7, 1.75) + R(15.75, 8.5, 5.5, 7, 1.75) + P("M8.25 12h5.5M11.25 9.5l2.5 2.5-2.5 2.5")],
  ["database", "Database", "ai",
    `<ellipse cx="12" cy="5.75" rx="7.5" ry="2.5"/>` + P("M4.5 5.75v12.5c0 1.38 3.36 2.5 7.5 2.5s7.5-1.12 7.5-2.5V5.75") + P("M4.5 12c0 1.38 3.36 2.5 7.5 2.5s7.5-1.12 7.5-2.5")],
  ["cache", "Cache", "ai",
    `<ellipse cx="10" cy="5.5" rx="6.5" ry="2.25"/>` + P("M3.5 5.5v10.5c0 1.24 2.91 2.25 6.5 2.25M16.5 5.5v4.5") + C(17.5, 17, 4) + P("M17.5 15.2V17l1.2.9")],
  ["embed", "Embedding", "ai", P("M7 4H4.5v16H7M17 4h2.5v16H17") + D(12, 7.5, 1.4) + D(12, 12, 1.4) + D(12, 16.5, 1.4)],
  ["keyword", "Keyword search", "ai", P("M3.5 6.5h17M3.5 12h3.5M17 12h3.5M3.5 17.5h11") + R(9.25, 9.5, 5.5, 5, 1.25)],
  ["merge", "Merge", "ai", P("M3.5 5c0 4.2 3.6 7 8 7M3.5 19c0-4.2 3.6-7 8-7h9M17.5 9l3 3-3 3")],
  ["split", "Split", "ai", P("M3.5 12h4c3.5 0 4.5-6 8.5-6h4.5M7.5 12c3.5 0 4.5 6 8.5 6h4.5M18 3.5 20.5 6 18 8.5M18 15.5l2.5 2.5-2.5 2.5")],
  ["route", "Route", "ai", P("M3 12 6.5 8.5 10 12l-3.5 3.5z") + P("M10 12h1c2.6 0 3-5.5 6-5.5h3.5M11 12c2.6 0 3 5.5 6 5.5h3.5M18.5 4l2.5 2.5L18.5 9M18.5 15l2.5 2.5-2.5 2.5")],
  ["layers", "Model versions", "ai", P("M12 3.5 21 8l-9 4.5L3 8z") + P("M3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5")],
  ["container", "Container", "ai", P("M12 3l7.75 4.4v9.2L12 21l-7.75-4.4V7.4z") + P("M4.25 7.4 12 11.8l7.75-4.4M12 11.8V21")],
  ["gateway", "Gateway", "ai", P("M12 3.5v17M3 12h6M15 12h6M18 9l3 3-3 3")],
  ["function", "Function", "ai", R(3, 3, 18, 18, 3.5) + P("M8 6.5h1.1c.8 0 1.4.4 1.7 1.2l3.4 8.6c.3.8.9 1.2 1.7 1.2H16.5M12.1 11.6 8.2 17.5")],
  ["activity", "Health monitoring", "ai", P("M2.5 12h4l2.5-6.5 5 13 2.5-6.5h5")],
  ["branch", "Branch", "ai", C(6, 18, 2.25) + C(18, 6, 2.25) + P("M6 3.5v12.25M18 8.25A9.75 9.75 0 0 1 8.25 18")],
  ["filter", "Filter", "ai", P("M3.5 4.5h17l-6.5 8v6.5l-4 2v-8.5z")],
  ["search", "Search", "ai", MAGNIFIER],
  ["image", "Image", "media", R(3, 4, 18, 16, 2.5) + C(8.5, 9.5, 1.75) + P("M21 15l-4-4a1.5 1.5 0 0 0-2.1 0L6 20")],
  ["video", "Video", "media", R(3, 6, 12.5, 12, 2.5) + P("M15.5 10.25l4.55-2.7a.8.8 0 0 1 1.2.69v7.52a.8.8 0 0 1-1.2.69l-4.55-2.7")],
  ["audio", "Audio", "media", P("M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3")],
  ["bilingual", "Arabic + English", "ai",
    // Latin A sits on the baseline (y 15.5); the Arabic ain's head sits above it and its bowl descends below,
    // as in IBM Plex Sans Arabic (head, straight tongue on the baseline, deep bowl ending up-right)
    P("M2.75 15.5 6.5 4.5l3.75 11M4.1 12h4.8") +
    P("M19.6 9.6c-.5-.6-1.3-1-2.2-1-1.4 0-2.4 1.1-2.4 2.4 0 1.5.4 2.6.9 3.4l5.1-.25M15.9 14.4c-1.3.6-2.2 1.8-2.2 3.2 0 2.1 1.6 3.4 3.9 3.4 1.5 0 2.7-.45 3.6-1.2")],
  ["frontend", "Frontend", "ai",
    R(2.75, 4, 18.5, 16, 2.5) + P("M2.75 8.5h18.5") + D(5.75, 6.25, 1) + D(8.25, 6.25, 1) + P("M9.75 11.75l-2.5 2.5 2.5 2.5M14.25 11.75l2.5 2.5-2.5 2.5")],
  ["code", "Code", "ai", P("M7.5 7.5 3 12l4.5 4.5M16.5 7.5 21 12l-4.5 4.5M13.75 5l-3.5 14")],
  ["terminal", "Terminal", "ai", R(2.75, 4, 18.5, 16, 2.5) + P("M7 9.5l3 2.5-3 2.5M12.5 15h4.5")],
  ["user", "User", "ai", C(12, 8, 4) + P("M4.5 20.5a7.5 7.5 0 0 1 15 0")],
  ["users", "Users", "ai", C(9, 8.5, 3.5) + P("M2.5 20a6.5 6.5 0 0 1 13 0M15.5 5.1a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-3.5-5.8")],
  ["chat", "Chat", "ai", BUBBLE],
  ["ask", "Ask the assistant", "ai", BUBBLE + C(12, 10.75, 2.75) + D(12, 10.75, 1.1)],
  ["map", "Map", "ai", P("M9 4.5 3.5 6.75v13l5.5-2.25 6 2.25 5.5-2.25v-13L15 6.75 9 4.5zM9 4.5v13M15 6.75v13")],
  ["building", "Building", "ai", P("M5 21V4.5A1.5 1.5 0 0 1 6.5 3h7A1.5 1.5 0 0 1 15 4.5V21M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21M3 21h18M8.5 7h.01M11.5 7h.01M8.5 10.5h.01M11.5 10.5h.01M8.5 14h.01M11.5 14h.01")],
  ["tag", "Tag", "ai", P("M3 5.5v5.6a2 2 0 0 0 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l5.6-5.6a2 2 0 0 0 0-2.8L12 4.1a2 2 0 0 0-1.4-.6H5a2 2 0 0 0-2 2z") + D(7.5, 8, 1.4)],

  // ---- UI ----
  ["arrow-right", "Arrow right", "ui", P("M4.5 12h15M13.5 6l6 6-6 6")],
  ["arrow-left", "Arrow left", "ui", P("M19.5 12h-15M10.5 6l-6 6 6 6")],
  ["arrow-up", "Arrow up", "ui", P("M12 19.5v-15M6 10.5l6-6 6 6")],
  ["arrow-down", "Arrow down", "ui", P("M12 4.5v15M6 13.5l6 6 6-6")],
  ["arrow-up-right", "Arrow up right", "ui", P("M7 17 17 7M8.5 7H17v8.5")],
  ["chevron-down", "Chevron down", "ui", P("M6 9l6 6 6-6")],
  ["chevron-up", "Chevron up", "ui", P("M6 15l6-6 6 6")],
  ["chevron-right", "Chevron right", "ui", P("M9 6l6 6-6 6")],
  ["chevron-left", "Chevron left", "ui", P("M15 6l-6 6 6 6")],
  ["plus", "Plus", "ui", P("M12 5v14M5 12h14")],
  ["minus", "Minus", "ui", P("M5 12h14")],
  ["close", "Close", "ui", P("M6 6l12 12M18 6 6 18")],
  ["menu", "Menu", "ui", P("M4 7h16M4 12h16M4 17h16")],
  ["send", "Send", "ui", P("M21 3 3.5 9.75l7.25 3.5 3.5 7.25L21 3zM10.75 13.25 21 3")],
  ["stop", "Stop", "ui", R(6, 6, 12, 12, 2.5)],
  ["copy", "Copy", "ui", R(8.5, 8.5, 12.5, 12.5, 2.5) + P("M15.5 8.5V5.5A2.5 2.5 0 0 0 13 3H5.5A2.5 2.5 0 0 0 3 5.5V13a2.5 2.5 0 0 0 2.5 2.5h3")],
  ["check", "Check", "ui", P("M4.5 12.5l5 5 10-10.5")],
  ["refresh", "Refresh", "ui", P("M20.5 12a8.5 8.5 0 1 1-8.5-8.5c2.4 0 4.6 1 6.3 2.6L20.5 8M20.5 3.5V8H16")],
  ["external-link", "External link", "ui", P("M18 13.5V18a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V8.5A2.5 2.5 0 0 1 6 6h4.5M14.5 3.5h6v6M10.5 13.5l10-10")],
  ["link", "Link", "ui", P("M10 14a4.2 4.2 0 0 0 6 .4l3-3a4.2 4.2 0 0 0-6-6l-1.6 1.6M14 10a4.2 4.2 0 0 0-6-.4l-3 3a4.2 4.2 0 0 0 6 6l1.6-1.6")],
  ["expand", "Expand", "ui", P("M14.5 3.5h6v6M20.5 3.5 14 10M9.5 20.5h-6v-6M3.5 20.5 10 14")],
  ["download", "Download", "ui", P("M12 3.5V15M7 10l5 5 5-5M3.5 15.5V18A2.5 2.5 0 0 0 6 20.5h12a2.5 2.5 0 0 0 2.5-2.5v-2.5")],
  ["print", "Print", "ui", P("M7 9V3.5h10V9M7 17.5H5.5A2.5 2.5 0 0 1 3 15v-3.5A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5V15a2.5 2.5 0 0 1-2.5 2.5H17") + R(7, 14, 10, 6.5, 1)],
  ["mail", "Email", "ui", R(2.75, 5, 18.5, 14, 2.5) + P("M3.25 7 10.6 12.3a2.4 2.4 0 0 0 2.8 0L20.75 7")],
  ["location", "Location", "ui", P("M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z") + C(12, 10, 2.25)],
  ["calendar", "Calendar", "ui", R(3, 4.75, 18, 16, 2.5) + P("M3 9.75h18M8 3v3.5M16 3v3.5")],
  ["clock", "Clock", "ui", RING(9) + P("M12 7v5l3.5 2")],
  ["briefcase", "Experience", "ui", R(2.75, 7, 18.5, 13, 2.5) + P("M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M2.75 12.5h18.5")],
  ["graduation", "Education", "ui", P("M12 4.5 2.5 9l9.5 4.5L21.5 9 12 4.5zM6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11M21.5 9v5")],
  ["certificate", "Certificate", "ui", P("M13 19.5H5.5A2.5 2.5 0 0 1 3 17V6a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 6v4.5M7 8h10M7 11.5h5") + C(17.5, 15, 2.75) + P("M16 17.5v3.5l1.5-1 1.5 1v-3.5")],
  ["award", "Award", "ui", C(12, 9, 6) + P("M8.6 13.9 7.5 21l4.5-2.5 4.5 2.5-1.1-7.1")],
  ["sun", "Light theme", "ui", C(12, 12, 4) + P("M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4")],
  ["moon", "Dark theme", "ui", P("M12 3.25a6.25 6.25 0 0 0 8.75 8.75 8.75 8.75 0 1 1-8.75-8.75z")],
  ["monitor", "System theme", "ui", R(2.75, 4, 18.5, 12.5, 2.5) + P("M8.5 20.5h7M12 16.5v4")],
  ["globe", "Language", "ui", RING(9) + P("M3 12h18M12 3c-2.4 2.5-3.6 5.5-3.6 9s1.2 6.5 3.6 9c2.4-2.5 3.6-5.5 3.6-9S14.4 5.5 12 3z")],
  ["info", "Information", "ui", RING(9) + P("M12 11v5.5") + D(12, 7.75, 1.2)],
  ["alert", "Alert", "ui", P("M10.3 4.2 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z") + P("M12 9.5v4.25") + D(12, 16.9, 1.15)],
  ["pause", "Pause", "ui", R(6.5, 5, 3, 14, 1) + R(14.5, 5, 3, 14, 1)],
  ["play", "Play", "ui", P("M7.5 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L9 3.94a1 1 0 0 0-1.5.86z")],
  ["file-text", "CV", "ui", P("M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9zM14 3v4.5A1.5 1.5 0 0 0 15.5 9H20M8 13h8M8 17h5")],
  // platform-neutral share: an open-topped box with the arrow leaving it upwards
  ["share", "Share", "ui", P("M12 3.5V14M8 7.5l4-4 4 4") + P("M9 10H7a2.5 2.5 0 0 0-2.5 2.5v6A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 17 10h-2")],
  ["user-plus", "Add to contacts", "ui", C(9.5, 8, 4) + P("M2.5 20.5a7 7 0 0 1 14 0") + P("M18.75 7.75v5.5M16 10.5h5.5")],

  // ---- brand (simplified monoline; see header note) ----
  ["whatsapp", "WhatsApp", "brand",
    P("M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z") +
    P("M9.4 8.1 8.8 8.7c-.6.6-.6 1.7 0 3 .9 1.8 2.3 3.2 4.1 4 1.3.6 2.4.6 3-.1l.5-.6-1.9-1.5-1 .7c-.9-.4-1.6-1.1-2-2l.7-1-1.5-1.9z")],
  ["linkedin", "LinkedIn", "brand", R(3, 3, 18, 18, 3.5) + P("M8 10.5v6M11.75 16.5v-6M11.75 13.25a2.5 2.5 0 0 1 5 0v3.25") + D(8, 7.6, 1.2)],
  ["github", "GitHub", "brand",
    P("M9.25 20.5v-2.8c0-.8.3-1.5.8-2-2.8-.3-5.3-1.4-5.3-5.4 0-1.1.4-2.1 1.1-2.9-.2-.6-.4-1.8.2-3.2 0 0 1-.3 3.2 1.2a10.5 10.5 0 0 1 5.5 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.4.4 2.6.2 3.2.7.8 1.1 1.8 1.1 2.9 0 4-2.5 5.1-5.3 5.4.5.5.8 1.2.8 2v2.8") +
    P("M9.25 18.3c-2.6.8-3.2-1.1-4.5-1.6")],
];

export const ICONS = Object.fromEntries(DEFS.map(([n, , , m]) => [n, m]));
export const ICON_META = Object.fromEntries(DEFS.map(([n, t, g]) => [n, { title: t, group: g }]));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function iconSvg(name, { size = 24, title } = {}) {
  const inner = ICONS[name];
  if (!inner) throw new Error(`unknown icon: ${name}`);
  const a11y = title ? `role="img" aria-label="${esc(title)}"` : `aria-hidden="true"`;
  const t = title ? `<title>${esc(title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${STROKE_ATTRS} ${a11y}>${t}${inner}</svg>`;
}

// ---- svgo: repo devDependency first, then SVGO_WORKSPACE (a folder whose node_modules has svgo) ----
async function loadSvgo() {
  try { return await import("svgo"); } catch { /* not installed in this repo yet */ }
  if (!process.env.SVGO_WORKSPACE) return null;
  try { return createRequire(`${process.env.SVGO_WORKSPACE}/package.json`)("svgo"); } catch { return null; }
}

const SVGO_CONFIG = {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    { name: "preset-default", params: { overrides: { removeUnknownsAndDefaults: { keepRoleAttr: true, keepDataAttrs: false }, convertColors: { currentColor: false } } } },
    "removeDimensions",
    { name: "removeAttrs", params: { attrs: ["data-name"] } },
  ],
};

function stripOuter(svg) {
  const m = svg.match(/^<svg[^>]*>([\s\S]*)<\/svg>\s*$/);
  return m ? m[1] : svg;
}

export async function buildIcons({ quiet = false } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const svgo = await loadSvgo();
  const sizes = {};
  const symbols = [];
  for (const name of Object.keys(ICONS)) {
    // standalone file: decorative by default (aria-hidden); width/height 24 kept for <img> use
    let raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${STROKE_ATTRS}>${ICONS[name]}</svg>`;
    let opt = raw;
    if (svgo) opt = svgo.optimize(raw, SVGO_CONFIG).data;
    const inner = stripOuter(opt);
    const file = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE_ATTRS}>${inner}</svg>\n`;
    fs.writeFileSync(path.join(OUT, `${name}.svg`), file);
    sizes[name] = Buffer.byteLength(file);
    symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24" ${STROKE_ATTRS}>${inner}</symbol>`);
  }
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- mohamedhatem.dev icons: <svg width="20" height="20"><use href="/icons/sprite.svg#i-NAME"/></svg>; colour via CSS color. -->\n${symbols.join("\n")}\n</svg>\n`;
  fs.writeFileSync(path.join(OUT, "sprite.svg"), sprite);
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  if (!quiet) {
    console.log(`icons: ${Object.keys(ICONS).length} files, ${total} B total (avg ${Math.round(total / Object.keys(ICONS).length)} B, max ${Math.max(...Object.values(sizes))} B)`);
    console.log(`sprite.svg: ${Buffer.byteLength(sprite)} B${svgo ? "" : " (svgo not found: unoptimised)"}`);
  }
  writePreview();
  return { sizes, sprite: Buffer.byteLength(sprite) };
}

// ---- preview sheet: design/prototypes/icons.html ------------------------------------------------
// theme variables re-scoped to a panel so light and dark can sit side by side on one page
function themeVars(theme) {
  const css = fs.readFileSync(path.join(DESIGN, "tokens.css"), "utf8");
  // dark is the default theme (`:root:not([data-theme="light"])`); light is `:root` with html[data-theme="light"]
  const m = css.match(theme === "dark" ? /:root:not\(\[data-theme="light"\]\)\s*\{/ : /:root\s*\{/);
  const start = m.index + m[0].length;
  const end = css.indexOf("}", start);
  const body = css.slice(start, end);
  return [...body.matchAll(/(--(?:color|shadow|inset)-[\w-]+):\s*([^;]+);/g)].map(([, k, v]) => `${k}:${v.trim()}`).join(";") + `;color-scheme:${theme}`;
}

const DIAGRAM_GLYPHS = [
  ["orchestrator", "teal"], ["agents", "teal"], ["route", "teal"],
  ["retrieve", "saffron"], ["rerank", "saffron"], ["embed", "saffron"], ["keyword", "saffron"], ["merge", "saffron"], ["search", "saffron"],
  ["generate", "coral"], ["image", "coral"], ["audio", "coral"], ["video", "coral"], ["tag", "coral"],
  ["evaluate", "sky"], ["activity", "sky"],
  ["guard", "sage"], ["shield-check", "sage"],
  ["serving", "slate"], ["gpu", "slate"], ["tools-mcp", "slate"], ["pipeline", "slate"], ["container", "slate"], ["gateway", "slate"],
  ["function", "slate"], ["layers", "slate"], ["refresh", "slate"], ["branch", "slate"], ["terminal", "slate"], ["code", "slate"],
  ["database", "slate"], ["cache", "slate"], ["globe", "slate"],
  ["user", "ext"], ["users", "ext"], ["chat", "ext"], ["whatsapp", "ext"], ["building", "ext"], ["map", "ext"], ["bilingual", "ext"],
];

function writePreview() {
  const names = Object.keys(ICONS);
  const svg = (n, s, sw) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw ?? 1.75}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
  const groups = [["ai", "AI systems and diagram glyphs"], ["media", "Media"], ["ui", "Interface"], ["brand", "Brand (monoline)"]];
  const grid = groups.map(([g, label]) => {
    const list = names.filter((n) => ICON_META[n].group === g);
    return `<h3 class="grp">${label} <span>${list.length}</span></h3><div class="grid">${list.map((n) => `<div class="cell"><div class="sizes">${[16, 20, 24, 32].map((s) => `<span class="s s${s}">${svg(n, s)}</span>`).join("")}</div><code>${n}</code></div>`).join("")}</div>`;
  }).join("");
  const panel = (theme) => `<section class="panel ${theme === "dark" ? "is-dark" : "is-light"}" aria-label="${theme} theme"><h2 class="eyebrow">${theme} · 16 / 20 / 24 / 32 px</h2>${grid}</section>`;

  const ctx = (theme) => `<section class="panel ${theme === "dark" ? "is-dark" : "is-light"} ctx" aria-label="in context, ${theme}">
  <h2 class="eyebrow">${theme} · in context</h2>
  <p class="t14"><span class="ic">${svg("location", 16)}</span>Cairo, Egypt <span class="sep">·</span> <span class="ic">${svg("briefcase", 16)}</span>AI Team Lead <span class="sep">·</span> <span class="ic">${svg("graduation", 16)}</span>M.Sc. Data Science</p>
  <p class="t16"><span class="ic">${svg("mail", 18)}</span>hatem@mohamedhatem.dev <span class="sep">·</span> <span class="ic">${svg("whatsapp", 18)}</span>WhatsApp <span class="sep">·</span> <span class="ic">${svg("linkedin", 18)}</span>LinkedIn <span class="sep">·</span> <span class="ic">${svg("github", 18)}</span>GitHub</p>
  <div class="row">
    <button class="btn primary">${svg("ask", 18)}Ask about my work</button>
    <button class="btn">${svg("file-text", 18)}Download CV</button>
    <a class="btn ghost" href="#">Case study${svg("arrow-right", 18)}</a>
    <button class="ibtn" aria-label="Send">${svg("send", 20)}</button>
    <button class="ibtn" aria-label="Stop">${svg("stop", 20)}</button>
    <button class="ibtn sm" aria-label="Copy">${svg("copy", 16)}</button>
    <button class="ibtn sm" aria-label="Close">${svg("close", 16)}</button>
  </div>
  <div class="row sprite" title="rendered from sprite.svg via &lt;use&gt;">
    ${["agents", "orchestrator", "retrieve", "rerank", "guard", "evaluate", "generate", "serving"].map((n) => `<svg width="20" height="20" aria-hidden="true"><use href="../assets/icons/sprite.svg#i-${n}"/></svg>`).join("")}
    <code>sprite.svg#i-&lt;name&gt;</code>
  </div>
  <div class="row">
    <span class="seg">${svg("sun", 16)}${svg("moon", 16)}${svg("monitor", 16)}</span>
    <span class="chip teal">${svg("agents", 14)}LangGraph</span>
    <span class="chip saffron">${svg("retrieve", 14)}Hybrid RAG</span>
    <span class="chip coral">${svg("generate", 14)}Qwen · vLLM</span>
    <span class="chip sky">${svg("evaluate", 14)}Evaluation</span>
    <span class="chip sage">${svg("guard", 14)}Guardrails</span>
    <span class="chip slate">${svg("gpu", 14)}A100</span>
    <span class="chip slate">${svg("globe", 14)}EN · العربية</span>
  </div>
</section>`;

  const dia = (theme) => `<section class="panel ${theme === "dark" ? "is-dark" : "is-light"}" aria-label="diagram glyphs, ${theme}">
  <h2 class="eyebrow">${theme} · diagram glyphs · 16 px · stroke-width 2</h2>
  <div class="dg">${DIAGRAM_GLYPHS.map(([n, c]) => `<span class="dgc ${c}" title="${n}">${svg(n, 16, 2)}<code>${n}</code></span>`).join("")}</div>
</section>`;

  const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Icon set</title>
<link rel="stylesheet" href="../tokens.css">
<style>
@font-face{font-family:"Inter Variable";src:url(../assets/fonts/inter-latin-wght.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"JetBrains Mono Variable";src:url(../assets/fonts/jetbrains-mono-ascii-wght.woff2) format("woff2");font-weight:100 800;font-display:swap}
@font-face{font-family:"Space Grotesk Variable";src:url(../assets/fonts/space-grotesk-latin-wght.woff2) format("woff2");font-weight:300 700;font-display:swap}
@font-face{font-family:"IBM Plex Sans Arabic";src:url(../assets/fonts/ibm-plex-sans-arabic-500.woff2) format("woff2");font-weight:500;font-display:swap}
.is-light{${themeVars("light")}}
.is-dark{${themeVars("dark")}}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--color-bg);color:var(--color-ink);font-family:var(--font-sans);font-size:15px;line-height:1.5}
header{max-width:1400px;margin:0 auto;padding:40px 24px 8px}
h1{font-family:var(--font-display);font-weight:650;letter-spacing:-.03em;font-size:40px;margin:0 0 6px}
.lead{color:var(--color-muted);margin:0;max-width:72ch}
.lead code,.eyebrow,code{font-family:var(--font-mono)}
.wrap{max-width:1400px;margin:0 auto;padding:16px 24px 48px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel{background:var(--color-bg);color:var(--color-ink);border:1px solid var(--color-line);border-radius:16px;padding:20px 20px 24px}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:500;line-height:1.5;color:var(--color-muted);margin:0 0 6px}
.grp{font:600 13px/1.4 var(--font-sans);margin:18px 0 8px;color:var(--color-ink-2)}
.grp span{font:500 11px var(--font-mono);color:var(--color-muted);margin-left:4px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.cell{border:1px solid var(--color-line);background:var(--color-surface);border-radius:10px;padding:10px 10px 8px}
.sizes{display:flex;align-items:flex-end;gap:10px;color:var(--color-ink);height:34px}
.s{display:inline-flex}
.cell code{display:block;font-size:11px;color:var(--color-muted);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ctx p{margin:10px 0;display:flex;align-items:center;flex-wrap:wrap;gap:6px;color:var(--color-ink-2)}
.t14{font-size:14px}.t16{font-size:16px}
.ic{display:inline-flex;color:var(--color-muted)}
.sep{color:var(--color-muted);margin:0 4px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--color-line-strong);background:var(--color-surface);color:var(--color-ink);font:600 14px var(--font-sans);text-decoration:none}
.btn.primary{background:var(--color-accent-solid);color:var(--color-on-accent);border-color:transparent}
.btn.ghost{border-color:transparent;background:transparent;color:var(--color-accent)}
.ibtn{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:12px;border:1px solid var(--color-line-strong);background:var(--color-surface);color:var(--color-ink)}
.ibtn.sm{width:32px;height:32px;border-radius:8px;color:var(--color-muted)}
.seg{display:inline-flex;gap:12px;padding:8px 12px;border:1px solid var(--color-line);border-radius:999px;color:var(--color-muted)}
.chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;font:500 12.5px var(--font-sans);border:1px solid}
${["teal", "saffron", "coral", "sky", "sage", "slate"].map((c) => `.chip.${c},.dgc.${c}{background:var(--color-${c}-tint);border-color:var(--color-${c}-tint-line);color:var(--color-ink)}.chip.${c} svg,.dgc.${c} svg{color:var(--color-${c})}`).join("\n")}
.dgc.ext{background:transparent;border:1px dashed var(--color-line-strong);color:var(--color-ink)}.dgc.ext svg{color:var(--color-ink-2)}
.dg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.dgc{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border-radius:10px;border:1.5px solid}
.dgc code{font-size:11px;color:var(--color-muted)}
.full{grid-column:1/-1}
.sprite{color:var(--color-accent)}.sprite code{font-size:11px;color:var(--color-muted)}
</style>
</head>
<body>
<header>
<p class="eyebrow">mohamedhatem.dev · design system</p>
<h1>Icon set</h1>
<p class="lead">${names.length} icons on a 24 px grid · 1.75 stroke · round caps and joins · <code>currentColor</code> · node dots as the only fills. Source: <code>design/scripts/diagrams/icons.mjs</code>; files in <code>design/assets/icons/</code>; sprite symbols <code>#i-&lt;name&gt;</code>.</p>
</header>
<main class="wrap">
${panel("light")}
${panel("dark")}
${ctx("light")}
${ctx("dark")}
${dia("light")}
${dia("dark")}
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(DESIGN, "prototypes", "icons.html"), html);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildIcons();
}
