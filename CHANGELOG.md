# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] - 2026-07

### Added

- **Ancestor path highlighting** — selecting a node highlights all edges from that node up to the root parent with the accent color (amber/orange `#fb923c` in light mode, purple `#a855f7` in dark mode)
- **Theme-aware edge colors** — edge highlight colors update immediately when switching between light/dark/custom themes
- **ELK (elkjs) layout engine** — replaces dagre with ELK's layered algorithm for more compact, balanced tree layouts. Async layout for initial import, sync fallback for relayout
- `parentId` and `collapsed` fields on `FewerNodeData` for tree navigation
- `fsHandleStore` — separate `Map<string, FileSystemHandle>` to keep live browser API objects out of serialized node data

### Changed

- **Split monolithic 1018-line `graphStore` into 6 focused Zustand slices**: graph, history, ui, layout, theme
- **Operation-based undo/redo** — stores diffs instead of full snapshots (critical for 10K+ node graphs)
- **`graphVersion` sync** — every mutation that changes `nodes`, `edges`, or `hiddenIds` now increments `graphVersion`, ensuring the React Flow canvas syncs immediately
- **Memory optimization:** BulkImportOp now stores only the removed/added subtree instead of the full arrays — cuts history memory from O(50×n) to O(50×k)
- **Memory optimization:** `FileSystemHandle` objects moved out of `FewerNodeData` into `fsHandleStore`
- **Memory optimization:** React Flow viewport culling via `onlyRenderVisibleElements=true` (minimap uses custom component independent of viewport)
- **Highlighted edges render on top** — sorted to end of array so they're never covered by grey edges
- **Show All button** now also calls `setShowFiles(true)` to restore file visibility
- Dagre layout parameters adjusted for tighter spacing (network-simplex ranker, reduced ranksep)

### Fixed

- Pre-existing `const` assertion errors in `fileOps.ts` and `graphSlice.ts`
- `Set<unknown>` type errors in `KeyboardShortcuts.tsx` and `graphSlice.ts`
- Infinite re-render loop in GraphCanvas (unconditional `useEffect` syncs)
- `descendantIds` scope bug in `connectNodes` (variable shadowed inside if-block)
- Duplicate `removeEdgesFromHandle` and `deleteEdges` function definitions
- URL import not rendering until "Beautify Layout" clicked (async `setGraph` → sync `layoutGraphSync`)
- Edge styles not updating when switching themes (added `useEffect` watching `themeMode`)

## [0.3.1] - 2026-07

### Added

- Operation-based undo/redo history (stores diffs instead of full snapshots, critical for 10K+ node graphs)
- Chunked tree-to-graph import with progress callback (`chunkTreeToGraph`)
- Async layout support via `requestIdleCallback` (`runLayoutAsync`)
- `ImportProgress` component for large directory imports
- Typed store hooks with shallow comparison selectors (`useGraphData`, `useLayoutConfig`, `useUiState`)
- History operation types (`HistoryOp`) and `applyOp`/`undoOp` functions
- `fsHandleStore` — separate `Map<string, FileSystemHandle>` to keep live browser API objects out of serialized node data
- `parentId` and `collapsed` fields on `FewerNodeData` for tree navigation

### Changed

- Split monolithic 1018-line `graphStore` into 6 focused Zustand slices: graph, history, ui, layout, theme
- Rewrote `graphStore.ts` as a thin re-export wrapper for backward compatibility
- `applySearch` now only recomputes when `searchQuery` changes, not on every mutation
- GraphCanvas now uses `as OnNodesChange` cast for React Flow v12 compatibility
- **Memory optimization:** BulkImportOp now stores only the removed/added subtree instead of the full `nodes`/`edges` arrays — cuts history memory from O(50×n) to O(50×k) where k << n
- **Memory optimization:** `FileSystemHandle` objects moved out of `FewerNodeData` into `fsHandleStore` — reduces per-node memory by removing heavy browser API objects from serialized data
- **Memory optimization:** React Flow viewport culling enabled (`onlyRenderVisibleElements=true`) — previously all nodes were rendered regardless of viewport

