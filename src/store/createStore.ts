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
    if (needsRebuild) { set({ edges }); get().pushOp({ type: "bulk-import", nodes: store.nodes, edges: store.edges }); }
  },
  commitHistory: () => {
    const store = get();
    store.pushOp({ type: "bulk-import", nodes: store.nodes, edges: store.edges });
  },
}));
