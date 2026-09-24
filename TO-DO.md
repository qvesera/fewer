# TO-DO

Blog-post backlog. Major features merged to `dev` get a one-line entry here (see `.clinerules/pr-dev-checks.md`). Remove entry when the post ships to `content/blog/`.

## To write

- [ ] 2026-09-14 · Theme gallery: publish saved themes to the community gallery (search, author attribution, instant Apply on the page, `#t:<id>` deep links) · feature — write alongside a future gallery/routing post.
- [ ] 2026-09-23 · Client-side tier gating (guest/free/pro): panel workspace + tags Pro-only, feature→tier table, `can()` API · feat/pro-tier-gating PR — write alongside the plans/billing post when checkout goes live.
- [ ] 2026-08-18 · v0.5.0 leftovers: file-type filters + cloud-synced settings & custom themes · 0.5.0 — two small features, one combined post.
- [ ] 2026-09-12 · v0.7.x maintenance: `profiles` grants security fix, migration verify/apply CI pipeline · PR #85–#116 — optional; only if the migration rules deserve a write-up.

## Housekeeping

- [ ] Back-export the three posts that exist only in the database (`v031-performance`, `v040-accounts`, `v050-remote-sources`) into `content/blog/`, so `scripts/gen-seed-content.py` covers every row in `content_pages`.

---

# Studio & Pipeline Readiness

Goal: make fewer viable for games, VFX, and animation studio workflows. Grouped by value ÷ cost. Each item lists the exact files to touch and the core decision so someone can pick it up cold.

## Tier 0 — Days each, pure data/architecture changes

### DCC extension taxonomy

Add studio file-type categories. Today `categorize.ts` has ~80 web-dev extensions in 9 generic buckets — zero DCC awareness.

**Files:** `src/lib/fewer/categorize.ts` (EXTENSION_MAP), `src/lib/fewer/types.ts` (FileCategory union), `src/lib/fewer/categoryMeta.ts` (CATEGORY_META)

**Add categories:** `geo` (usd/usda/usdc/usdz/abc/fbx/obj/gltf/glb/geo/bgeo), `texture` (exr/tif/tiff/psd/tx/rat/sbsar/mtlx), `cache` (vdb/abc/bgeo/sim), `scene` (hip/hiplc/nk/ma/mb/blend/max/c4d/aep), `comp` (nk/aep/exr → assign to most specific), `editorial` (edl/ale/otio/otioz/rv), `audio` (wav/mp3/ogg/aif). Keep existing `image` for web-standard png/jpg/gif/webp/svg.

**Decision:** how many new categories — whether `comp`/`editorial`/`audio` justify their own buckets or fold into `media`. The `FileCategory` union grows, so also add labels + icons in `categoryMeta.ts` (lucide-react: `Box`, `Database`, `Film`, `Music`, `Clapperboard`, `Scissors`). One PR, pure data, zero store changes.

### Frame-sequence collapsing + naming parse

A render/cache folder with 1000 frames currently renders as 1000 nodes. Parse naming conventions and collapse into one grouped node. Single biggest "not built for VFX" visual tell.

**Files:** new `src/lib/fewer/naming.ts` (pure, bun-tested), consumed in the store's graph-build path and in `categorize.ts`

**Do:** parse `v001`/`_v1` version tokens, `####`/`%04d`/numeric frame padding, UDIM tiles (`1001`–`1010`), shot prefixes (`sq010_sh020`). Collapse sequential frames into one node: `shot_0010_comp_v001.1001-1048.exr (48 frames)`. Flag frame gaps and non-monotonic version numbering.

**Decision:** where the naming parse lives (pure helper in `naming.ts` is the answer), and whether version detection happens at categorize time or at graph-build time. Frame collapsing replaces N file nodes with 1 folder-like node — must agree with `visibleRange.ts` and `graphRenderer.ts` (SVG/PNG export shows same grouping).

### Studio-aware import profiles

`VENDORED_DIRS` in `importOptions.ts` is hardcoded for web dev (node_modules, .git, dist). Studio project trees have their own noise directories.

**Files:** `src/lib/fewer/importOptions.ts` (VENDORED_DIRS), import dialog UI (dropdown to select profile)

**Add profiles:**
- *Studio project:* skip `.snapshot`, `backup`, `_publish`, `review`, `.autosave`, `maya/swatches`, `nuke/.autosave`, `renders`, `.mayaSwatches`
- *Game engine:* skip `Binaries`, `Intermediate`, `Saved`, `DerivedDataCache`, `Library`, `Temp`, `.vs`, `Content/Developer`

