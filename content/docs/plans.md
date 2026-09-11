---
title: Plans
description: Guest, Free, Pro, and Team tiers — what each includes, prices, and how plans are managed.
---

Fewer's core runs entirely in the browser — every visualization, edit, layout, theme, and local export is free. Account tiers meter the features that run on fewer's servers: saved-graph storage, version snapshots, watch crawls, cloud OAuth connectors, invite emails, and large share payloads.

## Tiers

| Tier         | Price            | Included                                                           |
| ------------ | ---------------- | ------------------------------------------------------------------ |
| Guest        | Free             | Local import, all exports (watermarked), hash sharing < 2,000 chars |
| Free account | $0               | ~3 saved graphs, 30-day history, public sharing                     |
| Pro          | $10–15/mo         | Unlimited saves, 1-yr version history, saved themes, 5–10 watched indexes, crawl quota, watermark removal, large-payload short links |
| Team         | ~$12–15/user/mo  | Org workspaces, private sharing/gallery, shared theme libraries, admin controls |

### Guest

No account needed. Everything runs locally: disk import, public URLs, all editing and layout, and every export format (SVG, PNG, JSON, CSV, DOT, script, tree). Exports carry the fewer watermark. Share small graphs by encoded-hash link — the compressed hash must stay under **2,000 characters**; larger graphs need a Free account (sign in to store them with a short `#s:` link). No saved graphs, no history, no watched indexes, no cloud connectors.

### Free account

A signed-in account with no recurring price. Around 3 saved graphs (updating an existing one is never blocked), a 30-day automatic version history per graph, public "anyone with the link" sharing, the public gallery, and hash/`#s:` short links for moderate payloads. Server quotas are enforced in the API routes themselves — the UI just surfaces the error.

### Pro

For power users: unlimited saved graphs, a full year of version history, cloud-saved custom themes, up to 10 watched indexes with the nightly change digest, a crawl quota for large imports, watermark-free exports, and DB-backed short links for large payloads. Private cloud connectors (GitHub, Drive, OneDrive, SharePoint, Azure) and invite-only sharing are also Pro. **$10–15/mo.**

### Team

Everything in Pro plus org-level tooling for shared workspaces: org workspaces, private sharing and a private gallery, shared theme libraries, and admin controls. **~$12–15/user/mo.** Team-specific features are rolling out incrementally; the entitlement row is ready at the account level today.

## How plans are managed

Plans live on each account in the database (`profiles.plan`, one of `free` / `pro` / `team`) and are **assigned by the operator directly in the database** — there is no self-serve checkout while the payment gateway is disabled.

The payment gateway (Stripe) is behind a **feature flag** that is **switched off by default**:

- Server: `BILLING_ENABLED=false` — all `/api/billing/*` routes return 503.
- Client: `NEXT_PUBLIC_BILLING_ENABLED=false` — the app hides upgrade/checkout buttons and shows plan-aware status copy instead.

To change a user's plan while the flag is off, run SQL in Supabase Studio (the service role is the only writer — column-level revokes stop users flipping their own plan):

```sql
-- see the current plan
select user_id, plan from profiles;

-- grant Pro
update profiles set plan = 'pro' where user_id = '<uuid>';

-- grant Team
update profiles set plan = 'team' where user_id = '<uuid>';

-- back to Free
update profiles set plan = 'free' where user_id = '<uuid>';
```

Any metered API route re-reads the plan on every request, so a plan change takes effect immediately and requires no deploy (only service-role SQL via Studio — never the anon/authenticated roles).

## How limits work

Limits are enforced server-side in the API routes (403 `plan_limit`). Nothing local ever stops working: when you hit a cap you can still edit, export, and use everything in the browser — you just can't add new saved rows until you upgrade or remove some. Existing graphs and watches are never deleted when a limit applies.

## Why this split?

fewer is AGPLv3 — you can always self-host the whole app for free. The paid tiers pay for the servers that make the hosted version convenient: encrypted OAuth token storage, nightly crawls, version snapshot storage, and email delivery.

## Next Steps

- [Accounts](/docs/accounts): sign in and saved graphs
- [Watch File Indexes](/docs/watch): the nightly digest
- [Cloud Storage](/docs/cloud): linked cloud accounts
