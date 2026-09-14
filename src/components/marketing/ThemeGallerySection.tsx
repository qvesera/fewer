"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { APP_URL } from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { applyCustomThemeToDOM, clearCustomThemeFromDOM } from "@/store/slices/themeSlice";
import { swatchColors, galleryDisplayTitle, galleryAuthorLine } from "@/lib/fewer/galleryThemes";
import type { CustomTheme } from "@/lib/fewer/types";
import { Loader2, Palette, Search, RotateCcw, Sparkles, Check } from "lucide-react";

interface ThemeGalleryItem {
  id: string;
  name: string;
  theme: CustomTheme;
  title: string;
  description: string;
  author_name: string;
  author_username: string;
  created_at: string;
}

function prettyDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Theme section of the community gallery. Browsing stays passive; hitting
 * "Apply" injects the chosen theme's CSS variables onto the page's root via
 * the same `applyCustomThemeToDOM` the app uses, so the theme is tried out on
 * this very page (full marketing page, not a preview panel).
 */
export function ThemeGallerySection() {
  const [items, setItems] = useState<ThemeGalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [appliedName, setAppliedName] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const load = useCallback(async (offset: number, query: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/gallery/themes?offset=${offset}&q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      setItems((prev) => (offset === 0 ? json.items : [...prev, ...json.items]));
      setTotal(json.total ?? 0);
      setHasMore(!!json.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load themes");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search input, then reload from the top on query change.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    load(0, debouncedQ);
  }, [load, debouncedQ]);

  /** Apply straight to the page root — immediate, same as the app's live view. */
  const applyTheme = (item: ThemeGalleryItem) => {
    applyCustomThemeToDOM(item.theme);
    setAppliedName(item.name);
    toast({
      title: "Theme applied",
      description: `"${galleryDisplayTitle(item.title, item.name)}" is live on this page. Apply resets when you leave.`,
    });
  };

  const resetTheme = () => {
    clearCustomThemeFromDOM();
    setAppliedName(null);
  };

  const saveTheme = async (item: ThemeGalleryItem) => {
    if (!user) {
      toast({ title: "Sign in to save themes", description: "Create an account to keep this theme.", variant: "destructive" });
      return;
    }
    setSavingId(item.id);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.title || item.name, theme: item.theme }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast({ title: "Theme saved", description: `"${galleryDisplayTitle(item.title, item.name)}" saved to your themes.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not save theme";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mt-8">
      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search themes or authors…"
          className="pl-9"
          aria-label="Search themes or authors"
        />
      </div>

      {appliedName && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Now trying <span className="font-semibold">“{appliedName}”</span> on this page.
          </p>
          <Button variant="outline" size="sm" onClick={resetTheme} className="cursor-pointer gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset theme
          </Button>
        </div>
      )}
      {error ? (
        <p className="mt-8 text-sm text-muted-foreground">{error}</p>
      ) : loading && items.length === 0 ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border/40 bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          <Palette className="mx-auto h-6 w-6 opacity-60" />
          <p className="mt-3">
            {debouncedQ ? `No themes match “${debouncedQ}”.` : "No themes in the gallery yet. Be the first to share one."}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-8 mb-4 text-xs text-muted-foreground/70">
            {total} theme{total === 1 ? "" : "s"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col rounded-xl border border-border/40 bg-background/60 p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex overflow-hidden rounded-md border border-border/60"
                    style={{ height: 22 }}
                    title="Theme colors"
                  >
                    {swatchColors(item.theme).map((c, i) => (
                      <div key={i} className="h-full w-6" style={{ background: c }} />
                    ))}
                  </div>
                  {appliedName === item.name && (
                    <span className="flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500">
                      <Check className="h-3 w-3" /> Applied
                    </span>
                  )}
                </div>

                <h3 className="mt-3 text-sm font-semibold text-foreground group-hover:underline">
                  {galleryDisplayTitle(item.title, item.name)}
                </h3>
                {item.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                )}

                <div className="mt-auto space-y-3 pt-4">
                  <p className="text-[11px] text-muted-foreground/70">
                    {galleryAuthorLine(item.author_name, item.author_username)} · {prettyDate(item.created_at)}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 cursor-pointer gap-1.5" onClick={() => applyTheme(item)}>
                      <Sparkles className="h-3.5 w-3.5" /> Apply
                    </Button>
                    <Link
                      href={`${APP_URL}/#t:${item.id}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                    >
                      Open in app
                    </Link>
                    {user && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveTheme(item)}
                        disabled={savingId === item.id}
                        className="cursor-pointer"
                        title="Save to your themes"
                      >
                        {savingId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Palette className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <Button variant="outline" onClick={() => load(items.length, debouncedQ)} disabled={loading} className="cursor-pointer">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}