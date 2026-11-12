import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Soldi's day is São Paulo's (D13); CI runners are UTC, a day ahead from 21:00. Workers inherit TZ.
const timezoneId = "America/Sao_Paulo";
process.env.TZ = timezoneId;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, timezoneId, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "pnpm dev", url: baseURL, reuseExistingServer: true },
});
