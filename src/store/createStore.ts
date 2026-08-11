"use client";
import { create } from "zustand";
import type { GraphState } from "./slices/types";
import { createHistorySlice } from "./slices/historySlice";
import { createGraphSlice } from "./slices/graphSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createLayoutSlice } from "./slices/layoutSlice";
import { createThemeSlice } from "./slices/themeSlice";

export const useGraphStore = create<GraphState>()((set, get, api) => ({
  ...createHistorySlice(set, get, api),
  ...createGraphSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createLayoutSlice(set, get, api),
  ...createThemeSlice(set, get, api),
  // Legacy methods that call through to the new ones
  _pushPast: () => {},
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  applyNodeChanges: (changes) => {
    const store = get();
    let nodes = store.nodes;
    let selectedNodeIds = store.selectedNodeIds;
    let needsRebuild = false;
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        nodes = nodes.map((n) => n.id === change.id ? { ...n, position: change.position!, dragging: change.dragging } : n);
        needsRebuild = true;
      } else if (change.type === "select") {
        nodes = nodes.map((n) => n.id === change.id ? { ...n, selected: change.selected } : n);
        needsRebuild = true;
        if (change.selected) { if (!selectedNodeIds.includes(change.id)) selectedNodeIds = [...selectedNodeIds, change.id]; }
        else selectedNodeIds = selectedNodeIds.filter((id) => id !== change.id);
      } else if (change.type === "remove") continue;
      else if (change.type === "dimensions" && change.dimensions) {
        nodes = nodes.map((n) => n.id === change.id ? { ...n, width: change.dimensions!.width, height: change.dimensions!.height } : n);
        needsRebuild = true;
      }
    }
    if (!needsRebuild) return;
    set({ nodes, selectedNodeIds });
  },
  applyEdgeChanges: (changes) => {
    const store = get();
    let edges = store.edges;
    let needsRebuild = false;
    for (const change of changes) {
      if (change.type === "select") { edges = edges.map((e) => e.id === change.id ? { ...e, selected: change.selected } : e); needsRebuild = true; }
      else if (change.type === "remove") { const edge = store.edges.find((e) => e.id === change.id); if (edge) { edges = edges.filter((e) => e.id !== change.id); needsRebuild = true; } }
    }
    if (needsRebuild) { set({ edges }); const removed = store.edges.filter((e) => !edges.some((ed) => ed.id === e.id)); if (removed.length > 0) get().pushOp({ type: "remove-edges", edges: removed }); }
  },
  /**
   * Record a completed drag operation so undo restores original positions.
   * Called by GraphCanvas on drag stop (single node or multi-selection).
   */
  recordDragMoves: (moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[]) => {
    const real = moves.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
    if (real.length === 0) return;
    get().pushOp({ type: "move-positions", moves: real });
  },
  /**
   * Record a completed resize operation so undo restores original dimensions.
   */
  recordResize: (changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[]) => {
    const real = changes.filter((c) => c.from.w !== c.to.w || c.from.h !== c.to.h);
    if (real.length === 0) return;
    get().pushOp({ type: "resize", changes: real });
  },
}));
