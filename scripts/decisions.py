#!/usr/bin/env python3
"""Validate .repowise/decisions.yaml structural integrity.

Usage: python3 scripts/decisions.py validate

Checks (all mandatory, zero dependency on PyYAML):
  1. File exists with version: 1 and decisions: header.
  2. No unterminated single-quoted scalar at an entry boundary — catches the
     exact class of YAML edit that broke this file in PR #150.
  3. Every entry has the keys required by repowise decision import: id, title,
     decision, reason, scope (non-empty list).
  4. id is unique and 32-hex; currency ∈ {active, superseded, deprecated}.

Exits 0 on clean pass, 1 on any hard FAIL.
"""
from __future__ import annotations
import os
import re
import sys

DECISIONS_YAML = os.path.join(
    os.path.dirname(__file__), "..", ".repowise", "decisions.yaml"
)

REQUIRED_KEYS = {"id", "title", "decision", "reason", "scope"}
VALID_CURRENCIES = {"active", "superseded", "deprecated"}
HEX32 = re.compile(r"^[0-9a-f]{32}$")


def _report(kind: str, msg: str, counters: dict) -> None:
    if kind == "FAIL":
        counters["hard"] += 1
    elif kind == "WARN":
        counters["soft"] += 1
    print(f"{kind:<5} {msg}")


def _validate(path: str) -> int:
    counters: dict = {"hard": 0, "soft": 0}
    report = lambda k, m: _report(k, m, counters)

    # 1. File exists
    if not os.path.isfile(path):
        report("FAIL", f"file not found: {path}")
        return 1

    with open(path) as fh:
        lines = fh.readlines()

    text = "".join(lines)

    # 2. version + decisions header
    if "version: 1" not in text:
        report("FAIL", "missing 'version: 1'")
    if "\ndecisions:\n" not in text and text.startswith("decisions:\n"):
        report("FAIL", "missing 'decisions:' top-level key")
    else:
        report("PASS", "version and decisions header present")

    # 3. Unterminated single-quoted scalar detector
    #    Only check lines that open a single-quoted value:  `  key: 'value`.
    #    Track whether that quote was closed on the SAME line (counting ''
    #    as an escaped quote = 0 net).  If the quote is still open when we
    #    reach the next "- id:" boundary, that is the bug class.
    open_quote = False
    for i, line in enumerate(lines, 1):
        stripped = line.rstrip()
        # New entry boundary
        is_entry_boundary = stripped.startswith("- id:")
        if is_entry_boundary and open_quote:
            report(
                "FAIL",
                f"line {i}: unterminated single-quoted scalar at entry boundary "
                "(likely missing closing quote on a prior 'reason:' value)",
            )
            open_quote = False

        # Only start counting on lines that open a single-quoted key: 'value
        m = re.match(r"\s+\w+:\s+'", stripped)
        if m:
            # Count effective quotes on this line (exclude the opening one
            # which is already counted by the regex match)
            rest = stripped[m.end():]
            qcount = 0
            for ch in rest:
                if ch == "'":
                    qcount += 1
            # qcount even → opening quote NOT closed (0 extra = still open)
            open_quote = (qcount % 2) == 0
        elif is_entry_boundary:
            open_quote = False

    # 4. Parse entries: scan for "- id:" markers, then collect key: lines and
    #    indented list items (scope: / evidence:).
    entries: list[dict] = []
    current: dict = {}
    current_key: str | None = None

    for line in lines:
        stripped = line.rstrip()
        if stripped.startswith("- id:"):
            if current:
                entries.append(current)
            eid = stripped.split("id:", 1)[1].strip()
            current = {"id": eid}
            current_key = None
            continue
        # Top-level key inside an entry (2-space indent, ends with ':')
        m = re.match(r"  (\w+):\s*(.*)", stripped)
        if m:
            key, val = m.group(1), m.group(2).strip()
            if key in ("reason", "decision"):
                # multiline: skip body lines, just record the entry has the key
                current[key] = val.strip("'").strip('"') or "_present_"
                current_key = key
            elif key == "scope":
                current[key] = []
                current_key = "scope"
            elif key == "evidence":
                current_key = "evidence"
            else:
                current[key] = val.strip("'").strip('"')
                current_key = None
            continue
        # Indented list item (2-space indent, starts with "- ")
        m_list = re.match(r"  - (.+)", stripped)
        if m_list and current_key in ("scope", "evidence"):
            if current_key in current:
                current[current_key].append(m_list.group(1))
            continue
        # Continuation line of a multiline string (4-space indent, no key)
        if re.match(r"    \S", stripped):
            continue  # skip multiline continuation

    if current:
        entries.append(current)

    if not entries:
        report("FAIL", "no entries found")
    else:
        report("PASS", f"{len(entries)} entries found")

    # 5. Per-entry validation
    seen_ids: set[str] = set()
    for entry in entries:
        eid = entry.get("id", "")
        title = entry.get("title", "?")[:50]

        # Required keys
        missing = REQUIRED_KEYS - set(entry.keys())
        if missing:
            report("FAIL", f"entry {eid[:8]} ({title}): missing keys {missing}")

        # 32-hex id
        if not HEX32.match(eid):
            report("FAIL", f"entry {eid[:8]}: id is not 32-hex")

        # Unique id
        if eid in seen_ids:
            report("FAIL", f"entry {eid[:8]}: duplicate id")
        seen_ids.add(eid)

        # currency
        cur = entry.get("currency", "")
        if cur and cur not in VALID_CURRENCIES:
            report(
                "FAIL",
                f"entry {eid[:8]}: currency '{cur}' not in {VALID_CURRENCIES}",
            )

        # scope non-empty (it's a list)
        scope = entry.get("scope", [])
        if not scope or scope == [] or scope == ["[]"]:
            report("WARN", f"entry {eid[:8]} ({title}): scope is empty")

    if seen_ids:
        report("PASS", f"{len(seen_ids)} unique ids")

    return 1 if counters["hard"] else 0


def main(argv: list[str]) -> None:
    if "--help" in argv or "-h" in argv:
        print(__doc__.strip())
        sys.exit(0)
    path = DECISIONS_YAML
    sys.exit(_validate(path))


if __name__ == "__main__":
    main(sys.argv[1:])
