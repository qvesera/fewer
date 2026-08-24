import { useCallback, useRef } from "react";
import type { FewerNode } from "@/lib/fewer/types";

interface DraggableNode { id: string; position: { x: number; y: number } };

export interface CanvasNodeDragHandlers {
  onNodeDragStart: (e: unknown, node: DraggableNode) => void;
  onNodeDragStop: (e: unknown, node: DraggableNode) => void;
  onSelectionDragStart: (e: unknown, nodes: DraggableNode[]) => void;
  onSelectionDragStop: (e: unknown, nodes: DraggableNode[]) => void;
}

/**
 * Track drag start positions and record them as history ops on drag stop.
 * Owned ref (`dragStartPositions`) is private — no external coupling.
 */
export function useCanvasNodeDrag(recordDragMoves: (moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[]) => void): CanvasNodeDragHandlers {
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  const onNodeDragStart = useCallback((_e: unknown, node: DraggableNode) => {
    dragStartPositions.current.set(node.id, { x: node.position.x, y: node.position.y });
  }, []);
  const onNodeDragStop = useCallback((_e: unknown, node: DraggableNode) => {
    const from = dragStartPositions.current.get(node.id);
    const to = { x: node.position.x, y: node.position.y };
    if (from) recordDragMoves([{ nodeId: node.id, from, to }]);
    dragStartPositions.current.delete(node.id);
  }, [recordDragMoves]);
  const onSelectionDragStart = useCallback((_e: unknown, nodes: DraggableNode[]) => {
    for (const n of nodes) dragStartPositions.current.set(n.id, { x: n.position.x, y: n.position.y });
  }, []);
  const onSelectionDragStop = useCallback((_e: unknown, nodes: DraggableNode[]) => {
    const moves = nodes.map((n) => {
      const from = dragStartPositions.current.get(n.id);
      const to = { x: n.position.x, y: n.position.y };
      return from ? { nodeId: n.id, from, to } : null;
    }).filter((m): m is { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } } => !!m);
    recordDragMoves(moves);
    for (const n of nodes) dragStartPositions.current.delete(n.id);
  }, [recordDragMoves]);

  return { onNodeDragStart, onNodeDragStop, onSelectionDragStart, onSelectionDragStop };
}
