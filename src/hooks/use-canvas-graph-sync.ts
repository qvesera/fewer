import { useEffect, useRef } from "react";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";

/**
 * Rebuild React Flow's node/edge state from the store whenever graphVersion
 * changes (parent/unparent, delete, cut/paste, edge-style, beautify…).
 *
 * Selection is stamped per-canvas from the leaf's own selection
 * (leafSelections[leafId]), falling back to global selectedNodeIds when
 * leafId is absent. This prevents cross-view selection contamination.
 */
export function useCanvasGraphSync(
  graphVersion: number,
  visibleNodes: FewerNode[],
  visibleEdges: FewerEdge[],
  setRfNodes: (nodes: FewerNode[]) => void,
  setRfEdges: (edges: FewerEdge[]) => void,
  leafId?: string,
) {
  const prevGraphVersion = useRef(graphVersion);
  useEffect(() => {
    if (graphVersion !== prevGraphVersion.current) {
      const state = useGraphStore.getState();
      const leafSel = leafId ? state.leafSelections[leafId] : undefined;
      const selectedSet = new Set(leafSel ?? state.selectedNodeIds);
      setRfNodes(visibleNodes.map((n: FewerNode) => (selectedSet.has(n.id) ? { ...n, selected: true } : { ...n, selected: false })));
      setRfEdges(visibleEdges);
      prevGraphVersion.current = graphVersion;
    }
  }, [graphVersion, visibleNodes, visibleEdges, setRfNodes, setRfEdges, leafId]);
}
