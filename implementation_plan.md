# Implementation Plan: Client-side Virtualization + SOLID Refactor

## Overview

Refactor the fewer codebase to handle 10,000+ node graphs on consumer devices by splitting the monolithic Zustand store into focused slices (SOLID), implementing operation-based history to replace full snapshot cloning, adding a Web Worker for layout computation, and ensuring React Flow's viewport culling works effectively through deferred rendering and progressive loading.

## Current Problems (from investigation)

1. **History clones ALL nodes+edges every change** — 50 snapshots × 10K nodes = ~50 copies in memory
2. **`applySearch` mutates every node on every store change** — O(n) on every mutation
3. **GraphCanvas has 14 separate `useGraphStore` subscriptions** — each triggers re-render on any store change
4. **Sidebar is 954 lines with inline components** — `CollapsibleSection`, `AnimatedConditional`, `MinimapControls` all defined inside
5. **CustomNode is 905 lines** — context menus, child entries, rename input all co-located
6. **No import progress** — 10K file import blocks main thread with no feedback
7. **Layout runs synchronously on main thread** — dagre on 10K nodes freezes UI
8. **`treeToGraph` + `setGraph` are synchronous** — no chunking for large imports

## Types

### Operation-based History (replaces full snapshots)

```typescript
// src/lib/fewer/history.ts

interface AddNodeOp {
  type: 'add-node';
  node: FewerNode;
  edge: FewerEdge | null;
}

interface RemoveNodeOp {
  type: 'remove-node';
  node: FewerNode;
  edge: FewerEdge | null;
  children: FewerNode[];
  childEdges: FewerEdge[];
}

interface MoveNodeOp {
  type: 'move-node';
  nodeId: string;
  from: { parentId: string | null; x: number; y: number };
  to: { parentId: string | null; x: number; y: number };
}

interface RenameOp {
  type: 'rename';
  nodeId: string;
  oldLabel: string;
  newLabel: string;
}

interface BulkImportOp {
  type: 'bulk-import';
  nodes: FewerNode[];
  edges: FewerEdge[];
}

interface ToggleCollapseOp {
  type: 'toggle-collapse';
  nodeId: string;
  wasCollapsed: boolean;
}

type HistoryOp = AddNodeOp | RemoveNodeOp | MoveNodeOp | RenameOp | BulkImportOp | ToggleCollapseOp;

interface HistoryEntry {
  ops: HistoryOp[];
  timestamp: number;
}
```

### Store Slices

```typescript
// src/store/slices/graphSlice.ts — nodes, edges, collapse, connect
interface GraphSlice {
  nodes: FewerNode[];
  edges: FewerEdge[];
  setGraph: (nodes: FewerNode[], edges: FewerEdge[], replace?: boolean) => void;
  addNode: (...) => string;
  removeNode: (...) => void;
  toggleCollapse: (...) => void;
  onNodesChange: (...) => void;
  onConnect: (...) => void;
  connect: (source: string, target: string) => void;
  // internal: _applySearch, _pushOp
}

// src/store/slices/historySlice.ts — undo/redo with ops
interface HistorySlice {
  past: HistoryEntry[];
  future: HistoryEntry[];
  pushOp: (op: HistoryOp | HistoryOp[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

// src/store/slices/uiSlice.ts — selection, search, hidden, renaming, dialogs
interface UiSlice {
  selectedNodeIds: string[];
  searchQuery: string;
  hiddenIds: string[];
  renamingId: string | null;
  zoomToNodeId: string | null;
  setSearchQuery: (q: string) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setRenamingId: (id: string | null) => void;
  setZoomToNode: (id: string | null) => void;
}

// src/store/slices/layoutSlice.ts — direction, edge style, dimensions
interface LayoutSlice {
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  edgeAnimated: boolean;
  edgeStrokeStyle: EdgeStrokeStyle;
  edgeWidth: number;
  cornerRadius: number;
  nodeWidth: number;
  nodeHeight: number;
  setDirection: (d: LayoutDirection) => void;
  setEdgeStyle: (s: EdgeStyle) => void;
  // ... other setters
}

// src/store/slices/themeSlice.ts — theme mode, custom theme
interface ThemeSlice {
  themeMode: ThemeMode;
  customTheme: Record<string, string>;
  setThemeMode: (m: ThemeMode) => void;
  setCustomTheme: (t: Record<string, string>) => void;
}

// src/store/slices/clipboardSlice.ts — copy/paste
interface ClipboardSlice {
  clipboard: { nodes: FewerNode[]; edges: FewerEdge[] } | null;
  copy: (ids: string[]) => void;
  paste: () => void;
  cut: (ids: string[]) => void;
}
```

