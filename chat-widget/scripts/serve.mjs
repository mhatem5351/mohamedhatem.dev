#!/usr/bin/env node
/**
 * Read-only static server for the demo and the Playwright suite: http://localhost:5173/ → chat-widget/demo.html.
 * Serves only chat-widget/ and design/ from the repo root (never dotfiles: the root holds .env).
 *   PORT=5173 node chat-widget/scripts/serve.mjs
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(fileURLToPath(import.meta.url), "..", "..", "..");
const port = Number(process.env.PORT ?? 5173);
const ALLOWED = ["chat-widget", "design"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path === "/" || path === "/ar/") {
    res.writeHead(302, { Location: `/chat-widget/demo.html${path === "/ar/" ? "?lang=ar" : ""}` }).end();
    return;
  }
  const rel = normalize(path).replace(/^[/\\]+/, "");
  const parts = rel.split(sep);
  const file = join(repo, rel);
  let ok = ALLOWED.includes(parts[0] ?? "") && !parts.some((p) => p.startsWith(".")) && file.startsWith(repo + sep);
  try {
    ok &&= statSync(file).isFile();
  } catch {
    ok = false;
  }
  if (!ok || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(ok ? 405 : 404, { "Content-Type": "text/plain" }).end(ok ? "Method Not Allowed" : "Not Found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}).listen(port, () => console.log(`chat widget demo: http://localhost:${port}/chat-widget/demo.html`));
