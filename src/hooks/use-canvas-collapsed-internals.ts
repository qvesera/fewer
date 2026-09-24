import { useEffect, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";

/**
 * Force React Flow to re-measure handles when any folder's collapse state
 * changes. Card height changes (expanded → compact pill) and handle bounds
 * become stale.
 */
export function useCanvasCollapsedInternals(
  collapsedFolderIds: string[],
  updateNodeInternals: (ids: string[]) => void,
) {
  const collapsedKey = JSON.stringify(collapsedFolderIds);
  const prevKeyRef = useRef(collapsedKey);
  useEffect(() => {
    if (prevKeyRef.current === collapsedKey) return;
    prevKeyRef.current = collapsedKey;
    if (useGraphStore.getState().nodes.length === 0) return;
    updateNodeInternals(useGraphStore.getState().nodes.map((n) => n.id));
  }, [collapsedKey, updateNodeInternals]);
}
