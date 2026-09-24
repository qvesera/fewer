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
4. `bun run task:start <T-###>` — opens the timed session. Refuses when another
   session is open (WIP limit 1).

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
  + effort (commits, files, insertions/deletions) from git. It moves
  `in-progress → review` when a PR is detected, else back to `triaged`.
- Status machine: `triaged → in-progress → review → done`, plus `blocked`,
  `parked`, `wontfix`; `set-status` refuses illegal jumps and refuses `done`
  without proof.
- `python3 scripts/tasks.py doctor` must report no drift (ledger ↔ issues, both
  directions), and `bun run task:validate` must pass before every push.

## Before a PR

```bash
bun run task:validate                       # structural gate (CI runs this too)
python3 scripts/tasks.py validate-commits --base origin/dev   # every commit names a task in review/done
python3 scripts/tasks.py report             # time rollup — paste totals into the PR
```

CI fails the PR if any commit lacks a `Task: T-###` trailer, names an unknown
task, or if that task is not in `review`/`done` with recorded time.

## Verbs

`status · find · add · triage · start · stop · record-session · set-status ·
note · track · attach · intake · import-todo · gh-sync · reconcile · doctor ·
report · validate · validate-commits · fmt · install-hooks · selftest`
— `python3 scripts/tasks.py <verb> -h` for flags.
