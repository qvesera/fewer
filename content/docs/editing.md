---
title: Editing Cards
description: Add, rename, copy, cut, paste, duplicate, delete, and connect cards. Explore context menu actions for folders and files, plus the clipboard and undo/redo.
---

Fewer treats your graph like an editable outline. Every card supports the full set of editing actions, either from the **context menu** (right-click) or via **keyboard shortcuts**.

## Adding Cards

- Click **Add File** or **Add Folder** in the sidebar (the File & Actions section)
- Or press **Alt+N** and pick a type from the dialog
- New cards are nested inside the currently selected folder when one is selected, otherwise they are added at the root
- New cards auto-enter rename mode and the canvas zooms to them

To add a child directly from the canvas, right-click a folder → **Add Child Card** (available in Power User mode).

## Renaming

- Double-click a card, or use the context menu → **Rename**, or press **F2**
- Type the new name and press **Enter** to commit, **Escape** to cancel, or click away (e.g. on the canvas) to confirm and keep the typed name
- Renaming a folder updates the paths of all of its descendants
- Renaming a file auto-updates its extension and category icon

## Copy / Cut / Paste

- **Copy** (Ctrl+C): copies the selected card(s) to the clipboard
- **Cut** (Ctrl+X): cuts the selection to the clipboard (the card stays visible until pasted)
- **Paste** (Ctrl+V): pastes cut/copied cards. Pastes into the selected folder if exactly one folder is selected, otherwise at root
- **Duplicate** (Ctrl+D): copies a card as a sibling with a "copy" naming convention

From the context menu, **Paste** on a folder pastes the clipboard contents into that folder specifically.

## Deleting

- **Delete / Backspace**: removes selected card(s)
- **Right-click → Delete**: removes a single card
- Deleting a folder cascades: all descendants (children, grandchildren, connections) are removed too
- **Clear Canvas** (trash icon in the sidebar) wipes the whole graph after a confirmation dialog

## Unparenting

Right-click a card that has a parent → **Unparent** to detach it from its parent and make it a root-level card.

## Batch Actions

Select multiple cards (Shift+click, Shift+arrows, or Ctrl+A), then right-click any selected card. The menu opens with the same header as a single-card menu — the count, plus its folder/file breakdown — and the actions are grouped the way the single-card menu groups its own: **Edit**, then **Structure**, then **Visibility ▸** next to **Tags ▸** and **Select ▸**, with **Delete** last behind its own separator. The canvas selection menu (right-click the background with a selection) draws the same groups.

