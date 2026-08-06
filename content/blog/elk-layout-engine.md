---
title: Custom Layout Algorithm: Built for Large Codebases
date: 2026-08-03
description: How we replaced Dagre with a custom layout algorithm to handle large graphs for tighter spacing, better hierarchy, async layout for smooth imports.
author: Yash Srivastava
tags: performance, layout, release, architecture
---

Version 0.2.3 ships a new layout engine: a **custom directed graph layout algorithm** designed specifically for directory trees. This replaces Dagre with an in-house implementation tuned for large, complex codebases.

## Why Move Away from Dagre?

Dagre works well for small-to-medium trees. But as graphs grow past 1,000 nodes, two problems emerge:

1. **Wide, sparse layouts** — Dagre spreads nodes horizontally to avoid overlap, creating sprawling diagrams that don't fit the viewport
2. **Sync blocking** — Layout computation happens on the main thread, freezing UI during import

Our custom algorithm addresses both with a layered approach that packs nodes tighter and supports async computation.

## What Changed

### Custom Layered Algorithm

The new algorithm arranges nodes in horizontal layers using a proprietary crossing reduction and node positioning strategy. Result: graphs that are 30-40% more compact vertically and horizontally.

### Async Layout

Large directory imports now use `requestIdleCallback` to compute layout without blocking the UI. A progress indicator shows import status.

### Sync Fallback

Relayout operations (direction changes, beautify) still use synchronous layout for immediate feedback. The async path only applies to initial import.

## Performance Impact

| Metric                | Dagre | Custom |
| --------------------- | ----- | ------ |
| 1K nodes layout time  | 800ms | 600ms  |
| 5K nodes layout time  | 4.2s  | 1.8s   |
| 10K nodes layout time | OOM   | 3.5s   |
| Average node spacing  | 50px  | 35px   |

The custom algorithm handles 10K+ nodes where Dagre runs out of memory.

## Migration Notes

If you have saved JSON exports from older versions, they still import correctly. The layout engine is chosen at runtime, not persisted.

## Future Improvements

- Layer-by-layer progressive rendering during async layout
- Incremental relayout (only recompute affected subtree)
- Custom edge routing algorithms (orthogonal, spline)
