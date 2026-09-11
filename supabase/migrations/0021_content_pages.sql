-- Headless content: blog posts and docs pages live in the DB so they can be
-- published/edited WITHOUT a code release. New/changed rows go live within the
-- page revalidate window (60s) -- no deploy needed. The markdown in
-- content/blog/ and content/docs/ is kept in-repo as a source-of-record backup
-- but is no longer read by the app.

create table if not exists public.content_pages (
  type        text not null check (type in ('blog', 'docs')),
  slug        text not null,
  title       text not null,
  description text,
  content     text not null,
  author      text,
  date        date,
  tags        text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (type, slug)
);

alter table public.content_pages enable row level security;

-- Anyone can read published content. Writes are done via the service role (e.g.
-- Supabase Studio / a future admin UI), which bypasses RLS.
-- Guarded so the migration is safe to re-run (e.g. if the schema was already
-- applied out-of-band; Postgres has no CREATE POLICY IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_policy
    join pg_class on pg_class.oid = pg_policy.polrelid
    where pg_class.relname = 'content_pages'
      and pg_policy.polname = 'public read published content_pages'
  ) then
    create policy "public read published content_pages"
      on public.content_pages
      for select
      using (published = true);
  end if;
end $$;

create index if not exists content_pages_listing_idx
  on public.content_pages (type, published, date desc);

insert into public.content_pages
  (type, slug, title, description, content, author, date, tags, published)
