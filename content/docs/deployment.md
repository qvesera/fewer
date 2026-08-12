---
title: Deployment & Self-Hosting
description: Deploy Fewer to production: Docker, Netlify, Caddy reverse proxy, and the standalone build.
---

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

Fewer splits its public surface across two domains on the same Netlify site:

- **`fewer.directory`** — the marketing homepage, privacy policy, docs, and blog. The visitor does **not** need to sign in. `middleware.ts` rewrites `/` to the marketing page (`src/app/welcome`) when the `Host` is `fewer.directory` (or `www.fewer.directory`, which 308-redirects to the apex).
- **`app.fewer.directory`** — the interactive app itself.

In Netlify, add `app.fewer.directory` (and optionally `www.fewer.directory`) as **domain aliases** on the same site; with Netlify DNS the records and TLS are provisioned automatically. The `NEXT_PUBLIC_APP_URL` env var (used for OAuth callbacks at `/api/cloud/callback`, share links, and the scheduled function) must point at the **app** domain: `https://app.fewer.directory`.

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

### Production go-live checklist

One-time settings to verify before real users arrive:

1. **Supabase dashboard → Authentication → Providers → Email**: make sure **Email** is enabled (it is the only sign-in provider).
2. **Supabase dashboard → Authentication → Sign In / Up**: turn on **Confirm email** so new accounts must verify their address (blocks fake sign-ups). The app's sign-up dialog already prompts "Check your email".
3. **Supabase dashboard → Authentication → URL Configuration**: set **Site URL** to your production app origin (e.g. `https://app.fewer.directory`) and add your origin + `https://app.fewer.directory/auth/callback` to **Redirect URLs** — required for password-reset and email-confirmation links.
4. **Netlify env vars**: linking the Netlify ⇄ Supabase integration sets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` automatically. Add the rest manually: `NEXT_PUBLIC_APP_URL` (production origin, used in emailed links), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `CONNECTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`), and the per-provider OAuth keys below.
5. **Run migrations on the hosted project**: `supabase link --project-ref <ref>` then `supabase db push`, so hardening migrations (e.g. `0012_harden_share_rls.sql`) are applied before launch.
6. **Verify invite-only sharing in an incognito window**: open an invite link signed out → 403 + sign-in prompt → sign in as the invited email → the graph loads.

### Environment Variables

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable (anon) key. RLS protects data; auth is enforced via the user's JWT |
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
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-side only) so the nightly job can read every user's watchlist |
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
2. Set the app to **External** and add the `drive.readonly` scope in **Data Access**.
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

This is expected on free/personal Entra tenants — they have no Azure DevOps org or Azure Storage subscription, so those service principals can't exist.

Fix:
1. **Remove** the Azure DevOps and Azure Storage API permissions from the registration. They're only needed with real Azure resources.
2. **Skip "Grant admin consent"** — it's optional for delegated scopes. Consent happens at first sign-in.
3. Keep only `User.Read` + `Files.Read` for personal OneDrive. Drop `Files.Read.All` / `Sites.Read.All` if they also fail consent.

Account-type reality check:
- **Personal Microsoft account** → OneDrive works. SharePoint / Azure DevOps / Azure Blob do not (org-only).
- **Work/school account** → SharePoint/DevOps/Blob possible, if the org has the services and you hold the roles.

## Next Steps

- [PWA Install](/docs/pwa-install): install the deployed app to your device
- [Getting Started](/docs/getting-started): run locally for development