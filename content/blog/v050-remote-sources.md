---
title: v0.5.0: Open & Download Remote Sources From Your Graph
date: 2026-08-18
description: Files imported from GitHub repos or public file indexes now remember where they came from. Right-click any such node to open it in GitHub or at its source, or download crawled files directly.
author: Yash Srivastava
tags: release, github, import, cloud
---

A directory graph is only useful if it connects you back to the real world. **v0.5.0** closes that loop: nodes imported from a GitHub repository or a public file index now remember their **source URL**, and the right-click menu uses it to take you (or a downloaded copy) straight to the real thing.

## Where Graph Nodes Come From

You can build a Fewer graph from three kinds of external source:

- a local folder or file,
- a GitHub repository,
- a **public file index** — Apache/nginx auto-index pages, crawled at import.

Until now, a node from GitHub or a file index was just a name and a type on the canvas. If you wanted the actual file, you went back to the browser and re-found it manually. v0.5.0 fixes that.

## Open at the Source

When you import from GitHub or a public file index, every node inherits a source `webUrl`. The right-click menu now offers:

- **"Open in GitHub"** — folders open GitHub's tree view, files the blob view.
- **"Open in `<host>`"** — for public-index entries, jumping straight to the listing or the direct item URL.

So your graph becomes a browseable map of a remote directory, not just a static snapshot.

## Download Crawled Files

For files pulled from a public file index, the context menu offers **Download** — which saves the raw file — replacing the old "Open in site" option that just navigated to the raw URL and downloaded anyway. Downloads fetch cross-origin where CORS permits (so the saved filename is controlled) and fall back to the browser's native link behavior otherwise.

Folders from an index and everything from a GitHub repo keep **Open in GitHub / Open in `<site>`**. The two actions split exactly along the line that makes sense: navigate to a folder's source, download a file's bytes.

## What This Means for You

- **From graph to ground truth** — right-click a GitHub node and jump to the exact blob or tree.
- **One-click file retrieval** — download crawled files straight from the graph, with reliable filenames.
- **Remote-first exploration** — a crawled or GitHub-imported directory becomes browsable end to end.

Import a public index or GitHub repo (via **Import → URL**, signed in), right-click a file, and jump to its source:

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Your graph keeps getting closer to the real filesystems it describes.