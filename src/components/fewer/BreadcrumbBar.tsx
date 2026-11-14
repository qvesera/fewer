"use client";

import { useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbBarProps {
  /**
   * The ids THIS pane paints — the same lens as the card stamps (CanvasInner's
   * `selectionForLeaf` result), so two split panes show two different paths
   * instead of both mirroring the last-touched one (T-245). Omit to fall back
   * to the shared `selectedNodeIds` (single-canvas / standalone usage).
   */
  selectedIds?: readonly string[];
  /**
   * The owning pane. With it, a crumb click writes that pane's selection
   * (`setSelectionForLeaf` — which also activates the pane, same as clicking a
   * card in it) instead of the shared list, which belongs to whichever leaf is
   * active.
   */
  leafId?: string | null;
}

/**
 * Breadcrumb navigation bar showing the path of the currently focused/selected
 * node — per pane: each canvas bar reads its own leaf's selection. Click any
 * ancestor to select + focus it in that pane.
 */
export function BreadcrumbBar({ selectedIds, leafId }: BreadcrumbBarProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const sharedSelection = useGraphStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const setSelectionForLeaf = useGraphStore((s) => s.setSelectionForLeaf);
  const setFocusedNodeId = useGraphStore((s) => s.setFocusedNodeId);

  const selected = selectedIds ?? sharedSelection;

  // Build breadcrumb from the first selected node's ancestor chain
  const breadcrumbs = useMemo(() => {
    const selectedId = selected[0];
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
  }, [selected, nodes, edges]);

  if (breadcrumbs.length === 0) return null;

  return (
    <div data-testid="breadcrumb-bar" className="gm-float absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full px-4 py-1.5 text-xs">
      <Home className="h-3 w-3 text-muted-foreground" />
      {breadcrumbs.map((crumb, i) => (
        <div key={crumb.id} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          )}
          <button
            onClick={() => {
              if (leafId) setSelectionForLeaf(leafId, [crumb.id]);
              else setSelectedNodeIds([crumb.id]);
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
