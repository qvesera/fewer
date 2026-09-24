import { useCallback } from "react";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode } from "@/lib/fewer/types";

/** Build a position seed map from the current positioned nodes. */
export function buildPositionSeed(
  nodes: { id: string; position: { x: number; y: number } }[],
): Record<string, { x: number; y: number }> {
  const seed: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) seed[n.id] = n.position;
  return seed;
}

interface DragRecordingDeps {
  leafId?: string;
  positionedNodes: FewerNode[];
  seedNodePositions: (leafId: string, positions: Record<string, { x: number; y: number }>) => void;
  setNodePositionForLeaf: (leafId: string, nodeId: string, pos: { x: number; y: number }) => void;
  recordDragMoves: (
    moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[],
    leafId?: string,
  ) => void;
}

/**
 * Wraps the drag-move recording logic for leaf-aware split canvases.
 * On the first drag in a view, seeds the full positions map so non-dragged
 * nodes stay at their derived positions.
 */
export function useCanvasDragRecording({
  leafId,
  positionedNodes,
  seedNodePositions,
  setNodePositionForLeaf,
  recordDragMoves,
}: DragRecordingDeps) {
  const seedOnFirstDrag = useCallback(() => {
    if (leafId && !useGraphStore.getState().viewSettings[leafId]?.positions) {
      seedNodePositions(leafId, buildPositionSeed(positionedNodes));
    }
  }, [leafId, positionedNodes, seedNodePositions]);

  const effectiveRecordDragMoves = useCallback(
    (moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[]) => {
      if (leafId) {
        seedOnFirstDrag();
        for (const m of moves) setNodePositionForLeaf(leafId, m.nodeId, m.to);
        recordDragMoves(moves, leafId);
        useGraphStore.getState()._persistLayout();
      } else {
        recordDragMoves(moves);
      }
    },
    [leafId, seedOnFirstDrag, recordDragMoves, setNodePositionForLeaf],
  );

  return { seedOnFirstDrag, effectiveRecordDragMoves };
}
