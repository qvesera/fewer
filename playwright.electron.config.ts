import { defineConfig } from "@playwright/test";

// Electron smoke config (T-097) — deliberately minimal: no webServer (the
// shell serves its own static export over app://), no browser projects
// (`_electron` drives the electron binary, not a Playwright browser).
// CI: xvfb-run -a bunx playwright test --config playwright.electron.config.ts
export default defineConfig({
  testDir: "./e2e",
  testMatch: /electron\.spec\.ts/,
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
});
