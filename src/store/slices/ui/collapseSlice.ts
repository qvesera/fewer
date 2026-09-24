"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";

export type CollapseSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    /** Toggle a folder's per-leaf collapse (descendants pruned from this leaf's canvas; view-only, not undoable). */
    toggleCollapseForLeaf: (leafId: string, nodeId: string) => void;
  }
>;

/**
 * Toggle a folder's per-leaf collapse. Purely a view setting: the shared node
 * keeps its geometry (so the expanded card every other view paints — and the
 * slot a global relayout reserves — stay untouched), and the collapsing leaf
 * stamps the pill height onto its own copy of the node
 * (`withCollapsedPillGeometry` in viewState). `graphVersion` still bumps
 * because that is what pushes the new node set into each canvas.
 */
export const createCollapseSlice: CollapseSliceCreator = (set) => ({
  toggleCollapseForLeaf: (leafId, nodeId) => {
    set((st) => {
      const leaf = st.viewSettings[leafId] ?? {};
      const current = leaf.collapsedFolderIds ?? [];
      const next = current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : [...current, nodeId];
      return {
        viewSettings: { ...st.viewSettings, [leafId]: { ...leaf, collapsedFolderIds: next } },
        graphVersion: st.graphVersion + 1,
      };
    });
  },
});
