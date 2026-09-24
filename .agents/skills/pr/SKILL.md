---
name: pr
description: 'Raising a PR in fewer: task trailer + close-out, the template body, labels/milestone/assignee/project via pr-metadata, changelog and docs gates, stacked PRs. Triggers: "raise a PR", "open a PR", "PR checklist", "PR metadata", "label the PR", "add to project", "milestone the PR", "who owns this PR".'
---

# PR Procedure (fewer)

One PR per task, one task per PR. `.clinerules/pr-dev-checks.md` is the
checklist (its section 0 is this procedure's metadata half); this skill is the
how-to.

## 1. Before you push

```bash
python3 scripts/tasks.py stop <T-###> --note "…"     # closes the session, harvests proof/effort
git add TASKS.yaml && git commit -m "chore(tasks): close <T-###>"   # ledger-only, no session needed
bun run task:validate
python3 scripts/tasks.py validate-commits --base origin/<base>
```

Every commit must carry `Task: T-###` (the hook stamps it; ledger-only commits
are exempt). CI fails the PR if any commit lacks a trailer or if the task is
not `review`/`done` **at HEAD**.

## 2. The PR itself

- Branch from `origin/dev` (or stacked on your feature branch) —
  `gh issue develop <N> --base dev … --checkout` when it closes an issue.
- Body: `.github/PULL_REQUEST_TEMPLATE.md`, always. Title: Conventional
  (`feat|fix|refactor|perf|chore|docs:`), subject explains the change.
- Body must contain `Fixes #<N>` (closes on merge), the root cause with
  `path:line`, the exact commands you ran and their result, and the
  `Task: T-###` id.
- Paste `python3 scripts/tasks.py report` totals for non-trivial PRs.

## 3. Metadata — labels, milestone, assignee, project

```bash
python3 scripts/tasks.py pr-metadata <PR#> --dry-run   # show the plan first
python3 scripts/tasks.py pr-metadata <PR#>             # apply (idempotent)
```

`pr-metadata` resolves the PR's task rows from `Task: T-###` trailers (plus rows
already stamped `pr:`) and derives:

| field | rule |
| --- | --- |
| labels | row status label + type (`bug`/`enhancement`/`documentation`) + `category:<area>` + one `size:*`; stale `size:*`/`status:*` are replaced, everything else untouched |
| `size:*` | from `estimate_min`: **xs** ≤60m · **s** ≤240m · **m** ≤960m · **l** ≤2400m · **xl** >2400m (labels created on demand) |
| milestone | row `milestone` → its issue's milestone → the **earliest open release train** (`next_milestone()`) → else none |
| assignee | row `assignee` (default `qvesera`) |
| project | `--project <N>` (or `PROJECT_NUMBER`): `gh project item-add` + Status mirrored from the ledger status |

- **No tracked task → it derives nothing and guesses nothing.** Fix the missing
  `Task:` trailer instead (the `tasks` CI job fails such a PR anyway).
- The same `size:*` band is mirrored onto **issues** by `gh-sync`, and derived on
  adoption by `intake`, so board rows read the same everywhere.
- `--no-write` skips the ledger `pr:` stamp — that is what CI uses, because a CI
  checkout is throwaway.

### Project board — two paths

1. **No tokens:** board → **Workflows → Auto-add to project** → filter
   `is:issue` → `is:issue,is:pr`. Every new PR lands on the board automatically.
2. **Scripted (Status too):** run `gh auth refresh -s project` once, then set
   `PROJECT_NUMBER` in `scripts/tasks.py` (or pass `--project <N>`). CI needs a
   PAT with the `project` scope as the `PROJECTS_TOKEN` secret — see
   `.github/workflows/pr-metadata.yml`.

Until one of those is true the verb prints `project: skipped …` and exits 0 —
it never pretends an item was added.

## 4. Gates

Run `.clinerules/pr-dev-checks.md` end to end: quality gates, changelog,
README/docs, `TO-DO.md` for major features, PR template, tests, e2e, themes.

## 5. Stacked PRs

`ci.yml` / `e2e.yml` are scoped to `main`/`dev`/`release/prod` bases, so a PR
stacked on another feature branch runs **no build/test** until it retargets —
local gates are the interim signal, and GitHub retargets it to `dev` when its
base merges (re-check `gh pr checks` then).

`.github/workflows/pr-metadata.yml` deliberately has **no branch filter**, so
metadata is applied to stacked PRs too (verified: it labelled #198, whose base
was `chore/task-hierarchy`).

## 6. Verify

```bash
gh pr view <N> --json labels,milestone,assignees,state,baseRefName
python3 scripts/tasks.py doctor        # ledger ↔ GitHub still 1:1
gh pr checks <N>
```

## 7. Failure modes

| symptom | cause | fix |
| --- | --- | --- |
| `pr-metadata: … carries no tracked task` | commit lacks a `Task:` trailer | `task:start`, amend trailers |
| `project: skipped` | no board configured / no scope | path 1 above, or `gh auth refresh -s project` |
| `project: Status option … not on this board` | board's Status options differ | set `STATUS_TO_PROJECT` in `scripts/tasks.py` |
| CI job not running | PR base isn't `dev`/`main` | stacked PR — see §5 |
| labels drift later | row re-triaged after the PR opened | `pr-metadata <N>` again (idempotent) or `gh-sync` for issues |
