# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Theme presets** — 18 popular open source theme presets (Catppuccin, Nord, Dracula, Gruvbox, Tokyo Night, Rose Pine, Solarized, One Dark/Light, GitHub, Material)
- **Draggable theme editor** — Opens as a movable panel when selecting Custom theme, locked within browser window bounds
- **Minimize theme editor** — Click the minimize (−) button to collapse the Custom Theme dialog into a small draggable dock pill that snaps to any position along the canvas edges (top/bottom/left/right); pill renders vertically on side edges. Click pill to restore.
- **Theme-aware UI** — All buttons, sliders, switches, and icons follow the active theme's primary/secondary colors
- **Export panel secondary colors** — Export panel uses file icon color scheme for sliders, switches, and format selection
- **Close theme editor on light/dark switch** — Custom theme dialog automatically closes when switching to light or dark mode
- **Reset settings on power user toggle off** — All settings reset to defaults including theme when disabling power user mode

- **Structured custom theme colors** — each theme color now has independent `{ color, opacity }` fields instead of plain CSS strings. Per-color opacity slider in the Custom Theme Editor with live preview swatch.
- **Open Color palette** — dark mode defaults migrated to Open Color (gray/orange/grape families) for consistent, accessible color values.
- **`themeColors.ts` module** — `hexToRgb`, `clampOpacity`, `toCssColor`, `migrateCustomTheme`, `resolveCss` utilities. Handles legacy plain-string theme migration to structured format.
- **Theme color tests** — 8 tests covering `hexToRgb`, `toCssColor`, `clampOpacity`, and `migrateCustomTheme` (legacy + structured + empty input).
- **Sectioned Custom Theme Editor** — colors grouped into "Canvas & Text", "Folders", "Files" sections with descriptions and opacity sliders.
- **`react-colorful` color picker** — `HexAlphaColorPicker` with gradient panel, hue strip, and alpha channel built into each theme color popover.
- **Per-type secondary text** — `folderSubtleText` and `fileSubtleText` controls for folder paths/footers and file extensions/sizes.

### Changed

- **Bun as default package manager** — `bun install`, `bun run dev/build/lint/test`. Removed `package-lock.json` in favor of `bun.lock`. Installed Bun 1.3.14. Docs updated (README, AGENTS.md, CONTRIBUTING, netlify.toml, PR template).
- **`ThemeColorMeta` expanded** — now includes `description`, `defaultColor`, `defaultOpacity`, and `openColor` fields for richer editor metadata.
- **`ThemeProvider`** — uses `migrateCustomTheme` for safe legacy theme loading + `applyCustomThemeToDOM` for structured color application.
- **Dark mode CSS variables** — `globals.css` updated with Open Color-based values for text, edges, handles, folder/file colors.
- **Simplified folder/file theme controls** — 5 controls each (body, text, secondary text, border, icon). Removed separate `folderHeaderBg`/`folderHeaderText`; folder text controls title, secondary text controls path/footers. Added `fileText` and `fileSubtleText` controls.

### Fixed

- **Custom theme canvas background** — canvas now reads `--fewer-background` via inline style, so custom background color actually applies.
- **Theme mode class cleanup** — switching to custom mode now removes `light`/`dark` classes from `<html>`, preventing CSS variable conflicts and unwanted aurora overlays.
- **Connection handle colors** — handles now use `--fewer-handle` CSS variable instead of hardcoded `slate-700`, following the active theme.
- **Hidden nodes chip** — uses theme-aware `--fewer-folder-icon` color instead of hardcoded amber, visible in all theme modes.
- **Hidden panel dots** — folder/file indicator dots in the sidebar Hidden Nodes section now use theme-aware `--fewer-folder-icon` / `--fewer-file-icon` colors.

## [0.3.4]

### Added

