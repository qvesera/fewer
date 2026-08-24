import { useEffect, useRef } from "react";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";

/**
 * Rebuild React Flow's node/edge state from the store whenever graphVersion
 * changes (parent/unparent, delete, cut/paste, edge-style, beautify…).
 *
 * Selection is authoritative in `selectedNodeIds` (kept in sync by
 * onSelectionChange); per-node `selected` flags on the store are NOT updated
 * for RF-driven clicks, so we force `selected` from the canonical id list to
 * avoid resurrecting stale selections after any edit.
 */
export function useCanvasGraphSync(
  graphVersion: number,
  visibleNodes: FewerNode[],
  visibleEdges: FewerEdge[],
  setRfNodes: (nodes: FewerNode[]) => void,
  setRfEdges: (edges: FewerEdge[]) => void,
) {
  const prevGraphVersion = useRef(graphVersion);
  useEffect(() => {
    if (graphVersion !== prevGraphVersion.current) {
      const selectedSet = new Set(useGraphStore.getState().selectedNodeIds);
      setRfNodes(visibleNodes.map((n: FewerNode) => (selectedSet.has(n.id) ? { ...n, selected: true } : { ...n, selected: false })));
      setRfEdges(visibleEdges);
      prevGraphVersion.current = graphVersion;
    }
  }, [graphVersion, visibleNodes, visibleEdges, setRfNodes, setRfEdges]);
}
