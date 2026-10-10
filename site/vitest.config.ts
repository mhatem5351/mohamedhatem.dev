/**
 * Unit tests for the data-to-render helpers (pure modules in src/lib and integrations) and the i18n parity check.
 * Astro-only modules (astro:assets, .astro components) are covered by the Playwright suite instead.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      "@content": fileURLToPath(new URL("../content", import.meta.url)),
      "@chat": fileURLToPath(new URL("../chat-widget/src", import.meta.url)),
    },
  },
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
