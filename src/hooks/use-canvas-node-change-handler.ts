import { useCallback, useMemo, useRef } from "react";
import type { NodeChange } from "@xyflow/react";
import type { FewerNode } from "@/lib/fewer/types";
import { isResizeGestureFor, nodeDims, pendingResizeOps, type Dims } from "@/lib/fewer/resizeGesture";
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
 * Only dimensions captured while a NodeResizer gesture is live ever become
 * history ops (`resizeGesture.ts`). React Flow also re-measures on CONTENT
 * change — renaming to a longer label wraps the card — and recording those as
 * resizes pushed phantom `resize` entries that the next undo consumed, and the
 * redo after that replayed as `height: 0`, hiding the renamed card.
 *
 * Private refs (`resizeStartDimensions`, `resizeTimerRef`) are owned here so
 * the handler has no external state coupling.
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

  const resizeStartDimensions = useRef<Map<string, Dims>>(new Map());
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
              // Record the pre-resize dimensions the first time we see this node
              // resize — but only for a real gesture. A re-measure must not be
              // captured, or the debounce below turns it into a phantom op.
              if (isResizeGestureFor(n.id) && !resizeStartDimensions.current.has(n.id)) {
                resizeStartDimensions.current.set(n.id, nodeDims(n));
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

        // Commit a resize op once the gesture settles (debounced). Nothing
        // captured → no gesture → nothing to commit (skips the timer entirely
        // for the re-measures that a rename / relabel produces).
        if (resizeStartDimensions.current.size > 0) {
          if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = window.setTimeout(() => {
            const ops = pendingResizeOps(useGraphStore.getState().nodes, resizeStartDimensions.current);
            if (ops.length > 0) recordResize(ops);
            resizeStartDimensions.current.clear();
          }, 300);
        }
      }
    },
            [onNodesChange, fitView, recordResize, boxSelectBaseRef, leafId, collapsedSet, onBeforePositionCommit],
  );

  return handleNodesChange;
}
