"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { getDescendants } from "@/lib/fewer/validation";
import { captureViewState, viewStateOp } from "../historySlice";
import { collectRevealableFileIds, applyRevealLimits } from "./revealHelpers";
import type { FileCategory } from "@/lib/fewer/types";

export type VisibilitySliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    hiddenIds: string[];

    setHiddenIds: (ids: string[]) => void;
    toggleHidden: (id: string) => void;
    hideSelected: () => void;
    showAll: () => void;
    setShowFiles: (show: boolean) => void;
  }
>;

export const createVisibilitySlice: VisibilitySliceCreator = (set, get) => ({
  hiddenIds: [],
  independentlyHiddenIds: [],

  setHiddenIds: (ids) => set({ hiddenIds: ids }),

  toggleHidden: (id) => {
    const before = captureViewState(get());
    const { hiddenIds, independentlyHiddenIds } = get();
    const hiding = !hiddenIds.includes(id);
    const next = hiding
      ? [...hiddenIds, id]
      : hiddenIds.filter((h) => h !== id);
    // User toggled this node directly — track it as independently hidden
    // so showSubtree won't auto-reveal it when a parent is shown.
    const nextIndie = hiding
      ? [...new Set([...independentlyHiddenIds, id])]
      : independentlyHiddenIds.filter((h) => h !== id);
    const after = { ...before, hiddenIds: next, independentlyHiddenIds: nextIndie };
    if (before.hiddenIds.join(",") !== after.hiddenIds.join(",")
        || before.independentlyHiddenIds.join(",") !== after.independentlyHiddenIds.join(",")) {
      get().pushOp(viewStateOp(before, after));
    }
    set((s) => ({
      hiddenIds: next,
      independentlyHiddenIds: nextIndie,
      autoHiddenIds: hiddenIds.includes(id) ? s.autoHiddenIds.filter((h) => h !== id) : s.autoHiddenIds,
    }));
  },

  hideSelected: () => {
    const { selectedNodeIds, edges, graphVersion } = get();
    if (selectedNodeIds.length === 0) return;
    // ponytail: getDescendants edges-filter scan is fine here (small edge list).
    const toHide = new Set<string>();
    for (const id of selectedNodeIds) {
      toHide.add(id);
      for (const d of getDescendants(id, edges)) toHide.add(d);
    }
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: [...before.hiddenIds, ...toHide] as string[] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [...s.hiddenIds, ...toHide], independentlyHiddenIds: [...new Set([...s.independentlyHiddenIds, ...selectedNodeIds])], autoHiddenIds: s.autoHiddenIds.filter((h) => !toHide.has(h)), selectedNodeIds: [], graphVersion: graphVersion + 1 }));
  },

  showAll: () => {
    const before = captureViewState(get());
    if (before.hiddenIds.length === 0 && before.categoryFilter.length === 0) return;
    const after = { ...before, hiddenIds: [], categoryFilter: [] as FileCategory[], categoryHiddenIds: [] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [], independentlyHiddenIds: [], autoHiddenIds: [], revealedRootIds: [], categoryFilter: [], categoryHiddenIds: [], graphVersion: s.graphVersion + 1 }));
  },

  setShowFiles: (show) => {
    const { nodes, edges, graphVersion, categoryFilter, maxDisplayDepth, autoHideThreshold, revealedRootIds, autoHiddenIds } = get();
    const before = captureViewState(get());
    const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
    if (show) {
      const revealIds = collectRevealableFileIds(nodes, edges, before.hiddenIds, categoryFilter);
      const revealedHidden = before.hiddenIds.filter((id) => id);
      const { hiddenIds: nextHidden, autoHiddenIds: nextAuto } = applyRevealLimits({
        nodes,
        edges,
        revealedHidden,
        autoHiddenIds,
        revealedRootIds,
        autoHideThreshold,
        maxDisplayDepth,
        independentlyHiddenIds: get().independentlyHiddenIds,
        revealIds,
      });
      const after = { ...before, showFiles: true, hiddenIds: nextHidden, autoHiddenIds: nextAuto };
      if (JSON.stringify(after) !== JSON.stringify(before)) get().pushOp(viewStateOp(before, after));
      set(() => ({ showFiles: true, hiddenIds: nextHidden, autoHiddenIds: nextAuto, graphVersion: graphVersion + 1 }));
    } else {
      const after = { ...before, showFiles: false, hiddenIds: [...new Set([...before.hiddenIds, ...fileIds])] };
      if (JSON.stringify(after) !== JSON.stringify(before)) get().pushOp(viewStateOp(before, after));
      set((s) => ({ showFiles: false, hiddenIds: [...new Set([...s.hiddenIds, ...fileIds])], graphVersion: graphVersion + 1 }));
    }
  },
});
