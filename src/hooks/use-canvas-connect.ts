import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { edgeTypeFor } from "@/lib/fewer/edgeHighlight";
import type { EdgeStyle, FewerEdge } from "@/lib/fewer/types";
import { FEWER_ADD_NODE, FEWER_ADD_NODE_PARENT } from "@/lib/fewer/keyboardShortcuts";
import { useGraphStore } from "@/store/graphStore";

export interface CanvasConnectHandlers {
  /** Store-backed connect: validates, persists, and mirrors the edge to RF. */
  onConnect: (connection: { source: string; target: string }) => void;
  /**
   * Dropping a connection handle on an invalid target → select the dragged
   * node and open the create-node dialog at the pointer position (parent
   * variant when dragging OUT of a target handle).
   */
  onConnectEnd: (
    event: unknown,
    connectionState: {
      isValid: boolean | null;
      fromNode?: { id: string; data?: { type?: string } };
      fromHandle?: { type?: "source" | "target" };
    },
  ) => void;
}

export interface CanvasConnectDeps {
  connectNodes: (connection: { source: string; target: string }) => { ok: boolean; reason?: string };
  setRfEdges: Dispatch<SetStateAction<FewerEdge[]>>;
  edgeStyle: EdgeStyle;
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}

export function useCanvasConnect({ connectNodes, setRfEdges, edgeStyle, screenToFlowPosition, toast }: CanvasConnectDeps): CanvasConnectHandlers {
  const onConnect = useCallback(
    (connection) => {
      const result = connectNodes(connection);
      if (!result.ok) {
        toast({ title: "Connection rejected", description: result.reason, variant: "destructive" });
      } else if (connection.source && connection.target) {
        setRfEdges((eds) => [...eds, { id: `e-${connection.source}-${connection.target}-${Date.now()}`, source: connection.source, target: connection.target, type: edgeTypeFor(edgeStyle) }]);
      }
    },
    [connectNodes, toast, setRfEdges, edgeStyle],
  );

  const onConnectEnd = useCallback(
    (event: unknown, connectionState: { isValid: boolean | null; fromNode?: { id: string; data?: { type?: string } }; fromHandle?: { type?: "source" | "target" } }) => {
      if (!connectionState.isValid && connectionState.fromNode) {
        const store = useGraphStore.getState();
        store.setSelectedNodeIds([connectionState.fromNode.id]);
        // Capture pointer position so the new node lands where the cursor is.
        const e = event as MouseEvent & { changedTouches?: TouchList; touches?: TouchList };
        const t = e.changedTouches?.[0] ?? e.touches?.[0];
        const clientX = t?.clientX ?? e.clientX ?? 0;
        const clientY = t?.clientY ?? e.clientY ?? 0;
        store.setPendingCreatePosition(screenToFlowPosition({ x: clientX, y: clientY }));
        if (connectionState.fromHandle?.type === "target") {
          // Dragging out of a node's entry handle → create a parent folder for it.
          window.dispatchEvent(new CustomEvent(FEWER_ADD_NODE_PARENT));
        } else if (connectionState.fromNode.data?.type === "folder") {
          window.dispatchEvent(new CustomEvent(FEWER_ADD_NODE));
        }
      }
    },
    [screenToFlowPosition],
  );

  return { onConnect, onConnectEnd };
}