values
  ('blog', 'aurora-haze-theme', 'Aurora Haze: A New Visual Identity for Fewer', 'How we designed and implemented the Aurora Haze design system: a subtle warm atmospheric effects, motion tokens, and a refined sidebar that makes directory exploration feel alive.', '
Version 0.2.5 introduces **Aurora Haze**: a cohesive design language that transforms Fewer from a functional tool into a visually distinctive experience.

## What Changed

### Atmospheric Sidebar

The sidebar now uses `gm-aurora gm-aurora-warm` for subtle warm atmospheric tint. Section cards have subtler borders (`border-border/20`), lighter backgrounds (`bg-card/5`), and cleaner hover states.

The footer redesign replaces text blobs with a structured shortcut-hint grid using `<kbd>` chips. All secondary action icons standardized to `h-3.5 w-3.5`.

### Motion Tokens

New CSS variables for consistent Aurora Haze transitions:

```css
--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1);
--dur-aurora: 200ms;
```

These tokens power every hover, expand, and state change in the sidebar: giving the interface a unified, polished feel.

### Unified Settings Dialog

Previously scattered controls now live in a single tabbed Settings dialog:

- **About**: version, description, GitHub/website links, credits
- **Appearance**: theme mode, custom theme editor, show files toggle
- **Advanced**: power user toggle, minimap controls, node dimension sliders
- **Help**: shortcuts, bug report, tutorial restart, issue links

Opened via gear icon in the navbar.

### Reusable SlidingToggle

Extracted from Edge Motion into a generic multi-option toggle with sliding indicator + glow animation. Now powers Edge Style, Edge Motion, and Stroke Pattern controls.

### Sidebar Layout Cleanup

Split dense "Layout & Edges" section into focused subsections:

- **Layout**: direction, depth, auto-hide, beautify
- **Edges**: style, motion, stroke, weight (collapsed by default)

Max Display Depth and Auto-hide threshold sliders now only visible in advanced mode.

## Design Philosophy

Aurora Haze follows three principles:

1. **Subtlety over noise**: atmospheric effects should enhance, not distract
2. **Consistency through tokens**: motion, color, and spacing derive from a shared vocabulary
3. **Progressive disclosure**: advanced controls hidden until needed

## What''s Next

Future releases will extend Aurora Haze to:

- Canvas background effects (subtle grid, depth fog)
- Node entrance animations
- Theme-aware edge glow on selection
- Export themes (light/dark variants for SVG/PNG)', 'Yash Srivastava', '2026-08-05', 'design, theme, ux, release', true),
  ('blog', 'elk-layout-engine', 'Custom Layout Algorithm: Built for Large Codebases', 'How we replaced Dagre with a custom Reingold-Tilford tree layout to handle large graphs for tighter spacing, better hierarchy, async layout for smooth imports.', '
Version 0.2.3 ships a new layout engine: a **custom Reingold-Tilford tree layout** with contour matching, designed specifically for directory trees. This replaces Dagre with an in-house implementation tuned for large, complex codebases.

## Why Move Away from Dagre?

Dagre works well for small-to-medium trees. But as graphs grow past 1,000 nodes, two problems emerge:

1. **Wide, sparse layouts**: Dagre spreads nodes horizontally to avoid overlap, creating sprawling diagrams that don''t fit the viewport
2. **Sync blocking**: Layout computation happens on the main thread, freezing UI during import

Our custom algorithm addresses both with a layered approach that packs nodes tighter and supports async computation.

## What Changed

### Custom Reingold-Tilford Algorithm

The new algorithm arranges nodes using the classic Reingold-Tilford tree layout with contour matching: parents centered over their children, with contour-based collision prevention. Result: graphs that are 30-40% more compact vertically and horizontally.

### Async Layout

Large directory imports now use `requestIdleCallback` to compute layout without blocking the UI. A progress indicator shows import status.

### Sync Fallback

Relayout operations (direction changes, beautify) still use synchronous layout for immediate feedback. The async path only applies to initial import.

## Performance Impact

| Metric                | Dagre | Custom |
| --------------------- | ----- | ------ |
| 1K nodes layout time  | 800ms | 600ms  |
| 5K nodes layout time  | 4.2s  | 1.8s   |
| 10K nodes layout time | OOM   | 3.5s   |
| Average node spacing  | 50px  | 35px   |

The custom algorithm handles 10K+ nodes where Dagre runs out of memory.

## Migration Notes

If you have saved JSON exports from older versions, they still import correctly. The layout engine is chosen at runtime, not persisted.

## Future Improvements

- Layer-by-layer progressive rendering during async layout
- Incremental relayout (only recompute affected subtree)
- Custom edge routing algorithms (orthogonal, spline)', 'Yash Srivastava', '2026-08-03', 'performance, layout, release, architecture', true),
  ('blog', 'first-release', 'Introducing Fewer: Turn Any Directory Into an Interactive Graph', 'Meet Fewer, the open-source tool that transforms static directory trees into interactive, explorable graphs. Built with React Flow, a custom tree layout, and a privacy-first philosophy.', '
We''re excited to announce the first public release of **Fewer**, an interactive directory graph visualizer that runs entirely in your browser.

## The Problem

You need to understand a directory structure, for example in a new codebase, a project to document, or a mess to reorganize. Standard tools don''t help:

- `tree` is static and overwhelming for large codebases
- File managers show one folder at a time
- `ls -R` is a wall of text

You scroll, search, switch contexts, and still miss the shape of it.

## The Solution

Fewer turns that tree into an interactive graph. Drag nodes, zoom in/out, rename files, add folders, and export in 7 formats, all in the browser with nothing to install.

## What You Can Do Today

**Explore**: Load any directory and watch it build into a clean graph with auto-layout. Use arrow keys to navigate the tree. Right-click any node for instant actions.

**Edit**: Rename files (F2), add new nodes (Alt+N), delete with cascading children (Delete), copy/paste subtrees (Ctrl+C/Ctrl+V). Undo/redo (Ctrl+Z/Ctrl+Shift+Z) with a 50-step history buffer.

**Search**: Fuzzy search across filenames, paths, and extensions. Click any result to zoom directly to that node. Hidden nodes appear with badges, click to reveal and zoom.

**Export**: Save your graph as SVG, PNG, JSON, CSV, DOT, shell scripts, or ASCII trees. Toggle "Export Selected" to grab just a subtree.

## Built for Privacy

Fewer runs entirely client-side. No telemetry, no data exfiltration, no config files modified outside the project. The only network call is an optional GitHub repo import for public repositories. Close the tab to disable instantly. Delete the repo to uninstall completely.

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **React 19** with TypeScript 5 strict mode
- **React Flow v12** for canvas rendering
- **Custom Reingold-Tilford layout** for auto-layout
- **Zustand** for state management
- **Tailwind CSS 4** with shadcn/ui
- **Prisma + SQLite** for persistence

## Get Started

### If you want to host locally

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Open `http://localhost:3000`, click **Load sample project**, and explore.

### If you want to try it out instantly

Visit [app.fewer.directory](https://app.fewer.directory) and start exploring.

All the same features, none of the installation. Still built for your privacy.

## What''s Next

We''re just getting started. Upcoming releases will bring:

- Plugin system for custom exporters and importers
- Collaborative editing with WebSocket sync
- Diff view between directory versions
- GitHub PR review visualization mode
- VS Code extension for in-editor preview

Star the repo and watch for updates. We''d love your feedback.', 'Yash Srivastava', '2026-08-01', 'launch, release, features', true),
  ('blog', 'v030-release', 'v0.3.0: Theme Engine, 18 Presets, and a Lighter Bundle', 'Fewer 0.3.0 brings a structured custom theme engine with 18 presets, a draggable minimizable theme editor, and a bundle that''s 300KB lighter after dead-code removal.', '
Today we ship **Fewer 0.3.0**: the biggest update since launch. This release focuses on three things: making the tool yours, making it faster to load, and making it feel like a real app.

## Pick From 18 Presets

Theming used to mean toggling light or dark. Now the sidebar opens a full **theme engine** with 18 carefully chosen presets:

Catppuccin, Nord, Dracula, Gruvbox, Tokyo Night, Rose Pine, Solarized, One Dark, One Light, GitHub Light, GitHub Dark, Material, and more.

Each preset is hand-tuned with Open Color values for consistent, accessible contrast: no more neon-on-neon.

## Build Your Own

Presets are just a starting point. Switch to **Custom** mode and get a structured editor with 16 color slots, each with its own opacity slider:

- **Canvas & Text**: background, primary/secondary text, hover, handles, edges
- **Folders**: body, text, secondary text, border, icon
- **Files**: body, text, secondary text, border, icon

Colors are picked with a full `HexAlphaColorPicker` and applied instantly as CSS variables. The editor is draggable and minimizable: collapse it into a dock pill that snaps to any canvas edge so it never blocks your graph.

## A Lighter, Faster Bundle

We cut dead weight and made the app feel quicker.

- **Removed dead `elkjs` import** in the layout module: dropped ~300KB
- **Removed 5 unused dependencies**: `@dagrejs/dagre`, `recharts`, `react-color`, `web-worker` were all in `package.json` but never imported
- **Deleted 8 unused shadcn components**: chart, calendar, command, carousel, drawer, form, input-otp, resizable
- **Lazy-loaded every dialog**: Export, Import, Settings, Help, Tutorial, and friends now load on demand via `next/dynamic`. The startup bundle is dramatically smaller, which means lower TBT and TTI on slower devices

## Better PWA Experience

- **512x512 icon** generated from the logo: fixes the Lighthouse splash-screen audit
- **Manifest icon sizes corrected**: previously claimed 192x192 but pointed at a 494x445 PNG. Now points to real 192x192 `logo-192.png`

## Everything in 0.3.0

- 18 theme presets
- Structured custom theme editor (16 slots + per-color opacity)
- Draggable, minimizable editor with edge-snapping dock
- Ellipsis-preserving overflow and lock-to-bounds
- ~300KB bundle reduction, 5 deps removed, 8 components deleted
- Lazy-loaded dialogs
- PWA splash screen + manifest fixes
- Theme-aware UI everywhere: buttons, sliders, switches, and icons follow your active theme

Try it now at [app.fewer.directory](https://app.fewer.directory), or run it locally with:

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Next up: collaborative editing, a diff view between directory versions, and plugin-based exports. Star the repo to follow along.', 'Yash Srivastava', '2026-08-06', 'release, themes, performance, pwa', true),
  ('docs', 'accounts', 'Accounts & Saved Graphs', 'Sign in to save your directories, access them across devices, and share them. Covers sign in, save, load, rename, delete, and theme/settings sync.', '
Fewer works fully without an account. Signing in is optional and unlocks saving your directories to your account, accessing them from any device, and sharing them with more control.

## Sign In

Click the **Sign in** button in the top navbar to open the auth dialog. You can:

- **Create an account** with an email and password
- **Sign in** to an existing account
- **Reset your password** via email

After signing in, the navbar shows your account menu with a **Sign out** option.

## Save a Graph

1. Sign in
2. Click **Save Current Graph** in the **Your Directories** sidebar section
3. Name the graph and click **Save**

Saving is always user-initiated. Fewer never auto-uploads your graph.

## What Gets Saved

A saved graph captures the full app state:

- Cards, edges, and their positions
- Layout direction and edge style
- Theme mode, custom theme colors, corner radius
- Node dimensions and minimap settings

Restoring a saved graph restores everything, so you can pick up exactly where you left off.

## Load, Rename, Delete

The **Your Directories** section lists your saved graphs. Each row lets you:

- **Load** the graph: click the graph name
- **Rename**: click the pencil icon, type a new name, press Enter
- **Share**: click the link icon (see [Sharing](/docs/sharing))
- **Delete**: click the trash icon

## Sharing Saved Graphs

Saved graphs can be shared as:

- **Anyone with the link**: anyone can open the graph
- **Invite only**: only the email addresses you list can open it (recipients must sign in with an invited email)

See [Sharing Graphs](/docs/sharing) for details.

## Next Steps

- [Sharing Graphs](/docs/sharing): share the current canvas or a saved graph
- [Settings](/docs/settings): Power User mode and other preferences
- [Import & Export](/docs/import-export): bring in directories and export graphs', NULL, NULL, NULL, true),
  ('docs', 'cloud', 'Cloud Storage', 'Link cloud accounts (GitHub, Google Drive, OneDrive, SharePoint, Azure) to browse and visualize folders from cloud storage and private repositories.', '
Fewer can browse and visualize directory structures from linked cloud accounts — private GitHub repos, Google Drive, OneDrive, SharePoint, and Azure. Sign in, link an account, then browse and import a folder into the graph.

## Link a cloud account

1. Sign in (use the **Sign in** button in the navbar).
2. In the sidebar, open the **Cloud** section.
3. Click **Link** next to a provider.
4. Authorize the app on the provider''s consent screen.
5. You''re returned to Fewer with the account linked.

Each provider uses its own OAuth app. Before you can link, the provider''s credentials must be configured — see [Cloud setup](/docs/deployment) for how to create the OAuth apps and set the environment variables.

## Browse cloud storage

1. Open the **Cloud** section in the sidebar and click **Browse** (or open the Cloud browser from the File & Actions menu).
2. Pick a linked account.
3. Navigate folders. Click a folder to open it; use the breadcrumb trail to go back up.
4. Click the external-link icon on any entry to open it in the provider''s web UI in a new tab.

## Import into the graph

1. Browse to the folder you want — the folder you''re viewing is selected automatically for import.
2. Set the import **Depth** (how many levels deep to fetch).
3. Click **Import Folder**.

The folder''s structure is rendered as a graph using the provider''s metadata. Fewer only reads names, folder structure, and sizes — it never downloads file contents.

## Open in provider

Any node imported from a cloud account can be opened in the provider''s web UI:

- Right-click a folder or file node.
- Choose **Open in {Provider}** (e.g. "Open in GitHub").

This opens the folder or file at its exact location in the provider''s site in a new browser tab.

## Unlink an account

1. Open the **Cloud** section in the sidebar.
2. Click the trash icon next to the account.

This removes the connection and its stored tokens. It does not affect your provider account.

## Supported providers

- **GitHub** — browse private (and public) repositories.
- **Google Drive** — browse My Drive folders.
- **OneDrive** — browse your personal OneDrive.
- **SharePoint** — browse SharePoint sites'' document libraries.
- **Azure DevOps** — browse git repositories.
- **Azure Blob** — browse storage container blobs.

## Privacy

Cloud connections are read-only. Fewer stores the provider access token encrypted on the server, scoped to filesystem/metadata read permission, and uses it only to fetch folder listings you request. Tokens are never sent to your browser or exposed in the app.

## Next Steps

- [Accounts](/docs/accounts): your Fewer account and saved graphs
- [Import & Export](/docs/import-export): other ways to bring data in', NULL, NULL, NULL, true),
  ('docs', 'deployment', 'Deployment & Self-Hosting', 'Deploy Fewer to production: Docker, Netlify, Caddy reverse proxy, and the standalone build.', '
Fewer is a Next.js 16 app that can be deployed anywhere Node.js runs. This guide covers the supported deployment paths.

## Prerequisites

- Bun 1.3+ (or Node.js 18+)
- A server with Node.js runtime

## Local Production Build

```bash
bun install
bun run build
bun run start
```

The build script produces a **standalone output** (`.next/standalone`) with `public/` copied in, so the production server is fully self-contained:

```bash
NODE_ENV=production bun .next/standalone/server.js
```

## Docker

```bash
docker build -t fewer .
docker run -p 3000:3000 fewer
```

Then open `http://localhost:3000`.

## Netlify

The repo includes `netlify.toml` with the Next.js plugin preconfigured:

```toml
[build]
  command = "bun run build:netlify"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Deploy by connecting your GitHub repo to Netlify, or via the CLI:

```bash
bunx netlify deploy --prod
```

The `build:netlify` script skips the standalone output step (Netlify handles its own serverless output). The `COMMIT_REF` environment variable is injected automatically during Netlify builds to version the app.

### Domains: homepage vs app

Fewer splits its public surface across two domains on the same Netlify site, and the app lives at a sub-path:

- **`fewer.directory`** — the marketing homepage, privacy policy, docs, and blog. Visiting `/` on any host serves this page (`src/app/page.tsx`); the visitor does **not** need to sign in.
- **`app.fewer.directory`** — the interactive app. The app itself lives at **`/app`** (`src/app/app/page.tsx`); `app.fewer.directory` and the Netlify `.app` subdomain redirect their root to `/app` (Netlify redirect rules with a `Host` header condition), so the app domain lands directly on the app.

In Netlify, add `app.fewer.directory` (and optionally `www.fewer.directory`) as **domain aliases** on the same site; with Netlify DNS the records and TLS are provisioned automatically. The `NEXT_PUBLIC_APP_URL` env var (used for OAuth callbacks at `/api/cloud/callback`, share links, and the scheduled function) must point at the **app** origin: `https://app.fewer.directory`.

## Caddy Reverse Proxy

The repo includes a `Caddyfile` that proxies port 81 to the app on port 3000:

```caddy
:81 {
	handle {
		reverse_proxy localhost:3000 {
			header_up Host {host}
			header_up X-Forwarded-For {remote_host}
			header_up X-Forwarded-Proto {scheme}
			header_up X-Real-IP {remote_host}
		}
	}
}
```

It also supports a `?XTransformPort=` query parameter for port forwarding during development.

## PWA & Static Assets

The `public/` directory ships:

- `manifest.json`: PWA manifest with 192x192 and 512x512 icons
- `robots.txt`: search engine rules
- `logo*.png/svg`: brand assets

The standalone build copies `public/` automatically. If you self-host with a custom server, make sure `public/` is served so the manifest resolves correctly.

## Supabase (accounts, saved graphs, share links)

Accounts, saved graphs, crawl caching, and server-backed share links use **Supabase**. The app works fully without it (local import/export/theme all function), but these features require a Supabase project.

### Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migrations in `supabase/migrations/` (via the Supabase CLI: `supabase db push`, or the SQL editor)
3. Set the two environment variables below

> **Production vs non-production databases.** Fewer ships with **two** Supabase projects so developers never touch production data from a local or preview build:
>
> | Environment | Project | Env file | `NEXT_PUBLIC_SUPABASE_URL` |
> | ----------- | ------- | -------- | --------------------------- |
> | **Production** | `fewer` (`rzzbhboedvezamqjjuoe`, eu-west-1) | `.env` | `https://rzzbhboedvezamqjjuoe.supabase.co` |
> | **Dev / previews / local** | `fewer-dev` (`aorhvfihnjhpxgjiacfg`, ap-south-1) | `.env.local` | `https://aorhvfihnjhpxgjiacfg.supabase.co` |
>
> The **dev** project must run the same `supabase/migrations/` so its schema stays in lock-step with prod.
>
> **Never put the service-role key in a client file.** Each project needs its own, server-side only:
> - **Prod** `SUPABASE_SERVICE_ROLE_KEY` → Netlify env (accounts, watch digest, account deletion).
> - **Dev** `SUPABASE_SERVICE_ROLE_KEY` → only your local `.env.local` (never commit it) or the non-prod deploy environment.
>
> Both projects need their own dashboard auth settings (Email provider, confirm-email, Site URL + redirect URLs) — the values below are production-specific.

### Production go-live checklist

One-time settings to verify before real users arrive:

1. **Supabase dashboard → Authentication → Providers → Email**: make sure **Email** is enabled (it is the only sign-in provider).
2. **Supabase dashboard → Authentication → Sign In / Up**: turn on **Confirm email** so new accounts must verify their address (blocks fake sign-ups). The app''s sign-up dialog already prompts "Check your email".
3. **Supabase dashboard → Authentication → URL Configuration**: set **Site URL** to your production app origin (e.g. `https://app.fewer.directory`) and add your origin + `https://app.fewer.directory/auth/callback` to **Redirect URLs** — required for password-reset and email-confirmation links.
4. **Netlify env vars**: linking the Netlify ⇄ Supabase integration sets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` automatically. Add the rest manually: `NEXT_PUBLIC_APP_URL` (production origin, used in emailed links), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `CONNECTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`), and the per-provider OAuth keys below.
5. **Run migrations on the hosted project**: `supabase link --project-ref <ref>` then `supabase db push`, so hardening migrations (e.g. `0012_harden_share_rls.sql`) are applied before launch.
6. **Verify invite-only sharing in an incognito window**: open an invite link signed out → 403 + sign-in prompt → sign in as the invited email → the graph loads.

### Environment Variables

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable (anon) key. RLS protects data; auth is enforced via the user''s JWT |
| `NEXT_PUBLIC_APP_VERSION` | Injected at build time from `package.json` version + git commit SHA |
| `COMMIT_REF` | Git commit SHA (Netlify provides this automatically) |
| `NETLIFY` | Set by Netlify builds; disables standalone output |
| `CONTEXT` | Set by Netlify; `production` hides deploy preview overlays |

> **Note:** `NEXT_PUBLIC_*` variables are inlined at build time, so they must be set when you build, not just at runtime.

### Mail & scheduled digests (Watch File Indexes)

Watching file indexes and emailing daily change digests uses **Resend** for email and a scheduled Netlify function for the nightly crawl.

| Variable | Purpose |
| -------- | ------- |
| `RESEND_API_KEY` | Resend API key for sending digest emails |
| `RESEND_FROM_EMAIL` | Sender address for digest emails (defaults to `fewer <onboarding@resend.dev>`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-side only) so the nightly job can read every user''s watchlist |
| `CRON_SECRET` | Secret sent with the `x-cron-secret` header that authorizes the `/api/watch/run` job |

The nightly job is triggered by the Netlify scheduled function in `netlify/functions/watch-digest.ts`. It crawls watched indexes, diffs against the previous crawl, and sends one consolidated email per user only when something changed.

## Cloud Connections (OAuth)

Cloud storage browsing (GitHub private repos, Google Drive, OneDrive, SharePoint, Azure) uses OAuth. Each provider needs its own app credentials. The redirect URI for every provider is:

```
http://localhost:3000/api/cloud/callback      (dev)
https://your-domain.com/api/cloud/callback   (prod)
```

### Shared environment variables

| Variable | Purpose |
| -------- | ------- |
| `CONNECTIONS_ENCRYPTION_KEY` | 32-byte base64 key used to encrypt OAuth tokens at rest. Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Your app origin (used to build the OAuth redirect URI) |

### GitHub (private repos)

1. Go to GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Homepage URL**: `https://your-domain.com` (or `http://localhost:3000`).
3. **Authorization callback URL**: `https://your-domain.com/api/cloud/callback`.
4. Copy the Client ID and Client Secret into:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`

### Google Drive

1. Go to [Google Cloud Console](https://console.cloud.google.com) → your project → **APIs & Services → OAuth consent screen**.
2. Set the app to **External** and add the `drive.metadata.readonly` scope in **Data Access**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
4. Add the redirect URI: `https://your-domain.com/api/cloud/callback`.
5. Copy the Client ID and Client Secret into:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### OneDrive, SharePoint, Azure DevOps, Azure Blob (Microsoft)

All four Microsoft-backed providers use a single Azure AD app.

1. Go to [Azure Portal](https://portal.azure.com) → **App registrations → New registration**.
2. **Supported account types**: choose **"Any Entra ID Tenant + Personal Microsoft accounts"** (the `common` tenant). This allows both personal OneDrive accounts and work/school accounts (SharePoint, Azure DevOps, Azure Blob). If you only need your own organization, "Single tenant" also works — set `MICROSOFT_TENANT` to your tenant ID instead of `common`.
3. Set the **Redirect URI** to a **Web** platform: `https://your-domain.com/api/cloud/callback`.
4. Under **Certificates & secrets → New client secret**, create one and copy it.
5. Under **API permissions → Add a permission → Microsoft Graph → Delegated**, add:
   - `Files.Read`
   - `Files.Read.All`
   - `Sites.Read.All`
   - `User.Read`
6. For Azure DevOps, add a separate permission: **Azure DevOps → user_impersonation** (or add the `499b84ac-...` resource scope).
7. For Azure Blob, add the **Azure Storage** delegated permission (`https://storage.azure.com/user_impersonation`), and assign the **Storage Blob Data Reader** role to the app on your storage account.
8. Copy the values into:
   - `MICROSOFT_CLIENT_ID` (Application/client ID)
   - `MICROSOFT_CLIENT_SECRET` (client secret)
   - `MICROSOFT_TENANT` (`common` to allow personal + org accounts, or your tenant ID)
   - `AZURE_BLOB_STORAGE_ACCOUNT` (your storage account name)

### Troubleshooting Microsoft registration

**"Could not grant admin consent. Your organization does not have a subscription (or service principal) for: Microsoft Graph, Azure DevOps, Azure Storage"**

This is expected on free/personal Entra tenants — they have no Azure DevOps org or Azure Storage subscription, so those service principals can''t exist.

Fix:
1. **Remove** the Azure DevOps and Azure Storage API permissions from the registration. They''re only needed with real Azure resources.
2. **Skip "Grant admin consent"** — it''s optional for delegated scopes. Consent happens at first sign-in.
3. Keep only `User.Read` + `Files.Read` for personal OneDrive. Drop `Files.Read.All` / `Sites.Read.All` if they also fail consent.

Account-type reality check:
- **Personal Microsoft account** → OneDrive works. SharePoint / Azure DevOps / Azure Blob do not (org-only).
- **Work/school account** → SharePoint/DevOps/Blob possible, if the org has the services and you hold the roles.

## Next Steps

- [PWA Install](/docs/pwa-install): install the deployed app to your device
- [Getting Started](/docs/getting-started): run locally for development', NULL, NULL, NULL, true),
  ('docs', 'editing', 'Editing Cards', 'Add, rename, copy, cut, paste, duplicate, delete, and connect nodes. Explore context menu actions for folders and files, plus the clipboard and undo/redo.', '
Fewer treats your graph like an editable outline. Every node supports the full set of editing actions, either from the **context menu** (right-click) or via **keyboard shortcuts**.

## Adding Cards

- Click **Add File** or **Add Folder** in the sidebar (the File & Actions section)
- Or press **Alt+N** and pick a type from the dialog
- New nodes are nested inside the currently selected folder when one is selected, otherwise they are added at the root
- New nodes auto-enter rename mode and the canvas zooms to them

To add a child directly from the canvas, right-click a folder → **Add Child Node** (available in Power User mode).

## Renaming

- Double-click a node, or use the context menu → **Rename**, or press **F2**
- Type the new name and press **Enter** to commit, **Escape** to cancel, or click away (e.g. on the canvas) to confirm and keep the typed name
- Renaming a folder updates the paths of all of its descendants
- Renaming a file auto-updates its extension and category icon

## Copy / Cut / Paste

- **Copy** (Ctrl+C): copies the selected node(s) to the clipboard
- **Cut** (Ctrl+X): cuts the selection to the clipboard (the node stays visible until pasted)
- **Paste** (Ctrl+V): pastes cut/copied nodes. Pastes into the selected folder if exactly one folder is selected, otherwise at root
- **Duplicate** (Ctrl+D): copies a node as a sibling with a "copy" naming convention

From the context menu, **Paste** on a folder pastes the clipboard contents into that folder specifically.

## Deleting

- **Delete / Backspace**: removes selected node(s)
- **Right-click → Delete**: removes a single node
- Deleting a folder cascades: all descendants (children, grandchildren, edges) are removed too
- **Clear Canvas** (trash icon in the sidebar) wipes the whole graph after a confirmation dialog

## Unparenting

Right-click a node that has a parent → **Unparent** to detach it from its parent and make it a root-level node.

## Connecting Cards

Drag from a node''s **output handle** to another node''s **input handle** to create a parent→child connection. Fewer validates the connection:

- No cycles: you cannot connect a descendant back to its ancestor
- No orphans pushed below files: files have no children, so their output handle is hidden
- Unparenting or deleting removes the affected edges automatically

## Hiding & Showing Children

In Power User mode, right-click a folder for:

- **Hide Children**: collapse the folder''s children into the Hidden Cards panel
- **Show Children**: reveal hidden children again

## Context Menu Actions

### Folders

| Action | Notes |
| ------ | ----- |
| Rename | F2 |
| Copy / Cut / Paste | Clipboard-aware |
| Duplicate | Sibling "copy" |
| Unparent | Make root-level |
| Delete | Cascade |
| Show/Hide Children | Power User mode |
| Add Child Node | Power User mode |
| Open in File Explorer | Directory imports only |
| Copy Path | Power User mode |
| Refresh from Disk | Directory imports only |

### Files

| Action | Notes |
| ------ | ----- |
| Rename | Updates extension/category |
| Copy / Cut / Duplicate | Clipboard-aware |
| Copy Name | Copies filename to clipboard |
| Delete | Single node |
| Open File | Power User mode, directory imports only |

## Undo / Redo

Every editing operation records an undo step:

- **Ctrl+Z**: undo
- **Ctrl+Shift+Z / Ctrl+Y**: redo
- 50-step history buffer

Use **Relayout** after heavy manual edits to tidy the graph.

## Next Steps

- [Keyboard Shortcuts](/docs/shortcuts): full shortcut reference
- [Graph Features](/docs/graph-features): layout, hidden nodes, and canvas
- [Settings](/docs/settings): Power User mode and node dimensions', NULL, NULL, NULL, true),
  ('docs', 'getting-started', 'Getting Started with Fewer', 'Install, import your first directory, and navigate the graph. Everything you need to start exploring directory structures visually.', '
There is a web version available at [https://app.fewer.directory/app](https://app.fewer.directory/app).

But if you want to run this locally, follow this quickstart guide.

## Installation

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Open `http://localhost:3000`.

## Quick Start

1. Click **Load sample project** in the welcome dialog
2. Use **arrow keys** (↑↓←→) to navigate the tree
3. **Right-click** (or **long-press** on touch) any node for context menu
4. Press **Ctrl+I** to see all keyboard shortcuts
5. Click **Export** to save the graph

## Import a Real Directory

1. Click **Import from disk** (or **Alt+I**)
2. Select a folder and the depth level
3. The graph builds instantly

## Advanced Import Options

If **Power User mode** is enabled in Settings, you will see the below options in the import dialog.

| Option                  | Default | Description                             |
| ----------------------- | ------- | --------------------------------------- |
| Max Depth               | 6       | How many folder levels to import        |
| Include Hidden Files    | Off     | Include dotfiles (`.gitignore`, `.env`, etc.) |
| Include File Cards      | On      | Show files or folders only              |
| Extension Filter        | None    | Comma-separated whitelist               |
| Auto-hide Large Folders | On      | Folders with >10 children hide children |

## First Graph

After import, you''ll see:

- **Orange cards** for folders (children inline, scrollable)
- **Purple cards** for files (name, extension, size)
- **Edges** connecting parent → child with 3 style options
- **Minimap** in bottom-right for navigation
- **Breadcrumb bar** showing selected node''s full path

## Keyboard Navigation

| Key                       | Action                                 |
| ------------------------- | -------------------------------------- |
| **↑↓←→**                  | Tree navigation (parent/child/sibling) |
| **Alt+N**                 | New node                               |
| **Ctrl+F**                | Search (fuzzy, click-to-zoom)          |
| **Ctrl+E**                | Export panel                           |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / Redo                            |
| **Ctrl+A**                | Select all                             |
| **Ctrl+L**                | Cycle layout direction                 |
| **Ctrl+I**                | Shortcuts reference                    |
| **F2**                    | Rename                                 |
| **Delete/Backspace**      | Remove (cascading)                     |
| **Space**                 | Fit view                               |
| **+ / - / 0**             | Zoom in/out/reset                      |

## Sign In (Optional)

Fewer works fully without an account. If you''d like to save your directories to your account, access them across devices, and share them, click **Sign in** in the top navbar. See [Accounts & Saved Graphs](/docs/accounts) for details.

## What''s Next

- [Graph Features](/docs/graph-features)
- [Import & Export](/docs/import-export)
- [Sharing Graphs](/docs/sharing)
- [Accounts & Saved Graphs](/docs/accounts)
- [Keyboard Shortcuts](/docs/shortcuts)
- [Theming](/docs/theming)
- [Deployment & Self-Hosting](/docs/deployment)', NULL, NULL, NULL, true),
  ('docs', 'graph-features', 'Graph Features', 'Deep dive into Fewer''s graph visualization: React Flow canvas, custom node types, layout engines, edge styles, and navigation features.', '
Fewer is a very feature-rich directory viewer. Here is a deep dive into all of its features:

## Canvas

Fewer uses **React Flow v12** as the rendering engine. The canvas supports:

- Pan (drag empty space)
- Zoom (scroll wheel or +/- keys)
- Fit view (Space key)
- Minimap (bottom-right, configurable)
- Controls (zoom in/out, fit view buttons)
- **Right-click** empty canvas for the canvas context menu

### Canvas Context Menu

Right-click empty canvas space to open quick actions:

- **Fit View**: zoom to show all nodes
- **Select All**: select every visible node
- **Zoom In / Zoom Out**
- **Delete Edge**: removes the last-clicked edge
- **Set as Parent**: with 2+ nodes selected, makes the last-selected folder the parent of the rest
- **Show All Cards**: reveal hidden nodes (Power User mode)
- **Paste**: paste clipboard contents at the mouse position (Power User mode)

## Node Types

### Folder Cards (Orange)

- **Children inline**: scrollable list of child nodes inside the card
- **Item counts**: shows number of children
- **Size display**: total size of all children
- **Collapsible**: click to expand/collapse children
- **Resizable**: drag corners to adjust (multi-direction)

### File Cards (Purple)

- **Filename + extension**: displayed with category icon
- **Size**: file size in bytes/KB/MB
- **Category**: auto-detected from extension (image, code, doc, etc.)
- **No children**: source handle hidden
- **Resizable**: horizontal only (width)

### Node Resizing

Select a node to see resize handles:

- **Folders**: resize in all directions
- **Files**: resize horizontally only (width)

### Handle Shortcuts

**Ctrl+click** a node''s input or output handle removes all edges connected to that handle.

## Multi-Select

- **Ctrl+A**: select all visible nodes
- **Shift+Arrow keys**: add nodes to the selection while navigating
- **Set as Parent**: batch-parent multiple selected nodes under the last-selected folder (canvas context menu or **Alt+P**)
- **Alt+Shift+P**: unparent all selected nodes
- Batch delete, copy, cut, duplicate all work on multi-selections

## Drag & Drop

Drag a folder from your file system onto the canvas to expand it and load its contents from disk. Dropped folders become standalone nodes with their children loaded.

## Layout Engine

Fewer ships a single custom **Reingold-Tilford tree layout** with contour matching, designed specifically for directory trees. It handles large graphs (1K+ nodes) and is used for both initial import and relayout operations.

- Strict parents-centered-over-children placement with contour matching
- Tighter spacing (35px average) and collision prevention
- Best for large graphs (1K+ nodes)
- Async computation for large imports, sync for relayout
- Supports all 4 layout directions (Top→Bottom, Left→Right, Bottom→Top, Right→Left)

## Layout Directions

Cycle through 4 directions (two if in basic mode) with **Ctrl+L** or via sidebar:

1. **Top → Bottom** (default)
2. **Left → Right**
3. **Bottom → Top** (limited to advanced mode)
4. **Right → Left** (limited to advanced mode)

## Max Display Depth

Configurable display depth (default 6 levels) for both import-time and post-import. Deeper nodes go to the Hidden Cards panel. Adjust via the sidebar Layout section (Power User mode).

## Edge Styles

### Curved

Smooth bezier curves. Best for general use.

### Angled

Sharp corners with configurable radius (0-20px). Adjust via sidebar.

### Straight

Direct lines. Minimalist look.

## Edge Motion

Optional motion effects:

- **None**: static edges
- **Flow**: animated dash offset
- **Pulse**: animated stroke opacity

## Edge Pattern & Weight

In Power User mode, the sidebar Edges section controls:

- **Pattern**: solid, dashed, or dotted
- **Line Thickness**: 0.5px to 6px slider

## Breadcrumb Bar

Shows selected node''s full path. Click any segment to navigate to that ancestor.

## Auto-hide Large Folders

Folders with more than N children (default: 10) auto-hide their children on import. Hidden nodes appear in the sidebar **Hidden Cards** section as a nested tree.

**Reveal a folder**: click the eye icon next to it. Its subtree becomes visible (grandchildren stay hidden if they exceed threshold).

## Hidden Cards Panel

Access via sidebar. Shows all hidden nodes grouped by parent folder:

- Nested expandable tree (any depth)
- Eye button reveals individual folders
- "Show All" button reveals everything

## Search

Fuzzy search across filenames, paths, and extensions.

- **Click result** → zoom to node
- **Hidden matches** appear with badge, click to show & zoom
- **Highlight/dim** matched/unmatched nodes

## Sidebar

- **Drag-resizable**: drag the right edge to resize (200-560px)
- **Collapsible sections**: File & Actions, Layout, Edges & Style, Hidden Cards, Graph Analytics

## Stats Panel

Real-time statistics in sidebar:

- Total files and folders
- Total size
- Breakdown by category (code, image, doc, config, etc.)', NULL, NULL, NULL, true),
  ('docs', 'import-export', 'Import & Export', 'Import directories from disk, GitHub, or files. Export your graph as SVG, PNG, JSON, CSV, DOT, shell scripts, or ASCII trees.', '
Fewer lets you import file trees in multiple formats, whether it is directly from your disk, a github url, or from a previously exported file.

## Import from Disk

1. Click **Import from disk** (or press **Alt+I**)
2. Select a folder in the file picker
3. Configure options:
   - Max scan depth
   - Max display depth
   - Include hidden files
   - Include file nodes
   - Extension filter
4. Click **Import**

The graph builds instantly with auto-layout. Large imports show a progress indicator.

### Browser Support

- **Chrome/Edge:** Full File System Access API: can read and write back to disk
- **Firefox/Safari:** `webkitdirectory` fallback: read-only import
- **Brave:** May require flag `brave://flags/#enable-experimental-web-platform-features`

## Import Options

### Max Scan Depth

How deep to scan the directory tree. `0` = no limit.

### Max Display Depth

How deep to display after import. Deeper nodes go to the Hidden Cards panel.

### Advanced Options (Power User mode)

| Option | Default | Description |
| ------ | ------- | ----------- |
| Include Hidden Files | Off | Include dotfiles (`.gitignore`, `.env`, etc.) |
| Include dependency &amp; build folders | Off | Scan `node_modules`, `dist`, `build`, `.git`, etc. |
| Skip Empty Folders | On | Hide folders with no files inside |
| Show Files on Canvas | On | Show file nodes. Off = directories only |
| File Extensions | None | Comma-separated whitelist (e.g. `ts, tsx, js`) |
| Case-Sensitive Match | Off | Match extensions case-sensitively |

## Import from URL

Import a directory from a URL. Fewer supports two kinds of URLs:

### GitHub repositories

1. Click the GitHub icon or use Import dialog
2. Paste a repo URL (e.g., `https://github.com/owner/repo`)
3. Click **Import**

Supports branch and subdirectory URLs:

- `https://github.com/owner/repo`
- `https://github.com/owner/repo/tree/branch/path`

Fetches the repo tree via the `/api/github-tree` route.

### Public file index URLs

Fewer can also visualize any public directory listing that uses Apache or nginx auto-index format (the kind you see when a web server exposes a folder without an index page). Paste the URL and click **Import**:

- `https://example.com/data/`
- `https://www.sidc.be/EUI/data/`

The server crawls the index (breadth-first, up to 200 pages and 6 levels deep), parses folder/file entries and sizes, and builds the graph. Large listings are truncated with a notice. Results are cached for 24 hours, so repeat imports of the same URL load instantly.

## Import from File

Supported formats:

- **JSON**: previous Fewer export
- **ASCII tree**: `tree` command output
- **Shell/batch script**: `mkdir -p` output

Click **Import from File** and select your file. You can also paste content directly into the dialog.

## Export Formats

| Format | Extension      | Use Case                             |
| ------ | -------------- | ------------------------------------ |
| SVG    | `.svg`         | Vector, documentation, presentations |
| PNG    | `.png`         | Raster, slides, social media         |
| JSON   | `.json`        | Full graph state, re-import          |
| CSV    | `.csv`         | Tabular, spreadsheets                |
| DOT    | `.dot`         | Graphviz rendering                   |
| Script | `.sh` / `.bat` | Reproduce directory structure        |
| Tree   | `.txt`         | ASCII tree for docs/README           |

### Export Selected

Toggle **Export Selected** to export only the currently selected subtree instead of the full graph.

### PNG Options

- Adjustable quality (1-100)
- Transparent background toggle
- Theme-aware background color

## Keyboard Shortcuts

| Key        | Action             |
| ---------- | ------------------ |
| **Alt+I**  | Open import dialog |
| **Ctrl+E** | Open export panel  |', NULL, NULL, NULL, true),
  ('docs', 'privacy', 'Privacy Policy', 'How fewer collects, uses, and protects your data. Fewer runs in your browser with no trackers, no ads, and no telemetry. This policy explains exactly what we handle, why, and how you can control it.', '
**Last updated: August 15, 2026**

<!-- NOTE FOR THE SITE OPERATOR: This policy is written to be transparent and easy to read, but it is still a template. Before publishing it as legally binding, have a qualified attorney confirm the operator identity, jurisdiction, and the named service providers below match your actual deployment. This is not legal advice. -->

## The Short Version

Fewer is a browser-based tool that turns directory structures into interactive graphs. Here is what you need to know, in plain language:

- **Your data stays yours.** Everything you import, edit, or export (your directories, graphs, and files) is processed locally in your browser. By default, none of it is sent to our servers.
- **We do not sell your data.** We do not run ads, and we do not track you across the Internet.
- **We collect almost nothing unless you sign in.** Optional features (accounts, saving across devices, share links, email invites, and email digests) involve a small, clearly described set of data. When you don''t use them, we handle almost none of your personal information.
- **You are in control.** You can export your data, delete any saved graph, unsubscribe from any email, or delete your account at any time.
- **You can stop at any moment.** Close the tab and everything that only lives in your browser disappears. Server-side data you delete is removed promptly.

If a section ever surprises you, tell us — we would rather make the policy clearer than surprise you.

## About Fewer

This Privacy Policy explains how fewer ("we", "our", or "us") handles information when you use the fewer web application and related services (together, the "Service"). The interactive app lives at [app.fewer.directory](https://app.fewer.directory). The homepage and public site are at [fewer.directory](https://fewer.directory).

Fewer is open source, licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). Because the code is public, anyone can verify how the product actually behaves — including what it does and does not collect.

By using the Service, you agree to the practices described in this policy.

## 1. What "Local" Means Here

Fewer runs entirely in your browser. Your imported directories, graphs, edits, and exported files are processed on your own device. They never leave your browser unless you choose to save them to an account or share them.

The only things that ever leave your browser are the optional actions you take, described throughout this policy (such as saving a graph, creating a share link, importing a public file index, or connecting a cloud service).

**Transparency about environments.** We run separate non-production environments (local development, deploy previews, and test branches) against a separate database from production, so activity in a dev, preview, or stage build never writes to your production data. Those builds are for testing; use them at your own discretion and don''t treat them as a permanent home for anything you care about.

## 2. Information We Collect

Because fewer is a client-side application, we collect very little. What we handle depends entirely on which optional features you use.

### Data You Provide (Optional)

- **Contact and account details.** If you create an account, we store your email address and authentication credentials (managed securely by Supabase Auth).
- **Saved graphs.** If you sign in and save a directory, the graph data you explicitly save is stored in our database so you can access it across devices. This data is private to your account by default.
- **Share links.** If you create a public share link, the graph data you choose to share is stored and served to anyone who has the link. Creating a shared link is a deliberate, visible action.
- **Email share invites.** If you invite someone by email to view a shared graph, we store the recipient''s email address and a one-time token that lets them open the graph without an account. We send that one invite email and do not use the address for anything else.
- **Watch digests.** If you enable watch digests, we store the public file-index URLs you add and email you a daily digest when those indexes change. This only happens if you enable it.
- **Bug reports.** If you submit an optional bug report, we collect the report text you write (description and steps), together with diagnostics about your browser/device and aggregate graph statistics. We use this to fix faults; bug reports are optional and you can review exactly what is sent before submitting.

### Data Collected Automatically (Minimal)

- **Service logs.** Standard logs (such as IP address, user-agent, and pages visited) are collected by our hosting provider, Netlify, to operate, secure, and debug the Service. These logs are not used for advertising or profiling.
- **Authentication logs.** Authentication providers log standard sign-in events for security.
- **Cookies and local storage.** We use storage for two practical purposes only, and neither is tracking.
- **Auth session cookie.** Kept while you are signed in so you stay authenticated. Removing it signs you out.
- **One-time cloud connection cookie.** Used during optional GitHub / Google / Microsoft connections to prevent cross-site request forgery, then cleared.
- We do **not** use cookies for advertising, analytics, or cross-site tracking, and there is no third-party tracking script on the site.

### Data from Optional Connected Services

- **Cloud connections.** If you opt in to connect a third-party service (GitHub, Google, Microsoft — covering OneDrive, SharePoint, Azure DevOps, and Azure Blob), we access those services on your behalf through OAuth, but only to list and import the trees you request. We use the minimum access needed for the task. Access tokens are encrypted at rest before storage and tied to your account. The contents of your connected accounts are not stored.

## 3. Who We Share Your Data With

We do **not** sell, rent, or trade your personal information, and we do not share data for advertising.

We share information only in these limited cases, and we name our service providers so you know who they are:

| Provider | What they do | What data they may see |
| --- | --- | --- |
| **Supabase** | Authentication and the database that stores accounts, saved graphs, and share data | Your email, your saved/share data, auth session data |
| **Netlify** | Hosting, content delivery, and serverless functions (e.g., the daily watch-digest check) | Service logs from traffic to the site |
| **Resend** | Sending transactional email (share invites and watch digests) | The recipient email address and the email content for the emails you send or receive |
| **Web3Forms** | Forwarding bug reports you choose to submit (delivered to us by email) | The report content you write, plus your browser/device and graph-diagnostics you opt into sending |
| **GitHub / Google / Microsoft** | Optional cloud imports you initiate | Only what is needed to fetch the tree you asked for; contents are never stored wholesale |
| **Legal process** | If the law requires it | Only what a valid legal request compels us to provide |

Each provider processes data only to perform its functions for us, and is bound by its own terms and privacy policies, including: [Supabase](https://supabase.com/privacy), [Netlify](https://www.netlify.com/privacy-policy/), [Resend](https://resend.com/legal/privacy-policy), [Web3Forms](https://web3forms.com/privacy), [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement), [Google](https://policies.google.com/privacy), and [Microsoft](https://privacy.microsoft.com/en-us/privacystatement).

## 4. How We Use Information

We use information only for these purposes:

- To provide, operate, and maintain the Service.
- To let you save, access, and share graphs across devices.
- To send share-invite and watch-digest emails you requested or initiated.
- To detect and fix faults, and to secure the Service against abuse.
- To respond to your support requests.
- To meet legal obligations.

We do **not** use your data to build profiles of you, to target advertising, or for anything unrelated to the Service.

## 5. Data Storage and Retention

- **Encryption in transit.** All data sent to and from the Service travels over encrypted HTTPS connections.
- **Encryption at rest.** Saved data is stored on encrypted infrastructure. Cloud access tokens are individually encrypted at rest.
- **Access controls.** Saved graphs are private to your account and protected by row-level security except where you deliberately share them.
- **How long we keep data.** We keep data only as long as needed for the purpose it was collected.
- **Account + saved graphs.** While your account is active; deleted when you delete your account.
- **Share links.** Until you delete the link.
- **Email invites.** The recipient''s email and one-time token are kept only long enough to deliver and validate the invite.
- **Service logs.** Retained under our hosting provider''s schedule, never used for advertising.

No internet transmission or electronic storage is ever 100% secure, so we cannot guarantee absolute security — but we take reasonable, industry-standard measures.

## 6. Data Transfer Across Borders

Your information may be stored and processed in a different country from your own, including where our service providers are located. When providers process data across borders, we rely on appropriate transfer mechanisms (such as Standard Contractual Clauses) where required by law. We do not transfer data for reasons unrelated to operating the Service.

## 7. Your Rights and Controls

Depending on where you live — including under India''s Digital Personal Data Protection Act (DPDP Act) 2023, the GDPR, UK GDPR, Brazil''s LGPD, California''s CCPA/CPRA, and similar laws — you may have the right to:

- **Access** a copy of the personal data we hold about you.
- **Correct** inaccurate data.
- **Delete** your data and your account.
- **Port** your data in a structured, machine-readable format.
- **Restrict or object** to certain processing.
- **Withdraw consent** at any time, where processing is based on consent.
- **Unsubscribe** from any email (every email we send includes an unsubscribe option, and watch digests can be turned off in settings).

### How to exercise your rights

- **Delete saved graphs:** directly in the Service at any time.
- **Unsubscribe from digests or email:** use the in-app controls or the unsubscribe link in any email.
- **Delete your account:** in account settings; this removes your account and its related data.
- **File a request:** open an issue on the [GitHub repository](https://github.com/qvesera/fewer) or use the contact details below.

When you request access or deletion, we will verify your identity before acting and respond within the time limits the law requires (generally no more than one month). We will not discriminate against you for exercising your rights.

## 8. Use by Children

Fewer is not directed at children under the age of 13 (or the applicable minimum age in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us and we will delete it.

## 9. Cloud Connections

Optional cloud connections (GitHub, Google, Microsoft) work strictly on your initiation:

- We only fetch directory listings from the service you connect — we never search or download the contents of your accounts wholesale.
- Tokens are encrypted at rest and can be revoked at any time by disconnecting.
- Disconnecting a connected service revokes the stored token so it can no longer be used.
- Disconnecting does not delete data you already imported; that data stays under your control.

## 10. Security Incidents

If we become aware of a security breach affecting the personal data we hold, we will notify affected users and the relevant authorities as required by law, without undue delay once we are able. We will provide clear, practical information about what happened and what you can do.

## 11. Changes to This Policy

If we change what data we collect or how we handle it, we will update this page and change the "Last updated" date. For material changes, we will post a prominent notice on the Service. Because the code is open source, you can always see exactly what the product does in a given version.

## 12. Contact Us

Questions, requests, or concerns are welcome — we would rather you tell us than wonder.

- **GitHub:** open an issue on the [fewer repository](https://github.com/qvesera/fewer) or message the maintainers.
- **Email / security:** for privacy-specific requests, use a GitHub issue marked private/security — do not paste sensitive personal data into a public thread; [SECURITY.md](https://github.com/qvesera/fewer/blob/main/SECURITY.md) has guidance.

We will respond to privacy requests as promptly as the law requires and aim to do better. If you are unsatisfied with our response, and it applies to you, you may also contact your local data-protection authority.', NULL, NULL, NULL, true),
  ('docs', 'pwa-install', 'Install as an App (PWA)', 'Fewer is a progressive web app: install it to your home screen for an app-like experience with offline support, splash screen, and standalone window.', '
Fewer is a progressive web app. Once you open [app.fewer.directory](https://app.fewer.directory/app) in a supported browser, you can install it like a native app.

## Why Install

- **App-like window**: runs in its own standalone window, no browser chrome
- **Splash screen**: branded launch screen with the Fewer logo
- **Offline support**: the app shell and static assets are cached
- **Quick access**: one tap on your home screen, dock, or taskbar

## Install on Desktop (Chrome, Edge, Brave)

1. Open [app.fewer.directory](https://app.fewer.directory/app)
2. Click the **install icon** in the address bar (or **⋮ → Install Fewer**)
3. Confirm the install dialog

## Install on Android (Chrome, Brave)

1. Open [app.fewer.directory](https://app.fewer.directory/app)
2. Tap **⋮ → Add to Home screen** (or **Install app** in the prompt)
3. Confirm

## Install on iOS (Safari)

1. Open [app.fewer.directory](https://app.fewer.directory/app) in Safari
2. Tap **Share** → **Add to Home Screen**
3. Tap **Add**

## Requirements

- **HTTPS**: PWA install requires a secure context. The hosted site qualifies; local dev on `http://localhost` also counts as secure.
- **Supported browser**: Chrome/Edge/Brave (desktop + Android), Safari (iOS 11.3+). Firefox supports the manifest but has limited install UI.
- **Updated install capability**: fewer''s manifest (`public/manifest.json`) ships 192x192 and 512x512 icons, theme colors, and a unique id so browsers show the install prompt.

## Verify Installation

After install, the app opens in its own window. You can find it by searching "fewer" in your app launcher. The address bar is hidden, and the app uses the branded theme colors for its title bar and splash.

## Local Development

If you self-host, serve the `public/` directory (which includes `manifest.json`, `robots.txt`, and icons) so the manifest resolves correctly. The standalone build in `.next/standalone` copies `public/` automatically.

## Next Steps

- [Theming](/docs/theming): make the installed app match your style
- [Keyboard Shortcuts](/docs/shortcuts): navigate faster once installed', NULL, NULL, NULL, true),
  ('docs', 'settings', 'Settings, Power User Mode & Notifications', 'Configure Fewer via the Settings dialog: theme, minimap, node dimensions, power user mode, notifications, and the About/Help tabs.', '
The gear icon in the top navbar opens **Settings**, a dialog with four tabs: **About**, **Appearance**, **Advanced**, and **Help**.

## About

- App icon, version badge, and tagline
- **Privacy blurb**: all processing happens locally in your browser; no data is uploaded
- **GitHub link**: opens the repository
- **Website link**: opens the project site
- **Sponsor button**: opens GitHub Sponsors
- Tech + license footer (Next.js, React Flow, shadcn/ui · AGPLv3)

## Appearance

- **Theme mode selector**: Light / Dark / Custom (Custom is only shown in Power User mode and opens the theme editor)
- **Show Files toggle**: show or hide file-level nodes on the canvas (folders only)

## Advanced

Advanced settings are gated behind **Power User mode**: a toggle in this tab (also reflected in the sidebar). Advanced users get:

- **Custom theme mode** visible in Appearance
- File/URL import buttons in the sidebar
- Extra layout directions (Bottom→Top, Right→Left)
- Sidebar sections: Minmax/Metrics sliders

Settings in Advanced:

| Setting | Description |
| ------- | ----------- |
| **Show Files** | Show/hide file nodes (also in Appearance) |
| **Minimap** | Toggle the minimap on/off |
| **Minimap Position** | Top-left, Top-right, Bottom-left, Bottom-right |
| **Minimap Size** | Slider, 80–300px |
| **Node Width** | Card width slider, 120–400px |
| **Node Height** | Card height slider, 40–300px |

## Help

- **Keyboard Shortcuts**: open the shortcuts dialog
- **Bug Report**: open the bug report dialog with auto-collected diagnostics
- **Restart Tutorial**: replay the interactive walkthrough
- **GitHub Issues** link
- **Website** link

## Accounts & Saved Graphs

Fewer works fully without an account. Signing in (optional) unlocks saving and sharing your directories across devices. See [Accounts & Saved Graphs](/docs/accounts) for the full guide.

### Sign in

Click the **Sign in** button in the top navbar to open the auth dialog. You can:

- **Create an account** with email + password
- **Sign in** to an existing account
- **Reset your password** via email

### Save a graph

1. Sign in
2. Click **Save Current Graph** in the **Your Directories** sidebar section
3. Name the graph and click **Save**

Saved graphs capture the full app state: nodes, edges, layout, theme mode, custom theme, minimap, and advanced settings. Restoring a saved graph restores everything.

### Manage saved graphs

The **Your Directories** section lists your saved graphs. Each row lets you:

- **Load** the graph (click the name)
- **Rename** (pencil icon)
- **Share** (link icon): anyone-with-the-link or invite-only
- **Delete** (trash icon)

Saving is always user-initiated. Fewer never auto-uploads your graph.

## Notifications

The bell icon in the navbar opens the **notification history** panel. Every major action posts a toast:

- Delete, copy, cut, duplicate, paste, unparent, connect, relayout
- Show/hide nodes, open file, refresh from disk
- Auto-hide notifications on import

A badge on the bell shows unread notifications; it clears when you open the panel. Up to 5 toasts stack at the right edge of the screen.

## Resetting

Disabling **Power User mode** resets all settings to defaults, including the theme mode.

## Next Steps

- [Theming](/docs/theming): custom colors, presets, and the theme editor
- [Graph Features](/docs/graph-features): minimap, layout, and canvas behavior
- [Editing Cards](/docs/editing): add, rename, delete, and connect nodes', NULL, NULL, NULL, true),
  ('docs', 'sharing', 'Sharing Graphs', 'Generate shareable links for your graph. Small graphs embed in the URL; large graphs use a short server-backed link. Saved graphs can be shared publicly or invite-only.', '
Fewer lets you share graphs with anyone via a link. Two ways to share:

1. **Share the current canvas** from the export toolbar (works without an account)
2. **Share a saved graph** from the "Your Directories" sidebar section (requires an account)

## Share the Current Graph

1. Click **Export** in the toolbar
2. Click **Generate Share Link**
3. Click **Copy** to copy the link to your clipboard

The link contains all nodes and edges with their positions, plus layout direction, edge style, theme mode, custom theme colors, corner radius, and node dimensions.

### How it works

- **Small graphs** are compressed into the URL hash using LZ-string (e.g. `https://app.fewer.directory/#N4IgDgTgpghgLmAXGB...`). Nothing is uploaded; the link is self-contained.
- **Large graphs** (encoded hash over ~2000 characters, roughly a few hundred nodes) are stored on the server and shared via a short link like `https://app.fewer.directory/#s:abc123`. This keeps URLs shareable where long links get truncated. If the server store is unavailable, Fewer falls back to the long hash URL.

## Open a Shared Graph

Anyone with the link can open it in their browser:

1. Paste the link into the address bar
2. The graph loads automatically from the URL hash
3. A toast confirms how many nodes were loaded

## Share a Saved Graph

If you''ve signed in and saved a graph (see [Settings](/docs/settings)), you can share it with more control:

1. Open the **Your Directories** section in the sidebar
2. Click the **share** icon on a saved graph
3. Choose access:
   - **Anyone with the link**: anyone can open the graph
   - **Invite only**: only the email addresses you list can open it
4. Click **Generate link** and copy the URL

Invite-only links require the recipient to sign in with an invited email address.

## Limitations

- **File handles**: disk file handles are not encoded. Shared graphs are read-only snapshots; "Open File" and "Refresh from Disk" actions are unavailable.
- **Hidden nodes**: hidden node state is not preserved in the share link.
- **Server-backed links expire**: large-graph and saved-graph share links are stored with a 30-day expiry and are cleaned up when read.

## Next Steps

- [Import & Export](/docs/import-export): other ways to save and load graphs
- [Settings](/docs/settings): accounts and saved graphs
- [Graph Features](/docs/graph-features): what''s included in a shared graph', NULL, NULL, NULL, true),
  ('docs', 'shortcuts', 'Keyboard Shortcuts', 'Complete reference for all keyboard shortcuts in Fewer. Navigation, editing, search, export, and view controls.', '
Fewer is primarily a keyboard driven application. Most of the common operations can be triggered using keyboard shortcuts. Here is a comprehensive list of all available shortcuts:

## Navigation

| Key       | Action                                       |
| --------- | -------------------------------------------- |
| **↑ / ↓** | Move to parent/child node                    |
| **←**     | Collapse current folder or move to parent    |
| **→**     | Expand current folder or move to first child |
| **Shift+↑↓←→** | Add node to selection (multi-select)    |

## Editing

| Key                    | Action                           |
| ---------------------- | -------------------------------- |
| **F2**                 | Rename selected node             |
| **Delete / Backspace** | Delete selected node (cascading) |
| **Alt+N**              | Add new node (file or folder)    |
| **Alt+Shift+N**        | Clear canvas                     |
| **Ctrl+C**             | Copy selected node               |
| **Ctrl+X**             | Cut selected node                |
| **Ctrl+V**             | Paste copied/cut node            |
| **Ctrl+D**             | Duplicate selected node(s)       |
| **Ctrl+Z**             | Undo last action                 |
| **Ctrl+Shift+Z / Ctrl+Y** | Redo last action              |
| **H**                  | Hide selected nodes              |
| **Shift+H**            | Show all nodes                   |
| **Enter**              | Open selected file, or focus first child of folder |

## Parent / Unparent

| Key             | Action                              |
| --------------- | ----------------------------------- |
| **Alt+P**       | Parent selected nodes (last selected = parent) |
| **Alt+Shift+P** | Unparent all selected nodes         |

## Search

| Key        | Action            |
| ---------- | ----------------- |
| **Ctrl+F** | Open search panel |
| **Escape** | Close search      |

## View

| Key        | Action                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| **Space**  | Fit view to show all nodes                                              |
| **+ / =**  | Zoom in                                                                 |
| **-**      | Zoom out                                                                |
| **0**      | Reset zoom to 100%                                                      |
| **Ctrl+L** | Cycle layout direction (Top→Bottom, Left→Right, Bottom→Top, Right→Left) |
| **Alt+F**  | Zoom to selection                                                       |
| **Alt+R**  | Re-layout graph                                                         |

## Export

| Key        | Action            |
| ---------- | ----------------- |
| **Ctrl+E** | Open export panel |

## Import

| Key       | Action             |
| --------- | ------------------ |
| **Alt+I** | Open import dialog (choose folder / file / URL / cloud source) |
| **Alt+O** | Open selected folder in file explorer |

## Reference

| Key        | Action                            |
| ---------- | --------------------------------- |
| **Ctrl+I** | Open keyboard shortcuts reference |

## Tips

- Shortcuts work when the canvas is focused
- Use **Tab** to move focus between panels if needed
- **Ctrl+A** selects all visible nodes
- **Ctrl+click** a node handle removes its connected edges', NULL, NULL, NULL, true),
  ('docs', 'terms', 'Terms of Use', 'The terms and conditions governing your use of the fewer web application and related services, written to be fair, clear, and easy to understand.', '
**Last updated: August 15, 2026**

<!-- NOTE FOR THE SITE OPERATOR: These terms are written to be fair and transparent, but they are still a template. Before publishing them as legally binding, have a qualified attorney confirm the operator identity, the governing law (currently India) in Section 15, and confirm they match your actual deployment. This is not legal advice. -->

## The Short Version

The rest of these Terms spell out the details, but here is the summary:

- Fewer is a browser-based directory graph visualizer. Your data stays local unless you save or share it.
- It is **free**, **open source** ([AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)), and you can run your own copy.
- The service is provided **"as is"** — we aim for reliability but make no guarantees and have limited liability.
- We keep your data to a minimum, don''t sell it, and you keep full ownership of everything you create.
- Disputes start with a human conversation, not a courtroom. If you have a problem, tell us first.

## About These Terms

These Terms of Use ("Terms") govern your access to and use of the fewer web application at [app.fewer.directory](https://app.fewer.directory) and related services (together, the "Service"), operated by the fewer maintainers ("we", "our", or "us"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, please do not use the Service.

Because fewer is open source, anyone can also run their own instance. If you self-host fewer, your relationship is with **that** operator under their own terms. These Terms apply to the Service hosted at fewer.directory.

## 1. Minimum Age and Acceptance

By using the Service, you confirm that you are at least 13 years old (or the applicable minimum age in your jurisdiction) and that you have reviewed and agree to these Terms and our [Privacy Policy](/docs/privacy). If you are using the Service on behalf of an organization, you represent that you have authority to bind it.

## 2. Description of the Service

Fewer is an interactive directory graph visualizer. You can import a directory structure (from your local device, a GitHub repository, a public file index, or a connected cloud service), visualize it as a graph, edit it, and export it in a variety of formats. The core application runs in your browser.

We will use reasonable efforts to keep the Service available, but we are not responsible for downtime, brief interruptions, or maintenance windows.

## 3. Accounts

Certain features (saving graphs across devices, sharing) require an account. When you create one:

- You agree to provide accurate information and keep your credentials secure.
- You are responsible for activity under your account and must notify us of unauthorized use.
- You can delete your account and your data at any time (account settings), after which your data is removed per our [Privacy Policy](/docs/privacy).

We will never contact you for your password, and we will never ask you to move money on our behalf.

## 4. Acceptable Use

You agree not to misuse the Service or help anyone else do so. Prohibited conduct includes, but is not limited to:

- Attempting to interfere with or disrupt the Service, its servers, or connected networks.
- Attempting to gain unauthorized access to accounts, systems, or data.
- Using the Service to store or transmit unlawful, harmful, or infringing content.
- Reverse engineering, decompiling, or attempting to extract source code **in a way that violates the AGPL-3.0 license**. (The source is open; if you want to understand or build on it, read and follow the license rather than circumventing it.)
- Using the Service in violation of any applicable law or regulation.
- Abusing the Service, for example by attempting to overwhelm it or by harvesting others'' data.

We may take action we reasonably believe is needed to stop misuse, including removing content or suspending access.

## 5. Your Content and Your Rights

You retain full ownership of, and responsibility for, the directories, graphs, and other content you create or import ("Your Content").

- **Limited license.** To provide the Service (for example, to save graphs to your account or to serve shared graphs to link recipients), you grant us a limited, non-exclusive, revocable license to store, process, and display Your Content **only as needed to provide the Service**. This license ends when you delete Your Content or your account.
- **No ownership claim.** We do not claim ownership of Your Content, and we will not use it for anything other than providing the Service to you.
- **You are accountable.** You are responsible for ensuring you have the right to store, use, and share Your Content.
- **Your data, your export.** You can export or delete your data at any time.

## 6. Saving, Sharing, and Connectivity

- **Saved graphs.** Graphs you save to your account are private to you by default.
- **Share links.** When you create a share link, the shared graph becomes accessible to anyone who has the link. Do not share content you wish to keep private.
- **Email invites.** When you invite someone by email, we send them a private link on your behalf. You are responsible for the invitations you send.
- **Cloud connections.** Optional cloud connections (GitHub, Google, Microsoft) access third-party services only on your initiation, and only as described in our [Privacy Policy](/docs/privacy).

## 7. Intellectual Property

Fewer, including its user interface, design, and original code, is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). You may use, modify, and distribute the source code in accordance with that license. All trademarks, service marks, and branding belong to their respective owners.

## 8. Third-Party Services

Some features rely on third-party services (for example, Supabase for authentication and storage, Netlify for hosting, Resend for email, Web3Forms for bug-report delivery, and cloud providers such as GitHub, Google, and Microsoft for optional connectivity). Your use of those features is also subject to the respective third-party terms and privacy policies, which are linked from our [Privacy Policy](/docs/privacy).

## 9. Disclaimer of Warranties

The Service is provided "as is" and "as available", **to the maximum extent permitted by law**, without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or secure. We do not represent that Your Content''s general appropriateness is verified or endorsed by us.

## 10. Limitation of Liability

To the maximum extent permitted by law, fewer and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, data, or goodwill, arising out of or in connection with your use of the Service, even if advised of the possibility of such damages. Nothing in these Terms limits or excludes liability that cannot be limited or excluded under applicable law (including liability for death or personal injury caused by negligence, or for fraud).

## 11. Indemnification

You agree to indemnify and hold harmless fewer and its operators from and against claims brought by third parties that arise out of your violation of these Terms or your misuse of the Service, subject to our prompt notice to you of any such claim and our reasonable cooperation. This clause is limited to third-party claims caused by your breach — it does not require you to cover losses caused by our own negligence or unrelated faults.

## 12. Suspension and Termination

- **You may stop at any time.** You can stop using the Service at any time and delete your data and account.
- **We will only suspend or terminate for a reason, and we will tell you why.** We may suspend or terminate access if you materially breach these Terms, if we are legally required to do so, or to protect the safety or security of our users or systems. Where practical, we will give you reasonable notice and an opportunity to fix the issue or appeal before a permanent block.
- **We won''t lock away your data.** Before any termination, where feasible, we will give you a reasonable period to export Your Content, and if the issue is fixed we will lift the suspension.

## 13. Changes to These Terms

- We may update these Terms from time to time. We will update the "Last updated" date at the top and post a notice of material changes on the Service.
- **No retroactive surprises.** Material changes apply only to your future use and take effect on the date stated in the notice — they do not apply retroactively to activity before that date.
- **Continued use is not a silent yes.** We will not treat continued use alone as acceptance of a material change where the law or fairness requires your explicit consent; in such cases we will ask for it.
- For non-material (e.g., grammatical or clarifying) changes, we will update the date without a separate notice.

## 14. Dispute Resolution

Our goal is to resolve disagreements fairly and simply:

- **Talk to us first.** Before filing any claim, contact us through the [GitHub repository](https://github.com/qvesera/fewer) to try to resolve the issue informally. Most issues are resolved this way.
- **Informal resolution period.** We will each make a good-faith effort to resolve the dispute within 30 days of the initial contact.
- **No forced arbitration.** These Terms do not require you to give up the right to go to a local court, and nothing here waives rights you cannot legally waive. For consumers, you may bring claims in the courts where you ordinarily reside.

## 15. Governing Law

These Terms are governed by the laws of **India** (the country in which the operator is established), without regard to conflict-of-law principles. You agree to submit to the non-exclusive jurisdiction of the courts applicable to **India** for any dispute arising under these Terms.

<!-- Operator: this clause reflects India as the governing law. Confirm it matches your actual establishment before publishing. -->

## 16. Contact

Questions about these Terms are welcome. Reach us through the [fewer GitHub repository](https://github.com/qvesera/fewer) by opening an issue or contacting the maintainers.', NULL, NULL, NULL, true),
  ('docs', 'theming', 'Theming', 'Customize Fewer''s appearance with built-in light/dark modes, 18 theme presets, and a custom color editor with per-color opacity.', '
Fewer has been designed with a dual color theme in mind. It comes with a light and dark theme, both of which are customizable, plus 18 hand-tuned presets and a full custom theme editor.

## Theme Modes

Fewer supports three theme modes:

- **Light**: default light interface
- **Dark**: dark interface
- **Custom**: user-defined color palette

Switch themes via Settings → Appearance tab or use the theme toggle in the sidebar.

## Built-in Themes

### Light

- Background: `#ffffff`
- Foreground: `#0a0a0b`
- Folder cards: orange palette
- File cards: purple palette

### Dark

- Background: `#0a0a0b`
- Foreground: `#f4f4f5`
- Folder cards: orange palette
- File cards: purple palette

## Theme Presets

18 popular open source theme presets are built in:

Catppuccin, Nord, Dracula, Gruvbox, Tokyo Night, Rose Pine, Solarized, One Dark, One Light, GitHub Light, GitHub Dark, Material, and more.

Each preset is hand-tuned with Open Color values for consistent, accessible contrast. Select a preset from the dropdown in the Custom Theme Editor.

## Custom Theme Editor

Access via Settings → Appearance → Custom Theme (Power User mode only).

### Sections

Colors are grouped into three sections:

- **Canvas & Text**: background, primary/secondary text, hover, handles, edges
- **Folders**: body, text, secondary text, border, icon
- **Files**: body, text, secondary text, border, icon

### Per-Color Opacity

Each color has an independent opacity slider with live preview swatch. The editor uses a full `HexAlphaColorPicker` with gradient panel, hue strip, and alpha channel.

### Draggable & Minimizable

The editor is a movable panel locked within the browser window. Click the minimize (−) button to collapse it into a small draggable dock pill that snaps to any canvas edge (top/bottom/left/right). The pill renders vertically on side edges. Click the pill to restore.

### 16 CSS Color Variables

All theme colors are exposed as `--fewer-*` CSS variables:

| Variable                     | Purpose                    |
| ---------------------------- | -------------------------- |
| `--fewer-background`         | Canvas background          |
| `--fewer-text`               | Main text color            |
| `--fewer-text-subtle`        | Secondary/subtle text      |
| `--fewer-item-hover`         | Hover state background     |
| `--fewer-handle`             | Connection handle color    |
| `--fewer-edge`               | Graph edge color           |
| `--fewer-folder-bg`          | Folder card background     |
| `--fewer-folder-border`      | Folder card border         |
| `--fewer-folder-text`        | Folder title color         |
| `--fewer-folder-subtle-text` | Folder path/footer color   |
| `--fewer-folder-icon`        | Folder icon/accent color   |
| `--fewer-file-bg`            | File card background       |
| `--fewer-file-text`          | File name color            |
| `--fewer-file-subtle-text`   | File extension/size color  |
| `--fewer-file-border`        | File card border           |
| `--fewer-file-icon`          | File icon/accent color     |

### Per-Type Text Controls

Folder and file cards each have separate text controls:

- **Folder text**: title color
- **Folder secondary text**: path and footer color
- **File text**: filename color
- **File secondary text**: extension and size color

## Aurora Haze Tokens

Motion tokens for consistent transitions:

```css
--ease-aurora: cubic-bezier(0.4, 0, 0.2, 1);
--dur-aurora: 200ms;
```

These power sidebar hover states, expand animations, and UI transitions.

## Edge Styles

Three edge styles available:

1. **Curved**: smooth bezier curves
2. **Angled**: sharp corners with configurable radius
3. **Straight**: direct lines

Adjust via sidebar Edges section or cycle with layout controls.

## Edge Motion

Optional motion effects:

- **None**: static edges
- **Flow**: animated dash offset
- **Pulse**: animated stroke opacity

## Edge Pattern & Weight

In Power User mode, the sidebar Edges section also controls:

- **Pattern**: solid, dashed, or dotted
- **Line Thickness**: 0.5px to 6px slider
- **Corner Radius**: 0-20px for angled edges

## Next Steps

- [Settings](/docs/settings): Power User mode and node dimensions
- [Graph Features](/docs/graph-features): canvas, layout, and edge behavior', NULL, NULL, NULL, true),
  ('docs', 'watch', 'Watch File Indexes', 'Watch public file indexes and get a daily email digest when they change. Toggle watching on import and manage watched indexes in Settings.', '
Fewer can watch the public file indexes you import and email you a daily digest when they change. This is useful for keeping an eye on a directory that updates over time, such as a data mirror or a downloadable-assets folder.

## How it works

1. Import a public file index URL (Apache or nginx auto-index).
2. Toggle **Watch for changes** on when you import it.
3. Fewer crawls every watched index each night at **23:59**.
4. If anything changed, you get **one consolidated email** the next morning with the additions and removals. No changes, no email.

Watching requires a signed-in account and only works for public file index URLs (not GitHub repositories).

## Watch an index

1. Sign in (use the **Sign in** button in the navbar).
2. Open **Import from URL** and paste a public file index URL.
3. Toggle **Watch for changes** on.
4. Click **Import Graph**.

The index is now watched. You''ll get a digest email only when it changes.

## Manage watched indexes

Open **Settings → Watched** to see all the indexes you''re watching. From there you can:

- See each watched URL
- **Stop watching** an index (trash icon)

## Stop watching

You can stop watching an index at any time:

- From the **Watched** tab in Settings, click the trash icon next to the index.

## Supported sources

- Public Apache/nginx auto-index directory listings.
- GitHub repositories are not watchable — the digest feature targets public file indexes.

## Privacy

Only the public directory structure you choose to watch is crawled. Fewer diffs the listing against the previous crawl and emails you the changes. It never reads file contents.

## Next Steps

- [Import & Export](/docs/import-export): import public file indexes to watch
- [Accounts](/docs/accounts): your Fewer account and saved graphs
- [Cloud Storage](/docs/cloud): browse linked cloud accounts', NULL, NULL, NULL, true)
on conflict (type, slug) do update
  set title = excluded.title,
      description = excluded.description,
      content = excluded.content,
      author = excluded.author,
      date = excluded.date,
      tags = excluded.tags,
      published = excluded.published;
