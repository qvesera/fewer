"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { FewerNode } from "@/lib/fewer/types";

/** Persists the user's manual folder-card height across collapse/expand cycles. */
const savedFolderHeights = new Map<string, number>();

/** Compute the node-array patch for a collapse/expand toggle. */
function folderHeightChange(nodeId: string, isExpanding: boolean) {
  return (n: FewerNode): FewerNode => {
    if (n.id !== nodeId) return n;
    if (isExpanding) {
      const saved = savedFolderHeights.get(nodeId);
      savedFolderHeights.delete(nodeId);
      // Restore the saved height (user's resize) or undefined (revert to nodeHeight).
      return {
        ...n,
        style: { ...n.style, height: saved },
        measured: n.measured ? { ...n.measured, height: saved } : n.measured,
      };
    }
    // Collapsing: clear pinned height so the RF wrapper shrinks to the pill.
    return {
      ...n,
      style: { ...n.style, height: undefined },
      measured: n.measured ? { ...n.measured, height: undefined } : n.measured,
    };
  };
}

export type CollapseSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    /** Toggle a folder's per-leaf collapse (descendants pruned from this leaf's canvas; view-only, not undoable). */
    toggleCollapseForLeaf: (leafId: string, nodeId: string) => void;
  }
>;

export const createCollapseSlice: CollapseSliceCreator = (set, get) => ({
  toggleCollapseForLeaf: (leafId, nodeId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const current = leaf.collapsedFolderIds ?? [];
    const isExpanding = current.includes(nodeId);
    const next = isExpanding
      ? current.filter((id) => id !== nodeId)
      : [...current, nodeId];

    // Save the user's manual height before collapse so it can be restored on
    // expand. Without this, the dimension-change handler would pin style.height
    // to the compact pill's measured height, and expanding would lose the
    // user's resize.
    if (!isExpanding) {
      const node = s.nodes.find((n) => n.id === nodeId);
      const h = node?.style?.height as number | undefined;
      if (h) savedFolderHeights.set(nodeId, h);
    }

    set((st) => ({
      viewSettings: { ...st.viewSettings, [leafId]: { ...leaf, collapsedFolderIds: next } },
      nodes: st.nodes.map(folderHeightChange(nodeId, isExpanding)),
      graphVersion: st.graphVersion + 1,
    }));
    get().relayout();
    get()._persistLayout();
  },
});
