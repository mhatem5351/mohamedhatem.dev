#!/usr/bin/env node
/**
 * `npm run dev:worker`: .dev.vars (if missing) → `wrangler dev` on http://127.0.0.1:8790.
 * Serves the site build from ./dist when it exists; otherwise worker/dev-assets (a placeholder page), so the API can
 * be developed before or without the site build and nothing is written to dist/.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const vars = spawnSync(process.execPath, [join(root, "worker/scripts/dev-vars.mjs"), "--if-missing"], { stdio: "inherit" });
if (vars.status) process.exit(vars.status);

const args = ["wrangler", "dev", ...process.argv.slice(2)];
if (!existsSync(join(root, "dist"))) {
  console.log("dev: no dist/ yet, serving worker/dev-assets instead (the API works the same).");
  args.push("--assets", "worker/dev-assets");
}
const child = spawn("npx", args, { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