**Decision:** how the profile is selected (dropdown in import dialog is simplest) and whether users can add custom entries. A single `Set` per profile plus a selector in the UI.

## Tier 1 — Weeks each; changes what fewer is

### Symlink support

Symlinks are dropped entirely (`localTree.ts:55` — `if (dirent.isSymbolicLink()) continue`). Studio filesystems are built on symlinks: `latest/ → v012/`, shot link farms, Prism/SGTK publishes, USD asset resolvers. Already on the roadmap.

**Files:** `src/lib/fewer/localTree.ts` (readlink + cycle detection), both FSA walks (`fsHandleWalk.ts`, `fsEntryWalk.ts`), `types.ts` (new `linkTarget` field on `TreeEntry`)

**Do:** read symlink target with `fs.readlink`, emit a node with `linkTarget` field and link icon. For recursion: track visited inodes (`Set<ino_t>`) to prevent cycles. FSA walk has no readlink — symlinks appear as regular entries; note this in docs. `treeDiff.ts`: symlinks are just paths, no special logic needed.

**Decision:** what the node looks like (link icon badge + tooltip showing target) and whether clicking a symlink traverses it or just reveals target. Simpler version: labelled node.

### Diff v2 with change detection

`diffTrees` compares path sets only. Files re-exported in place (same path, new content) report "no change." Watch digest silently wrong for the workflow studios care about most.

**Files:** `src/lib/fewer/treeDiff.ts` (extend `TreeDiff` interface + `flattenPaths` to include `size` + `mtime`), `src/lib/fewer/watchDigest.ts` (read `modified` array), email template (show modified files)

**Extend to:** `{added, removed, modified, renamed}`. `modified` = same path, different size or mtime (no content read, privacy claim survives). `renamed` = same size + mtime, different basename (heuristic). Existing `flattenPaths` → `Set<string>` becomes `flattenNodes` → `Map<string, {size, mtime}>`.

**Decision:** whether `modified` includes mtime-only changes or only size+mtime (safer). Also: digest email full list or truncate at 200 like existing.

### Raise depth cap + add node budget

`MAX_DEPTH_CAP = 8` in `localTree.ts`, default `maxDepth: 6`. Studio trees: `show/seq/shot/task/step/app/version/element/layer` = 9+ easily. No node budget — only a depth ceiling.

**Files:** `src/lib/fewer/localTree.ts:96`, `src/lib/fewer/importOptions.ts` (DEFAULT_IMPORT_OPTIONS), both FSA walks

**Do:** raise default `maxDepth` to 10. Make unlimited path respect a node budget (e.g. 10,000). Reuse the `truncated` pattern from `autoIndex.ts` / `crawl.ts`: return `{tree, truncated}` from `buildTreeFromPath`. Show "truncated at N nodes" toast in UI.

**Decision:** default node budget (10k — large enough for a real project, small enough not to freeze the browser) and whether the depth slider goes past 8 or replaces the cap.

### Portable snapshot files

JSON export exists but isn't round-trippable with metadata. Making `.fewer` a self-contained file means a TD commits structure snapshots to git and diffs them.

**Files:** `src/lib/fewer/exportUtils.ts` (extend `buildJsonExport`), `src/lib/fewer/parsers.ts` (extend `parseJSONGraph` for enriched format)

**Do:** embed `name`, `importOptions`, `tags`, `createdAt`, `appVersion` in JSON export. `parseJSONGraph` accepts both old format (backward compat) and enriched format. Add "Download .fewer" as export option distinct from raw JSON.

**Decision:** whether `.fewer` is just renamed `.json` (simplest, zero parser changes, git diffs cleanly) or a distinct MIME type. Renamed JSON wins.

### Multi-root / compare two trees

Roadmap's "dual-pane view." Studio use case: compare asset publish vs. working, or two shots' folder conventions side by side.

**Files:** `src/store/` (new pane state), `src/components/fewer/GraphCanvas.tsx` (second canvas instance), `src/components/fewer/FewerApp.tsx` (layout orchestration)

**Do:** two graph roots in separate panes, visual diff overlay (red = only in A, green = only in B, yellow = both with different metadata). Structural diff (path presence) for v1.

