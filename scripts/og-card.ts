#!/usr/bin/env bun
/**
 * Regenerate `public/og.png` — the 1200×630 Open Graph card shared links
 * unfurl with (T-173). Committed asset, like `public/demo.png`: the card
 * should not age every time the landing page layout moves, and the build
 * needs no image service.
 *
 * Standalone HTML + the mark inlined from public/logo.svg (the asset stays
 * the source of record) — Geist loads from Google Fonts at
 * regeneration time only — the committed PNG carries the pixels. Offline,
 * the card falls back to system-ui; the script still writes a valid PNG.
 *
 *   bun scripts/og-card.ts [outfile]
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.argv[2] ?? "public/og.png");

const logoSvg = readFileSync(resolve("public/logo.svg"), "utf8")
  .replace(/<\?xml[\s\S]*?\?>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .trim();

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #fafafa; background: #0a0a0b;
    background-image: radial-gradient(circle, rgba(255,255,255,0.09) 1.3px, transparent 1.3px);
    background-size: 24px 24px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 64px 72px;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand svg { height: 60px; width: auto; display: block; }
  .brand span { font-size: 38px; font-weight: 700; letter-spacing: -0.02em; }
  h1 { font-size: 52px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; max-width: 920px; }
  .sub { margin-top: 18px; font-size: 21px; font-weight: 400; color: #a1a1aa; max-width: 780px; line-height: 1.45; }
  .foot { display: flex; align-items: center; gap: 10px; font-family: "Geist Mono", ui-monospace, monospace; font-size: 15px; letter-spacing: 0.08em; }
  .dot { width: 9px; height: 9px; border-radius: 9999px; background: #ff8c00; }
  .host { color: #ff8c00; }
  .sep, .extra { color: #52525b; }
</style></head>
<body>
  <div class="brand">${logoSvg}<span>fewer</span></div>
  <div>
    <h1>See everything inside any folder, at once.</h1>
    <p class="sub">Open a folder and everything inside appears on one screen — search it, tidy it up, take what you need.</p>
  </div>
  <div class="foot"><span class="dot"></span><span class="host">fewer.directory</span><span class="sep">·</span><span class="extra">open source · runs in your browser</span></div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT });
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
