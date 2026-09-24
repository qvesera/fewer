# PR-to-dev Checklist (MANDATORY)

Applies whenever raising a PR targeting `dev`. Do not open the PR until every applicable item passes.

## 0. PR metadata — labels, milestone, assignee, project (MANDATORY)

A PR is never raised bare. Before requesting review:

```bash
python3 scripts/tasks.py pr-metadata <PR#> --dry-run   # show the derived plan
python3 scripts/tasks.py pr-metadata <PR#>             # apply (idempotent)
```

It resolves the task from the `Task: T-###` trailers and sets:

- **labels** — row status + type (`bug`/`enhancement`/`documentation`) +
  `category:<area>` + one `size:*` (xs ≤60m · s ≤240m · m ≤960m · l ≤2400m ·
  xl >2400m), replacing stale `size:*`/`status:*` only;
- **milestone** — the task's → its issue's → the earliest open release train;
- **assignee** — the task's `assignee` (default `qvesera`);
- **project** — `--project <N>` adds the item and mirrors Status; without the
  `read:project` scope it prints `project: skipped …` (the board's Auto-add
  workflow can cover PRs instead — both paths are in `.agents/skills/pr/SKILL.md`).

No tracked task → it derives nothing (and the `tasks` CI job fails the PR for
the missing trailer anyway). CI re-applies it on every PR event via
`.github/workflows/pr-metadata.yml`. Full procedure: `.agents/skills/pr/SKILL.md`.

## 1. Quality gates — run all, must pass

```bash
bun run lint            # ESLint
bunx tsc --noEmit       # TypeScript
bun run build           # Next.js production build
bun run test            # bun test src/lib/fewer
```

CI (`.github/workflows/ci.yml`) enforces these on PRs to `dev` — catch failures locally first.

## 2. Changelog updated

- Every user-facing change gets an entry in `## [Unreleased]`:
  `python3 scripts/changelog.py add <added|changed|fixed|performance|security|pwa> "..."`
- `python3 scripts/changelog.py validate` must exit 0.
- `package.json` version stays in sync with changelog.

## 3. README updated

If the PR changes user-visible behavior (new feature, new shortcut, changed UI, new export/import format, config), update `README.md` accordingly. Skip only for pure internals.

## 4. Docs created/updated

- Feature docs live in `content/docs/*.md` — update the matching page (e.g. new shortcut → `content/docs/shortcuts.md`, new export format → `content/docs/import-export.md`).
- New feature with no matching doc page → create one in `content/docs/`.
- Added keyboard shortcut → also `src/components/fewer/ShortcutsDialog.tsx` must list it.

## 5. Major features → TO-DO.md

If the PR is a major feature (new subsystem, headline capability, notable release), append a one-line entry to `TO-DO.md` (blog-post backlog) with the PR/feature name.

## Project-specific checks

- **PR template**: ALWAYS use `.github/PULL_REQUEST_TEMPLATE.md`.
- **Conventional commits**: `feat|fix|perf|refactor|...` — commit type maps to changelog group.
- **Supabase**: if `supabase/migrations/` changed, migration must be idempotent/safe and the PR description notes it.
- **Env**: if new env vars added, update `.env.example` and run `bun run env:check`.
- **Tests**: new logic in `src/lib/fewer/` → add/extend a bun test.
- **Test isolation**: component suites must not register `mock.module` on a shared module — bun's registry is process-wide and leaks across files. If an override is unavoidable, spread the real module (`{ ...await import(…), override }`) so other files' bindings survive, and verify with `bun run test` (all files together), never a single file.
- **E2E**: UI flow changes → check `e2e/app.spec.ts` still covers/reflects behavior (`bunx playwright test` if feasible).
- **Accessibility/theme**: new UI must work in light + dark theme and be keyboard-reachable.
- **Netlify/standalone build**: `bun run build` copies `static` + `public` into `.next/standalone` — verify build script still completes.
