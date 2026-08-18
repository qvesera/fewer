---
title: v0.3.1: A Faster, Lighter Fewer
date: 2026-08-08
description: How we cut dead weight and lazy-loaded every dialog to make Fewer start faster and feel snappier — dead code removal, 5 dropped dependencies, and dialogs that only load when you open them.
author: Yash Srivastava
tags: release, performance, pwa
---

Alongside the 18-theme engine in **v0.3.0**, we spent the harder half of that release on speed. v0.3.1 is the payoff: a bundle that is roughly **300KB lighter**, a startup that loads dialogs on demand, and a PWA that finally passes the splash-screen audit. Same features, less to download.

## Cutting Dead Weight

Dead code is a tax you pay on every visit, so we went hunting.

- **Removed an unused `elkjs` import** in the layout module — worth about 300KB. The old ELK engine is long gone (we shipped a custom Reingold-Tilford layout instead), but its import hung around and pulled the whole library into the bundle.
- **Dropped five unused dependencies** from `package.json`: `@dagrejs/dagre`, `recharts`, `react-color`, and `web-worker` were declared but never imported.
- **Deleted eight unused shadcn components** — `chart`, `calendar`, `command`, `carousel`, `drawer`, `form`, `input-otp`, `resizable` — none of which were referenced by app code.

None of these were doing anything for you. Each one was downloaded, parsed, and held in memory on every page load.

## Lazy-Loaded Dialogs

Every dialog — Export, Import, Settings, Help, Tutorial, and friends — used to ship in the startup bundle. But you almost certainly weren't opening *Export* while the app was still loading, so why pay for it upfront?

All twelve dialogs now load via `next/dynamic` **only when you open them**. That shrinks the startup bundle dramatically: fewer long tasks, lower total blocking time (TBT), and faster time-to-interactive (TTI) — especially on slower devices, where it really shows.

## PWA Fixes

- Generated a real **512x512 icon** from the logo (square-padded, no letterboxing), so the manifest now lists proper 192 and 512 icons — fixing the Lighthouse `splash-screen` failure.
- **Corrected misleading manifest icons**: the manifest claimed 192x192 but pointed at a 494x445 PNG. Now it points at a real 192x192 `logo-192.png`.

## What This Means for You

- **Faster first load** — less JavaScript to download and parse.
- **Faster interaction** — dialogs no longer compete with the main bundle for the main thread.
- **Installable app** — the PWA now installs cleanly with a proper splash screen.

Just open [app.fewer.directory](https://app.fewer.directory) and feel the difference — or build it yourself:

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Fewer stays fully client-side, fast to load, and yours to keep.