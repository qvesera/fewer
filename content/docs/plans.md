---
title: Plans
description: Free and Pro plans — what each tier includes, how limits are enforced, and how to upgrade.
---

Fewer's core is free: every visualization, editing, layout, theme, and export feature runs in your browser and costs nothing to run. Plans only meter features that run on fewer's servers — saved-graph storage, watch-index crawls, cloud OAuth connectors, and invite emails.

## Free

Everything local, plus a taste of the account features:

- All imports that run locally: disk, public GitHub repos, public file index URLs
- Full editing, layouts, themes, custom themes, search, stats
- All 7 export formats (SVG, PNG, JSON, CSV, DOT, script, tree)
- Up to **5 saved graphs** (updating an existing one is never blocked)
- Public "anyone with the link" sharing and the public gallery

## Pro

For people who live in the app:

- **Unlimited saved graphs** and version history (automatic snapshot every save, restore any past version)
- **Cloud connectors**: private GitHub repos, Google Drive, OneDrive, SharePoint, Azure DevOps, Azure Blob
- **Up to 10 watched indexes** with the daily change digest email
- **Invite-only sharing** with per-email access control

## How limits work

Limits are enforced server-side in the API routes — the app shows a clear error message when you hit one, and nothing local ever stops working. Your existing graphs and watches are never deleted when a limit applies; you just can't add new ones until you upgrade or remove some.

## Managing your plan

Plans live on your account (`profiles.plan`). **Upgrade to Pro** from any upgrade prompt in the app (for example, the History dialog) or from **Settings → Account** — checkout and payment run on Stripe, and fewer never sees your card. Once subscribed, **Settings → Account → Manage subscription** opens the same Stripe-hosted billing portal, where you can change your payment method, download invoices, or cancel anytime; cancellation takes effect at the end of the current period.

## Why this split?

fewer is AGPLv3 — you can always self-host the whole app for free. The paid tier pays for the servers that make the hosted version convenient: encrypted OAuth token storage, nightly crawls, and email delivery.

## Next Steps

- [Accounts](/docs/accounts): sign in and saved graphs
- [Watch File Indexes](/docs/watch): the daily digest
- [Cloud Storage](/docs/cloud): linked cloud accounts
