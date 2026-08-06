import { NextResponse } from "next/server";
import { parseAutoIndex } from "@/lib/fewer/autoIndex";
import type { TreeEntry } from "@/lib/fewer/types";

const MAX_PAGES = 200;
const MAX_DEPTH = 6;
const CONCURRENCY = 4;
const TIMEOUT_MS = 8000;

interface CrawlRequest {
  url?: string;
  maxDepth?: number;
  maxPages?: number;
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Fetch a directory listing page and parse it into auto-index entries.
 * Returns null on any failure (non-200, timeout, non-index page).
 */
async function fetchEntries(url: string): Promise<ReturnType<typeof parseAutoIndex> | null> {
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
async function crawlTree(
  rootUrl: string,
  maxDepth: number,
  maxPages: number
): Promise<{ tree: TreeEntry; truncated: boolean }> {
  const state = { pages: 0, visited: new Set<string>() };

  // BFS queue of { url, depth }. We build the tree by walking the queue and
  // attaching children to a node map, so we can bound concurrency cleanly.
  const rootName = decodeURIComponent(rootUrl.split("/").filter(Boolean).pop() ?? "root");
  const root: TreeEntry = { name: rootName, type: "folder", children: [] };
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
          const child: TreeEntry = { name: entry.name, type: "folder", children: [] };
          node.children!.push(child);
          nodeByUrl.set(childUrl, child);
          // Only enqueue if we haven't hit the depth cap.
          if (maxDepth === 0 || depth + 1 < maxDepth) {
            queue.push({ url: childUrl, depth: depth + 1 });
          }
        } else {
          node.children!.push({ name: entry.name, type: "file", size: entry.size });
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

export async function POST(request: Request) {
  try {
    const body: CrawlRequest = await request.json();
    const rawUrl = body.url?.trim();
    if (!rawUrl || !isValidHttpUrl(rawUrl)) {
      return NextResponse.json(
        { error: "Invalid URL. Provide a public file index URL (http/https)." },
        { status: 400 }
      );
    }

    const maxDepth = Math.min(Math.max(body.maxDepth ?? MAX_DEPTH, 0), MAX_DEPTH);
    const maxPages = Math.min(Math.max(body.maxPages ?? MAX_PAGES, 1), MAX_PAGES);

    const { tree, truncated } = await crawlTree(rawUrl, maxDepth, maxPages);

    return NextResponse.json({ tree, source: rawUrl, truncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}