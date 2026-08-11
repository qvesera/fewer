# Implementation Plan

## [Overview]

Audit every user action in the app against the undo/redo system, then overhaul the history model so that every graph-mutating action is correctly undoable/redoable with dedicated operations. Today undo/redo only restores `nodes` and `edges`, and the `bulk-import` op is misused to record "removals for undo" even though its undo always removes its payload — so delete, cut, edge-delete, connect, and (catastrophically) node-drag are broken, while hide/show, collapse-all, resize, show-files, and max-depth have no history at all.

## [Audit: every action vs. undo/redo]

Legend: works · broken (pushes history but undo is wrong) · not undoable (no history push) · intentionally non-undoable (view/preference).

### Structure mutations (nodes/edges)

| Action | Entry points | Op pushed | Status |
|---|---|---|---|
| Add node / add standalone | AddNodeDialog, sidebar quick-add, Alt+N | add-node | undo removes the node |
| Duplicate node/subtree | Ctrl+D, context menu | bulk-import (new nodes) | undo removes the copies |
| Paste (copy or cut) | Ctrl+V, context menu | bulk-import (new nodes) | undo removes the pasted copies |
| Rename node | F2, context menu, inline | rename | undo restores name + path |
| Delete nodes (incl. subtree) | Delete, context menu, toolbar, removeNode/removeSelected | bulk-import (removed subtree) | undo removes already-removed nodes -> no-op; nothing restored |
| Cut (move to clipboard) | Ctrl+X, context menu | bulk-import (removed subtree) | same as delete; original can't be restored |
| Connect nodes (drag handle) | canvas drag, onConnect | bulk-import (new edge + path-changed nodes) | undo deletes the target child node |
| Delete edge(s) | select + Delete, context menu | bulk-import (removed edges, nodes:[]) | undo removes already-removed edges; edge never restored |
| Remove edges from a handle | context menu | bulk-import (removed edges, nodes:[]) | same as delete edge |
| Drag node / multi-select drag | canvas drag -> commitHistory() | bulk-import (entire current graph) | undo deletes the whole graph |
| Resize node | canvas resize handles -> handleNodesChange | none | not undoable |
| Import graph (folder/file/URL/sample/library) | setGraph(..., pushHistory=false) | none | not undoable (replaces graph) |
| Load saved graph / apply snapshot | applySnapshot -> setGraph(..., false) | none | not undoable (replaces graph) |
| Clear canvas (reset) | sidebar confirm | (clears past/future) | not undoable (wipes history) |

### Visibility mutations (hiddenIds / display)

| Action | Entry points | Op pushed | Status |
|---|---|---|---|
| Hide node / hide subtree | H, context menu, hideNode/hideNodes | none | not undoable |
| Hide selected | toolbar/shortcut hideSelected | none | not undoable |
| Toggle hidden | hidden-panel tree toggleHidden | none | not undoable |
| Show all nodes | Shift+H, sidebar, showAll | none | not undoable |
| Show ancestors / subtree / reveal | hidden-panel showAncestors/showSubtree/revealSubtree/showNode | none | not undoable |
| Toggle file visibility | sidebar/shortcut setShowFiles | none | not undoable |
| Max display depth | sidebar setMaxDisplayDepth | none | not undoable |
| Auto-hide large folders | import-time + setAutoHideThreshold | none | not undoable |
| Collapse-one (toggle) | double-click folder | toggle-collapse | undo restores collapsed flag |
| Collapse-all / expand-all | sidebar | none | not undoable |

### Layout / style / theme (view preferences)

| Action | Status |
|---|---|
| Layout direction, edge style/animated/stroke/width, corner radius, node dimensions (sidebar) | intentionally non-undoable |
| Theme mode / custom theme / theme presets | intentionally non-undoable |
| Search, selection, zoom, pan, fit-view, navigation | intentionally non-undoable |

### Root cause

historySlice.undo/redo restores only nodes and edges. Ops live in src/lib/fewer/types.ts / history.ts. The bulk-import op's undoOp always removes op.nodes/op.edges. That is correct only for "add-style" ops (import/duplicate/paste). It is incorrectly reused to record "remove-style" undo data:

- deleteNodes, moveNode(cut) push the removed subtree as bulk-import -> undo tries to remove already-absent nodes -> no-op.
- deleteEdges/removeEdgesFromHandle push removed edges as bulk-import -> undo no-op.
- connectNodes pushes path-changed nodes as bulk-import -> undo removes the child node.
- commitHistory (drag stop) pushes the full current graph as bulk-import -> undo removes everything.

