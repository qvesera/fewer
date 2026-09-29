---
title: Import & Export
description: Import directories from disk, GitHub, or files. Export your graph as SVG, PNG, JSON, CSV, DOT, shell scripts, or ASCII trees.
---

Fewer lets you import file trees in multiple formats, whether it is directly from your disk, a github url, or from a previously exported file.

Every source goes through one **3-step import dialog**:

1. **Origin** — pick where the tree comes from: folder, file, archive, URL, or a linked cloud account
2. **Options** — the same configuration panel for every origin (depth, hidden files, filters, …)
3. **Import** — a summary of what will be imported, then **Import** (labelled
   **Browse** for folders, because pressing it opens your device's folder picker)

Press **Enter** to move through the steps. The same dialog is reachable from
**Import from disk**, **Import from file**, **Import from URL**, and the cloud
sources in the sidebar.

While an import runs, the step-3 panel shows a **progress bar** and the current
phase: a real percentage where the total is known (reading the picked folder,
building the graph) and an animated bar for network-bound steps (fetching a URL,
listing a cloud folder, reading an archive). You can close the dialog while an
import is running — the run stops reporting back, so it will not pop a toast or
close a dialog you reopened in the meantime.

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

The graph builds instantly with auto-layout. Large imports show a progress bar
with the current phase and, once the file count is known, a percentage.
Dismissing the folder picker simply cancels the import and returns you to the
summary — nothing is loaded.

### Drag & Drop (empty canvas)

**Disabled in the web build.** Dropping a folder from your OS onto the canvas to
import it directly (and dropping onto a populated canvas to expand it from disk)
uses File System Access handles and OS drop events, which are switched off by the
`LOCAL_FS_FEATURES` flags in `src/lib/fewer/features.ts`. Use **Import from
disk** instead — the options are identical.

### Browser Support

- **Chrome/Edge:** File System Access directory picker where enabled; the
  shipped build falls back to `webkitdirectory` (read-only import)
- **Firefox/Safari:** `webkitdirectory` fallback: read-only import
- **Brave:** May require flag `brave://flags/#enable-experimental-web-platform-features`

## Import Options

### Max Scan Depth

How deep to scan the directory tree. `0` = no limit.

### Max Display Depth

How deep to display after import. Deeper nodes go to the Hidden Cards panel.

### Advanced Options (Power User mode)

| Option                                 | Default | Description                                        |
| -------------------------------------- | ------- | -------------------------------------------------- |
| Include Hidden Files                   | Off     | Include dotfiles (`.gitignore`, `.env`, etc.)      |
| Include dependency &amp; build folders | Off     | Scan `node_modules`, `dist`, `build`, `.git`, etc. |
| Skip Empty Folders                     | On      | Hide folders with no files inside                  |
| Show Files on Canvas                   | On      | Show file nodes. Off = directories only            |
| Look Inside Archives                   | Off     | Show what's inside archives found in the folder    |
| File Extensions                        | None    | Comma-separated whitelist (e.g. `ts, tsx, js`)     |
| Case-Sensitive Match                   | Off     | Match extensions case-sensitively                  |
| Symlinks                               | Show as links | How the walk treats symbolic links (see below) |

### Symlinks

Symbolic links are detected on **local-path imports** (when the dropped folder
reaches the dev server as a disk path). Three modes:

- **Show as links** (default) — each link imports as a node carrying its target
  (`latest ↷ v012`), with a link icon, a target badge on the card, a dashed
  edge and an arrowhead pointing at it. Links are never dropped as "empty
  folders"; broken links (missing target) stay visible with a warning ring.
- **Follow** — additionally imports the *content* of links whose target lies
  **outside** the imported root (e.g. a link to `/mnt/raid/...`). Internal
  links always render as links — their content already lives at its real
  location in the graph — and cycles (self-referencing link loops) terminate
  safely.
- **Skip** — drops links entirely (the pre-v0.8 behavior).

On the canvas, right-click a link card → **Info** for **Copy Target Path**,
**Go to Target** (jumps to the target node when it's inside the graph) and
**Open Target in File Explorer**. Search matches link targets too, and the
Stats panel counts symlinks.

Exports carry the link signal: SVG/PNG draw the icon, badge, contrast edge and
arrowhead; JSON round-trips the metadata; the tree export writes shell-style
`name -> target` lines (and the ASCII tree parser understands them back);
CSV gains a `symlink_target` column and DOT marks link nodes and edges.

> **Browser limitation:** the File System Access picker (Chrome/Edge directory
> picks and drag-and-drop inside the browser) cannot see symlinks — the API
> resolves them transparently, so linked folders are walked like normal
> folders there. The option applies to local-path imports.

### Look Inside Archives

Turn on **Advanced Options → Look Inside Archives** and a folder import also
expands the archives it finds, so `imports/` shows what's inside a
`release.zip` instead of a single file card.

- **Off by default**, because it multiplies node count. The setting is
  remembered with your other import preferences, and is clamped off whenever
  advanced options are hidden.
- **All the same formats** as the Archive origin: `.zip`, `.tar`, `.tar.gz`,
  and the 7z/RAR/xz/bzip2/Zstandard family.
- **Nothing is extracted** — the archive's listing is read in place, exactly
  like the Archive origin, and the archive card is marked so it is not mistaken
  for a real folder. Disk actions (Open in File Explorer, Refresh from Disk)
  are correctly unavailable on it.
- **One level deep.** An archive found *inside* an archive stays a file card.
- **Depth limits still apply**, so the Max Scan Depth slider governs how far
  inside an archive the graph goes.
- **Ceilings**, so a folder of archives cannot swamp the canvas: at most 200
  archives per import, and 20,000 entries inside any one of them. Formats that
  must be read end-to-end rather than seeked (gzip, and the wasm-engine
  formats) are skipped above 64 MB; the reason is reported in a single toast.

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

### Internet Archive URLs

[Internet Archive](https://archive.org) items are imported via the archive.org metadata API — a single request returns the item's complete file tree, so there is no page/depth limit and no truncation:

- `https://archive.org/details/msdos_Prince_of_Persia_1990`
- `https://archive.org/download/<identifier>/...`

Auto-generated files (thumbnails, item tiles, `_meta.xml`) are filtered out. Every file and folder carries its archive.org URL, so the right-click **Download** / **Open in archive.org** actions work as usual. Results are cached for 24 hours like other URL imports.

## Import from File

Supported formats:

- **JSON**: previous Fewer export
- **ASCII tree**: `tree` command output
- **Shell/batch script**: `mkdir -p` output

Click **Import from File** and select your file. You can also paste content directly into the dialog.

## Import from Archive

Visualize a compressed folder without extracting it. Pick **Archive** as the origin, choose the file, and the same options panel and graph builder as every other origin apply.

| Format                | How it is read                                              |
| --------------------- | ----------------------------------------------------------- |
| `.zip`                | The central directory, which stores the full listing uncompressed — the archive body is never read |
| `.tar`                | 512-byte headers, skipping each entry's payload by its declared size |
| `.tar.gz` / `.tgz`    | The same tar walk, inflated with the browser's native gzip support |
| `.gz` (single file)   | One member, named after the file minus `.gz`                 |

Notes:

- **Nothing is unpacked.** The listing is read in place and the graph is built from it, so a multi-gigabyte archive costs only the size of its directory table. Your files never leave the browser.
- **Sizes are real**, read from the archive metadata, and feed the same sorting and stats panels as a disk import.
- **Import options apply as usual** — depth limits, hidden files, dependency/build folders, and the extension filter all work on the archive's contents.
- **The entry cap is 20,000.** Larger archives import their first 20,000 entries and show a truncation notice.
- **Not yet readable:** 7z, RAR, xz, bzip2, and Zstandard. These need a full decompressor, which browsers do not provide natively; the error message says so by name rather than failing vaguely.

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

Toggle **Export Selected** to export only the selected subtree.

### Image Exports Mirror the Active View

SVG and PNG render exactly what the active graph view shows, not the raw graph state:

- cards the view hides stay out of the image (hidden children still appear as faded rows inside their folder card)
- per-view card positions and the view's own derived layout (Layout Direction override, Crown Shyness intensity, sibling sort) are used as-is
- collapsed folders export as their one-line pill
- tag rings and tag dots use the same colors as the canvas
- the current selection carries over: each selected card gets the themed selection ring outside its border, and every edge on a selected card's ancestor path is highlighted in the same folder/file colors and 3px width the canvas uses
- the view's edge style, stroke pattern, and edge width win over the global ones, and edges anchor to the view's layout direction exactly as the canvas handles do

Click the graph view you want before exporting. Data formats (JSON, CSV, DOT, script, tree) always export the full graph and ignore view settings. The active-view marker shown in a split layout is a UI affordance and is never drawn into an export.

### PNG Options

- Adjustable quality (1-100)
- Transparent background toggle
- Theme-aware background color

## Keyboard Shortcuts

| Key        | Action             |
| ---------- | ------------------ |
| **Alt+I**  | Open import dialog |
| **Ctrl+E** | Open export panel  |