**Decision:** likely a Pro feature (workspace docking gate pattern). Diff is structural for v1, metadata-aware later.

## Tier 2 — Months; fewer becomes pipeline software

### Headless CLI

Extract `src/lib/fewer/*` (already pure and bun-tested) into `fewer-cli`. Commands: `fewer scan <path> --format json|dot|md`, `fewer diff <a.json> <b.json>`, `fewer validate <rules.yaml>`. No React, no store, no browser. Pure lib makes this feasible.

**Files:** new `src/cli/` entry point, `package.json` (add `bin` field), compose from `localTree.ts`, `treeDiff.ts`, `parsers.ts`, `treeSort.ts`, `validation.ts`

**Blocked by:** licensing (AGPLv3). Also: needs `--depth`, `--extensions`, `--skip-vendored` flags matching existing `ImportOptions`.

### Rule / validation engine

The actual TD ask. Declarative rules: naming conventions (regex per path slot), required subfolders, forbidden names, version monotonicity, frame continuity. `validation.ts` exists but validates connection structure, not naming.

**Files:** new `src/lib/fewer/rules.ts` (rule definitions + eval), new `src/lib/fewer/rulesSchema.ts` (JSON Schema for rule files), `src/lib/fewer/validation.ts` (extend or compose)

**Do:** rule file (`rules.yaml` or `rules.json`) specifying: path patterns (e.g. `**/v{NNN}` must be monotonic), required dirs per shot (`comp/`, `renders/`, `plates/`), forbidden names (`.DS_Store`, `temp_*`), frame continuity (no gaps in `####` sequences). Emit report: `{rule, path, severity, message}`.

**Blocked by:** naming parser (Tier 0) and licensing.

### Preflight / intake reports

For dailies/intake: given a deliverable folder, emit "3 shots missing comps, 2 version gaps, 1 frame gap." Rule engine applied to a specific folder with a specific report format.

**Files:** new `src/lib/fewer/preflight.ts` (composes rule engine + naming parse), CLI output + HTML report export

**Blocked by:** rule engine, naming parser, CLI.

### Plugin system

Roadmap long-term. Custom node types and parsers so studios add DCC knowledge without forking. Allows third-party extensions for Shotgun/Flow, Perforce, Deadline.

**Files:** entirely new subsystem. Plugin API definition, plugin loader, sandbox model.

**Decision:** plugins in-browser (Web Workers, safer, no filesystem access) or server-side (Node worker threads, more powerful, needs permission model).

### Licensing — the strategic blocker

Without a permissive/commercial dual license or explicit AGPL exception for internal use, nothing in Tier 2 gets adopted by a studio regardless of code quality. Options: commercial license, self-hosted exception (AGPL already covers internal-only runs if the studio offers source to their own users — legal must confirm), or relicense.

**Decision:** business/legal, not technical. But gates everything above it — must happen first or in parallel.

---

## Blocking dependency chain

```
licensing ──────────────── blocks all Tier 2
naming parser (Tier 0) ─── needed by rule engine → preflight → intake
symlinks (Tier 1) ─────── needed before any studio adoption
diff v2 (Tier 1) ──────── needed for Watch digest to be trustworthy
```

# Archive (written)

- [x] 2026-09-12 · v0.6.0: community gallery, version history, unified 3-step import, accounts upgrade · `content/blog/v060-release.md`
- [x] 2026-09-05 · Tags — colored highlight rings per tag, tag filtering, tag sort · `content/docs/graph-features.md#tags` (documented, no post)
- [x] 2026-08-18 · v0.5.0: Open/Download remote sources — GitHub repos & crawled file indexes · `content/blog/v050-remote-sources.md` (DB-only)
- [x] 2026-08-10 · v0.4.0: Accounts & authentication, saved graphs, selective sharing, theme/settings sync · `content/blog/v040-accounts.md` (DB-only)
- [x] 2026-08-08 · v0.3.x: Bundle slimming + dialogs lazy-loaded (~300KB lighter startup) · `content/blog/v031-performance.md` (DB-only)
- [x] 2026-08-06 · v0.3.0: Theme Engine, 18 presets, lighter bundle · `content/blog/v030-release.md`
- [x] 2026-08-05 · Aurora Haze theme · `content/blog/aurora-haze-theme.md`
- [x] 2026-08-03 · Custom ELK layout engine · `content/blog/elk-layout-engine.md`
- [x] 2026-08-01 · First release · `content/blog/first-release.md`
