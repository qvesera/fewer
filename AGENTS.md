# Agent Instructions

This project uses **Next.js 16 + React Flow v12** for an interactive graph-based directory visualizer. Run `bun run dev` to get started.

## Quick Reference

```bash
bun install            # Install dependencies
bun run dev            # Start dev server on port 3000
bun run build          # Production build
bun run lint           # Run ESLint
```

## Project Architecture

### Key Files

| File                                        | Purpose                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/store/graphStore.ts`                   | Zustand store: single source of truth for nodes, edges, history, theme, clipboard |
| `src/components/fewer/GraphCanvas.tsx`      | React Flow canvas with minimap + controls                                         |
| `src/components/fewer/CustomNode.tsx`       | Folder/file card rendering with context menus                                     |
| `src/components/fewer/FewerApp.tsx`         | Main app shell orchestrating all dialogs                                          |
| `src/lib/fewer/types.ts`                    | All TypeScript types + theme metadata                                             |
| `src/lib/fewer/layout.ts`                   | Custom tree layout with type-aware dimensions                                     |
| `src/lib/fewer/exportUtils.ts`              | SVG/PNG/JSON/CSV/DOT exporters                                                    |
| `src/lib/fewer/parsers.ts`                  | JSON/ASCII tree/script parsers                                                    |
| `src/lib/fewer/validation.ts`               | Connection validation + ancestor/descendant utils                                 |
| `src/lib/fewer/navigation.ts`               | Arrow key tree navigation                                                         |
| `src/lib/fewer/autoIndex.ts`                | Apache/nginx auto-index HTML parser + tree builder                                |
| `src/lib/fewer/archive.ts`                  | Internet Archive item import (metadata API → tree)                                |
| `src/lib/fewer/savedGraphs.ts`              | Saved-graph types + DB share URL helpers                                          |
| `src/lib/fewer/snapshot.ts`                 | Graph snapshot build/apply for saved graphs                                       |
| `src/lib/supabase.ts`                       | Supabase client (server + browser)                                                |
| `src/hooks/use-auth.ts`                     | Auth state hook                                                                   |
| `src/components/fewer/AuthDialog.tsx`       | Sign in / sign up / password reset dialog                                         |
| `src/components/fewer/SavedGraphsPanel.tsx` | Save/load/rename/share/delete saved graphs                                        |
| `src/app/api/crawl/route.ts`                | Crawl public file index URLs                                                      |
| `src/app/api/graphs/route.ts`               | Saved-graph CRUD (GET/POST)                                                       |
| `src/app/api/share/route.ts`                | Create share links (hash or DB-backed)                                            |

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
├── ThemeEditorDialog
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
bun run lint           # Must pass before commit
bun run build          # Must succeed
python3 scripts/changelog.py validate   # Must exit 0 before committing changelog changes
python3 scripts/migrations.py verify --base origin/dev   # migration rules (CI runs this too)
```

## Changelog

`CHANGELOG.md` is Keep a Changelog + SemVer. The `## [Unreleased]` section at the top is the live accumulation point — add every user-facing change there the moment it lands (module: the `changelog` workspace skill).

```bash
python3 scripts/changelog.py add <added|changed|fixed|performance|security|pwa> "<entry text>"
python3 scripts/changelog.py current        # Unreleased version + per-group counts
python3 scripts/changelog.py backfill       # commits not yet reflected in changelog
python3 scripts/changelog.py release 0.7.0  # finalize Unreleased + open a fresh section
python3 scripts/changelog.py validate       # gate: format + package.json sync
```

Map Conventional Commits → group: `feat`→Added, `fix`→Fixed, `perf`→Performance, `refactor`/`style`/`docs` (user-visible)→Changed, `security`→Security, `pwa`→PWA. Skip `chore`/`build`/`ci`/`test` with no user impact. Full rules live in `.agents/skills/changelog/SKILL.md`.

## Database Migrations

Migrations live in `supabase/migrations/` and are applied with the Supabase CLI
(`supabase link` + `supabase db push`).

### Hard rules

1. **An applied migration is immutable. Never edit or delete one.** The runner
   records versions in `supabase_migrations.schema_migrations` and never
   re-executes them, so edits silently miss every existing environment
   (production included). Change the schema with a **new** migration.
2. **Every migration must be idempotent** — safe to run twice on a database
   that already has the change: `if not exists`, `on conflict do nothing`,
   `create or replace`, `drop … if exists`, guarded `do $$ … $$` blocks.
3. **Number new files above the current maximum**, `NNNN_lower_snake_case.sql`
   (e.g. `0028_add_thing.sql`). `db push` only applies versions above the
   newest known one, so a lower number is silently skipped. Never reuse a
   number.
