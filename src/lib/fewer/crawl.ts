import { parseAutoIndex } from "@/lib/fewer/autoIndex";
import type { TreeEntry } from "@/lib/fewer/types";

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
  const state = { pages: 0, visited: new Set<string>() };

  // BFS queue of { url, depth }. We build the tree by walking the queue and
  // attaching children to a node map, so we can bound concurrency cleanly.
  const rootName = decodeURIComponent(rootUrl.split("/").filter(Boolean).pop() ?? "root");
  const root: TreeEntry = { name: rootName, type: "folder", children: [], webUrl: rootUrl };
  const nodeByUrl = new Map<string, TreeEntry>([[rootUrl, root]]);
  const queue: { url: string; depth: number }[] = [{ url: rootUrl, depth: 0 }];
  let truncated = false;

  while (queue.length > 0 && state.pages < maxPages) {
    // Take up to CONCURRENCY items, respecting remaining page budget.
    const batch = queue.splice(0, Math.min(CONCURRENCY, maxPages - state.pages));
    const results = await Promise.all(
      batch.map(async ({ url, depth }) => {
        if (state.visited.has(url)) return null;
        state.visited.add(url);
        state.pages++;
        const entries = await fetchEntries(url);
        return { url, depth, entries };
      })
    );

    for (const r of results) {
      if (!r) continue;
      const { url, depth, entries } = r;
      const node = nodeByUrl.get(url);
      if (!node || !entries) continue;

      for (const entry of entries) {
        if (entry.type === "folder") {
          const childUrl = new URL(entry.name + "/", url).href;
          if (state.visited.has(childUrl) || nodeByUrl.has(childUrl)) continue;
          const child: TreeEntry = {
            name: entry.name,
            type: "folder",
            children: [],
            webUrl: childUrl,
          };
          node.children!.push(child);
          nodeByUrl.set(childUrl, child);
          // Only enqueue if we haven't hit the depth cap.
          if (maxDepth === 0 || depth + 1 < maxDepth) {
            queue.push({ url: childUrl, depth: depth + 1 });
          }
        } else {
          // A file has no listing page; point it at the direct item URL so
          // "Open at source" still lands on the actual resource on the index.
          node.children!.push({
            name: entry.name,
            type: "file",
            size: entry.size,
            webUrl: new URL(entry.name, url).href,
          });
        }
      }
    }
  }

  if (state.pages >= maxPages && queue.length > 0) truncated = true;

  // Sort: folders first, then alphabetical.
  const sortTree = (entry: TreeEntry) => {
    if (!entry.children) return;
    entry.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of entry.children) sortTree(c);
  };
  sortTree(root);

  return { tree: root, truncated };
}