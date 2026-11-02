import { parseAutoIndex } from "@/lib/fewer/autoIndex";
import { netFetch } from "@/lib/fewer/netFetch";
import type { TreeEntry } from "@/lib/fewer/types";
import { sortTreeFoldersFirst } from "@/lib/fewer/treeSort";

export const MAX_PAGES = 200;
export const MAX_DEPTH = 6;
export const CONCURRENCY = 4;
export const TIMEOUT_MS = 8000;

// Redirects are followed manually (redirect: "manual") so every hop can be run
// through the URL guard before the server connects — `redirect: "follow"` would
// silently end at an internal address. Cap the chain to bound fetch time.
export const MAX_REDIRECT_HOPS = 8;

export interface FetchEntriesOptions {
  /**
   * URL guard applied before every fetch (root, redirect targets, discovered
   * children). Defaults to allow-all: the client-side crawl path stays
   * CORS-bound by the browser; the server route passes a strict guard.
   * May be async (the server guard resolves hostnames via DNS).
   */
  isAllowed?: (url: string) => boolean | Promise<boolean>;
}

/**
 * Fetch a directory listing page and parse it into auto-index entries.
 * Returns null on any failure (non-200, timeout, non-index page, blocked URL).
 */
export async function fetchEntries(
  url: string,
  init?: RequestInit,
  opts: FetchEntriesOptions = {},
): Promise<ReturnType<typeof parseAutoIndex> | null> {
  const isAllowed = opts.isAllowed ?? (() => true);
  if (!(await isAllowed(url))) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = url;
    for (let hops = 0; ; hops++) {
      if (hops > 0 && !(await isAllowed(current))) return null;
      // Host bridge ignores init (it owns timeout/UA/redirect); web uses it all.
      const res = await netFetch(current, {
        signal: controller.signal,
        headers: { "User-Agent": "fewer-app" },
        redirect: "manual",
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        if (hops >= MAX_REDIRECT_HOPS) return null;
        try {
          current = new URL(location, current).href;
        } catch {
          return null;
        }
        continue;
      }
      if (!res.ok) return null;
      const html = await res.text();
      const entries = parseAutoIndex(html);
      return entries.length > 0 ? entries : null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface CrawlOptions {
  /** URL guard applied to discovered child URLs before they are enqueued. May be async. */
  isAllowed?: (url: string) => boolean | Promise<boolean>;
}

interface CrawlState {
  pages: number;
  visited: Set<string>;
  nodeByUrl: Map<string, TreeEntry>;
  queue: { url: string; depth: number }[];
  isAllowed: (url: string) => boolean | Promise<boolean>;
}

/**
 * Attach one fetched listing's entries to its node. Folders become new nodes
 * (enqueued unless the depth cap is hit); files have no listing page, so they
 * point at their direct item URL to keep "Open at source" working.
 */
async function attachEntries(
  node: TreeEntry,
  url: string,
  depth: number,
  entries: ReturnType<typeof parseAutoIndex>,
  maxDepth: number,
  state: CrawlState,
): Promise<void> {
  for (const entry of entries) {
    if (entry.type !== "folder") {
      const webUrl = new URL(entry.name, url).href;
      // Never surface a private address in the exported tree.
      if (!(await state.isAllowed(webUrl))) continue;
      node.children!.push({
        name: entry.name,
        type: "file",
        size: entry.size,
        webUrl,
      });
      continue;
    }
    const childUrl = new URL(entry.name + "/", url).href;
    if (state.visited.has(childUrl) || state.nodeByUrl.has(childUrl)) continue;
    // Screen discovered URLs before they enter the tree or the fetch queue.
    if (!(await state.isAllowed(childUrl))) continue;
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
  maxPages: number,
  opts: CrawlOptions = {}
): Promise<{ tree: TreeEntry; truncated: boolean }> {
  const isAllowed = opts.isAllowed ?? (() => true);
  // BFS queue of { url, depth }. We build the tree by walking the queue and
  // attaching children to a node map, so we can bound concurrency cleanly.
  const rootName = decodeURIComponent(rootUrl.split("/").filter(Boolean).pop() ?? "root");
  const root: TreeEntry = { name: rootName, type: "folder", children: [], webUrl: rootUrl };
  const state: CrawlState = {
    pages: 0,
    visited: new Set<string>(),
    nodeByUrl: new Map<string, TreeEntry>([[rootUrl, root]]),
    queue: [{ url: rootUrl, depth: 0 }],
    isAllowed,
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
      // Screen discovered URLs before spending the page budget on them.
      if (!(await state.isAllowed(next.url))) continue;
      state.visited.add(next.url);
      state.pages++;
      inFlight++;
      const entries = await fetchEntries(next.url, undefined, { isAllowed: state.isAllowed });
      inFlight--;
      const node = state.nodeByUrl.get(next.url);
      if (entries && node) {
        await attachEntries(node, next.url, next.depth, entries, maxDepth, state);
      }
      wake(); // children may have been enqueued — release any idle worker
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const truncated = state.pages >= maxPages && state.queue.length > 0;
  sortTreeFoldersFirst(root);

  return { tree: root, truncated };
}