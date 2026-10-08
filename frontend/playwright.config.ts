/**
 * Route accessibility and visual checks (redesign Phase 7), against the
 * offline fake stack: the API in memory with fake identity and LLM, seeded by
 * scripts/seed_demo.py, and the production build served by `vite preview`.
 *
 *   npm run build && npm run e2e
 *
 * Ports default away from the dev servers (8100/5174, 8110/5184). Locally an
 * already running stack on these ports is reused; set E2E_CHANNEL=msedge to
 * use the installed Edge instead of a downloaded Chromium.
 */
import { defineConfig, devices } from "@playwright/test";

import { apiPort, webPort } from "./e2e/env";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  use: {
    baseURL: `http://127.0.0.1:${webPort}/knowledge/`,
    channel: process.env.E2E_CHANNEL,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL } }],
  webServer: [
    {
      command: `uv run python -m knowledge_portal.interfaces.api.serve --host 127.0.0.1 --port ${apiPort}`,
      cwd: "..",
      url: `http://127.0.0.1:${apiPort}/ready`,
      reuseExistingServer: !ci,
      timeout: 120_000,
      env: {
        LLM_PROVIDER: "fake",
        PERSISTENCE_PROVIDER: "memory",
        IDENTITY_PROVIDER: "fake",
        LIBRARY_SCAN_MODE: "offline",
        PROVIDER_RATE_LIMIT_PER_MINUTE: "0",
      },
    },
    {
      command: `npx vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}/knowledge/`,
      reuseExistingServer: !ci,
      timeout: 60_000,
      env: { KNOWLEDGE_API_PORT: apiPort },
    },
  ],
});

