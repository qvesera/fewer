#!/usr/bin/env python3
"""Deterministic helper for maintaining CHANGELOG.md in this repo.

Model: Keep a Changelog + SemVer. Backs the workspace `changelog` skill; the
script is the source of truth for structure.

Commands:
  add     <group> "<text>"            append a bullet to the Unreleased section
  current                             print Unreleased version + group counts
  backfill [--limit N]                list commits not yet reflected
  release <version> [YYYY-MM-DD]      finalize Unreleased, open a fresh one
  validate                            check consistency; exit 1 on hard failure

Overrides for tests: CHANGELOG_PATH, PACKAGE_PATH.
"""
from __future__ import annotations
import datetime as dt
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHANGELOG_PATH = pathlib.Path(os.environ.get("CHANGELOG_PATH", ROOT / "CHANGELOG.md"))
PACKAGE_PATH = pathlib.Path(os.environ.get("PACKAGE_PATH", ROOT / "package.json"))

GROUP = {
    "added": "Added", "changed": "Changed", "fixed": "Fixed",
    "removed": "Removed", "deprecated": "Deprecated",
    "performance": "Performance", "perf": "Performance",
    "security": "Security", "pwa": "PWA",
}
# conventional-commit type -> changelog group (head) using GROUP names exactly
TYPE_TO_GROUP = {
    "feat": "Added", "fix": "Fixed", "perf": "Performance",
    "refactor": "Changed", "style": "Changed", "docs": "Changed",
    "security": "Security",
}
SKIP_TYPES = {"chore", "build", "ci", "test", "revert", "merge"}

RE_VER = re.compile(r"^## \[([^\]]+)\](.*)$")
RE_GROUP = re.compile(r"^###\s+(.*)$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
STOPWORDS = {"the","and","for","with","from","when","into","onto","now","were","had","has","are","was"}


def read():
    if not CHANGELOG_PATH.exists():
        sys.exit(f"changelog not found: {CHANGELOG_PATH}")
    return CHANGELOG_PATH.read_text().splitlines()


def ver_from_heading(line):
    m = RE_VER.match(line)
    if not m:
        return None
    ver = m.group(1)
    return ver if ver != "Unreleased" else None


def unreleased_span(lines):
    """Return (start, end, version_token) for the top (Unreleased) section."""
    start = None
    for i, ln in enumerate(lines):
        if RE_VER.match(ln):
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if RE_VER.match(lines[j]):
            end = j
            break
    return start, end, ver_from_heading(lines[start])


def version_from_package():
    try:
        data = PACKAGE_PATH.read_text()
    except OSError:
        return None
    m = re.search(r'"version"\s*:\s*"([^"]+)"', data)
    return m.group(1) if m else None


# ---------------------------------------------------------------- add
def cmd_add(group, text):
    if not text:
        sys.exit("add requires text: changelog.py add <group> \"...\"")
    head = GROUP.get(group.lower())
    if not head:
        sys.exit(f"unknown group '{group}'. choices: {', '.join(sorted(GROUP))}")
    lines = read()
    span = unreleased_span(lines)
    if not span:
        sys.exit("no Unreleased section found at the top of the changelog")
    start, end, _ = span

    # locate (or create) the '### head' group inside the section
    gi = None
    for i in range(start, end):
        m = RE_GROUP.match(lines[i])
        if m and m.group(1).strip() == head:
            gi = i
            break
    if gi is None:
        # create the group just before the section boundary
        k = end - 1
        while k > start and lines[k].strip() == "":
            k -= 1
        block = ["", f"### {head}", "", f"- {text}"]
        lines[k + 1:k + 1] = block
        write(lines)
        print(f"added `- {text}` to new Unreleased › {head}")
        return

    # append bullet at the end of this group's block
    j = gi + 1
    while j < end and not (RE_GROUP.match(lines[j]) or RE_VER.match(lines[j])):
        j += 1
    k = j - 1
    while k > gi and lines[k].strip() == "":
        k -= 1
    lines.insert(k + 1, f"- {text}")
    write(lines)
    print(f"added `- {text}` to Unreleased › {head}")


# ---------------------------------------------------------------- current
def cmd_current():
    lines = read()
    span = unreleased_span(lines)
    pkg = version_from_package() or "?"
    if not span:
        print("Unreleased: <none>")
        print(f"package.json version: {pkg}")
        return
    start, end, tok = span
    counts = {}
    cur = None
    for i in range(start, end):
        m = RE_GROUP.match(lines[i])
        if m:
            cur = m.group(1).strip()
            counts.setdefault(cur, 0)
        elif cur and lines[i].strip().startswith("- "):
            counts[cur] += 1
    print(f"Unreleased version: {tok or 'Unreleased'}")
    print(f"package.json version: {pkg}")
    print("Unreleased groups:")
    for g, n in counts.items():
        print(f"  {g}: {n}")
    print(f"total entries: {sum(counts.values())}")
# ---------------------------------------------------------------- backfill
def cmd_backfill(limit):
    lines = read()
    body = "\n".join(lines).lower()
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "log", f"--max-count={limit}", "--format=%h %s"],
            capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        sys.exit("backfill needs a git repo")
    for row in reversed(out.splitlines()):
        row = row.strip()
        if not row or " " not in row:
            continue
        h, subject = row.split(" ", 1)
        m = re.match(r"^([a-z]+)(?:\([^)]*\))?\s*:\s*(.*)$", subject)
        if not m:
            continue
        typ, body_s = m.group(1), m.group(2)
        # first 3 significant tokens
        toks = [t for t in re.split(r"[^a-z0-9]+", body_s.lower())
                if t and len(t) > 3 and t not in STOPWORDS][:3]
        if not toks or typ in SKIP_TYPES:
            continue
        phrase = " ".join(toks)
        if phrase in body:
            continue
        target = TYPE_TO_GROUP.get(typ, "Added")
        print(f"{typ}→{target}: {body_s}  ({h})")


