import { defineConfig } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./e2e/env";

/**
 * Docs capture: records one walkthrough per documented feature, plus its
 * screenshots, against the same isolated server the e2e tests use — its own
 * MongoDB database (wiped first), test-only sessions, no Identity, no
 * realtime, no production data. See docs/DOCS-SYSTEM.md.
 *
 *   pnpm docs:capture                     every article with a video
 *   DOCS_ONLY=quick-add,timeline pnpm docs:capture
 */
export default defineConfig({
  testDir: "./docs-pipeline/capture",
  testMatch: "capture.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results/docs-capture",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "docs-pipeline/.captures/report.json" }]],
  use: {
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  expect: { timeout: 10_000 },
  webServer: {
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    timeout: 10 * 60 * 1000,
    reuseExistingServer: true,
    env: E2E_ENV,
  },
});
