"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Folder, FileIcon, EyeOff, Search, History, X, Tag as TagIcon } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { cn } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/fewer/stats";

export function SearchPanel() {
  const open = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const query = useGraphStore((s) => s.searchQuery);
  const categoryFilter = useGraphStore((s) => s.categoryFilter);
  const setCategoryFilter = useGraphStore((s) => s.setCategoryFilter);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const nodes = useGraphStore((s) => s.nodes);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const setFocusedNodeId = useGraphStore((s) => s.setFocusedNodeId);
  const searchHistory = useGraphStore((s) => s.searchHistory);
  const commitSearch = useGraphStore((s) => s.commitSearch);
  const clearSearchHistory = useGraphStore((s) => s.clearSearchHistory);
  const tags = useGraphStore((s) => s.tags);
  const tagFilter = useGraphStore((s) => s.tagFilter);
  const toggleTagFilter = useGraphStore((s) => s.toggleTagFilter);
  const clearTagFilter = useGraphStore((s) => s.clearTagFilter);
  const applyTagFilter = useGraphStore((s) => s.applyTagFilter);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleResultClick = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (query.trim()) commitSearch(query);

    // Reveal the matched node AND every hidden ancestor up to root, so a
    // search hit is never left dangling under a still-hidden parent.
    if (hiddenIds.includes(nodeId)) {
      useGraphStore.getState().showAncestors(nodeId);
    }

    setSelectedNodeIds([nodeId]);
    setFocusedNodeId(nodeId);

    useGraphStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
      zoomToNode: { nodeId, timestamp: Date.now() },
    }));

    setOpen(false);
  };

  // Refocus the active search input (navbar on desktop, in-panel on mobile)
  // when the user clicks a non-interactive area of the panel, so typing
  // continues to flow straight into the search box instead of being lost.
  const refocusSearchInput = () => {
    document.querySelector<HTMLInputElement>("input[data-search-input]")?.focus();
  };

  const matches = useMemo(() => {
    const hasQuery = !!query;
    const q = query.toLowerCase();
    const hasTagFilter = tagFilter.length > 0;
    const tagSet = new Set(tagFilter);
    const filtered = nodes.filter((n) => {
      const categoryMatches =
        !categoryFilter || n.data.type === "folder" || n.data.category === categoryFilter;
      const queryMatches =
        !hasQuery ||
        fuzzyMatch(query, n.data.label) ||
        fuzzyMatch(query, n.data.path) ||
        (n.data.extension ?? "").toLowerCase().includes(q);
      // Tag filter: OR semantics — node carries at least one selected tag.
      const tagMatches = !hasTagFilter || (n.data.tagIds ?? []).some((t) => tagSet.has(t));
      return categoryMatches && queryMatches && tagMatches;
    });
    return filtered.sort((a, b) => {
      const aLabel = a.data.label.toLowerCase();
      const bLabel = b.data.label.toLowerCase();

      // Priority by label match quality
      const aMatch = aLabel === q ? 0 : aLabel.startsWith(q) ? 1 : fuzzyMatch(query, a.data.label) ? 2 : 3;
      const bMatch = bLabel === q ? 0 : bLabel.startsWith(q) ? 1 : fuzzyMatch(query, b.data.label) ? 2 : 3;
      if (aMatch !== bMatch) return aMatch - bMatch;

      // Files before folders
      if (a.data.type !== b.data.type) return a.data.type === "file" ? -1 : 1;

      // Alphabetical
      return aLabel.localeCompare(bLabel);
    });
  }, [query, categoryFilter, tagFilter, nodes]);

  // Keyboard navigation window listener while panel is open
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const maxIndex = matches.slice(0, 50).length - 1;
        setActiveIndex((prev) => Math.min(prev + 1, maxIndex >= 0 ? maxIndex : 0));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        const item = matches.slice(0, 50)[activeIndex];
        if (item) handleResultClick(item.id);
      } else if (e.key === "Enter" && query.trim()) {
        commitSearch(query);
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, activeIndex, query, matches]);

  // Reset indices and clear search on close
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open, setQuery]);

  if (!open) return null;

  return (
    <>
      {/* Click-outside backdrop to dismiss searching state */}
      <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

      {/* CLEAN OVERLAY PANEL: Placed below top center omnibar */}
      <div
        className="fixed left-1/2 top-[120px] z-30 w-[min(448px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border/45 bg-background/95 backdrop-blur-md p-3 shadow-xl flex flex-col gap-2.5 max-h-[calc(100vh-140px)] overflow-hidden"
        onClick={(e) => {
          // Keep typing directed into the search box even when clicking on the
          // panel's empty/placeholder areas (unless an interactive control was hit).
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, li[role='option'], [role='menuitem']")) return;
          refocusSearchInput();
        }}
      >
        {/* Search Input: only on mobile, desktop has search bar in navbar */}
        <div className="relative sm:hidden">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            ref={inputRef}
            type="text"
            data-search-input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files & directories..."
            className="w-full rounded-lg border border-border/50 bg-muted/30 pl-9 pr-9 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:bg-background transition-all"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {categoryFilter && (
          <div className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] text-primary">
            <span className="font-semibold uppercase tracking-wide">Filter:</span>
            <span>{categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1)} files</span>
            <button
              onClick={() => setCategoryFilter(null)}
              aria-label="Clear category filter"
              className="ml-auto rounded p-0.5 hover:bg-primary/20"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Tag filter chips — toggle tags to filter the canvas (OR semantics). */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TagIcon className="h-3 w-3 text-muted-foreground/60" />
            {tags.map((tag) => {
              const active = tagFilter.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    toggleTagFilter(tag.id);
                    applyTagFilter();
                  }}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    active
                      ? "border-transparent text-white"
                      : "border-border/50 bg-card/30 text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { background: tag.color } : undefined}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-white/70" : "")}
                    style={!active ? { background: tag.color } : undefined}
                    aria-hidden="true"
                  />
                  {tag.label}
                </button>
              );
            })}
            {tagFilter.length > 0 && (
              <button
                onClick={() => {
                  clearTagFilter();
                  applyTagFilter();
                }}
                className="ml-auto rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
                aria-label="Clear tag filter"
                title="Clear tag filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Match Tracker & View Container */}
        <div 
          ref={resultsContainerRef}
          className="rounded-lg bg-muted/10 flex flex-col min-h-[40px] overflow-y-auto flex-1 relative"
        >
          {!query && !categoryFilter && tagFilter.length === 0 ? (
            searchHistory.length > 0 ? (
              <div className="p-1.5 space-y-0.5 min-w-0">
                <div className="flex items-center justify-between px-1 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Recent searches</span>
                  <button
                    type="button"
                    onClick={() => clearSearchHistory()}
                    className="text-[10px] text-muted-foreground/60 hover:text-foreground rounded px-1"
                    aria-label="Clear search history"
                  >
                    Clear
                  </button>
                </div>
                {searchHistory.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="flex items-center gap-2.5 w-full px-2.5 py-1.5 text-xs cursor-pointer rounded-md hover:bg-muted/60 text-foreground/90 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="truncate text-left flex-1">{term}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground font-medium" role="status">
                Start typing to search files & directory structures...
              </div>
            )
          ) : matches.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground font-medium" role="status">
              No canvas matches found
            </div>
          ) : (
            <ul className="p-1.5 space-y-0.5 min-w-0" role="listbox" aria-label="Search results">
              {matches.slice(0, 50).map((n, idx) => {
                const isActive = idx === activeIndex;
                const isHidden = hiddenIds.includes(n.id);
                const Icon = n.data.type === "folder" ? Folder : FileIcon;
                
                return (
                  <li
                    key={n.id}
                    data-index={idx}
                    onClick={() => handleResultClick(n.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleResultClick(n.id);
                    }}
                    role="option"
                    aria-selected={isActive}
                    aria-label={`${n.data.label}, ${n.data.path}${isHidden ? ", hidden" : ""}`}
                    tabIndex={-1}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-1.5 text-xs cursor-pointer rounded-md transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive 
                        ? "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/40" 
                        : "hover:bg-muted/60 text-foreground/90",
                      isHidden && "opacity-60",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", n.data.type === "folder" ? "text-primary" : "text-purple-500")} />
                    
                    <div className="flex flex-col min-w-0 flex-1 leading-snug">
                      <span className="truncate font-semibold">{n.data.label}</span>
                      <span className="truncate text-[10px] text-muted-foreground/75 font-mono">{n.data.path}</span>
                    </div>

                    {isHidden && (
                      <span className="shrink-0 flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-300 border border-amber-500/20">
                        <EyeOff className="h-2.5 w-2.5" /> hidden
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Operational Interface Key Guide */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 border-t border-border/15 pt-2 px-1">
          <span className="flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <kbd className="rounded border border-border/50 bg-muted px-1 py-0.2 font-mono text-[9px]">↑</kbd>
              <kbd className="rounded border border-border/50 bg-muted px-1 py-0.2 font-mono text-[9px]">↓</kbd>
            </span>
            navigate
          </span>
          <span>{query ? `${matches.length} found` : ""}</span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border/50 bg-muted px-1 py-0.2 font-mono text-[9px]">Esc</kbd>
            close
          </span>
        </div>
      </div>
    </>
  );
}