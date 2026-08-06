---
title: Aurora Haze: A New Visual Identity for Fewer
date: 2026-08-05
description: How we designed and implemented the Aurora Haze design system: a subtle warm atmospheric effects, motion tokens, and a refined sidebar that makes directory exploration feel alive.
author: Yash Srivastava
tags: design, theme, ux, release
---

Version 0.2.5 introduces **Aurora Haze**: a cohesive design language that transforms Fewer from a functional tool into a visually distinctive experience.

## What Changed

### Atmospheric Sidebar

The sidebar now uses `gm-aurora gm-aurora-warm` for subtle warm atmospheric tint. Section cards have subtler borders (`border-border/20`), lighter backgrounds (`bg-card/5`), and cleaner hover states.

The footer redesign replaces text blobs with a structured shortcut-hint grid using `<kbd>` chips. All secondary action icons standardized to `h-3.5 w-3.5`.

### Motion Tokens

New CSS variables for consistent Aurora Haze transitions:

```css
--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1);
--dur-aurora: 200ms;
```

These tokens power every hover, expand, and state change in the sidebar — giving the interface a unified, polished feel.

### Unified Settings Dialog

Previously scattered controls now live in a single tabbed Settings dialog:

- **About** — version, description, GitHub/website links, credits
- **Appearance** — theme mode, custom theme editor, show files toggle
- **Advanced** — power user toggle, minimap controls, node dimension sliders
- **Help** — shortcuts, bug report, tutorial restart, issue links

Opened via gear icon in the navbar.

### Reusable SlidingToggle

Extracted from Edge Motion into a generic multi-option toggle with sliding indicator + glow animation. Now powers Edge Style, Edge Motion, and Stroke Pattern controls.

### Sidebar Layout Cleanup

Split dense "Layout & Edges" section into focused subsections:

- **Layout** — direction, depth, auto-hide, beautify
- **Edges** — style, motion, stroke, weight (collapsed by default)

Max Display Depth and Auto-hide threshold sliders now only visible in advanced mode.

## Design Philosophy

Aurora Haze follows three principles:

1. **Subtlety over noise** — atmospheric effects should enhance, not distract
2. **Consistency through tokens** — motion, color, and spacing derive from a shared vocabulary
3. **Progressive disclosure** — advanced controls hidden until needed

## What's Next

Future releases will extend Aurora Haze to:

- Canvas background effects (subtle grid, depth fog)
- Node entrance animations
- Theme-aware edge glow on selection
- Export themes (light/dark variants for SVG/PNG)
