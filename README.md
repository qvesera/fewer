# fewer

> Transform your file system navigation into an art form — an interactive, graph-based directory visualizer.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![React Flow](https://img.shields.io/badge/React_Flow-12-blueviolet)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Overview

fewer is a browser-based directory visualization tool that turns file system structures into interactive, explorable graphs. Built with React Flow and Dagre, it lets you import real directories, explore folder hierarchies visually, manage files, and export the structure in 7 different formats — all without leaving your browser.

Whether you're understanding a new codebase, documenting a project structure, or planning a directory reorganization, fewer gives you a bird's-eye view with the detail of a file manager.

## Features

### Import & Build

- **Import real directories** via the File System Access API (Chrome/Edge) with configurable depth, hidden file, and extension filters
- **Import from File** — build a graph from a JSON export, ASCII tree text, or shell/batch `mkdir` scripts
- **Fallback support** for Firefox/Safari via `webkitdirectory`
- **Brave browser detection** with specific flag workaround instructions

### Graph Visualization

- **Interactive node-based canvas** powered by React Flow v12
- **Folder cards** (orange) display children inline with scrollable lists, item counts, and file sizes
- **File cards** (purple) show filename, extension, category icon, and size
- **4 layout directions**: Top→Bottom, Left→Right, Bottom→Top, Right→Left
- **3 edge styles**: Curved (bezier), Angled (smoothstep with adjustable corner radius), Straight
- **Dagre auto-layout** with type-aware node dimensions and generous spacing
- **Minimap** with custom styling for quick navigation
- **Breadcrumb navigation bar** showing the selected node's full path

### Node Operations

- **Create nodes** via sidebar buttons, Ctrl+N, or context menu
- **Rename** inline via F2 or context menu (with extension + category auto-update)
- **Duplicate** via Ctrl+C → Ctrl+V with "copy" naming convention (e.g., `App.tsx` → `App copy.tsx`)
- **Delete** with cascading descendant removal (BFS traversal)
- **Hide/Unhide** nodes via H / Shift+H shortcuts
- **Resize** — folders in all directions, files horizontally only
- **Drag** nodes freely on the canvas
- **Drag-connect** nodes with validation (no self-parenting, single parent, no cycles, no duplicates)

### Keyboard-First Navigation

- **Arrow keys** — tree-style navigation (↑=parent, ↓=child, ←/→=siblings) with auto-centering
- **Ctrl+N** — new node dialog (child if folder selected, standalone otherwise)
- **Ctrl+Shift+N** — clear canvas
- **Ctrl+E** — open export panel
- **Ctrl+I** — show all shortcuts
- **Ctrl+F** — search with click-to-zoom
- **Ctrl+C/X/V** — copy/cut/paste (duplicate) nodes
- **Ctrl+Z / Ctrl+Shift+Z** — undo/redo with 50-step history
- **Ctrl+A** — select all
- **Ctrl+L** — cycle layout direction
- **F2** — rename · **Enter** — open file · **Delete** — remove · **Space** — fit view
- **+/-/0** — zoom controls

### Search

- **Fuzzy search** across all nodes (filenames, paths, extensions)
- **Click any result** to instantly zoom to that node on the canvas
- **Hidden nodes** appear in results with a badge — click to unhide & zoom
- **Highlight/dim** matched and unmatched nodes on the canvas

### Context Menus

- **Folder right-click**: Rename, Add Child Node, Copy Path, Refresh from Disk, Copy, Cut, Hide Node
- **File right-click**: Rename, Open File, Copy Name, Copy, Cut, Delete Item
- **Canvas right-click**: Fit View, Select All, Zoom In/Out, Unhide All

### Export System (7 formats)

- **SVG** — vector with theme background
- **PNG** — raster with adjustable quality and transparent background
- **JSON** — full graph state (re-importable via Import from File)
- **CSV** — tabular nodes + edges
- **DOT** — Graphviz format
- **Directory Script** — `mkdir -p` shell script (`.sh`) or batch script (`.bat`)
- **Directory Tree** — Unicode ASCII tree (├── └── │) for documentation
- **Export Selected** — toggle to export only the selected subtree

### Theming

- **Light / Dark / Custom** theme modes
- **15 CSS color variables** including separate folder and file colors
- **Live custom theme editor** with color pickers (hex input + native swatch)
- Changes apply instantly to all nodes on the canvas

### File System Integration

- **File System Access API** for real directory read/write
- **Import settings dialog** with depth limit, hidden files, vendored dirs, extension filter, and file/folder toggles
- **webkitdirectory fallback** for unsupported browsers
- **File operations module** — copy, move, delete, create, rename, open files on disk
- **FileSystemHandle storage** on each node for disk-level operations

### Additional Features

- **Interactive tutorial** — spotlight walkthrough that highlights UI elements and requires user interaction
- **Bug report dialog** — structured form with auto-collected diagnostics (graph state, browser info, environment)
- **Shortcuts dialog** (Ctrl+I) — all keyboard shortcuts organized by category
- **Error boundary** — catches render crashes with retry/reload UI
- **Device detection** — mobile/tablet/desktop with responsive sidebar overlay
- **Undo/Redo** — 50-step history with drag-aware commit (one undo step per drag, not per frame)
- **Stats panel** — file/folder counts, total size, by-category breakdown with progress bars

## Tech Stack

| Layer     | Technology                                     |
| --------- | ---------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack)             |
| UI        | React 19, Tailwind CSS 4, shadcn/ui (New York) |
| Graph     | React Flow v12 (@xyflow/react), Dagre          |
| State     | Zustand                                        |
| Language  | TypeScript 5 (strict)                          |
| Database  | Prisma ORM + SQLite                            |
| Icons     | Lucide React                                   |
| Fonts     | Geist Sans / Geist Mono                        |

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- A modern browser (Chrome/Edge recommended for File System Access API)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/fewer.git
cd fewer

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open `http://localhost:3000` in your browser.