- **Sponsor / Ko-fi button** in Settings → About tab linking to GitHub Sponsors.
- **GitHub Sponsors funding entry** added to `package.json` so GitHub shows a sponsor button on the repo.
- **Sidebar Aurora Haze integration** — sidebar container now uses `gm-aurora gm-aurora-warm` for subtle warm atmospheric tint. Section cards refined: subtler borders (`border-border/20`), lighter backgrounds (`bg-card/5`), cleaner hover states. Footer redesigned from text blob to structured shortcut-hint grid with `<kbd>` chips. Icon sizes standardized to `h-3.5 w-3.5` for all secondary actions.
- **Reusable SlidingToggle component** — extracted from Edge Motion into generic multi-option toggle with sliding indicator + glow animation. Now used for Edge Style, Edge Motion, and Stroke Pattern.
- **Sidebar layout cleanup** — split dense "Layout & Edges" section into focused "Layout" (direction, depth, auto-hide, beautify) and "Edges" (style, motion, stroke, weight) sections. "Edges" collapsed by default to reduce initial clutter. Max Display Depth and Auto-hide threshold sliders now only visible in advanced mode.
- **Motion tokens** — `--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1)` and `--dur-aurora: 200ms` for consistent Aurora Haze transitions.
- **Settings Dialog** — unified tabbed settings dialog (About, Appearance, Advanced, Help) opened via gear icon in the top navbar (right of notifications). Consolidates previously scattered utility controls.
- **About tab** — app version, description, GitHub/website links, credits.
- **Appearance tab** — theme mode selector (light/dark/custom), custom theme editor, and Show files toggle moved from the sidebar.
- **Advanced tab** — Power User toggle, minimap controls (visibility/position/size), and node dimension sliders moved from the sidebar.
- **Help tab** — buttons to open the Keyboard Shortcuts dialog, Bug Report dialog, restart the tutorial, and links to GitHub issues/website.

### Changed

- Sidebar decluttered — removed Configuration, Minimap, and Node Metrics sections; theme mode buttons moved out of Appearance section (Show files toggle stays).

### Fixed

- **Include File Nodes toggle preserves ancestor-aware visibility** — re-enabling "Include File Nodes" no longer reveals files whose parent folder is hidden, preventing orphan file nodes from appearing as root-level items on the canvas.
- **GlobalNavbar simplified** — removed Keyboard/Bug/GitHub/Globe buttons; now Logo + Search + Notifications + Settings gear.
- **Minimap controls** and **node dimension sliders** moved from sidebar to Settings → Advanced tab.
- **Power User toggle** moved from sidebar Configuration section to Settings → Advanced tab.
- **Tutorial restart** now accessible via Settings → Help tab (uses `fewer-restart-tutorial` window event).

## [0.3.3] - 2026-08

### Added

- **Auto-hide large folder children** — folders with >10 children hide their children on import (threshold adjustable in sidebar, 2-100). Hidden children appear in the sidebar Hidden Nodes section grouped by folder.
- **Recursive Hidden Nodes tree** — hidden nodes shown as nested expandable tree, any depth. Eye button on a folder reveals its subtree; large grandchildren stay hidden via re-applied auto-hide.
- **Max Display Depth** — configurable display depth (default 6 levels) for both import-time and post-import. Deeper nodes go to Hidden Nodes.
- **Sidebar drag-resize** — drag the right edge of the sidebar to resize it (200-560px).
- **File nodes hide output handle** — files can't have children, so their source handle is hidden.

### Changed

- **Memory leak fixes:** `fsHandleStore` now cleared on `reset()` — handles no longer accumulate across imports
- **Memory leak fixes:** `fsHandle` removed from `expandFolderNode` node data — uses `fsHandleStore` instead of storing live `FileSystemDirectoryHandle` on every node
- **Memory optimization:** Virtualized child list in folder cards — only renders visible children (+5 overscan) instead of all children as DOM nodes
- **`FileEntryContextMenu` "Open File"** now reads from `fsHandleStore` instead of `node.data.fsHandle`
- **Auto-hide toast on import** — shows how many items were auto-hidden (folders with >10 children), directory, URL, and library imports.
- **Revealed roots protected from re-hiding** — explicitly shown folders stay visible even when their parent still has >10 children.
- **Toast notifications for all major actions** — delete, copy, cut, duplicate, paste, unparent, connect, relayout, show/hide nodes, open file, refresh from disk, and more.
- **Toast stacking** — up to 5 simultaneous toasts with right-side viewport and proper spacing (`gap-2`, `items-end`).
- **Notification history panel** — click the bell icon in the navbar to view past notifications; badge shows unread count and clears on open.
- **Auto-hide threshold slider** — adjustable threshold (2-100) in the sidebar Layout section controls when folder children get auto-hidden.

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