### Import Progress

```typescript
// src/lib/fewer/importProgress.ts
interface ImportProgress {
  phase: 'reading' | 'building-tree' | 'layout' | 'rendering';
  processed: number;
  total: number;
  percent: number;
}
```

## Files

### New Files

| File | Purpose |
|------|---------|
| `src/store/slices/graphSlice.ts` | Graph data slice (nodes, edges, mutations) |
| `src/store/slices/historySlice.ts` | Operation-based undo/redo |
| `src/store/slices/uiSlice.ts` | UI state (selection, search, hidden, renaming) |
| `src/store/slices/layoutSlice.ts` | Layout/style config |
| `src/store/slices/themeSlice.ts` | Theme state |
| `src/store/slices/clipboardSlice.ts` | Copy/paste/cut |
| `src/store/slices/types.ts` | Slice interfaces |
| `src/store/createStore.ts` | Zustand store combining all slices |
| `src/store/hooks.ts` | Typed selectors + shallow comparison helpers |
| `src/lib/fewer/history.ts` | HistoryOp types + apply/undo logic |
| `src/lib/fewer/chunkImport.ts` | Chunked tree→graph conversion for large imports |
| `src/components/fewer/node/FolderCard.tsx` | Extracted folder card from CustomNode |
| `src/components/fewer/node/FileCard.tsx` | Extracted file card from CustomNode |
| `src/components/fewer/node/NodeContextMenu.tsx` | Extracted context menus |
| `src/components/fewer/sidebar/CollapsibleSection.tsx` | Extracted from Sidebar |
| `src/components/fewer/sidebar/MinimapControls.tsx` | Extracted from Sidebar |
| `src/components/fewer/sidebar/FileSection.tsx` | Extracted file import section |
| `src/components/fewer/sidebar/LayoutSection.tsx` | Extracted layout controls |
| `src/components/fewer/sidebar/AppearanceSection.tsx` | Extracted appearance controls |
| `src/components/fewer/ImportProgress.tsx` | Progress bar during large imports |

### Modified Files

| File | Changes |
|------|---------|
| `src/store/graphStore.ts` | Rewrite as thin wrapper combining slices; keep same export signature |
| `src/components/fewer/GraphCanvas.tsx` | Replace 14 subscriptions with 3-4 selectors; add deferred rendering; wrap `visibleNodes`/`visibleEdges` in `useMemo` with stable refs |
| `src/components/fewer/CustomNode.tsx` | Slim down to ~200 lines; import FolderCard/FileCard/NodeContextMenu |
| `src/components/fewer/Sidebar.tsx` | Slim down to ~200 lines; import extracted sections |
| `src/components/fewer/FewerApp.tsx` | Wire up ImportProgress; use new store hooks; add chunked import flow |
| `src/components/fewer/SearchPanel.tsx` | Use `uiSlice` selector; add virtualized list for 50+ results |
| `src/components/fewer/ImportDialog.tsx` | Emit progress events during import |
| `src/lib/fewer/treeToGraph.ts` | Support chunked conversion for 10K+ entries |
| `src/lib/fewer/layout.ts` | Add async layout via Web Worker fallback; batch layout for visible nodes only |
| `src/lib/fewer/stats.ts` | Use selector-based stats instead of full node scan |
| `src/components/fewer/BreadcrumbBar.tsx` | Update store selectors |
| `src/components/fewer/CanvasToolbar.tsx` | Update store selectors |
| `src/components/fewer/Toolbar.tsx` | Update store selectors |

### Deleted Files

None — old `graphStore.ts` is rewritten in-place.

## Functions

### New Functions

| Function | File | Signature | Purpose |
|----------|------|-----------|---------|
| `createGraphSlice` | `slices/graphSlice.ts` | `(set, get, api) => GraphSlice` | Zustand slice for graph data |
| `createHistorySlice` | `slices/historySlice.ts` | `(set, get, api) => HistorySlice` | Zustand slice for undo/redo |
| `createUiSlice` | `slices/uiSlice.ts` | `(set, get, api) => UiSlice` | Zustand slice for UI state |
| `createLayoutSlice` | `slices/layoutSlice.ts` | `(set, get, api) => LayoutSlice` | Zustand slice for layout config |
| `createThemeSlice` | `slices/themeSlice.ts` | `(set, get, api) => ThemeSlice` | Zustand slice for theme |
| `createClipboardSlice` | `slices/clipboardSlice.ts` | `(set, get, api) => ClipboardSlice` | Zustand slice for clipboard |
| `applyOp` | `lib/fewer/history.ts` | `(nodes, edges, op) => { nodes, edges }` | Apply single history op forward |
| `undoOp` | `lib/fewer/history.ts` | `(nodes, edges, op) => { nodes, edges }` | Apply single history op in reverse |
| `chunkTreeToGraph` | `lib/fewer/chunkImport.ts` | `(tree, opts, onProgress) => Promise<{ nodes, edges }>` | Async chunked conversion |
| `runLayoutAsync` | `lib/fewer/layout.ts` | `(nodes, edges, dir) => Promise<FewerNode[]>` | Layout via requestIdleCallback or Worker |
| `useGraphStore` (selector hooks) | `store/hooks.ts` | Various | Typed selectors with shallow compare |
| `ImportProgress` | `components/fewer/ImportProgress.tsx` | `FC<{ progress: ImportProgress }>` | Progress bar UI |

