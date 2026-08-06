---
title: Sharing Graphs
description: Generate shareable links that encode your graph state. Anyone with the link can open the exact same graph in their browser.
---

Fewer can encode your entire graph — nodes, edges, positions, layout settings, and theme — into a single URL. Share it with anyone and they'll see the exact same graph.

## Generate a Share Link

1. Click **Export** in the toolbar
2. Click **Generate Share Link**
3. Click **Copy** to copy the link to your clipboard

The link contains all nodes and edges with their positions, plus layout direction, edge style, theme mode, custom theme colors, corner radius, and node dimensions.

## Open a Shared Graph

Anyone with the link can open it in their browser:

1. Paste the link into the address bar
2. The graph loads automatically from the URL hash
3. A toast confirms how many nodes were loaded

No server round-trip — the graph state is compressed directly into the URL fragment using LZ-string.

## How It Works

The share link uses the URL hash (`#...`) to store a compressed, URL-safe encoding of the graph state:

```
https://fewer.directory/#N4IgDgTgpghgLmAXGB...
```

- **Compression** — LZ-string `compressToEncodedURIComponent` keeps links compact
- **No upload** — the graph never leaves your browser
- **Self-contained** — the link works even if the original graph was deleted

## Limitations

- **Link size** — very large graphs (10K+ nodes) produce long URLs that may exceed browser URL limits. For large graphs, use **JSON export** instead.
- **File handles** — disk file handles are not encoded. Shared graphs are read-only snapshots; "Open File" and "Refresh from Disk" actions are unavailable.
- **Hidden nodes** — hidden node state is not preserved in the share link.

## Next Steps

- [Import & Export](/docs/import-export) — other ways to save and load graphs
- [Graph Features](/docs/graph-features) — what's included in a shared graph