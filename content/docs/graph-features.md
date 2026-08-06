---
title: Graph Features
description: Deep dive into Fewer's graph visualization: React Flow canvas, custom node types, layout engines, edge styles, and navigation features.
---

Fewer is a very feature-rich directory viewer. Here is a deep dive into all of its features:

## Canvas

Fewer uses **React Flow v12** as the rendering engine. The canvas supports:

- Pan (drag empty space)
- Zoom (scroll wheel or +/- keys)
- Fit view (Space key)
- Minimap (bottom-right, configurable)
- Controls (zoom in/out, fit view buttons)
- **Right-click** empty canvas for the canvas context menu

### Canvas Context Menu

Right-click empty canvas space to open quick actions:

- **Fit View** — zoom to show all nodes
- **Select All** — select every visible node
- **Zoom In / Zoom Out**
- **Delete Edge** — removes the last-clicked edge
- **Set as Parent** — with 2+ nodes selected, makes the last-selected folder the parent of the rest
- **Show All Nodes** — reveal hidden nodes (Power User mode)
- **Paste** — paste clipboard contents at the mouse position (Power User mode)

## Node Types

### Folder Cards (Orange)

- **Children inline** — scrollable list of child nodes inside the card
- **Item counts** — shows number of children
- **Size display** — total size of all children
- **Collapsible** — click to expand/collapse children
- **Resizable** — drag corners to adjust (multi-direction)

### File Cards (Purple)

- **Filename + extension** — displayed with category icon
- **Size** — file size in bytes/KB/MB
- **Category** — auto-detected from extension (image, code, doc, etc.)
- **No children** — source handle hidden
- **Resizable** — horizontal only (width)

### Node Resizing

Select a node to see resize handles:

- **Folders** — resize in all directions
- **Files** — resize horizontally only (width)

### Handle Shortcuts

**Ctrl+click** a node's input or output handle removes all edges connected to that handle.

## Multi-Select

- **Ctrl+A** — select all visible nodes
- **Shift+Arrow keys** — add nodes to the selection while navigating
- **Set as Parent** — batch-parent multiple selected nodes under the last-selected folder (canvas context menu or **Alt+P**)
- **Alt+Shift+P** — unparent all selected nodes
- Batch delete, copy, cut, duplicate all work on multi-selections

## Drag & Drop

Drag a folder from your file system onto the canvas to expand it and load its contents from disk. Dropped folders become standalone nodes with their children loaded.

## Layout Engine

Fewer ships a single custom **Reingold-Tilford tree layout** with contour matching, designed specifically for directory trees. It handles large graphs (1K+ nodes) and is used for both initial import and relayout operations.

- Strict parents-centered-over-children placement with contour matching
- Tighter spacing (35px average) and collision prevention
- Best for large graphs (1K+ nodes)
- Async computation for large imports, sync for relayout
- Supports all 4 layout directions (Top→Bottom, Left→Right, Bottom→Top, Right→Left)

## Layout Directions

Cycle through 4 directions (two if in basic mode) with **Ctrl+L** or via sidebar:

1. **Top → Bottom** (default)
2. **Left → Right**
3. **Bottom → Top** (limited to advanced mode)
4. **Right → Left** (limited to advanced mode)

## Max Display Depth

Configurable display depth (default 6 levels) for both import-time and post-import. Deeper nodes go to the Hidden Nodes panel. Adjust via the sidebar Layout section (Power User mode).

## Edge Styles

### Curved

Smooth bezier curves. Best for general use.

### Angled

Sharp corners with configurable radius (0-20px). Adjust via sidebar.

### Straight

Direct lines. Minimalist look.

## Edge Motion

Optional motion effects:

- **None** — static edges
- **Flow** — animated dash offset
- **Pulse** — animated stroke opacity

## Edge Pattern & Weight

In Power User mode, the sidebar Edges section controls:

- **Pattern** — solid, dashed, or dotted
- **Line Thickness** — 0.5px to 6px slider

## Breadcrumb Bar

Shows selected node's full path. Click any segment to navigate to that ancestor.

## Auto-hide Large Folders

Folders with more than N children (default: 10) auto-hide their children on import. Hidden nodes appear in the sidebar **Hidden Nodes** section as a nested tree.

**Reveal a folder**: click the eye icon next to it. Its subtree becomes visible (grandchildren stay hidden if they exceed threshold).

## Hidden Nodes Panel

Access via sidebar. Shows all hidden nodes grouped by parent folder:

- Nested expandable tree (any depth)
- Eye button reveals individual folders
- "Show All" button reveals everything

## Search

Fuzzy search across filenames, paths, and extensions.

- **Click result** → zoom to node
- **Hidden matches** appear with badge, click to show & zoom
- **Highlight/dim** matched/unmatched nodes

## Sidebar

- **Drag-resizable** — drag the right edge to resize (200-560px)
- **Collapsible sections** — File & Actions, Layout, Edges & Style, Hidden Nodes, Graph Analytics

## Stats Panel

Real-time statistics in sidebar:

- Total files and folders
- Total size
- Breakdown by category (code, image, doc, config, etc.)