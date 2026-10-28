#!/usr/bin/env bun
/**
 * Regenerate the raster brand assets from `public/logo.svg` — the source of
 * record (T-206):
 *
 *   public/logo.png       natural size at 96 dpi (494 × 445)
 *   public/logo-192.png   192 square, art at full width, vertically centred
 *   public/logo-512.png   the same framing at 512
 *
 * Transparent background, like the icons the manifest and the apple-touch
 * entry claim. Run after any change to the drawing — together with
 * `bun scripts/og-card.ts` (share card) and the brandAssets guard, which
 * fails `bun run test` if a copy goes stale:
 *
 *   bun scripts/logo-assets.ts
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const svg = readFileSync(resolve("public/logo.svg"), "utf8")
  .replace(/<\?xml[\s\S]*?\?>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .trim();

/** viewBox height / width — the art's aspect. */
const RATIO = 117.71568 / 130.69282;

/** One composition: the art fills the canvas width, centred vertically. */
async function shot(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  out: string,
  width: number,
  height: number,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const artH = Math.round(width * RATIO);
  const top = Math.round((height - artH) / 2);
  await page.setContent(
    `<!doctype html><style>` +
      `html,body{background:transparent;margin:0;padding:0}` +
      `body{width:${width}px;height:${height}px;overflow:hidden}` +
      `svg{display:block;width:${width}px;height:${artH}px;margin-top:${top}px}` +
      `</style>${svg}`,
  );
  await page.waitForTimeout(50); // let the gradient paint before capture
  writeFileSync(out, await page.screenshot({ type: "png", omitBackground: true }));
  await page.close();
}

const browser = await chromium.launch();
await shot(browser, resolve("public/logo.png"), 494, 445);
await shot(browser, resolve("public/logo-192.png"), 192, 192);
await shot(browser, resolve("public/logo-512.png"), 512, 512);
await browser.close();
console.log("regenerated logo.png, logo-192.png, logo-512.png from public/logo.svg");
