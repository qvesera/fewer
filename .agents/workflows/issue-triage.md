---
description: Issue Triage & Delivery
---

# Role & Goal

You triage and deliver GitHub issues for **fewer** end-to-end: survey the open
issues, ask the user which one to take first, classify it (labels + milestone),
open a branch linked to it, fix it, and land the PR against `dev`.

One issue = one branch = one PR. Never bundle unrelated fixes.

Mutating steps (labels, milestone creation, branch creation, push, PR) need the
`gh` repo-admin token. If a step is blocked, say which command failed and stop;
do not fake the result. If you are running under plan-mode constraints, present
the plan and ask the user to toggle to Act mode — never claim a branch or label
exists before the command has actually run.

---

# Step 0 — Only when no issue exists

If the user describes a defect/request with no issue number, create the issue
first, following `.github/ISSUE_TEMPLATE/bug_report.md` (or
`feature_request.md`):

```bash
gh issue create --title "[Bug] <symptom>" --label bug --body-file /tmp/issue-body.md
```

The web form does **not** apply the template's `labels: bug` front matter, so
label it yourself (Step 3). Write the body as symptom → steps to reproduce →
expected vs actual → environment (browser/OS/app version), not as a fix plan.

---

# Step 1 — Survey open issues

```bash
gh issue list --state open --limit 100 \
  --json number,title,labels,milestone,assignees,createdAt,updatedAt,comments \
  --jq '.[] | "#\(.number) [\((.labels|map(.name))|join(","))] ms=\(.milestone.title // "-") asg=\((.assignees|map(.login))|join(",")) | \(.title)"'
```

Read the full record for every candidate before ranking anything:

```bash
gh issue view <N> --json number,title,body,labels,milestone,assignees,state,author,url,comments
```

