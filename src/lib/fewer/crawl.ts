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

/**
 * Crawl a public file index (Apache/nginx auto-index) breadth-first with a
 * small rolling pool, building a TreeEntry. Returns partial tree if the
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

  // Rolling pool: each worker takes the next queued URL the moment it finishes
  // its current page, instead of a fixed batch that waits for its slowest
  // member before the next batch starts. One slow page (up to TIMEOUT_MS)
  // therefore idles no other slot, and the pool keeps CONCURRENCY requests in
  // flight as long as the queue and budget allow.
  //
  // An empty queue is not a stopping condition: peers are still fetching and
  // about to enqueue their listings' children, so an idle worker waits for the
  // next refill (`wake`) and exits only when nothing is fetching and nothing
  // can arrive. The budget check and `pages++` are synchronous together, so
  // workers can never claim past maxPages. Sibling order is canonicalised
  // afterwards by sortTreeFoldersFirst, so completion order does not affect
  // the result.
  let inFlight = 0;
  let idle: (() => void)[] = [];
  const wake = () => {
    const waiting = idle;
    idle = [];
    for (const resolve of waiting) resolve();
  };
  const worker = async (): Promise<void> => {
    for (;;) {
      if (state.pages >= maxPages) {
        wake(); // release waiters so they can observe the spent budget too
        return;
      }
      const next = state.queue.shift();
      if (!next) {
        if (inFlight === 0) return; // nothing running → nothing can arrive
        await new Promise<void>((resolve) => {
          idle.push(resolve);
        });
        continue;
      }
      if (state.visited.has(next.url)) continue;
      state.visited.add(next.url);
      state.pages++;
      inFlight++;
      const entries = await fetchEntries(next.url);
      inFlight--;
      const node = state.nodeByUrl.get(next.url);
      if (entries && node) {
        attachEntries(node, next.url, next.depth, entries, maxDepth, state);
      }
      wake(); // children may have been enqueued — release any idle worker
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const truncated = state.pages >= maxPages && state.queue.length > 0;
  sortTreeFoldersFirst(root);

  return { tree: root, truncated };
}