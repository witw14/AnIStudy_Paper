import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/desktop",
  outputDir: "./test-results/desktop-playwright",
  workers: 1,
  timeout: 40000,
  webServer: {
    command: "node server/index.mjs --production",
    url: "http://127.0.0.1:4319",
    env: {
      PORT: "4319",
      DATA_DIR: "test-results/desktop-data",
      DISABLE_DESKTOP: "1",
      DISABLE_ACQUISITION: "1",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
