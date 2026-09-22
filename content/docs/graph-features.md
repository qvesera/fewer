---
title: Graph Features
description: Deep dive into Fewer's graph visualization: React Flow canvas, custom node types, layout engines, connection styles, and navigation features.
---

Fewer is a very feature-rich directory viewer. Here is a deep dive into all of its features:

## Canvas

Fewer uses **React Flow v12** as the rendering engine. The canvas supports:

- Pan (drag empty space)
- Zoom (scroll wheel or +/- keys)
- Scroll action setting (Settings → Advanced): default **Scroll to pan** — the wheel pans vertically and Ctrl/⌘+scroll zooms; toggle to **Scroll to zoom** for direct wheel zooming with Ctrl/⌘+scroll to pan vertically (trackpad pinch-zoom always works)
- Fit view (Space key)
- Minimap (bottom-right, configurable)
- Controls (zoom in/out, fit view buttons)
- **Right-click** empty canvas for the canvas context menu

### Canvas Context Menu

Right-click empty canvas space to open quick actions:

- **Fit View**: zoom to show all nodes
- **Select All**: select every visible node
- **Organize**: re-run the tree layout to reflow the graph
- **Zoom In / Zoom Out**
- **Delete Connection**: removes the last-clicked edge
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

**Ctrl+click** a node's input or output handle removes all connections from that handle.

### Build the Tree by Dragging Handles

Every node has an **input handle** (entry, on the left/top) and an **output handle** (exit, on the right/bottom).

- **Drag from a folder's output handle** and release over empty canvas → the **Add child card** dialog opens, letting you create a folder or file inside that folder.
- **Drag from any node's input handle** and release over empty canvas → the **Add parent card** dialog opens, letting you create a folder that becomes the node's new parent. The new parent is always a folder:
  - If the node is already rooted elsewhere, the folder is inserted between the node and its current parent.
  - If the node has no parent yet, the folder becomes the node's new root parent.
  - The new folder may share the node's own name (a self-nesting `docs/docs`) — the node moves inside it, so it is no longer a sibling. Only a name already taken by another card in that scope is rejected.

## Multi-Select

- **Ctrl+A**: select all visible nodes
- **Shift+Arrow keys**: add nodes to the selection while navigating
- **Set as Parent**: batch-parent multiple selected nodes under the last-selected folder (canvas context menu or **Alt+P**)
- **Alt+Shift+P**: unparent all selected nodes — only the top-most selected cards detach (a selected descendant whose selected ancestor also detaches stays put); one undo step, and nothing is toasted when there was nothing to detach
- Batch delete, copy, cut, duplicate all work on multi-selections

## Drag & Drop (from your OS)

**Disabled in the web build.** Dropping a folder from your file system onto the
canvas — to expand it from disk, or to import it directly on an empty canvas —
needs OS drop events and File System Access handles, which are switched off by
the `LOCAL_FS_FEATURES` flags in `src/lib/fewer/features.ts`. Use **Import from
disk** (**Alt+I**) instead.

Dragging **nodes within the canvas** (reparenting, adding a child from a folder's
output handle) is unaffected: it uses the app's own drag payload, not the OS.

## Layout Engine

Fewer ships a single custom **Reingold-Tilford tree layout** with contour matching, designed specifically for directory trees. It handles large graphs (1K+ nodes) and is used for both initial import and relayout operations.

- Strict parents-centered-over-children placement with contour matching
- Tighter spacing (35px average) and collision prevention
- **Crown shyness spacing**: gaps between sibling subtrees scale with subtree depth and size (like tree canopies that never touch), so large branch clusters get natural breathing room instead of uniform packing. Intensity is adjustable (0–3) via the **Crown Shyness** slider in Settings → Advanced (Power User mode) — click the value next to the slider to type a custom intensity; it takes effect as soon as you release the slider (or commit a typed value; changing it clears the active view's manual card positions, which were spaced for the old intensity). The slider responds on a curve: 0 is flat, 1 (the default) keeps the spacing a default canvas has always had, 2 is clearly looser, and 3 opens the tree right up — the top of the range is capped there, so 3 is as loose as the layout gets (roughly +70% spread on a wide graph, against about +10% before this was tuned)
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

## Tags

Tags are named, colored labels you can attach to any folder or file card.

**Assign tags**: right-click any card → **Tags**. The submenu lists every tag as a checkbox (checked = assigned) and a **+ New tag** row that creates one and immediately assigns it. While naming a new tag, click a color swatch to pick that color, or press **Enter** to accept the next palette color.

**The highlight ring**: every tagged card shows a permanent ring around its border, colored by its tags. With multiple tags, the ring is split into even, hard-edged segments — one per tag (up to 5; extra tags collapse into a "+N" dot) — never a gradient blend. When the card is selected, the themed selection ring replaces the tag ring; deselect to see the tags again.

**Manage the palette**: the sidebar **Tags** panel (visible once a graph is loaded) lists every tag with its color swatch. Create, rename, recolor (color picker), or delete tags. New tags can pick a color from the swatch row (or the sidebar panel) at creation time; deleting a tag removes it from every card that carries it.

**Undo**: assigning or unassigning a tag is undoable (**Ctrl+Z**) — a batch assignment reverts as one step. Deleting a tag is undoable too: undo restores the tag itself, re-assigns the cards it was stripped from, and returns it to the active filter. Deleting a tag that was filtering also releases the cards it was hiding (hides owned by other layers stay). Creating, renaming, or recoloring a tag only edits the palette and is not a history step.

**Filter by tag**: the search panel shows a chip per tag. Toggle chips to filter — only cards that carry at least one selected tag (OR semantics) stay visible; every other card is removed from the canvas. Folders are hidden too, but only when neither they nor anything inside them matches, so a folder that contains a matching card stays visible as an anchor. Clear with the ✕.

**Sort by tag**: **Settings → Appearance → Sibling Sort → Order by: Tag** orders siblings by the alphabetical label of their first tag; untagged cards always trail.

Tags are part of the graph data: they ride along with saved graphs, share links, version history, and the local reload cache.

## Max Display Depth

Configurable display depth (default 6 levels) for both import-time and post-import. Deeper nodes go to the Hidden Cards panel. Adjust in Settings → Advanced (Power User mode).

## Connection Styles

### Curved

Smooth bezier curves. Best for general use.

### Angled

Sharp corners with configurable radius (0-20px). Adjust via sidebar.

### Straight

Direct lines. Minimalist look.

## Connection Motion

Optional motion effects:

- **None**: static connections
- **Flow**: animated dash offset
- **Pulse**: animated stroke opacity

Connection motion is a signed-in (Power User) feature: it's only available to
authenticated users. A Settings → Appearance toggle, **Animate Selected
Edges Only**, limits the
animation to the connections along the selected nodes' path to the root (the same
connections that get the selection highlight) instead of every connection on the canvas.
It works standalone — no need to turn on the edge motion toggle first — and
its animated edges use the **Selected Connection Pattern** (dashed or dotted) chosen
in the same dialog. Edges outside the selection follow the Motion
and Pattern controls in the same tab.

