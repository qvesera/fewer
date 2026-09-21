import { useCallback, useState } from "react";
import type { Edge } from "@xyflow/react";
import { useGraphStore } from "@/store/graphStore";

interface MenuPosition { x: number; y: number; }
export type CanvasMenu = MenuPosition & { kind: "pane" | "edge" | "selection" };

interface InteractionDeps {
  setRenamingId: (id: string | null) => void;
  leafId?: string;
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
}

export function useCanvasInteractionHandlers({
  setRenamingId,
  leafId,
  screenToFlowPosition,
}: InteractionDeps) {
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenu | null>(null);
  const [lastClickedEdgeId, setLastClickedEdgeId] = useState<string | null>(null);

  const onPaneClick = useCallback(() => {
    setRenamingId(null);
    if (leafId) useGraphStore.getState().setActiveLeaf(leafId);
  }, [setRenamingId, leafId]);

  const onEdgeContextMenu = useCallback(
    (event: unknown, edge: Edge) => {
      const e = event as { preventDefault: () => void; clientX: number; clientY: number };
      e.preventDefault();
      setLastClickedEdgeId(edge.id);
      setCanvasMenu({ x: e.clientX, y: e.clientY, kind: "edge" });
    },
    [],
  );

  const onPaneContextMenu = useCallback(
    (e: unknown) => {
      const ev = e as { preventDefault: () => void; clientX: number; clientY: number };
      ev.preventDefault();
      setCanvasMenu({ x: ev.clientX, y: ev.clientY, kind: "pane" });
      setLastClickedEdgeId(null);
      useGraphStore.getState().setRightClickDetected();
      if (leafId) useGraphStore.getState().setActiveLeaf(leafId);
    },
    [leafId],
  );

  const onSelectionContextMenu = useCallback((e: unknown) => {
    const ev = e as { preventDefault: () => void; clientX: number; clientY: number };
    ev.preventDefault();
    setCanvasMenu({ x: ev.clientX, y: ev.clientY, kind: "selection" });
    setLastClickedEdgeId(null);
    useGraphStore.getState().setRightClickDetected();
  }, []);

  const onNodeContextMenu = useCallback((event: unknown) => {
    (event as { preventDefault: () => void }).preventDefault();
  }, []);

  const onMouseMove = useCallback(
    (e: unknown) => {
      const ev = e as { clientX: number; clientY: number };
      const point = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      useGraphStore.getState().setMousePosition({ x: point.x, y: point.y });
    },
    [screenToFlowPosition],
  );

  const closeMenu = useCallback(() => setCanvasMenu(null), []);

  return {
    canvasMenu,
    lastClickedEdgeId,
    setLastClickedEdgeId,
    onPaneClick,
    onEdgeContextMenu,
    onPaneContextMenu,
    onSelectionContextMenu,
    onNodeContextMenu,
    onMouseMove,
    closeMenu,
  };
}
