"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MarketingLayout, APP_URL } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { FolderTree, Loader2, Globe2 } from "lucide-react";

interface GalleryItem {
  id: string;
  title: string;
  description: string;
  node_count: number;
  created_at: string;
}

function prettyDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/gallery?offset=${offset}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      setItems((prev) => (offset === 0 ? json.items : [...prev, ...json.items]));
      setTotal(json.total ?? 0);
      setHasMore(!!json.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the gallery");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Community gallery</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Directory graphs shared publicly by the fewer community. Open one straight in the
            app, or share your own from the Share dialog.
          </p>
        </div>

        {error ? (
          <p className="mt-8 text-sm text-muted-foreground">{error}</p>
        ) : loading && items.length === 0 ? (
          <div className="mt-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-xl border border-border/40 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
            <Globe2 className="mx-auto h-6 w-6 opacity-60" />
            <p className="mt-3">No graphs in the gallery yet. Be the first to share one.</p>
          </div>
        ) : (
          <>
            <p className="mt-8 mb-4 text-xs text-muted-foreground/70">
              {total} public {total === 1 ? "graph" : "graphs"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((g) => (
                <Link
                  key={g.id}
                  href={`${APP_URL}/#s:${g.id}`}
                  className="group flex flex-col rounded-xl border border-border/40 bg-background/60 p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center gap-2 text-primary/80">
                    <FolderTree className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-foreground group-hover:underline">
                    {g.title}
                  </h3>
                  {g.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.description}</p>
                  )}
                  <div className="mt-auto pt-4 text-[11px] text-muted-foreground/70">
                    {g.node_count} nodes · {prettyDate(g.created_at)}
                  </div>
                </Link>
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <Button
                  variant="outline"
                  onClick={() => load(items.length)}
                  disabled={loading}
                  className="cursor-pointer"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </MarketingLayout>
  );
}