### Quick Start

1. Click **Load sample project** in the welcome dialog
2. Use **arrow keys** to navigate the tree
3. **Right-click** any node for context menu actions
4. Press **Ctrl+I** to see all keyboard shortcuts
5. Click **Export** to save the graph in your preferred format

## Architecture

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout with ThemeProvider
│   ├── page.tsx              # Renders <FewerApp />
│   └── globals.css           # CSS variables + React Flow theming
├── components/fewer/
│   ├── FewerApp.tsx        # Main app shell, orchestrates all dialogs
│   ├── GraphCanvas.tsx       # React Flow canvas with minimap + controls
│   ├── CustomNode.tsx        # Folder/file cards with context menus
│   ├── Sidebar.tsx           # Collapsible sections (File, Layout, Appearance, Stats)
│   ├── Toolbar.tsx           # Top bar with primary actions
│   ├── SearchPanel.tsx       # Fuzzy search with click-to-zoom
│   ├── ExportPanel.tsx       # 7-format export with "selected only" toggle
│   ├── ImportDialog.tsx      # Directory import settings (depth, filters)
│   ├── ImportFromFileDialog.tsx  # JSON/ASCII tree/script import
│   ├── AddNodeDialog.tsx     # New node dialog with arrow key navigation
│   ├── BugReportDialog.tsx   # Structured bug report with diagnostics
│   ├── ShortcutsDialog.tsx   # All keyboard shortcuts reference
│   ├── TutorialDialog.tsx    # Interactive spotlight walkthrough
│   ├── BreadcrumbBar.tsx     # Path breadcrumb navigation
│   ├── CustomThemeEditor.tsx # 15 color pickers for custom theme
│   ├── ErrorBoundary.tsx     # Crash recovery with retry UI
│   └── KeyboardShortcuts.tsx # Global hotkey handler
├── lib/fewer/
│   ├── types.ts              # All TypeScript types + theme metadata
│   ├── layout.ts             # Dagre layout with type-aware dimensions
│   ├── treeToGraph.ts        # Tree → flat nodes/edges converter
│   ├── fileSystem.ts         # File System Access API + webkitdirectory
│   ├── fileOps.ts            # Copy/move/delete/create/open on disk
│   ├── importOptions.ts      # Import configuration interface
│   ├── parsers.ts            # JSON/ASCII tree/script parsers
│   ├── exportUtils.ts        # SVG/PNG/JSON/CSV/DOT exporters
│   ├── scriptExport.ts       # Shell/batch script + ASCII tree generators
│   ├── validation.ts         # Connection validation + ancestor/descendant utils
│   ├── navigation.ts         # Arrow key tree navigation
│   ├── categorize.ts         # Extension → category mapping
│   ├── errors.ts             # Type-safe error system (enums + interfaces)
│   └── stats.ts              # Stats computation + fuzzy match
├── store/graphStore.ts       # Zustand store (nodes, edges, history, theme, clipboard)
└── hooks/
    ├── use-device.ts         # Mobile/tablet/touch/reduced-motion detection
    ├── use-mobile.ts         # Mobile breakpoint hook
    └── use-toast.ts          # Toast notifications hook
```

## Browser Support

| Feature                            | Chrome/Edge | Firefox | Safari |
| ---------------------------------- | :---------: | :-----: | :----: |
| Graph visualization                |     ✅      |   ✅    |   ✅   |
| Import directory (FS Access API)   |     ✅      |   ❌    |   ❌   |
| Import directory (webkitdirectory) |     ✅      |   ✅    |   ✅   |
| Open files from disk               |     ✅      |   ❌    |   ❌   |
| Export (all formats)               |     ✅      |   ✅    |   ✅   |
| All keyboard shortcuts             |     ✅      |   ✅    |   ✅   |
| Custom theme                       |     ✅      |   ✅    |   ✅   |

## Roadmap

- [ ] **Tauri desktop app** — native file watching, system tray, global hotkeys, set as default file manager
- [ ] **Dual-pane view** — two graphs side by side with drag between panes
- [ ] **Command palette** (Cmd+K) — fuzzy search all actions
- [ ] **File preview** — image thumbnails, text quick-view, code syntax highlighting
- [ ] **Batch operations** — multi-select rename/delete/move with glob patterns
- [ ] **Disk usage visualization** — sunburst/treemap overlay
- [ ] **Plugin system** — user-defined commands and node types

## License

MIT — see [LICENSE](LICENSE) for details.

## Acknowledgments

- [React Flow](https://reactflow.dev/) — the excellent graph visualization library
- [Dagre](https://github.com/dagrejs/dagre) — directed graph layout algorithms
- [shadcn/ui](https://ui.shadcn.com/) — beautiful, accessible component library
- [Tailwind CSS](https://tailwindcss.com/) — utility-first CSS framework
- [Lucide](https://lucide.dev/) — clean, consistent icon set
- [Directory icons created by Freepik - Flaticon](https://www.flaticon.com/free-icons/directory)

---

_Transform your file system navigation into an art form with fewer._
