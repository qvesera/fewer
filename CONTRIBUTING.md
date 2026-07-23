# Contributing to fewer

Thank you for your interest in contributing to fewer! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- A modern browser (Chrome/Edge recommended for File System Access API)

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/yourusername/fewer.git
cd fewer

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open `http://localhost:3000` in your browser.

## Development Workflow

### Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/
│   ├── fewer/        # fewer-specific components
│   └── ui/           # shadcn/ui components
├── lib/fewer/        # Core logic (types, layout, export, etc.)
├── store/            # Zustand state management
└── hooks/            # Custom React hooks
```

### Architecture Overview

fewer uses a **Zustand store** (`src/store/graphStore.ts`) as the single source of truth for graph state. React Flow renders nodes/edges from this store. The store also manages undo/redo history (50 steps), theme state, clipboard, and UI flags.

All graph logic is in `src/lib/fewer/` — layout via Dagre, export/import parsers, file system operations, validation, navigation.

### Coding Standards

- **TypeScript strict mode** — no `any`, no implicit `undefined`
- **ESLint** — run `npm run lint` before committing
- **Functional components** with hooks, no class components
- **Zustand** for global state, React state for local UI
- **CSS**: Tailwind CSS 4 utility classes + shadcn/ui component patterns

### Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add node resize handles
fix: prevent crash on empty directory import
docs: update keyboard shortcuts list
refactor: extract layout logic from GraphCanvas
```

### Testing

```bash
# Run tests (when available)
npm test
```

Manual testing checklist:
- [ ] Graph renders with sample data
- [ ] Import from directory works
- [ ] Export all 7 formats produce valid output
- [ ] Keyboard shortcuts function correctly
- [ ] Theme switching (light/dark/custom) applies properly
- [ ] Undo/redo history operates correctly

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Write clear commit messages** following conventional commits
3. **Update documentation** if adding or changing features
4. **Ensure lint passes** — `npm run lint`
5. **Open a pull request** with a clear title and description

### PR Title Format

```
type(scope): brief description
```

Examples:
- `feat(canvas): add minimap zoom constraints`
- `fix(export): correct CSV encoding for special characters`
- `docs(readme): add browser support table`

### PR Description Template

Include:
- What the change does
- Why it's needed
- Screenshots (for UI changes)
- Testing instructions
- Related issues (if any)

## Adding New Features

### New Components

1. Create the component in `src/components/fewer/`
2. Export from `src/components/fewer/index.ts`
3. Add to `FewerApp.tsx` if it's a top-level UI element

### New Export Formats

1. Add exporter function in `src/lib/fewer/exportUtils.ts` or `src/lib/fewer/scriptExport.ts`
2. Register the format in the export panel (`ExportPanel.tsx`)
3. Add file extension mapping

### New Keyboard Shortcuts

1. Define the shortcut in `KeyboardShortcuts.tsx`
2. Add to the shortcuts dialog (`ShortcutsDialog.tsx`)
3. Document in README

## Questions?

Open a [GitHub Discussion](https://github.com/qvesera/fewer/discussions) or file an issue.