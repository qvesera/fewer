---
title: "Graph Features"
description: "Deep dive into Fewer's graph visualization — React Flow canvas, custom node types, layout engines, edge styles, and navigation features."
---

# Graph Features

## Canvas

Fewer uses **React Flow v12** as the rendering engine. The canvas supports:

- Pan (drag empty space)
- Zoom (scroll wheel or +/- keys)
- Fit view (Space key)
- Minimap (bottom-right, configurable)
- Controls (zoom in/out, fit view buttons)

## Node Types

### Folder Cards (Orange)

- **Children inline** — scrollable list of child nodes inside the card
- **Item counts** — shows number of children
- **Size display** — total size of all children
- **Collapsible** — click to expand/collapse children
- **Resizable** — drag corners to adjust

### File Cards (Purple)

- **Filename + extension** — displayed with category icon
- **Size** — file size in bytes/KB/MB
- **Category** — auto-detected from extension (image, code, doc, etc.)
- **No children** — source handle hidden

## Layout Engines

### ELK (Default)

Layered algorithm from Eclipse Layout Kernel. Best for large graphs (1K+ nodes).

- Tighter spacing (35px average)
- Async computation for large imports
- Better hierarchy preservation

### Dagre (Fallback)

Classic Sugiyama-style layered layout. Used for relayout operations.

- Synchronous computation
- Adjustable rank separation
- Works well for small-to-medium trees

## Layout Directions

Cycle through 4 directions with **Ctrl+L** or via sidebar:

1. **Top → Bottom** (default)
2. **Left → Right**
3. **Bottom → Top**
4. **Right → Left**

## Edge Styles

### Curved

Smooth bezier curves. Best for general use.

### Angled

Sharp corners with configurable radius. Adjust via sidebar.

### Straight

Direct lines. Minimalist look.

## Breadcrumb Bar

Shows selected node's full path. Click any segment to navigate to that ancestor.

## Auto-hide Large Folders

Folders with more than N children (default: 10) auto-hide their children on import. Hidden nodes appear in the sidebar **Hidden Nodes** section as a nested tree.

**Reveal a folder** — click the eye icon next to it. Its subtree becomes visible (grandchildren stay hidden if they exceed threshold).

## Hidden Nodes Panel

Access via sidebar. Shows all hidden nodes grouped by parent folder:

- Nested expandable tree (any depth)
- Eye button reveals individual folders
- "Show All" button reveals everything

## Search

Fuzzy search across filenames, paths, and extensions.

- **Click result** → zoom to node
- **Hidden matches** appear with badge — click to show & zoom
- **Highlight/dim** matched/unmatched nodes

## Stats Panel

Real-time statistics in sidebar:

- Total files and folders
- Total size
- Breakdown by category (code, image, doc, config, etc.)