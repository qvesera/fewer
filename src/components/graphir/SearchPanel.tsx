"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/graphir/stats";

export function SearchPanel() {
  const open = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const query = useGraphStore((s) => s.searchQuery);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const nodes = useGraphStore((s) => s.nodes);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open, setQuery]);

  if (!open) return null;

  const matches = query
    ? nodes.filter((n) => fuzzyMatch(query, n.data.label) || fuzzyMatch(query, n.data.path))
    : [];

  return (
    <div className="absolute right-3 top-3 z-30 w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border border-border/40 bg-card/90 p-3 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files & folders…"
            className="h-9 pl-8 pr-8"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {query && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border/30 bg-background/50">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {matches.length} match{matches.length === 1 ? "" : "es"}
          </div>
          {matches.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No matches found
            </div>
          ) : (
            <ul className="pb-1">
              {matches.slice(0, 50).map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/60",
                    n.data.type === "folder" ? "text-orange-300" : "text-purple-300"
                  )}
                >
                  <span className="truncate font-medium">{n.data.label}</span>
                  <span className="ml-auto truncate text-[10px] text-muted-foreground">
                    {n.data.path}
                  </span>
                </li>
              ))}
              {matches.length > 50 && (
                <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                  + {matches.length - 50} more…
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-muted px-1 py-0.5">↑</kbd>
          <kbd className="rounded bg-muted px-1 py-0.5">↓</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-muted px-1 py-0.5">Esc</kbd>
          close
        </span>
      </div>
    </div>
  );
}
