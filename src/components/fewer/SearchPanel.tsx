"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Folder, FileIcon, EyeOff } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
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
  
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = useMemo(() => {
    if (!query) return [];
    return nodes.filter(
      (n) =>
        fuzzyMatch(query, n.data.label) ||
        fuzzyMatch(query, n.data.path) ||
        (n.data.extension ?? "").toLowerCase().includes(query.toLowerCase()),
    );
  }, [query, nodes]);

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

  const handleResultClick = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (hiddenIds.includes(nodeId)) {
      useGraphStore.getState().unhideNode(nodeId);
    }

    setSelectedNodeIds([nodeId]);
    setFocusedNodeId(nodeId);

    useGraphStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
      zoomToNode: { nodeId, timestamp: Date.now() },
    }));

    setOpen(false);
  };

  return (
    <>
      {/* Click-outside backdrop to dismiss searching state */}
      <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

      {/* CLEAN OVERLAY PANEL: Placed below top center omnibar */}
      <div className="fixed left-1/2 top-[120px] z-30 w-[min(448px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border/45 bg-background/95 backdrop-blur-md p-3 shadow-xl flex flex-col gap-2.5">
        {/* Match Tracker & View Container */}
        <div 
          ref={resultsContainerRef}
          className="max-h-64 overflow-y-auto rounded-lg bg-muted/10 flex flex-col min-h-[40px] justify-center"
        >
          {!query ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground font-medium" role="status">
              Start typing to search files & directory structures...
            </div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground font-medium" role="status">
              No canvas matches found
            </div>
          ) : (
            <ul className="p-1 space-y-0.5" role="listbox" aria-label="Search results">
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
                        ? "bg-orange-500/10 text-foreground ring-1 ring-inset ring-orange-500/40" 
                        : "hover:bg-muted/60 text-foreground/90",
                      isHidden && "opacity-60",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", n.data.type === "folder" ? "text-orange-400" : "text-amber-500")} />
                    
                    <div className="flex flex-col min-w-0 flex-1 leading-normal">
                      <span className="truncate font-semibold">{n.data.label}</span>
                      <span className="truncate text-[10px] text-muted-foreground/75 font-mono">{n.data.path}</span>
                    </div>

                    {isHidden && (
                      <span className="shrink-0 flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 border border-amber-500/20">
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