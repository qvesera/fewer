# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Fix crash on New File button**: right-clicking a folder/file with no data source loaded (`dataSource` is `null`) still crashed with `Cannot read properties of null (reading 'startsWith')`. The earlier empty-graph fix only guarded `providerLabelFromSource`; the crawled-file check in `FileEntryContextMenu` now null-guards too.
- ASCII tree imports are now header- and footer-aware: the "Directory Tree Structure" title, the "Created with fewer" credit line, and trailing "N directories, M files" style summaries are stripped instead of being imported as phantom nodes.
- Selecting a node now highlights only its ancestor-path edges (from the node up to the root parent) instead of every incident edge — child edges are no longer colored when a folder is selected.
- Highlighted ancestor-path edges now render on top of crossing default edges again — the sort comparator was inverted, so highlighted edges were ordered at the front of the array and painted underneath grey edges at intersection points. The highlight sort is corrected and the tree sort (relayout/connect/import) now keeps raised edges last.
- PNG/SVG exports now match the live canvas: theme colors (light/dark/custom), full node cards (folder header + child rows + footer, file icon + extension/size), per-style edge geometry (curved/angled/straight) with width/dash pattern and correct anchors for TB/LR/RL/BT layouts, and the selected-folder glow ring. Hidden nodes are no longer emitted into image exports.
- Fixed a crash when deleting a parent node that had hidden children: the deleted subtree stayed in the hidden-nodes list, and building the Hidden panel read an undefined node and threw TypeError on hiddenTreeSort. Deleting a parent now also purges its children from the hidden/auto-hide/reveal view-state (they're removed, as expected), and the hidden-tree builder ignores stale ids defensively.
- Client-side input validation: every user-text field saved to the database (account profile, saved-graph names, gallery title/description, custom-theme names) now rejects non-string / broken-interpolated values like "null", "undefined" and "[object Object]", trims surrounding whitespace, and enforces length caps before submitting.
- Prevent '@' in usernames: a username containing '@' collided with the login flow's email-vs-username detection (which keys off '@') and could never be used to sign in. Usernames are now rejected on save (client and server) if they contain '@'.
- Signing in with a username now logs the user in immediately: /api/login returns the signed-in session, and the login dialog pushes it into the browser auth client via setSession (firing onAuthStateChange) so the app reflects the signed-in state without a page refresh. The session is only returned after a successful password check, so it doesn't introduce account enumeration.

### Added

- Exports now carry a "Created with fewer — <url>" credit by default: a clickable watermark in corner of SVG/PNG, a comment line in CSV/DOT/sh/bat, a footer line in the ASCII directory tree, and a meta.generatedBy field in JSON. A toggle in the Export panel turns it off.
- Version history for saved graphs: each save keeps an automatic snapshot of the graph (deduped + capped at 50 per graph), restored or deleted from a new History button on each saved graph. Restore loads the version as unsaved changes - hit Save to keep it. New graph_versions table (migration 0017) + /api/graphs/[id]/versions routes.
- Public community gallery: signed-in owners can opt a public share into the gallery (toggle + title/description in the Share dialog). Browsed logged-out at /gallery (new /api/gallery listing with pagination); clicking a card opens the graph in the app. Unshare instantly delists. Migration 0018_gallery.sql adds in_gallery/gallery_title/gallery_description/node_count to shared_graphs.
- Save dialog now has a Destination picker: create a new saved graph, or update an existing one by selecting it - updating keeps the graph's share link and records a fresh version history snapshot instead of always making a new graph.
- Settings gains a dedicated Account tab (separate from About): signed-in users can save a first name, last name, and username — stored per account in the new owner-only `profiles` DB table (migration `0019_profiles.sql`, `/api/profile`) — and it keeps the Sign out and Delete account actions in the same tab. Usernames are unique (case-insensitive) — enforced by a partial unique index (migration `0020`) and a friendly "already taken" error in `/api/profile`.
- Login now accepts a username OR email: the sign-in dialog has an Email/Username picker, and username credentials are resolved to the account email server-side in a new POST /api/login (service role, profiles table) before Supabase's normal email/password auth. Failed attempts return a single generic message so the endpoint can't be used to enumerate accounts.

### Changed

- Share dialog: when 'List in the public gallery' is on, the action becomes 'Publish to gallery' and the manual copy-link field hides (the graph is live at /gallery instead); publishing shows a confirmation toast.
- Share dialog: 'Anyone with the link' is now a switch you can toggle off, and sharing defaults to off - so the default state is private (no sharing) without a separate 'Private' option. Both 'Anyone with the link' and 'Invite only' switches are mutually exclusive toggles; turning both off makes the graph private.
- Share dialog: the access toggles now switch off when clicked (clicking the row no longer overrides the toggle, so you can turn a toggle back off), and the redundant footer Close button is removed - the dialog still closes via the corner X or clicking outside.
- Updating a saved graph with no actual changes is now detected (order-independent deep compare of the snapshot vs the saved data): you're told 'no changes - no new version added' and nothing is written, instead of silently bumping the timestamp. Version-history dedupe now uses the same canonical comparison, so identical snapshots can't spawn duplicate versions.

### Security

- Server-side input validation: the /api/profile, /api/graphs, /api/themes and /api/share routes now re-validate every user-text field with the same shared validator the client uses, rejecting non-string / broken-interpolated values ("null", "[object Object]", control characters) with a 400 before anything is written to the database.
## [0.5.0] - 18th August 2026

### Added

- **Open URL/GitHub files & folders at their source**: files/folders imported from a GitHub repo or a public file index now carry a source `webUrl`, so the right-click menu's **"Open in GitHub"** (or **"Open in `<host>`"** for a public index) opens the real location in a new tab — the file-explorer analog for remote sources. Folders open GitHub's tree view, files the blob view; public-index entries point at their listing or direct item URL. `treeToGraph` already copied `webUrl` through, but the two importers (`/api/github-tree`, `crawl`) never populated it and the provider label fell back to "Provider"; both are fixed.
- **Download crawled files instead of opening them**: for files imported from a public file index (via URL → crawl), the right-click menu now offers **Download** (saves the raw file) in place of "Open in <site>", which just navigated to the raw URL and downloaded it anyway. Folders from an index and everything from a GitHub repo keep **Open in GitHub / Open in <site>**. Downloading fetches cross-origin where CORS allows (so the saved name is controlled); otherwise it falls back to the browser's native link behavior.
- **Hide paid-certification cloud providers in the UI**: the Cloud panel's link options are now limited to **GitHub**; the providers that require paid OAuth app certification — **OneDrive**, **Google Drive**, **SharePoint**, **Azure DevOps**, and **Azure Blob** — are no longer offered for linking, because we aren't funding that certification right now. The adapters stay intact (any already-linked accounts continue to work and can still be unlinked, and remain browseable/importable); re-enable by dropping them from the `HIDDEN_PROVIDERS` filter in `CloudPanel.tsx`.
- **Custom minimap position**: the minimap's Position picker in Settings → Appearance now includes a **Custom** option alongside the four corners. Selecting it reveals **X** and **Y** sliders (each also clickable to type a precise pixel value) that pin the minimap to an exact spot on the canvas — the chosen coordinates are locked in place until you adjust them. The slider bounds track the live canvas size (max = canvas size minus the minimap, so it stays fully on-canvas) rather than a hardcoded pixel cap; the typed number input can always go beyond them. The custom offset is persisted alongside the existing minimap size/position, both in the synced account/machine settings (`user_settings` + localStorage) and in saved-graph snapshots.
- **Filter by file type (extension category)**: the Graph Analytics sidebar's "By category" bars are now clickable to filter the canvas — clicking a category (e.g. Text) hides every file of another type through the existing hide-node mechanism (adding them to `hiddenIds`, so they show up in the Hidden panel and respond to Reveal All / undo), while keeping the folder tree. Empty folders in the tree stay visible. Clicking the category again or "Clear filter" restores the full view, and Reveal All also clears the filter. The active filter also applies to search (results are narrowed to the chosen type, with an in-panel filter chip to clear it). Filtering is driven by the existing extension→category mapping and composes with the search highlight/dim behavior.
- **Filter menu in the search bar**: the navbar search input now has a filter icon (top-right) that opens a dropdown listing every file-type category with live counts — pick one to filter the graph + search to that type, pick it again or "Clear filter" to reset. The active filter also highlights the search icon in the primary color. Category metadata (labels/icons/colors) was extracted to a shared module reused by the Graph Analytics panel.
- **Rename commits on focus-out**: clicking away from the in-canvas/sidebar rename field now commits the typed name immediately instead of waiting for Enter — so your last typed name isn't lost when you click elsewhere. Existing validations still apply (empty names are rejected, duplicate sibling names are blocked). Leaving the field without editing anything just closes it.
- **Cloud-synced user settings**: app-level preferences — theme (mode + custom theme), layout/appearance (direction, edge style/width, corner radius, node size), display (minimap, show-files, display depth, auto-hide threshold, file nodes), import options, export settings, and sidebar state — are now persisted per account (`user_settings` row, RLS owner-only) and auto-synced to the cloud for signed-in users; they're also kept in localStorage so guests and offline sessions still retain them. New `/api/settings` (GET/POST) and migration `0015_user_settings.sql`.
- **Save & reuse custom themes in the cloud**: signed-in users can now save the current custom theme under a name to their Supabase account (new `saved_themes` table + `/api/themes` CRUD, owner-only via RLS). The theme editor's preset dropdown gains a new **Custom** heading listing the user's saved themes — click one to instantly apply it, or delete it. The editor's Export/Import buttons were replaced with a single **Save** action (name prompt).
- **Import options are now remembered**: the import-flow options were lifted out of dialog-local state into the store, so your last-used import preferences persist and sync across sessions/devices.
- **Default theme follows the device**: on first load (no saved preference) the app uses the device's light/dark scheme (`prefers-color-scheme`), and the Settings → Appearance Light/Dark selection reflects the theme actually applied.
- **Env sync tool (`scripts/env-sync.ts`)**: a zero-dependency dev script that treats `.env` (production) and `.env.local` (non-production) as the single source of truth for all 19 code-referenced environment variables. `bun run env:check` validates every variable against a registry (source file, secret/public, Netlify scope, GitHub target) and flags missing or placeholder values; `bun run env:sync` pushes to Netlify (`netlify env:set` per deploy context + scope, `--secret` for secrets) and GitHub (`gh secret set` / `gh variable set`). Added `env` and `env:check` npm scripts. Documents `NEXT_PUBLIC_HOME_URL` in `.env.example`.
- **Further privacy & terms transparency**: named **Web3Forms** (bug-report delivery) in the privacy policy's data-sharing table, provider-links list, and "Data You Provide" section, and in the Terms §8 third-party list — closing the one real transparency gap (bug reports send user report text + browser/graph diagnostics to a processor that wasn't disclosed). Added a "Transparency about environments" note disclosing that dev/preview/stage builds run on a separate non-production database. Bumped the "Last updated" date on both policies to August 15, 2026.
- **Separate non-production Supabase database**: dev/preview/local builds now use a dedicated `fewer-dev` Supabase project (`aorhvfihnjhpxgjiacfg`, ap-south-1) instead of sharing the production `fewer` project (`rzzbhboedvezamqjjuoe`). All 14 migrations run on both. `.env.local` (local dev) and Netlify **deploy previews + branch deploys** point at `fewer-dev`; production stays on `fewer`. Added `[context.deployment-preview]` and `[context.branch-deploy]` environment overrides to `netlify.toml`, plus an env table and guidance in `/docs/deployment`. This makes it impossible for a PR/preview to read or write real user data.
- **Delete account option**: signed-in users can now permanently delete their account and all related data from the Settings → About panel (a danger-zone card with a destructive confirmation dialog, shown only when signed in). A new server-only `DELETE /api/account` route authenticates the user from their session cookie, deletes their owned shared graphs (via the service-role client, cascading to share invites), then deletes the auth user via the Supabase admin API — `saved_graphs`, `watched_indexes`, and `cloud_connections` are removed automatically by their `ON DELETE CASCADE` foreign keys. Services without `SUPABASE_SERVICE_ROLE_KEY` configured return a clear error rather than silently failing. This makes the Privacy Policy's "delete your account" promise real, and the policy's listed retention/rights text now reflects an in-app self-serve path.
- **Public marketing homepage at `fewer.directory`**: new static homepage (`src/app/welcome`, with content in `src/components/marketing/`) introducing the brand, describing the app's functionality (visualize, explore, edit, export, share, cloud import, watch digests, themes), and a "Your data stays yours" transparency section explaining exactly what data fewer requests and why (runs locally; optional sign-in for saved graphs/sharing; scoped OAuth cloud connections; opt-in watch URLs; no selling/trackers/telemetry). Served at the apex domain without requiring login.
- **Dedicated privacy policy page at `/privacy`**: renders the existing `content/docs/privacy.md` in the new marketing layout, giving a clean, crawlable URL for verification/consent screens (`https://fewer.directory/privacy`).
- **App moved to `/app`**: the root route `/` now always serves the public marketing homepage (see `src/app/page.tsx`), and the interactive app lives at `/app` (see `src/app/app/page.tsx`). `app.fewer.directory`/`fewer-directory.netlify.app` redirect their root to `/app` (Netlify redirect rules with a `Host` header condition), so the app domain still lands on the app. `www.fewer.directory` redirects to `fewer.directory`. This path-based split is robust (it does not depend on middleware running for prerendered pages).
- **`www.fewer.directory` → `fewer.directory` redirect**: handled in middleware (308) and via a Netlify redirect rule with a `Host` header condition.
- **GitHub Actions CI**: added `.github/workflows/ci.yml` running lint, typecheck, tests, and build on every PR to `main`/`dev`. Uses `bun` (`oven-sh/setup-bun`, `bun install --frozen-lockfile`) to match the project's bun-based scripts and lockfile.
- **Index change digests**: signed-in users can watch a public file index and get one consolidated daily email (23:59 UTC) listing everything added/removed across their watched indexes. New "Watch for changes" toggle in the Import URL dialog, a "Watched" tab in Settings, /api/watch (GET/POST/DELETE) CRUD, and /api/watch/run cron job (service-role + x-cron-secret protected) that crawls, diffs against the stored baseline, and emails via Resend - skipping days with no changes. Netlify scheduled function netlify/functions/watch-digest.ts (59 23 \* \* \*). Migration 0010_watch_indexes.sql; crawl engine extracted to src/lib/fewer/crawl.ts; new src/lib/fewer/treeDiff.ts. Env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
- **Cloud connections (OAuth account linking)**: signed-in users can link cloud accounts — GitHub, Google Drive, OneDrive, SharePoint, Azure DevOps, Azure Blob — and browse/import their folders into the graph. All six provider adapters implemented (`src/lib/fewer/cloud/providers/`: github, google, microsoft [OneDrive/SharePoint/DevOps/Blob]). Cloud management lives in Settings → Cloud tab; Cloud Browser dialog offers lazy folder navigation (repos/drives/sites/orgs/containers as roots) + depth-limited import; "Open in provider" context-menu action on imported nodes opens the folder/file in its provider in a new tab. Server-side OAuth: `/api/cloud/connect` (redirect to provider consent), `/api/cloud/callback` (exchange code, encrypt+store tokens), `/api/cloud/connections` (list/unlink), `/api/cloud/list` (lazy folder listing), `/api/cloud/tree` (build subtree). Tokens encrypted (AES-256-GCM) via `CONNECTIONS_ENCRYPTION_KEY`, owner-only RLS, auto-refresh on expiry. Migration `0011_cloud_connections.sql`. Env: CONNECTIONS_ENCRYPTION_KEY, GITHUB_CLIENT_ID/SECRET, GOOGLE_CLIENT_ID/SECRET, MICROSOFT_CLIENT_ID/SECRET/TENANT, AZURE_BLOB_STORAGE_ACCOUNT. Docs: `/docs/cloud` + OAuth setup (incl. Entra tenant-type + admin-consent troubleshooting) in `/docs/deployment`.
- **Microsoft app verification**: added `public/.well-known/microsoft-identity-association.json` so the listed Azure AD app (`MICROSOFT_CLIENT_ID`) can be verified by Microsoft Publisher Domain verification.
- **Persistent share links**: a logged-in owner's share link no longer expires (previously it got the same 30-day TTL as anonymous shares). Anonymous shares keep the TTL; a NULL `expires_at` means never. Migration `0013_persistent_shares.sql`.
- **Pin saved graphs**: star a saved graph to float it to the top of "Your Directories". Optimistic toggle via new `PATCH /api/graphs/[id]`; the list sorts favorites first. Migration `0014_saved_graphs_favorite.sql`.
- **Shared badge in the saved list**: each saved graph shows a globe (anyone with link) or mail (invite-only) badge when it has an active share, so share status is visible without opening the dialog. `GET /api/graphs` now returns per-graph share info.
- **Privacy Policy & Terms of Use**: new legal pages at `/docs/privacy` and `/docs/terms` (rendered from `content/docs/privacy.md` and `content/docs/terms.md`), a "Legal" section in the docs sidebar, and a site footer with Privacy/Terms links added to `DocsLayout`. The `MarkdownRenderer` now supports blockquote rendering and skips HTML comments (used for operator-only "get legal review" notes that stay out of the user-facing page).
- **Empty-canvas quick actions**: the "No directory loaded" state now offers **Import** and **Load sample** buttons, so a first-time visitor can get started from the canvas itself instead of finding the sidebar. Added `onOpenImport`/`onLoadSample` props to `GraphCanvas` (wired from `FewerApp`).
- **Alt+S to save the current graph**: pressing **Alt+S** saves the graph — it opens the same save dialog as the (now "Save Graph") sidebar button when signed in, and prompts sign-in when signed out. `KeyboardShortcuts` dispatches a `fewer-save-graph` window event that `SavedGraphsPanel` listens for.
- **Clear canvas from the canvas context menu**: right-clicking empty space now offers **Clear Canvas** to wipe all nodes/edges at once (mirrors the existing "Clear canvas" shortcut).
- **Platform-aware shortcut labels**: the navbar search hint and the shortcuts dialog now show Mac-native modifiers (**⌘ / ⌥**) on Mac/iOS and **Ctrl/Alt** elsewhere, and the four navigation arrows render as consistent lucide icons instead of raw mono glyphs. New `src/lib/fewer/platform.ts` (`isMac()`).

