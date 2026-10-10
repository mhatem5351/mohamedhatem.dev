/**
 * A compressing reverse proxy in front of scripts/serve.mjs, so local measurements (Lighthouse) see the same
 * transfer sizes as production: Cloudflare serves text assets with Brotli/gzip; plain Node static serving doesn't.
 *   const proxy = await startCompressedServer({ dir, port })  // serve.mjs on port + 1, proxy on port
 */
import { createServer, request } from "node:http";
import { constants, createBrotliCompress, createGzip } from "node:zlib";
import { startServer } from "../serve.mjs";

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/;

export async function startCompressedServer({ dir, port }) {
  const origin = await startServer({ dir, port: port + 1, quiet: true });
  const proxy = createServer((req, res) => {
    const up = request({ host: "127.0.0.1", port: port + 1, path: req.url, method: req.method, headers: { ...req.headers, "accept-encoding": "identity" } }, (r) => {
      const type = String(r.headers["content-type"] ?? "");
      const accept = String(req.headers["accept-encoding"] ?? "");
      const headers = { ...r.headers };
      if (!COMPRESSIBLE.test(type) || r.statusCode === 304) {
        res.writeHead(r.statusCode ?? 200, headers);
        r.pipe(res);
        return;
      }
      delete headers["content-length"];
      headers.vary = "accept-encoding";
      if (/\bbr\b/.test(accept)) {
        headers["content-encoding"] = "br";
        res.writeHead(r.statusCode ?? 200, headers);
        r.pipe(createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })).pipe(res);
      } else if (/\bgzip\b/.test(accept)) {
        headers["content-encoding"] = "gzip";
        res.writeHead(r.statusCode ?? 200, headers);
        r.pipe(createGzip({ level: 9 })).pipe(res);
      } else {
        res.writeHead(r.statusCode ?? 200, headers);
        r.pipe(res);
      }
    });
    up.on("error", () => res.writeHead(502).end());
    req.pipe(up);
  });
  await new Promise((ok) => proxy.listen(port, "127.0.0.1", ok));
  return { close: () => (proxy.close(), origin.close()) };
}
