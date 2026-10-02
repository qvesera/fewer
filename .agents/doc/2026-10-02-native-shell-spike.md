# Native shell spike: Tauri vs Swift — decision record

**Date:** 2026-10-02
**Ledger:** `T-039` · Issue #214 · milestone v1.0.0
**Downstream:** #250 (`T-063`, currently `blocked` by this row)
**Ruling:** **Tauri v2 (Rust) — thin shell — only for what ROADMAP lists.** Swift rejected.
**Provenance:** reasoned, **not measured**. The dev box has no `cargo` / `rustc` /
`rustup` / `tauri` / `swift` / `swiftc`, no `pkg-config`, no gtk3 (verified
2026-10-02). No benchmark in this document was run; every number below is
arithmetic on shipped code or a verbatim quote from source/docs.

**Claim key:** `MEASURED` = arithmetic / inspection of shipped code or verbatim
from source; `DERIVED` = follows from a `MEASURED` claim; `ASSUMED` = needs the
POC in §9 before it can be trusted.

---

## 1. Question

Compute-heavy paths in fewer (folder import, unarchiving, disk metadata) run in
the browser or on the localhost dev server today. Do we port them to a native
core — and if so, **Tauri (Rust) or a Swift/macOS-native shell**? And is a port
worth it *for what reason*?

## 2. Evidence base

### 2.1 Shipped-code RAM analysis — `MEASURED` (2026-09-28, from the T-055 design session)

