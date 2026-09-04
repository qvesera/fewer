---
title: Graph Features
description: Deep dive into Fewer's graph visualization: React Flow canvas, custom node types, layout engines, edge styles, and navigation features.
---

Fewer is a very feature-rich directory viewer. Here is a deep dive into all of its features:

## Canvas

Fewer uses **React Flow v12** as the rendering engine. The canvas supports:

- Pan (drag empty space)
- Zoom (scroll wheel or +/- keys)
- Scroll action setting (Settings → Advanced): default **Scroll to pan** — the wheel pans vertically and Ctrl/⌘+scroll zooms; toggle to **Scroll to zoom** for direct wheel zooming
- Fit view (Space key)
- Minimap (bottom-right, configurable)
- Controls (zoom in/out, fit view buttons)
- **Right-click** empty canvas for the canvas context menu

### Canvas Context Menu

Right-click empty canvas space to open quick actions:

- **Fit View**: zoom to show all nodes
- **Select All**: select every visible node
- **Zoom In / Zoom Out**
- **Delete Edge**: removes the last-clicked edge
- **Set as Parent**: with 2+ nodes selected, makes the last-selected folder the parent of the rest
- **Show All Cards**: reveal hidden nodes (Power User mode)
- **Paste**: paste clipboard contents at the mouse position (Power User mode)

## Node Types

### Folder Cards (Orange)

- **Children inline**: scrollable list of child nodes inside the card
- **Item counts**: shows number of children
- **Size display**: total size of all children
- **Collapsible**: click to expand/collapse children
- **Resizable**: drag corners to adjust (multi-direction)

### File Cards (Purple)

- **Filename + extension**: displayed with category icon
- **Size**: file size in bytes/KB/MB
- **Category**: auto-detected from extension (image, code, doc, etc.)
- **No children**: source handle hidden
- **Resizable**: horizontal only (width)

### Node Resizing

Select a node to see resize handles:

- **Folders**: resize in all directions
- **Files**: resize horizontally only (width)

### Handle Shortcuts

**Ctrl+click** a node's input or output handle removes all edges connected to that handle.

## Multi-Select

- **Ctrl+A**: select all visible nodes
- **Shift+Arrow keys**: add nodes to the selection while navigating
- **Set as Parent**: batch-parent multiple selected nodes under the last-selected folder (canvas context menu or **Alt+P**)
- **Alt+Shift+P**: unparent all selected nodes
- Batch delete, copy, cut, duplicate all work on multi-selections

## Drag & Drop

Drag a folder from your file system onto the canvas to expand it and load its contents from disk. Dropped folders become standalone nodes with their children loaded.

On an **empty** canvas, dropping a folder starts a full import using your saved import settings (no picker or dialog) — the shortcut for "import this directory with the settings I use every time".

## Layout Engine

Fewer ships a single custom **Reingold-Tilford tree layout** with contour matching, designed specifically for directory trees. It handles large graphs (1K+ nodes) and is used for both initial import and relayout operations.

- Strict parents-centered-over-children placement with contour matching
- Tighter spacing (35px average) and collision prevention
- **Crown shyness spacing**: gaps between sibling subtrees scale with subtree depth and size (like tree canopies that never touch), so large branch clusters get natural breathing room instead of uniform packing. Intensity is adjustable (0–3×) via the **Crown Shyness** slider in Settings → Advanced (Power User mode) — click the value next to the slider to type a custom multiplier; it takes effect on the next Rearrange
- Best for large graphs (1K+ nodes)
- Async computation for large imports, sync for relayout
- Supports all 4 layout directions (Top→Bottom, Left→Right, Bottom→Top, Right→Left)

## Layout Directions

Cycle through 4 directions (two if in basic mode) with **Ctrl+L** or via sidebar:

1. **Top → Bottom** (default)
2. **Left → Right**
3. **Bottom → Top** (limited to advanced mode)
4. **Right → Left** (limited to advanced mode)

## Sibling Sort

