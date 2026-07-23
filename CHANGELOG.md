# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial OSS documentation pack (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, AGENTS, issue/PR templates)

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
- Hide/unhide nodes with cascading shortcut support
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