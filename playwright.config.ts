import { defineConfig, devices } from "@playwright/test";

// Overridable so the suite can run next to a `bun run dev` on 3000 (e.g. while
// verifying a change by hand): PORT=3100 bunx playwright test.
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The Electron smoke has its own config (playwright.electron.config.ts) and
  // its own CI job — it must not boot the webServer or need a built shell here.
  testIgnore: ["**/electron.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    // Production build then serve the standalone output (mirrors `bun run build`).
    command: "bun run build && node .next/standalone/server.js",
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: String(PORT),
      // Production build must honour ?tier= so the Pro-only flows (the
      // corner-grip split) are exercisable in CI. Inlined at build time, and
      // unset in every other build — see devTier.ts (#285).
      NEXT_PUBLIC_ALLOW_TIER_OVERRIDE: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