Children within each folder are drawn in a chosen order. The sort applies recursively at every level, so folders and files are laid out consistently across the whole graph. Change it in **Settings → Appearance → Sibling Sort**:

- **Order by**:
  - **Name** — alphabetical by label (default, A→Z)
  - **Size** — ascending/descending by recorded node size. Folders whose size wasn't reported on import sort last.
  - **Type** — folders first, then files grouped by extension. Extension order inverts with direction; folders stay first either way.
- **Direction**: Ascending / Descending (only inverts the primary key — Name and Size both sort unknown/empty values last in either direction, and Type always keeps folders first).

Changing either control re-lays out the graph immediately. The choice is saved with your other preferences and is not tied to a saved graph.

## Max Display Depth

Configurable display depth (default 6 levels) for both import-time and post-import. Deeper nodes go to the Hidden Cards panel. Adjust in Settings → Advanced (Power User mode).

## Edge Styles

### Curved

Smooth bezier curves. Best for general use.

### Angled

Sharp corners with configurable radius (0-20px). Adjust via sidebar.

### Straight

Direct lines. Minimalist look.

## Edge Motion

Optional motion effects:

- **None**: static edges
- **Flow**: animated dash offset
- **Pulse**: animated stroke opacity

Edge motion is a signed-in (Power User) feature: it's only available to
authenticated users. A Settings → Appearance toggle, **Animate Selected
Edges Only**, limits the
animation to the edges along the selected nodes' path to the root (the same
edges that get the selection highlight) instead of every edge on the canvas.
It works standalone — no need to turn on the edge motion toggle first — and
its animated edges use the **Selected Edge Pattern** (dashed or dotted) chosen
in the same dialog. Edges outside the selection follow the Motion
and Pattern controls in the same tab.

## Edge Pattern & Weight

In Power User mode, Settings → Appearance → **Edge Styling** controls:

- **Motion**: static or animated — applies to all edges globally, or to the
  non-selected edges only when **Animate Selected Edges Only** is on
- **Pattern**: solid, dashed, or dotted — same scope as Motion
- **Line Thickness**: 0.5px to 6px slider

The sidebar keeps a quick **Style** picker (curved / straight / angled); corner
radius for angled edges also lives in Edge Styling.

## Breadcrumb Bar

Shows selected node's full path. Click any segment to navigate to that ancestor.

## Auto-hide Large Folders

Folders with more than N children (default: 10) auto-hide their children on import. Hidden nodes appear in the sidebar **Hidden Cards** section as a nested tree.

**Reveal a folder**: click the eye icon next to it. Its subtree becomes visible (grandchildren stay hidden if they exceed threshold).

## Hidden Cards Panel

Access via sidebar. Shows all hidden nodes grouped by their visible parent folder, so you can always tell which folder a hidden file belongs to:

- **Folder group headers** — each visible parent folder with a `N hidden` count and a collapse toggle
- **Nested expandable tree** (any depth) for fully-hidden subtrees
- **Eye button** reveals an individual item (or a whole hidden subtree)
- **"Show All" button** reveals everything
- **Hover a row** to highlight the corresponding folder(s) on the canvas — hovering a folder header also glows the hidden child rows inside that card and lights up the ancestor-path edges (root→folder), like global search and selection
- **Search** filters by folder name or path as well as file name

## Search

Fuzzy search across filenames, paths, and extensions.

- **Click result** → zoom to node
- **Hidden matches** appear with badge; clicking reveals the match **and all its hidden ancestors** up to root, then zooms
- **Highlight/dim** matched/unmatched nodes
- **Recent searches** — committed terms are kept per browser session (sessionStorage) and shown when reopening search; clear them from the panel

## Sidebar

- **Drag-resizable**: drag the right edge to resize (200-560px)
- **Collapsible sections**: File & Actions, Layout, Edges & Style, Hidden Cards, Graph Analytics

## Stats Panel

Real-time statistics in sidebar:

- Total files and folders
- Total size
- Breakdown by category (code, image, doc, config, etc.)