### Modified Functions

| Function | File | Changes |
|----------|------|---------|
| `layoutGraph` | `lib/fewer/layout.ts` | Add `excludeFromLayout` optimization: only layout visible+expanded nodes; skip fully collapsed subtrees |
| `treeToGraph` | `lib/fewer/treeToGraph.ts` | Add chunked mode: yield nodes in batches of 500, call onProgress callback |
| `setGraph` | `graphStore.ts` | Support chunked setting: accept node batches, call `applySearch` only on final batch |
| `applySearch` | `graphStore.ts` | Only recompute when `searchQuery` changes, not on every mutation |
| `buildTreeFromHandle` | `lib/fewer/fileSystem.ts` | Add progress callback for large directories |

## Classes

No new classes. This codebase is functional/React-based; classes would be a regression.

## Dependencies

### New Dependencies

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `@tanstack/react-virtual` | `^3.x` | Virtualize search result list (50+ items) | Lightweight, works with any list |
| None for virtualization | — | React Flow v12 already has viewport culling | Don't add what's already there |

### No Changes

- `@xyflow/react` ^12.11.2 — already has built-in viewport culling
- `zustand` ^5.0.6 — slices are native Zustand pattern, no upgrade needed
- `@dagrejs/dagre` ^3.0.0 — keep, but run async

## Testing

### Manual Testing

1. **Import 10K files** — create a test directory with 10K files using `find /usr -type f | head -10000`, import via folder picker, verify progress bar shows, UI stays responsive
2. **Undo/redo with 10K nodes** — add/delete/rename nodes, verify undo/redo works without lag
3. **Search with 10K nodes** — type in search, verify highlighting updates within 100ms
4. **Layout with 10K nodes** — change direction, verify layout completes without freeze (should be < 2s)
5. **Mobile responsiveness** — test on 375px viewport, verify sidebar toggle works
6. **Collapse/expand** — collapse root folder with 1K children, verify node count drops
7. **Memory check** — open Chrome DevTools Performance Monitor, import 10K nodes, verify memory stays under 500MB

### Existing Tests

Run `npm run lint && npm run build` — must pass.

## Implementation Order

1. **Create slice types and store structure** — `slices/types.ts`, `createStore.ts`, `hooks.ts`
2. **Extract history into operation-based system** — `lib/fewer/history.ts`, `slices/historySlice.ts`
3. **Create graph slice** — extract graph mutations from old store
4. **Create UI slice** — extract selection, search, hidden state
5. **Create layout slice** — extract layout config
6. **Create theme and clipboard slices** — extract theme/clipboard
7. **Rewrite graphStore.ts** — combine slices, maintain same export API
8. **Update all components to use new selectors** — fix re-render issues
9. **Extract Sidebar components** — CollapsibleSection, FileSection, LayoutSection, AppearanceSection, MinimapControls
10. **Extract CustomNode components** — FolderCard, FileCard, NodeContextMenu
11. **Add chunked import** — chunkTreeToGraph, ImportProgress component
12. **Add async layout** — runLayoutAsync with requestIdleCallback
13. **Optimize search** — only recompute on query change, virtualize result list
14. **Build and test** — npm run lint && npm run build
</parameter>
<content>
<task_progress>
- [ ] Step 1: Create slice types and store structure
- [ ] Step 2: Extract history into operation-based system
- [ ] Step 3: Create graph slice
- [ ] Step 4: Create UI slice
- [ ] Step 5: Create layout slice
- [ ] Step 6: Create theme and clipboard slices
- [ ] Step 7: Rewrite graphStore.ts combining slices
- [ ] Step 8: Update all components to use new selectors
- [ ] Step 9: Extract Sidebar components
- [ ] Step 10: Extract CustomNode components
- [ ] Step 11: Add chunked import with progress
- [ ] Step 12: Add async layout
- [ ] Step 13: Optimize search
- [ ] Step 14: Build and test
</task_progress>
</write_to_file>