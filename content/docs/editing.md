---
title: Editing Cards
description: Add, rename, copy, cut, paste, duplicate, delete, and connect nodes. Explore context menu actions for folders and files, plus the clipboard and undo/redo.
---

Fewer treats your graph like an editable outline. Every node supports the full set of editing actions, either from the **context menu** (right-click) or via **keyboard shortcuts**.

## Adding Cards

- Click **Add File** or **Add Folder** in the sidebar (the File & Actions section)
- Or press **Alt+N** and pick a type from the dialog
- New nodes are nested inside the currently selected folder when one is selected, otherwise they are added at the root
- New nodes auto-enter rename mode and the canvas zooms to them

To add a child directly from the canvas, right-click a folder → **Add Child Node** (available in Power User mode).

## Renaming

- Double-click a node, or use the context menu → **Rename**, or press **F2**
- Type the new name and press **Enter** to commit, **Escape** to cancel, or click away (e.g. on the canvas) to confirm and keep the typed name
- Renaming a folder updates the paths of all of its descendants
- Renaming a file auto-updates its extension and category icon

## Copy / Cut / Paste

- **Copy** (Ctrl+C): copies the selected node(s) to the clipboard
- **Cut** (Ctrl+X): cuts the selection to the clipboard (the node stays visible until pasted)
- **Paste** (Ctrl+V): pastes cut/copied nodes. Pastes into the selected folder if exactly one folder is selected, otherwise at root
- **Duplicate** (Ctrl+D): copies a node as a sibling with a "copy" naming convention

From the context menu, **Paste** on a folder pastes the clipboard contents into that folder specifically.

## Deleting

- **Delete / Backspace**: removes selected node(s)
- **Right-click → Delete**: removes a single node
- Deleting a folder cascades: all descendants (children, grandchildren, edges) are removed too
- **Clear Canvas** (trash icon in the sidebar) wipes the whole graph after a confirmation dialog

## Unparenting

Right-click a node that has a parent → **Unparent** to detach it from its parent and make it a root-level node.

## Batch Actions

Select multiple nodes (Shift+click, Shift+arrows, or Ctrl+A), then right-click any selected node. A **Batch actions** section appears at the top of the context menu:

| Action          | Notes                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rename…         | Opens a batch-rename dialog: find/replace (with `*` wildcard support), prefix/suffix, and optional numbering (name 1, name 2, …) with a live preview. File extensions are preserved. Duplicate names are skipped |
| Copy            | Copies every selected node (with subtrees) to the clipboard                                                                                                                          |
| Cut             | Cuts the selection to the clipboard and removes the originals; paste to place them                                                                                                   |
| Duplicate       | Duplicates each selected node under its same parent                                                                                                                                  |
| Move to Folder… | Opens a folder picker and reparents all selected nodes under the chosen folder in one step — each item keeps its sub-items                                                           |
| Unparent        | Detaches the top-most selected nodes from their parents (nodes whose parent is also selected keep their in-selection edge)                                                           |
| Delete N Items  | Removes the whole selection; folder deletes cascade                                                                                                                                  |

Every batch action is one undoable history entry — Ctrl+Z reverts the whole batch at once.

## Connecting Cards

Drag from a node's **output handle** to another node's **input handle** to create a parent→child connection. Fewer validates the connection:

- No cycles: you cannot connect a descendant back to its ancestor
- No orphans pushed below files: files have no children, so their output handle is hidden
- Unparenting or deleting removes the affected edges automatically

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
| Add Child Node        | Power User mode        |
| Open in File Explorer | Directory imports only |
| Copy Path             | Power User mode        |
| Refresh from Disk     | Directory imports only |

### Files

| Action                 | Notes                                   |
| ---------------------- | --------------------------------------- |
| Rename                 | Updates extension/category              |
| Copy / Cut / Duplicate | Clipboard-aware                         |
| Copy Name              | Copies filename to clipboard            |
| Delete                 | Single node                             |
| Open File              | Power User mode, directory imports only |

## Undo / Redo

Every editing operation records an undo step:

- **Ctrl+Z**: undo
- **Ctrl+Shift+Z / Ctrl+Y**: redo
- 50-step history buffer

Use **Relayout** after heavy manual edits to tidy the graph.

## Next Steps

- [Keyboard Shortcuts](/docs/shortcuts): full shortcut reference
- [Graph Features](/docs/graph-features): layout, hidden nodes, and canvas
- [Settings](/docs/settings): Power User mode and node dimensions
