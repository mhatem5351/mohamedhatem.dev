#!/usr/bin/env node
/**
 * Minimal static server for a build directory, close to how Cloudflare Workers static assets serve ../dist:
 *   1. dist/_redirects (exact-path static rules, as scripts/postbuild/redirects.mjs writes them, then "/x/*" splat
 *      rules with ":splat" in the target) run first, keeping the query string;
 *   1b. /404 and /ar/404 answer their 404 page with status 404 (the Worker does this in production: worker/src/index.ts);
 *   2. html_handling auto-trailing-slash: "/x" → 307 "/x/" when x/index.html exists (the platform's code is 307;
 *      the 301s come from _redirects), "/x/" → x/index.html;
 *   3. not_found_handling 404-page: unknown paths → the nearest 404.html (ar/404.html under /ar/), 404 status.
 * dist/_headers rules are applied to every response (redirects included), so headers can be checked locally.
 * /api/* is not served (the Worker owns it); tests mock it.
 *
 *   node scripts/serve.mjs                          serve ../dist on http://localhost:4321
 *   node scripts/serve.mjs --dir /tmp/x --port 4400
 *
 * Exported `startServer({ dir, port })` is used by the PDF and OG scripts.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".webmanifest": "application/manifest+json",
  ".vcf": "text/vcard; charset=utf-8",
};

/** Parses dist/_redirects into Map(from → { to, status }): exact paths, and "/x/*" splats (matched after them). */
function parseRedirects(dir) {
  const file = join(dir, "_redirects");
  const rules = new Map();
  if (!existsSync(file)) return rules;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const [from, to, status] = line.replace(/^\s*#.*$/, "").trim().split(/\s+/);
    if (from && to && !rules.has(from)) rules.set(from, { to, status: Number(status) || 302 });
  }
  return rules;
}

/** The redirect for a path: an exact rule, else the first splat rule whose prefix matches (":splat" filled in). */
function matchRedirect(rules, path) {
  const exact = rules.get(path);
  if (exact && !path.endsWith("*")) return exact;
  for (const [from, rule] of rules) {
    if (!from.endsWith("/*")) continue;
    const prefix = from.slice(0, -1);
    if (path.startsWith(prefix)) return { ...rule, to: rule.to.replace(":splat", path.slice(prefix.length)) };
  }
  return undefined;
}

/** Parses public/_headers into [{ pattern: RegExp, headers: [name, value][] }]. */
function parseHeaders(dir) {
  const file = join(dir, "_headers");
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const glob = line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      current = { pattern: new RegExp(`^${glob}$`), headers: [] };
      rules.push(current);
    } else if (current) {
      const i = line.indexOf(":");
      current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

export function startServer({ dir = fileURLToPath(new URL("../../dist", import.meta.url)), port = 4321, quiet = false } = {}) {
  const root = resolve(dir);
  const rules = parseHeaders(root);
  const redirects = parseRedirects(root);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" }).end('{"ok":false,"error":"no_worker"}');
      return;
    }
    const custom = (headers) => {
      for (const r of rules) if (r.pattern.test(path)) for (const [k, v] of r.headers) headers[k.toLowerCase()] = v;
      return headers;
    };
    const send = (file, status = 200) => {
      res.writeHead(status, custom({ "content-type": TYPES[extname(file)] ?? "application/octet-stream" }));
      if (req.method === "HEAD") res.end();
      else createReadStream(file).pipe(res);
    };
    const redirect = (to, status) => {
      const target = new URL(to, "http://localhost");
      const location = `${target.pathname}${target.search || url.search}${target.hash}`;
      res.writeHead(status, custom({ location })).end();
    };
    const rule = matchRedirect(redirects, url.pathname);
    if (rule) return redirect(rule.to, rule.status);
    if (path === "/404" || path === "/ar/404") {
      const page = join(root, path === "/404" ? "404.html" : "ar/404.html");
      if (existsSync(page)) return send(page, 404);
    }
    const safe = normalize(join(root, path));
    if (!safe.startsWith(root)) return void res.writeHead(400).end();
    // html_handling drops ".html": /404.html → 307 /404 (index.html forms are 301s in _redirects).
    if (/[^/]\.html$/.test(path) && !path.endsWith("/index.html") && existsSync(safe)) return redirect(path.slice(0, -5), 307);
    if (existsSync(safe) && statSync(safe).isFile()) return send(safe);
    if (existsSync(safe) && statSync(safe).isDirectory()) {
      if (!path.endsWith("/")) return redirect(`${path}/`, 307);
      const index = join(safe, "index.html");
      if (existsSync(index)) return send(index);
    }
    if (existsSync(`${safe}.html`)) return send(`${safe}.html`);
    const nf = path.startsWith("/ar/") && existsSync(join(root, "ar/404.html")) ? join(root, "ar/404.html") : join(root, "404.html");
    path = "/404.html";
    if (existsSync(nf)) return send(nf, 404);
    res.writeHead(404).end("Not found");
  });
  return new Promise((ok) =>
    server.listen(port, "127.0.0.1", () => {
      if (!quiet) console.log(`serving ${root} on http://localhost:${port}/`);
      ok(server);
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
  await startServer({ dir: get("dir", undefined), port: Number(get("port", 4321)) });
}
