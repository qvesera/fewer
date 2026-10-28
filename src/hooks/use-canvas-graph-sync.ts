import { useEffect, useRef } from "react";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";

/**
 * Rebuild React Flow's node/edge state from the store whenever graphVersion
 * changes (parent/unparent, delete, cut/paste, edge-style, beautify…).
 *
 * The nodes arrive already carrying their `selected` flags: the canvas stamps
 * them from the leaf's canonical id list (viewState.stampSelection) on every
 * rebuild, which is why a rebuild for any other reason can never resurrect a
 * stale selection. `leafId` is therefore no longer needed here.
 */
export function useCanvasGraphSync(
  graphVersion: number,
  stampedNodes: FewerNode[],
  visibleEdges: FewerEdge[],
  setRfNodes: (nodes: FewerNode[]) => void,
  setRfEdges: (edges: FewerEdge[]) => void,
) {
  const prevGraphVersion = useRef(graphVersion);
  useEffect(() => {
    if (graphVersion !== prevGraphVersion.current) {
      setRfNodes(stampedNodes);
      setRfEdges(visibleEdges);
      prevGraphVersion.current = graphVersion;
    }
  }, [graphVersion, stampedNodes, visibleEdges, setRfNodes, setRfEdges]);
}
