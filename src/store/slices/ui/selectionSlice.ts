"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";

export type SelectionSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    selectedNodeIds: string[];
    /** Per-leaf selection storage. Key = leafId. */
    leafSelections: Record<string, string[]>;
    /** ID of the most recently interacted graph leaf (for keyboard shortcuts). */
    activeLeafId: string | null;
    /** Transient ids to ring on the canvas while a sidebar (Hidden panel) row is hovered.
     *  Deliberately separate from data.highlighted so hover never pollutes node data,
     *  history snapshots, or search highlighting. */
    hoverHighlightIds: string[];
    renamingId: string | null;
    renameSource: "canvas" | "folder" | null;
    zoomToNode: { nodeId: string; timestamp: number } | null;
    zoomToNodeIds: string[] | null;
    mousePosition: { x: number; y: number } | null;
    pastePosition: { x: number; y: number } | null;
    /** Flow-space position captured when creating a node via handle drag (onConnectEnd). */
    pendingCreatePosition: { x: number; y: number } | null;
    focusedNodeId: string | null;

    setSelectedNodeIds: (ids: string[]) => void;
    setSelectionForLeaf: (leafId: string, ids: string[]) => void;
    setActiveLeaf: (leafId: string | null) => void;
    /** Ring a transient set of node ids on the canvas (sidebar row hover). */
    setHoverHighlight: (ids: string[]) => void;
    setRenamingId: (id: string | null, source?: "canvas" | "folder") => void;
    setZoomToNode: (nodeId: string | null) => void;
    setZoomToNodeIds: (ids: string[] | null) => void;
    setMousePosition: (pos: { x: number; y: number } | null) => void;
    setPastePosition: (pos: { x: number; y: number } | null) => void;
    setPendingCreatePosition: (pos: { x: number; y: number } | null) => void;
    setFocusedNodeId: (id: string | null) => void;
  }
>;

export const createSelectionSlice: SelectionSliceCreator = (set, get) => ({
  selectedNodeIds: [],
  leafSelections: {},
  activeLeafId: null,
  hoverHighlightIds: [],
  renamingId: null,
  renameSource: null,
  zoomToNode: null,
  zoomToNodeIds: null,
  mousePosition: null,
  pastePosition: null,
  pendingCreatePosition: null,
  focusedNodeId: null,

  // Keep the per-node `selected` mirror in sync with the canonical id list.
  // React Flow-driven selection changes (which #setSelectedNodeIds) don't flow
  // back into the store through onNodesChange, so a stale `selected: true`
  // flag used to resurrect the selection on the next node rebuild (cut, copy,
  // paste, delete edge, hide, …). Mirroring the flags here means the store is
  // always self-consistent regardless of which rebuild path runs.
  setSelectedNodeIds: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const changed = s.nodes.some((n) => idSet.has(n.id) !== !!n.selected);
      // Mirror into active leaf's selection so per-view sync picks it up
      const patch: Record<string, unknown> = { selectedNodeIds: ids };
      if (s.activeLeafId) {
        patch.leafSelections = { ...s.leafSelections, [s.activeLeafId]: ids };
      }
      return changed
        ? { ...patch, nodes: s.nodes.map((n) => (idSet.has(n.id) ? { ...n, selected: true } : { ...n, selected: false })), graphVersion: s.graphVersion + 1 }
        : { ...patch, graphVersion: s.graphVersion + 1 };
    }),
  setHoverHighlight: (ids) => set({ hoverHighlightIds: ids }),

  setSelectionForLeaf: (leafId, ids) => set((s) => ({
    leafSelections: { ...s.leafSelections, [leafId]: ids },
    activeLeafId: leafId,
    selectedNodeIds: ids,
    graphVersion: s.graphVersion + 1,
  })),

  setActiveLeaf: (leafId) => set((s) => {
    if (!leafId || leafId === s.activeLeafId) return {};
    const ids = s.leafSelections[leafId] ?? [];
    return { activeLeafId: leafId, selectedNodeIds: ids };
  }),

  setRenamingId: (id, source) => {
    if (id) {
      const { hiddenIds, edges } = get();
      if (hiddenIds.includes(id)) {
        const parentEdge = edges.find((e) => e.target === id);
        if (parentEdge) { set({ renamingId: id, renameSource: source ?? "canvas", zoomToNode: { nodeId: parentEdge.source, timestamp: Date.now() } }); return; }
      }
    }
    set({ renamingId: id, renameSource: id ? (source ?? "canvas") : null, zoomToNode: id ? { nodeId: id, timestamp: Date.now() } : null });
  },

  setZoomToNode: (nodeId) => set({ zoomToNode: nodeId ? { nodeId, timestamp: Date.now() } : null }),
  setZoomToNodeIds: (ids) => set({ zoomToNodeIds: ids }),
  setMousePosition: (pos) => set({ mousePosition: pos }),
  setPastePosition: (pos) => set({ pastePosition: pos }),
  setPendingCreatePosition: (pos) => set({ pendingCreatePosition: pos }),
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),
});
