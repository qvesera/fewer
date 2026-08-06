---
title: v0.3.0: Theme Engine, 18 Presets, and a Lighter Bundle
date: 2026-08-06
description: Fewer 0.3.0 brings a structured custom theme engine with 18 presets, a draggable minimizable theme editor, and a bundle that's 300KB lighter after dead-code removal.
author: Yash Srivastava
tags: release, themes, performance, pwa
---

Today we ship **Fewer 0.3.0**: the biggest update since launch. This release focuses on three things: making the tool yours, making it faster to load, and making it feel like a real app.

## Pick From 18 Presets

Theming used to mean toggling light or dark. Now the sidebar opens a full **theme engine** with 18 carefully chosen presets:

Catppuccin, Nord, Dracula, Gruvbox, Tokyo Night, Rose Pine, Solarized, One Dark, One Light, GitHub Light, GitHub Dark, Material, and more.

Each preset is hand-tuned with Open Color values for consistent, accessible contrast: no more neon-on-neon.

## Build Your Own

Presets are just a starting point. Switch to **Custom** mode and get a structured editor with 16 color slots, each with its own opacity slider:

- **Canvas & Text**: background, primary/secondary text, hover, handles, edges
- **Folders**: body, text, secondary text, border, icon
- **Files**: body, text, secondary text, border, icon

Colors are picked with a full `HexAlphaColorPicker` and applied instantly as CSS variables. The editor is draggable and minimizable: collapse it into a dock pill that snaps to any canvas edge so it never blocks your graph.

## A Lighter, Faster Bundle

We cut dead weight and made the app feel quicker.

- **Removed dead `elkjs` import** in the layout module: dropped ~300KB
- **Removed 5 unused dependencies**: `@dagrejs/dagre`, `recharts`, `react-color`, `web-worker` were all in `package.json` but never imported
- **Deleted 8 unused shadcn components**: chart, calendar, command, carousel, drawer, form, input-otp, resizable
- **Lazy-loaded every dialog**: Export, Import, Settings, Help, Tutorial, and friends now load on demand via `next/dynamic`. The startup bundle is dramatically smaller, which means lower TBT and TTI on slower devices

## Better PWA Experience

- **512x512 icon** generated from the logo: fixes the Lighthouse splash-screen audit
- **Manifest icon sizes corrected**: previously claimed 192x192 but pointed at a 494x445 PNG. Now points to real 192x192 `logo-192.png`

## Everything in 0.3.0

- 18 theme presets
- Structured custom theme editor (16 slots + per-color opacity)
- Draggable, minimizable editor with edge-snapping dock
- Ellipsis-preserving overflow and lock-to-bounds
- ~300KB bundle reduction, 5 deps removed, 8 components deleted
- Lazy-loaded dialogs
- PWA splash screen + manifest fixes
- Theme-aware UI everywhere: buttons, sliders, switches, and icons follow your active theme

Try it now at [fewer.directory](https://fewer.directory), or run it locally with:

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Next up: collaborative editing, a diff view between directory versions, and plugin-based exports. Star the repo to follow along.
