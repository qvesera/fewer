#!/usr/bin/env bun
/**
 * Regenerate `public/demo.png` — the hero screenshot on the marketing home
 * page and in the README (T-149), so the asset stops going stale whenever the
 * canvas changes.
 *
 * Needs the web build served locally, e.g.:
 *   bun run build
 *   HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js &
 *   bun scripts/marketing-shot.ts [outfile]
 *
 * The asset has always been 2517×1265 (~2:1); the viewport below reproduces
 * that shape at deviceScaleFactor 2, so swapping the file never changes the
 * page layout.
 */
import { chromium } from "playwright";

const URL = process.env.DEMO_URL ?? "http://127.0.0.1:3000/app";
const OUT = process.argv[2] ?? "public/demo.png";

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1258, height: 633 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // First visit would open the tutorial overlay and block the click.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fewer-tutorial-dismissed", "true");
      localStorage.setItem("fewer-tutorial-beginner-done", JSON.stringify([]));
    } catch {
      /* ignore */
    }
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Load [Ss]ample/ }).first().click({ timeout: 30_000 });
  await page.locator(".react-flow__node").first().waitFor({ timeout: 30_000 });
  // Cards are measured and laid out over a few frames; shot too early and the
  // tree is still sliding into place.
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: OUT });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
