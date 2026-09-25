#!/usr/bin/env python3
"""Task tracking for fewer — the ledger, the clock, and the gates.

Source of truth: TASKS.yaml. It is owned by this script: never edit it by
hand, run a verb instead (`python3 scripts/tasks.py -h`), then `validate`.
Every unit of work is a row; every working session is a timestamped entry on
that row; commits carry a `Task: T-###` trailer stamped by the installed
prepare-commit-msg hook; CI re-validates on every PR.

Stdlib only (no PyYAML — mirrors scripts/decisions.py) over a deliberately
restricted YAML subset that this script both emits and parses.

Usage: python3 scripts/tasks.py <verb> [args]
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "TASKS.yaml")
TODO_MD = os.path.join(ROOT, "TO-DO.md")
REPO_SLUG = "qvesera/fewer"
DEFAULT_ASSIGNEE = "qvesera"
PROJECT_OWNER = "qvesera"
# Set once `gh project list` works (needs the read:project scope); `pr-metadata
# --project <n>` overrides it per call.
# PROJECT_NUMBER: set once the board is known (board `#1 · fewer - file viz`,
# owner qvesera) — `pr-metadata --project <n>` still overrides per call.
PROJECT_NUMBER: int | None = 1

# ── vocabulary ──────────────────────────────────────────────────────────
STATUSES = (
    "backlog", "triaged", "in-progress", "blocked", "review",
    "done", "parked", "wontfix",
)
STATUS_LABEL = {  # ledger status -> GitHub status:* label (None = no label)
    "backlog": None, "triaged": "status:triaged", "in-progress": "status:in-progress",
    "blocked": "status:blocked", "review": "status:review", "done": "status:done",
    "parked": None, "wontfix": "wontfix",
}
STATUS_COLOR = "ededed"  # matches the severity:/category: label family
TYPES = ("feat", "fix", "refactor", "perf", "docs", "infra", "research", "task")
ESTIMATE_DEFAULT = {"feat": 480, "fix": 120, "refactor": 240, "perf": 120,
                    "docs": 120, "infra": 480, "research": 480, "task": 120}
TIER_ESTIMATE = {0: 480, 1: 2400, 2: 9600}
MAX_SESSION_MIN = 8 * 60      # an open session this long is a forgotten stop
WIP_LIMIT = 1                 # single-agent repo: one in-progress row at a time
TASK_RE = re.compile(r"T-\d{3,}")

TASK_KEYS = (
    "id", "title", "status", "type", "area", "tier", "estimate_min",
    "estimate_basis", "issue", "pr", "internal", "milestone", "blocked_by",
    "parent", "source", "time_source", "reporter", "assignee", "created_at",
    "notes", "sessions", "spent_min", "session_count",
)
SESSION_KEYS = ("start", "end", "measured", "note", "proof", "effort")

STOPWORDS = frozenset("a an and are as at be but by for from has have how in is it of on or s so that the this to was we what when with you your".split())


def _die(msg: str, code: int = 1) -> "NoReturn":  # type: ignore[valid-type]
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> dt.datetime:
    """Accepts our own `...Z` stamps and GitHub's `...+00:00` stamps."""
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


