"use client";

import { useEffect, useMemo, useRef } from "react";
import { Search, Filter, Check, X } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { computeStats } from "@/lib/fewer/stats";
import { CATEGORY_META, FILE_CATEGORIES } from "@/lib/fewer/categoryMeta";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The global search input + file-type filter dropdown (T-198). Extracted from
 * GlobalNavbar so the web navbar and the desktop shell's compact header render
 * the exact same control. Consumers own the outer positioning (the navbar
 * centers it; the shell header pins it right).
 */
export function SearchField({ className }: { className?: string }) {
  const query = useGraphStore((s) => s.searchQuery);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const searchOpen = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const categoryFilter = useGraphStore((s) => s.categoryFilter);
  const toggleCategoryFilter = useGraphStore((s) => s.toggleCategoryFilter);
  const clearCategoryFilter = useGraphStore((s) => s.clearCategoryFilter);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const stats = useMemo(() => computeStats(nodes, edges), [nodes, edges]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/80" />
      <input
        ref={inputRef}
        type="text"
        data-search-input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search directory cards..."
        className="w-full rounded-lg border border-border/50 bg-muted/40 pl-9 pr-10 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/60 focus:bg-background transition-all"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            inputRef.current?.blur();
            setOpen(false);
          }
        }}
      />
      {/* Filter by file type */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Filter by file type"
              aria-label="Filter by file type"
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                categoryFilter.length > 0 ? "text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-xs font-medium">Filter by type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {FILE_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                const active = categoryFilter.includes(cat);
                const count = stats.byCategory[cat] ?? 0;
                return (
                  <DropdownMenuItem
                    key={cat}
                    onClick={() => toggleCategoryFilter(cat)}
                    className="flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
                      <span className={cn("truncate", active && "font-semibold text-primary")}>{meta.label}</span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                      {count}
                      {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => clearCategoryFilter()}
              disabled={categoryFilter.length === 0}
              className="text-xs cursor-pointer"
            >
              <X className="mr-2 h-3.5 w-3.5" /> Clear filter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}