4. **Never grant table-level INSERT/UPDATE on `profiles`.** RLS gates rows, not
   columns, and users may update their own row — so table-level UPDATE lets a
   signed-in user set their own `plan`. `0022` + `0026` establish the
   column-level model: insert/update only the columns the account form owns,
   keep `plan` / `stripe_customer_id` service-role-only.

> Why this is spelled out: v0.7.0 edited the already-applied `0019_profiles.sql`
> and `0021_content_pages.sql`. The grants reached production only out-of-band,
> silently re-opening a plan self-upgrade hole, and the docs copy never
> re-seeded. Both needed follow-up migrations (`0026`, `0027`) to repair.

### Adding a migration

```bash
supabase migration new add_thing        # creates supabase/migrations/<ts>_add_thing.sql
python3 scripts/migrations.py verify --base origin/dev   # same checks CI runs
```

### Pipeline

`.github/workflows/migrations.yml`:

| Trigger | Job | What it does |
| --- | --- | --- |
| any PR to `main`/`dev`/`release/prod` | `verify` | static + git checks (see below) |
| push to `dev` | `apply-dev` | baseline check → dry-run → `db push` to `fewer-dev` |
| push to `main` | `apply-prod` | baseline check → dry-run → `db push` to production |
| manual dispatch | `repair-dev` / `repair-prod` | record versions as applied (history only) |

`verify` fails when a PR modifies/deletes an existing migration, adds an
out-of-order or duplicate number, or adds an empty file. A difference from the
PR base that **matches `main`** is reported as a warning instead: that means the
base branch is simply behind (e.g. `release/prod` between releases), not that
this change edited an applied migration. `apply-*` re-checks the
baseline against the project's recorded history and refuses to push when a local
migration is missing from history but was not added by the change — that means
drift and `db push` would replay old migrations.

Setup (Settings → Secrets and variables → Actions):

- secrets: `SUPABASE_DB_PASSWORD_DEV`, `SUPABASE_DB_PASSWORD_PROD`
- vars: `SUPABASE_PROJECT_REF_DEV` / `SUPABASE_PROJECT_REF_PROD`, and
  `SUPABASE_POOLER_HOST_DEV` / `SUPABASE_POOLER_HOST_PROD`
  (all have working defaults baked into the workflow, so only set them if a
  project moves)

The jobs connect with `--db-url` through the **session pooler**, so they need
only the database password — no Management API token. `supabase link` was
replaced because it needs Management API capabilities that scoped personal
access tokens (alpha) do not expose; it failed with "your account does not have
the necessary privileges" on the dev project. Pooler hosts are pinned per project
(`fewer-dev`: `aws-0-ap-south-1`, `fewer`: `aws-1-eu-west-1`) — the mixed `aws-0`
/ `aws-1` prefixes are why they are explicit rather than derived.

Add `verify` to the required status checks of the `dev` and `main` rulesets. The
apply/repair jobs use the existing **`dev`** and **`prod`** environments — `prod`
already has a required-reviewers rule, so applies to production wait for
approval.

### Baseline drift and repair

Project history can drift from the repo when migrations were applied under
timestamps (or renamed) — the CLI then reads local versions as "pending" and
would replay them. To fix:

```bash
supabase link --project-ref <ref>
supabase migration list --linked                      # local vs remote
supabase migration repair --status applied 0016 0017  # history only, no DDL
```

Or run the `Migrations` workflow manually with the `project` and
`repair_versions` inputs. Repair rewrites only `schema_migrations`.

> **Repair asserts a migration is applied — it does not run it.** Before marking
> a version applied, confirm its change really exists in that database (check the
> column/table/index). If it is genuinely missing, apply it **first** and only
> then record the version — repairing a missing migration skips it forever.
> `0024_billing` was exactly this on production: the history drift made it look
> pending, but `profiles.stripe_customer_id` genuinely did not exist, so the
> column had to be added before its version was recorded.

### Local commands

```bash
python3 scripts/migrations.py verify --base origin/dev         # PR checks
python3 scripts/migrations.py baseline --list <list-output>     # drift gate
bun run migrations:verify                                       # wrapper
```

## Landing the Plane (Session Completion)

**MANDATORY WORKFLOW:**

1. **Run quality gates**: `bun run lint && bun run build`
2. **Update CHANGELOG.md**: Add entry for meaningful changes (new features, fixes, breaking changes) to the Unreleased section via `python3 scripts/changelog.py add <group> "..."`. The changelog must be updated before committing.
3. **Update package.json**: Check and update the version number in `package.json` to always match the changelog (verify with `python3 scripts/changelog.py validate`).
4. **Commit changes**: Meaningful commit message (conventional commits)
5. **PUSH TO REMOTE**: This is MANDATORY
6. **Verify**: All changes committed AND pushed

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER push to release/prod
- NEVER stop before pushing
- NEVER say "ready to push when you are": YOU must push
