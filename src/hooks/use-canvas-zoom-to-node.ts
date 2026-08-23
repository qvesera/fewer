import { useEffect, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";

interface ZoomToNodeOpts {
  nodes?: Array<{ id: string }>;
  duration?: number;
  padding?: number;
  maxZoom?: number;
}

export function useCanvasZoomToNode(
  zoomToNode: { nodeId: string } | null,
  zoomToNodeIds: string[] | null,
  fitView: (options: ZoomToNodeOpts) => void,
  setZoomToNodeIds: (ids: string[] | null) => void,
) {
  useEffect(() => {
    if (!zoomToNode) return;
    const { nodeId } = zoomToNode;
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3, maxZoom: 1.5 });
    }, 150);
    return () => clearTimeout(t);
  }, [zoomToNode, fitView]);

  const zoomToNodeIdsRef = useRef(zoomToNodeIds);
  useEffect(() => { zoomToNodeIdsRef.current = zoomToNodeIds; }, [zoomToNodeIds]);

  useEffect(() => {
    const ids = zoomToNodeIdsRef.current;
    if (ids && ids.length > 0) {
      const t = setTimeout(() => {
        fitView({ nodes: ids.map((id) => ({ id })), duration: 600, padding: 0.3, maxZoom: 1.5 });
        setZoomToNodeIds(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [zoomToNodeIds]);
}
