import { useCallback, useRef } from "react";
import type { NodeChange } from "@xyflow/react";
import type { FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";

interface NodeChangeHandlerDeps {
  /** React Flow's internal node-setter (already wired by useNodesState). */
  onNodesChange: (changes: NodeChange<FewerNode>[]) => void;
  /** Recompute layout positions after the first dimension measurement settles. */
  relayout: () => void;
  fitView: (opts?: { duration?: number; padding?: number }) => void;
  /** Commit a debounced resize op to history. */
  recordResize: (changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[]) => void;
  /**
   * External ref (from useCanvasBoxSelect) capturing the pre-gesture selection
   * during a Shift+drag. Lets us flip RF's deselects back on for those nodes
   * so the box ADDS to the selection instead of replacing it.
   */
  boxSelectBaseRef: { current: Set<string> | null };
}

/**
 * Handle React Flow node position + dimension changes:
 *   - position changes → commit to the store immediately
 *   - dimension changes → resize via store setState; on first measurement,
 *     trigger relayout (skipped if saved positions were just loaded); commit a
 *     resize op once the gesture settles (300ms debounce).
 *
 * Private refs (`hasMeasuredRef`, `resizeStartDimensions`, `resizeTimerRef`)
 * are owned here so the handler has no external state coupling.
 */
export function useCanvasNodeChangeHandler({
  onNodesChange,
  relayout,
  fitView,
  recordResize,
  boxSelectBaseRef,
}: NodeChangeHandlerDeps) {
  void fitView; // reserved for parity with original signature; not used directly

  const hasMeasuredRef = useRef(false);
  const resizeStartDimensions = useRef<Map<string, { w: number; h: number }>>(new Map());
  const resizeTimerRef = useRef<number | null>(null);

  const handleNodesChange = useCallback(
    (changes: NodeChange<FewerNode>[]) => {
      // During a Shift+drag box select, React Flow deselects every node
      // outside the rect — including the nodes that were selected when the
      // gesture began. Flip those deselects back on so the box ADDS to the
      // selection instead of replacing it (onSelectionChange merges the id
      // lists to match).
      const base = boxSelectBaseRef.current;
      onNodesChange(
        base
          ? changes.map((c) =>
              c.type === "select" && !c.selected && base.has(c.id) ? { ...c, selected: true } : c,
            )
          : changes,
      );

      const dimensionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; dimensions: { width: number; height: number } } =>
          c.type === "dimensions" && !!c.dimensions,
      );
      const positionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; position: { x: number; y: number } } =>
          c.type === "position" && !!c.position,
      );

      if (positionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = positionChanges.find((c) => c.id === n.id);
            return change ? { ...n, position: change.position } : n;
          }),
        }));
      }

      if (dimensionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = dimensionChanges.find((c) => c.id === n.id);
            if (change) {
              // Record the pre-resize dimensions the first time we see this node resize.
              if (!resizeStartDimensions.current.has(n.id)) {
                const prev = (n.style?.width as number) ?? (n.measured?.width as number) ?? 0;
                const prevH = (n.style?.height as number) ?? (n.measured?.height as number) ?? 0;
                resizeStartDimensions.current.set(n.id, { w: prev, h: prevH });
              }
              return {
                ...n,
                style: { ...n.style, width: change.dimensions.width, height: n.data.type === "folder" ? change.dimensions.height : n.style?.height },
                measured: { width: change.dimensions.width, height: change.dimensions.height },
              };
            }
            return n;
          }),
        }));

        if (!hasMeasuredRef.current) {
          hasMeasuredRef.current = true;
          setTimeout(() => {
            // If the graph was just loaded with saved positions, don't re-lay
            // it out (that would scatter them). Skip and consume the flag.
            if (useGraphStore.getState().skipNextAutoLayout) {
              useGraphStore.setState({ skipNextAutoLayout: false });
              return;
            }
            relayout();
          }, 50);
        }

        // Commit a resize op once the resize gesture settles (debounced).
        if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          const store = useGraphStore.getState();
          const changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[] = [];
          for (const [id, from] of resizeStartDimensions.current) {
            const node = store.nodes.find((n) => n.id === id);
            if (!node) continue;
            const to = { w: (node.style?.width as number) ?? 0, h: (node.style?.height as number) ?? 0 };
            if (from.w !== to.w || from.h !== to.h) changes.push({ nodeId: id, from, to });
          }
          if (changes.length > 0) recordResize(changes);
          resizeStartDimensions.current.clear();
        }, 300);
      }
    },
            [onNodesChange, relayout, fitView, recordResize, boxSelectBaseRef],
  );

  return handleNodesChange;
}