| path | RAM today | where |
| --- | --- | --- |
| zip | **O(central directory)** | `src/lib/fewer/archiveList.ts` — `Blob.slice` reads a 512 B head, a ≤66 KB tail, then the central directory. A `Blob` is disk-backed and seekable, so a native `pread`/`mmap` gains **nothing**. |
| tar | **O(names + sizes)** | 512 B header walk with arithmetic skip (`pos += n`), zero payload bytes read. Already optimal. |
| tar.gz / gz | **O(1)** | `src/lib/fewer/archiveEngine.ts` — bounded 64 KB buffer, read + discard. But gzip is not seekable, so it must inflate **every** byte, and today it runs on the main thread. Rust buys **threads, not less RAM**. |
| 7z / rar / xz / bz2 / zst | **O(FILE)** | `archiveEngine.ts` via libarchive.js WASM — `Archive.open` copies the **whole archive** into the Emscripten MEMFS heap, under a wasm32 ceiling (2–4 GB). **The one unbounded case.** |
| the graph | **O(nodes)** | per-node path strings + edges + the derived index (#240, **MERGED** v0.7.2) live in the webview JS heap **regardless of core language**. |

**Conclusion from the numbers alone: do not port for RAM.** zip/tar/tar.gz are
already optimal; the single unbounded path is the wasm archive engine; the
largest consumer is the graph, which a language change does not touch.

### 2.2 IPC cost — `DERIVED` from official docs

> "Because this mechanism uses a JSON-RPC like protocol under the hood to
> serialize requests and responses, all arguments and return data must be
> serializable to JSON."
> — <https://v2.tauri.app/concept/inter-process-communication/>

So a command returning a whole tree serialises it to JSON. A 100k-node tree
briefly exists **3×** (Rust struct → JSON → JS objects) unless we page it or send
raw bytes. The escape hatch (`tauri::ipc::Response` / raw binary) is `ASSUMED`
until the POC measures it.

### 2.3 Platform facts — `MEASURED` against official docs (2026-10-02)

- **Thin shell is first-class config, not a hack.** `build.frontendDist`
  accepts: *"An external URL that should be used as the default application URL.
  No assets are embedded in the app in this case."*
  (<https://v2.tauri.app/reference/config/>, `FrontendDist`)
- **Official plugins** (<https://github.com/tauri-apps/plugins-workspace>):
  `fs`, `dialog`, `opener` ("Open files and URLs using their default
  application"), `global-shortcut`, `autostart`, `updater`, `single-instance`,
  `deep-link`, `shell`, `http`, `store`, `window-state`, `log`, `cli`,
  `clipboard-manager`, `sql`, `localhost`.
- **Native file watching ships inside the official `fs` plugin** — it has its own
  "Watching changes" section and is scoped like every other fs permission
  (`fs:scope-*`, allow/deny lists). No separate watch plugin needed.
- **System tray is core Tauri, not a plugin**: `tauri.conf.json` "define a tray
  icon" (`TrayIconConfig`), JS side `@tauri-apps/api/tray`.
- **Global hotkeys** → the `global-shortcut` plugin.
- **Capabilities can be scoped to remote origins** (`CapabilityRemote` in the
  config reference) — required for the thin shell; `ASSUMED` until the POC
  verifies IPC + CSP behaviour for a remote origin.
- Linux builds need WebKitGTK + system deps — why this dev box cannot build or
  benchmark either option.

### 2.4 What the app already has (the seams) — `MEASURED` against source

- `LOCAL_FS_FEATURES` — `src/lib/fewer/features.ts`, five flags, **all `false`**,
  documented as the flip point (`content/docs/deployment.md` § "Local Filesystem
  Features").
- `TreeEntry` — the unchanged wire contract. `src/lib/fewer/folderSync.ts`
  already consumes `{ tree?: TreeEntry | null }` from a route.
- `ArchiveReader` — `src/lib/fewer/archiveExpand.ts`, `(entry, fullPath) =>
  Promise<Blob | null>`, injected per origin ⇒ **a native reader is a drop-in**
  and `expandArchives` never learns where the bytes came from.
- The three localhost-restricted routes a native build would replace:
  `/api/open-folder`, `/api/open-file`, `/api/list-directory`.
- Today's "watch" is a **server crawl of public URLs + nightly email digest** —
  not filesystem watching (`src/app/api/watch/route.ts`,
  `src/lib/fewer/watchDigest.ts`, `content/docs/watch.md`). Native watching is
  therefore a **new capability**, not a port.

## 3. Options

**A. Tauri v2 (Rust shell + Rust core).** Reuses the entire web UI as-is
(`frontendDist`, local or remote). Official plugins cover every ROADMAP want.
Native libarchive via FD + `memmap2` removes the one unbounded memory case.
Costs: Rust toolchain + webview variance (WebKitGTK / WKWebView / WebView2),
IPC serialization overhead, a second build/packaging pipeline.

**B. Swift / macOS-native shell (WKWebView + Swift).** Best-in-class macOS
fidelity (AppKit menus, Spotlight, Quick Look). Costs: macOS **only** — drops
Windows and Linux entirely; the UI must be rebuilt or embedded WKWebView;
no plugin ecosystem parity; requires Xcode + macOS to build, which this box
does not have and cannot easily get; one more webview (WKWebView) instead of the
three the web app already answers to in browsers.

**C. Status quo (no shell).** Zero cost. Keeps: zip/tar/tar.gz optimal paths,
web app unchanged, no second CI. Gives up: native watching, tray, global
hotkeys, and the bounded-memory archive path.

## 4. Ruling

**Tauri v2, thin shell — and only for the reasons ROADMAP already lists.**

1. **Reach.** Tauri ships macOS + Windows + Linux from one codebase. Swift
   ships macOS. Studio trees live on both.
2. **Zero UI rewrite.** The app is already a web app; `frontendDist` accepts an
   external URL, so the thin shell is a config file plus commands. Swift means
   rebuilding or embedding a Mac-only UI.
3. **The roadmap wants are plugins, not research:** `fs` (incl. watching),
   `opener` (replaces both OS-opener routes), `global-shortcut`, tray in core,
   `updater`, `single-instance`, `dialog`.
4. **The one genuine memory bug is fixed by Rust exactly** — native libarchive
   with FD + `memmap2` replaces the wasm engine's whole-archive MEMFS copy, and
   adds zstd, which the wasm build never declared.
5. **The seams are already the migration path.** `LOCAL_FS_FEATURES`,
   `TreeEntry`, and `ArchiveReader` were designed so this port lands as a flag
   flip + injected readers, not a rewrite.
6. **Swift's only real win — macOS Cocoa fidelity — is a product call, not a
   performance one.** If we ever need a Mac-native app, that is a new product
   requirement and reopens this; it is not why the ROADMAP item exists.

Explicitly **not** the reason: RAM, UI speed, or general performance (§6).

## 5. The sizing fork for #250 (this decides its estimate)

**Thin shell (recommended).** `frontendDist: "https://fewer.directory"` — every
`src/app/api/*` route, Supabase SSR auth, Stripe billing and share links keep
working unchanged. The native layer *adds*: opener commands, scoped FS read +
dir listing, file watching, tray, global shortcuts. Small, testable, shippable.

**Bundled static (`output: 'export'`, no server).** Every `src/app/api/*` route
needs a native or sidecar equivalent; Supabase/Stripe server paths break;
CSP and auth change. Order-of-magnitude larger, and it is a **product**
decision (self-hostable offline desktop?), not an infra one. It needs its own
task after this one is decided.

> #250's current 2400 min estimate fits the **thin shell only**. If the bundled
> static fork is ever chosen, that estimate is not the same work.

## 6. Non-wins (so nobody re-litigates them)

1. **RAM for zip / tar / tar.gz.** Already optimal (§2.1); a native reader adds
   threads to tar.gz and nothing else.
2. **UI speed.** The graph lives in the webview JS heap; a native core does not
   make React Flow paint faster.
3. **Fewer dependencies for web users.** A desktop shell does not change the
   web app at all.
4. **"Rust is faster in general."** The paths that matter here are I/O-bound
   (disk reads, inflate) or already optimal.
5. **Graph-side RAM.** That is the compact/paged-tree work — architectural,
   helps web + desktop alike, unrelated to this port. Candidate for its own
   task; **not** bundled into this one.

## 7. Handoff to #250 (`T-063`) — the contract this ruling creates

1. **RPC shape.** Tree reads return **windowed `TreeEntry` payloads** —
   `list_dir(path, offset, limit) -> { entries: TreeEntry[], total }` — never the
   whole tree. Keep `TreeEntry` byte-identical as the wire type so `treeToGraph`
   is untouched. Prefer raw binary (`tauri::ipc::Response` / ArrayBuffer) or
   compact JSON; **measure both** (§2.2).
2. **Flag map** — each `LOCAL_FS_FEATURES` flag and its native replacement:
   - `openInOs` → `tauri-plugin-opener` (replaces `/api/open-folder`)
   - `openFileInOs` → `tauri-plugin-opener` (replaces `/api/open-file`)
   - `fsaDirectoryPicker` → `tauri-plugin-dialog` directory picker (webviews
     have no `showDirectoryPicker`)
   - `dragDropImport` / `dropToExpand` → the shell intercepts OS drops
     (`tauri://drag-drop`) and re-emits them as an in-app event, so the existing
     empty-canvas-import and expand-from-disk paths stay untouched.
   - The three localhost routes become dead code **in the desktop build only**;
     they stay for self-hosted web.
3. **`ArchiveReader` drop-in.** A native reader implementing
   `(entry, fullPath) => Promise<Blob | null>`; `expandArchives` unchanged. The
   **64 MB engine-format cap relaxes in one place** — only the native reader is
   exempt. Formats: native libarchive via FD + `memmap2` (incl. zstd), `rayon`
   for the many-archive folder case, no per-archive worker spawn.
4. **Watching is new, not a port.** The `fs` plugin "Watching changes" API adds
   refresh-from-disk on a watched local folder — a capability the product does
   not have today (current watch is URL crawl + email). Gate it behind the same
   opt-in shape as Look Inside Archives.
5. **Security is an upgrade.** Native FS access is **capability-scoped**
   (`fs:scope-*`, allow/deny) — strictly tighter than today's
   localhost-restricted routes. Scope to the folders the user actually granted.
6. **Instrumentation first** — verbatim #250's own stated step one:
   *"instrumenting node-count vs bytes-read on the worst real archive."* Before
   any Rust lands, this is the acceptance metric (§9).
7. **Proposed decomposition at pickup** (Tier-1 rule fires; 2–6 children; **not
   created here**):
   - native `list_dir` + windowed `TreeEntry` paging + the measured IPC shape
   - native archive reader + cap relaxation, behind `ArchiveReader`
   - `LOCAL_FS_FEATURES` flip + flag mapping in the desktop build
   - watching + tray + global shortcuts (the ROADMAP trio)
   - packaging + CI for macOS / Windows / Linux

## 8. Side findings (flag only — fixed later, zero extra scope in this PR)

1. **`ROADMAP.md:45` presupposes the answer.** It says *"port to Tauri for
   native file watching, system tray, global hotkeys, better compute"* before
   #214 had ruled. This ruling happens to match it, so no edit is needed — but
   the line was decided before the decision existed.
2. **Milestone sequencing is inconsistent.** The *decision* (#214) sits on
   **v1.0.0** ("Platform & long horizon: native shell, collaborative editing,
   GitHub PR review mode, VS Code extension") while the *implementation* (#250)
   sits on **v0.9.0** ("Studio pipeline (Tier 2, post-licensing): headless CLI,
   rule/validation engine, preflight reports, plugin system" — no native shell
   mentioned). The train that needs the ruling ships **before** the train that
   contains it. One of the two is filed wrong; that is a release-train call for
   a human, not a doc edit. Both ledger rows carry `milestone: null` — the
   issues hold the milestone.
3. **Evidence duplication.** The ~1.6k-character RAM note is pasted
   near-verbatim into both `T-039` and `T-063` ledger notes (`TASKS.yaml:1042`,
   `:1616`). **This document is now canonical**; future notes should cite it
   instead of restating it.

## 9. Deferred POC spec (build when a Rust + WebKitGTK box exists)

Goal: turn every `ASSUMED` into `MEASURED`. Timebox: one day.

1. `tauri init`; `frontendDist` → a local static export of the real app.
2. One command: `list_dir(path, offset, limit) -> { entries, total }` returning
   `TreeEntry`.
3. Instrument the three numbers below, then write them back into #250's estimate.
4. Flip `LOCAL_FS_FEATURES` in the desktop build and prove **Open in File
   Explorer** + **Import from disk** work end-to-end.

**Acceptance numbers to produce:**

- wasm engine peak RSS vs native peak RSS on the **same worst real archive** (the
  `Archive.open` O(FILE) case) — the one claim that cannot be checked from the
  browser.
- IPC wall time and peak RSS for a 100k-node tree, JSON vs raw bytes — the 3×-copy
  claim (§2.2).
- `list_dir` throughput on a deep studio tree (~100k entries) — windowing
  correctness + latency floor.

### 9.1 Results — MEASURED (2026-10-02, `T-087`, dev box: Ubuntu 24.04,
rustc 1.99.0, tauri 2.12.1, WebKitGTK 2.52.6, KDE wayland)

POC lives in `src-tauri/` (thin shell: `devUrl` → real dev server;
`frontendDist` → external URL per §5). Harness: `src-tauri/poc/bench.html`
(webview) + `src-tauri/src/bin/archive_bench.rs` (headless, release) +
`src-tauri/poc/wasm-rss.ts` (wasm engine, bun).

**1. Archive listing — worst real archives (§9 acceptance #1).**

| archive | engine | open+list wall | peak RSS (VmHWM) |
| --- | --- | --- | --- |
| 717 MB zip, 133 entries | wasm `libarchive.js` (MEMFS) | 2217 ms (open 2145 + list 72) | **4 272 572 KB (~4.1 GB)** |
| same | native libarchive (FD, data skip) | **50 ms** | **6 464 KB (~6.3 MB)** |
| 2.48 GB zip, 113 entries | wasm `libarchive.js` | — | **process core-dumped (OOM)** — MEMFS ceiling confirmed at scale |
| same | native libarchive | **15 ms** | 6 544 KB (~6.4 MB) |

Native wins ~660× on RSS and ~40× on wall time on the mid-size archive, and
is the only engine that survives the large one. The single unbounded case the
spike identified is now measured, not assumed: **the wasm O(FILE) claim is
real and it is large.** This is the strongest concrete argument yet for the
native `ArchiveReader` drop-in (T-063 child 2), including the 64 MB cap
relaxation.

**2. IPC — 100k-node tree, JSON vs raw bytes (§9 acceptance #2).**

| path | rust side | payload | webview side |
| --- | --- | --- | --- |
| JSON (`serde_json` → invoke) | 684 ms serialize | 9 034 528 B | 43 ms `JSON.parse` |
| raw (`ipc::Response` bytes) | 32 ms encode | 6 300 000 B | 71 ms receive + 72 ms decode |

`json/raw` payload ratio **1.43×**, not 3× (the 3× claim counted Rust struct +
JSON string + JS objects as simultaneous residency; the measured payload
itself is 1.43×). Caveat: Rust timings are from a **debug** build (tauri dev);
release serialize will be several× faster, which only widens the raw path's
edge on the Rust side. JS `JSON.parse` of 100k entries is cheap (43 ms) — the
spike's "IPC is JSON by default" fear is mostly a **bytes** problem (1.43×
transfer + a larger transient string), not a parse-time problem. Verdict for
T-063: windowed paging (§7.1) matters more than the wire format; if raw bytes
are used, prefer them for big pages, keep JSON for small ones. Peak-RSS
per-path inside the webview was not measurable (WebKitGTK exposes no
`performance.memory`); noted as a remaining gap.

**3. `list_dir` throughput + windowing (§9 acceptance #3).**

- `node_modules` walk: **73 195 entries / 5 980 dirs in 112 ms
  (~655 000 entries/s)** — release build, cold cache.
- `list_dir(node_modules, 0, 1000)`: **8.0 ms** full IPC roundtrip (read +
  sort + page + serialize + webview), 597 entries.
- Windowing correctness proven in-webview: `offset=0` and `offset=total-3`
  pages return disjoint, correctly-sorted slices; `TreeEntry` JSON shape
  byte-compatible with the TS type (no adapter needed).

**4. Shell integration proof (§9 item 4).**

- `LOCAL_FS_FEATURES.openInOs` / `openFileInOs` now flip at runtime inside the
  webview (`src/lib/fewer/nativeShell.ts`); the two opener call sites in
  `folderSync.ts` route to the shell's `open_in_os` command first and fall
  back to the localhost routes on web. `open_in_os("/tmp")` invoked from the
  bench page spawned `xdg-open` successfully (file manager opened).
- `webkitdirectory` input is present in the WebKitGTK webview — folder import
  from disk works with zero native code, exactly as `features.ts` predicted.
- Remaining flags (`dragDropImport`, `dropToExpand`, `fsaDirectoryPicker`)
  stay OFF — their native replacements are T-063 children, not POC scope.

**5. Box/toolchain findings (feed T-063 packaging child).**

- `#[tauri::command]` at crate root fails on rustc 1.99 (E0255, hidden macro
  reimport); the same commands inside `mod commands` compile clean. No tauri
  version bump fixes it (2.12.1 is the latest 2.x; 3.0 is alpha).
- Edition-2024 crate needs `unsafe extern "C"` for the libarchive FFI block.
- Linux deps that were actually required: `libwebkit2gtk-4.1-dev`,
  `libgtk-3-dev`, `libayatana-appindicator3-dev` (tray, future),
  `librsvg2-dev`, `libxdo-dev`, `libsoup-3.0-dev`,
  `libjavascriptcoregtk-4.1-dev`, `libarchive-dev`.
- The thin shell needed **no** API-route shims: dev-mode `devUrl` → real Next
  server keeps auth/APIs working, confirming §5's thin-shell sizing.

**Impact on #250 (`T-063`):** the archive-reader child is now justified by
measurement (660× RSS, only engine that survives >2 GB archives). The IPC
child's design constraint stands but is softer than §2.2 assumed: 1.43× bytes,
43 ms parse — windowing remains the real fix. Estimate 2400m for the thin
shell still fits; no re-estimation triggered.

## 10. What would change this ruling

- A measurable, dominant RAM/latency problem in zip/tar/tar.gz — today: none.
- Evidence that webview variance (WebKitGTK + WebView2) breaks the UI in
  practice.
- A real self-hosted/offline product requirement → the bundled-static fork, which
  is a **product** decision and gets its own task.
- A studio mandate for a Mac-native app → re-opens the Swift option on product
  grounds, not performance grounds.

---

*Prepared for `T-039` (issue #214). Ledger notes at `TASKS.yaml:1042` and
`:1616` hold the original RAM evidence; this file supersedes them as the
canonical record.*
