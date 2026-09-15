import { useCallback, useMemo, useRef } from "react";
import type { NodeChange } from "@xyflow/react";
import type { FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";

interface NodeChangeHandlerDeps {
  /** React Flow's internal node-setter (already wired by useNodesState). */
  onNodesChange: (changes: NodeChange<FewerNode>[]) => void;
  fitView: (opts?: { duration?: number; padding?: number }) => void;
  /** Commit a debounced resize op to history. */
  recordResize: (changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[]) => void;
  boxSelectBaseRef: { current: Set<string> | null };
  /** When set, position changes route to per-view instead of shared store. */
  leafId?: string;
  /**
   * Folder ids THIS leaf paints as a compact pill (its own view state). Their
   * measured height is a pill artifact, not a user-chosen size, so it must
   * never be pinned into the shared node — that is what used to squish the
   * expanded card every other view draws.
   */
  collapsedIds?: string[];
  /** Called before per-view position writes — CanvasInner seeds full map on first drag. */
  onBeforePositionCommit?: () => void;
}

/**
 * During a Shift+drag box select, React Flow deselects every node outside the
 * rect — including the nodes that were selected when the gesture began. Flip
 * those deselects back on so the box ADDS to the selection instead of
 * replacing it (onSelectionChange merges the id lists to match).
 *
 * No base set → the changes pass through untouched (same array ref).
 */
export function flipBoxSelectDeselects(
  changes: NodeChange<FewerNode>[],
  base: Set<string> | null,
): NodeChange<FewerNode>[] {
  if (!base) return changes;
  return changes.map((c) =>
    c.type === "select" && !c.selected && base.has(c.id) ? { ...c, selected: true } : c,
  );
}

/**
 * Handle React Flow node position + dimension changes:
 *   - position changes → commit to the store immediately
 *   - dimension changes → resize via store setState; commit a resize op once
 *     the gesture settles (300ms debounce). Layout is NEVER recomputed here —
 *     re-layout only runs when the user clicks Organize Graph.
 *
 * Private refs (`hasMeasuredRef`, `resizeStartDimensions`, `resizeTimerRef`)
 * are owned here so the handler has no external state coupling.
 */
export function useCanvasNodeChangeHandler({
  onNodesChange,
  fitView,
  recordResize,
  boxSelectBaseRef,
  leafId,
  collapsedIds,
  onBeforePositionCommit,
}: NodeChangeHandlerDeps) {
  void fitView; // reserved for parity with original signature; not used directly

  const resizeStartDimensions = useRef<Map<string, { w: number; h: number }>>(new Map());
  const resizeTimerRef = useRef<number | null>(null);
  const collapsedSet = useMemo(() => new Set(collapsedIds ?? []), [collapsedIds]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<FewerNode>[]) => {
      const base = boxSelectBaseRef.current;
      onNodesChange(flipBoxSelectDeselects(changes, base));

      const dimensionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; dimensions: { width: number; height: number } } =>
          c.type === "dimensions" && !!c.dimensions,
      );
      const positionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; position: { x: number; y: number } } =>
          c.type === "position" && !!c.position,
      );

      if (positionChanges.length > 0) {
        if (leafId) {
          // Seed full positions map on first drag to prevent layout jump
          onBeforePositionCommit?.();
          const entries = positionChanges.map((c) => ({ id: c.id, pos: c.position! }));
          useGraphStore.getState().setNodePositionsBatch(leafId, entries);
        } else {
          useGraphStore.setState((s) => ({
            nodes: s.nodes.map((n) => {
              const change = positionChanges.find((c) => c.id === n.id);
              return change ? { ...n, position: change.position } : n;
            }),
          }));
        }
      }

      if (dimensionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = dimensionChanges.find((c) => c.id === n.id);
            if (change) {
              // This leaf draws the folder as a compact pill (~38px). That is a
              // rendering artifact of the pill, not a size the user picked, so
              // keep it out of the shared node: pinning it would shrink the
              // expanded card every other view draws (and the layout slot).
              if (collapsedSet.has(n.id)) return n;
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
            [onNodesChange, fitView, recordResize, boxSelectBaseRef, leafId, collapsedSet, onBeforePositionCommit],
  );

  return handleNodesChange;
}
