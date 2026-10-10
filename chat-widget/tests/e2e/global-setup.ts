import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Builds chat-widget/dist (the demo loads the built bundle), so `playwright test` alone is enough. */
export default function globalSetup(): void {
  execFileSync(process.execPath, [fileURLToPath(new URL("../../scripts/build.mjs", import.meta.url))], { stdio: "ignore" });
}
