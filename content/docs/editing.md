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

Select multiple cards (Shift+click, Shift+arrows, or Ctrl+A), then right-click any selected card. A **Batch actions** section appears at the top of the context menu:

| Action          | Notes                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rename…         | Opens a batch-rename dialog: find/replace (with `*` wildcard support), prefix/suffix, and optional numbering (name 1, name 2, …) with a live preview. File extensions are preserved. Duplicate names are skipped |
| Copy            | Copies every selected card (with subtrees) to the clipboard                                                                                                                          |
| Cut             | Cuts the selection to the clipboard and removes the originals; paste to place them                                                                                                   |
| Duplicate       | Duplicates each selected card under its same parent                                                                                                                                  |
| Hide            | Hides the whole selection (and their descendant cards); press Shift+H to restore. Routes to the active leaf's hide layer when leaves are enabled                                        |
| Show            | Reveals selected cards that are currently hidden                                                                                                                                     |
| Collapse Folders| Collapses every selected folder                                                                                                                                                      |
| Expand Folders  | Expands every selected folder                                                                                                                                                        |
| Copy Paths      | Copies each selected card's full path to the clipboard, one per line                                                                                                                 |
| Move to Folder… | Opens a folder picker and reparents all selected cards under the chosen folder in one step — each item keeps its sub-items                                                           |
| Unparent        | Detaches the top-most selected cards from their parents (cards whose parent is also selected keep their in-selection connection)                                                           |
| Delete N Items  | Removes the whole selection; folder deletes cascade                                                                                                                                  |

Every batch action is one undoable history entry — Ctrl+Z reverts the whole batch at once.

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
| Delete                | Cascade                |
| Show/Hide Children    | Power User mode        |
| Add Child Card        | Power User mode        |
| Open in File Explorer | Disabled in the web build |
| Copy Path             | Power User mode        |
| Refresh from Disk     | Directory imports only; desktop app re-scans through the shell |

### Files

| Action                 | Notes                                   |
| ---------------------- | --------------------------------------- |
| Rename                 | Updates extension/category              |
| Copy / Cut / Duplicate | Clipboard-aware                         |
| Copy Name              | Copies filename to clipboard            |
| Delete                 | Single card                             |
| Open File              | Disabled in the web build               |

> **OS integration is switched off in the web build.** "Open in File Explorer"
> and "Open File" go through server-side OS openers (`/api/open-folder`,
> `/api/open-file`) that only exist on a locally-running server, and those routes
> are restricted to localhost requests. Both actions are gated by
> `LOCAL_FS_FEATURES` in `src/lib/fewer/features.ts`, where every flag defaults to
> `false`; a native build that replaces these paths with OS commands flips them.
> Importing folders from disk is unaffected — it uses the `webkitdirectory`
> fallback in every browser.

## Undo / Redo

Every editing operation records an undo step — including card moves (drag a
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
