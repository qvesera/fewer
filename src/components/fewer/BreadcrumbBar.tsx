"use client";

import { useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Breadcrumb navigation bar showing the path of the currently focused/selected
 * node. Click any ancestor to select + focus it.
 */
export function BreadcrumbBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const setFocusedNodeId = useGraphStore((s) => s.setFocusedNodeId);

  // Build breadcrumb from the first selected node's ancestor chain
  const breadcrumbs = useMemo(() => {
    const selectedId = selectedNodeIds[0];
    if (!selectedId) return [];

    const chain: { id: string; label: string }[] = [];
    let currentId: string | null = selectedId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = nodes.find((n) => n.id === currentId);
      if (!node) break;
      chain.unshift({ id: node.id, label: node.data.label });
      const parentEdge = edges.find((e) => e.target === currentId);
      currentId = parentEdge?.source ?? null;
    }

    return chain;
  }, [selectedNodeIds, nodes, edges]);

  if (breadcrumbs.length === 0) return null;

  return (
    <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-border/40 bg-card/80 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md">
      <Home className="h-3 w-3 text-muted-foreground" />
      {breadcrumbs.map((crumb, i) => (
        <div key={crumb.id} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          )}
          <button
            onClick={() => {
              setSelectedNodeIds([crumb.id]);
              setFocusedNodeId(crumb.id);
            }}
            className={cn(
              "rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-foreground/10",
              i === breadcrumbs.length - 1
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            )}
          >
            {crumb.label}
          </button>
        </div>
      ))}
    </div>
  );
}