Meanwhile the dedicated ops that would restore state — remove-node (restores subtree on undo) and move-node (position) — are defined but never used. And no op touches hiddenIds, showFiles, maxDisplayDepth, autoHideThreshold, collapsed (batch), node style/measured (resize).

## [Types]

Add new op types and a small "view-state" sidecar to the history entry. All in src/lib/fewer/types.ts.

```ts
// Common auxiliary graph state that some ops must restore.
export interface ViewState {
  hiddenIds: string[];
  showFiles: boolean;
  maxDisplayDepth: number;
  autoHideThreshold: number;
}

// New op types
export interface RemoveSubtreeOp {   // replaces bulk-import for deletes/cuts
  type: "remove-subtree";
  node: FewerNode;
  edge: FewerEdge | null;
  children: FewerNode[];
  childEdges: FewerEdge[];
}
export interface ConnectOp {
  type: "connect";
  edge: FewerEdge;
  changedNodeIds: string[];
  prevPaths: { nodeId: string; path: string }[];
}
export interface RemoveEdgesOp {
  type: "remove-edges";
  edges: FewerEdge[];
}
export interface MovePositionsOp {
  type: "move-positions";
  moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
}
export interface ResizeOp {
  type: "resize";
  changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[];
}
export interface CollapseBatchOp {
  type: "collapse-batch";
  changes: { nodeId: string; wasCollapsed: boolean; willCollapse: boolean }[];
}
export interface ViewStateOp {
  type: "view-state";
  before: ViewState;
  after: ViewState;
}

export type HistoryOp =
  | AddNodeOp
  | RemoveNodeOp          // keep (unused) OR replace with RemoveSubtreeOp
  | RenameOp
  | MoveNodeOp            // keep (unused) OR replace with MovePositionsOp
  | ToggleCollapseOp
  | BulkImportOp          // keep for genuine imports/duplicate/paste
  | RemoveSubtreeOp
  | ConnectOp
  | RemoveEdgesOp
  | MovePositionsOp
  | ResizeOp
  | CollapseBatchOp
  | ViewStateOp;
```

Every new op carries a before/after view-state sidecar so undo/redo can restore hiddenIds/showFiles/maxDisplayDepth/autoHideThreshold even when nodes/edges are the primary change. Existing ops that mutate visibility indirectly (delete, connect, collapse) also carry the sidecar.

## [Files]

- src/lib/fewer/types.ts — add the new op interfaces above; extend the HistoryOp union; add the ViewState interface.
- src/lib/fewer/history.ts — add applyOp/undoOp cases for every new op type; extend bulk-import undo to prune restored node ids from hiddenIds; add applyViewState/undoViewState helpers that apply ViewState diffs.
- src/store/slices/historySlice.ts — undo/redo must also restore hiddenIds, showFiles, maxDisplayDepth, autoHideThreshold in addition to nodes/edges; read the op sidecars and apply them; call relayout() after ops that change positions/collapse/dimensions.
- src/store/createStore.ts — fix commitHistory (drag) to push a MovePositionsOp instead of a full-graph bulk-import; fix applyEdgeChanges to push RemoveEdgesOp; route the legacy applyNodeChanges/applyEdgeChanges paths through the correct ops or remove them.
- src/store/slices/graphSlice.ts — change deleteNodes/moveNode(cut) to push RemoveSubtreeOp; connectNodes to push ConnectOp; deleteEdges/removeEdgesFromHandle to push RemoveEdgesOp; keep BulkImportOp for duplicateNodeUnderParent/pasteFromClipboard (correct) but add the view-state sidecar; collapseAll/expandAll to push CollapseBatchOp; toggleCollapse keeps ToggleCollapseOp.
- src/store/slices/uiSlice.ts — add history pushes to hideSelected, toggleHidden, setShowFiles; route showAll/showNode/showAncestors/showSubtree/revealSubtree through a shared pushViewStateOp(before, after) helper.
- src/store/slices/graphSlice.ts — add history pushes to hideNode/hideNodes, setMaxDisplayDepth, setAutoHideThreshold via the same ViewStateOp helper.
- src/components/fewer/GraphCanvas.tsx — replace commitHistory on onNodeDragStop/onSelectionDragStop with a move-positions push recording before/after positions for all dragged nodes (capture positions on onNodeDragStart, diff on stop); add onNodeResizeStart/onNodeResizeStop to push a ResizeOp capturing before/after dimensions.
- src/components/fewer/KeyboardShortcuts.tsx — no logic change; ensure Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y still call undo/redo.
- src/components/fewer/Toolbar.tsx — unchanged enabled/disabled logic (past/future lengths); verify buttons still bind to undo/redo.
- New test file src/lib/fewer/history.test.ts (project uses bun test).

