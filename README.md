# fewer

### Turn any directory into an interactive graph you can explore, edit, and export.

[![Website Status](https://api.netlify.com/api/v1/badges/c64e4649-a3d3-4eb4-a02a-f712a785ab70/deploy-status)](https://app.netlify.com/projects/fewer-directory/deploys)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![React Flow](https://img.shields.io/badge/React_Flow-12-blueviolet)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![License](https://img.shields.io/badge/License-AGPLv3-blue)

[Features](#features) • [Install](#install) • [Quick Start](#quick-start) • [How It Works](#how-it-works) • [Docs](/docs) • [Blog](/blog) • [FAQ](#faq)

---

> [!IMPORTANT]
> **Privacy & Trust**: fewer runs entirely in your browser. No telemetry, no data exfiltration, no config files modified outside the project. The only network call is an optional GitHub repo import. Everything else stays local. To disable instantly: close the tab. To uninstall: delete the repo.

---

## The Problem

You need to understand a directory structure: a new codebase, a project to document, a mess to reorganize. Standard tools don't help: `tree` is static, file managers show one folder at a time, `ls -R` is a wall of text. You scroll, search, switch contexts, and still miss the shape of it.

If you've used a file tree in VS Code or `tree` in the terminal, you know the fix. What's new is turning that tree into an interactive graph: drag, search, edit, rename, export in 7 formats, all in the browser, with nothing to install beyond a dev server.

---

## See It Work

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Open `http://localhost:3000`, click **Load sample project**, and explore the graph:

![fewer demo](public/demo.png)

Use arrow keys to navigate the tree. Right-click any node for actions. Press **Ctrl+I** for all shortcuts.

---

## Install

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

### Prerequisites

- Bun 1.3+ (or Node.js 18+)
- Chrome/Edge for full File System Access API support; Firefox/Safari via `webkitdirectory` fallback

### Alternative installs

<details>
<summary><b>Docker</b></summary>

```bash
docker build -t fewer .
docker run -p 3000:3000 fewer
```

</details>

---

## Quick Start

| Step  | Action                                                                      |
| ----- | --------------------------------------------------------------------------- |
| **1** | Click **Load sample project** in the welcome dialog                         |
| **2** | Use **arrow keys** (↑↓←→) to navigate the tree                              |
| **3** | **Right-click** any node for context menu                                   |
| **4** | Press **Ctrl+I** to see all keyboard shortcuts                              |
| **5** | Click **Export** to save the graph (SVG, PNG, JSON, CSV, DOT, script, tree) |

### Import a real directory

1. Click **Import from disk** (or **Alt+I**)
2. Select a folder: configurable depth, hidden files, extension filters
3. The graph builds instantly with auto-layout

> **Tip:** On an empty canvas you can also **drag a folder** from your file
> system straight onto the canvas — it imports immediately with your saved
> import settings (Chromium-based browsers).

### Edit the graph

- **Rename** a node: **F2** or right-click
- **Add** a node: **Alt+N**
- **Delete**: **Delete** key (cascading children)
- **Copy/Paste**: **Ctrl+C / Ctrl+V** (duplicates with "copy" suffix)
- **Undo/Redo**: **Ctrl+Z / Ctrl+Shift+Z** (50-step history)

---

## Features

<details>
<summary><b>Graph Visualization</b></summary>

- **React Flow v12** canvas with minimap + controls
- **Folder cards** (orange): children inline, scrollable, item counts, sizes
- **File cards** (purple): filename, extension, category icon, size
- **4 layout directions**: Top→Bottom, Left→Right, Bottom→Top, Right→Left
- **3 edge styles**: Curved, Angled (adjustable radius), Straight
- **Custom Reingold-Tilford layout** with type-aware dimensions and crown-shyness spacing (subtree gaps scale with depth + size)
- **Sibling sort**: order children by Name, Size, or Type (asc/desc); applies recursively
- **Breadcrumb bar**: selected node's full path

</details>

<details>
<summary><b>Keyboard Navigation</b></summary>

| Key                       | Action                                 |
| ------------------------- | -------------------------------------- |
| **↑↓←→**                  | Tree navigation (parent/child/sibling) |
| **Alt+N**                 | New node                               |
| **Ctrl+F**                | Search (fuzzy, click-to-zoom)          |
| **Ctrl+E**                | Export panel                           |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / Redo                            |
| **Ctrl+A**                | Select all                             |
| **Ctrl+L**                | Cycle layout direction                 |
| **Ctrl+I**                | Shortcuts reference                    |
| **F2**                    | Rename                                 |
| **Delete/Backspace**      | Remove (cascading)                     |
| **Space**                 | Fit view                               |
| **+ / - / 0**             | Zoom in/out/reset                      |

</details>

<details>
<summary><b>Search</b></summary>

- **Fuzzy search** across filenames, paths, extensions
- **Click result** → zoom to node
- **Hidden nodes** appear with badge: clicking shows the node **and its whole hidden ancestor chain** up to root, then zooms
- **Highlight/dim** matched/unmatched nodes
- **Recent searches** - committed terms persist for the browser session and appear when reopening search (clear from the panel)

</details>

<details>
<summary><b>Context Menus</b></summary>

| Target     | Actions                                                          |
| ---------- | ---------------------------------------------------------------- |
| **Folder** | Rename, Add Child, Copy Path, Refresh from Disk, Copy, Cut, Hide |
| **File**   | Rename, Open File, Copy Name, Copy, Cut, Delete                  |
| **Canvas** | Fit View, Select All, Zoom In/Out, Show All                      |
| **Multi-select** | Batch actions: Rename…, Copy, Cut, Duplicate, Move to Folder…, Unparent, Delete N Items |

</details>

<details>
<summary><b>Import</b></summary>

- **File System Access API** (Chrome/Edge): real directory read with depth, hidden file, and extension filters
- **Import from File**: JSON export, ASCII tree text, shell/batch `mkdir` scripts
- **Import from URL**: GitHub repo tree (public repos), any public Apache/nginx file index, or Internet Archive item (`archive.org/details/<id>`)
- **webkitdirectory** fallback (Firefox/Safari)
- **Brave browser** detection with flag workaround instructions

</details>

<details>
<summary><b>Theming</b></summary>

- **Light / Dark / Custom** modes
- **16 CSS color variables**: separate folder and file colors
- **Live custom theme editor** with hex input + native color swatch
- Changes apply instantly to all nodes

</details>

<details>
<summary><b>File System Integration</b></summary>

- **File operations**: copy, move, delete, create, rename, open files on disk
- **FileSystemHandle** stored on each node for disk-level ops
- **Import settings**: depth limit, hidden files, vendored dirs, extension filter, file/folder toggles

</details>

<details>
<summary><b>Accounts & Saved Graphs</b></summary>

- **Optional accounts**: email/password sign-in, Google/GitHub sign-in, or passwordless email links (magic link) via Supabase Auth. Account deletion runs with a 7-day grace window (sign in again to cancel). The app works fully logged-out
- **Save graphs**: save the current graph (nodes, layout, theme, settings) to your account
- **Your Directories**: load, rename, share, and delete saved graphs from the sidebar
- **Selective sharing**: share saved graphs as "anyone with the link" or invite-only
- **Short share links**: large graphs use a short server-backed `#s:<id>` link instead of a long URL hash

</details>

<details>
<summary><b>Cloud Storage</b></summary>

- **Link cloud accounts**: connect GitHub, Google Drive, OneDrive, SharePoint, Azure DevOps, and Azure Blob via OAuth
- **Browse & import**: lazily browse a linked account's folders and import one into the graph
- **Open in provider**: open any imported node in its provider's web UI

</details>

<details>
<summary><b>Watch File Indexes</b></summary>

- **Watch indexes**: watch a public file index and get a daily email digest when it changes
- **Consolidated digest**: one email at 23:59 listing everything added/removed across your watched indexes
- **No changes, no email**: digests are only sent on days something changed

</details>

<details>
<summary><b>Additional</b></summary>

- **Interactive tutorial**: spotlight walkthrough with user interaction
- **Bug report dialog**: structured form with auto-collected diagnostics
- **Error boundary**: crash recovery with retry/reload UI
- **Device detection**: mobile/tablet/desktop with responsive sidebar overlay
- **Stats panel**: file/folder counts, total size, by-category breakdown

</details>

---

## Export

| Format     | Description                                | Use Case                      |
| ---------- | ------------------------------------------ | ----------------------------- |
| **SVG**    | Vector with theme background               | Documentation, presentations  |
| **PNG**    | Raster, adjustable quality, transparent bg | Slides, social media          |
| **JSON**   | Full graph state                           | Re-import, programmatic use   |
| **CSV**    | Tabular nodes + edges                      | Spreadsheets, data analysis   |
| **DOT**    | Graphviz format                            | `dot` rendering pipeline      |
| **Script** | `mkdir -p` shell/batch script              | Reproduce directory structure |
| **Tree**   | Unicode ASCII tree (├── └── │)             | Code comments, READMEs        |

Toggle **Export Selected** to export only the selected subtree.

---

## Docs & Blog

- [Docs](/docs): feature guides, tutorials, and technical references
- [Blog](/blog): release notes, feature deep-dives, and behind-the-scenes stories

**Docs & Blog are headless.** Blog posts and doc pages live in a Supabase `content_pages` table and are rendered at request time with a 60-second revalidate, so publishing a post or fixing a doc typo goes live in under a minute — no code release needed.

To publish or edit:

1. Open Supabase Studio → **Table Editor** → `content_pages`
2. Insert a new row (or edit an existing one): `type` = `blog` or `docs`, `slug`, `title`, `description`, `content` (markdown body), plus `author`/`date`/`tags` for blog rows
3. Set `published = true` → live within ~60 seconds

Writes go through the service role (RLS is public-read-only for published rows). The markdown in `content/blog/` and `content/docs/` is kept in-repo as a source-of-record backup and seeded into `content_pages` by `supabase/migrations/0021_content_pages.sql`.

## How It Works

```
User action → KeyboardShortcuts / ContextMenu → graphStore (Zustand) → React Flow re-render
```

The **Zustand store** is the single source of truth. React Flow nodes/edges are derived from store state. **Undo/redo** wraps store actions with a 50-step history buffer.

<details>
<summary><b>Architecture</b></summary>

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout + ThemeProvider
│   ├── page.tsx              # Renders <FewerApp />
│   └── api/                  # API routes (GitHub tree, open folder)
├── components/fewer/
│   ├── FewerApp.tsx          # Main shell, orchestrates all dialogs
│   ├── GraphCanvas.tsx       # React Flow canvas + minimap + controls
│   ├── CustomNode.tsx        # Folder/file cards + context menus
│   ├── Sidebar.tsx           # Collapsible sections (File, Layout, Appearance, Stats)
│   ├── Toolbar.tsx           # Top bar with primary actions
│   ├── SearchPanel.tsx       # Fuzzy search with click-to-zoom
│   ├── ExportPanel.tsx       # 7-format export with "selected only" toggle
│   ├── ImportDialog.tsx      # Directory import settings
│   ├── ImportFromFileDialog.tsx  # JSON/ASCII tree/script import
│   ├── ImportUrlDialog.tsx   # GitHub repo import
│   ├── AddNodeDialog.tsx     # New node dialog
│   ├── ShareDialog.tsx       # Share graph as URL
│   ├── BugReportDialog.tsx   # Structured bug report with diagnostics
│   ├── ShortcutsDialog.tsx   # All keyboard shortcuts
│   ├── TutorialDialog.tsx    # Interactive spotlight walkthrough
│   ├── BreadcrumbBar.tsx     # Path breadcrumb navigation
│   ├── ThemeEditorDialog.tsx  # Draggable custom theme editor + presets
│   ├── ErrorBoundary.tsx     # Crash recovery
│   └── KeyboardShortcuts.tsx # Global hotkey handler
├── lib/fewer/
│   ├── types.ts              # TypeScript types + theme metadata
│   ├── layout.ts             # Custom tree layout with type-aware dimensions
│   ├── treeToGraph.ts        # Tree → flat nodes/edges
│   ├── fileSystem.ts         # File System Access API
│   ├── fileOps.ts            # Copy/move/delete/create/open on disk
│   ├── importOptions.ts      # Import configuration
│   ├── parsers.ts            # JSON/ASCII tree/script parsers
│   ├── exportUtils.ts        # SVG/PNG/JSON/CSV/DOT exporters
│   ├── scriptExport.ts       # Shell/batch + ASCII tree generators
│   ├── validation.ts         # Connection validation + ancestor/descendant utils
│   ├── navigation.ts         # Arrow key tree navigation
│   ├── categorize.ts         # Extension → category mapping
│   ├── share.ts              # URL sharing
│   ├── errors.ts             # Type-safe error system
│   └── stats.ts              # Stats computation + fuzzy match
├── store/graphStore.ts       # Zustand store (nodes, edges, history, theme, clipboard)
└── hooks/
    ├── use-device.ts         # Mobile/tablet/touch/reduced-motion detection
    ├── use-mobile.ts         # Mobile breakpoint hook
    ├── use-github-import.ts  # GitHub import hook
    └── use-toast.ts          # Toast notifications
```

</details>

---

## Tech Stack

| Layer     | Technology                                                      |
| --------- | --------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack)                              |
| UI        | React 19, Tailwind CSS 4, shadcn/ui (New York)                  |
| Graph     | React Flow v12 (@xyflow/react)                                  |
| State     | Zustand                                                         |
| Language  | TypeScript 5 (strict)                                           |
| Database  | Prisma ORM + SQLite; Supabase (auth, saved graphs, share links, headless blog/docs) |
| Icons     | Lucide React                                                    |
| Fonts     | Geist Sans / Geist Mono                                         |

---

## Browser Support

| Feature                            | Chrome/Edge | Firefox | Safari |
| ---------------------------------- | :---------: | :-----: | :----: |
| Graph visualization                |     ✅      |   ✅    |   ✅   |
| Import directory (FS Access API)   |     ✅      |   ❌    |   ❌   |
| Import directory (webkitdirectory) |     ✅      |   ✅    |   ✅   |
| Open files from disk               |     ✅      |   ❌    |   ❌   |
| Export (all formats)               |     ✅      |   ✅    |   ✅   |
| Keyboard shortcuts                 |     ✅      |   ✅    |   ✅   |
| Custom theme                       |     ✅      |   ✅    |   ✅   |

---

## FAQ

**Q: Does fewer send my directory data anywhere?**

A: No. Everything runs in your browser. The only network call is an optional GitHub import (public repos only). No telemetry, no analytics.

**Q: Can I use fewer without installing anything?**

A: Yes. The standalone version is available at [app.fewer.directory](https://app.fewer.directory). The self-hosted version requires `bun install && bun run dev`.

**Q: Why does directory import not work in Firefox/Safari?**

A: File System Access API is Chrome/Edge-only. Firefox and Safari use the `webkitdirectory` fallback, which works for import but can't write back to disk.

**Q: How do I uninstall?**

A: Delete the repo folder. That's it. No background processes, no config files, no registry entries.

**Q: Do I need an account?**

A: No. Fewer works fully without one. Signing in (optional) unlocks saving graphs to your account, accessing them across devices, and invite-only sharing. See [Plans](/docs/plans) for the Guest / Free / Pro / Team tier table.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full roadmap, covering short-term, medium-term, and long-term plans.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

AGPLv3. See [LICENSE](LICENSE) for details.

## Acknowledgments

- [React Flow](https://reactflow.dev/): graph visualization library
- [Reingold-Tilford](https://en.wikipedia.org/wiki/Tree_traversal): tree layout algorithm
- [shadcn/ui](https://ui.shadcn.com/): accessible component library
- [Tailwind CSS](https://tailwindcss.com/): utility-first CSS framework
- [Lucide](https://lucide.dev/): icon set

**This project stands with Palestine 🇵🇸**
