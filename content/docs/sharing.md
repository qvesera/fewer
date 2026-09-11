---
title: Sharing Graphs
description: Generate shareable links for your graph. Small graphs embed in the URL; large graphs use a short server-backed link. Saved graphs can be shared publicly or invite-only.
---

Fewer lets you share graphs with anyone via a link. Two ways to share:

1. **Share the current canvas** from the export toolbar (works without an account)
2. **Share a saved graph** from the "Your Directories" sidebar section (requires an account)

## Share the Current Graph

1. Click **Export** in the toolbar
2. Click **Generate Share Link**
3. Click **Copy** to copy the link to your clipboard

The link contains all nodes and edges with their positions. Your own app settings (layout direction, edge style, theme, corner radius, node dimensions) are never taken from the graph — the graph always renders with the settings of whoever opens the link.

### How it works

- **Small graphs** are compressed into the URL hash using LZ-string (e.g. `https://app.fewer.directory/#N4IgDgTgpghgLmAXGB...`). Nothing is uploaded; the link is self-contained.
- **Large graphs** (encoded hash over ~2000 characters, roughly a few hundred nodes) are stored on the server and shared via a short link like `https://app.fewer.directory/#s:abc123`. This keeps URLs shareable where long links get truncated. If the server store is unavailable, Fewer falls back to the long hash URL.

## Open a Shared Graph

Anyone with the link can open it in their browser:

1. Paste the link into the address bar
2. The graph loads automatically from the URL hash
3. A toast confirms how many nodes were loaded

## Share a Saved Graph

If you've signed in and saved a graph (see [Settings](/docs/settings)), you can share it with more control:

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
- [Graph Features](/docs/graph-features): what's included in a shared graph