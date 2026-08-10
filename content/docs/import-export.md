---
title: Import & Export
description: Import directories from disk, GitHub, or files. Export your graph as SVG, PNG, JSON, CSV, DOT, shell scripts, or ASCII trees.
---

Fewer lets you import file trees in multiple formats, whether it is directly from your disk, a github url, or from a previously exported file.

## Import from Disk

1. Click **Import from disk** (or press **Alt+I**)
2. Select a folder in the file picker
3. Configure options:
   - Max scan depth
   - Max display depth
   - Include hidden files
   - Include file nodes
   - Extension filter
4. Click **Import**

The graph builds instantly with auto-layout. Large imports show a progress indicator.

### Browser Support

- **Chrome/Edge:** Full File System Access API: can read and write back to disk
- **Firefox/Safari:** `webkitdirectory` fallback: read-only import
- **Brave:** May require flag `brave://flags/#enable-experimental-web-platform-features`

## Import Options

### Max Scan Depth

How deep to scan the directory tree. `0` = no limit.

### Max Display Depth

How deep to display after import. Deeper nodes go to the Hidden Nodes panel.

### Advanced Options (Power User mode)

| Option | Default | Description |
| ------ | ------- | ----------- |
| Include Hidden Files | Off | Include dotfiles (`.gitignore`, `.env`, etc.) |
| Include node_modules | Off | Scan `node_modules` and dependency folders |
| Skip Empty Folders | On | Hide folders with no files inside |
| Show Files on Canvas | On | Show file nodes. Off = directories only |
| File Extensions | None | Comma-separated whitelist (e.g. `ts, tsx, js`) |
| Case-Sensitive Match | Off | Match extensions case-sensitively |

## Import from URL

Import a directory from a URL. Fewer supports two kinds of URLs:

### GitHub repositories

1. Click the GitHub icon or use Import dialog
2. Paste a repo URL (e.g., `https://github.com/owner/repo`)
3. Click **Import**

Supports branch and subdirectory URLs:

- `https://github.com/owner/repo`
- `https://github.com/owner/repo/tree/branch/path`

Fetches the repo tree via the `/api/github-tree` route.

### Public file index URLs

Fewer can also visualize any public directory listing that uses Apache or nginx auto-index format (the kind you see when a web server exposes a folder without an index page). Paste the URL and click **Import**:

- `https://example.com/data/`
- `https://www.sidc.be/EUI/data/`

The server crawls the index (breadth-first, up to 200 pages and 6 levels deep), parses folder/file entries and sizes, and builds the graph. Large listings are truncated with a notice. Results are cached for 24 hours, so repeat imports of the same URL load instantly.

## Import from File

Supported formats:

- **JSON**: previous Fewer export
- **ASCII tree**: `tree` command output
- **Shell/batch script**: `mkdir -p` output

Click **Import from File** and select your file. You can also paste content directly into the dialog.

## Export Formats

| Format | Extension      | Use Case                             |
| ------ | -------------- | ------------------------------------ |
| SVG    | `.svg`         | Vector, documentation, presentations |
| PNG    | `.png`         | Raster, slides, social media         |
| JSON   | `.json`        | Full graph state, re-import          |
| CSV    | `.csv`         | Tabular, spreadsheets                |
| DOT    | `.dot`         | Graphviz rendering                   |
| Script | `.sh` / `.bat` | Reproduce directory structure        |
| Tree   | `.txt`         | ASCII tree for docs/README           |

### Export Selected

Toggle **Export Selected** to export only the currently selected subtree instead of the full graph.

### PNG Options

- Adjustable quality (1-100)
- Transparent background toggle
- Theme-aware background color

## Keyboard Shortcuts

| Key        | Action             |
| ---------- | ------------------ |
| **Alt+I**  | Open import dialog |
| **Ctrl+E** | Open export panel  |
