/**
 * Route accessibility checks and keyboard journeys, against the offline fake
 * stack: the API in memory with fake identity and LLM, seeded by
 * scripts/seed_demo.py, and the production build served by `vite preview`.
 *
 *   npm run build && npm run e2e
 *
 * Ports default away from the dev servers (8100/5174, 8110/5184). Locally an
 * already running stack on these ports is reused; set E2E_CHANNEL=msedge to
 * use the installed Edge instead of a downloaded Chromium.
 */
import { defineConfig, devices } from "@playwright/test";

import { basePath } from "./basePath";
import { apiPort, webPort } from "./e2e/env";

const ci = Boolean(process.env.CI);
// The same build-time setting the app is served under; e2e follows it instead
// of hard-coding /knowledge/.
const base = basePath(process.env.KNOWLEDGE_BASE_PATH);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${webPort}${base}`,
    channel: process.env.E2E_CHANNEL,
    // A preinstalled browser binary (sandboxes that must not download one).
    launchOptions: { executablePath: process.env.E2E_EXECUTABLE },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /-journey\.spec\.ts/, use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL } },
    // The same axe pass in the dark theme: its contrast otherwise rests on the
    // token matrix alone, which cannot see component CSS.
    { name: "a11y-dark", testMatch: /a11y\.spec\.ts/, use: { ...devices["Desktop Chrome"], colorScheme: "dark", channel: process.env.E2E_CHANNEL } },
    // And at a phone-ish width, where reflow and overflow issues appear.
    { name: "a11y-narrow", testMatch: /a11y\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 600, height: 900 }, channel: process.env.E2E_CHANNEL } },
    // Journeys that change the seed run last, after every route has been checked as seeded.
    { name: "journeys", testMatch: /-journey\.spec\.ts/, dependencies: ["chromium", "a11y-dark", "a11y-narrow"], use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHANNEL } },
  ],
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
      url: `http://127.0.0.1:${webPort}${base}`,
      reuseExistingServer: !ci,
      timeout: 60_000,
      env: { KNOWLEDGE_API_PORT: apiPort },
    },
  ],
});

