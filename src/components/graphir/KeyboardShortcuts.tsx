"use client";

import { useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useReactFlow } from "@xyflow/react";

/**
 * Global keyboard shortcuts handler. Mounted at the app root.
 *
 * Ctrl/Cmd+Z   - undo
 * Ctrl/Cmd+Shift+Z or Ctrl+Y - redo
 * Ctrl/Cmd+A   - select all
 * Ctrl/Cmd+F   - open search
 * Ctrl/Cmd+L   - cycle layout direction
 * Delete       - delete selected nodes
 * Escape       - clear selection
 * Space        - fit view
 * +/- / 0      - zoom in / out / reset
 */
export function KeyboardShortcuts() {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);

  const reactFlow = useReactFlow();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+F
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Ctrl+L - cycle layout
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        const order: ("TB" | "LR" | "BT" | "RL")[] = ["TB", "LR", "BT", "RL"];
        const next = order[(order.indexOf(direction) + 1) % order.length];
        setDirection(next);
        return;
      }

      // Ctrl+A
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedNodeIds(nodes.map((n) => n.id));
        // Reflect selection on the canvas
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => ({ ...n, selected: true })),
        }));
        return;
      }

      if (inEditable) return;

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          deleteNodes(selectedNodeIds);
        }
        return;
      }

      // Escape
      if (e.key === "Escape") {
        setSelectedNodeIds([]);
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => ({ ...n, selected: false })),
        }));
        return;
      }

      // Space - fit view
      if (e.code === "Space") {
        e.preventDefault();
        reactFlow.fitView({ duration: 600, padding: 0.2 });
        return;
      }

      // +/- and 0
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        reactFlow.zoomIn({ duration: 250 });
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        reactFlow.zoomOut({ duration: 250 });
      } else if (e.key === "0") {
        e.preventDefault();
        reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    undo,
    redo,
    setSearchOpen,
    direction,
    setDirection,
    selectedNodeIds,
    deleteNodes,
    setSelectedNodeIds,
    nodes,
    reactFlow,
  ]);

  return null;
}
