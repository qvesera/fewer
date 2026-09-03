import { useMemo } from "react";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";

export interface VisibleGraph {
  visibleNodes: FewerNode[];
  visibleEdges: FewerEdge[];
  hiddenCount: number;
}

/**
 * Lens over the store's full node/edge set: drop hidden ids and lock every
 * node to zIndex 1000 so nodes always render above edges (React Flow defaults
 * edges to 0, nodes to 1000; we lock it explicitly so no edge can overlap).
 */
export function useCanvasVisibleGraph(
  allNodes: FewerNode[],
  allEdges: FewerEdge[],
  hiddenIds: string[],
): VisibleGraph {
  const hiddenCount = hiddenIds.length;
  const visibleNodes = useMemo(() => {
    let nodes = hiddenCount === 0
      ? allNodes
      : (() => { const hidden = new Set(hiddenIds); return allNodes.filter((n: FewerNode) => !hidden.has(n.id)); })();
    return nodes.map((n: FewerNode) => ({ ...n, zIndex: 1000 }));
  }, [allNodes, hiddenIds, hiddenCount]);
  const visibleEdges = useMemo(() => {
    if (hiddenCount === 0) return allEdges;
    const hidden = new Set(hiddenIds);
    return allEdges.filter((e: FewerEdge) => !hidden.has(e.source) && !hidden.has(e.target));
  }, [allEdges, hiddenIds, hiddenCount]);
  return { visibleNodes, visibleEdges, hiddenCount };
}