# ---------------------------------------------------------------- release
def cmd_release(version, date):
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        sys.exit(f"invalid semver version: '{version}'")
    date = date or dt.date.today().isoformat()
    lines = read()
    span = unreleased_span(lines)
    if not span:
        sys.exit("no Unreleased section found at the top of the changelog")
    start, end, _ = span
    lines[start] = f"## [{version}] - {date}"
    fresh = ["## [Unreleased]", ""]
    lines[start:start] = fresh
    write(lines)
    pkg = version_from_package()
    print(f"released [{version}] - {date}")
    if pkg and pkg != version:
        print(f"note: package.json version is {pkg}; set it to {version} (or next cycle).")
    print("fresh ## [Unreleased] section created above the release.")


# ---------------------------------------------------------------- validate
def cmd_validate():
    hard_fail = soft = 0
    def report(kind, msg):
        nonlocal hard_fail, soft
        if kind == "FAIL":
            hard_fail += 1
        elif kind == "WARN":
            soft += 1
        print(f"{kind:<5} {msg}")

    lines = read()

    # 1) the first version heading must be the Unreleased section
    first = next(RE_VER.match(l) for l in lines if RE_VER.match(l))
    unreleased = "unreleased" in first.group(0).lower()
    if not unreleased:
        report("FAIL", "first version heading is not Unreleased: " + first.group(0))
    else:
        report("PASS", "exactly one Unreleased section at the top")

    toks = [RE_VER.match(l).group(1) for l in lines if RE_VER.match(l)]

    # 2) no duplicate released version headings
    released = [t for t in toks if t != "Unreleased"]
    dupes = sorted({t for t in released if released.count(t) > 1})
    if dupes:
        report("FAIL", f"duplicate version headings: {dupes}")
    else:
        report("PASS", "no duplicate version headings")

    # 3) release headings carry dates; missing or partial (historic) is a warning,
    #    not a hard fail — old sections aren't rewritten just to clear the gate.
    nodate = []    # no date at all
    partial = []   # not full YYYY-MM-DD (historic entries use e.g. '2026-08')
    for l in lines:
        m = RE_VER.match(l)
        if not m or "unreleased" in l.lower():
            continue
        rest = m.group(2).strip().lstrip("-").strip()
        if not rest:
            nodate.append(m.group(0))
        elif not DATE_RE.match(rest):
            partial.append(m.group(0))
    if nodate:
        report("WARN", f"released headings with no date: {nodate}")
    elif partial:
        report("WARN", f"released headings with partial (non YYYY-MM-DD) date: {partial}")
    if not nodate and not partial:
        report("PASS", "all released headings dated (YYYY-MM-DD)")

    # 4) package version consistency
    pkg = version_from_package()
    tok = toks[0] if toks else None
    if pkg:
        if unreleased and tok != "Unreleased" and tok == pkg:
            report("PASS", f"package.json version {pkg} matches Unreleased heading")
        else:
            report("WARN", f"Unreleased heading '{tok or 'Unreleased'}' vs package.json '{pkg}'")

    # 5) no template stubs
    stubs = [l for l in lines if re.search(r"\b(TODO|TBD|FIXME)\b", l)]
    if stubs:
        report("FAIL", f"stub/TODO lines: {stubs}")
    else:
        report("PASS", "no TODO/TBD/FIXME stubs")

    if hard_fail:
        sys.exit(f"validate: {hard_fail} FAIL / {soft} WARN")
    print(f"validate: OK ({soft} warnings)")


def write(lines):
    CHANGELOG_PATH.write_text("\n".join(lines) + "\n")


def main(argv):
    if not argv:
        sys.exit(__doc__.strip().splitlines()[0])
    cmd = argv[0]
    if cmd == "add":
        if len(argv) < 3:
            sys.exit("usage: changelog.py add <group> \"<text>\"")
        cmd_add(argv[1], " ".join(argv[2:]))
    elif cmd == "current":
        cmd_current()
    elif cmd == "backfill":
        limit = 200
        if "--limit" in argv:
            limit = int(argv[argv.index("--limit") + 1])
        cmd_backfill(limit)
    elif cmd == "release":
        if len(argv) < 2:
            sys.exit("usage: changelog.py release <version> [YYYY-MM-DD]")
        cmd_release(argv[1], argv[2] if len(argv) > 2 else None)
    elif cmd == "validate":
        cmd_validate()
    else:
        sys.exit("usage: changelog.py <add|current|backfill|release|validate>")


if __name__ == "__main__":
    main(sys.argv[1:])
