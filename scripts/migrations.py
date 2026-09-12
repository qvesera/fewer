#!/usr/bin/env python3
"""Migration guards for CI and local use.

Two subcommands:

  verify    Static + git checks on supabase/migrations. Catches the failure
            mode that bit us in v0.7.0: editing a migration that had already
            been applied, so the change never reached existing environments.
            Also catches out-of-order migrations, which `supabase db push`
            silently skips, and duplicate numbers.

  baseline  Compares local migration versions against a project's recorded
            history (`supabase migration list --linked`) and fails when a local
            migration is missing from history but was NOT added by the current
            change. That means history drift: `db push` would replay old
            migrations. Prints the exact `migration repair` command to run.

Usage:
  python3 scripts/migrations.py verify --base origin/dev
  python3 scripts/migrations.py baseline --list /tmp/migration-list.txt \
      --added /tmp/added-migrations.txt

Exit codes: 0 = ok (warnings allowed), 1 = failed checks.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

MIGRATIONS_DIR = Path("supabase/migrations")
FILENAME_RE = re.compile(r"^(\d{4})_([a-z0-9_]+)\.sql$")

# Heuristics for "this DDL will explode if it runs twice". Warnings only: the
# real guarantee is the idempotency rule in AGENTS.md — a script cannot prove
# idempotency, it can only flag the usual suspects.
IDEMPOTENCY_HINTS = [
    (re.compile(r"create\s+table\s+(?!if\s+not\s+exists)", re.I), "create table without `if not exists`"),
    (re.compile(r"create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists|concurrently\s+if\s+not\s+exists)", re.I), "create index without `if not exists`"),
    (re.compile(r"create\s+type\s+(?!if\s+not\s+exists)", re.I), "create type without `if not exists`"),
    (re.compile(r"alter\s+table\s+\S+\s+add\s+column\s+(?!if\s+not\s+exists)", re.I), "add column without `if not exists`"),
]


class Result:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def report(self, title: str) -> int:
        for w in self.warnings:
            print(f"WARN  {w}")
        for e in self.errors:
            print(f"FAIL  {e}")
        if self.errors:
            print(f"\n{title}: {len(self.errors)} error(s), {len(self.warnings)} warning(s)")
            return 1
        print(f"\n{title}: OK ({len(self.warnings)} warning(s))")
        return 0


def migration_files() -> list[Path]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def parse_prefix(name: str) -> str | None:
    m = FILENAME_RE.match(name)
    return m.group(1) if m else None


def git_changes(base: str) -> dict[str, str]:
    """Map of path -> status letter for migrations changed vs `base`.

    Two-dot diff (base against the working tree), so uncommitted local edits are
    caught too — not just committed ones.
    """
    try:
        out = subprocess.run(
            ["git", "diff", "--name-status", base, "--", str(MIGRATIONS_DIR)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise SystemExit(f"error: could not diff against {base!r}: {exc}") from exc

    changes: dict[str, str] = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            changes[parts[-1]] = parts[0][0]  # A / M / D / R / C
    return changes


def base_file_names(base: str) -> set[str]:
    """Migration filenames that exist at `base` (tracked, committed)."""
    try:
        out = subprocess.run(
            ["git", "ls-tree", "-r", "--name-only", base, "--", str(MIGRATIONS_DIR)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise SystemExit(f"error: could not list {MIGRATIONS_DIR} at {base!r}: {exc}") from exc
    return {Path(p).name for p in out.splitlines() if p.strip()}



def cmd_verify(args: argparse.Namespace) -> int:
    res = Result()
    files = migration_files()
    if not files:
        res.error(f"no migration files found under {MIGRATIONS_DIR}")
        return res.report("migration verify")

    by_prefix: dict[str, list[str]] = {}
    for path in files:
        name = path.name
        prefix = parse_prefix(name)
        if prefix is None:
            res.error(f"{name}: filename must match `NNNN_lower_snake_case.sql`")
            continue
        by_prefix.setdefault(prefix, []).append(name)
        if path.stat().st_size == 0:
            res.error(f"{name}: file is empty")

    # Migrations introduced by this change set (empty when --base is omitted).
    added: set[str] = set()
    if args.base:
        base_names = base_file_names(args.base)
        added = {p.name for p in files} - base_names
        for path, status in sorted(git_changes(args.base).items()):
            if status in {"M", "D", "R", "C"}:
                res.error(
                    f"{path}: an existing migration was modified or deleted. "
                    "Applied migrations are immutable — add a NEW migration instead "
                    "(see the Migrations section in AGENTS.md)."
                )
    else:
        res.warn("no --base given: skipping git-based checks (edits to existing migrations)")

    # Duplicate numbers: pre-existing ones only warn (they were already applied
    # under their own versions), a newly added duplicate is an error.
    for prefix, names in sorted(by_prefix.items()):
        if len(names) < 2:
            continue
        newly = sorted(n for n in names if n in added)
        msg = f"duplicate migration number {prefix}: {', '.join(sorted(names))}"
        if newly:
            res.error(f"{msg} (added by this change: {', '.join(newly)})")
        else:
            res.warn(f"{msg} (pre-existing)")

    # Ordering: db push only applies versions above the newest known one, so a
    # new migration numbered below the current maximum is silently skipped.
    pre_existing = [int(p) for p, names in by_prefix.items() if not (set(names) & added)]
    if pre_existing:
        highest = max(pre_existing)
        for name in sorted(added):
            prefix = parse_prefix(name)
            if prefix is not None and int(prefix) <= highest:
                res.error(
                    f"{name}: number {prefix} is not greater than the highest existing "
                    f"migration ({highest:04d}) — `supabase db push` would skip it. "
                    f"Renumber it to {highest + 1:04d}."
                )

    for name in sorted(added):
        path = MIGRATIONS_DIR / name
        if not path.is_file():
            continue
        text = path.read_text()
        for pattern, label in IDEMPOTENCY_HINTS:
            if pattern.search(text):
                res.warn(f"{name}: {label} — migrations must be re-runnable")

    return res.report("migration verify")


def parse_migration_list(text: str) -> tuple[set[str], set[str]]:
    """Parse `supabase migration list` output into (local, remote) versions.

    The CLI renders the table with backticks around each cell and `|` between
    columns, e.g.

        `0001` | `0001`           | `0001`
           ` ` | `20260819101337` | `2026-08-19 10:13:37`

    Cells are stripped of backticks/whitespace and read as digits only, so the
    header row ("LOCAL"/"REMOTE") and separator rules contribute nothing. A
    backtick-free rendering is handled the same way.
    """
    local: set[str] = set()
    remote: set[str] = set()

    def version(cell: str) -> str:
        digits = re.sub(r"[^0-9]", "", cell)
        # Migration versions are 4 digits (repo) or 14 (timestamp); anything
        # shorter is header/decoration noise.
        return digits if len(digits) >= 4 else ""

    for line in text.splitlines():
        if "|" not in line and "│" not in line:
            continue
        cells = re.split(r"[|│]", line)
        if len(cells) < 2:
            continue
        local_version = version(cells[0])
        remote_version = version(cells[1])
        if local_version:
            local.add(local_version)
        if remote_version:
            remote.add(remote_version)
    return local, remote


def cmd_baseline(args: argparse.Namespace) -> int:
    res = Result()
    list_path = Path(args.list)
    if not list_path.is_file():
        res.error(f"migration list output not found at {list_path}")
        return res.report("migration baseline")

    local, remote = parse_migration_list(list_path.read_text())
    if not local and not remote:
        res.error(
            f"could not parse any rows from {list_path} — refusing to pass. "
            "Run `supabase migration list --linked` manually and check the output format."
        )
        return res.report("migration baseline")

    added: set[str] = set()
    if args.added and Path(args.added).is_file():
        for line in Path(args.added).read_text().splitlines():
            prefix = parse_prefix(Path(line.strip()).name)
            if prefix:
                added.add(prefix)

    drift = sorted(v for v in local - remote if v not in added)
    if drift:
        res.error(
            "history drift: these local migrations are missing from the project's "
            f"history and are not new in this change: {', '.join(drift)}. "
            "A `supabase db push` would replay them. Record them as applied first:\n"
            f"    supabase migration repair --status applied {' '.join(drift)}"
        )
    else:
        print(f"baseline ok — {len(remote)} recorded, {len(added)} new in this change")

    return res.report("migration baseline")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_verify = sub.add_parser("verify", help="static + git checks on migration files")
    p_verify.add_argument("--base", help="git ref to diff against, e.g. origin/dev")
    p_verify.set_defaults(func=cmd_verify)

    p_baseline = sub.add_parser("baseline", help="compare local migrations with a project's history")
    p_baseline.add_argument("--list", required=True, help="file containing `supabase migration list` output")
    p_baseline.add_argument("--added", help="file listing migration paths added by this change")
    p_baseline.set_defaults(func=cmd_baseline)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
