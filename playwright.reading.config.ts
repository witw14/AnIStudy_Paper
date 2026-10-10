import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/reading-e2e",
  outputDir: "./test-results/reading-playwright",
  workers: 1,
  timeout: 45000,
  use: {
    channel: "chrome",
    baseURL: "http://127.0.0.1:4320",
    viewport: { width: 1512, height: 982 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/reading-server.mjs",
    url: "http://127.0.0.1:4320",
    env: {
      DATA_DIR: `test-results/reading-e2e-data-${Date.now()}`,
      PORT: "4320",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