# ── the restricted YAML subset ──────────────────────────────────────────
def _quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def fmt_value(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return _quote(v)
    if isinstance(v, list):
        return "[" + ", ".join(fmt_value(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ", ".join(f"{k}: {fmt_value(x)}" for k, x in v.items()) + "}"
    raise TypeError(f"unsupported value type {type(v)!r}")


def _split_flow(s: str) -> list[str]:
    out, depth, cur, inq = [], 0, "", False
    i = 0
    while i < len(s):
        c = s[i]
        if inq:
            if c == "\\":
                cur += c + (s[i + 1] if i + 1 < len(s) else "")
                i += 2
                continue
            if c == '"':
                inq = False
            cur += c
        else:
            if c == '"':
                inq = True
                cur += c
            elif c in "[{":
                depth += 1
                cur += c
            elif c in "]}":
                depth -= 1
                cur += c
            elif c == "," and depth == 0:
                out.append(cur.strip())
                cur = ""
            else:
                cur += c
        i += 1
    if cur.strip():
        out.append(cur.strip())
    return out


def parse_value(tok: str) -> Any:
    tok = tok.strip()
    if tok.startswith('"'):
        out, i = [], 1
        while i < len(tok):
            c = tok[i]
            if c == "\\" and i + 1 < len(tok):
                nxt = tok[i + 1]
                out.append({"n": "\n", '"': '"', "\\": "\\"}.get(nxt, nxt))
                i += 2
                continue
            if c == '"':
                break
            out.append(c)
            i += 1
        return "".join(out)
    if tok == "null":
        return None
    if tok == "true":
        return True
    if tok == "false":
        return False
    if tok.startswith("[") and tok.endswith("]"):
        inner = tok[1:-1].strip()
        return [parse_value(p) for p in _split_flow(inner)] if inner else []
    if tok.startswith("{") and tok.endswith("}"):
        inner = tok[1:-1].strip()
        out: dict[str, Any] = {}
        for part in _split_flow(inner):
            key, _, val = part.partition(":")
            out[key.strip()] = parse_value(val)
        return out
    if re.fullmatch(r"-?\d+", tok):
        return int(tok)
    return tok


# ── git / gh helpers ────────────────────────────────────────────────────
def sh(cmd: list[str], check: bool = True) -> str:
    # DEVNULL: never let an interactive gh prompt (or a `--body-file -` read)
    # hang a hook/CI run waiting on stdin.
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if check and r.returncode != 0:
        raise SystemExit(f"cmd failed: {' '.join(cmd)}\n{r.stderr.strip()}")
    return r.stdout


def git(*args: str, check: bool = True) -> str:
    return sh(["git", *args], check=check)


def gh(*args: str, check: bool = True) -> str:
    return sh(["gh", *args], check=check)


def gh_json(*args: str) -> Any:
    return json.loads(gh(*args))


def have_gh() -> bool:
    try:
        r = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True)
        return r.returncode == 0
    except FileNotFoundError:
        return False


# ── ledger IO ───────────────────────────────────────────────────────────
def parse_ledger(text: str) -> dict[str, Any]:
    """Line parser for the exact shape emit_ledger writes.

    Top-level scalars, then `tasks:` (list of maps) and, inside a task, an
    optional `sessions:` list of maps. Anything else is a hard error — a
    hand-edit outside the subset must fail loudly, not parse partially.
    """
    ledger: dict[str, Any] = {"version": None, "tasks": []}
    mode = "top"  # top | task | sessions
    task: dict[str, Any] | None = None
    sess: dict[str, Any] | None = None

    for lineno, raw in enumerate(text.splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        s = raw.strip()

        if mode == "top":
            if s == "tasks:":
                mode = "task"
                continue
            if ":" in s and indent == 0:
                k, _, v = s.partition(":")
                ledger[k.strip()] = parse_value(v)
                continue
            _die(f"{LEDGER}:{lineno}: unexpected line in header: {s!r}")

        if mode == "task":
            if indent == 0 and s.startswith("tasks:"):
                continue
            if indent == 0 and s.startswith("- "):
                task = {}
                sess = None
                ledger["tasks"].append(task)
                k, _, v = s[2:].partition(":")
                if not v and k.strip() == "sessions":
                    _die(f"{LEDGER}:{lineno}: sessions must start with a value or []")
                task[k.strip()] = parse_value(v)
                continue
            if indent == 2 and ":" in s and not s.startswith("- "):
                if task is None:
                    _die(f"{LEDGER}:{lineno}: key before any task")
                k, _, v = s.partition(":")
                key = k.strip()
                if key == "sessions" and v.strip() == "[]":
                    task["sessions"] = []
                elif key == "sessions" and not v.strip():
                    task["sessions"] = []
                    mode = "sessions"
                else:
                    task[key] = parse_value(v)
                continue
            if indent == 2 and s.startswith("- ") and mode == "sessions":
                sess = {}
                task["sessions"].append(sess)  # type: ignore[union-attr]
                k, _, v = s[2:].partition(":")
                sess[k.strip()] = parse_value(v)
                continue
            _die(f"{LEDGER}:{lineno}: unexpected line in task: {raw!r}")

        if mode == "sessions":
            if indent == 2 and s.startswith("- "):
                sess = {}
                task["sessions"].append(sess)  # type: ignore[union-attr]
                k, _, v = s[2:].partition(":")
                sess[k.strip()] = parse_value(v)
                continue
            if indent == 4 and ":" in s and sess is not None:
                k, _, v = s.partition(":")
                sess[k.strip()] = parse_value(v)
                continue
            if indent == 2 and ":" in s and not s.startswith("- "):
                mode = "task"
                k, _, v = s.partition(":")
                task[k.strip()] = parse_value(v)  # type: ignore[union-attr]
                continue
            _die(f"{LEDGER}:{lineno}: unexpected line in sessions: {raw!r}")

    if ledger["version"] != 1:
        _die(f"{LEDGER}: expected `version: 1`, got {ledger['version']!r}")
    if not isinstance(ledger["tasks"], list):
        _die(f"{LEDGER}: `tasks:` is not a list")
    return ledger


def emit_ledger(ledger: dict[str, Any]) -> str:
    out = [
        "# fewer task ledger — owned by scripts/tasks.py. Never edit by hand:",
        "# run a verb (python3 scripts/tasks.py -h) and `validate` to check.",
        "version: 1",
        "tasks:",
    ]
    for t in ledger["tasks"]:
        first = True
        for key in TASK_KEYS:
            if key == "sessions":
                sessions = t.get(key) or []
                if not sessions:
                    out.append("  sessions: []")
                    continue
                out.append("  sessions:")
                for i, sess in enumerate(sessions):
                    for j, sk in enumerate(SESSION_KEYS):
                        prefix = "  - " if j == 0 else "    "
                        out.append(f"{prefix}{sk}: {fmt_value(sess.get(sk))}")
                continue
            prefix = "- " if first else "  "
            out.append(f"{prefix}{key}: {fmt_value(t.get(key))}")
            first = False
    return "\n".join(out) + "\n"


def load() -> dict[str, Any]:
    if not os.path.isfile(LEDGER):
        return {"version": 1, "tasks": []}
    with open(LEDGER, encoding="utf-8") as fh:
        return parse_ledger(fh.read())


def save(ledger: dict[str, Any]) -> None:
    for row in ledger["tasks"]:
        backfill(row)
        refresh(row)
    with open(LEDGER, "w", encoding="utf-8") as fh:
        fh.write(emit_ledger(ledger))


def backfill(row: dict[str, Any]) -> None:
    """Identity fields every row must carry when the schema grows — applied on
    every save, so an older ledger self-migrates instead of failing validate."""
    if not row.get("assignee"):
        row["assignee"] = DEFAULT_ASSIGNEE
    if "pr" not in row:
        row["pr"] = None
    if "parent" not in row:
        row["parent"] = None
    row.setdefault("sessions", [])


# ── row / session helpers ───────────────────────────────────────────────
def refresh(row: dict[str, Any]) -> None:
    """Derive spend from the sessions — never store these by hand."""
    total = 0
    for sess in row.get("sessions") or []:
        total += session_minutes(sess)
    row["spent_min"] = total
    row["session_count"] = len(row.get("sessions") or [])


def session_minutes(sess: dict[str, Any]) -> int:
    if not sess.get("start") or not sess.get("end"):
        return 0
    delta = parse_iso(sess["end"]) - parse_iso(sess["start"])
    return int(round(delta.total_seconds() / 60))


def new_row(*, title: str, rtype: str, area: str, status: str = "triaged",
            tier: int | None = None, estimate_min: int | None = None,
            issue: int | None = None, internal: bool = False,
            milestone: str | None = None, blocked_by: list[str] | None = None,
            parent: str | None = None, pr: int | None = None,
            source: str | None = None, time_source: str | None = None,
            reporter: str | None = None, assignee: str | None = None,
            created_at: str | None = None,
            estimate_basis: str = "type-default", notes: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": None, "title": title, "status": status, "type": rtype, "area": area,
        "tier": tier, "estimate_min": int(estimate_min or ESTIMATE_DEFAULT.get(rtype, 120)),
        "estimate_basis": estimate_basis, "issue": issue, "pr": pr, "internal": internal,
        "milestone": milestone, "blocked_by": blocked_by or [], "parent": parent,
        "source": source, "time_source": time_source, "reporter": reporter,
        "assignee": assignee or DEFAULT_ASSIGNEE,
        "created_at": created_at or now_iso(), "notes": notes or [], "sessions": [],
        "spent_min": 0, "session_count": 0,
    }


# ── hierarchy: parent/child rows and their derived rollups ───────────────
def children_map(ledger: dict[str, Any]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for row in ledger["tasks"]:
        parent = row.get("parent")
        if parent:
            out.setdefault(parent, []).append(row["id"])
    return out


def descendants(ledger: dict[str, Any], rid: str) -> list[str]:
    """Every row below `rid`, depth-first, cycles guarded."""
    kids = children_map(ledger)
    out: list[str] = []
    seen = {rid}
    stack = list(kids.get(rid, []))
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        out.append(cur)
        stack.extend(kids.get(cur, []))
    return out


def subtree_ids(ledger: dict[str, Any], rid: str) -> list[str]:
    return [rid, *descendants(ledger, rid)]


def depth_of(ledger: dict[str, Any], rid: str) -> int:
    rows = {r["id"]: r for r in ledger["tasks"]}
    depth, node, guard = 0, rows.get(rid), 0
    while node and node.get("parent") and guard < 20:
        depth += 1
        guard += 1
        node = rows.get(node["parent"])
    return depth


def rollup_minutes(ledger: dict[str, Any], rid: str) -> int:
    rows = {r["id"]: r for r in ledger["tasks"]}
    return sum(int(rows[t]["spent_min"] or 0) for t in subtree_ids(ledger, rid) if t in rows)


def rollup_estimate(ledger: dict[str, Any], rid: str) -> int:
    rows = {r["id"]: r for r in ledger["tasks"]}
    return sum(int(rows[t]["estimate_min"] or 0) for t in subtree_ids(ledger, rid) if t in rows)


def next_id(ledger: dict[str, Any]) -> str:
    nums = [int(m.group(0)[2:]) for m in (TASK_RE.fullmatch(t["id"]) for t in ledger["tasks"]) if m]
    return f"T-{(max(nums) + 1 if nums else 1):03d}"


def find_row(ledger: dict[str, Any], ref: str) -> dict[str, Any] | None:
    ref = ref.strip()
    if ref.startswith("#"):
        ref = ref[1:]
    if re.fullmatch(r"\d+", ref):
        for row in ledger["tasks"]:
            if str(row.get("issue")) == ref:
                return row
        return None
    for row in ledger["tasks"]:
        if row.get("id") == ref.upper():
            return row
    return None


def open_session(ledger: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    for row in ledger["tasks"]:
        for sess in row.get("sessions") or []:
            if not sess.get("end"):
                return row, sess
    return None


# ── evidence: harvested from git, never typed by a human ─────────────────
def collect_evidence(start_iso: str) -> tuple[dict[str, int], list[str]]:
    """Commits on HEAD since the session opened + a file/line effort digest."""
    try:
        log = git("log", f"--since={start_iso}", "--no-merges", "--format=%h %s", check=False)
    except SystemExit:
        return {"commits": 0, "files": 0, "insertions": 0, "deletions": 0}, []
    proof = [line.split(" ", 1)[0] for line in log.splitlines() if line.strip()][:20]
    numstat = git("log", f"--since={start_iso}", "--no-merges", "--format=", "--numstat", check=False)
    files, ins, dels = set(), 0, 0
    for line in numstat.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        a, d, path = parts
        files.add(path)
        if a.isdigit():
            ins += int(a)
        if d.isdigit():
            dels += int(d)
    effort = {"commits": len(proof), "files": len(files), "insertions": ins, "deletions": dels}
    return effort, proof


def cmd_record_session(args: argparse.Namespace) -> int:
    """Append a closed session with explicit timestamps (back-fill / reconstruction).

    Never used for live work — `start`/`stop` own that path — so a reconstructed
    row always carries `measured: false` and an explaining note.
    """
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    if not _valid_iso(args.start) or not _valid_iso(args.end):
        _die("--start and --end must be ISO timestamps (2026-09-24T18:26:00Z)")
    if parse_iso(args.end) < parse_iso(args.start):
        _die("--end is before --start")
    proof = list(args.proof or [])
    if not proof:
        proof = [p for p in args.pr or []]
    sess = {"start": args.start, "end": args.end, "measured": not args.reconstructed,
            "note": args.note or "", "proof": proof, "effort": effort_for_commits(proof)}
    row["sessions"].append(sess)
    if args.time_source:
        row["time_source"] = args.time_source
    elif args.reconstructed:
        row["time_source"] = "reconstructed"
    refresh(row)
    save(ledger)
    print(f"recorded {session_minutes(sess)}m on {row['id']} "
          f"({sess['start']} → {sess['end']}, measured={sess['measured']}, "
          f"proof={proof or '-'})")
    return 0


def effort_for_commits(shas: list[str]) -> dict[str, int] | None:
    """Line effort for explicit commits (back-fills), not a time window."""
    files: set[str] = set()
    ins = dels = 0
    count = 0
    for sha in shas:
        if not re.fullmatch(r"[0-9a-f]{7,40}", sha):
            continue
        out = git("show", "--numstat", "--format=", sha, check=False)
        if not out.strip():
            continue
        count += 1
        for line in out.splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            a, d, path = parts
            files.add(path)
            if a.isdigit():
                ins += int(a)
            if d.isdigit():
                dels += int(d)
    if count == 0:
        return None
    return {"commits": count, "files": len(files), "insertions": ins, "deletions": dels}


def current_pr() -> str | None:
    """PR for the checked-out branch, best effort.

    Only a fallback: the checked-out branch is not the session's branch (after a
    merge you are back on dev, and `gh pr view` on dev resolves to whichever
    release PR happens to point at it). Use `pr_for_session` to attach the PR a
    session actually belongs to.
    """
    try:
        out = gh("pr", "view", "--json", "number,url", "--jq", ".number", check=False).strip()
        return f"#{out}" if out.isdigit() else None
    except (SystemExit, FileNotFoundError):
        return None


# ── Definition of ready: one function, three entry points ────────────────
# start refuses an unready row, validate fails on an unready triaged row, and
# `ready` prints the list. One implementation, so the three can never disagree
# about what "ready" means.

def _issue_milestone(number: int) -> str | None:
    """Title of the issue's milestone, or None (empty string means none set)."""
    try:
        return gh("issue", "view", str(number), "--json", "milestone",
                  "--jq", ".milestone.title // \"\"", check=False).strip() or None
    except (SystemExit, FileNotFoundError):
        return None


def readiness_issues(row: dict[str, Any], ledger: dict[str, Any],
                     check_milestone: bool = True) -> list[str]:
    """Why this row is not startable. Empty list = ready.

    The milestone check reads GitHub because that is where the milestone
    actually lives: `pr-metadata` derives it from the linked issue, so a row
    whose issue has none lands on the board unmilestoned.
    """
    out: list[str] = []
    if row.get("status") != "triaged":
        out.append(f"status is {row.get('status')!r}, not triaged")
    if not row.get("estimate_min"):
        out.append("no estimate — triage it")
    if not row.get("area"):
        out.append("no area — triage it")
    if row.get("issue") is None and not row.get("internal"):
        out.append("no issue and not internal — link it or mark internal")
    rows = {r["id"]: r for r in ledger["tasks"]}
    for dep in row.get("blocked_by") or []:
        target = rows.get(dep)
        if target and target.get("status") not in ("done", "wontfix"):
            out.append(f"blocked by {dep} ({target.get('status')})")
    number = row.get("issue")
    if check_milestone and number and have_gh():
        milestone = _issue_milestone(int(number))
        if milestone is None:
            # The MILESTONE_REASON prefix is machine-readable: `ready --demote`
            # moves a row whose *only* problem is this one back to backlog,
            # because a release train is part of what triage decides.
            out.append(f"{MILESTONE_REASON} issue #{number} has no milestone — assign one "
                       f"(gh issue edit {number} --milestone <title>) or move the row "
                       f"to backlog (ready --demote)")
    return out


MILESTONE_REASON = "milestone:"


def is_demotable(status: str, reasons: list[str]) -> bool:
    """Should `ready --demote` move this row from triaged back to backlog?

    Only when a missing milestone is the *sole* problem: picking a release train
    is part of triage, so an ungroomed row does not belong in the triaged queue.
    Anything mixed in (no estimate, blocked, unlinked) needs a human, so the row
    is reported and left alone. Reversible — `triaged -> backlog` is legal.
    """
    return status == "triaged" and bool(reasons) and all(
        r.startswith(MILESTONE_REASON) for r in reasons)


def cmd_ready(args: argparse.Namespace) -> int:
    """Report rows that are not startable, with the reason for each.

    `--demote` writes: a triaged row whose ONLY problem is a missing milestone
    goes back to backlog, because picking a release train is part of what triage
    decides — an untriaged row should not sit in the triaged queue. Rows with
    other problems (no estimate, blocked, unlinked) are reported, never moved:
    those need a human. `triaged -> backlog` is legal, so this is reversible.
    """
    ledger = load()
    check_ms = not args.no_milestone
    unready: list[tuple[dict[str, Any], list[str]]] = []
    moved: list[str] = []
    for row in ledger["tasks"]:
        if row.get("status") not in ("triaged", "backlog"):
            continue
        reasons = readiness_issues(row, ledger, check_milestone=check_ms)
        if not reasons:
            continue
        unready.append((row, reasons))
        if (args.demote and is_demotable(row.get("status", ""), reasons)):
            row["status"] = "backlog"
            moved.append(row["id"])
    if moved:
        save(ledger)
    if not unready:
        print("ready: every triaged/backlog row is startable")
        return 0
    for row, reasons in unready:
        ref = f"#{row['issue']}" if row.get("issue") else "internal"
        flag = "→ backlog" if row["id"] in moved else row["status"]
        print(f"{row['id']}  {flag}  {ref}  {row['title'][:60]}")
        for reason in reasons:
            print(f"  - {reason}")
    if moved:
        print(f"\nmoved to backlog: {', '.join(moved)} "
              f"(assign a milestone, then triage them back)")
    print(f"\nready: {len(unready)} row(s) not startable "
          f"(triage/fix them, then re-run: python3 scripts/tasks.py ready)")
    return 1 if args.strict else 0



# ── text scoring (find / track dedupe) ─────────────────────────────────
def tokens(text: str) -> set[str]:
    text = re.sub(r"^\s*\[(bug|feature)\]\s*", "", text, flags=re.I)
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 1}


def similarity(a: str, b: str) -> float:
    """How well `a` (usually the query) matches `b` (candidate).

    Normalized Jaccard, except that a reworded query is handled by *containment*:
    "unselect with ctrl after shift selecting cards" barely overlaps #180's title
    but shares 3 of its 5 words with the issue body, so a paraphrase of a real
    report lands in the ambiguous band (ask) instead of filing a duplicate.
    Gated on len(query) >= 4 and overlap >= 3 so two generic words can never
    attach to an unrelated body.
    """
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    if re.sub(r"\W+", "", a.lower()) == re.sub(r"\W+", "", b.lower()):
        return 1.0
    inter = len(ta & tb)
    jac = inter / len(ta | tb)
    if len(ta) >= 4 and inter >= 3:
        return max(jac, 0.9 * (inter / len(ta)))
    return jac


def labelled(*_a: Any, **_k: Any) -> None:
    """Hook point for structured output (kept explicit for --json callers)."""


def _out(payload: Any, text: str, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2))
    else:
        print(text)


# ── verbs ───────────────────────────────────────────────────────────────
def cmd_status(args: argparse.Namespace) -> int:
    ledger = load()
    counts: dict[str, int] = {s: 0 for s in STATUSES}
    for row in ledger["tasks"]:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    spent = sum(int(row.get("spent_min") or 0) for row in ledger["tasks"])
    lines = [f"tasks: {len(ledger['tasks'])}  spent: {spent}m"]
    lines.append("  " + "  ".join(f"{k}={v}" for k, v in counts.items() if v))

    open_sess = open_session(ledger)
    if open_sess:
        row, sess = open_sess
        age = int(round((dt.datetime.now(dt.timezone.utc) - parse_iso(sess["start"])).total_seconds() / 60))
        lines.append(f"OPEN SESSION  {row['id']} · {row['title']} · running {age}m (started {sess['start']})")
        if age > MAX_SESSION_MIN:
            lines.append(f"  ! over {MAX_SESSION_MIN}m — stop it: python3 scripts/tasks.py stop {row['id']}")
    else:
        lines.append("OPEN SESSION  none")

    # Definition of ready: the count the start gate enforces, on the default view.
    unready = [r for r in ledger["tasks"]
               if r.get("status") in ("triaged", "backlog")
               and readiness_issues(r, ledger)]
    if unready:
        lines.append(f"UNREADY  {len(unready)} of "
                     f"{sum(1 for r in ledger['tasks'] if r.get('status') == 'triaged')} "
                     f"triaged rows are not startable")
        lines.append("  run: python3 scripts/tasks.py ready")

    if have_gh():
        rows_with_issue = {row["issue"] for row in ledger["tasks"] if row.get("issue")}
        try:
            issues = gh_json("issue", "list", "--state", "open", "--limit", "200",
                             "--json", "number,title")
            untracked = [i for i in issues if i["number"] not in rows_with_issue]
            if untracked:
                shown = ", ".join(f"#{i['number']}" for i in untracked[:8])
                lines.append(f"UNTRACKED OPEN ISSUES  {len(untracked)} ({shown})")
                lines.append("  run: python3 scripts/tasks.py intake --dry-run   then intake")
        except SystemExit:
            lines.append("UNTRACKED OPEN ISSUES  unknown (gh unavailable)")
    print("\n".join(lines))
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    ledger = load()
    if args.issue and find_row(ledger, str(args.issue)):
        row = find_row(ledger, str(args.issue))
        _die(f"issue #{args.issue} is already tracked as {row['id']}")  # type: ignore[union-attr]
    if args.title is None:
        _die("add requires --title")
    if args.parent:
        args.parent = args.parent.strip().upper()
        if find_row(ledger, args.parent) is None:
            _die(f"parent {args.parent} does not exist")
    row = new_row(
        title=args.title, rtype=args.type or "task", area=args.area or "other",
        status="backlog", tier=args.tier, estimate_min=args.estimate_min,
        estimate_basis="cli" if args.estimate_min else "type-default",
        issue=args.issue, internal=bool(args.internal),
        parent=args.parent,
        source=args.source or (f"gh#{args.issue}" if args.issue else None),
    )
    row["id"] = next_id(ledger)
    ledger["tasks"].append(row)
    save(ledger)
    print(f"created {row['id']}  status=backlog  type={row['type']}  estimate={row['estimate_min']}m")
    print(f"  triage it: python3 scripts/tasks.py triage {row['id']} --estimate-min … --area …")
    return 0


def cmd_triage(args: argparse.Namespace) -> int:
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    if row["status"] in ("in-progress", "done", "wontfix"):
        _die(f"{row['id']} is {row['status']} — set-status first if you really mean to triage it again")
    if args.estimate_min is not None:
        row["estimate_min"] = int(args.estimate_min)
        row["estimate_basis"] = "cli"
    if args.tier is not None:
        row["tier"] = int(args.tier)
        if row["estimate_basis"] != "cli":
            row["estimate_min"] = TIER_ESTIMATE[int(args.tier)]
            row["estimate_basis"] = "todo-tier"
    if args.area:
        row["area"] = args.area
    if args.type:
        row["type"] = args.type
    if args.blocked_by:
        row["blocked_by"] = args.blocked_by
    if getattr(args, "parent", None):
        parent = args.parent.strip().upper()
        if find_row(ledger, parent) is None:
            _die(f"parent {parent} does not exist")
        if parent == row["id"]:
            _die(f"{row['id']} cannot parent itself")
        row["parent"] = parent
    if args.note:
        row["notes"].append(f"{now_iso()} · {args.note}")
    row["status"] = "triaged"
    save(ledger)
    print(f"{row['id']}  status=triaged  estimate={row['estimate_min']}m "
          f"basis={row['estimate_basis']}  area={row['area']}  blocked_by={row['blocked_by'] or '-'}")
    return 0


def pr_for_session(sess: dict[str, Any], row: dict[str, Any]) -> str | None:
    """The PR this session's commits belong to, or None.

    Resolved from the session's own commit SHAs (`/commits/<sha>/pulls`), not
    from the checked-out branch: after a merge you are back on dev, where
    `gh pr view` resolves to whichever release PR points at dev — which is how
    two rows once got an unrelated `dev -> main` release PR attached to them.
    An OPEN PR wins over a MERGED one (a rebase PR would list both).
    """
    if not have_gh():
        return None
    shas = [p for p in (sess.get("proof") or []) if re.fullmatch(r"[0-9a-f]{7,40}", p)]
    if not shas:
        return None
    best: tuple[str, str] | None = None
    for sha in shas:
        try:
            pulls = gh_json("api", f"repos/{REPO_SLUG}/commits/{sha}/pulls")
        except (SystemExit, FileNotFoundError):
            continue
        for pull in pulls:
            number = pull.get("number")
            if not number:
                continue
            label = f"#{number}"
            state = str(pull.get("state") or "").upper()
            if state == "OPEN":
                return label
            if state == "MERGED" and best is None:
                best = (label, str(pull.get("title") or ""))
    return best[0] if best else None


def cmd_attach_pr(args: argparse.Namespace) -> int:
    """Attach an existing PR to a row (idempotent).

    `stop` only resolves a PR from commits that existed when the session
    closed; when the PR is opened afterwards (or the session made no commits,
    e.g. a verify-only session), this is the explicit way to attach it.
    """
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    number = int(str(args.pr).lstrip("#"))
    state, title = "", ""
    if have_gh():
        try:
            out = gh("pr", "view", str(number), "--json", "state,title",
                     "--jq", "[\".state\", .title] | @tsv", check=False).strip()
            state, _, title = out.partition("\t")
        except (SystemExit, FileNotFoundError):
            state = ""
        if not state:
            _die(f"PR #{number} not found (or gh unavailable)")
    if row.get("pr") == number:
        print(f"{row['id']} already attached to PR #{number}")
        return 0
    previous = row.get("pr")
    row["pr"] = number
    save(ledger)
    print(f"{row['id']}  pr: {('#' + str(previous)) if previous else '-'} → #{number}  {title}")
    if state == "OPEN" and row.get("status") in ("triaged", "in-progress"):
        row["status"] = "review"
        save(ledger)
        print(f"  status → review (PR #{number} is open)")
    elif state and state.upper() == "MERGED":
        print("  PR is already merged — run: python3 scripts/tasks.py reconcile --apply")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref} — create it first (find / add / track)")
    kids = children_map(ledger).get(row["id"], [])
    if kids:
        _die(f"{row['id']} is a decomposed umbrella — start a child instead "
             f"(children: {', '.join(kids)}; python3 scripts/tasks.py tree)")
    running = open_session(ledger)
    if running:
        other, sess = running
        if other["id"] == row["id"]:
            print(f"{row['id']} is already running since {sess['start']}")
            return 0
        _die(f"{other['id']} has an open session since {sess['start']} — "
             f"stop it first: python3 scripts/tasks.py stop {other['id']}")
    if row["status"] == "done":
        _die(f"{row['id']} is done — `set-status {row['id']} triaged` to reopen it")
    inprog = [r for r in ledger["tasks"] if r["status"] == "in-progress"]
    if inprog:
        _die(f"WIP limit {WIP_LIMIT}: {inprog[0]['id']} is already in-progress — "
             f"stop it (or set-status parked/triaged) first")
    # Definition of ready. A row is triaged, estimated, classified, linked and
    # unblocked before a session opens, so the session cannot be spent on work
    # nobody groomed. `ready` prints the same list; validate fails on it.
    reasons = readiness_issues(row, ledger)
    if reasons and not args.force:
        print(f"{row['id']} is not ready to start:", file=sys.stderr)
        for reason in reasons:
            print(f"  - {reason}", file=sys.stderr)
        print(f"  fix the above, or re-run with --force", file=sys.stderr)
        return 1
    if reasons:
        print(f"! {row['id']} started with --force despite: {', '.join(reasons)}")
    row["sessions"].append({"start": now_iso(), "end": None, "measured": True,
                            "note": "", "proof": [], "effort": None})
    row["status"] = "in-progress"
    save(ledger)
    print(f"STARTED {row['id']} · {row['title']}")
    print(f"  status=in-progress  session={row['sessions'][-1]['start']}  "
          f"issue={('#' + str(row['issue'])) if row.get('issue') else 'internal'}")
    print(f"  commits will be stamped: Task: {row['id']}")
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    ledger = load()
    if args.ref:
        row = find_row(ledger, args.ref)
        if row is None:
            _die(f"no task {args.ref}")
    else:
        running = open_session(ledger)
        if not running:
            _die("no open session")
        row = running[0]  # type: ignore[assignment]
    sess = next((s for s in row["sessions"] if not s.get("end")), None)
    if sess is None:
        _die(f"{row['id']} has no open session")
    sess["end"] = now_iso()
    if args.note:
        sess["note"] = args.note
    effort, proof = collect_evidence(sess["start"])
    sess["effort"] = effort
    sess["proof"] = proof
    # The PR this session's commits belong to — resolved from those commits, and
    # attached to the row so `review` means "a real PR is open for this work".
    pr = pr_for_session(sess, row)
    if pr:
        pr_no = int(pr.lstrip("#"))
        if not row.get("pr"):
            row["pr"] = pr_no
        if pr not in sess["proof"]:
            sess["proof"].append(pr)
    minutes = session_minutes(sess)

    if args.to:
        row["status"] = args.to
    elif pr:
        row["status"] = "review"
    else:
        row["status"] = "triaged"
    if row["time_source"] in (None, "none"):
        row["time_source"] = "measured"
    refresh(row)
    save(ledger)
    print(f"STOPPED {row['id']} · {minutes}m · status={row['status']} · "
          f"effort={effort['commits']} commits/{effort['files']} files/"
          f"+{effort['insertions']}/-{effort['deletions']} · proof={proof or '-'}")
    if not pr and not args.to:
        print(f"  no PR found for this session's commits (not guessing from the current "
              f"branch) — open the PR, then: python3 scripts/tasks.py attach-pr {row['id']} <PR#>")

    comment = args.comment
    if comment == "auto":
        comment = "on" if (row.get("issue") and minutes >= 5) else "off"
    if comment == "on" and row.get("issue"):
        body = (f"`{row['id']}` · {minutes}m · {sess['start']} → {sess['end']}\n\n"
                + (f"{sess['note']}\n\n" if sess.get("note") else "")
                + f"commits: {', '.join(proof) or '-'} · PR: {pr or '-'}")
        try:
            gh("issue", "comment", str(row["issue"]), "--body", body, check=False)
            print(f"  commented on #{row['issue']}")
        except (SystemExit, FileNotFoundError):
            print("  ! could not comment on the issue (gh unavailable)")
    return 0


ALLOWED = {
    "backlog": {"triaged", "parked", "wontfix"},
    "triaged": {"in-progress", "blocked", "parked", "wontfix", "backlog", "review"},
    "in-progress": {"review", "blocked", "triaged", "done", "parked"},
    "blocked": {"triaged", "in-progress", "wontfix"},
    "review": {"in-progress", "done", "blocked", "triaged"},
    "done": {"triaged", "in-progress"},
    "parked": {"triaged", "wontfix", "backlog"},
    "wontfix": {"triaged"},
}


def cmd_set_status(args: argparse.Namespace) -> int:
    if args.status not in STATUSES:
        _die(f"unknown status {args.status!r} — one of {', '.join(STATUSES)}")
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    if row["status"] == args.status:
        print(f"{row['id']} is already {args.status}")
        return 0
    if args.status not in ALLOWED[row["status"]]:
        _die(f"{row['id']}: {row['status']} → {args.status} is not a transition "
             f"(allowed: {sorted(ALLOWED[row['status']])})")
    has_open = any(not s.get("end") for s in row["sessions"])
    if args.status == "in-progress" and not has_open:
        _die(f"{row['id']}: in-progress requires an open session — run `start {row['id']}`")
    if args.status != "in-progress" and has_open:
        _die(f"{row['id']}: stop the open session first (`stop {row['id']}`)")
    if args.status == "done" and not (row.get("proof") or row.get("time_source") in ("none", "reconstructed")
                                      or any(s.get("proof") for s in row["sessions"])):
        _die(f"{row['id']}: done requires proof (record a session) or time_source none/reconstructed")
    row["status"] = args.status
    save(ledger)
    print(f"{row['id']}  {args.status}")
    return 0


def cmd_note(args: argparse.Namespace) -> int:
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    row["notes"].append(f"{now_iso()} · {args.text}")
    save(ledger)
    print(f"noted on {row['id']} ({len(row['notes'])} notes)")
    return 0


def cmd_find(args: argparse.Namespace) -> int:
    ledger = load()
    hits = []
    for row in ledger["tasks"]:
        score = max(similarity(args.query, row["title"]),
                    similarity(args.query, row.get("source") or ""),
                    similarity(args.query, " ".join(row.get("notes") or [])))
        if score > 0.05:
            hits.append((score, row))
    hits.sort(key=lambda h: (-h[0], h[1]["id"]))
    payload = [{"id": r["id"], "score": round(s, 3), "status": r["status"],
                "issue": r.get("issue"), "title": r["title"]} for s, r in hits[:10]]
    if not payload:
        _out([], f"no task matches {args.query!r}", args.json)
        return 3
    _out(payload, "\n".join(f"{p['id']}  {p['score']:.2f}  {p['status']:<11} "
                            f"#{p['issue'] if p['issue'] else '-':<6} {p['title']}"
                            for p in payload), args.json)
    return 0


# ── hierarchy verbs: children · tree · reparent ──────────────────────────
def cmd_children(args: argparse.Namespace) -> int:
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    kids = children_map(ledger).get(row["id"], [])
    if not kids:
        print(f"{row['id']} has no children (not decomposed)")
        return 0
    by_id = {r["id"]: r for r in ledger["tasks"]}
    for kid in kids:
        k = by_id[kid]
        issue = f"#{k['issue']}" if k.get("issue") else ("internal" if k.get("internal") else "-")
        print(f"{kid}  {k['status']:<11} est {k['estimate_min']:>5}m  "
              f"spent {k['spent_min']:>4}m  {issue:<9} {k['title'][:56]}")
    n = len(descendants(ledger, row["id"]))
    print(f"{n} descendant(s) · rollup {rollup_minutes(ledger, row['id'])}m spent "
          f"of {rollup_estimate(ledger, row['id'])}m estimated")
    return 0


def cmd_tree(args: argparse.Namespace) -> int:
    ledger = load()
    rows = {r["id"]: r for r in ledger["tasks"]}
    kids = children_map(ledger)
    if args.root:
        root = find_row(ledger, args.root)
        if root is None:
            _die(f"no task {args.root}")
        roots = [root["id"]]
    else:
        roots = [r["id"] for r in ledger["tasks"] if not r.get("parent")]

    def as_node(rid: str, seen: frozenset[str] = frozenset()) -> dict[str, Any]:
        r = rows[rid]
        child_ids = [k for k in kids.get(rid, []) if k not in seen]
        return {"id": rid, "title": r["title"], "status": r["status"],
                "estimate_min": r["estimate_min"], "spent_min": r["spent_min"],
                "rollup_estimate_min": rollup_estimate(ledger, rid),
                "rollup_min": rollup_minutes(ledger, rid),
                "issue": r.get("issue"), "parent": r.get("parent"),
                "children": [as_node(k, seen | {rid}) for k in child_ids]}

    if args.json:
        print(json.dumps([as_node(rid) for rid in roots], indent=2))
        return 0

    lines: list[str] = []

    def walk(rid: str, depth: int, seen: frozenset[str]) -> None:
        r = rows.get(rid)
        if r is None or rid in seen:
            return
        n_kids = [k for k in kids.get(rid, []) if k not in seen]
        roll = f"  rollup {rollup_minutes(ledger, rid)}m" if n_kids else ""
        issue = f"#{r['issue']}" if r.get("issue") else ("internal" if r.get("internal") else "-")
        lines.append(f"{'  ' * depth}{r['id']:<7} {r['status']:<11} "
                     f"est {r['estimate_min']:>5}m spent {r['spent_min']:>4}m{roll}  "
                     f"{issue:<8} {r['title'][:44]}")
        for kid in n_kids:
            walk(kid, depth + 1, seen | {rid})

    for rid in roots:
        walk(rid, 0, frozenset())
    print("\n".join(lines) or "(no tasks)")
    return 0


def cmd_reparent(args: argparse.Namespace) -> int:
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref}")
    if args.detach:
        if not row.get("parent"):
            print(f"{row['id']} is already a root")
            return 0
        row["parent"] = None
        save(ledger)
        print(f"{row['id']} detached" + (f" (was under {args.parent})" if args.parent else "")
              + " — GitHub: gh issue edit <issue> --remove-parent")
        return 0
    if not args.parent:
        _die("pass --parent <T-id> to attach, or --detach")
    target = args.parent.strip().upper()
    if find_row(ledger, target) is None:
        _die(f"parent {target} does not exist")
    if target == row["id"]:
        _die(f"{row['id']} cannot parent itself")
    if target in subtree_ids(ledger, row["id"]):
        _die(f"{target} is a descendant of {row['id']} — reparenting would make a cycle")
    row["parent"] = target
    save(ledger)
    print(f"{row['id']} → parent {target} · "
          f"link on GitHub: python3 scripts/tasks.py gh-sync --relink")
    return 0


# ── pr-metadata: labels · milestone · assignee · project item for a PR ───
# Board `#1 · fewer - file viz` Status options: To triage, Backlog, Ready,
# In progress, In review, Done. Ledger → board: a triaged task is Ready, a
# blocked/parked one is not (Backlog).
STATUS_TO_PROJECT = {"backlog": "Backlog", "triaged": "Ready",
                     "in-progress": "In progress", "blocked": "Backlog",
                     "review": "In review", "parked": "Backlog",
                     "done": "Done", "wontfix": "Done"}


def pr_task_rows(ledger: dict[str, Any], pr_info: dict[str, Any], pr: int) -> list[dict[str, Any]]:
    """Rows that own this PR: `Task: T-###` trailers in its commits (or the
    body), plus any row already stamped `pr: <n>`."""
    by_id = {r["id"]: r for r in ledger["tasks"]}
    ids: set[str] = set()
    for commit in pr_info.get("commits") or []:
        subject = commit.get("messageHeadline") or ""
        body = commit.get("messageBody") or ""
        ids.update(commit_trailers(body, subject))
    for line in (pr_info.get("body") or "").splitlines():
        if re.match(r"^\s*[-*]?\s*Task:\s*", line, flags=re.I):
            ids.update(TASK_RE.findall(line))
    rows = [by_id[i] for i in sorted(ids) if i in by_id]
    for row in ledger["tasks"]:
        if row.get("pr") == pr and row not in rows:
            rows.append(row)
    return rows


def size_option_name(estimate_min: int) -> str:
    """Board Size option for a task: `size:m` → `M` (the board's XS/S/M/L/XL)."""
    return size_label(estimate_min).split(":", 1)[1].upper()


def _gh_project(args: list[str]) -> tuple[int, str]:
    """Run a `gh project …` call and return (exit_code, first-line-of-error).

    stdout is returned separately by callers that need JSON; this exists so a
    failure reports gh's own words instead of a generic hint.
    """
    try:
        r = subprocess.run(["gh", *args], cwd=ROOT, capture_output=True, text=True,
                           stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        return 127, "gh not installed"
    if r.returncode == 0:
        return 0, r.stdout
    first = next((ln.strip() for ln in (r.stderr or r.stdout).splitlines() if ln.strip()), "")
    return r.returncode, first or f"gh exited {r.returncode}"


def _apply_project(number: int, info: dict[str, Any], status: str, estimate: int) -> None:
    """Best effort: add the PR to the board and mirror its Status/Size.

    Every failure prints gh's own error and returns — never raises. If the
    literal owner login cannot be resolved (`unknown owner type`, common with
    a PAT whose owner-type lookup is restricted), retry with `--owner @me`,
    which resolves from the token itself instead of from the login.
    """
    code, out = _gh_project(["project", "item-add", str(number), "--owner", PROJECT_OWNER,
                             "--url", info["url"], "--format", "json"])
    if code != 0 and "unknown owner type" in str(out).lower():
        print(f"project: {PROJECT_OWNER} could not be resolved ({out}) — retrying --owner @me")
        code, out = _gh_project(["project", "item-add", str(number), "--owner", "@me",
                                 "--url", info["url"], "--format", "json"])
    added: dict[str, Any] = {}
    if code == 0:
        try:
            added = json.loads(out)
        except json.JSONDecodeError:
            added = {}
    if not added.get("id"):
        print(f"project: item not added — {out}")
        if "scope" in str(out) or "auth" in str(out).lower():
            print("  hint: PAT needs the classic `project` scope; GH_TOKEN in that job is set "
                  "from secrets.PROJECTS_TOKEN — see .agents/skills/pr/SKILL.md")
        return
    print(f"project: added to {PROJECT_OWNER}/{number}")
    try:
        proj = json.loads(gh("project", "view", str(number), "--owner", PROJECT_OWNER,
                             "--format", "json", check=False))
        fields = json.loads(gh("project", "field-list", str(number), "--owner", PROJECT_OWNER,
                               "--format", "json", check=False))
    except (SystemExit, FileNotFoundError, json.JSONDecodeError):
        print("project: could not read the board's fields — Status not synced")
        return
    status_field = next((f for f in fields.get("fields", [])
                         if (f.get("name") or "").lower() == "status"), None)
    project_id = proj.get("id")
    if not status_field or not project_id:
        print("project: no Status field (or no project id) — left as-is")
        return
    want = STATUS_TO_PROJECT.get(status, "In progress")
    option = next((o for o in status_field.get("options", [])
                   if (o.get("name") or "").lower() == want.lower()), None)
    if not option:
        names = ", ".join(o.get("name", "?") for o in status_field.get("options", []))
        print(f"project: Status option {want!r} not on this board (have: {names})")
    else:
        try:
            gh("project", "item-edit", "--id", added["id"],
               "--field-id", status_field["id"], "--project-id", project_id,
               "--single-select-option-id", option["id"], check=False)
            print(f"project: Status → {option['name']}")
        except (SystemExit, FileNotFoundError):
            print("project: Status sync failed")

    # The board has a Size single-select (XS/S/M/L/XL) — same band as size:*.
    size_field = next((f for f in fields.get("fields", [])
                       if (f.get("name") or "").lower() == "size"), None)
    if size_field:
        want_size = size_option_name(estimate)
        size_option = next((o for o in size_field.get("options", [])
                            if (o.get("name") or "").upper() == want_size), None)
        if size_option:
            try:
                gh("project", "item-edit", "--id", added["id"],
                   "--field-id", size_field["id"], "--project-id", project_id,
                   "--single-select-option-id", size_option["id"], check=False)
                print(f"project: Size → {size_option['name']}")
            except (SystemExit, FileNotFoundError):
                print("project: Size sync failed")
        else:
            print(f"project: Size option {want_size!r} not on this board")


def next_milestone() -> str | None:
    """The open release train we are shipping toward: earliest due date first.
    Used when neither the task row nor its linked issue carries a milestone."""
    try:
        trains = gh_json("api", f"repos/{REPO_SLUG}/milestones?state=open")
    except (SystemExit, FileNotFoundError, json.JSONDecodeError, TypeError):
        return None
    if not trains:
        return None
    dated = [t for t in trains if t.get("due_on")]
    if dated:
        return sorted(dated, key=lambda t: t["due_on"])[0]["title"]
    return trains[0]["title"]


def cmd_pr_metadata(args: argparse.Namespace) -> int:
    pr = args.pr_number
    if not have_gh():
        _die("pr-metadata needs an authenticated gh")
    ledger = load()
    info = gh_json("pr", "view", str(pr), "--json",
                   "number,title,url,state,labels,milestone,assignees,commits,body")
    rows = pr_task_rows(ledger, info, pr)
    if not rows:
        print(f"pr-metadata: PR #{pr} carries no tracked task (no `Task: T-###` trailer "
              f"and no row with pr: {pr}) — nothing derived, nothing guessed "
              f"(see .agents/skills/pr/SKILL.md)")
        return 0

    want = derived_labels(rows)
    current = [l["name"] for l in info.get("labels") or []]
    add = [l for l in want if l not in current]
    drop = [l for l in current
            if (l.startswith("size:") or l.startswith("status:")) and l not in want]

    milestone = next((r.get("milestone") for r in rows if r.get("milestone")), None)
    if milestone is None:
        for row in rows:
            if row.get("issue"):
                try:
                    linked = gh("issue", "view", str(row["issue"]), "--json", "milestone",
                                "--jq", ".milestone.title // \"\"", check=False).strip()
                except (SystemExit, FileNotFoundError):
                    linked = ""
                if linked:
                    milestone = linked
                    break
    if milestone is None and args.milestone:
        milestone = args.milestone
    if milestone is None:
        milestone = next_milestone()
    current_ms = (info.get("milestone") or {}).get("title") if info.get("milestone") else None

    assignee = next((r.get("assignee") for r in rows if r.get("assignee")), DEFAULT_ASSIGNEE)
    have_assignees = [a["login"] for a in info.get("assignees") or []]

    print(f"PR #{pr} · tasks: {', '.join(r['id'] for r in rows)}")
    print(f"  labels    now=[{', '.join(current) or '-'}]")
    print(f"             want={want}")
    print(f"             +{add or '-'}  -{drop or '-'}")
    print(f"  milestone now={current_ms or '-'} → want={milestone or '-'}")
    print(f"  assignee  now=[{', '.join(have_assignees) or '-'}] → want={assignee}")
    project = args.project if args.project is not None else PROJECT_NUMBER
    if getattr(args, "no_project", False):
        print("  project   skipped (--no-project)")
    else:
        print(f"  project   {project or 'not configured'}" +
              ("" if project else " (needs read:project, or flip the board's Auto-add filter to include PRs)"))

    if args.dry_run:
        print("  (dry-run: nothing written)")
        return 0

    cmd = ["pr", "edit", str(pr)]
    for label in add:
        ensure_label(label)          # size:* may not exist yet — create lazily
        cmd += ["--add-label", label]
    for label in drop:
        cmd += ["--remove-label", label]
    if milestone and milestone != current_ms:
        cmd += ["--milestone", milestone]
    if assignee not in have_assignees:
        cmd += ["--add-assignee", assignee]
    if len(cmd) > 3:
        gh(*cmd, check=False)

    stamped = False
    for row in rows:
        if row.get("pr") != pr:
            row["pr"] = pr
            stamped = True
    if stamped and not args.no_write:
        save(ledger)
    elif stamped:
        print("  (--no-write: ledger pr: stamp skipped — CI checkout)")

    status = rows[0].get("status") or "review"
    if args.no_project:
        print("project: skipped (--no-project: labels/milestone/assignee only)")
    elif project is None:
        print("project: skipped — no board configured")
    else:
        _apply_project(project, info, status, int(rows[0]["estimate_min"] or 0))
    print(f"applied: +{add or '-'} -{drop or '-'} milestone={milestone or '-'} "
          f"assignee={assignee} · ledger pr:{pr} written to {len(rows)} row(s)")
    return 0


# ── GitHub helpers: labels, bug payload, adoption ───────────────────────
_LABELS_CACHE: list[str] | None = None


def existing_labels() -> list[str]:
    global _LABELS_CACHE
    if _LABELS_CACHE is None:
        try:
            out = gh("label", "list", "--limit", "200", "--json", "name", "--jq", ".[].name")
            _LABELS_CACHE = [line.strip() for line in out.splitlines() if line.strip()]
        except (SystemExit, FileNotFoundError):
            _LABELS_CACHE = []
    return _LABELS_CACHE


def ensure_label(name: str) -> None:
    if name in existing_labels():
        return
    try:
        gh("label", "create", name, "--color", STATUS_COLOR, check=False)
    except (SystemExit, FileNotFoundError):
        print(f"  ! could not create label {name}")
    _LABELS_CACHE.append(name)


def parse_bug_payload(body: str) -> dict[str, str]:
    """severity/category from the in-app bug report's JSON payload, if present.

    High confidence (the app wrote them, not the reporter), so intake may apply
    the matching labels without asking.
    """
    out: dict[str, str] = {}
    sev = re.search(r'"severity"\s*:\s*"(low|medium|high|critical)"', body)
    if sev:
        out["severity"] = sev.group(1)
    cat = re.search(r'"category"\s*:\s*"([a-z][a-z-]*)"', body)
    if cat:
        out["category"] = cat.group(1)
    return out


def type_labels(rtype: str) -> list[str]:
    return {"fix": ["bug"], "feat": ["enhancement"], "docs": ["documentation"]}.get(rtype, [])


SIZE_LABELS = ("size:xs", "size:s", "size:m", "size:l", "size:xl")


def size_label(estimate_min: int) -> str:
    """Effort band from the task's estimate (xs ≤60m · s ≤240m · m ≤960m ·
    l ≤2400m · xl >2400m) — a single family, shared by issues and PRs."""
    n = int(estimate_min or 0)
    if n <= 60:
        return "size:xs"
    if n <= 240:
        return "size:s"
    if n <= 960:
        return "size:m"
    if n <= 2400:
        return "size:l"
    return "size:xl"


def derived_labels(rows: list[dict[str, Any]]) -> list[str]:
    """Label set for a PR (or issue) derived from its task rows: status label +
    type + category + one size band, unioned and deduped."""
    out: set[str] = set()
    for row in rows:
        out.update(type_labels(row["type"]))
        out.add(f"category:{row['area']}")
        out.add(size_label(row["estimate_min"]))
        status_label = STATUS_LABEL.get(row.get("status") or "")
        if status_label:
            out.add(status_label)
    return sorted(l for l in out if l)


def issue_title(rtype: str, title: str) -> str:
    if rtype == "fix" and not title.startswith("[Bug]"):
        title = f"[Bug] {title}"
    elif rtype == "feat" and not title.startswith("[Feature]"):
        title = f"[Feature] {title}"
    # TO-DO prose can be a whole sentence; the queue wants a line, not a paragraph.
    if len(title) > 120:
        title = title[:116].rsplit(" ", 1)[0] + "…"
    return title


def strip_issue_prefix(title: str) -> str:
    return re.sub(r"^\s*\[(Bug|Feature)\]\s*", "", title)


def create_issue(*, title: str, body: str, labels: list[str]) -> int:
    for label in labels:
        ensure_label(label)
    fd, tmp = tempfile.mkstemp(suffix=".md")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(body)
        args = ["issue", "create", "--title", title]
        for label in labels:
            args += ["--label", label]
        args += ["--body-file", tmp]
        out = gh(*args, check=False)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass
    url = out.strip().splitlines()[-1] if out.strip() else ""
    m = re.search(r"/(\d+)\s*$", url)
    if not m:
        _die(f"issue create failed: {url}")
    return int(m.group(1))


def adopt_issue(ledger: dict[str, Any], issue: dict[str, Any], *, status: str | None = None) -> dict[str, Any]:
    """GitHub issue with no ledger row → a row that describes it, inventing nothing."""
    labels = [l["name"] for l in issue.get("labels") or []]
    rtype = "fix" if "bug" in labels else ("feat" if "enhancement" in labels else "task")
    area = next((l.split(":", 1)[1] for l in labels if l.startswith("category:")), "other")
    closed = issue.get("state") == "CLOSED"
    row = new_row(
        title=strip_issue_prefix(issue["title"]), rtype=rtype, area=area,
        status=status or ("done" if closed else "triaged"), issue=issue["number"],
        source=f"gh#{issue['number']}", time_source="none" if closed else None,
        reporter=(issue.get("author") or {}).get("login"),
        created_at=issue.get("createdAt") or now_iso(),
        notes=[f"{now_iso()} · adopted at intake from GitHub ({issue.get('state', '?').lower()})"],
    )
    row["id"] = next_id(ledger)
    ledger["tasks"].append(row)
    return row


# ── track: find-or-create, then start ───────────────────────────────────
def cmd_track(args: argparse.Namespace) -> int:
    ledger = load()
    rtype = "fix" if args.type in ("bug", "fix") else args.type
    title = strip_issue_prefix(args.title)
    if not args.title.strip():
        _die("track requires a description")
    parent_id = getattr(args, "parent", None)
    if parent_id:
        parent_id = parent_id.strip().upper()
        if find_row(ledger, parent_id) is None:
            _die(f"parent {parent_id} does not exist")

    def _apply_parent(row: dict[str, Any]) -> None:
        if parent_id and row.get("parent") != parent_id:
            if parent_id in subtree_ids(ledger, row["id"]):
                _die(f"{parent_id} is a descendant of {row['id']} — would make a cycle")
            row["parent"] = parent_id

    # Explicit refs short-circuit the search.
    if args.issue is not None:
        return _attach_and_maybe_start(ledger, f"{args.issue}", args)
    if args.id:
        return _attach_and_maybe_start(ledger, args.id, args)

    rows = [(similarity(title, r["title"]), r) for r in ledger["tasks"]]
    # A row also "owns" its notes/source — dedupe should find work already logged.
    rows = [(max(score, similarity(title, " ".join(r.get("notes") or [])),
                 similarity(title, r.get("source") or "")), r) for score, r in rows]
    rows.sort(key=lambda x: -x[0])
    issues: list[dict[str, Any]] = []
    issue_hits: list[tuple[float, dict[str, Any]]] = []
    if have_gh() and not args.local:
        try:
            issues = gh_json("issue", "list", "--state", "all", "--limit", "200",
                             "--json", "number,title,body,state,labels")
            issue_hits = sorted(
                ((max(similarity(title, i["title"]),
                      similarity(title, (i.get("body") or "")[:1200])), i) for i in issues),
                key=lambda x: -x[0])
        except SystemExit:
            issues, issue_hits = [], []

    best_row = rows[0] if rows else (0.0, None)
    best_issue = issue_hits[0] if issue_hits else (0.0, None)
    # An existing row linked to the best issue wins: it is already tracked.
    if best_issue[1] and find_row(ledger, str(best_issue[1]["number"])):
        linked = find_row(ledger, str(best_issue[1]["number"]))
        best_row = (max(best_row[0], best_issue[0]), linked)

    best_score = max(best_row[0], best_issue[0])
    decision, why = ("ask", "")
    if best_score >= 0.75:
        decision = "attach"
    elif best_score >= 0.45:
        decision = "ask"
    else:
        decision = "create"
    if args.new:
        decision, why = "create", "--new requested"

    print(f"QUERY   {args.type} · {title!r}")
    for score, row in rows[:3]:
        if row:
            print(f"CANDID  row {row['id']} {score:.2f} {row['status']} {row['title'][:70]}")
    for score, issue in issue_hits[:3]:
        if issue:
            print(f"CANDID  issue #{issue['number']} {score:.2f} {issue['state']} {issue['title'][:70]}")

    if decision == "ask":
        print(f"DECISION ask — best candidate {best_score:.2f} is in the ambiguous band "
              f"(0.45–0.75). Pick a candidate or rerun with --new.")
        return 3

    if decision == "create":
        labels = type_labels(rtype) + ["status:triaged"]
        if args.area:
            labels.append(f"category:{args.area}")
        if args.severity:
            labels.append(f"severity:{args.severity}")
        full_title = issue_title(rtype, title)
        body = args.body or f"{title}\n\n_Tracked by `tasks.py track`._\n"
        if args.dry_run:
            print(f"DECISION create (best candidate {best_score:.2f} < 0.75)")
            print(f"  would create issue {full_title!r} labels={labels}")
            print(f"  would create row status=triaged type={rtype} "
                  f"estimate={ESTIMATE_DEFAULT.get(rtype, 120)}m, then start the session"
                  + (f" · parent {parent_id}" if parent_id else ""))
            return 0
        number = create_issue(title=full_title, body=body, labels=labels)
        row = new_row(title=title, rtype=rtype, area=args.area or "other", issue=number,
                      source=f"gh#{number}", estimate_basis="type-default", parent=parent_id)
        row["id"] = next_id(ledger)
        ledger["tasks"].append(row)
        save(ledger)
        print(f"DECISION create → #{number} · {row['id']} (no candidate ≥0.75; "
              f"best {best_score:.2f})"
              + (f" · parent {parent_id}" if parent_id else ""))
        return 0 if args.no_start else _start_row(ledger, row)

    # attach
    row = best_row[1]
    issue = best_issue[1]
    if row:
        print(f"DECISION attach → {row['id']} "
              f"({'#' + str(row['issue']) if row.get('issue') else 'internal'}, {best_score:.2f})")
        if args.dry_run:
            print("  (dry-run: no session started)")
            return 0
        _apply_parent(row)
        save(ledger)
        return 0 if args.no_start else _start_row(ledger, row)
    if issue:
        if args.dry_run:
            print(f"DECISION attach → #{issue['number']} ({best_score:.2f}) and adopt a new row "
                  f"(dry-run: nothing written)")
            return 0
        row = adopt_issue(ledger, issue, status="triaged")
        _apply_parent(row)
        save(ledger)
        print(f"DECISION attach → #{issue['number']} ({best_score:.2f}) adopted as {row['id']}"
              + (f" · parent {parent_id}" if parent_id else ""))
        return 0 if args.no_start else _start_row(ledger, row)
    _die("internal: attach decided but nothing to attach to")
    return 1


def _start_row(ledger: dict[str, Any], row: dict[str, Any]) -> int:
    ns = argparse.Namespace(ref=row["id"])
    return cmd_start(ns)


def _attach_and_maybe_start(ledger: dict[str, Any], ref: str, args: argparse.Namespace) -> int:
    row = find_row(ledger, ref)
    if row is None and re.fullmatch(r"\d+", ref):
        if args.dry_run:
            print(f"DECISION attach → #{ref} (dry-run: would adopt a new row, no session)")
            return 0
        issues = gh_json("issue", "list", "--state", "all", "--limit", "200",
                         "--json", "number,title,state,labels,author,createdAt")
        match = next((i for i in issues if str(i["number"]) == ref), None)
        if match is None:
            _die(f"no GitHub issue #{ref}")
        row = adopt_issue(ledger, match)
        save(ledger)
        print(f"attached → #{ref} adopted as {row['id']}")
    elif row is None:
        _die(f"no task {ref}")
    else:
        print(f"attached → {row['id']} ({'#' + str(row['issue']) if row.get('issue') else 'internal'})")
    if args.dry_run:
        print("  (dry-run: no session started)")
        return 0
    return 0 if args.no_start else _start_row(ledger, row)  # type: ignore[arg-type]


def cmd_attach(args: argparse.Namespace) -> int:
    ledger = load()
    args.dry_run = False
    args.no_start = not args.start
    return _attach_and_maybe_start(ledger, args.ref, args)


# ── intake: GitHub issues with no ledger row ────────────────────────────
def cmd_intake(args: argparse.Namespace) -> int:
    ledger = load()
    have = {r["issue"] for r in ledger["tasks"] if r.get("issue")}
    issues = gh_json("issue", "list", "--state", args.state, "--limit", "200",
                     "--json", "number,title,body,state,labels,milestone,author,createdAt")
    missing = [i for i in issues if i["number"] not in have]
    if not missing:
        print(f"all {len(issues)} GitHub issues are tracked")
        return 0
    adopted: list[str] = []
    proposals: list[str] = []
    newly: list[dict[str, Any]] = []
    hierarchy: list[str] = []
    for issue in missing:
        payload = parse_bug_payload(issue.get("body") or "")
        labels = [l["name"] for l in issue.get("labels") or []]
        target_status = "done" if issue.get("state") == "CLOSED" else "triaged"
        applied: list[str] = []
        if payload.get("severity"):
            applied.append(f"severity:{payload['severity']}")
        if payload.get("category"):
            applied.append(f"category:{payload['category']}")
        if STATUS_LABEL[target_status]:
            applied.append(STATUS_LABEL[target_status])
        applied.append(size_label(ESTIMATE_DEFAULT.get(rtype, 120)))
        if args.dry_run:
            adopted.append(f"#{issue['number']}({target_status})")
            print(f"would adopt #{issue['number']} → status={target_status} "
                  f"title={strip_issue_prefix(issue['title'])[:60]!r}")
            if applied:
                print(f"  would apply labels: {applied} (from in-app payload {payload or '-'} + status)")
            elif target_status != "done" and not any(l.startswith("severity:") for l in labels):
                print(f"  PROPOSE labels from prose — ask the user (no bug payload in body)")
            continue
        row = adopt_issue(ledger, issue, status=target_status)
        if payload.get("category"):
            row["area"] = payload["category"]
        for label in applied:
            ensure_label(label)
        if applied:
            try:
                args_ = ["issue", "edit", str(issue["number"])]
                for label in applied:
                    args_ += ["--add-label", label]
                gh(*args_, check=False)
            except (SystemExit, FileNotFoundError):
                print(f"  ! could not label #{issue['number']}")
        elif target_status != "done" and not any(l.startswith("severity:") for l in labels):
            proposals.append(f"#{issue['number']} has no bug payload — propose labels from prose "
                             f"(title: {strip_issue_prefix(issue['title'])[:60]})")
        adopted.append(f"{row['id']}←#{issue['number']}({target_status})")
        newly.append(row)
    if not args.dry_run:
        save(ledger)
    # Second pass: inherit hierarchy from GitHub (parents are adopted above).
    if not args.dry_run and newly:
        for row in newly:
            number = row.get("issue")
            if not number:
                continue
            try:
                gh_parent = gh("issue", "view", str(number), "--json", "parent",
                               "--jq", ".parent.number // 0", check=False).strip() or "0"
            except (SystemExit, FileNotFoundError):
                continue
            if gh_parent == "0":
                continue
            parent_row = find_row(ledger, gh_parent)
            if parent_row is None:
                proposals.append(f"#{number} is a sub-issue of #{gh_parent}, which is not "
                                 f"tracked yet — run intake again to adopt the parent")
            else:
                row["parent"] = parent_row["id"]
                hierarchy.append(f"{row['id']}←{parent_row['id']}")
        if hierarchy:
            save(ledger)
    verb = "would adopt" if args.dry_run else "adopted"
    print(f"{verb} {len(missing)} issues: {', '.join(adopted) or '-'}")
    if hierarchy:
        print(f"hierarchy linked: {', '.join(hierarchy)}")
    for line in proposals:
        print(f"PROPOSE  {line}")
    return 0


# ── import-todo: TO-DO.md → ledger rows (all triaged) ──────────────────
_BLOCK_ALIASES = (
    ("licensing", "Licensing"),
    ("naming parser", "Frame-sequence collapsing"),
    ("naming parse", "Frame-sequence collapsing"),
    ("rule engine", "Rule / validation engine"),
    ("symlinks", "Symlink support"),
    ("diff v2", "Diff v2"),
    ("headless cli", "Headless CLI"),
    ("preflight", "Preflight"),
)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def todo_items(path: str = TODO_MD) -> list[dict[str, Any]]:
    """Parse the outstanding work out of TO-DO.md (Housekeeping + Studio tiers)."""
    items: list[dict[str, Any]] = []
    studio = housekeeping = False
    tier: int | None = None
    current: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal current
        if current:
            body = "\n".join(current.pop("body"))
            current["body"] = body
            items.append(current)
            current = None

    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("# "):
            flush()
            studio = line.startswith("# Studio & Pipeline Readiness")
            housekeeping = False
            tier = None
            continue
        if line.startswith("## "):
            flush()
            housekeeping = "Housekeeping" in line
            m = re.search(r"Tier (\d)", line)
            tier = int(m.group(1)) if m else None
            continue
        if line.startswith("### ") and studio:
            flush()
            current = {"title": line[4:].strip(), "tier": tier, "body": []}
            continue
        if line.startswith("---"):
            flush()
            continue
        if current is not None and (not line.strip() or not line.startswith("#")):
            current["body"].append(line)
            continue
        if housekeeping and re.match(r"^- \[ \] ", line):
            title = re.sub(r"^- \[ \] ", "", line)
            title = re.sub(r"\s*·\s*.*$", "", title).strip()
            items.append({"title": title, "tier": None, "type": "docs", "area": "blog",
                          "source": f"TO-DO.md#{_slug(title)}", "body": line})
    flush()
    for item in items:
        item.setdefault("type", "feat")
        item.setdefault("source", f"TO-DO.md#{_slug(item['title'])}")
        body = (item.get("body") or "").lower()
        if "licensing" in item["title"].lower() or "strategic blocker" in item["title"].lower():
            item["type"] = "task"
        if not item.get("area"):
            item["area"] = _area_for(item["title"] + " " + body[:200])
    # blocked_by: resolve the doc's own "Blocked by:" prose back to item titles
    titles = [i["title"] for i in items]
    for item in items:
        block = ""
        for raw in str(item.get("body") or "").splitlines():
            if raw.strip().lower().startswith("**blocked by:"):
                block += " " + raw.lower()
        if not block:
            item["blocked_by"] = []
            continue
        linked: list[str] = []
        for alias, title in _BLOCK_ALIASES:
            if alias in block and title.lower() in " ".join(t.lower() for t in titles):
                match = next(t for t in titles if t.lower().startswith(title.lower()[:18]))
                if match != item["title"] and match not in linked:
                    linked.append(match)
        item["blocked_by"] = linked
    return items


def _area_for(text: str) -> str:
    text = text.lower()
    # Most specific first — "Headless CLI" also mentions diff/import below.
    for needle, area in (("licens", "other"), ("plugin", "other"), ("preflight", "other"),
                         ("rule", "other"), ("multi-root", "layout"),
                         ("frame", "other"), ("taxonomy", "other"), ("post", "blog"),
                         ("blog", "blog"), ("snapshot", "import"), ("symlink", "import"),
                         ("depth", "import"), ("profile", "import"), ("import", "import"),
                         ("diff", "import")):
        if needle in text:
            return area
    # "cli" only as its own word: "cycle"/"circular" in walk code must not hit it.
    if re.search(r"\bcli\b", text):
        return "other"
    return "other"


def todo_section(title: str, path: str = TODO_MD) -> str:
    """The `### <title>` block text (used as the issue body on gh-sync)."""
    lines = open(path, encoding="utf-8").read().splitlines()
    start = next((i for i, l in enumerate(lines) if l.strip() == f"### {title}"), None)
    if start is None:
        return ""
    out: list[str] = []
    for line in lines[start + 1:]:
        if line.startswith(("### ", "## ", "# ", "---")):
            break
        out.append(line)
    return "\n".join(out).strip()


def cmd_import_todo(args: argparse.Namespace) -> int:
    ledger = load()
    known = {r.get("source") for r in ledger["tasks"]}
    items = [i for i in todo_items(args.path) if i["source"] not in known]
    if not items:
        print("nothing to import — every TO-DO.md item is already tracked")
        return 0
    staged: list[dict[str, Any]] = []
    for item in items:
        est = TIER_ESTIMATE[item["tier"]] if item.get("tier") is not None else 120
        row = new_row(
            title=item["title"], rtype=item.get("type", "feat"), area=item.get("area", "other"),
            status="triaged", tier=item.get("tier"), estimate_min=est,
            estimate_basis="todo-tier" if item.get("tier") is not None else "todo-item",
            source=item["source"], internal=False, blocked_by=[],
        )
        staged.append((row, item))
    if args.dry_run:
        for row, item in staged:
            print(f"would add {row['title'][:70]!r} tier={row['tier']} "
                  f"estimate={row['estimate_min']}m area={row['area']}")
        return 0
    title_to_id: dict[str, str] = {}
    for row, item in staged:
        row["id"] = next_id(ledger)
        title_to_id[item["title"]] = row["id"]
        ledger["tasks"].append(row)
    for row, item in staged:
        row["blocked_by"] = [title_to_id[t] for t in item.get("blocked_by") or [] if t in title_to_id]
    save(ledger)
    print(f"imported {len(staged)} items from {os.path.basename(args.path)} "
          f"→ all status=triaged")
    for row, _ in staged:
        print(f"  {row['id']} tier={row['tier']} {row['estimate_min']}m "
              f"blocked_by={row['blocked_by'] or '-'} {row['title'][:60]}")
    return 0


# ── gh-sync: ledger → GitHub (create missing, mirror status labels) ─────
def _issue_labels(number: int) -> list[str]:
    out = gh("issue", "view", str(number), "--json", "labels", "--jq", ".labels[].name", check=False)
    return [line.strip() for line in out.splitlines() if line.strip()]


def _managed_labels(labels: list[str]) -> list[str]:
    """The label families gh-sync/doctor own: status + size (+ the wontfix flag)."""
    return [l for l in labels if l.startswith("status:") or l.startswith("size:") or l == "wontfix"]


def cmd_gh_sync(args: argparse.Namespace) -> int:
    ledger = load()
    created: list[str] = []
    relabelled: list[str] = []
    if not args.status_only:
        for row in ledger["tasks"]:
            if row.get("issue") or row.get("internal"):
                continue
            labels = type_labels(row["type"])
            labels.append(STATUS_LABEL["triaged"] or "status:triaged")
            labels.append(f"category:{row['area']}")
            labels.append(size_label(row["estimate_min"]))
            section = todo_section(row["title"]) if str(row.get("source", "")).startswith("TO-DO.md#") else ""
            body = (section + "\n\n" if section else "") + (
                f"<!-- task:{row['id']} -->\n\n"
                f"Adopted from `{row.get('source') or 'TO-DO.md'}` — tracked in "
                f"`TASKS.yaml` as `{row['id']}`. Work is logged against that row "
                f"(`python3 scripts/tasks.py start {row['id']}`).")
            if args.dry_run:
                print(f"would create issue {issue_title(row['type'], row['title'])!r} "
                      f"labels={labels} for {row['id']}")
                continue
            number = create_issue(title=issue_title(row["type"], row["title"]), body=body, labels=labels)
            row["issue"] = number
            created.append(f"{row['id']}→#{number}")
        if created:
            save(ledger)

    by_id = {r["id"]: r for r in ledger["tasks"]}
    linked: list[str] = []
    for row in ledger["tasks"]:
        number = row.get("issue")
        if not number:
            continue
        target = STATUS_LABEL.get(row["status"])
        try:
            current = _issue_labels(int(number))
        except (SystemExit, FileNotFoundError):
            print("  ! gh unavailable — label mirror skipped")
            break

        # Sub-issue link parity: ledger parent ↔ GitHub parent.
        parent_row = by_id.get(row.get("parent") or "")
        want_parent = str(parent_row["issue"]) if (parent_row and parent_row.get("issue")) else "0"
        try:
            gh_parent = gh("issue", "view", str(number), "--json", "parent",
                           "--jq", ".parent.number // 0", check=False).strip() or "0"
        except (SystemExit, FileNotFoundError):
            gh_parent = None
        if gh_parent is not None and gh_parent != want_parent:
            if want_parent != "0":
                cmd_args = ["issue", "edit", str(number), "--parent", want_parent]
                linked.append(f"#{number}→sub-of-#{want_parent}")
            elif args.relink:
                cmd_args = ["issue", "edit", str(number), "--remove-parent"]
                linked.append(f"#{number}→unlinked")
            else:
                cmd_args = []
            if cmd_args:
                if args.dry_run:
                    print(f"would {' '.join(cmd_args)} (ledger parent: {row.get('parent') or 'root'})")
                else:
                    gh(*cmd_args, check=False)

        wanted = [l for l in (([target] if target else []) + [size_label(row["estimate_min"])]) if l]
        stale = [l for l in _managed_labels(current) if l not in wanted]
        add = [l for l in wanted if l not in current]
        if not add and not stale:
            continue
        relabelled.append(f"#{number}→{target or '(none)'}")
        if args.dry_run:
            print(f"would relabel #{number}: +{add or '-'} -{stale or '-'} (status={row['status']})")
            continue
        args_ = ["issue", "edit", str(number)]
        for label in add:
            ensure_label(label)
            args_ += ["--add-label", label]
        for label in stale:
            args_ += ["--remove-label", label]
        gh(*args_, check=False)
    if args.dry_run:
        print(f"dry-run: created {len(created)}, relabelled {len(relabelled)}, "
              f"sub-issue links {len(linked)}")
    else:
        print(f"gh-sync: created {created or '-'} | relabelled {relabelled or '-'} | "
              f"sub-issues {linked or '-'}")
    return 0


# ── reconcile: GitHub state → ledger status ─────────────────────────────
def _linked_prs(number: int) -> list[dict[str, Any]]:
    try:
        prs = gh_json("pr", "list", "--state", "all", "--limit", "20",
                      "--search", f"{number} in:body", "--json", "number,state,mergedAt,title")
    except (SystemExit, FileNotFoundError):
        return []
    return [p for p in prs if f"#{number}" in p.get("title", "") or p.get("mergedAt")
            or "Fixes" in p.get("title", "")]


def reconcile_plan(ledger: dict[str, Any]) -> list[tuple[dict[str, Any], str, str]]:
    plan = []
    for row in ledger["tasks"]:
        # An open session means the work is live — never auto-close it, even if
        # the PR it references has merged (it may be carried into a follow-up).
        if any(not s.get("end") for s in row.get("sessions") or []):
            continue
        pr_no = row.get("pr")
        if pr_no and row["status"] in ("review", "in-progress"):
            try:
                pr_state = gh("pr", "view", str(pr_no), "--json", "state",
                              "--jq", ".state", check=False).strip()
            except (SystemExit, FileNotFoundError):
                pr_state = ""
            if pr_state == "MERGED":
                plan.append((row, "done", f"PR #{pr_no} merged"))
                continue
        number = row.get("issue")
        if not number:
            continue
        try:
            state = gh("issue", "view", str(number), "--json", "state", "--jq", ".state",
                       check=False).strip()
        except (SystemExit, FileNotFoundError):
            continue
        prs = _linked_prs(int(number))
        merged = any(p.get("mergedAt") for p in prs)
        open_pr = any(p.get("state") == "OPEN" for p in prs)
        if row["status"] in ("in-progress", "review") and (state == "CLOSED" or merged):
            plan.append((row, "done", f"#{number} {'merged' if merged else 'closed'}"))
        elif row["status"] == "done" and state == "OPEN":
            plan.append((row, "triaged", f"#{number} reopened"))
        elif row["status"] == "review" and state == "OPEN" and not open_pr and not merged:
            plan.append((row, "triaged", f"#{number} open, no PR"))
    return plan


def cmd_reconcile(args: argparse.Namespace) -> int:
    ledger = load()
    plan = reconcile_plan(ledger)
    if not plan:
        print("reconcile: ledger matches GitHub state")
        return 0
    for row, new_status, why in plan:
        print(f"{'would set' if args.dry_run else 'set'} {row['id']} → {new_status} ({why})")
        if args.dry_run or not args.apply:
            continue
        row["status"] = new_status
    if args.apply and not args.dry_run:
        save(ledger)
    elif not args.apply:
        print("(dry-run of the plan — pass --apply to write)")
    return 0


# ── doctor: bidirectional drift check (needs gh) ────────────────────────
def cmd_doctor(args: argparse.Namespace) -> int:
    ledger = load()
    problems: list[str] = []
    rows = {r.get("issue"): r for r in ledger["tasks"] if r.get("issue")}
    by_id = {r["id"]: r for r in ledger["tasks"]}
    if not have_gh():
        _die("doctor needs an authenticated gh (gh auth status failed)")
    issues = gh_json("issue", "list", "--state", "all", "--limit", "200",
                     "--json", "number,title,state,labels")
    for issue in issues:
        row = rows.get(issue["number"])
        if row is None:
            problems.append(f"open/closed issue #{issue['number']} has no ledger row "
                            f"(run: python3 scripts/tasks.py intake)")
            continue
        target = STATUS_LABEL.get(row["status"])
        have = set(_managed_labels([l["name"] for l in issue.get("labels") or []]))
        want = {l for l in ([target] if target else []) + [size_label(row["estimate_min"])] if l}
        if have != want:
            problems.append(f"{row['id']} #{issue['number']}: managed labels {sorted(have)} != "
                            f"{sorted(want)} (run: python3 scripts/tasks.py gh-sync)")
        if issue["state"] == "CLOSED" and row["status"] not in ("done", "wontfix"):
            problems.append(f"{row['id']} #{issue['number']} closed on GitHub but status={row['status']} "
                            f"(run: python3 scripts/tasks.py reconcile --apply)")
        # Sub-issue parity, both directions: GitHub must agree with the ledger.
        parent_id = row.get("parent")
        try:
            gh_parent = gh("issue", "view", str(issue["number"]), "--json", "parent",
                           "--jq", ".parent.number // 0", check=False).strip() or "0"
        except (SystemExit, FileNotFoundError):
            gh_parent = None
        if gh_parent is None:
            pass
        elif parent_id and parent_id in by_id and by_id[parent_id].get("issue"):
            if gh_parent != str(by_id[parent_id]["issue"]):
                problems.append(
                    f"{row['id']} #{issue['number']}: GitHub parent is #{gh_parent}, "
                    f"ledger says {parent_id}→#{by_id[parent_id]['issue']} "
                    f"(run: python3 scripts/tasks.py gh-sync)")
        elif not parent_id and gh_parent != "0":
            problems.append(
                f"{row['id']} #{issue['number']}: sub-issue of #{gh_parent} on GitHub but "
                f"the ledger has no parent (run: intake to adopt it, or gh-sync --relink "
                f"to unlink)")
    for row in ledger["tasks"]:
        if not row.get("issue") and not row.get("internal"):
            problems.append(f"{row['id']} has no issue and is not internal (run: gh-sync)")
        if row.get("parent") and row["parent"] not in by_id:
            problems.append(f"{row['id']} points at unknown parent {row['parent']}")
        if row.get("issue") and row["issue"] not in {i["number"] for i in issues}:
            problems.append(f"{row['id']} references #{row['issue']}, which does not exist")
    payload = {"problems": problems, "count": len(problems)}
    if args.json:
        print(json.dumps(payload, indent=2))
    elif problems:
        print("\n".join(f"DRIFT  {p}" for p in problems))
        print(f"{len(problems)} problem(s)")
    else:
        print("doctor: ledger and GitHub agree (1:1, labels, states)")
    return 1 if problems else 0


# ── report ──────────────────────────────────────────────────────────────
def cmd_report(args: argparse.Namespace) -> int:
    ledger = load()
    if getattr(args, "tree", False):
        return cmd_tree(argparse.Namespace(root=None, json=args.json))
    rows = ledger["tasks"]
    if args.since:
        cut = parse_iso(args.since)
        rows = [r for r in rows if any(s.get("start") and parse_iso(s["start"]) >= cut
                                       for s in r["sessions"])]
    order = {s: i for i, s in enumerate(STATUSES)}
    rows = sorted(rows, key=lambda r: (order.get(r["status"], 99), r["id"]))
    total_est = sum(int(r["estimate_min"] or 0) for r in rows)
    total_spent = sum(int(r["spent_min"] or 0) for r in rows)
    if args.json:
        print(json.dumps([{k: r.get(k) for k in ("id", "status", "title", "issue", "parent",
                                                  "estimate_min", "spent_min", "session_count",
                                                  "source")} for r in rows],
                         indent=2))
        return 0
    lines = [f"{'id':<7} {'status':<12} {'est':>6} {'spent':>7} {'sess':>4}  {'issue':<7} title"]
    lines.append("-" * 110)
    for r in rows:
        lines.append(f"{r['id']:<7} {r['status']:<12} {r['estimate_min']:>6} "
                     f"{r['spent_min']:>6}m {r['session_count']:>4}  "
                     f"{'#' + str(r['issue']) if r.get('issue') else 'internal':<7} {r['title'][:56]}")
    lines.append("-" * 110)
    pct = (100 * total_spent / total_est) if total_est else 0
    lines.append(f"tasks={len(rows)}  estimate={total_est}m  spent={total_spent}m "
                 f"({pct:.1f}% of estimate)")
    print("\n".join(lines))
    return 0


# ── validate: the structural gate CI runs on every PR ───────────────────
def _valid_iso(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        parse_iso(value)
        return True
    except ValueError:
        return False


def run_validate(path: str = LEDGER) -> tuple[int, int]:
    """Return (hard_failures, warnings); prints a PASS/FAIL/WARN line each."""
    hard, soft = 0, 0

    def fail(msg: str) -> None:
        nonlocal hard
        hard += 1
        print(f"FAIL  {msg}")

    def warn(msg: str) -> None:
        nonlocal soft
        soft += 1
        print(f"WARN  {msg}")

    def ok(msg: str) -> None:
        print(f"PASS  {msg}")

    if not os.path.isfile(path):
        fail(f"{path} not found")
        return hard, soft
    text = open(path, encoding="utf-8").read()
    try:
        ledger = parse_ledger(text)
    except SystemExit:
        fail(f"{path} does not parse (see the ERROR above)")
        return hard, soft

    if emit_ledger(ledger) == text:
        ok("canonical form (round-trips through the emitter)")
    else:
        fail(f"{os.path.basename(path)} is not canonical — run `python3 scripts/tasks.py fmt`")

    rows = ledger["tasks"]
    if not rows:
        fail("ledger has no tasks")
        return hard, soft

    ids = [r.get("id") for r in rows]
    if len(ids) != len(set(ids)):
        fail(f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}")
    else:
        ok(f"{len(ids)} unique ids")
    bad_ids = [i for i in ids if not (isinstance(i, str) and TASK_RE.fullmatch(i))]
    if bad_ids:
        fail(f"id format (want T-###): {bad_ids}")
    nums = [int(i[2:]) for i in ids if isinstance(i, str) and TASK_RE.fullmatch(i)]
    if nums and nums != sorted(nums):
        warn("ids are not ascending")

    seen_issues: dict[Any, str] = {}
    for row in rows:
        rid = row.get("id")
        status = row.get("status")
        if status not in STATUSES:
            fail(f"{rid}: status {status!r} not in {STATUSES}")
        if row.get("type") not in TYPES:
            fail(f"{rid}: type {row.get('type')!r} not in {TYPES}")
        est = row.get("estimate_min")
        if not isinstance(est, int) or est <= 0:
            fail(f"{rid}: estimate_min must be a positive integer, got {est!r}")
        if not isinstance(row.get("estimate_basis"), str) or not row.get("estimate_basis"):
            fail(f"{rid}: estimate_basis missing")
        if not _valid_iso(row.get("created_at")):
            fail(f"{rid}: created_at is not an ISO timestamp: {row.get('created_at')!r}")
        if row.get("issue") is None and not row.get("internal"):
            fail(f"{rid}: no issue and not internal — link it or mark internal: true")
        # Definition of ready: a triaged row must be startable. Milestones are
        # read from GitHub, so skip that leg when gh is unavailable (an offline
        # validate still catches the ledger-only reasons).
        if status == "triaged":
            reasons = readiness_issues(row, ledger,
                                       check_milestone=have_gh() and path == LEDGER)
            if reasons:
                fail(f"{rid}: triaged but not ready to start — " + "; ".join(reasons))
        if status == "blocked":
            rows_by_id = {r["id"]: r for r in rows}
            stale = [d for d in (row.get("blocked_by") or [])
                     if d in rows_by_id and rows_by_id[d].get("status") in ("done", "wontfix")]
            if stale and len(stale) == len(row.get("blocked_by") or []):
                warn(f"{rid}: blocked but every blocker is closed ({', '.join(stale)}) — "
                     f"re-triage it")
        if row.get("issue") is not None:
            number = row["issue"]
            if not isinstance(number, int):
                fail(f"{rid}: issue must be an int, got {number!r}")
            elif number in seen_issues:
                fail(f"{rid} and {seen_issues[number]} both reference #{number} (one task per issue)")
            else:
                seen_issues[number] = rid
        if not isinstance(row.get("title"), str) or not row.get("title"):
            fail(f"{rid}: title missing")
        assignee = row.get("assignee")
        if not isinstance(assignee, str) or not assignee.strip():
            fail(f"{rid}: assignee missing (default {DEFAULT_ASSIGNEE} — "
                 f"run `python3 scripts/tasks.py fmt` to backfill)")
        pr_no = row.get("pr")
        if pr_no is not None and not isinstance(pr_no, int):
            fail(f"{rid}: pr must be an integer or null, got {pr_no!r}")
        elif pr_no is not None and row.get("status") not in ("review", "done"):
            warn(f"{rid}: references PR #{pr_no} but status={row.get('status')} "
                 f"(stop moves it to review; reconcile closes it once the PR merges)")
        if not isinstance(row.get("notes"), list):
            fail(f"{rid}: notes must be a list")

    # blocked_by: exists, no self, acyclic
    by_id = {r["id"]: r for r in rows}
    for row in rows:
        for dep in row.get("blocked_by") or []:
            if dep not in by_id:
                fail(f"{row['id']}: blocked_by {dep} does not exist")
            elif dep == row["id"]:
                fail(f"{row['id']}: blocks itself")
    def _cycle(rid: str, stack: tuple[str, ...]) -> bool:
        if rid in stack:
            return True
        node = by_id.get(rid)
        return any(_cycle(d, stack + (rid,)) for d in (node or {}).get("blocked_by") or [])
    for rid in by_id:
        if _cycle(rid, ()):
            fail(f"{rid}: blocked_by cycle")
            break

    # hierarchy: parent exists, no self, no cycles, coherent parent/child states
    children: dict[str, list[str]] = {}
    for row in rows:
        parent = row.get("parent")
        if parent is None:
            continue
        if parent == row["id"]:
            fail(f"{row['id']}: is its own parent")
            continue
        if parent not in by_id:
            fail(f"{row['id']}: parent {parent} does not exist")
            continue
        children.setdefault(parent, []).append(row["id"])

    def _parent_chain_ok(rid: str, seen: tuple[str, ...]) -> bool:
        node = by_id.get(rid)
        parent = (node or {}).get("parent")
        if parent is None:
            return True
        if parent == rid or parent in seen:
            return False
        return _parent_chain_ok(parent, (*seen, rid))

    for rid in by_id:
        if not _parent_chain_ok(rid, ()):
            fail(f"{rid}: parent cycle")
            break

    for row in rows:
        rid = row["id"]
        depth = depth_of(ledger, rid)
        if depth > 3:
            warn(f"{rid}: hierarchy depth {depth} (>3) — consider flattening")
        kids = children.get(rid, [])
        if row["status"] == "done" and kids:
            open_kids = [k for k in kids if by_id[k]["status"] not in ("done", "wontfix")]
            if open_kids:
                fail(f"{rid}: done while child(ren) still open: {', '.join(open_kids)}")
        if row["status"] == "wontfix" and kids:
            live = [k for k in kids if by_id[k]["status"] not in ("done", "wontfix", "parked")]
            if live:
                warn(f"{rid}: wontfix while live child(ren): {', '.join(live)}")
        parent = row.get("parent")
        if parent in by_id:
            prow = by_id[parent]
            if prow.get("issue") is not None and row.get("internal"):
                fail(f"{rid}: internal child of issue-backed parent {parent} "
                     f"(a GitHub sub-issue needs an issue of its own)")
    for parent, kids in children.items():
        kid_total = sum(int(by_id[k]["estimate_min"] or 0) for k in kids)
        if int(by_id[parent]["estimate_min"] or 0) < kid_total:
            warn(f"{parent}: estimate {by_id[parent]['estimate_min']}m < "
                 f"Σ children {kid_total}m (under-estimated umbrella)")

    # sessions + derived spend
    in_progress = 0
    for row in rows:
        rid = row["id"]
        sessions = row.get("sessions") or []
        if not isinstance(sessions, list):
            fail(f"{rid}: sessions must be a list")
            continue
        spans: list[tuple[dt.datetime, dt.datetime]] = []
        open_count = 0
        total = 0
        for i, sess in enumerate(sessions, 1):
            if not _valid_iso(sess.get("start")):
                fail(f"{rid} session {i}: start is not an ISO timestamp: {sess.get('start')!r}")
                continue
            start = parse_iso(sess["start"])
            if sess.get("end") is None:
                open_count += 1
                age = int(round((dt.datetime.now(dt.timezone.utc) - start).total_seconds() / 60))
                if age > MAX_SESSION_MIN:
                    fail(f"{rid} session {i}: still open after {age}m — forgotten stop "
                         f"(python3 scripts/tasks.py stop {rid})")
            else:
                if not _valid_iso(sess.get("end")):
                    fail(f"{rid} session {i}: end is not an ISO timestamp: {sess.get('end')!r}")
                    continue
                end = parse_iso(sess["end"])
                if end < start:
                    fail(f"{rid} session {i}: ends before it starts")
                    continue
                minutes = int(round((end - start).total_seconds() / 60))
                total += minutes
                if minutes > MAX_SESSION_MIN:
                    warn(f"{rid} session {i}: {minutes}m (>{MAX_SESSION_MIN}m) — long but recorded")
                spans.append((start, end))
            if not isinstance(sess.get("measured"), bool):
                fail(f"{rid} session {i}: measured must be true/false")
        spans.sort()
        for a, b in zip(spans, spans[1:]):
            if b[0] < a[1]:
                fail(f"{rid}: overlapping sessions ({a[0]}…{a[1]} and {b[0]}…{b[1]})")
                break
        if open_count > 1:
            fail(f"{rid}: {open_count} open sessions — a row has at most one")
        spent = row.get("spent_min")
        if not isinstance(spent, int) or spent != total:
            fail(f"{rid}: spent_min {spent!r} != {total} from sessions "
                 f"(run `python3 scripts/tasks.py fmt` to recompute)")
        scount = row.get("session_count")
        if not isinstance(scount, int) or scount != len(sessions):
            fail(f"{rid}: session_count {scount!r} != {len(sessions)} sessions")
        if row["status"] == "in-progress":
            in_progress += 1
            if open_count != 1:
                fail(f"{rid}: status in-progress requires exactly one open session "
                     f"(has {open_count})")
        elif open_count:
            fail(f"{rid}: status {row['status']} but session {i if sessions else ''} is still open "
                 f"(stop it or set-status in-progress)")
        if row["status"] == "done":
            has_proof = any(s.get("proof") for s in sessions)
            if not has_proof and row.get("time_source") not in ("none", "reconstructed"):
                fail(f"{rid}: done without proof (record a session, or set time_source "
                     f"none/reconstructed)")

    if in_progress > WIP_LIMIT:
        fail(f"WIP limit {WIP_LIMIT}: {in_progress} tasks are in-progress "
             f"({', '.join(r['id'] for r in rows if r['status'] == 'in-progress')})")
    else:
        ok(f"WIP {in_progress}/{WIP_LIMIT}")

    # TO-DO.md drift: every outstanding `###` item should have a row
    if os.path.isfile(TODO_MD):
        tracked_sources = {r.get("source") for r in rows}
        try:
            orphans = [i for i in todo_items(TODO_MD)
                       if i["source"] not in tracked_sources]
            for item in orphans:
                warn(f"TO-DO.md item has no ledger row: {item['title'][:70]!r} "
                     f"(python3 scripts/tasks.py import-todo)")
        except Exception as exc:  # a hand-edited TO-DO.md must not break CI
            warn(f"could not parse TO-DO.md: {exc}")

    # Uncommitted ledger close-out: CI's gate can only judge what is committed,
    # so `stop`'s write must land before the push (ledger-only commit, no
    # session required — see the hook). Only meaningful for the real ledger.
    if path == LEDGER and os.path.isdir(os.path.join(ROOT, ".git")):
        dirty = git("status", "--porcelain", "--", os.path.relpath(LEDGER, ROOT),
                    check=False).strip()
        if dirty:
            warn(f"TASKS.yaml has uncommitted changes — commit the ledger close-out "
                 f"before pushing ({dirty.split()[0]} {os.path.relpath(LEDGER, ROOT)})")

    if hard == 0:
        ok(f"{len(rows)} tasks, {sum(int(r['spent_min'] or 0) for r in rows)}m recorded")
    return hard, soft


def cmd_validate(args: argparse.Namespace) -> int:
    hard, soft = run_validate()
    print(f"validate: {'OK' if hard == 0 else 'FAILED'} ({hard} hard, {soft} warnings)")
    return 0 if hard == 0 else 1


def cmd_fmt(args: argparse.Namespace) -> int:
    ledger = load()
    for row in ledger["tasks"]:
        backfill(row)
        refresh(row)
    text = emit_ledger(ledger)
    if text == open(LEDGER, encoding="utf-8").read():
        print("already canonical")
        return 0
    with open(LEDGER, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"canonicalised {os.path.basename(LEDGER)}")
    return 0


# ── validate-commits: every commit names a tracked task ────────────────
def commit_trailers(body: str, subject: str = "") -> list[str]:
    """Ids named by `Task: T-###` trailers (body lines, or the subject)."""
    ids: list[str] = []
    for line in body.splitlines():
        if re.match(r"^\s*Task:\s*", line, flags=re.I):
            ids += TASK_RE.findall(line)
    if re.search(r"\bTask:\s*T-", subject, flags=re.I):
        ids += TASK_RE.findall(subject)
    return ids


def is_bookkeeping(paths: list[str]) -> bool:
    """Ledger-only commits (`stop`, `intake`, `gh-sync`, `import-todo` writes)
    carry no trailer and may be made with no session open — the hook exempts
    exactly this shape, and CI must read it the same way."""
    return bool(paths) and all(p == "TASKS.yaml" for p in paths)


def status_gate(rows: dict[str, dict[str, Any]], touched: set[str]) -> list[str]:
    """Status is judged at the tip, not per-commit: a commit made while the
    session was correctly open only reaches the gate once the close-out is
    committed after it."""
    problems: list[str] = []
    for tid in sorted(touched):
        row = rows.get(tid)
        if row is None:
            problems.append(f"references unknown task {tid}")
        elif row["status"] not in ("review", "done"):
            problems.append(
                f"{tid} is {row['status']} at HEAD, expected review/done "
                f"(python3 scripts/tasks.py stop {tid}, then commit TASKS.yaml)")
    return problems


def cmd_validate_commits(args: argparse.Namespace) -> int:
    ledger = load()
    rows = {r["id"]: r for r in ledger["tasks"]}
    if not args.base:
        _die("validate-commits requires --base <ref>")
    revspec = args.base if ".." in args.base else f"{args.base}..HEAD"
    out = git("log", "--no-merges", "--format=%h%x01%s%x01%B%x01--%x01", revspec, check=False)
    commits = [c for c in out.split("\x01--\x01") if c.strip()]
    if not commits:
        print(f"validate-commits: no commits in {revspec}")
        return 0
    hard = 0
    touched: set[str] = set()
    for raw in commits:
        parts = raw.split("\x01")
        if len(parts) < 2:
            continue
        short, subject, body = parts[0].strip(), parts[1].strip(), parts[2] if len(parts) > 2 else ""
        if re.match(r"^(Merge |Revert |fixup! |squash! )", subject):
            continue
        paths = [p for p in git("show", "--name-only", "--format=", short,
                                check=False).splitlines() if p.strip()]
        ids = commit_trailers(body, subject)
        if is_bookkeeping(paths):
            # Ledger-only: exempt from the trailer, but any ids it names still
            # count toward the tip status gate.
            touched.update(tid for tid in ids if tid in rows)
            continue
        if not ids:
            hard += 1
            print(f"FAIL  {short} {subject[:70]!r}: no `Task: T-###` trailer "
                  f"(python3 scripts/tasks.py start <id>; only TASKS.yaml-only "
                  f"commits are exempt)")
            continue
        for tid in ids:
            if tid not in rows:
                hard += 1
                print(f"FAIL  {short}: references unknown task {tid}")
                continue
            touched.add(tid)
    for problem in status_gate(rows, touched):
        hard += 1
        print(f"FAIL  {problem}")
    if hard == 0:
        print(f"PASS  {len(commits)} commits, tasks: {', '.join(sorted(touched)) or '-'} "
              f"(status checked at HEAD)")
    return 1 if hard else 0


# ── git hooks: no untracked commit, automatic trailer ───────────────────
def cmd_hook_precommit(_args: argparse.Namespace) -> int:
    ledger = load()
    running = open_session(ledger)
    if not running:
        print("no open task session — run: bun run task:status, then bun run task:start T-###",
              file=sys.stderr)
        return 1
    print(running[0]["id"])
    return 0


HOOK = r'''#!/bin/sh
# fewer task-tracking gate — generated by `python3 scripts/tasks.py install-hooks`.
# Refuses a commit while no task session is open, and stamps `Task: T-###` from it.
# Exception: a commit staging ONLY TASKS.yaml (the close-out after `stop`, or
# intake/gh-sync bookkeeping) needs no session and gets no trailer.
# Escape hatches: git commit --no-verify   |   SKIP_TASK_HOOK=1
[ -n "$SKIP_TASK_HOOK" ] && exit 0
case "${2:-}" in merge|squash) exit 0;; esac
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$ROOT/scripts/tasks.py" ] || exit 0
MSG="$1"
head -n1 "$MSG" 2>/dev/null | grep -qE '^(Merge |Revert |fixup! |squash! )' && exit 0
STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -n "$STAGED" ] && [ -z "$(printf '%s\n' "$STAGED" | grep -v '^TASKS\.yaml$')" ]; then
  exit 0
fi
ID=$(python3 "$ROOT/scripts/tasks.py" hook-precommit 2>&1) || {
  printf '%s\n' "task-tracking: commit refused — no open task session." >&2
  printf '%s\n' "$ID" >&2
  printf '%s\n' "start one: bun run task:start T-###   (see AGENTS.md → Task Tracking)" >&2
  printf '%s\n' "ledger-only commits (staged: TASKS.yaml) need no session" >&2
  printf '%s\n' "escape hatch: git commit --no-verify" >&2
  exit 1
}
grep -qE '^[[:space:]]*Task:[[:space:]]*T-[0-9]+' "$MSG" || printf '\nTask: %s\n' "$ID" >> "$MSG"
exit 0
'''


def cmd_install_hooks(_args: argparse.Namespace) -> int:
    git_dir = git("rev-parse", "--git-dir").strip()
    base = git_dir if os.path.isabs(git_dir) else os.path.join(ROOT, git_dir)
    hooks = os.path.join(base, "hooks")
    os.makedirs(hooks, exist_ok=True)
    path = os.path.join(hooks, "prepare-commit-msg")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(HOOK)
    os.chmod(path, 0o755)
    print(f"installed {path} (refuses untracked commits, stamps the Task: trailer)")
    return 0


# ── selftest: the one runnable check for the ledger engine ─────────────
def cmd_selftest(_args: argparse.Namespace) -> int:
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f" — {detail}" if detail and not cond else ""))
        if not cond:
            failures.append(name)

    row_a = new_row(title='quote "and" unicode — café', rtype="fix", area="file-ops",
                    issue=180, source="gh#180", estimate_min=120, time_source="measured")
    row_a["id"] = "T-001"
    row_a["notes"] = ["2026-09-26T00:00:00Z · note"]
    row_a["sessions"] = [{"start": "2026-09-26T00:00:00Z", "end": "2026-09-26T01:30:00Z",
                          "measured": True, "note": "worked", "proof": ["9cb0075", "#181"],
                          "effort": {"commits": 1, "files": 2, "insertions": 3, "deletions": 4}}]
    refresh(row_a)
    row_b = new_row(title="internal chore", rtype="task", area="other", internal=True,
                    status="triaged", source="cli")
    row_b["id"] = "T-002"
    ledger = {"version": 1, "tasks": [row_a, row_b]}
    text = emit_ledger(ledger)
    back = parse_ledger(text)
    check("emit → parse round-trips", back == ledger,
          f"diff keys: {[k for k in ledger['tasks'][0] if ledger['tasks'][0].get(k) != back['tasks'][0].get(k)]}")
    check("emit is idempotent", emit_ledger(back) == text)
    check("derived spend is right", row_a["spent_min"] == 90 and row_a["session_count"] == 1)

    issue_title_180 = "[Bug] Can't deselect using Ctrl when selection is made through Shift select"
    check("dedupe: exact wording matches (>=0.75)",
          similarity(issue_title_180, issue_title_180) >= 0.75)
    check("dedupe: paraphrase stays under 0.75 (never silently attach)",
          similarity("unselect with ctrl after shift selecting cards", issue_title_180) < 0.75)
    check("dedupe: unrelated bug stays under 0.45 (create)",
          similarity("svg export crashes on empty graph", issue_title_180) < 0.45)
    repro_body = ("1. Select multiple cards using Shift + Drag\n"
                  "2. Try to deselect single card using Ctrl\n3. Doesn't work")
    para = similarity("unselect with ctrl after shift selecting cards", repro_body)
    check("dedupe: paraphrase of the repro text lands in the ask band",
          0.45 <= para < 0.75, f"score={para:.2f}")
    check("dedupe: two generic words can't attach to an unrelated body",
          similarity("click card", repro_body) < 0.45)

    body = '{"bug": {"severity": "medium", "category": "file-ops"}}'
    check("bug payload parsed", parse_bug_payload(body) == {"severity": "medium", "category": "file-ops"})
    check("prose-only body yields nothing (propose, do not apply)",
          parse_bug_payload("Something looks wrong when I click.") == {})

    # commit gates: trailer parsing, the ledger-only exemption, the tip status rule
    check("trailer parsed from a body", commit_trailers("docs…\n\nTask: T-001\n") == ["T-001"])
    check("trailer parsed from the subject", commit_trailers("", "chore: x (Task: T-002)") == ["T-002"])
    check("no trailer → empty", commit_trailers("fix: something\n") == [])
    check("bookkeeping: TASKS.yaml-only is exempt", is_bookkeeping(["TASKS.yaml"]))
    check("bookkeeping: mixed commit is not exempt",
          not is_bookkeeping(["TASKS.yaml", "src/lib/fewer/x.ts"]))
    check("bookkeeping: nothing staged is not exempt", not is_bookkeeping([]))
    check("tip gate: in-progress at HEAD fails",
          status_gate({"T-001": {"status": "in-progress"}}, {"T-001"})
          == ["T-001 is in-progress at HEAD, expected review/done "
              "(python3 scripts/tasks.py stop T-001, then commit TASKS.yaml)"])
    check("tip gate: review/done at HEAD passes",
          status_gate({"T-001": {"status": "review"}, "T-002": {"status": "done"}},
                      {"T-001", "T-002"}) == [])
    check("tip gate: unknown task fails",
          status_gate({}, {"T-099"}) == ["references unknown task T-099"])

    # PR metadata: size bands, label derivation, task resolution from a PR
    check("size band: xs ≤60", size_label(60) == "size:xs")
    check("size band: s ≤240", size_label(240) == "size:s")
    check("size band: m ≤960", size_label(960) == "size:m")
    check("size band: l ≤2400", size_label(2400) == "size:l")
    check("size band: xl >2400", size_label(2401) == "size:xl")
    check("board Size option: size:m → M, size:xs → XS",
          size_option_name(600) == "M" and size_option_name(30) == "XS")
    check("derived labels: status + type + category + size",
          derived_labels([{"type": "feat", "area": "import", "estimate_min": 480,
                           "status": "review"}])
          == ["category:import", "enhancement", "size:m", "status:review"])
    check("derived labels: a status with no label emits none",
          derived_labels([{"type": "task", "area": "other", "estimate_min": 300,
                           "status": "parked"}])
          == ["category:other", "size:m"])
    check("derived labels: unions across the PR's tasks",
          derived_labels([{"type": "fix", "area": "import", "estimate_min": 120, "status": "review"},
                          {"type": "docs", "area": "blog", "estimate_min": 5000, "status": "review"}])
          == ["bug", "category:blog", "category:import", "documentation", "size:s",
              "size:xl", "status:review"])
    pr_info = {"commits": [{"messageHeadline": "feat: hierarchy",
                            "messageBody": "Adds the parent field.\n\nTask: T-001"}],
               "body": "## Task & metadata\n- Task: T-002 · labels\n"}
    check("pr rows: commit trailers + body lines",
          [r["id"] for r in pr_task_rows({"tasks": [row_a, row_b]}, pr_info, 7)]
          == ["T-001", "T-002"])
    check("pr rows: nothing tracked → empty (skip, never guess)",
          pr_task_rows({"tasks": [row_a]}, {"commits": [], "body": "chore: x"}, 9) == [])
    stamped = json.loads(json.dumps(row_a))
    stamped["pr"] = 9
    check("pr rows: a row already stamped pr: joins the PR",
          [r["id"] for r in pr_task_rows({"tasks": [stamped]},
                                         {"commits": [], "body": ""}, 9)] == ["T-001"])

    # hierarchy: links, rollups, and the parent/child coherence rules
    p_row = new_row(title="umbrella", rtype="task", area="other", issue=500,
                    estimate_min=600, source="gh#500")
    p_row["id"] = "T-010"
    c_row = new_row(title="subtask", rtype="task", area="other", issue=501, parent="T-010",
                    estimate_min=300, source="gh#501")
    c_row["id"] = "T-011"
    c_row["sessions"] = [{"start": "2026-09-26T00:00:00Z", "end": "2026-09-26T01:00:00Z",
                          "measured": True, "note": "", "proof": ["abc1234"], "effort": None}]
    refresh(c_row)
    hier = {"version": 1, "tasks": [p_row, c_row]}
    check("hierarchy: descendants", descendants(hier, "T-010") == ["T-011"])
    check("hierarchy: rollup estimate = own + descendants", rollup_estimate(hier, "T-010") == 900)
    check("hierarchy: rollup minutes = own + descendants",
          rollup_minutes(hier, "T-010") == 60 and rollup_minutes(hier, "T-011") == 60)
    check("hierarchy: depth", depth_of(hier, "T-011") == 1 and depth_of(hier, "T-010") == 0)

    def _write_hier(led: dict[str, Any], tag: str) -> str:
        path = os.path.join(tempfile.gettempdir(), f"fewer-tasks-hier-{_slug(tag)}.yaml")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(emit_ledger(led))
        return path

    good_hier = _write_hier(hier, "clean")
    with contextlib.redirect_stdout(io.StringIO()):
        h_hard, h_soft = run_validate(good_hier)
    check("validate accepts a clean hierarchy", h_hard == 0, f"{h_hard} hard, {h_soft} warn")

    hier_variants = {
        "parent done with open child": lambda led: (
            led["tasks"][0].__setitem__("time_source", "none"),
            led["tasks"][0].__setitem__("status", "done")),
        "internal child of issue-backed parent": lambda led: led["tasks"][1].__setitem__("internal", True),
        "self-parent": lambda led: led["tasks"][1].__setitem__("parent", "T-011"),
        "unknown parent": lambda led: led["tasks"][1].__setitem__("parent", "T-099"),
        "parent cycle": lambda led: (
            led["tasks"][0].__setitem__("parent", "T-011"),
            led["tasks"][1].__setitem__("parent", "T-010")),
    }
    for name, mutate in hier_variants.items():
        led = json.loads(json.dumps(hier))
        mutate(led)
        path = _write_hier(led, name)
        with contextlib.redirect_stdout(io.StringIO()):
            hard2, _soft2 = run_validate(path)
        check(f"validate rejects: {name}", hard2 >= 1)
        try:
            os.unlink(path)
        except OSError:
            pass

    led = json.loads(json.dumps(hier))
    led["tasks"][0]["estimate_min"] = 100
    path = _write_hier(led, "under-estimated umbrella")
    with contextlib.redirect_stdout(io.StringIO()):
        h_hard, h_soft = run_validate(path)
    check("under-estimated umbrella warns, does not fail", h_hard == 0 and h_soft >= 1,
          f"hard={h_hard} soft={h_soft}")

    deep = json.loads(json.dumps(hier))
    for i, (rid, parent) in enumerate((("T-012", "T-011"), ("T-013", "T-012"), ("T-014", "T-013"))):
        r = new_row(title=f"depth {i}", rtype="task", area="other", issue=600 + i, parent=parent,
                    estimate_min=120, source=f"gh#{600 + i}")
        r["id"] = rid
        deep["tasks"].append(r)
    path = _write_hier(deep, "deep hierarchy")
    with contextlib.redirect_stdout(io.StringIO()):
        h_hard, h_soft = run_validate(path)
    check("hierarchy depth >3 warns, does not fail", h_hard == 0 and h_soft >= 1,
          f"hard={h_hard} soft={h_soft}")
    for path in (good_hier, path):
        try:
            os.unlink(path)
        except OSError:
            pass

    good_path = os.path.join(tempfile.gettempdir(), "fewer-tasks-selftest-good.yaml")
    with open(good_path, "w", encoding="utf-8") as fh:
        fh.write(text)
    with contextlib.redirect_stdout(io.StringIO()):
        hard, soft = run_validate(good_path)
    check("validate passes a well-formed ledger", hard == 0, f"{hard} hard failures")

    variants: dict[str, Any] = {
        "unknown status": lambda led: led["tasks"][1].__setitem__("status", "nope"),
        "in-progress without a session": lambda led: led["tasks"][1].__setitem__("status", "in-progress"),
        "done without proof": lambda led: led["tasks"][1].__setitem__("status", "done"),
        "two rows on one issue": lambda led: led["tasks"][1].__setitem__("issue", 180),
        "self-blocking": lambda led: led["tasks"][0].__setitem__("blocked_by", ["T-001"]),
        "estimate zero": lambda led: led["tasks"][1].__setitem__("estimate_min", 0),
        "spend drift": lambda led: led["tasks"][0].__setitem__("spent_min", 91),
        "cyclic blocked_by": lambda led: (led["tasks"][0].__setitem__("blocked_by", ["T-002"]),
                                          led["tasks"][1].__setitem__("blocked_by", ["T-001"])),
    }
    for name, mutate in variants.items():
        led = json.loads(json.dumps(ledger))  # deep copy: mutate the dict, not the text
        mutate(led)
        path = os.path.join(tempfile.gettempdir(), f"fewer-tasks-selftest-{_slug(name)}.yaml")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(emit_ledger(led))
        with contextlib.redirect_stdout(io.StringIO()):
            hard, _soft = run_validate(path)
        check(f"validate rejects: {name}", hard >= 1)
        try:
            os.unlink(path)
        except OSError:
            pass
    try:
        os.unlink(good_path)
    except OSError:
        pass

    # Definition of ready: the start gate, the ready report and validate all
    # read this one function, so pin its reasons here.
    ready_row = new_row(title="ready work", rtype="feat", area="import", issue=501,
                        status="triaged", estimate_min=240, source="cli")
    ready_row["id"] = "T-100"
    blocker = new_row(title="licensing", rtype="task", area="other", issue=502,
                      status="triaged", estimate_min=120, source="cli")
    blocker["id"] = "T-101"
    led_ready = {"version": 1, "tasks": [ready_row, blocker]}
    check("readiness: a triaged, estimated, linked, unblocked row is ready",
          readiness_issues(ready_row, led_ready, check_milestone=False) == [],
          str(readiness_issues(ready_row, led_ready, check_milestone=False)))
    backlog_row = json.loads(json.dumps(ready_row))
    backlog_row["status"] = "backlog"
    check("readiness: backlog is refused (triage first)",
          any("not triaged" in r for r in readiness_issues(backlog_row, led_ready, check_milestone=False)))
    no_estimate = json.loads(json.dumps(ready_row))
    no_estimate["estimate_min"] = None
    check("readiness: missing estimate is a reason",
          any("estimate" in r for r in readiness_issues(no_estimate, led_ready, check_milestone=False)))
    no_issue = json.loads(json.dumps(ready_row))
    no_issue["issue"] = None
    no_issue["internal"] = False
    check("readiness: unlinked row is a reason",
          any("no issue" in r for r in readiness_issues(no_issue, led_ready, check_milestone=False)))
    dependent = json.loads(json.dumps(ready_row))
    dependent["id"] = "T-102"
    dependent["blocked_by"] = ["T-101"]
    led_dep = {"version": 1, "tasks": [ready_row, blocker, dependent]}
    check("readiness: an open blocker is a reason",
          any("blocked by T-101" in r for r in readiness_issues(dependent, led_dep, check_milestone=False)))
    blocked_row = json.loads(json.dumps(ready_row))
    blocked_row["status"] = "blocked"
    check("readiness: a blocked row is not startable",
          any("not triaged" in r for r in readiness_issues(blocked_row, led_ready, check_milestone=False)))
    cleared = json.loads(json.dumps(dependent))
    cleared["blocked_by"] = []
    check("readiness: clearing the blocker makes it startable again",
          readiness_issues(cleared, led_ready, check_milestone=False) == [])

    # Demote policy: a missing milestone is triage's job, so it is the one reason
    # that moves a row back to backlog by itself. Anything else needs a human.
    ms_only = [f"{MILESTONE_REASON} issue #501 has no milestone"]
    check("demote: milestone-only row is demotable", is_demotable("triaged", ms_only))
    check("demote: mixed reasons are not demotable",
          not is_demotable("triaged", ms_only + ["no estimate — triage it"]))
    check("demote: a blocker is not demotable",
          not is_demotable("triaged", ["blocked by T-101 (triaged)"]))
    check("demote: an already-backlog row is not moved",
          not is_demotable("backlog", ms_only))
    check("demote: a ready row is not demotable", not is_demotable("triaged", []))

    if failures:
        print(f"selftest: {len(failures)} FAILED ({', '.join(failures)})")
        return 1
    print("selftest: all checks passed")
    return 0


# ── CLI ────────────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="tasks.py",
        description="Task tracking for fewer — ledger: TASKS.yaml. Run `selftest` after changing this file.")
    sub = p.add_subparsers(dest="verb", required=True)

    def add(name: str, fn, help_: str) -> argparse.ArgumentParser:
        sp = sub.add_parser(name, help=help_)
        sp.set_defaults(fn=fn)
        return sp

    add("status", cmd_status, "open session, totals, readiness, untracked GitHub issues")

    sp = add("ready", cmd_ready, "list rows that are not startable, with the reason")
    sp.add_argument("--strict", action="store_true", help="exit 1 when anything is unready")
    sp.add_argument("--no-milestone", action="store_true",
                    help="skip the GitHub milestone check (offline / faster)")
    sp.add_argument("--demote", action="store_true",
                    help="move triaged rows whose only problem is a missing milestone to backlog")

    sp = add("attach-pr", cmd_attach_pr,
             "attach an existing PR to a row (status → review when it is open)")
    sp.add_argument("ref")
    sp.add_argument("pr", help="PR number, with or without #")

    sp = add("add", cmd_add, "create a task row (status: backlog)")
    sp.add_argument("--title", required=True)
    sp.add_argument("--type", choices=TYPES)
    sp.add_argument("--area", default="other")
    sp.add_argument("--issue", type=int)
    sp.add_argument("--internal", action="store_true")
    sp.add_argument("--tier", type=int)
    sp.add_argument("--estimate-min", type=int)
    sp.add_argument("--source")
    sp.add_argument("--parent", help="T-id of the parent task (subtask/child)")

    sp = add("triage", cmd_triage, "classify a row and set status: triaged")
    sp.add_argument("ref")
    sp.add_argument("--estimate-min", type=int)
    sp.add_argument("--tier", type=int)
    sp.add_argument("--area")
    sp.add_argument("--type", choices=TYPES)
    sp.add_argument("--blocked-by", nargs="+", default=[])
    sp.add_argument("--parent", help="T-id of the parent task (subtask/child)")
    sp.add_argument("--note")

    sp = add("start", cmd_start, "open a timed session (status: in-progress)")
    sp.add_argument("ref")
    sp.add_argument("--force", action="store_true",
                    help="start even if the row is not ready (records the reasons)")

    sp = add("stop", cmd_stop, "close the session, harvest proof/effort from git")
    sp.add_argument("ref", nargs="?")
    sp.add_argument("--note", default="")
    sp.add_argument("--to", choices=STATUSES)
    sp.add_argument("--comment", choices=("auto", "on", "off"), default="auto")

    sp = add("set-status", cmd_set_status, "move a row through the status machine")
    sp.add_argument("ref")
    sp.add_argument("status", choices=STATUSES)

    sp = add("note", cmd_note, "append a note to a row")
    sp.add_argument("ref")
    sp.add_argument("text")

    sp = add("record-session", cmd_record_session,
             "append a closed session with explicit timestamps (back-fill only)")
    sp.add_argument("ref")
    sp.add_argument("--start", required=True)
    sp.add_argument("--end", required=True)
    sp.add_argument("--note", default="")
    sp.add_argument("--proof", nargs="*")
    sp.add_argument("--pr", nargs="*", help="alias: PR refs like #181")
    sp.add_argument("--reconstructed", action="store_true",
                    help="time is inferred from evidence, not a live session")
    sp.add_argument("--time-source", choices=("measured", "reconstructed", "none"))

    sp = add("find", cmd_find, "read-only search of the ledger")
    sp.add_argument("query")
    sp.add_argument("--json", action="store_true")

    sp = add("track", cmd_track, "find-or-create an issue+row, then start timing")
    sp.add_argument("type", choices=("bug", "fix", "feat", "refactor", "perf", "docs", "infra", "research", "task"))
    sp.add_argument("title")
    sp.add_argument("--area")
    sp.add_argument("--severity", choices=("low", "medium", "high", "critical"))
    sp.add_argument("--issue", type=int)
    sp.add_argument("--id")
    sp.add_argument("--new", action="store_true", help="skip the search, file it")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--no-start", action="store_true")
    sp.add_argument("--local", action="store_true", help="skip GitHub, search rows only")
    sp.add_argument("--body")
    sp.add_argument("--parent", help="T-id to file the new sub-issue under")

    sp = add("attach", cmd_attach, "attach to an issue/task id and start timing")
    sp.add_argument("ref")
    sp.add_argument("--no-start", dest="start", action="store_false")
    sp.add_argument("--parent", help="T-id to set as parent while attaching")

    sp = add("pr-metadata", cmd_pr_metadata,
             "labels + milestone + assignee + project item for a PR, from its task rows")
    sp.add_argument("pr_number", type=int, help="PR number")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--no-write", action="store_true",
                    help="do not stamp `pr:` back into the ledger (CI checkout)")
    sp.add_argument("--project", type=int, help="board number (default: PROJECT_NUMBER)")
    sp.add_argument("--no-project", action="store_true",
                    help="labels/milestone/assignee only — leave the board to a later step")
    sp.add_argument("--milestone",
                    help="override the default (earliest open milestone when the task has none)")

    sp = add("intake", cmd_intake, "adopt GitHub issues that have no ledger row")
    sp.add_argument("--state", choices=("open", "all", "closed"), default="open")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--auto", action="store_true", help="skip prose-label proposals")

    sp = add("import-todo", cmd_import_todo, "TO-DO.md → triaged rows")
    sp.add_argument("path", nargs="?", default=TODO_MD)
    sp.add_argument("--dry-run", action="store_true")

    sp = add("gh-sync", cmd_gh_sync, "ledger → GitHub: create issues, mirror status labels")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--status-only", action="store_true")
    sp.add_argument("--relink", action="store_true",
                    help="also drop GitHub sub-issue links the ledger no longer has")

    sp = add("reconcile", cmd_reconcile, "GitHub open/closed + PR merge → ledger status")
    sp.add_argument("--apply", action="store_true")
    sp.add_argument("--dry-run", action="store_true")

    sp = add("doctor", cmd_doctor, "bidirectional drift check (needs gh)")
    sp.add_argument("--json", action="store_true")

    sp = add("report", cmd_report, "time and estimate rollup")
    sp.add_argument("--since", help="ISO date, e.g. 2026-09-01")
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--tree", action="store_true", help="indented hierarchy view")

    sp = add("children", cmd_children, "direct children of a task + its rollup")
    sp.add_argument("ref")

    sp = add("tree", cmd_tree, "the hierarchy with own and rollup time")
    sp.add_argument("--root", help="restrict to one subtree")
    sp.add_argument("--json", action="store_true")

    sp = add("reparent", cmd_reparent, "move a task under another (or --detach)")
    sp.add_argument("ref")
    sp.add_argument("--parent", help="new parent T-id")
    sp.add_argument("--detach", action="store_true", help="make it a root")

    add("validate", cmd_validate, "structural gate (CI runs this)")

    sp = add("validate-commits", cmd_validate_commits, "every commit names a task in review/done")
    sp.add_argument("--base", help="ref to compare, e.g. origin/dev")

    add("fmt", cmd_fmt, "rewrite TASKS.yaml canonically (recomputes derived fields)")
    add("install-hooks", cmd_install_hooks, "install the prepare-commit-msg gate")
    add("hook-precommit", cmd_hook_precommit, "used by the hook: print the open task id")
    add("selftest", cmd_selftest, "round-trip + scorer + validate fixtures")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.fn(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
