---
name: tasks
description: 'Task tracking for fewer: TASKS.yaml ledger, timed sessions, status machine, GitHub issue dedupe. Triggers: "track", "track bug", "track this", "start task", "stop task", "time spent", "how long did", "triaged", "which tasks are open", "task report". Drive it with python3 scripts/tasks.py (status, find, add, triage, start, stop, record-session, set-status, note, track, attach, intake, import-todo, gh-sync, reconcile, doctor, report, validate, validate-commits, fmt, install-hooks, selftest) or the bun run task:* wrappers.'
---

# Task Tracking (fewer)

`TASKS.yaml` is the single source of truth for what is being worked on, in which
state, and how much time and effort it took. It is a *union*: rows created by
`track`/`add` here **and** issues raised directly on GitHub (`intake`). The file
is owned by `scripts/tasks.py` — never edit it by hand.

## Golden rules

1. **No untracked work.** Every unit of work needs a row *before* the first
   edit, and exactly one open session while it is in progress (WIP limit 1).
2. **Time is measured, not claimed.** Sessions come from `start`/`stop`; `stop`
   harvests commits/files/LOC from git as effort proof. Back-fills use
   `record-session --reconstructed`, visibly marked (`measured: false`,
   `time_source: reconstructed`) so measured and inferred time never blend.
3. **One issue per row, one row per issue.** `validate` hard-fails on duplicates,
   `doctor` proves 1:1 coverage against GitHub.
4. **Dedupe before creating.** `track` scores the ledger + all GitHub issues;
   ambiguity means asking, never a guess. `--dry-run` shows the decision first.
5. **Structural integrity over prose.** `validate` (and CI) enforce canonical
   form, status legality, session arithmetic, blockers and WIP.

## Status machine

```
backlog → triaged → in-progress → review → done
     ↑↓ blocked / parked / wontfix (anywhere legal)
```

| status | means | advanced by |
| --- | --- | --- |
| `triaged` | classified, estimated, **milestoned** — nothing started. `ready` is the gate; `validate` fails if it is not startable | `triage`, `track`, `intake` |
| `in-progress` | a session is open (validate ⇔ exactly one open) | `start` |
| `review` | PR open / waiting on merge | `stop` / `attach-pr` (both attach the PR to the row) |
| `done` | merged/closed, with proof or explicit `time_source: none\|reconstructed` | `set-status`, `reconcile --apply` |
| `blocked` / `parked` / `wontfix` | deliberately not moving | `set-status` |
| `backlog` | filed, not yet groomed | `triage`; `ready --demote` sends milestone-less rows here |

## Definition of ready (one function, three gates)

`readiness_issues()` is the single source; `start` refuses on it, `ready` prints
it, `validate` fails on it. A row is startable when it is:

- `triaged` (not `backlog` / `blocked` / `parked`)
- estimated (`estimate_min > 0`)
- classified (`area` set — it becomes the `category:*` label)
- linked to an issue, or `internal: true`
- unblocked — every `blocked_by` entry is `done` / `wontfix`
- **milestoned** — the linked issue carries a milestone, because that is where
  the release train actually lives (`pr-metadata` derives it from the issue)

`--force` on `start` overrides. `ready --demote` moves a triaged row back to
`backlog` when a missing milestone is its *only* problem — triage picks the
train — and reports (never moves) any row with other gaps.

`status:*` labels mirror state on GitHub (`gh-sync`); GitHub open/closed and PR
merges are authoritative for `done` (`reconcile`).

## Verb reference

| intent | command |
| --- | --- |
| Where am I? open session, totals, untracked issues, readiness | `bun run task:status` |
| What can I start? (the start gate) | `python3 scripts/tasks.py ready [--strict] [--demote] [--no-milestone]` |
| Search rows | `python3 scripts/tasks.py find "symlink walk"` |
| Find-or-create issue + row, start timing | `python3 scripts/tasks.py track bug "…" [--area --severity --issue --id --new --dry-run --no-start --local --body]` |
| Attach to `#180` / `T-006` and start | `python3 scripts/tasks.py attach 180` |
| Adopt issues raised directly on GitHub | `python3 scripts/tasks.py intake [--state all] [--dry-run] [--auto]` |
| Bulk-import TO-DO.md (all `triaged`) | `python3 scripts/tasks.py import-todo [--dry-run]` |
| Attach a PR to a row (opens it later / verify-only session) | `python3 scripts/tasks.py attach-pr <T-###> <PR#>` |
| Ledger → GitHub (create missing issues, mirror labels) | `python3 scripts/tasks.py gh-sync [--dry-run] [--status-only]` |
| GitHub state → status | `python3 scripts/tasks.py reconcile [--apply]` |
| Ledger ↔ GitHub drift proof | `python3 scripts/tasks.py doctor [--json]` |
| Time / estimate rollup | `python3 scripts/tasks.py report [--since 2026-09-01] [--json]` |
| Structural gate | `python3 scripts/tasks.py validate` |
| Commit gate | `python3 scripts/tasks.py validate-commits --base origin/dev` |
| Back-fill a session with real timestamps | `python3 scripts/tasks.py record-session <id> --start … --end … --reconstructed --proof <sha>` |
| Reinstall the commit hook | `python3 scripts/tasks.py install-hooks` |
| Engine self-check | `python3 scripts/tasks.py selftest` |
| PR labels + milestone + assignee + project | `python3 scripts/tasks.py pr-metadata <PR#> [--dry-run] [--no-write] [--project N] [--milestone X]` (procedure: `.agents/skills/pr/SKILL.md`) |
| Direct children + rollup | `python3 scripts/tasks.py children <T-id>` |
| Indented hierarchy (own vs rollup time) | `python3 scripts/tasks.py tree [--root T-id] [--json]` (= `report --tree`) |
| Move a task under another / make it a root | `python3 scripts/tasks.py reparent <T-id> --parent T-… | --detach` |
| Create a task under a parent | `bun run task:add --title … --parent T-…` / `bun run task:triage <id> --parent …` |
| File a sub-issue under a parent | `python3 scripts/tasks.py track bug "…" --parent T-… [--dry-run]` |
| Repair/drop GitHub sub-issue links | `python3 scripts/tasks.py gh-sync [--relink]` |

