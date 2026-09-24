"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APP_URL } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { galleryAuthorLine, galleryDisplayTitle } from "@/lib/fewer/galleryThemes";
import { FolderTree, Loader2 } from "lucide-react";

interface GraphGalleryItem {
  id: string;
  title: string;
  description: string;
  node_count: number;
  created_at: string;
  author_name: string;
  author_username: string;
  gallery_category: string | null;
  gallery_categories: Record<string, number> | null;
  gallery_preview: { root: string; children: string[]; nodeCount: number } | null;
}

const PAGE_SIZE = 24;

function prettyDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Graphs + templates section of the community gallery.
 * Fetches all items once, filters client-side by category chip.
 */
export function GraphGallerySection() {
  const allItemsRef = useRef<GraphGalleryItem[]>([]);
  const [category, setCategory] = useState("");
  const [visible, setVisible] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Single fetch on mount — gets everything
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/gallery?limit=200");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
        if (cancelled) return;
        allItemsRef.current = json.items;
        setVisible(PAGE_SIZE);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the gallery");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Client-side filter — no API call
  const filtered = useMemo(() => {
    if (!category) return allItemsRef.current;
    return allItemsRef.current.filter((i) => i.gallery_category === category);
  }, [category, /* recompute when allItemsRef changes (mount only) */ allItemsRef.current.length > 0 ? "x" : "y"]);

  // Distinct categories from the full set (stable, never shrinks)
  const categories = useMemo(() => {
    return [...new Set(allItemsRef.current.map((i) => i.gallery_category).filter(Boolean))] as string[];
  }, [allItemsRef.current.length > 0 ? "x" : "y"]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  return (
    <>
      {error ? (
        <p className="mt-8 text-sm text-muted-foreground">{error}</p>
      ) : loading ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border/40 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          <FolderTree className="mx-auto h-6 w-6 opacity-60" />
          <p className="mt-3">
            {category
              ? `No graphs in the "${category}" category.`
              : "No graphs in the gallery yet. Be the first to share one."}
          </p>
        </div>
      ) : (
        <>
          {/* Category filter chips */}
          {categories.length > 1 && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => setCategory("")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  category === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? "" : cat)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
                    category === cat
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <p className="mt-6 mb-4 text-xs text-muted-foreground/70">
            {filtered.length} public {filtered.length === 1 ? "graph" : "graphs"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((g) => (
              <a
                key={g.id}
                href={user ? `${APP_URL}/#s:${g.id}` : `${APP_URL}/?auth=open#s:${g.id}`}
                className="group flex flex-col rounded-xl border border-border/40 bg-background/60 p-5 transition-colors hover:border-primary/40"
              >
                {/* Category chip + author line */}
                <div className="flex items-center justify-between gap-2">
                  {g.gallery_category && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                      {g.gallery_category}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/70">
                    {galleryAuthorLine(g.author_name, g.author_username)}
                  </span>
                </div>

                {/* Preview block */}
                {g.gallery_preview && (
                  <div className="mt-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
                    <div className="font-semibold text-foreground/80">{g.gallery_preview.root}</div>
                    {g.gallery_preview.children.map((c, i) => (
                      <div key={i} className="pl-3">{c}</div>
                    ))}
                    {g.gallery_preview.nodeCount > 1 + g.gallery_preview.children.length && (
                      <div className="pl-3 text-muted-foreground/50">
                        +{g.gallery_preview.nodeCount - 1 - g.gallery_preview.children.length} more
                      </div>
                    )}
                  </div>
                )}

                <h3 className="mt-3 text-sm font-semibold text-foreground group-hover:underline">
                  {galleryDisplayTitle(g.title, g.id)}
                </h3>
                {g.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.description}</p>
                )}
                <div className="mt-auto pt-4 text-[11px] text-muted-foreground/70">
                  {g.node_count} cards · {prettyDate(g.created_at)}
                </div>
              </a>
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="cursor-pointer">
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
