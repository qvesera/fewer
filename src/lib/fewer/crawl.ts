import { parseAutoIndex } from "@/lib/fewer/autoIndex";
import type { TreeEntry } from "@/lib/fewer/types";
import { sortTreeFoldersFirst } from "@/lib/fewer/treeSort";

export const MAX_PAGES = 200;
export const MAX_DEPTH = 6;
export const CONCURRENCY = 4;
export const TIMEOUT_MS = 8000;

/**
 * Fetch a directory listing page and parse it into auto-index entries.
 * Returns null on any failure (non-200, timeout, non-index page).
 */
export async function fetchEntries(url: string): Promise<ReturnType<typeof parseAutoIndex> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "fewer-app" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const entries = parseAutoIndex(html);
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface CrawlState {
  pages: number;
  visited: Set<string>;
  nodeByUrl: Map<string, TreeEntry>;
  queue: { url: string; depth: number }[];
}

/**
 * Attach one fetched listing's entries to its node. Folders become new nodes
 * (enqueued unless the depth cap is hit); files have no listing page, so they
 * point at their direct item URL to keep "Open at source" working.
 */
function attachEntries(
  node: TreeEntry,
  url: string,
  depth: number,
  entries: ReturnType<typeof parseAutoIndex>,
  maxDepth: number,
  state: CrawlState,
): void {
  for (const entry of entries) {
    if (entry.type !== "folder") {
      node.children!.push({
        name: entry.name,
        type: "file",
        size: entry.size,
        webUrl: new URL(entry.name, url).href,
      });
      continue;
    }
    const childUrl = new URL(entry.name + "/", url).href;
    if (state.visited.has(childUrl) || state.nodeByUrl.has(childUrl)) continue;
    const child: TreeEntry = { name: entry.name, type: "folder", children: [], webUrl: childUrl };
    node.children!.push(child);
    state.nodeByUrl.set(childUrl, child);
    // Only enqueue if we haven't hit the depth cap.
    if (maxDepth === 0 || depth + 1 < maxDepth) {
      state.queue.push({ url: childUrl, depth: depth + 1 });
    }
  }
}

/** Fetch up to `limit` queued pages concurrently, counting visits + page budget. */
async function fetchBatch(state: CrawlState, limit: number) {
  const batch = state.queue.splice(0, limit);
  return Promise.all(
    batch.map(async ({ url, depth }) => {
      if (state.visited.has(url)) return null;
      state.visited.add(url);
      state.pages++;
      return { url, depth, entries: await fetchEntries(url) };
    })
  );
}

/**
 * Crawl a public file index (Apache/nginx auto-index) breadth-first with a
 * small concurrency pool, building a TreeEntry. Returns partial tree if the
 * page/depth budget is exhausted.
 */
export async function crawlTree(
  rootUrl: string,
  maxDepth: number,
  maxPages: number
): Promise<{ tree: TreeEntry; truncated: boolean }> {
  // BFS queue of { url, depth }. We build the tree by walking the queue and
  // attaching children to a node map, so we can bound concurrency cleanly.
  const rootName = decodeURIComponent(rootUrl.split("/").filter(Boolean).pop() ?? "root");
  const root: TreeEntry = { name: rootName, type: "folder", children: [], webUrl: rootUrl };
  const state: CrawlState = {
    pages: 0,
    visited: new Set<string>(),
    nodeByUrl: new Map<string, TreeEntry>([[rootUrl, root]]),
    queue: [{ url: rootUrl, depth: 0 }],
  };

  while (state.queue.length > 0 && state.pages < maxPages) {
    // Take up to CONCURRENCY items, respecting remaining page budget.
    const results = await fetchBatch(state, Math.min(CONCURRENCY, maxPages - state.pages));
    for (const r of results) {
      if (!r?.entries) continue;
      const node = state.nodeByUrl.get(r.url);
      if (!node) continue;
      attachEntries(node, r.url, r.depth, r.entries, maxDepth, state);
    }
  }

  const truncated = state.pages >= maxPages && state.queue.length > 0;
  sortTreeFoldersFirst(root);

  return { tree: root, truncated };
}