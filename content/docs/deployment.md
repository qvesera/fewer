---
title: Deployment & Self-Hosting
description: Deploy Fewer to production — Docker, Netlify, Caddy reverse proxy, and the standalone build.
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

- `manifest.json` — PWA manifest with 192x192 and 512x512 icons
- `robots.txt` — search engine rules
- `logo*.png/svg` — brand assets

The standalone build copies `public/` automatically. If you self-host with a custom server, make sure `public/` is served so the manifest resolves correctly.

## Environment Variables

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_APP_VERSION` | Injected at build time from `package.json` version + git commit SHA |
| `COMMIT_REF` | Git commit SHA (Netlify provides this automatically) |
| `NETLIFY` | Set by Netlify builds; disables standalone output |
| `CONTEXT` | Set by Netlify; `production` hides deploy preview overlays |

## Next Steps

- [PWA Install](/docs/pwa-install) — install the deployed app to your device
- [Getting Started](/docs/getting-started) — run locally for development