| Cluster | Action          | Notes                                                                                                                                                                                |
| ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Edit    | Rename…         | Opens a batch-rename dialog: find/replace (with `*` wildcard support), prefix/suffix, and optional numbering (name 1, name 2, …) with a live preview. File extensions are preserved. Duplicate names are skipped |
| Edit    | Copy            | Copies every selected card (with subtrees) to the clipboard                                                                                                                          |
| Edit    | Cut             | Cuts the selection to the clipboard and removes the originals; paste to place them                                                                                                   |
| Edit    | Duplicate       | Duplicates each selected card under its same parent                                                                                                                                  |
| Edit    | Copy Paths      | Desktop app only: copies each selected card's full path to the clipboard, one per line                                                                                                 |
| Structure | Move to Folder… | Opens a folder picker and reparents all selected cards under the chosen folder in one step; each item keeps its sub-items                                                           |
| Structure | Unparent        | Detaches the top-most selected cards from their parents (cards whose parent is also selected keep their in-selection connection) — `Alt+Shift+P`                                        |
| Structure | Group N Items   | Wraps the selection in a group frame (see [Groups](#groups))                                                                                                                        |
| Visibility ▸ | Hide          | Hides the whole selection (and their descendant cards); `H` restores with Shift+H. Routes to the active leaf's hide layer when leaves are enabled                                     |
| Visibility ▸ | Show          | Reveals selected cards that are currently hidden                                                                                                                                      |
| Visibility ▸ | Collapse Folders | Collapses every selected folder                                                                                                                                                     |
| Visibility ▸ | Expand Folders | Expands every selected folder                                                                                                                                                         |
| Tags ▸   | Tags            | The same **Tags** submenu a single card's menu has: check/uncheck tags across the whole selection, or create one for all of them (Pro)                                                |
| —        | Delete N Items  | Removes the whole selection; folder deletes cascade                                                                                                                                   |

Every batch action is one undoable history entry: Ctrl+Z reverts the whole batch at once.

The canvas selection menu also offers **selection helpers** (under a "Select" heading) that replace the current selection rather than acting on it:

| Action | Notes |
| --- | --- |
| Select Descendants | Expands the selection to include every descendant of every selected folder |
| Select Same Extension | Selects every visible card sharing a file extension with any selected card |
| Select Same Category | Selects every visible card in a category (code, data, media, …) present in the selection |

## Connecting Cards

Drag from a card's **output handle** to another card's **input handle** to create a parent→child connection. Fewer validates the connection:

- No cycles: you cannot connect a descendant back to its ancestor
- No orphans pushed below files: files have no children, so their output handle is hidden
- Unparenting or deleting removes the affected connections automatically

## Hiding & Showing Children

In Power User mode, right-click a folder for:

- **Hide Children**: collapse the folder's children into the Hidden Cards panel
- **Show Children**: reveal hidden children again

## Context Menu Actions

### Folders

| Action                | Notes                  |
| --------------------- | ---------------------- |
| Rename                | F2                     |
| Copy / Cut / Paste    | Clipboard-aware        |
| Duplicate             | Sibling "copy"         |
| Unparent              | Make root-level        |
| Select Children       | Selects the folder's direct children |
| Collapse / Expand Folder | Power User mode; applies to this view |
| Visibility → Show/Hide Children | Power User mode        |
| Tags / Select by Tag  | Power User mode, Pro tier |
| Add Child Card        | Power User mode        |
| Add Parent Card       | Prompts for the new parent |
| Details               | The folder's own facts (type, path, contents, source, tags, link) followed by Open in &lt;provider&gt;, Open in File Explorer, Refresh from Disk and the symlink actions — see below |
| Delete                | Cascade                |

### Files

| Action                 | Notes                                   |
| ---------------------- | --------------------------------------- |
| Rename                 | F2; updates extension/category          |
| Copy / Cut / Duplicate | Clipboard-aware                         |
| Paste                  | Into the selected folder, or at the root |
| Unparent               | Detach from its parent                  |
| Add Parent Card        | Prompts for the new parent              |
| Tags                   | Same submenu as folders                 |
| Select → By Type / By Category / By Tag | Replaces the selection with matching files |
| Details                | Type, path, size, source, tags, link — then Open in &lt;provider&gt; / Download, Open File, Copy Name and the symlink actions |
| Delete                 | Single card                             |

### The menu header and Details

Every card menu opens with a header naming what you right-clicked — the card's
name, with its path underneath — so the first thing you read is *which* card the
actions apply to. Right-clicking one card of a multi-selection swaps it for the
selection's own header: the count, then how it breaks down (`1 folder · 2
files`).

**Details** is the card's information panel, and it is the same submenu on folders
and files. It always shows a row set — type, path, size or contents, source
(where the graph came from), tags, and the link target when the card is a symlink
— followed by whatever actions can reach that card: **Open in &lt;provider&gt;** for
cloud and URL imports (**Download** for a crawled file index), **Open in File
Explorer** and **Refresh from Disk** for directory imports, and the symlink
actions. Previously this lived under `Info` and held *only* those actions, so a
folder imported from a repository or a URL opened an empty submenu; the rows mean
it is never empty now.

### Shortcut hints

Every menu item that has a keyboard binding shows its key on the right —
Unparent → `Alt+Shift+P`, Add Child Card → `Alt+N`, Select All → `Ctrl+A`,
Organize → `Alt+R`, Clear Canvas → `Alt+Shift+N`, Open in File Explorer → `Alt+O`,
Open File → `Enter`, Hide → `H`, Show All → `Shift+H` (and the usual
`F2` / `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D` / `Delete` cluster). The hints are
drawn from the same table that implements the keys — `MENU_SHORTCUT_HINTS` in
`keyboardShortcuts.ts`, which a test fires back through the dispatcher — so a menu
cannot advertise a key that stopped working. Items with no binding show no hint,
and the connection menu deliberately shows none: `Delete` only removes a
*selected* connection, and a right-click does not select one.

> **OS integration is switched off in the web build.** "Open in File Explorer"
> and "Open File" go through server-side OS openers (`/api/open-folder`,
> `/api/open-file`) that only exist on a locally-running server, and those routes
> are restricted to localhost requests. Both actions are gated by
> `LOCAL_FS_FEATURES` in `src/lib/fewer/features.ts`, where every flag defaults to
> `false`; a native build that replaces these paths with OS commands flips them.
> Importing folders from disk is unaffected: it uses the `webkitdirectory`
> fallback in every browser.

## Groups

Select two or more cards, right-click → **Group N Items** (in the Structure
cluster — the label carries the selection count) to draw a gray frame around them. The same
action lives in the card context menus' batch list, and it is identical in the
web app and the desktop app. A group is an annotation layer, not a folder: it
never changes the tree, and layout, search, export and undo treat the cards
exactly as they did before.

- **Membership is explicit**: the cards you picked stay in the group when the
  layout moves them, so a re-layout never reshuffles who belongs where.
- **Title**: double-click it (or focus it and press Enter) to rename.
- **Note**: the note icon opens a small editor; hovering the title shows the
  note, and the icon is filled once one is set.
- **Color**: right-click the frame's title bar → **Color…** opens the color
  picker: drag the picker or type a hex value, and **Reset to default** returns
  to slate. The border, fill and header tint to match, the colour saves with the
  graph, and one drag is a single undo step. **Done** or **Escape** closes it.
- **Collapse**: the chevron hides the group's cards **in this view** and shrinks
  the frame to a pill; the layout treats that pill as a single card-sized
  block — so the tree re-flows compactly around it in **every** direction
  (top-down, bottom-up, and both horizontal ones) instead of keeping the
  group's whole footprint empty. A group that holds **folder cards** (or cards
  from different branches) keeps every card's slot instead, so its contents
  never jump a level — the pill simply sits on the group's own block — and the
  pill **keeps the connections its hidden cards carried as ordinary edges**:
  each wire is drawn by the canvas itself, exactly like a folder→file edge, so
  your **connection style** (shape, dash and width) and the selection highlight
  apply to it unchanged — and a group with a **colour** keeps its wires tinted
  with it. You can also **drag the pill** to move the collapsed
  group — one gesture, one undo step. Expanding brings the cards back,
  except any you hid yourself. Collapse is per-view state — other panel views
  keep showing the frame — and, like a folded folder, it is not an undo step.
- **The frame follows visibility**: the box hugs the cards the canvas actually
  shows, and its count reads **3 of 5 members** when some are hidden. Hide every
  member and the frame disappears with them (a collapsed group always keeps its
  pill); **Show All**, the Hidden Cards panel or **Shift+H** brings everything
  back at once — and any reveal that returns a collapsed group's cards (the
  panel's eye, **Show Children**, a single card) expands that group in this
  view, so a pill never sits over live cards. A single-card reveal is scoped:
  only the card you asked for comes back — the group's other members stay in
  the Hidden Cards panel (revealing them one by one) until you press the
  group's chevron, which reveals the whole cluster.
- **Select & move**: click the title bar to select the frame (it rings, and
  **each member card gets its own ring**, so you always see which cards belong
  to it; card selection clears; the two are mutually exclusive). Shift+click
  adds another frame. Drag the title bar to move every member card at once:
  hidden ones included, and release records **one undo step**. **Delete**
  ungroups the selected frames; **Escape** clears the selection or cancels a
  move in flight (positions snap back, nothing is recorded).
- **Resize**: a selected frame grows eight handles; drag a corner or edge to
  **scale the whole arrangement**: the cards keep their size while their
  spacing (and the frame) grows or shrinks around the opposite corner/edge.
  Hold **Shift** for proportional scaling. Like moving, it is one undo step
  and nothing extra is stored: the frame is always derived from its cards.
- **Ungroup**: the × drops the frame and keeps the cards.

Right-clicking the title bar also opens the **group menu**: Rename…, Edit
Note…, Color ▸, Collapse/Expand, **Select Members** (selects every card in the
group at once), **Include N cards inside** (when a re-flow parked non-member
cards fully inside the box: one click, one undo step, adds them to the group)
and Ungroup.

**Nesting**: a group can live inside another. From the group menu, **Move into
group ▸** picks a container (the list never offers the group itself or its own
subgroups, so a cycle can't form), and **Move out of group** returns it to the
top level. A parent's frame grows to hold its children's frames, moving or
resizing a parent carries its whole subtree, and collapsing a parent hides every
card beneath it: its children's frames disappear with it, so no orphan pills
are left behind. Ungrouping a parent re-homes its children rather than deleting
them.

Every group action is a single undo step — rename, note, colour, membership,
**Ungroup**, delete: **Ctrl+Z** reverses it. Collapse is the exception: it is
per-view state, like a folded folder, so it is not recorded and not undone.

**Groups vs tags** — they look alike but answer different questions, and both
are deliberate:

- A **group** is a *spatial container*: one titled box, on this canvas, holding
  an explicit list of cards. It moves, scales and collapses them, and it never
  changes the tree. Free in every tier.
- A **tag** is a *label* a card carries: many per card, anywhere in the graph,
  filterable and sortable. It never moves a card. Pro feature.

Rule of thumb: **one place on the canvas → group; one attribute across many
cards → tag.** Use a group when the point is "these cards belong together
here"; use a tag when the point is "this card is that kind of thing" and you
want to find it anywhere. See **Graph Features → Tags**.

## Undo / Redo

Every editing operation records an undo step, including card moves (drag a
card, then **Ctrl+Z** to snap it back):

- **Ctrl+Z**: undo
- **Ctrl+Shift+Z / Ctrl+Y**: redo
- 50-step history buffer

With a **split panel layout**, each panel view keeps its own 50-step history.
Undo/redo act on the view you last interacted with, so a drag in one view never
rolls back an edit made in another.

Use **Relayout** after heavy manual edits to tidy the graph.

## Next Steps

- [Keyboard Shortcuts](/docs/shortcuts): full shortcut reference
- [Graph Features](/docs/graph-features): layout, hidden cards, and canvas
- [Settings](/docs/settings): Power User mode and card dimensions
