---
title: Getting Started with Fewer
description: Install, import your first directory, and navigate the graph. Everything you need to start exploring directory structures visually.
---

There is a web version available at [https://app.fewer.directory/app](https://app.fewer.directory/app).

But if you want to run this locally, follow this quickstart guide.

## Installation

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Open `http://localhost:3000`.

## Quick Start

1. Click **Load sample project** in the welcome dialog
2. Use **arrow keys** (↑↓←→) to navigate the tree
3. **Right-click** (or **long-press** on touch) any node for context menu
4. Press **Ctrl+I** to see all keyboard shortcuts
5. Click **Export** to save the graph

## Import a Real Directory

1. Click **Import from disk** (or **Alt+I**)
2. Select a folder and the depth level
3. The graph builds instantly

## Advanced Import Options

If **Power User mode** is enabled in Settings, you will see the below options in the import dialog.

| Option                  | Default | Description                                   |
| ----------------------- | ------- | --------------------------------------------- |
| Max Depth               | 6       | How many folder levels to import              |
| Include Hidden Files    | Off     | Include dotfiles (`.gitignore`, `.env`, etc.) |
| Include File Cards      | On      | Show files or folders only                    |
| Extension Filter        | None    | Comma-separated whitelist                     |
| Auto-hide Large Folders | On      | Folders with >10 children hide children       |

## First Graph

After import, you'll see:

- **Orange cards** for folders (children inline, scrollable)
- **Purple cards** for files (name, extension, size)
- **Edges** connecting parent → child with 3 style options
- **Minimap** in bottom-right for navigation
- **Breadcrumb bar** showing selected node's full path

## Reload Persistence

The graph on your canvas is cached locally, so refreshing or reopening the app brings back the last graph — including node positions and edits — without re-importing. No account needed. Clearing the canvas removes the cache.

## Keyboard Navigation

| Key                       | Action                                 |
| ------------------------- | -------------------------------------- |
| **↑↓←→**                  | Tree navigation (parent/child/sibling) |
| **Alt+N**                 | New node                               |
| **Ctrl+F**                | Search (fuzzy, click-to-zoom)          |
| **Ctrl+E**                | Export panel                           |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / Redo                            |
| **Ctrl+A**                | Select all                             |
| **Ctrl+L**                | Cycle layout direction                 |
| **Ctrl+I**                | Shortcuts reference                    |
| **F2**                    | Rename                                 |
| **Delete/Backspace**      | Remove (cascading)                     |
| **Space**                 | Fit view                               |
| **+ / - / 0**             | Zoom in/out/reset                      |

## Sign In (Optional)

Fewer works fully without an account. If you'd like to save your directories to your account, access them across devices, and share them, click **Sign in** in the top navbar. See [Accounts & Saved Graphs](/docs/accounts) for details.

## What's Next

- [Graph Features](/docs/graph-features)
- [Import & Export](/docs/import-export)
- [Sharing Graphs](/docs/sharing)
- [Accounts & Saved Graphs](/docs/accounts)
- [Keyboard Shortcuts](/docs/shortcuts)
- [Theming](/docs/theming)
- [Deployment & Self-Hosting](/docs/deployment)
