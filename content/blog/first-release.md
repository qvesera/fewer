---
title: "Introducing Fewer: Turn Any Directory Into an Interactive Graph"
date: "2026-08-04"
description: "Meet Fewer — the open-source tool that transforms static directory trees into interactive, explorable graphs. Built with React Flow, Dagre, and a privacy-first philosophy."
author: "Yash Srivastava"
tags: ["launch", "release", "features"]
---

# Introducing Fewer: Turn Any Directory Into an Interactive Graph

We're excited to announce the first public release of **Fewer** — an interactive directory graph visualizer that runs entirely in your browser.

## The Problem

You need to understand a directory structure — a new codebase, a project to document, a mess to reorganize. Standard tools don't help:

- `tree` is static and overwhelming for large codebases
- File managers show one folder at a time
- `ls -R` is a wall of text

You scroll, search, switch contexts, and still miss the shape of it.

## The Solution

Fewer turns that tree into an interactive graph. Drag nodes, zoom in/out, rename files, add folders, and export in 7 formats — all in the browser, with nothing to install beyond a dev server.

## What You Can Do Today

**Explore** — Load any directory and watch it build into a clean graph with Dagre auto-layout. Use arrow keys to navigate the tree. Right-click any node for instant actions.

**Edit** — Rename files (F2), add new nodes (Alt+N), delete with cascading children (Delete), copy/paste subtrees (Ctrl+C/Ctrl+V). Undo/redo (Ctrl+Z/Ctrl+Shift+Z) with a 50-step history buffer.

**Search** — Fuzzy search across filenames, paths, and extensions. Click any result to zoom directly to that node. Hidden nodes appear with badges — click to reveal and zoom.

**Export** — Save your graph as SVG, PNG, JSON, CSV, DOT, shell scripts, or ASCII trees. Toggle "Export Selected" to grab just a subtree.

## Built for Privacy

Fewer runs entirely client-side. No telemetry, no data exfiltration, no config files modified outside the project. The only network call is an optional GitHub repo import for public repositories. Close the tab to disable instantly. Delete the repo to uninstall completely.

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **React 19** with TypeScript 5 strict mode
- **React Flow v12** for canvas rendering
- **Dagre** for auto-layout
- **Zustand** for state management
- **Tailwind CSS 4** with shadcn/ui
- **Prisma + SQLite** for persistence

## Get Started

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
npm install
npm run dev
```

Open `http://localhost:3000`, click **Load sample project**, and explore.

## What's Next

We're just getting started. Upcoming releases will bring:

- Plugin system for custom exporters and importers
- Collaborative editing with WebSocket sync
- Diff view between directory versions
- GitHub PR review visualization mode
- VS Code extension for in-editor preview

Star the repo and watch for updates. We'd love your feedback.