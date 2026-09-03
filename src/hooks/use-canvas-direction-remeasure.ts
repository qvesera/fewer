import { useEffect } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";
import { useGraphStore } from "@/store/graphStore";

/**
 * React Flow measures handle bounds only when a node mounts or resizes.
 * Switching layout direction moves the handles (e.g. bottom → right) without
 * changing node dimensions, so visible nodes keep stale bounds and edges stay
 * anchored to the old sides until the node is culled and remounted. Force a
 * re-measure on every direction change; nodes culled by the viewport are
 * skipped here but measured on remount anyway. No remount → the minimap's
 * pan/zoom instance survives (see CHANGELOG "minimap no longer stops panning").
 */
export function useCanvasDirectionRemeasure(direction: string) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (useGraphStore.getState().nodes.length === 0) return;
    updateNodeInternals(useGraphStore.getState().nodes.map((n) => n.id));
  }, [direction, updateNodeInternals]);
}
