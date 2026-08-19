import { NextResponse } from "next/server";
import type { TreeEntry } from "@/lib/fewer/types";
import { getSupabase } from "@/lib/supabase";
import { crawlTree, MAX_DEPTH, MAX_PAGES } from "@/lib/fewer/crawl";
import { fetchArchiveTree, parseArchiveUrl, archiveDetailsUrl } from "@/lib/fewer/archive";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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

    // Internet Archive items: build the tree from the metadata API (single
    // JSON request) instead of HTML-crawling the rate-limited download pages.
    // Depth/page limits don't apply — the response is always the full tree.
    const archiveId = parseArchiveUrl(rawUrl);
    if (archiveId) {
      const cacheKey = archiveDetailsUrl(archiveId);
      const cached = await readCache(cacheKey);
      if (cached) {
        return NextResponse.json({ tree: cached.tree, source: cacheKey, truncated: cached.truncated, cached: true });
      }
      const { tree, truncated } = await fetchArchiveTree(archiveId);
      await writeCache(cacheKey, tree, truncated);
      return NextResponse.json({ tree, source: cacheKey, truncated, cached: false });
    }

    // Try cache first. Only cache the default-depth crawl so a cached tree
    // is always comparable; custom depth/page requests bypass the cache.
    const cacheable = maxDepth === MAX_DEPTH && maxPages === MAX_PAGES;
    let cached: { tree: TreeEntry; truncated: boolean } | null = null;
    if (cacheable) {
      cached = await readCache(rawUrl);
      if (cached) {
        return NextResponse.json({ tree: cached.tree, source: rawUrl, truncated: cached.truncated, cached: true });
      }
    }

    const { tree, truncated } = await crawlTree(rawUrl, maxDepth, maxPages);

    if (cacheable) {
      await writeCache(rawUrl, tree, truncated);
    }

    return NextResponse.json({ tree, source: rawUrl, truncated, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Read a fresh cache entry for a URL, or null if absent/stale. */
async function readCache(url: string): Promise<{ tree: TreeEntry; truncated: boolean } | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("crawl_cache")
      .select("tree, truncated, expires_at")
      .eq("url", url)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return { tree: data.tree as TreeEntry, truncated: data.truncated };
  } catch {
    // Cache is best-effort; fall back to crawling.
    return null;
  }
}

/** Upsert a crawl result into the cache. Best-effort; never fails the request. */
async function writeCache(url: string, tree: TreeEntry, truncated: boolean): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.from("crawl_cache").upsert(
      {
        url,
        tree,
        source: url,
        truncated,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "url" }
    );
  } catch {
    // ignore cache write failures
  }
}