### Fixed

- Pre-existing `const` assertion errors in `fileOps.ts` and `graphSlice.ts`
- `Set<unknown>` type errors in `KeyboardShortcuts.tsx` and `graphSlice.ts`
- `descendantIds` scope bug in `connectNodes` (variable was shadowed inside if-block)
- Duplicate `removeEdgesFromHandle` and `deleteEdges` function definitions in graphSlice

## [0.3.0] - 2026-07

### Added

- GitHub repository import via URL (new API route `/api/github-tree`, `useGitHubImport` hook)
- Import URL dialog for fetching public GitHub repo trees
- SVG logo component with gradient styling (replaces inline icons)
- Flat logo variant (`logo_flat.svg`, `logo_flat.png`)
- `ROADMAP.md` with categorized short/medium/long-term plans
- Demo screenshot (`public/demo.png`) for README
- Tutorial checklist items can now be toggled on/off
- Tutorial text adapted for touch-only devices

### Changed

- Rewrote README with gold-standard patterns: problem-first lead, trust block near install, show-don't-tell demo, collapsed depth for features/architecture
- Replaced inline icons in `GlobalNavbar` with `Logo` component
- Updated logo assets (new coordinates in `logo.svg`, updated `logo.png`)
- Extracted Roadmap section from README into standalone `ROADMAP.md`
- Replaced ASCII tree in README with live demo screenshot

### Fixed

- License badge and section: MIT → AGPLv3 (matches LICENSE)
- Pre-existing lint error: ref mutation during render in `GraphCanvas.tsx` (moved to `useEffect`)
- Duplicate rename commit on folder rename; descendant paths now update correctly on rename

## [0.2.0] - 2025

### Added

- Breadcrumb navigation bar showing selected node's full path
- Custom theme editor with 15 CSS color variables and live color pickers
- Import from File dialog (JSON, ASCII tree, shell/batch scripts)
- Search panel with fuzzy matching and click-to-zoom
- Stats panel with file/folder counts, size, by-category breakdown
- Bug report dialog with auto-collected diagnostics
- Shortcuts dialog (Ctrl+I) with categorized keyboard reference
- Interactive tutorial with spotlight walkthrough
- Error boundary with retry/reload UI
- Device detection (mobile/tablet/desktop) with responsive sidebar
- Support for 4 layout directions and 3 edge styles
- 7 export formats: SVG, PNG, JSON, CSV, DOT, directory scripts, ASCII tree
- Undo/redo history (50 steps) with drag-aware commit
- Drag-connect nodes with cycle/parenting validation
- Copy/cut/paste (duplicate) with "copy" naming convention
- Hide/show nodes with cascading shortcut support
- Node resize (folders multi-direction, files horizontal)
- Filename extension and category auto-update on rename
- Brave browser detection with workaround instructions
- Fallback webkitdirectory support for Firefox/Safari
- Export selected subtree only toggle

### Changed

- Upgraded to Next.js 16 with Turbopack
- Upgraded to React 19
- Upgraded to Tailwind CSS 4
- Upgraded to shadcn/ui New York style
- Upgraded to React Flow v12 (@xyflow/react)
- Migrated from Prisma to SQLite for database layer
- Enhanced Dagre layout with type-aware node dimensions

### Fixed

- Various edge cases in connection validation
- Drag undo committing per-frame (now one undo step per drag)

## [0.1.0] - 2025

### Added

- Initial release
- Interactive node-based graph canvas with React Flow
- Folder and file card components with scrollable children
- Directory import via File System Access API
- Create, rename, delete, duplicate nodes
- Arrow key tree navigation
- Keyboard shortcuts for all major operations
- Light/dark theme support
- Dagre auto-layout
- Minimap and zoom controls
- Context menus for folders, files, and canvas
