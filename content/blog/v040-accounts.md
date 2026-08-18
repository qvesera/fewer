---
title: v0.4.0: Accounts, Saved Graphs & Selective Sharing
date: 2026-08-10
description: Fewer 0.4.0 adds optional sign-in, saved graphs that capture your full workspace, and selective sharing — invite-only or anyone-with-the-link — while keeping saving fully user-initiated.
author: Yash Srivastava
tags: release, accounts, sharing, privacy
---

From day one, Fewer was a privacy-first, no-account tool: your graph lives in your browser and nothing is uploaded unless you ask. **v0.4.0** keeps that promise while adding the one thing a purely local tool can't do — persistence across devices. Sign-in is **optional**, saving is **always your call**, and sharing is **selective**.

## Accounts, Opt-In

There's no wall in front of the app. Everything you could do before still works logged-out — import, explore, edit, export. An account only unlocks three things: save, load, and share.

Signing up is email + password via Supabase Auth, with password reset and a session that survives refreshes. One **Sign in** button in the navbar, an account dropdown once you're in. That's it.

## Saved Graphs: Your Whole Workspace, Restored

Saving a graph doesn't just store nodes and edges. It captures the full app state:

- nodes, edges, and their positions
- layout direction and edge style
- theme mode **and** any custom theme
- minimap config and advanced settings

Restore a saved graph and it's exactly how you left it — not a flattened approximation. Saved graphs live in a new **Your Directories** section in the sidebar, where you can load, rename, or delete.

Crucially, Fewer **never auto-uploads**. Saving is always user-initiated, which means your private directories stay exactly as private as you make them.

## Selective Sharing

Now that graphs can live server-side, sharing gets real controls. A saved graph can be shared two ways:

- **Anyone with the link** — a straight public link.
- **Invite only** — only the email addresses you specify can open it, and each invitee must sign in with an invited email.

The share dialog offers both, and the backend enforces invite access (a 403 + sign-in prompt for anyone who isn't on the list). No guesswork about who can see what.

## Theme & Settings Sync

Because saved graphs carry the full state, your theme and settings travel with the graph. Pick up where you left off on another machine, and your custom colors and layout come along for the ride.

## What This Means for You

- Fewer still works **fully logged-out** — no mandatory account.
- **Saving is opt-in**, never automatic.
- Saved graphs restore your entire workspace, including theme and settings.
- Sharing is **selective**: public, or invite-only.

Try it: sign in, save a directory you care about, and open it from a different browser. Your graph follows you.

```bash
git clone https://github.com/qvesera/fewer.git
cd fewer
bun install
bun run dev
```

Fewer remains open source, client-side-first, and yours to keep — with persistence when you want it.