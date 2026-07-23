# Agent Instructions

This project uses **Next.js 16 + React Flow v12** for an interactive graph-based directory visualizer. Run `npm run dev` to get started.

## Quick Reference

```bash
npm install            # Install dependencies
npm run dev            # Start dev server on port 3000
npm run build          # Production build
npm run lint           # Run ESLint
```

## Project Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/store/graphStore.ts` | Zustand store — single source of truth for nodes, edges, history, theme, clipboard |
| `src/components/fewer/GraphCanvas.tsx` | React Flow canvas with minimap + controls |
| `src/components/fewer/CustomNode.tsx` | Folder/file card rendering with context menus |
| `src/components/fewer/FewerApp.tsx` | Main app shell orchestrating all dialogs |
| `src/lib/fewer/types.ts` | All TypeScript types + theme metadata |
| `src/lib/fewer/layout.ts` | Dagre layout with type-aware dimensions |
| `src/lib/fewer/exportUtils.ts` | SVG/PNG/JSON/CSV/DOT exporters |
| `src/lib/fewer/parsers.ts` | JSON/ASCII tree/script parsers |
| `src/lib/fewer/validation.ts` | Connection validation + ancestor/descendant utils |
| `src/lib/fewer/navigation.ts` | Arrow key tree navigation |

### State Flow

```
User Action → KeyboardShortcuts / ContextMenu → graphStore action → React Flow re-render
```

The Zustand store is the single source of truth. React Flow nodes/edges are derived from store state. Undo/redo wraps store actions with a 50-step history buffer.

### Component Tree

```
FewerApp
├── GlobalNavbar
├── Toolbar
├── Sidebar (collapsible sections: File, Layout, Appearance, Stats)
├── GraphCanvas
│   ├── CustomNode (folder/file cards)
│   └── BreadcrumbBar
├── SearchPanel
├── ExportPanel
├── ImportDialog / ImportFromFileDialog
├── AddNodeDialog
├── ShortcutsDialog / TutorialDialog / BugReportDialog
├── CustomThemeEditor
└── ErrorBoundary
```

## Common Operations

### Adding a new component
1. Create in `src/components/fewer/`
2. Export from `src/components/fewer/index.ts`
3. Wire into `FewerApp.tsx` if top-level

### Adding a new export format
1. Add exporter function in `src/lib/fewer/exportUtils.ts` or `scriptExport.ts`
2. Register in `ExportPanel.tsx`
3. Add file extension mapping

### Adding a keyboard shortcut
1. Define in `KeyboardShortcuts.tsx`
2. Add to `ShortcutsDialog.tsx`
3. Document in README

## Quality Gates

```bash
npm run lint           # Must pass before commit
npm run build          # Must succeed
```

## Landing the Plane (Session Completion)

**MANDATORY WORKFLOW:**

1. **Run quality gates** — `npm run lint && npm run build`
2. **Commit changes** — Meaningful commit message (conventional commits)
3. **PUSH TO REMOTE** — This is MANDATORY
4. **Verify** — All changes committed AND pushed

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing
- NEVER say "ready to push when you are" — YOU must push