## [Functions]

New (in src/lib/fewer/history.ts):
- applyViewState(nodes, edges, view) / undoViewState(...) — apply/restore hiddenIds/showFiles/maxDisplayDepth/autoHideThreshold.
- applyOp/undoOp cases for remove-subtree, connect, remove-edges, move-positions, resize, collapse-batch, view-state.
- captureViewState(state) — returns current ViewState from the store (used to fill before/after sidecars).

Modified:
- historySlice.undo / historySlice.redo — restore nodes+edges AND the op's view-state sidecar; call relayout() after ops that change positions/collapse/dimensions.
- graphSlice.deleteNodes — push RemoveSubtreeOp (node, edge, children, childEdges) instead of bulk-import; prune restored ids from hiddenIds on undo.
- graphSlice.moveNode (cut) — push RemoveSubtreeOp; the paste step already pushes bulk-import, so cut+paste composes into two undoable steps.
- graphSlice.connectNodes — push ConnectOp (edge + prevPaths); undo removes edge and restores paths (no node deletion).
- graphSlice.deleteEdges / removeEdgesFromHandle — push RemoveEdgesOp; undo re-adds edges.
- graphSlice.collapseAll / expandAll — push CollapseBatchOp.
- graphSlice.hideNode / hideNodes, uiSlice.setShowFiles, setMaxDisplayDepth, setAutoHideThreshold — push ViewStateOp capturing before/after.
- createStore.commitHistory — repurpose to push a MovePositionsOp (supplied by GraphCanvas) or remove it; no longer pushes full-graph bulk-import.

Removed:
- The broken bulk-import-as-removal usages in deleteNodes, connectNodes, deleteEdges, removeEdgesFromHandle, commitHistory, and applyEdgeChanges. BulkImportOp remains only for genuine adds (duplicate/paste) and gains a view-state sidecar.

## [Classes]

No class changes.

## [Dependencies]

None. Pure TypeScript refactor of existing store/history utilities.

## [Testing]

- src/lib/fewer/history.test.ts (bun test): unit tests for applyOp/undoOp round-trips on each new op type — remove-subtree, connect, remove-edges, move-positions, resize, collapse-batch, view-state — asserting symmetric undo/redo and that hiddenIds/showFiles/maxDisplayDepth are restored.
- Manual QA checklist:
  1. Add node -> undo removes, redo restores.
  2. Rename -> undo restores name; redo re-applies.
  3. Delete a folder -> undo restores folder + children + edges; redo re-deletes.
  4. Drag a single node and a multi-selection -> Ctrl+Z returns nodes to original positions (graph intact), Ctrl+Shift+Z re-applies drag.
  5. Connect A->B -> undo removes edge and restores B's path (B still exists); redo re-connects.
  6. Delete an edge -> undo restores it.
  7. Cut + paste -> undo once removes the pasted copy; undo again restores the original subtree.
  8. Hide a subtree -> undo reveals; redo re-hides. Show-all -> undo restores prior hidden set.
  9. Toggle file visibility / max display depth -> undo/redo restore both the flag and the hidden set.
  10. Collapse-all -> undo restores each folder's prior collapsed state; redo re-collapses.
  11. Resize a folder -> undo restores prior dimensions; redo re-applies.
  12. Confirm canUndo/canRedo and toolbar buttons reflect the new history correctly.
  13. Run bun run lint and bun run build; no errors.

## [Implementation Order]

1. Add new op types + ViewState to src/lib/fewer/types.ts.
2. Implement applyOp/undoOp + applyViewState/undoViewState for all new ops in src/lib/fewer/history.ts.
3. Extend historySlice.undo/redo to restore view-state and call relayout().
4. Convert graphSlice mutations (deleteNodes, moveNode, connectNodes, deleteEdges, removeEdgesFromHandle, collapseAll, expandAll, hideNode, hideNodes, setMaxDisplayDepth, setAutoHideThreshold) to the new ops.
5. Convert uiSlice visibility actions (hideSelected, toggleHidden, setShowFiles, showAll, showNode, showAncestors, showSubtree, revealSubtree) to ViewStateOps.
6. Fix createStore.commitHistory/applyEdgeChanges and GraphCanvas drag/resize wiring (onNodeDragStart/onNodeDragStop -> MovePositionsOp; onNodeResizeStart/onNodeResizeStop -> ResizeOp).
7. Add src/lib/fewer/history.test.ts; run bun test, bun run lint, bun run build.
8. Update CHANGELOG.md, bump package.json version, commit, push.
