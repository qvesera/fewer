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

---

## [Spike T-251: drive.file + Google Picker folder-grant semantics] (2026-11-09, throwaway branch `spike/drive-file-picker`)

**Status: DONE — verdict: U1 FALSE, B dead for tree browsing (decision rule row 3).**

### Hypotheses (final verdicts)

| # | Hypothesis | Verdict |
|---|---|---|
| U1 | children/grandchildren of a picked folder listable via `files.list` | **FALSE** — picker grant covers the picked item only |
| U2 | server-held token runs the same listing (grant per client+user+file) | TRUE but moot — server matched browser everywhere; both see only granted items |
| U3 | entries carry `size`/`mimeType`/`webViewLink` | TRUE (file.txt size 14, webViewLink both sides) — moot |

### Decision-rule row 3: P1/P2 ❌ → **B dead** → A (keep `drive.metadata.readonly`, pay CASA) or C (fully client-side)

### Why

Option B (move Google Drive to `drive.file` scope + Picker-first UX) vs Option A (keep `drive.metadata.readonly`, pay annual CASA) vs Option C (fully client-side Drive). Google's docs don't answer whether `drive.file` grants reach a *picked folder's descendants* for `files.list` — hence a spike.

### Hypotheses

| # | Hypothesis | Decides |
|---|---|---|
| U1 | After picking folder F in the Picker under `drive.file`, `files.list(q="'F' in parents")` returns F's direct children, and recursion reaches grandchildren | If false, B can't render a tree → B dead |
| U2 | A server-held token (same client_id, `drive.file`) can run the same listing — grant is per client+user+file, not per token | If true, only the *pick* goes client-side; listing stays in `listChildren()` |
| U3 | Picked/listed entries still carry `size`, `mimeType`, `webViewLink` for `CloudEntry`/`toEntry()` | If not, graph loses sizes/links |

### Decision rule (written before running)

| Outcome | Verdict |
|---|---|
| P1 ✅ P2 ✅ P3 ✅ | **B viable** → plan B: picker-first UX, client token for pick only, privacy-doc rewrite (`content/docs/cloud.md:60`), re-link migration for existing connections |
| P1 ✅ P3 ❌ | B only with client-side listing → B costs the server-token promise; weigh against C |
| P1/P2 ❌ | **B dead** for tree browsing → A (pay CASA) or C (client-side) |

### Prerequisites (human, GCP console, ~10 min)

1. Enable **Google Picker API** on the existing project behind `.env.local`.
2. Create **API key**, restrict to `http://localhost:3000` → put it in `.env.local` as `GOOGLE_PICKER_API_KEY=…`.
3. OAuth consent screen → Data Access → add scope `https://www.googleapis.com/auth/drive.file` (keep existing restricted scope).
4. Confirm Authorized redirect URI contains `http://localhost:3000/api/cloud/callback` and Authorized JavaScript origin contains `http://localhost:3000`.
5. Keep consent status **Testing** + account in **Test users**.
6. Fixture in Drive: `spike-parent/{spike-child-a/inner.txt, spike-child-b/, file.txt}` + one sibling folder left unpicked (for P4).
7. **Unlink + re-link Google Drive** in the app (old `drive.metadata.readonly` connection doesn't carry over after `SCOPE` switched to `drive.file`).

### Runbook

```bash
bun run dev
# sign in at / → Sidebar → connect Google Drive (new consent shows drive.file)
# open http://localhost:3000/dev/picker → Open Picker → pick spike-parent
# paste unpicked sibling folder id into the P4 field BEFORE picking (or re-pick after)
# probes P1–P4 render with PASS/FAIL + raw JSON
```

### Temporary artifacts (DELETE after spike — all marked in-file)

- `src/lib/fewer/cloud/providers/google.ts` — `SCOPE` → `drive.file` (revert to `drive.metadata.readonly`)
- `src/app/api/dev/google-token/route.ts` — dev-only (`NODE_ENV==="production"` → 404) token-to-browser route; **its existence is a finding**: B forces a token into the page, contradicting `content/docs/cloud.md` "Tokens are never sent to your browser"
- `src/app/dev/picker/page.tsx` — GIS/gapi Picker + probes P1–P4
- `src/components/fewer/CloudPanel.tsx` — `HIDDEN_PROVIDERS` drops `google-drive` + `onedrive` (link options re-enabled for local testing; restore both entries on revert)

### Side-finding (KEEP after spike revert — genuine bug)

OAuth redirects landed on `/` (marketing landing page) since the home split; the `?cloud=connected|error` params are consumed only by `FewerApp` at `/app`, so the success toast + panel refresh never fired (connection row itself persisted — `persistConnection` runs before the redirect). Fixed: all 4 redirect targets in `api/cloud/callback` + `api/cloud/connect` now point at `/app`.

### P1–P4 raw results

**Decisive evidence — 6 folders picked, inheritance never observed (2026-11-09):**

| Picked folder | Folder metadata | Actual children | Children the app saw |
|---|---|---|---|
| `hisoka` (picked 4×) | 200 | `astro`, `zz-test.txt` | `astro` only — **anomaly** |
| `spike2` (4×) | 200 | `spike-child-a/b`, `file.txt` | none |
| `discord` | 200 | 12 items (all old: `.vscode`, `astro.exe`, `test*.py`…) | `hisoka` only — *itself directly picked earlier* |
| `.vscode` | picked | populated | none |
| `cogs` | picked | populated | none |
| `Gemini Gems` | picked | populated | none |

Rule that fits all six: **`drive.file` + Picker grants the picked item only. Children are visible only when themselves picked or app-created.** Verified via `files.list` (4 q-variants), name/fullText search, `files.get`, legacy v2 `children`; no propagation within 45–180 min. `astro` (created 0.7 s after `hisoka`, Aug 8) is a one-off unexplained grant — metadata clean (`shared:false`, owner-only); not a reproducible mechanism.

**Run logs:** run 1 (picked `hisoka`, wrong-folder name-check FAIL but P1/P3 returned `astro` — first U1 false negative), run 2 (app-created fixture — **confound**: app-created files auto-grant under `drive.file`, so P1/P2 green results were vacuous), runs 3–5 (`spike2` re-picks, `discord`, `.vscode`/`cogs`/`Gemini Gems` — all `[]` for unpicked children). P4 control: unpicked-folder metadata `404`, children `[]` (app-created marker files inside it were visible → further proof of the per-item rule).

**Consequences for B:** even in the best case B would need a pick per tree level (unusable UX), a client-side token (breaking `content/docs/cloud.md`'s "tokens never sent to your browser"), a privacy-doc rewrite and a re-link migration — none of which it now earns. **Recommendation: A (keep `drive.metadata.readonly`, pay CASA) or C (client-side).**

**Artifacts reverted with this close-out:** `SCOPE` → `drive.metadata.readonly`, `CloudPanel.tsx` `HIDDEN_PROVIDERS` restored, `src/app/dev/picker/` + `src/app/api/dev/google-token/` deleted. The OAuth `/app` redirect fix was split out (PR on `fix/cloud-oauth-redirect`).

**Decision (2026-11-10):** do nothing until revenue justifies CASA — `drive.metadata.readonly` and the server-side Drive infrastructure stay, Google Drive linking stays **disabled** in the Cloud panel, OneDrive linking is **enabled** (Microsoft publisher verification is free). Free alternatives (service-account folder-share, Testing-mode consent with 7-day tokens, BYOK, zip import) are recorded as fallbacks in `.repowise/decisions.yaml` (id `f8944b37`).
