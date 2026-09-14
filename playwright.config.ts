import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("E2E journeys create development fixtures and require a local test server.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    timezoneId: "UTC",
    reducedMotion: "reduce",
    // Traces can record auth request bodies. Keep seeded credentials out of artifacts.
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      APP_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      APP_ENV: "development",
      ALLOW_DEV_SEED: "true",
      ALLOW_DEMO_FUNDING: "true",
    },
  },
});
