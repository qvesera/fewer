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
    /** Toggle a group's per-leaf collapse (T-164): its members hide in this
     *  view only — the hidden-ness derives from this list, so nothing is
     *  written into hiddenIds. View-only and not undoable, the same contract
     *  folder collapse has. */
    toggleGroupCollapsedForLeaf: (leafId: string, groupId: string) => void;
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
export const createCollapseSlice: CollapseSliceCreator = (set, get) => ({
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

  toggleGroupCollapsedForLeaf: (leafId, groupId) => {
    set((st) => {
      const leaf = st.viewSettings[leafId] ?? {};
      const current = leaf.collapsedGroupIds ?? [];
      const next = current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId];
      return {
        viewSettings: { ...st.viewSettings, [leafId]: { ...leaf, collapsedGroupIds: next } },
        graphVersion: st.graphVersion + 1,
      };
    });
    // Collapse is view state and the layout blob is where every other per-leaf
    // setting lives, so a collapsed group survives a reload.
    get()._persistLayout();
  },
});
