# Task Tracking (MANDATORY, before any work)

Source of truth: `TASKS.yaml`, owned by `scripts/tasks.py`. Every unit of work is
a row; every working session is a timestamped entry on that row; every commit
carries a `Task: T-###` trailer stamped by an installed `prepare-commit-msg`
hook; CI re-validates on every PR. AGENTS.md only points here — **this rule is
the gate, and no task may start until these steps have run.**

## Before starting anything

1. `bun run task:status` — it reports the open session, totals, and any
   **untracked GitHub issues**. If a session is already open, resume it or close
   it (`bun run task:stop <id>`) first; two open sessions fail validation.
2. If it reports untracked issues, adopt them before any other work:
   `python3 scripts/tasks.py intake --dry-run` (show what would change) then
   `python3 scripts/tasks.py intake`. Bugs filed directly on GitHub land here —
   they become `triaged` rows (or `done` records if already closed) without
   asking, because the ledger is the union of local tasks and GitHub issues.
3. Identify the task: `bun run task:find "<words>"`. Not found → create it and
   classify it (`status: triaged` is required before any branch or edit exists):
   ```bash
   bun run task:add --title "…" --type <feat|fix|refactor|perf|docs|infra|research|task>
   bun run task:triage <T-###> --estimate-min <n> [--tier 0|1|2] --area <category> \
       [--blocked-by T-00x] [--issue <N>]
   ```
4. `bun run task:ready` — **the start gate.** A row is startable only when it is
   `triaged` (or already in `review`, for a follow-up session), estimated,
   classified (`--area`), linked to an issue (or `internal`), unblocked, and its
   issue carries a **milestone**:
   ```bash
   bun run task:ready              # list what is not startable, and why
   bun run task:ready --strict     # same, non-zero exit (CI)
   bun run task:ready --demote     # move milestone-less triaged rows to backlog
   ```
   `start` refuses an unready row and prints the reasons (`--force` overrides).
   `validate` **fails** on an unready `triaged` row, so the CI `tasks` job
   enforces it on every PR. A missing milestone is triage's job — it decides the
   release train — so `ready --demote` sends such rows back to `backlog`; a row
   with any other gap is reported and left alone for a human.
5. `bun run task:start <T-###>` — opens the timed session and sets the row
   **in-progress**. Refuses when the row is not ready, when another session is
   open (WIP limit 1), or when the row is a decomposed umbrella.

## Trigger phrases (say these instead of narrating intent)

| you say | the agent does |
| --- | --- |
| `track bug <description>` | `tasks.py track bug "<description>" [--area … --severity …]` — dedupes against **both** the ledger and GitHub, then creates/attaches and starts the clock |
| `track feature …` / `track task …` | same, `type` feat/task, `enhancement` label |
| `track #180` / `track T-006` | `tasks.py attach <ref>` — no search, no creation |
| `track new bug …` | `track --new` — skips the search and files it |
| `track <anything> --dry-run` | prints the match decision and the issue it *would* file; writes nothing |

`track` scoring: ≥0.75 → attach (a closed match attaches as a *recurrence*, it
is never refilled); 0.45–0.75 or two candidates within 0.1 → **stop and ask the
user which candidate**, never attach to a lookalike; <0.45 → create. Always show
the `DECISION` line and why (candidate, score, state) before continuing.

## While working

- Commits must carry a `Task: T-###` trailer. The installed hook stamps it from
  the open session and **refuses a commit when no session is open**
  (`git commit --no-verify` / `SKIP_TASK_HOOK=1` are the escape hatches — record
  the time manually if you use one).
- Never edit `TASKS.yaml` by hand: use `start` / `stop` / `set-status` / `note` /
  `record-session`. `validate` rejects a file that is not canonical.
- Scope grew → `task:note <id> "…"`; genuinely new scope → a new task.

## Closing

