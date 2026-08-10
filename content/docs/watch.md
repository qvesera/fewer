---
title: Watch File Indexes
description: Watch public file indexes and get a daily email digest when they change. Toggle watching on import and manage watched indexes in Settings.
---

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

The index is now watched. You'll get a digest email only when it changes.

## Manage watched indexes

Open **Settings → Watched** to see all the indexes you're watching. From there you can:

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
- [Cloud Storage](/docs/cloud): browse linked cloud accounts