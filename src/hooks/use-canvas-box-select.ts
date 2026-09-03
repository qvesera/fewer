import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PointerEvent } from "react";
import type { FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";

export interface BoxSelectHandlers {
  onPointerDownCapture: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  /** Exposed so useCanvasNodeChangeHandler can flip RF deselects back on. */
  baseRef: { current: Set<string> | null };
}

interface BoxSelectDeps {
  selectedNodeIds: string[];
  setRfNodes: Dispatch<SetStateAction<FewerNode[]>>;
}

/**
 * Additive Shift+drag box selection. React Flow's box select REPLACES the
 * selection: it calls resetSelectedElements() the moment a Shift+drag starts
 * and then selects only the nodes inside the rect. To make Shift+drag ADD to
 * the existing selection instead, we capture the selected ids when the gesture
 * begins (boxSelectBaseRef), and the consumer rewrites RF's deselect changes
 * for those nodes back to `selected: true` (see useCanvasNodeChangeHandler).
 * The ref is cleared on pointer up/cancel, where we also re-assert the merged
 * selection into React Flow's controlled nodes so its internal state agrees
 * with the store. That re-assert maps the CURRENT canvas nodes (visible only)
 * — mapping the full store node list would resurrect hidden nodes.
 */
export function useCanvasBoxSelect({ selectedNodeIds, setRfNodes }: BoxSelectDeps): BoxSelectHandlers {
  const boxSelectBaseRef = useRef<Set<string> | null>(null);

  const onPointerDownCapture = (e: PointerEvent) => {
    boxSelectBaseRef.current = e.button === 0 && e.shiftKey ? new Set(selectedNodeIds) : null;
  };
  const onPointerUp = () => {
    if (!boxSelectBaseRef.current) return;
    boxSelectBaseRef.current = null;
    // Re-assert the merged selection into React Flow's controlled nodes so
    // its internal lookup agrees with the store after the gesture.
    const ids = new Set(useGraphStore.getState().selectedNodeIds);
    setRfNodes((prev) => prev.map((n) => ({ ...n, selected: ids.has(n.id) })));
  };
    const onPointerCancel = () => { boxSelectBaseRef.current = null; };

  return { onPointerDownCapture, onPointerUp, onPointerCancel, baseRef: boxSelectBaseRef };
}

