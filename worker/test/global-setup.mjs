import { execFileSync } from "node:child_process";

/** Generates worker/src/generated/content.ts (from content/chat/* or the fixtures) before any test imports it. */
export default function setup() {
  execFileSync(process.execPath, ["worker/scripts/gen-content.mjs", "--quiet"], { stdio: "inherit" });
}