## Connection Pattern & Weight

In Power User mode, Settings → Appearance → **Connection Styling** controls:

- **Motion**: static or animated — applies to all edges globally, or to the
  non-selected connections only when **Animate Selected Connections Only** is on
- **Pattern**: solid, dashed, or dotted — same scope as Motion
- **Line Thickness**: 0.5px to 6px slider

The sidebar keeps a quick **Style** picker (curved / straight / angled); corner
radius for angled connections also lives in Connection Styling.

## Breadcrumb Bar

Shows selected node's full path. Click any segment to navigate to that ancestor.

## Auto-hide Large Folders

Folders with more than N children (default: 10) auto-hide their children on import. Hidden nodes appear in the sidebar **Hidden Cards** section as a nested tree.

**Reveal a folder**: click the eye icon next to it. Its subtree becomes visible (grandchildren stay hidden if they exceed threshold).

## Visibility: Hide Files / Show Children

- **Hide Files / Show Files** (canvas toolbar or right-click → **Visibility**) hides or reveals every file card. Folders stay visible either way.
- **Show Children** (right-click a folder → **Visibility** → **Show Children**) reveals that folder's direct children and whole subtree — and it **also wins over an active "Hide Files"**: the folder's files appear even while Hide Files stays on everywhere else (files outside the folder remain hidden).

## Hidden Cards Panel

Access via sidebar. Shows all hidden nodes grouped by their visible parent folder, so you can always tell which folder a hidden file belongs to:

- **Folder group headers** — each visible parent folder with a `N hidden` count and a collapse toggle
- **Nested expandable tree** (any depth) for fully-hidden subtrees
- **Eye button** reveals an individual item (or a whole hidden subtree)
- **"Show All" button** reveals everything
- **Hover a row** to highlight the corresponding folder(s) on the canvas — hovering a folder header also glows the hidden child rows inside that card and lights up the ancestor-path connections (root→folder), like global search and selection
- **Search** filters by folder name or path as well as file name

## Search

Fuzzy search across filenames, paths, and extensions.

- **Click result** → zoom to node
- **Hidden matches** appear with badge; clicking reveals the match **and all its hidden ancestors** up to root, then zooms
- **Highlight/dim** matched/unmatched nodes
- **Recent searches** — committed terms are kept per browser session (sessionStorage) and shown when reopening search; clear them from the panel

## Multiple Graph Views

Split the workspace into two or more areas and every graph view keeps its own settings: hidden cards, collapsed folders, card positions, layout direction, connection style and connection width. Clicking a card, its pane, or its header makes that view the active one — the view that owns clicks, selection and keyboard actions.

The active view is marked with an accent inset border plus a dot in its header, so it is obvious which pane will respond. The marker only appears when the workspace holds more than one view, keeping a single-view layout unmarked. It is a UI affordance: it is never drawn into SVG/PNG exports.

Image exports mirror the active view (see [Import & Export](/docs/import-export)); JSON, CSV, DOT, script and tree exports always cover the full graph.

Card positions are per view, and so is undo: moving a card in one view records the move in that view's history, and undo/redo puts the card back there — the other views keep the arrangement they had, they do not follow along.

Non-graph panes (Layout, Connections, File & Actions, Hidden Cards, Tags, Graph Analytics) scroll vertically when the area is too short for the content — no information is clipped.

## Sidebar

- **Drag-resizable**: drag the right edge to resize (200-560px)
- **Collapsible sections**: File & Actions, Layout, Connections & Style, Hidden Cards, Graph Analytics

## Stats Panel

Real-time statistics in sidebar:

- Total files and folders
- Total size
- Breakdown by category (code, image, doc, config, etc.)
