---
title: "ELK Layout Engine: Compact, Balanced Trees for Large Codebases"
date: "2026-07-15"
description: "How we replaced Dagre with ELK's layered algorithm to handle 10K+ node graphs — tighter spacing, better hierarchy, async layout for smooth imports."
author: "Yash Srivastava"
tags: ["performance", "layout", "release", "architecture"]
---

# ELK Layout Engine: Compact, Balanced Trees for Large Codebases

Version 0.3.2 ships a new layout engine: **ELK (Eclipse Layout Kernel)** via `elkjs`. This replaces Dagre with a layered algorithm designed for large, complex diagrams.

## Why ELK?

Dagre works well for small-to-medium trees. But as graphs grow past 1,000 nodes, two problems emerge:

1. **Wide, sparse layouts** — Dagre spreads nodes horizontally to avoid overlap, creating sprawling diagrams that don't fit viewport
2. **Sync blocking** — Layout computation happens on the main thread, freezing UI during import

ELK addresses both with a layered approach that packs nodes tighter and supports async computation.

## What Changed

### Layered Algorithm

ELK arranges nodes in horizontal layers (rank, order, layer) using a sophisticated crossing reduction algorithm. Result: graphs that are 30-40% more compact vertically and horizontally.

### Async Layout

Large directory imports now use `requestIdleCallback` to compute layout without blocking the UI. A progress indicator shows import status.

### Sync Fallback

Relayout operations (direction changes, beautify) still use synchronous layout for immediate feedback. The async path only applies to initial import.

## Performance Impact

| Metric | Dagre | ELK |
|--------|-------|-----|
| 1K nodes layout time | 800ms | 600ms |
| 5K nodes layout time | 4.2s | 1.8s |
| 10K nodes layout time | OOM | 3.5s |
| Average node spacing | 50px | 35px |

ELK handles 10K+ nodes where Dagre runs out of memory.

## Migration Notes

If you have saved JSON exports from older versions, they still import correctly. The layout engine is chosen at runtime, not persisted.

## Future Improvements

- Layer-by-layer progressive rendering during async layout
- Incremental relayout (only recompute affected subtree)
- Custom edge routing algorithms (orthogonal, spline)