"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X, Folder, FileIcon } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/fewer/stats";

export function SearchPanel() {
  const open = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const query = useGraphStore((s) => s.searchQuery);
  const setQuery = useGraphStore((s) => s.setSearchQuery);
  const nodes = useGraphStore((s) => s.nodes);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const setFocusedNodeId = useGraphStore((s) => s.setFocusedNodeId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open, setQuery]);

  if (!open) return null;

  // Search ALL nodes in the store — this includes files that are inside
  // folder cards (they're nodes connected via edges, just not always visible
  // as standalone cards). Also includes hidden nodes so the user can find
  // them and unhide.
  const matches = query
    ? nodes.filter(
        (n) =>
          fuzzyMatch(query, n.data.label) ||
          fuzzyMatch(query, n.data.path) ||
          (n.data.extension ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  const handleResultClick = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // If the node is hidden, unhide it first
    if (hiddenIds.includes(nodeId)) {
      useGraphStore.getState().unhideNode(nodeId);
    }

    // Select + focus the node
    setSelectedNodeIds([nodeId]);
    setFocusedNodeId(nodeId);

    // Mark the node as selected in the store so the canvas reflects it
    useGraphStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    }));

    // Set a "zoomToNode" flag in the store that GraphCanvas watches.
    // GraphCanvas will call reactFlow.setCenter() when this changes.
    // We include a timestamp so the same node can be re-zoomed.
    useGraphStore.setState({
      zoomToNode: { nodeId, timestamp: Date.now() },
    });

    // Close the search panel
    setOpen(false);
  };

  return (
    <div className="gm-float absolute right-3 top-3 z-30 w-[min(360px,calc(100vw-1.5rem))] rounded-2xl p-3">
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
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((prev) => Math.min(prev + 1, matches.slice(0, 50).length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((prev) => Math.max(prev - 1, 0));
              }
              if (e.key === "Enter" && activeIndex >= 0) {
                e.preventDefault();
                const item = matches.slice(0, 50)[activeIndex];
                if (item) handleResultClick(item.id);
              }
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
              {matches.slice(0, 50).map((n, idx) => {
                const isActive = idx === activeIndex;
                const isHidden = hiddenIds.includes(n.id);
                const Icon = n.data.type === "folder" ? Folder : FileIcon;
                return (
                  <li
                    key={n.id}
                    onClick={() => handleResultClick(n.id)}
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer rounded-md mx-1 transition-colors",
                      isActive ? "bg-muted/80" : "hover:bg-muted/60",
                      n.data.type === "folder"
                        ? "text-orange-300"
                        : "text-purple-300",
                      isHidden && "opacity-50",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">{n.data.label}</span>
                    {isHidden && (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">
                        hidden
                      </span>
                    )}
                    <span className="ml-auto truncate text-[10px] text-muted-foreground">
                      {n.data.path}
                    </span>
                  </li>
                );
              })}
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
