---
name: pr
description: 'Raising a PR in fewer: task trailer + close-out, the template body, labels/milestone/assignee/project/issue-link via pr-metadata, changelog and docs gates, stacked PRs. Triggers: "raise a PR", "open a PR", "PR checklist", "PR metadata", "label the PR", "add to project", "milestone the PR", "link the issue to the PR", "who owns this PR".'
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
- Body must contain `Fixes #<N>` **alone on its line** (see §3.1), the root cause with
  `path:line`, the exact commands you ran and their result, and the
  `Task: T-###` id.
- Paste `python3 scripts/tasks.py report` totals for non-trivial PRs.

## 3. Metadata — labels, milestone, assignee, project, issue link

```bash
python3 scripts/tasks.py pr-metadata <PR#> --dry-run   # show the plan first
python3 scripts/tasks.py pr-metadata <PR#>             # apply (idempotent)
python3 scripts/tasks.py pr-metadata <PR#> --require-link   # also fail if unlinked (CI uses this)
```

`pr-metadata` resolves the PR's task rows from `Task: T-###` trailers (plus rows
already stamped `pr:`) and derives:

| field | rule |
| --- | --- |
| labels | row status label + type (`bug`/`enhancement`/`documentation`) + `category:<area>` + one `size:*`; stale `size:*`/`status:*` are replaced, everything else untouched |
| `size:*` | from `estimate_min`: **xs** ≤60m · **s** ≤240m · **m** ≤960m · **l** ≤2400m · **xl** >2400m (labels created on demand) |
| milestone | row `milestone` → its issue's milestone → the **earliest open release train** (`next_milestone()`) → else none |
| assignee | row `assignee` (default `qvesera`) |
| project | board `#1 · fewer - file viz` (owner `qvesera`, `PROJECT_NUMBER = 1`): adds the item, mirrors **Status** from the ledger (`triaged→Ready`, `review→In review`, `blocked/parked→Backlog`, `done→Done`, … the board's own option names live in `STATUS_TO_PROJECT`) and **Size** from the same band (`size:m → M`) |
| issue link | every task row's `issue` is linked to the PR (GitHub's Development sidebar): a bare `Fixes #<N>` line is written into the body if one is missing |

### 3.1 The issue ↔ PR link (automated, with a merge gate)

`pr-metadata` links the PR to the issue of every task row, then judges the result:

- **Why the body, not an API:** GitHub has no public REST/GraphQL endpoint for the
  sidebar's "Linked issue" relation (`cli/cli#11405` is blocked on it). The link has
  to come from a closing keyword in the PR body.
- **The keyword must be ALONE on its line.** `Fixes #257` links; `Closes #186
  (parent umbrella)` is only a mention. This repo's history shows the cost — #248
  linked #244/#245/#246 and skipped #186 for exactly that reason, so pr-metadata
  writes a bare `Fixes #<issue>` line for every task row that lacks one.
- **The default branch is the hard limit.** GitHub turns that keyword into a real
  Development link only when the PR targets the repository's default branch
  (`main`). Our PRs target `dev`, so there it is a cross-reference
  (`willCloseTarget: false`) and the sidebar link is **one human click** — verified
  live on #258. Nothing can automate that step.
- **The gate is therefore layered** (`link_gate`), because a gate that can never go
  green blocks every merge:

  | state | `dev`-based PR | default-branch PR |
  | --- | --- | --- |
  | no bare `Fixes #N` line | **fail** (the automation's own job) | **fail** |
  | line present, not in `closingIssuesReferences` | passes, prints a `link: NOTE` telling you where to click | **fail** (the automation must succeed there) |
  | in `closingIssuesReferences` | pass | pass |

- **Enforcement:** the `Link issue + metadata` job in
  `.github/workflows/pr-metadata.yml` runs with `--require-link` and is a **required
  check on the `dev` and `main` rulesets**. A PR cannot merge without its task's
  issue referenced; on `dev` the one remaining click is reported, not blocked.
- Verify on your own PR: `gh pr view <N> --json closingIssuesReferences`.

- **No tracked task → it derives nothing and guesses nothing.** Fix the missing
  `Task:` trailer instead (the `tasks` CI job fails such a PR anyway).
- The same `size:*` band is mirrored onto **issues** by `gh-sync`, and derived on
  adoption by `intake`, so board rows read the same everywhere.
- `--no-write` skips the ledger `pr:` stamp — that is what CI uses, because a CI
  checkout is throwaway.

### Project board — configured

- The scope is granted (`gh auth refresh -s project`) and `PROJECT_NUMBER = 1`
  is set, so plain `pr-metadata <N>` projects the PR's task rows onto their
  **issue** items (`sync-details --pr <N>`), writing only fields that differ.
  It deliberately does **not** add an item for the PR: one work unit, one item,
  one writer — a PR item got its own Status from CI and nothing ever closed it,
  so a merged PR sat at "In review" beside a "Done" issue.
- **CI Status sync** still needs a PAT: add a `PROJECTS_TOKEN` secret (scope
  `project`) and uncomment the step in `.github/workflows/pr-metadata.yml` —
  `GITHUB_TOKEN` cannot reach Projects v2.
- **Zero-token alternative** (a second safety net): the board's built-in
  **Auto-add to project** workflow filter can be widened from `is:issue` to
  `state:open` so PRs land on the board without the script.
- If a board ever has different option names, `pr-metadata` prints
  `Status option '…' not on this board (have: …)` — update `STATUS_TO_PROJECT`
  to match (never rename board options from the script).

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
| `pr-metadata: PR #N does not reference #M` | the body has no bare `Fixes #M` line (a closing keyword with prose on the same line is just a mention), and the automated write failed | re-run `pr-metadata <PR#>`; the gate fails on this, so it cannot merge |
| `pr-metadata: PR #N targets the default branch but #M never linked` | on `main` GitHub links the keyword automatically, so a miss is a real defect | re-run `pr-metadata <PR#> --require-link` and check the body |
| `link: NOTE #M is cross-referenced but not in the PR's Development sidebar` | expected on `dev`/`release/*`: GitHub only auto-links keywords on default-branch PRs, and the sidebar link has no API | one click: PR → right sidebar → Development → link #M |
| an old PR shows no link even with the keyword | keyword shared a line with prose (`Closes #251 (child of…)`) | `pr-metadata <PR#>` appends a bare `Fixes #N` line |
| `project: skipped` | no board configured / no scope | path 1 above, or `gh auth refresh -s project` |
| `project: Status option … not on this board` | board's Status options differ | set `STATUS_TO_PROJECT` in `scripts/tasks.py` |
| CI job not running | PR base isn't `dev`/`main` | stacked PR — see §5 |
| labels drift later | row re-triaged after the PR opened | `pr-metadata <N>` again (idempotent) or `gh-sync` for issues |
