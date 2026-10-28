# Use repowise MCP for codebase context

The `repowise` MCP server is configured for this repo (`.mcp.json`). It holds a
prebuilt index of every file, symbol, dependency edge, and git signal. Use it
for context instead of grepping/reading files blindly.

## On every task, before touching code

1. Gather context via repowise MCP tools first:
   - Orient on the repo or a subsystem → `get_overview`
   - Find relevant files/symbols → `search_codebase`, then `get_symbol` for exact bodies
   - Understand how a file works / what touches it → `get_context`
   - "Why is this like this?" / git archaeology → `get_why`
   - Before risky edits → `get_risk`; check reachability → `get_dead_code`
2. Only read files directly to fill gaps the index can't answer (exact current
   bytes, uncommitted changes).
3. If answers look stale after large changes, run `repowise update` in the repo
   root and retry.

Do not skip this step even for small tasks — one `search_codebase` call is
cheaper than crawling.

## Health numbers need fresh coverage

`get_health` folds measured coverage into its defect findings; with no coverage
ingested it falls back to *inferred* `untested_hotspot` guesses, which dominated
the ranking before T-182 (hundreds of findings, most of them wrong once real
data landed: the count fell to 5). Refresh the ingest whenever the test suite
changes shape:

```bash
bun run health:coverage                        # bun test --coverage → lcov → repowise coverage add
repowise health --format json > /tmp/health.json   # recompute after ingest
```

Two reading notes for `get_health` output:

- **Non-code files count.** `TASKS.yaml` reads as the #1 "untested hotspot"
  (14.4% of the repo gap, "108 dependents") — a YAML ledger, not code.
  `repowise health` has no exclude flag, so judge progress by the **code-only**
  average — `kpis.average_health_code_only` from the MCP `get_health` call
  (the CLI's JSON does not emit it).
- **Verify the plan before executing it.** At least one stored finding was
  stale: `localTree.ts` was ranked for `serial_await_in_loop` while the code
  already uses `Promise.all`. Check the cited lines before refactoring for a
  finding.
