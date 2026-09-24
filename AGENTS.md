# Agent Instructions

This project uses **Next.js 16 + React Flow v12** for an interactive graph-based directory visualizer. Run `bun run dev` to get started.

## Task Tracking — read before any work

No work starts untracked. Full rule: `.clinerules/task-tracking.md`; verb
reference: `.agents/skills/tasks/SKILL.md` (`bun run task:status` first).

1. `bun run task:status` — resumes/closes an open session and lists untracked
   GitHub issues (adopt them: `python3 scripts/tasks.py intake`).
2. Find it (`bun run task:find "<words>"`) or create + triage it
   (`bun run task:add …` → `bun run task:triage <T-###> …`, status `triaged`
   before any branch or edit exists).
3. `bun run task:start <T-###>` opens the timed session. Saying **"track
   bug …"** runs the whole find-or-create-issue-and-start flow in one step.
4. Every commit carries a `Task: T-###` trailer (the installed hook stamps it
   and refuses commits while no session is open).
5. `bun run task:stop <T-###> --note "…"` closes the session; `bun run
   task:validate` must pass before push, and `task:report` totals go in the PR.

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
python3 scripts/decisions.py validate  # decisions.yaml structural integrity (CI runs this too)
```

**Component test isolation**: bun's `mock.module` registry is process-wide and persists across test files in one run. Component suites must not register a partial `mock.module` on a shared module (e.g. `@/lib/fewer/fileOps`) — that replaces the module for every later suite in the same process and breaks their imports. If an override is unavoidable, spread the real module first: `const actual = await import(…); mock.module(…, () => ({ …actual, override }))`. Always verify with `bun run test` (all files together), not a single file.

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
   (production included). Change the schema with a **new** migration. (One
   exception: a version collision that makes a file unrecordable — see
   *The one sanctioned rename* below.)
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

### The one sanctioned rename

Rule 1 has a single allowlisted exception, `SANCTIONED_RENAMES` in
`scripts/migrations.py`: `0022_profiles_username_normalization.sql` →
`0033_profiles_username_normalization.sql`.

Two files claimed version `0022`, and `schema_migrations` has
`PRIMARY KEY (version)`, so the second one could **never** be recorded: every
`supabase db push` refused it ("Found local migration files to be inserted before
the last migration on remote database") and `--include-all` failed on a duplicate
key. Giving it a free number is the only way to make it recordable, and it is
safe precisely because it never had a recorded version to miss — its effects were
verified present in dev and production before the move (the two
`profiles_username_*` check constraints and `profiles_username_unique_idx`), and
its content is byte-identical after it.

`verify` honours a rename only when the target exists **and** matches the source
at `--base` byte for byte; an edited file, or a deletion with no replacement,
still fails. Nothing else may be renamed.

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

### `db push` reconciliation: two failure modes, only one bypassable

`db push` walks the local files (sorted by version) against the remote
`schema_migrations` rows, comparing versions as **strings**, and can refuse in two
different ways:

| message | cause | `--include-all` |
| --- | --- | --- |
| `Found local migration files to be inserted before the last migration on remote database.` | a local file sorts *before* the remote head (the usual out-of-order case) | **bypasses it** — applies the out-of-order files |
| `Remote migration versions not found in local migrations directory.` | a remote row has no local file — e.g. legacy timestamp rows from out-of-band applies | **no** — thrown unconditionally |

Both implementations in CLI `2.117.0` agree: Go
(`apps/cli-go/pkg/migration/apply.go`) and its documented 1:1 port
(`apps/cli/src/command-internal/legacy-migration-pending.ts` +
`legacy-db-push-core.ts`). Only the `missing-remote` branch consults
`includeAll`; `missing-local` throws before it is read — so a timestamp-suffixed
remote head cannot be pushed through with a flag. The CLI's own suggestion is
the remedy: `supabase migration repair --status reverted <versions>`
(equivalently `delete from supabase_migrations.schema_migrations where
version = any(...)`).

Reverting is history-only — no DDL runs — and is safe when every reverted version
already has a numeric counterpart recorded, because no local file can ever match
that version, so nothing can be replayed. Production carried 14 such rows
(`20260817173320 = saved_themes` duplicating `0016`; `20260911223849 =
0024_billing` duplicating `0024`; …). Reverting them left 28 numeric rows 1:1 with
the files ≤ `0028`, which is what let `db push` append `0029`–`0033` instead of
failing on the timestamp head.

### Local commands

```bash
python3 scripts/migrations.py verify --base origin/dev         # PR checks
python3 scripts/migrations.py baseline --list <list-output>     # drift gate
bun run migrations:verify                                       # wrapper
```

## Issue Triage & Delivery

Working a GitHub issue (survey open issues → ask which one first → labels +
milestone → linked branch → fix → PR): follow
`.agents/workflows/issue-triage.md`. One issue = one branch = one PR, and one
ledger row per issue: `python3 scripts/tasks.py attach <N>` claims it and opens
the timed session (see the workflow's Steps 2/4/6).

## Landing the Plane (Session Completion)

**MANDATORY WORKFLOW:**

0. **Close the task first**: `bun run task:stop <T-###> --note "…"` records the
   session's time + effort (harvested from git) and `bun run task:validate`
   must pass — CI fails a PR whose commits lack a `Task: T-###` trailer or
   whose task is not in `review`/`done` with recorded time **at HEAD**. Commit
   the ledger close-out too (`git add TASKS.yaml && git commit …`): a commit
   staging only `TASKS.yaml` needs no open session and gets no trailer.
1. **Run quality gates**: `bun run lint && bun run build`
2. **Update CHANGELOG.md**: Add entry for meaningful changes (new features, fixes, breaking changes) to the Unreleased section via `python3 scripts/changelog.py add <group> "..."`. The changelog must be updated before committing.
3. **Update package.json**: Check and update the version number in `package.json` to always match the changelog (verify with `python3 scripts/changelog.py validate`).
4. **Commit changes**: Meaningful commit message (conventional commits)
5. **PUSH TO REMOTE**: This is MANDATORY
6. **Verify**: All changes committed AND pushed

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- Work is NOT tracked until `task:status` shows no open session
- NEVER push to release/prod
- NEVER stop before pushing
- NEVER say "ready to push when you are": YOU must push
