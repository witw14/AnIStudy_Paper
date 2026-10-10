import { defineConfig } from "@playwright/test";
// Each run gets a fresh database so earlier edited demos and newly created
// workspaces cannot affect graph fixtures or the initial workspace selection.
const dataDir =
  process.env.ANISTUDY_E2E_DATA_DIR || `test-results/e2e-data-${Date.now()}`;
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  workers: 1,
  use: {
    channel: "chrome",
    baseURL: "http://127.0.0.1:4318",
    viewport: { width: 1512, height: 982 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node server/index.mjs",
    url: "http://127.0.0.1:4318",
    env: {
      PORT: "4318",
      DATA_DIR: dataDir,
      DISABLE_DESKTOP: "1",
      DISABLE_ACQUISITION: "1",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
