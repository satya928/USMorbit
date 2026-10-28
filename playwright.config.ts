import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://orbit:orbit@localhost:5432/orbit_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/mock-google.mjs",
      url: "http://localhost:4555/health",
      reuseExistingServer: false,
      env: { MOCK_GOOGLE_PORT: "4555", MOCK_GOOGLE_CLIENT_ID: "e2e-client" },
    },
    {
      command: process.env.E2E_SERVER_COMMAND ?? `npx next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DATABASE_URL,
        STORAGE_DIR: "./storage-e2e",
        DEMO_MODE: "true",
        AI_API_KEY: "",
        NEXT_DIST_DIR: ".next-e2e",
        APP_URL: `http://localhost:${PORT}`,
        GOOGLE_CLIENT_ID: "e2e-client",
        GOOGLE_CLIENT_SECRET: "e2e-secret",
        GOOGLE_OAUTH_TEST_BASE: "http://localhost:4555",
      },
    },
  ],
});
