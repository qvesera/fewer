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
    "estimate_basis", "issue", "internal", "milestone", "blocked_by",
    "source", "time_source", "reporter", "created_at", "notes", "sessions",
    "spent_min", "session_count",
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
        refresh(row)
    with open(LEDGER, "w", encoding="utf-8") as fh:
        fh.write(emit_ledger(ledger))


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
            source: str | None = None, time_source: str | None = None,
            reporter: str | None = None, created_at: str | None = None,
            estimate_basis: str = "type-default", notes: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": None, "title": title, "status": status, "type": rtype, "area": area,
        "tier": tier, "estimate_min": int(estimate_min or ESTIMATE_DEFAULT.get(rtype, 120)),
        "estimate_basis": estimate_basis, "issue": issue, "internal": internal,
        "milestone": milestone, "blocked_by": blocked_by or [], "source": source,
        "time_source": time_source, "reporter": reporter, "created_at": created_at or now_iso(),
        "notes": notes or [], "sessions": [], "spent_min": 0, "session_count": 0,
    }


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
    """PR for the checked-out branch, best effort."""
    try:
        out = gh("pr", "view", "--json", "number,url", "--jq", ".number", check=False).strip()
        return f"#{out}" if out.isdigit() else None
    except (SystemExit, FileNotFoundError):
        return None


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
    row = new_row(
        title=args.title, rtype=args.type or "task", area=args.area or "other",
        status="backlog", tier=args.tier, estimate_min=args.estimate_min,
        estimate_basis="cli" if args.estimate_min else "type-default",
        issue=args.issue, internal=bool(args.internal),
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
    if args.note:
        row["notes"].append(f"{now_iso()} · {args.note}")
    row["status"] = "triaged"
    save(ledger)
    print(f"{row['id']}  status=triaged  estimate={row['estimate_min']}m "
          f"basis={row['estimate_basis']}  area={row['area']}  blocked_by={row['blocked_by'] or '-'}")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    ledger = load()
    row = find_row(ledger, args.ref)
    if row is None:
        _die(f"no task {args.ref} — create it first (find / add / track)")
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
    pr = current_pr()
    if pr and pr not in sess["proof"]:
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
                  f"estimate={ESTIMATE_DEFAULT.get(rtype, 120)}m, then start the session")
            return 0
        number = create_issue(title=full_title, body=body, labels=labels)
        row = new_row(title=title, rtype=rtype, area=args.area or "other", issue=number,
                      source=f"gh#{number}", estimate_basis="type-default")
        row["id"] = next_id(ledger)
        ledger["tasks"].append(row)
        save(ledger)
        print(f"DECISION create → #{number} · {row['id']} (no candidate ≥0.75; "
              f"best {best_score:.2f})")
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
        return 0 if args.no_start else _start_row(ledger, row)
    if issue:
        if args.dry_run:
            print(f"DECISION attach → #{issue['number']} ({best_score:.2f}) and adopt a new row "
                  f"(dry-run: nothing written)")
            return 0
        row = adopt_issue(ledger, issue, status="triaged")
        save(ledger)
        print(f"DECISION attach → #{issue['number']} ({best_score:.2f}) adopted as {row['id']}")
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
    if not args.dry_run:
        save(ledger)
    verb = "would adopt" if args.dry_run else "adopted"
    print(f"{verb} {len(missing)} issues: {', '.join(adopted) or '-'}")
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


def _status_labels(labels: list[str]) -> list[str]:
    return [l for l in labels if l.startswith("status:") or l == "wontfix"]


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
        wanted = [target] if target else []
        stale = [l for l in _status_labels(current) if l not in wanted]
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
        print(f"dry-run: created {len(created)}, relabelled {len(relabelled)}")
    else:
        print(f"gh-sync: created {created or '-'} | relabelled {relabelled or '-'}")
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
        have = set(_status_labels([l["name"] for l in issue.get("labels") or []]))
        want = {target} if target else set()
        if have != want:
            problems.append(f"{row['id']} #{issue['number']}: status labels {sorted(have)} != "
                            f"{sorted(want)} (run: python3 scripts/tasks.py gh-sync)")
        if issue["state"] == "CLOSED" and row["status"] not in ("done", "wontfix"):
            problems.append(f"{row['id']} #{issue['number']} closed on GitHub but status={row['status']} "
                            f"(run: python3 scripts/tasks.py reconcile --apply)")
    for row in ledger["tasks"]:
        if not row.get("issue") and not row.get("internal"):
            problems.append(f"{row['id']} has no issue and is not internal (run: gh-sync)")
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
        print(json.dumps([{k: r.get(k) for k in ("id", "status", "title", "issue", "estimate_min",
                                                  "spent_min", "session_count", "source")} for r in rows],
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
    # session required — see the hook).
    if os.path.isdir(os.path.join(ROOT, ".git")):
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

    add("status", cmd_status, "open session, totals, untracked GitHub issues")

    sp = add("add", cmd_add, "create a task row (status: backlog)")
    sp.add_argument("--title", required=True)
    sp.add_argument("--type", choices=TYPES)
    sp.add_argument("--area", default="other")
    sp.add_argument("--issue", type=int)
    sp.add_argument("--internal", action="store_true")
    sp.add_argument("--tier", type=int)
    sp.add_argument("--estimate-min", type=int)
    sp.add_argument("--source")

    sp = add("triage", cmd_triage, "classify a row and set status: triaged")
    sp.add_argument("ref")
    sp.add_argument("--estimate-min", type=int)
    sp.add_argument("--tier", type=int)
    sp.add_argument("--area")
    sp.add_argument("--type", choices=TYPES)
    sp.add_argument("--blocked-by", nargs="+", default=[])
    sp.add_argument("--note")

    sp = add("start", cmd_start, "open a timed session (status: in-progress)")
    sp.add_argument("ref")

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

    sp = add("attach", cmd_attach, "attach to an issue/task id and start timing")
    sp.add_argument("ref")
    sp.add_argument("--no-start", dest="start", action="store_false")

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

    sp = add("reconcile", cmd_reconcile, "GitHub open/closed + PR merge → ledger status")
    sp.add_argument("--apply", action="store_true")
    sp.add_argument("--dry-run", action="store_true")

    sp = add("doctor", cmd_doctor, "bidirectional drift check (needs gh)")
    sp.add_argument("--json", action="store_true")

    sp = add("report", cmd_report, "time and estimate rollup")
    sp.add_argument("--since", help="ISO date, e.g. 2026-09-01")
    sp.add_argument("--json", action="store_true")

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