### Changed

- **Open local files in their OS default app**: a file of any type now opens in the OS app assigned to its type (via `open`/`start`/`xdg-open`) instead of downloading in the browser; the browser object-URL fallback is used only for types the browser can render inline. Previously unresolvable imported paths (saved/cloud graphs) now work because the root's absolute path is resolved once (searching sibling-of-app, app root, or home) and stored with the graph as `localRootPath` for direct reopening.
- **Node positions are retained when loading**: loading a saved graph from the cloud or opening a shared link preserves the saved node positions. Graph/settings loads no longer re-run the tree layout, the settings-sync apply no longer re-lays out a loaded graph, and GraphCanvas' initial auto-relayout is skipped for position-preserved loads.
- **Loading a saved/shared graph no longer overrides your theme**: theme is an account-level preference; custom-theme colors are only injected in Custom mode (fixes the dark-vs-custom orange/accent mismatch).
- **Sidebar share icon**: the saved-graph Share action in "Your Directories" now uses the share icon instead of a link icon.
- `NEXT_PUBLIC_APP_URL` now points at `https://app.fewer.directory` (used by OAuth callbacks at `/api/cloud/callback`, share links, and the scheduled watch-digest function). Local `.env.local` stays `http://localhost:3000`.
- `netlify/functions/watch-digest.ts` fallback app URL updated to `https://app.fewer.directory`.
- Removed the `/* → /index.html` catch-all redirect from `netlify.toml` (the root page is now dynamic; the Next.js plugin handles routing/404s).
- Docs, blog posts, README, and legal pages updated to reference `app.fewer.directory` as the app while keeping `fewer.directory` as the homepage. `content/docs/deployment.md` documents the homepage-vs-app domain split.
- **Unified import shortcut + keyboard-friendly dialog**: importing now uses a single **Alt+I** shortcut that opens the unified import flow (folder / file / URL / cloud are all picked inside it). The old `Alt+U` and `Alt+L` shortcuts (which dispatched events with no listener after the flow rewrite) and their docs/dialog entries were removed. The import dialog is now keyboard-driven throughout: step 1's origin picker is a roving-tabindex `radiogroup` with **arrow-key** navigation (auto-focuses on open); pressing **Enter** advances — on step 1 **folder** jumps to step 2 while **file**/**URL**/**cloud** focus the format tiles / address field / linked-account list, on step 2 it moves to the summary, and on step 3 it starts the import (buttons/inputs keep their own Enter). The file format tiles and cloud account list support arrow-key navigation, and steps 2–3 show a small "Press Enter" hint.
- **Responsive default layout direction**: on screens smaller than 1.5k (2560×1440) the initial layout direction is now LR (wide layout fits better on smaller/portrait displays); on 1.5k and larger it stays TB. SSR/headless still defaults to TB, saved graphs and the sidebar control can override.
- **Default edge style is now Angled**: new graphs render with `smoothstep` (angled) edges on page load instead of curved. The default `edgeStyle` in the store changed from `curved` to `angled`; existing edges are still re-derived from the selected style, and the sidebar control is unchanged.
- **Open local files in their default app**: "Open File" (file context menu + Enter shortcut) for a directory import now opens the file in the OS app assigned to its file type instead of in the browser. It POSTs the node's `data.path` to the new `/api/open-file` route, which resolves it to a real path on the dev machine and hands it to `open` / `start` / `xdg-open` (shared helper `src/lib/fewer/openInOs.ts`, also used by `/api/open-folder`). Falls back to opening in the browser (object URL) when the path can't be resolved on the server or no live file handle is available. Also fixes the Enter shortcut, which previously read a removed `node.data.fsHandle`.
- **Import options wording**: the advanced "Include node_modules" option is relabeled **"Include dependency & build folders"** — it controls all generated/vendored dirs (`node_modules`, `dist`, `build`, `.git`, …), not just `node_modules`. Docs corrected so the hidden-files and vendored options are described accurately.
- **Cloud import auto-selects the viewed folder**: the folder you're currently viewing (breadcrumb position) is selected for import automatically — the "Select the folder you're viewing" button is removed. Selecting a specific subfolder without opening it still works via that row's Select action.
- **Settings tabs**: horizontally scrollable tab bar with icons (scrollbar hidden); selecting a tab auto-scrolls it into view. **Watched** and **Cloud** tabs only render for signed-in users.
- **Cloud entry point moved**: account connections live in Settings → Cloud; the cloud **import** browser is a sidebar option (File & Actions → Cloud, next to File/URL).
- **Cloud import UX**: the cloud browser now uses the shared import options panel (max depth, hidden files, vendored dirs, empty folders, extensions, file nodes, display depth) instead of a single depth field; empty states guide signed-out users to sign in and unlinked users to Settings → Cloud.
- **Unified 3-step import flow**: every import — folder, file, URL, cloud — now follows exactly three steps: select origin → configure options → import. One `ImportFlowDialog` replaces the four separate dialogs; step 1 picks the origin and its source (device folder, ASCII-tree/JSON/script payload, URL + watch toggle, or cloud account + folder browser), step 2 is the single shared `ImportOptionsPanel` for all origins, step 3 confirms and runs the per-origin action. File imports now actually honor the import options (filtering, file nodes, display depth), cloud imports honor the scan-depth option, and all sidebar/shortcut entry points preselect their origin in the same flow. Sign-in and Settings detours stack on top without destroying flow progress; closing is blocked while an import is in flight. Also fixes the options panel's extension filter input (commas no longer eaten while typing) and dedupes URL-import error/truncation reporting via a synchronous hook snapshot.
- **URL and Cloud import origins are sign-in gated**: the unified import flow's origin picker shows Folder and File to signed-out users; URL and Cloud origins appear only for signed-in users (they depend on a linked/authenticated account).
- **Removed the options summary from the import flow's step 2**: the shared options panel no longer includes the collapsible "Summary" block — the step-3 confirmation screen already shows the chosen options compactly.
- **Power user options are now sign-in gated**: advanced features (advanced import options, extra export formats, advanced layouts, node/edge tools, analytics) are available only to signed-in users. The "Power User Mode" toggle is removed — the flag now tracks auth state, so it's on for signed-in users and off for everyone else. `advancedModeEnabled` is no longer persisted in saved-graph snapshots.
- **SSR-safe default layout direction**: the store now initializes layout direction to the isomorphic **TB** (no `window` read during render, matching the SSR/headless default), and the Sidebar applies the responsive **LR** default once on the client for screens smaller than 1.5k — skipping when a graph is already loaded (e.g. a shared URL) so a load's own saved direction is never clobbered. Fixes a potential SSR/client hydration mismatch in the previous `defaultDirection()`-during-store-creation approach; `defaultDirection` is now exported from `layoutSlice`.
- **Tutorial dialog unified**: the separate desktop flat-checklist layout is removed; the tutorial is now the same **step-through wizard** on all screen sizes with a consistent live progress count.
- **Drop duplicate legal page H1s**: removed the `# Privacy Policy` / `# Terms of Use` headings inside `content/docs/privacy.md` / `terms.md` (the docs layout already titles each page, so they appeared twice). Getting-started now notes that the context menu also opens via **long-press** on touch.