## `track` decision bands

| score vs best candidate | action |
| --- | --- |
| ≥ 0.75 | attach (closed match = **recurrence**, never a new issue) |
| 0.45 – 0.75, or two within 0.1 | **stop, list candidates, ask the user** (exit 3) |
| < 0.45 (or `--new`) | create issue + row, then start the session |

Scoring: normalized-token Jaccard on titles, exact-normalized match = 1.0,
open issues rank above closed. Sources searched: `TASKS.yaml` first (offline,
no API call), then `gh issue list --state all --limit 200`. Creation applies
`bug`/`enhancement`/`documentation` + `status:triaged` + `category:`/`severity:`
when given, and always prints the `DECISION` line with the winning candidate.

## Hierarchy: `parent` (sub-issues / subtasks)

`parent: T-###` marks a task as the child of another; `validate` keeps the graph
acyclic and `gh-sync` mirrors the link as a native GitHub sub-issue
(`gh issue edit <child> --parent <parent>`). Distinct from `blocked_by`
(dependency), which is a separate DAG.

| rule | enforcement |
| --- | --- |
| decompose at **pickup**: estimate ≥ 2400 min (Tier 1+) or several independent deliverables → 2–6 subtasks, own estimates, real linked issues; **ask before creating more than three** | the rule/skill; no automatic splitting |
| a parent never holds the session — `start` on it is refused ("decomposed umbrella") | `start` |
| parent `done` requires every child `done`/`wontfix` | `validate` FAIL |
| child of an issue-backed parent must have an issue (`internal: false`) | `validate` FAIL |
| self-parent / unknown parent / parent cycle | `validate` FAIL |
| depth > 3, parent `estimate_min` < Σ children, parent `wontfix` with live children | `validate` WARN |
| ledger parent ↔ GitHub parent agree, both directions | `doctor` + `gh-sync [--relink]` |
| a flat backlog is valid — nothing is pre-decomposed | `validate` (no nag) |

`spent_min` is always a row's **own** measured time; `rollup_min` /
`rollup_estimate_min` (in `tree --json`, `children`) add descendants.

## Session rules

- one open session per row; one `in-progress` row overall (WIP limit);
- a session still open after 8 h fails `validate` (forgotten `stop`);
- a closed session over 8 h is a warning — it happened, splitting it would be
  fiction;
- overlapping sessions in a row fail;
- `spent_min` / `session_count` are derived: disagreement fails `validate`,
  `fmt` recomputes them.

## Failure modes

| symptom | cause | fix |
| --- | --- | --- |
| `not canonical` | hand edit or derived drift | `python3 scripts/tasks.py fmt` |
| `WIP limit 1` | another row is `in-progress` | `stop` it or `set-status … parked` |
| `T-0xx is not ready to start` | the row is not triaged, has no estimate/area/issue, is blocked, or its issue has no milestone | fix the listed reasons (`ready` prints them all), or `start --force` deliberately |
| `triaged but not ready to start` (validate FAIL) | a triaged row lost a required field, or its issue lost its milestone | `python3 scripts/tasks.py ready`; `ready --demote` sends milestone-only rows back to `backlog` |
| `no PR found for this session's commits` | the PR was opened after the session closed, or the session made no commits (verify-only) | open the PR, then `python3 scripts/tasks.py attach-pr T-0xx <PR#>` |
| `doctor: … reopened` | the ledger says `done` but the GitHub issue is still open | close the issue (with a comment pointing at the fix), then `reconcile --apply` |
| commit refused by hook | no open session | `task:start <id>` (escape: `--no-verify`) |
| `validate-commits` FAIL | missing `Task:` trailer, or the task is not `review`/`done` **at HEAD** because the close-out was never committed | `task:stop <id>`, then commit `TASKS.yaml` (ledger-only, needs no session) |
| `TASKS.yaml has uncommitted changes` (WARN) | `stop`'s close-out not committed yet | `git add TASKS.yaml && git commit -m "chore(tasks): close <id>"` |
| `doctor: … no ledger row` | issue filed on GitHub outside `track` | `task:intake` |
| `doctor: status labels … !=` | status changed without mirroring | `task:gh-sync` |
| `doctor: … sub-issue of #N on GitHub but the ledger has no parent` | link made on GitHub outside the ledger | `task:intake` (adopt it) or `task:gh-sync --relink` (drop it) |
| `start` → "decomposed umbrella" | parent has children | `start` a child instead (`task:tree`) |
| `parent done while child(ren) still open` | parent closed too early | finish the children, or `set-status` the parent back to `triaged` |
| ambiguous `track` (exit 3) | candidate in the 0.45–0.75 band | show candidates, ask, or rerun `--new` |
| `pr-metadata: … carries no tracked task` | commit lacks a `Task:` trailer | `task:start`, amend trailers, rerun |
| `project: skipped — no board configured` | no board number / no `read:project` | set `PROJECT_NUMBER`, or flip the board's Auto-add filter to include PRs |
| PR labels drifted after re-triage | row changed post-PR | `pr-metadata <N>` again (idempotent) |
