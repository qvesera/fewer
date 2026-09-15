import { useMemo } from "react";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";

export interface VisibleGraph {
  visibleNodes: FewerNode[];
  visibleEdges: FewerEdge[];
  hiddenCount: number;
}

/**
 * Drop hidden nodes and lock zIndex 1000 so nodes always render above edges
 * (React Flow defaults edges to 0, nodes to 1000; locking it explicitly means
 * no edge can overlap a node). Always returns a fresh array.
 */
export function filterVisibleNodes(allNodes: FewerNode[], hiddenIds: string[]): FewerNode[] {
  const nodes = hiddenIds.length === 0
    ? allNodes
    : (() => { const hidden = new Set(hiddenIds); return allNodes.filter((n: FewerNode) => !hidden.has(n.id)); })();
  return nodes.map((n: FewerNode) => ({ ...n, zIndex: 1000 }));
}

/**
 * Drop edges whose endpoint is hidden. Returns `allEdges` unchanged (same ref)
 * when nothing is hidden, so the identity stays stable for memo consumers.
 */
export function filterVisibleEdges(allEdges: FewerEdge[], hiddenIds: string[]): FewerEdge[] {
  if (hiddenIds.length === 0) return allEdges;
  const hidden = new Set(hiddenIds);
  return allEdges.filter((e: FewerEdge) => !hidden.has(e.source) && !hidden.has(e.target));
}

/**
 * Lens over the store's full node/edge set: drop hidden ids和 lock every
 * node to zIndex 1000 so nodes always render above edges (React Flow defaults
 * edges to 0, nodes to 1000; we lock it explicitly so no edge can overlap).
 */
export function useCanvasVisibleGraph(
  allNodes: FewerNode[],
  allEdges: FewerEdge[],
  hiddenIds: string[],
): VisibleGraph {
  const hiddenCount = hiddenIds.length;
  const visibleNodes = useMemo(() => filterVisibleNodes(allNodes, hiddenIds), [allNodes, hiddenIds, hiddenCount]);
  const visibleEdges = useMemo(() => filterVisibleEdges(allEdges, hiddenIds), [allEdges, hiddenIds, hiddenCount]);
  return { visibleNodes, visibleEdges, hiddenCount };
}