### Removed

- `ImportDialog`, `ImportFromFileDialog`, `ImportUrlDialog`, `CloudBrowserDialog` and orphaned `ImportProgress` — replaced by the unified `ImportFlowDialog` (see Changed → Unified 3-step import flow).

### Fixed

- **Fixed `package.json` invalid JSON**: the `env`/`env:check` script additions left a trailing comma after the last script entry, which broke `bun next build` (`Expected double-quoted property name`). Removed the trailing comma; build passes again.
- **Import dialog buttons use the theme**: the Import flow's Continue/Import buttons no longer hardcode the orange→amber gradient banner; they now use the app's standard primary button styling (`bg-primary`) so they follow the active theme like every other primary control.
- **Scroll wheel now pans the canvas (Ctrl+scroll zooms)**: a plain mouse-wheel/trackpad scroll moves the graph vertically on the Y axis, and holding **Ctrl** while scrolling zooms in/out. This replaces the previous default where scrolling zoomed directly.
- **Restarting the tutorial now truly resets progress**: restarting the interactive tutorial from Settings also resets the wizard's current step back to the beginning (and replays the animated node demo). Previously it cleared the completed-steps checklist and dismissal flag but kept the local step position — so the tutorial resumed from wherever you left off instead of starting over.
- **Error toast text is always white**: destructive (error) toast notifications now render their title and description in pure white regardless of the active theme — the destructive variant no longer depends on the theme's `--destructive-foreground` token, and the description's opacity is lifted to 100% for that variant.
- **Show/hide password toggle**: the auth dialog's password field now has a small eye icon to reveal or mask the password while typing.
- **Typing continues in search after clicking the panel**: clicking the empty "Start typing to search files & directory structures..." area (or any non-interactive part) of the Ctrl+F search dropdown now refocuses the search input instead of dropping focus — so you can keep typing straight into the box (navbar input on desktop, in-panel input on mobile). Interactive elements like the clear button and result rows still work normally.
- **Opening an unsupported file type no longer downloads it**: it now opens in the OS default application, or fails cleanly with a toast when no local path is available.
- **Custom-theme colors no longer leak into Light/Dark mode**: previously applying saved/graph settings injected custom CSS variables (e.g. a different folder-orange accent) on top of the built-in palettes.
- **`app.fewer.directory` now lands on the app**: the app origin's root redirects to `/app` in `middleware.ts` (302) instead of relying on Netlify `Host`-conditioned redirect rules, which were not honored for these custom domains in production (the root served the marketing homepage). The `www.fewer.directory` → apex redirect already ran in middleware, confirming middleware executes, so the routing move uses that same reliable path.
- **Google Drive OAuth scope reduced to minimum**: the Drive cloud adapter now requests `https://www.googleapis.com/auth/drive.metadata.readonly` instead of `drive.readonly`. The app only reads file/folder metadata (names, types, sizes, web links) to build the graph and never touches file contents, so the narrower readonly-metadata scope satisfies the Google OAuth "minimum scopes" verification requirement. Deployment docs updated accordingly.
- **App no longer crash-loops when Supabase isn't configured**: `useAuth` called `getBrowserSupabase()`, which throws when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are missing. On a build without those env vars (e.g. CI), the throw during mount cascaded so the UI kept remounting (`element was detached from the DOM`) and nothing was interactive. `useAuth` now catches missing-env and stays signed out, so the graph visualizer loads normally and cloud features just report unavailable.
- **Hidden Nodes panel ordering**: the sidebar Hidden Nodes list showed items in reverse alphabetical order (it inherited the store's edge array order). Roots and children are now sorted with the app-wide convention — folders first, then labels A→Z — matching folder cards, imports, and layout.
- **Open in File Explorer on Windows**: the "Open in File Explorer" action failed on Windows. The server route ran `explorer "C:\path"` through `exec`, but `explorer.exe` doesn't strip quotes from its own argument, so paths with spaces (or the surrounding quotes) failed to open. The route now uses `spawn` with a `cmd /c start "" "<path>"` argument array (no shell quoting mangling), which reliably opens the folder; macOS/Linux paths are unchanged.
- **Animated edge dashes no longer reset/jerk**: the animated dashes ran a per-edge CSS animation that restarted from zero every time an edge (re)mounted — with `onlyRenderVisibleElements` on large graphs, edges crossing the viewport boundary remount constantly, so the dashes kept snapping back. The fixed keyframe cycle also visibly jumped every loop whenever the dash pattern period didn't divide it — notably for `@xyflow/react`'s fallback `stroke-dasharray: 5` (period 10), which edges get when they carry no inline dasharray (e.g. toggling animation on from solid stroke). Edges are now driven by one shared rAF clock (`src/lib/fewer/dashClock.ts`) writing `--gm-dash-offset` on `<html>`: remounted edges inherit the current phase, the offset wraps only at a common multiple of every dash period (12,000px ≈ every 10 minutes, invisible), and React Flow's own `dashdraw` animation is suppressed. `setEdgeAnimated` now writes an explicit dash pattern onto the edges so nothing falls back to the library's 5-5 dashes. The clock runs only while animation is enabled and respects `prefers-reduced-motion`.
- **Undo/redo overhaul**: undo/redo now works correctly across every graph-mutating action. Previously node-drag undo deleted the whole graph, and delete/cut/connect/edge-delete undo were no-ops or worse (connect undo removed the child node). Each action now uses a dedicated history op: `remove-subtree` (delete/cut restores the subtree on undo), `connect` (removes the edge and restores paths without deleting the child), `remove-edges` (restores deleted edges), `move-positions` (restores dragged positions), `resize` (restores dimensions), `collapse-batch` (collapse/expand-all restores each folder's prior collapsed state), and `view-state` (hide/show, show-files, max-display-depth, auto-hide-threshold). Undo/redo also restores `hiddenIds`/`showFiles`/`maxDisplayDepth`/`autoHideThreshold` alongside nodes/edges. New `src/lib/fewer/history.test.ts` covers round-trips for all op types. Undo/redo no longer re-runs the graph layout, so restored nodes keep their exact positions and parent relationships.
- **Fix crash on empty graph**: right-clicking a folder/file with no data source loaded (`dataSource` is `null`) crashed with `Cannot read properties of null (reading 'startsWith')`. `providerLabelFromSource` now accepts `null` and falls back to a generic "Provider" label.
- **Fix delete→undo dropping surviving edges**: undoing a node delete restored the deleted subtree but replaced the whole edge list with only the restored edges, dropping every edge that belonged to nodes that were _not_ deleted (so sibling folders/files lost their connections). `remove-subtree` undo now merges the restored edges back into the existing edge set. New `src/lib/fewer/deleteUndo.test.ts` covers a 3-level delete→undo round-trip plus delete→redo→undo.
- **Fix undo not re-rendering the canvas**: undo/redo restored nodes/edges in the store but did not bump `graphVersion`, and the React Flow canvas only re-syncs from the store when `graphVersion` changes — so a restored node was in the store but invisible on the canvas. Undo/redo now increment `graphVersion`, forcing the canvas to refresh.
- **No automatic fit-zoom**: the canvas no longer auto-fits the view when the graph changes (parent/unparent, undo/redo, add/delete, or any layout/edge-style change). Previously a `graphVersion` change triggered a `fitView`, which was disruptive when parenting/unparenting nodes. Fit is now only applied on initial load and via explicit user actions (Fit View button/shortcut, zoom-to-selection). Removed the now-dead `_skipNextFitView`/`skipNextFitView` mechanism that existed only to suppress that auto-fit.
- **Unparenting updates node paths**: removing a parent→child edge now rewrites the child's path (breadcrumb) back to a root-level path instead of leaving the stale `parent/child` breadcrumb behind. Descendants under the unparented node are rewritten too. Undo restores the original paths. `remove-edges` history ops now carry the path changes so redo/undo round-trip correctly.
- **Max display depth 0 = unlimited**: the display-depth slider now allows 0, which shows the full tree with no depth-based hiding (matching the existing "Unlimited" label and the `0 = unlimited` convention used elsewhere, e.g. file system/import scan depth). Previously 0 was not reachable and any value below the current depth hid everything deeper than it.
- **Auto-hide is now a live filter both ways**: increasing the auto-hide limit now reveals previously auto-hidden children that fall under the new limit (previously they stayed hidden forever — only newly-exceeding folders got hidden). Auto-hidden ids are tracked separately from manual/depth/file hides so raising the limit never reveals a node the user hid manually. Covered by `reconcileAutoHide` and new tests.
- **Click-to-type slider values**: every slider's numeric value (display depth, auto-hide limit, corner radius, edge width, node width/height, minimap size, export quality, scan/display depth) now becomes a manual number input when you click it. Type a value and press Enter/blur to commit — it bypasses the slider's min/max — or press Escape to cancel. The normal display returns after committing.
- **Right-click "Add Child Node" opens the Add Node dialog**: the folder context menu's "Add Child Node" no longer adds a "New Folder" node immediately. It now selects the folder and opens the same Add Node dialog that Alt+N opens (in child mode), so you can name the node and pick folder/file before it's created.
- **`shared_graphs` RLS hardening (security)**: the UPDATE and DELETE policies were `using (true)` for every role — and the publishable (anon) key ships in the browser bundle, so anyone could overwrite or delete any share row directly via Supabase REST. Policies now restrict UPDATE/DELETE to the row owner (`auth.uid()`) or anonymous rows. Migration `0012_harden_share_rls.sql`.
- **Email confirmation required on sign-up**: `enable_confirmations = true` in `supabase/config.toml` — new accounts must verify their email before signing in (matches the sign-up dialog prompt). Documented as a recommended hosted-project setting in `/docs/deployment`.
- Fix crash on New File button: right-clicking a folder/file with no data source loaded (dataSource is null) still called startsWith on null. The earlier empty-graph fix only guarded providerLabelFromSource; FileEntryContextMenu's crawled-file check now null-guards too.

### Docs

- **Watch File Indexes page**: new `/docs/watch` covers watching public file indexes, the 23:59 daily digest, and managing watched indexes in Settings
- **Deployment**: documented Resend + scheduled-digest env vars (RESEND_API_KEY, RESEND_FROM_EMAIL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET)
- **Docs nav**: registered `watch` and `cloud` pages in the Features section

## [0.4.0]

### Added

- **Accounts & authentication**: optional email/password sign-in via Supabase Auth. The app works fully logged-out; login unlocks save/load/share. Sign in button + account dropdown in the navbar, auth dialog with sign up / sign in / password reset, `/auth/callback` route, session-refresh middleware. `@supabase/ssr` added; `[auth]` enabled in `supabase/config.toml`.
- **Saved graphs**: logged-in users can save the current graph (nodes, edges, layout, theme, settings) to their account, list them in a new "Your Directories" sidebar section, load, rename, and delete. Never auto-uploads — saving is always user-initiated. New `/api/graphs` (GET/POST) + `/api/graphs/[id]` (DELETE) routes; migration `0003_auth_saved_graphs.sql`.
- **Selective sharing**: saved graphs can be shared as "anyone with the link" (public) or "invite only" (only specified emails). Invite-only links require a signed-in user whose email is invited. Share dialog with public/invite toggle + email list; `/api/share` extended with `owner_id`, `access`, `invited_emails`, `saved_graph_id`; `/api/share/[id]` enforces invite access (403 + sign-in prompt).
- **Theme & settings sync**: saved graphs capture the full app state including theme mode, custom theme, layout, minimap, and advanced settings — restoring a saved graph restores everything.
- **Accounts docs page**: new `/docs/accounts` covers sign in, save/load/rename/delete saved graphs, theme/settings sync; sign-in mentioned in getting-started + settings docs

## [0.3.2]

### Added

- **Docs site**: new `/docs` and `/blog` routes with markdown-based content system in `content/`
- **Docs pages**: Getting Started, Graph Features, Import & Export, Keyboard Shortcuts, Theming
- **Blog posts**: launch announcement, Aurora Haze design system deep-dive, ELK layout engine release notes
- **Global navbar navigation**: Docs and Blog links in top-right corner
- **MDX support**: Next.js configured with `@next/mdx` for future component embedding in docs
- **404 page**: theme-aware not-found page with aurora background, primary accent, and links back to home/docs.
- **Settings & Power User docs page**: Settings dialog tabs, power user mode, minimap config, node dimensions, notifications
- **Node Editing docs page**: add, rename, copy/cut/paste, duplicate, delete, unparent, connect, hide/show children, context menus
- **PWA install docs page**: install-as-app guide for desktop, Android, and iOS
- **v0.3.0 release blog post**: theme engine, 18 presets, bundle-size cuts, and PWA fixes
- **Sharing docs page**: share link generation, URL hash encoding, opening shared graphs, limitations
- **Deployment docs page**: Docker, Netlify, Caddy reverse proxy, standalone build, environment variables
- **Documentation gap fixes**: advanced import options, missing keyboard shortcuts, theme presets/editor details, edge customization, canvas context menu, multi-select, drag & drop, node resizing, handle shortcuts, sidebar resize, max display depth
- **Shortcuts dialog sync**: added missing `Ctrl+D` (duplicate) and `Ctrl+Y` (redo alternate) entries
- **Public file index import**: Import from URL now crawls Apache/nginx auto-index pages (e.g. `https://www.sidc.be/EUI/data/`) server-side via new `/api/crawl` route, with depth/page caps and partial-tree truncation notice. GitHub URLs still use the existing `/api/github-tree` path.
- **Crawl cache (Supabase)**: crawled file index trees cached in a `crawl_cache` table (JSONB tree + TTL, 24h). Repeat imports of the same URL return instantly from cache. Cache is best-effort — on any Supabase failure the route falls back to a fresh crawl. Migration in `supabase/migrations/0001_crawl_cache.sql`; Supabase CLI linked.
- **DB-backed share links**: large graphs (encoded hash > 2000 chars) are stored in a `shared_graphs` table and shared via a short `#s:<id>` link instead of a long URL hash. Small graphs still embed the compressed hash. 30-day TTL with lazy expiry on read. New `/api/share` (POST) + `/api/share/[id]` (GET) routes; migration `0002_shared_graphs.sql`.
- **Hidden nodes search**: search bar in the Hidden Nodes sidebar section filters hidden nodes by name, keeping parent/child hierarchy context

### Changed

- **Toast feedback for silent actions**: added toast notifications for previously silent destructive/confirm actions: delete selected (toolbar, canvas toolbar, Delete/Backspace key), clear canvas (sidebar confirm), reveal all nodes (sidebar), add file/folder (sidebar quick-add + Add Node dialog), export download, open file via Enter key, and hide/show children (folder context menu).
- **Theme-responsive blog & docs**: docs pages use primary (`--fewer-folder-icon`) accents; blog uses secondary (`--fewer-file-icon`) accents. Both follow the active custom theme instead of static brand colors.
- **Design system tokens**: added spacing (`--space-*`) and shadow depth (`--shadow-*`) tokens plus `--font-heading` / `--font-body` stacks to `globals.css` per `design-system/fewer/MASTER.md`.
- **Theme-aligned gradients**: `text-gradient-fewer` now derives its leading stop from `--color-primary` instead of hard-coded orange.

### Docs

- **Docs audit**: audited all 23 doc files against current source; fixed 12 stale/broken files
- **`theming.md`**: corrected CSS variable table to actual `--fewer-*` names (16 vars), removed stale version reference
- **`SECURITY.md`**: replaced "no backend" claim with accurate minimal-backend description (API routes + Prisma/SQLite)
- **`getting-started.md`**: `npm` → `bun`, "advanced user setting" → "Power User mode"
- **`first-release.md` / `v030-release.md`**: `npm` → `bun`; Dagre → custom Reingold-Tilford layout
- **`elk-layout-engine.md`**: rewritten: describes custom Reingold-Tilford layout instead of removed ELK engine
- **`MASTER.md`**: design tokens aligned with Aurora Haze + Open Color + actual CSS variables
- **`CODE_OF_CONDUCT.md`**: filled `[INSERT CONTACT METHOD]` placeholder with GitHub issue + security advisory links
- **`ROADMAP.md`**: checked off completed items (theme editor, theme saving)
- **`editing.md`**: added "Copy Name" file action, corrected "Open File" gating
- **`pwa-install.md` / `CONTRIBUTING.md`**: typo + test phrasing fixes

### Fixed

- **Multi-select edge highlighting**: ancestor-path edges now highlight for EVERY selected node (not just the last-picked one). Each path edge is colored by its target node type (folder vs file).
- **Duplicate rename guard**: renaming a node to a name already used by a sibling in the same folder is now blocked with a toast (`"X" already exists in this folder.`). Previously duplicate names were allowed.
- **Custom theme editor mobile support**: dialog width clamps to viewport (`min(360px, 100vw - 16px)`), drag/dock now use pointer events (works with touch), and `touch-action: none` prevents scroll interference while dragging.
- **Preset dropdown width**: the preset theme dropdown now matches the trigger input width instead of a fixed 280px.
- **Tutorial restart z-order**: restarting the tutorial from Settings now closes the Settings dialog first (and waits for its exit animation), so the tutorial's options are clickable instead of being blocked behind it.
- **Tutorial button contrast**: primary tutorial buttons now use `text-primary-foreground` (matching the export button) instead of hard-coded white, so the label stays visible on the primary background.
- **Tutorial docs redirect**: the tutorial now offers an optional "Docs →" button at the end (mobile final step and desktop "All done!" state) that navigates to `/docs`.

## [0.3.1]

### Performance

- **Removed dead `elkjs` import**: `layout.ts` imported `ELK` but never used it. Dropped ~300KB from bundle.
- **Removed dead dependencies**: `@dagrejs/dagre`, `recharts`, `react-color`, `web-worker` were in `package.json` but never imported.
- **Deleted unused shadcn components**: `chart`, `calendar`, `command`, `carousel`, `drawer`, `form`, `input-otp`, `resizable` were never imported by app code.
- **Lazy-loaded all dialogs**: ExportPanel, ImportDialog, ImportFromFileDialog, BugReportDialog, TutorialDialog, ShortcutsDialog, SettingsDialog, ShareDialog, ThemeEditorDialog, AddNodeDialog, ImportUrlDialog, NotificationPanel now load via `next/dynamic` only when opened. `react-colorful` and dialog code out of startup bundle → fewer long tasks, lower TBT/TTI.
- **Removed ReactFlow `onInit` console.log**: debug noise gone.

### PWA

- **512x512 icon**: generated `logo-512.png` from `logo.svg` (square-padded, no letterboxing). Manifest now lists 192 + 512 icons → fixes Lighthouse `splash-screen` audit.
- **Manifest icon sizes corrected**: previously claimed 192x192 but pointed at a 494x445 PNG. Now points to real 192x192 `logo-192.png`.

## [0.3.0]

### Added

- **Theme presets**: 18 popular open source theme presets (Catppuccin, Nord, Dracula, Gruvbox, Tokyo Night, Rose Pine, Solarized, One Dark/Light, GitHub, Material)
- **Draggable theme editor**: Opens as a movable panel when selecting Custom theme, locked within browser window bounds
- **Minimize theme editor**: Click the minimize (−) button to collapse the Custom Theme dialog into a small draggable dock pill that snaps to any position along the canvas edges (top/bottom/left/right); pill renders vertically on side edges. Click pill to restore.
- **Theme-aware UI**: All buttons, sliders, switches, and icons follow the active theme's primary/secondary colors
- **Export panel secondary colors**: Export panel uses file icon color scheme for sliders, switches, and format selection
- **Close theme editor on light/dark switch**: Custom theme dialog automatically closes when switching to light or dark mode
- **Reset settings on power user toggle off**: All settings reset to defaults including theme when disabling power user mode

- **Structured custom theme colors**: each theme color now has independent `{ color, opacity }` fields instead of plain CSS strings. Per-color opacity slider in the Custom Theme Editor with live preview swatch.
- **Open Color palette**: dark mode defaults migrated to Open Color (gray/orange/grape families) for consistent, accessible color values.
- **`themeColors.ts` module**: `hexToRgb`, `clampOpacity`, `toCssColor`, `migrateCustomTheme`, `resolveCss` utilities. Handles legacy plain-string theme migration to structured format.
- **Theme color tests**: 8 tests covering `hexToRgb`, `toCssColor`, `clampOpacity`, and `migrateCustomTheme` (legacy + structured + empty input).
- **Sectioned Custom Theme Editor**: colors grouped into "Canvas & Text", "Folders", "Files" sections with descriptions and opacity sliders.
- **`react-colorful` color picker**: `HexAlphaColorPicker` with gradient panel, hue strip, and alpha channel built into each theme color popover.
- **Per-type secondary text**: `folderSubtleText` and `fileSubtleText` controls for folder paths/footers and file extensions/sizes.

### Changed

- **Bun as default package manager**: `bun install`, `bun run dev/build/lint/test`. Removed `package-lock.json` in favor of `bun.lock`. Installed Bun 1.3.14. Docs updated (README, AGENTS.md, CONTRIBUTING, netlify.toml, PR template).
- **`ThemeColorMeta` expanded**: now includes `description`, `defaultColor`, `defaultOpacity`, and `openColor` fields for richer editor metadata.
- **`ThemeProvider`**: uses `migrateCustomTheme` for safe legacy theme loading + `applyCustomThemeToDOM` for structured color application.
- **Dark mode CSS variables**: `globals.css` updated with Open Color-based values for text, edges, handles, folder/file colors.
- **Simplified folder/file theme controls**: 5 controls each (body, text, secondary text, border, icon). Removed separate `folderHeaderBg`/`folderHeaderText`; folder text controls title, secondary text controls path/footers. Added `fileText` and `fileSubtleText` controls.

### Fixed

- **Custom theme canvas background**: canvas now reads `--fewer-background` via inline style, so custom background color actually applies.
- **Theme mode class cleanup**: switching to custom mode now removes `light`/`dark` classes from `<html>`, preventing CSS variable conflicts and unwanted aurora overlays.
- **Connection handle colors**: handles now use `--fewer-handle` CSS variable instead of hardcoded `slate-700`, following the active theme.
- **Hidden nodes chip**: uses theme-aware `--fewer-folder-icon` color instead of hardcoded amber, visible in all theme modes.
- **Hidden panel dots**: folder/file indicator dots in the sidebar Hidden Nodes section now use theme-aware `--fewer-folder-icon` / `--fewer-file-icon` colors.

## [0.2.5]

### Added

- **Sponsor / Ko-fi button** in Settings → About tab linking to GitHub Sponsors.
- **GitHub Sponsors funding entry** added to `package.json` so GitHub shows a sponsor button on the repo.
- **Sidebar Aurora Haze integration**: sidebar container now uses `gm-aurora gm-aurora-warm` for subtle warm atmospheric tint. Section cards refined: subtler borders (`border-border/20`), lighter backgrounds (`bg-card/5`), cleaner hover states. Footer redesigned from text blob to structured shortcut-hint grid with `<kbd>` chips. Icon sizes standardized to `h-3.5 w-3.5` for all secondary actions.
- **Reusable SlidingToggle component**: extracted from Edge Motion into generic multi-option toggle with sliding indicator + glow animation. Now used for Edge Style, Edge Motion, and Stroke Pattern.
- **Sidebar layout cleanup**: split dense "Layout & Edges" section into focused "Layout" (direction, depth, auto-hide, beautify) and "Edges" (style, motion, stroke, weight) sections. "Edges" collapsed by default to reduce initial clutter. Max Display Depth and Auto-hide threshold sliders now only visible in advanced mode.
- **Motion tokens**: `--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1)` and `--dur-aurora: 200ms` for consistent Aurora Haze transitions.
- **Settings Dialog**: unified tabbed settings dialog (About, Appearance, Advanced, Help) opened via gear icon in the top navbar (right of notifications). Consolidates previously scattered utility controls.
- **About tab**: app version, description, GitHub/website links, credits.
- **Appearance tab**: theme mode selector (light/dark/custom), custom theme editor, and Show files toggle moved from the sidebar.
- **Advanced tab**: Power User toggle, minimap controls (visibility/position/size), and node dimension sliders moved from the sidebar.
- **Help tab**: buttons to open the Keyboard Shortcuts dialog, Bug Report dialog, restart the tutorial, and links to GitHub issues/website.

### Changed

- Sidebar decluttered: removed Configuration, Minimap, and Node Metrics sections; theme mode buttons moved out of Appearance section (Show files toggle stays).

### Fixed

- **Include File Nodes toggle preserves ancestor-aware visibility**: re-enabling "Include File Nodes" no longer reveals files whose parent folder is hidden, preventing orphan file nodes from appearing as root-level items on the canvas.
- **GlobalNavbar simplified**: removed Keyboard/Bug/GitHub/Globe buttons; now Logo + Search + Notifications + Settings gear.
- **Minimap controls** and **node dimension sliders** moved from sidebar to Settings → Advanced tab.
- **Power User toggle** moved from sidebar Configuration section to Settings → Advanced tab.
- **Tutorial restart** now accessible via Settings → Help tab (uses `fewer-restart-tutorial` window event).

## [0.2.4] - 2026-08

### Added

- **Auto-hide large folder children**: folders with >10 children hide their children on import (threshold adjustable in sidebar, 2-100). Hidden children appear in the sidebar Hidden Nodes section grouped by folder.
- **Recursive Hidden Nodes tree**: hidden nodes shown as nested expandable tree, any depth. Eye button on a folder reveals its subtree; large grandchildren stay hidden via re-applied auto-hide.
- **Max Display Depth**: configurable display depth (default 6 levels) for both import-time and post-import. Deeper nodes go to Hidden Nodes.
- **Sidebar drag-resize**: drag the right edge of the sidebar to resize it (200-560px).
- **File nodes hide output handle**: files can't have children, so their source handle is hidden.

### Changed

- **Memory leak fixes:** `fsHandleStore` now cleared on `reset()`: handles no longer accumulate across imports
- **Memory leak fixes:** `fsHandle` removed from `expandFolderNode` node data: uses `fsHandleStore` instead of storing live `FileSystemDirectoryHandle` on every node
- **Memory optimization:** Virtualized child list in folder cards: only renders visible children (+5 overscan) instead of all children as DOM nodes
- **`FileEntryContextMenu` "Open File"** now reads from `fsHandleStore` instead of `node.data.fsHandle`
- **Auto-hide toast on import**: shows how many items were auto-hidden (folders with >10 children), directory, URL, and library imports.
- **Revealed roots protected from re-hiding**: explicitly shown folders stay visible even when their parent still has >10 children.
- **Toast notifications for all major actions**: delete, copy, cut, duplicate, paste, unparent, connect, relayout, show/hide nodes, open file, refresh from disk, and more.
- **Toast stacking**: up to 5 simultaneous toasts with right-side viewport and proper spacing (`gap-2`, `items-end`).
- **Notification history panel**: click the bell icon in the navbar to view past notifications; badge shows unread count and clears on open.
- **Auto-hide threshold slider**: adjustable threshold (2-100) in the sidebar Layout section controls when folder children get auto-hidden.

## [0.2.3] - 2026-07

### Added

- **Ancestor path highlighting**: selecting a node highlights all edges from that node up to the root parent with the accent color (amber/orange `#fb923c` in light mode, purple `#a855f7` in dark mode)
- **Theme-aware edge colors**: edge highlight colors update immediately when switching between light/dark/custom themes
- **ELK (elkjs) layout engine**: replaces dagre with ELK's layered algorithm for more compact, balanced tree layouts. Async layout for initial import, sync fallback for relayout
- `parentId` and `collapsed` fields on `FewerNodeData` for tree navigation
- `fsHandleStore`: separate `Map<string, FileSystemHandle>` to keep live browser API objects out of serialized node data

### Changed

- **Split monolithic 1018-line `graphStore` into 6 focused Zustand slices**: graph, history, ui, layout, theme
- **Operation-based undo/redo**: stores diffs instead of full snapshots (critical for 10K+ node graphs)
- **`graphVersion` sync**: every mutation that changes `nodes`, `edges`, or `hiddenIds` now increments `graphVersion`, ensuring the React Flow canvas syncs immediately
- **Memory optimization:** BulkImportOp now stores only the removed/added subtree instead of the full arrays: cuts history memory from O(50×n) to O(50×k)
- **Memory optimization:** `FileSystemHandle` objects moved out of `FewerNodeData` into `fsHandleStore`
- **Memory optimization:** React Flow viewport culling via `onlyRenderVisibleElements=true` (minimap uses custom component independent of viewport)
- **Highlighted edges render on top**: sorted to end of array so they're never covered by grey edges
- **Show All button** now also calls `setShowFiles(true)` to restore file visibility
- Dagre layout parameters adjusted for tighter spacing (network-simplex ranker, reduced ranksep)

### Fixed

- Pre-existing `const` assertion errors in `fileOps.ts` and `graphSlice.ts`
- `Set<unknown>` type errors in `KeyboardShortcuts.tsx` and `graphSlice.ts`
- Infinite re-render loop in GraphCanvas (unconditional `useEffect` syncs)
- `descendantIds` scope bug in `connectNodes` (variable shadowed inside if-block)
- Duplicate `removeEdgesFromHandle` and `deleteEdges` function definitions
- URL import not rendering until "Beautify Layout" clicked (async `setGraph` → sync `layoutGraphSync`)
- Edge styles not updating when switching themes (added `useEffect` watching `themeMode`)

## [0.2.2] - 2026-07

### Added

- Operation-based undo/redo history (stores diffs instead of full snapshots, critical for 10K+ node graphs)
- Chunked tree-to-graph import with progress callback (`chunkTreeToGraph`)
- Async layout support via `requestIdleCallback` (`runLayoutAsync`)
- `ImportProgress` component for large directory imports
- Typed store hooks with shallow comparison selectors (`useGraphData`, `useLayoutConfig`, `useUiState`)
- History operation types (`HistoryOp`) and `applyOp`/`undoOp` functions
- `fsHandleStore`: separate `Map<string, FileSystemHandle>` to keep live browser API objects out of serialized node data
- `parentId` and `collapsed` fields on `FewerNodeData` for tree navigation

### Changed

- Split monolithic 1018-line `graphStore` into 6 focused Zustand slices: graph, history, ui, layout, theme
- Rewrote `graphStore.ts` as a thin re-export wrapper for backward compatibility
- `applySearch` now only recomputes when `searchQuery` changes, not on every mutation
- GraphCanvas now uses `as OnNodesChange` cast for React Flow v12 compatibility
- **Memory optimization:** BulkImportOp now stores only the removed/added subtree instead of the full `nodes`/`edges` arrays: cuts history memory from O(50×n) to O(50×k) where k << n
- **Memory optimization:** `FileSystemHandle` objects moved out of `FewerNodeData` into `fsHandleStore`: reduces per-node memory by removing heavy browser API objects from serialized data
- **Memory optimization:** React Flow viewport culling enabled (`onlyRenderVisibleElements=true`): previously all nodes were rendered regardless of viewport

### Fixed

- Pre-existing `const` assertion errors in `fileOps.ts` and `graphSlice.ts`
- `Set<unknown>` type errors in `KeyboardShortcuts.tsx` and `graphSlice.ts`
- `descendantIds` scope bug in `connectNodes` (variable was shadowed inside if-block)
- Duplicate `removeEdgesFromHandle` and `deleteEdges` function definitions in graphSlice

## [0.2.1] - 2026-07

### Added

- GitHub repository import via URL (new API route `/api/github-tree`, `useGitHubImport` hook)
- Import URL dialog for fetching public GitHub repo trees
- SVG logo component with gradient styling (replaces inline icons)
- Flat logo variant (`logo_flat.svg`, `logo_flat.png`)
- `ROADMAP.md` with categorized short/medium/long-term plans
- Demo screenshot (`public/demo.png`) for README
- Tutorial checklist items can now be toggled on/off
- Tutorial text adapted for touch-only devices

### Changed

- Rewrote README with gold-standard patterns: problem-first lead, trust block near install, show-don't-tell demo, collapsed depth for features/architecture
- Replaced inline icons in `GlobalNavbar` with `Logo` component
- Updated logo assets (new coordinates in `logo.svg`, updated `logo.png`)
- Extracted Roadmap section from README into standalone `ROADMAP.md`
- Replaced ASCII tree in README with live demo screenshot

### Fixed

- License badge and section: MIT → AGPLv3 (matches LICENSE)
- Pre-existing lint error: ref mutation during render in `GraphCanvas.tsx` (moved to `useEffect`)
- Duplicate rename commit on folder rename; descendant paths now update correctly on rename

## [0.2.0] - 2025

### Added

- Breadcrumb navigation bar showing selected node's full path
- Custom theme editor with 16 CSS color variables and live color pickers
- Import from File dialog (JSON, ASCII tree, shell/batch scripts)
- Search panel with fuzzy matching and click-to-zoom
- Stats panel with file/folder counts, size, by-category breakdown
- Bug report dialog with auto-collected diagnostics
- Shortcuts dialog (Ctrl+I) with categorized keyboard reference
- Interactive tutorial with spotlight walkthrough
- Error boundary with retry/reload UI
- Device detection (mobile/tablet/desktop) with responsive sidebar
- Support for 4 layout directions and 3 edge styles
- 7 export formats: SVG, PNG, JSON, CSV, DOT, directory scripts, ASCII tree
- Undo/redo history (50 steps) with drag-aware commit
- Drag-connect nodes with cycle/parenting validation
- Copy/cut/paste (duplicate) with "copy" naming convention
- Hide/show nodes with cascading shortcut support
- Node resize (folders multi-direction, files horizontal)
- Filename extension and category auto-update on rename
- Brave browser detection with workaround instructions
- Fallback webkitdirectory support for Firefox/Safari
- Export selected subtree only toggle

### Changed

- Upgraded to Next.js 16 with Turbopack
- Upgraded to React 19
- Upgraded to Tailwind CSS 4
- Upgraded to shadcn/ui New York style
- Upgraded to React Flow v12 (@xyflow/react)
- Migrated from Prisma to SQLite for database layer
- Enhanced Dagre layout with type-aware node dimensions

### Fixed

- Various edge cases in connection validation
- Drag undo committing per-frame (now one undo step per drag)

## [0.1.0] - 2025

### Added

- Initial release
- Interactive node-based graph canvas with React Flow
- Folder and file card components with scrollable children
- Directory import via File System Access API
- Create, rename, delete, duplicate nodes
- Arrow key tree navigation
- Keyboard shortcuts for all major operations
- Light/dark theme support
- Dagre auto-layout
- Minimap and zoom controls
- Context menus for folders, files, and canvas