- `bun run task:stop <T-###> --note "…"` closes the session and harvests proof
  + effort (commits, files, insertions/deletions) from git. It resolves the PR
  **from that session's own commits** (`/commits/<sha>/pulls`) — never from the
  checked-out branch, which after a merge is `dev`, where `gh pr view` resolves
  to whichever release PR points at it — attaches it to the row, and moves
  `in-progress → review`. With no resolvable PR (the PR was opened afterwards,
  or the session was verify-only) the row stays `triaged` and `stop` prints the
  command to finish the job: `python3 scripts/tasks.py attach-pr <T-###> <PR#>`,
  which sets the PR and moves the row to `review` when it is open.
- **Then commit the close-out**: `git add TASKS.yaml && git commit -m
  "chore(tasks): close T-###"`. A commit that stages *only* `TASKS.yaml` needs
  no open session and gets no trailer — that is how `stop`, `intake`,
  `gh-sync` and `import-todo` writes reach the repo. Skip this and `validate`
  warns that the ledger is dirty while `validate-commits` fails, because the
  gate judges status **at HEAD**, i.e. from what is committed.
- Status machine: `triaged → in-progress → review → done`, plus `blocked`,
  `parked`, `wontfix`; `set-status` refuses illegal jumps and refuses `done`
  without proof.
- `python3 scripts/tasks.py doctor` must report no drift (ledger ↔ issues, both
  directions), and `bun run task:validate` must pass before every push.

## Before a PR

```bash
git add TASKS.yaml && git commit -m "chore(tasks): close <T-###>"  # ledger-only, no session needed
bun run task:validate                       # structural gate (CI runs this too)
python3 scripts/tasks.py validate-commits --base origin/dev   # trailers + status at HEAD
python3 scripts/tasks.py report             # time rollup — paste totals into the PR
```

CI fails the PR if any commit lacks a `Task: T-###` trailer, names an unknown
task, or if that task is not in `review`/`done` with recorded time.

## Hierarchy — sub-issues and subtasks

`parent: T-###` links a task under another (its issue becomes a GitHub
sub-issue). It is a *different graph* from `blocked_by`: parent = work breakdown,
blocked_by = dependency; both are kept acyclic by `validate`.

- **Decompose at pickup, not at triage.** Before `start` on a task whose
  estimate is ≥ 2400 min (Tier 1+) or whose body holds several independent
  deliverables: split it into 2–6 subtasks, each independently shippable with its
  own estimate, each created as a real issue linked under the parent:
  ```bash
  bun run task:add --title "…" --parent T-006 --estimate-min <n>
  bun run task:triage <child> --area <category>
  python3 scripts/tasks.py gh-sync              # creates the issues + --parent links
  ```
  **Ask the user before creating more than three**, or when the split is a
  judgement call. Then `start` the *first child* — `start` on a parent that has
  children is refused ("decomposed umbrella").
- Nothing is pre-decomposed: a flat backlog is valid, and existing rows stay
  roots until their work actually starts.
- Never leave a child unlinked (`gh-sync` writes the GitHub `--parent`), never
  let a parent close with children open (`validate` fails it), and never let a
  child be `internal` under an issue-backed parent (`validate` fails that too —
  a GitHub sub-issue needs its own issue).
- Inspect with `bun run task:report --tree`, `python3 scripts/tasks.py children
  <T-id>`; move with `python3 scripts/tasks.py reparent <T-id> --parent …|--detach`
  (follow with `gh-sync` / `gh-sync --relink`). `doctor` proves the ledger and
  GitHub agree on every link, both directions.
- End a triage session by showing the tree — the hierarchy stays visible, not
  implied. Rollups (`rollup …` in `tree`, `rollup_min` in `--json`) add own +
  descendant time; `spent_min` on a row is always that row's own measured time.

## Verbs

`status · find · add · triage · ready · start · stop · attach-pr ·
record-session · set-status · note · track · attach · intake · import-todo ·
gh-sync · reconcile · doctor · report · validate · validate-commits · fmt ·
install-hooks · selftest`
— `python3 scripts/tasks.py <verb> -h` for flags.