In-app bug reports (like #180) embed a JSON payload with
`bug.severity` and `bug.category` under **Raw JSON Payload**, plus the app
version. That payload is the source of truth for Step 3's labels — read it, do
not guess severity from the prose.

Rank with evidence, not vibes:

| Signal | Reading |
| --- | --- |
| severity label / payload `severity` | `critical` > `high` > `medium` > `low` |
| "blocked"/"data loss"/"cannot" phrasing | outranks a cosmetic annoyance |
| already has a linked branch | see `gh issue develop --list <N>`; skip or continue that work |
| age (`createdAt`) + `comments` | a stale open bug with reproductions is cheap value |
| blast radius | a helper in `src/lib/fewer/` is testable; a gesture/UI bug needs manual repro |

---

# Step 2 — Ask the user which issue to take first

**Always ask before mutating anything.** One question, 2–5 options, each option
carrying the number, title, severity and a one-line "why this one" (e.g. "cheap
fix, already reproducible"). Never auto-pick a prioritisation on the user's
behalf, and never start a branch until an option is chosen.

Claim the choice on the clock at the same time — this dedupes against work
already logged and opens the timed session (Step 4 needs it open):

```bash
python3 scripts/tasks.py attach <N>                          # row exists → starts it
python3 scripts/tasks.py track bug "<title>" --dry-run       # unsure it exists → show the match decision first
```

---

# Step 3 — Classify: labels + milestone

## Labels

The label families are fixed; not every member exists yet (`gh label list` is
the truth):

- Type: `bug`, `enhancement`, `documentation`, `question`, `duplicate`, `invalid`, `wontfix`
- Attention: `good first issue`, `help wanted`
- Severity (exactly one): `severity:low`, `severity:medium`, `severity:high`, `severity:critical`
- Category (exactly one): `category:other`, `category:layout`, `category:import`, `category:export`, `category:resize`, `category:theme`, `category:context-menu`, `category:keyboard`, `category:search`, `category:drag-drop`, `category:file-ops`, `category:ui`, `category:performance`

Today only these `severity:` / `category:` members exist: `severity:medium`,
`severity:high`, `category:other`, `category:layout`, `category:import`,
`category:keyboard`, `category:file-ops`.

Rules:

1. Exactly **one** type label. Defect → `bug`; new capability → `enhancement`;
   docs-only → `documentation`.
2. Exactly **one** `severity:*` and one `category:*`, copied from the payload's
   `bug.severity` / `bug.category` (`src/lib/fewer/bugReport.ts` is the
   vocabulary — `low|medium|high|critical` and the category list above).
3. `good first issue` / `help wanted` only when the user agrees — they are an
   invitation to outside contributors, not a severity marker.
4. Never invent a new label family. Only the `severity:` / `category:` names
   above may be created, and only when missing:

```bash
gh label list --limit 200 --json name --jq '.[].name'          # what exists
gh label create "severity:critical" --color ededed            # ededed = the existing severity/category family colour
gh issue edit <N> --add-label bug --add-label severity:medium --add-label category:file-ops
```

`gh issue edit --add-label` is idempotent (re-adding is a no-op), so re-running
triage is safe.

## Milestone

Milestones are one per release train, named `vX.Y.Z`:

```bash
gh api repos/qvesera/fewer/milestones?state=all --jq '.[] | "\(.number) | \(.title) | due=\(.due_on) | open=\(.open_issues)"'
python3 scripts/changelog.py current    # Unreleased groups + package.json version
```

Pick the version from the changelog state, not from a wish:

- Unreleased holds only `Fixed` / `Performance` / `Changed` → next **patch**
  (e.g. `package.json` 0.7.1 → `v0.7.2`).
- Unreleased holds `Added` (a new capability) → next **minor**.

Create it only if it does not already exist, then assign:

```bash
gh api repos/qvesera/fewer/milestones -f title="v0.7.2" \
  -f description="Patch release: post-0.7.1 fixes"
gh issue edit <N> --milestone "v0.7.2"
```

If the user says to skip the milestone, leave it unset — do not invent a new
release train just to fill the field. Confirm the target version with the user
before creating a milestone the first time in a session.

Mirror the same triage onto the ledger row (one row per issue: `triaged`,
estimate, area from the `category:` label, blockers):

```bash
python3 scripts/tasks.py triage <T-###> --estimate-min <n> --area <category> [--tier 0|1|2]
```

If the chosen issue is one slice of a larger body, record the hierarchy now
(`--parent <T-id>` on `triage`, or `reparent`); if picking up a Tier 1+ task
(estimate ≥ 2400 min), decompose it into 2–6 linked subtasks **before** Step 4
— ask first beyond three — and show `python3 scripts/tasks.py tree` so the
split is visible.

---

# Step 4 — Branch

Cut from **`origin/dev`**, always. PR gates target `dev`, and branching from a
stale local feature branch silently drags unrelated commits (and their
migrations) into the PR.

```bash
git fetch origin dev
gh issue develop <N> --base dev --name <type>/<slug> --checkout
```

`gh issue develop` creates the branch on the remote, links it to the issue in
GitHub's Development panel, and configures `dev` as the PR base. Fallback if it
fails (no push rights, offline):

```bash
git switch -c <type>/<slug> origin/dev
```

Naming:

- `<type>` from Conventional Commits: `fix/`, `feat/`, `refactor/`, `perf/`,
  `chore/`, `docs/`, `test/`.
- `<slug>`: kebab-case, ≤5 words, names the **symptom**, not the file —
  `fix/ctrl-deselect-after-shift-select`, not `fix/merge-selection`.
- No issue numbers in the slug; the link back is `gh issue develop` + `Fixes #N`.

Verify before editing:

```bash
git branch --show-current
git log --oneline origin/dev..HEAD     # expect: empty
gh issue develop --list <N>
```

Open the timed session before touching a file — the commit hook needs it open
to stamp the `Task:` trailer, and `validate-commits` rejects work on a task
that is not `review`/`done`:

```bash
python3 scripts/tasks.py start <T-###>
```

---

# Step 5 — Work the issue

1. **Reproduce from the issue, not from memory.** Walk the reported steps; the
   in-app report's Graph State / viewport are hints, not guarantees.
2. **Locate the code** with the repowise MCP first (`get_answer`,
   `search_codebase`), then read the file. Cite `path:line` in the PR body.
3. **Fix minimally.** No refactor-as-fix, no new dependency, no abstraction
   nobody asked for.
4. **Test the logic.** Anything in `src/lib/fewer/` → add/extend the matching
   `*.test.ts`. Component suites must not register a partial `mock.module` on a
   shared module (bun's registry is process-wide and leaks across files), and
   must be verified with `bun run test` (all files), never a single file.
5. **A unit test cannot prove a gesture.** For pointer/keyboard bugs
   (Ctrl+click, Shift+drag), re-check the reported steps by hand in `bun run dev`
   and state the manual result in the PR.
6. **Changelog** (mandatory for any user-facing change):
   `python3 scripts/changelog.py add fixed "<feature-forward sentence>"`
   (group from the commit type: `fix`→`fixed`, `feat`→`added`, `perf`→`performance`).
7. **Docs**: `content/docs/*.md` for behavior changes; keyboard shortcuts also
   need `src/components/fewer/ShortcutsDialog.tsx` and `README.md`.
8. **Gates** — all must pass before committing:

```bash
bun run lint
bunx tsc --noEmit
bun run test
bun run build
python3 scripts/changelog.py validate
python3 scripts/migrations.py verify --base origin/dev   # only if supabase/migrations/ changed
```

---

# Step 6 — Ship

1. Conventional commit, scoped to the issue: `fix: ctrl-click deselects after a
   shift-drag box select`.
2. Push the branch, then open the PR against `dev` with
   `.github/PULL_REQUEST_TEMPLATE.md`. The body must include:
   - `Fixes #<N>` (closes the issue on merge — never close it by hand),
   - root cause with `path:line`,
   - the label/severity reasoning if the issue was triaged in the same commit,
   - the exact commands run and their result (including the manual repro).
3. Verify, don't assume:

```bash
git status --porcelain        # clean
git log --oneline origin/dev..HEAD
gh pr view --json number,title,baseRefName,url
gh issue view <N> --json labels,milestone   # labels + milestone actually applied
```

4. Never `git push --force` `dev`/`main`, never push to `release/prod`, never
   edit an already-applied migration (`.agents` migration rules).
5. Close the clock before pushing: `python3 scripts/tasks.py stop <T-###>
   --note "…"` (moves `in-progress → review`, harvests commits/PR/files/LOC as
   effort proof, optionally comments the time on the issue), then both
   `python3 scripts/tasks.py validate` and
   `python3 scripts/tasks.py validate-commits --base origin/dev` must pass.
   Commit that ledger close-out (a `TASKS.yaml`-only commit needs no session).
6. **Raise the PR with its metadata** — template, `Fixes #N`, `Task: T-###`,
   report totals, then (per `.agents/skills/pr/SKILL.md`):

```bash
python3 scripts/tasks.py pr-metadata <PR#> --dry-run   # show the derived plan
python3 scripts/tasks.py pr-metadata <PR#>             # labels + milestone + assignee (+ project)
```

   CI re-applies it on every PR event (`.github/workflows/pr-metadata.yml`).
7. Loop back to Step 1 and re-list the open issues; report what shipped and what
   is left (`python3 scripts/tasks.py report`).

---

# Non-issue outcomes (no branch, no PR)

`duplicate` / `invalid` / `wontfix` / `question` get a label, a one-paragraph
comment with the reason and a pointer where relevant, then:

```bash
gh issue close <N> --comment "<reason>"
```

Do not open a branch for these. Never close an issue as fixed without a merged
PR or an explicit user instruction.

---

# Guardrails

- Ask before choosing the issue (Step 2) and before creating a new milestone.
- Never invent labels, milestones, branch names or versions.
- Re-running any step must be safe: check `gh issue develop --list <N>`, the
  label list and the milestone list before creating anything.
- Report facts you verified with a command; mark anything you did not run as
  unverified.
