import { defineConfig } from "vitest/config";

/**
 * Unit tests (`npm test`). Two projects:
 *   worker  → worker/test/**\/*.test.ts in Node (the Worker code only uses web-standard APIs: fetch, streams,
 *             WebCrypto, TextEncoder; bindings are plain mocks).
 *   widget  → chat-widget/test/unit/**\/*.test.ts in happy-dom.
 * The widget's browser tests are Playwright (`npm run test:widget`), not Vitest.
 */
export default defineConfig({
  test: {
    globalSetup: ["./worker/test/global-setup.mjs"],
    projects: [
      {
        test: {
          name: "worker",
          include: ["worker/test/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "widget",
          include: ["chat-widget/test/unit/**/*.test.ts"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
