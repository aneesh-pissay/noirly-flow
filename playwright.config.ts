import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT } from "./e2e/env";

/**
 * End-to-end tests run against a production build on :3102 with its own
 * MongoDB database (`noirly-flow-e2e`, wiped before every run) and its own
 * build folder (`.next-e2e`), so they never touch your dev data or `.next`.
 *
 *   pnpm test:e2e          build, serve, run everything
 *   pnpm test:e2e:ui       Playwright's UI runner
 *
 * Needs MongoDB on 127.0.0.1:27017 (or set E2E_MONGODB_URI). Identity and
 * noirly-realtime are NOT needed: tests sign in with a session cookie minted
 * from a test-only AUTH_SECRET (see e2e/global-setup.ts), and realtime is off.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    timeout: 5 * 60 * 1000,
    reuseExistingServer: !process.env.CI,
    env: E2E_ENV,
  },
});
