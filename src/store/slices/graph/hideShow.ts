"use client";
// Hide/show bodies moved verbatim from graphSlice.ts. commitShow helper moves
// too so showSubtree/showSubtrees keep identical undo + hidden-set behavior.
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { getDescendants, parentMapOf, ancestorChainOf } from "@/lib/fewer/validation";
import { computeLargeFolderHiddenIds, computeDisplayDepthHiddenIds } from "@/lib/fewer/importMerge";
import { layoutGraphSync } from "@/lib/fewer/layout";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { captureViewState, viewStateOp } from "../historySlice";
import { applySearchHighlight } from "../searchHighlight";
import { collectShowSubtrees, walkSubtreeReveal, reconcileAutoHide } from "./reveal";

function commitShow(
  set: (p: any) => void,
  get: () => GraphState,
  toShow: Set<string>,
  clearIndie: boolean,
): void {
  const shown = (ids: string[]) => ids.filter((h) => !toShow.has(h));
  const before = captureViewState(get());
  const after = clearIndie
    ? { ...before, hiddenIds: shown(before.hiddenIds), independentlyHiddenIds: shown(before.independentlyHiddenIds) }
    : { ...before, hiddenIds: shown(before.hiddenIds) };
  get().pushOp(viewStateOp(before, after));
  set({
    hiddenIds: shown(get().hiddenIds),
    ...(clearIndie ? { independentlyHiddenIds: shown(get().independentlyHiddenIds) } : {}),
    autoHiddenIds: shown(get().autoHiddenIds),
    graphVersion: get().graphVersion + 1,
  });
  get().relayoutIfAuto();
}

export type HideShowSliceCreator = StateCreator<GraphState, [], [], {
  hideNode: GraphState["hideNode"];
  hideNodes: GraphState["hideNodes"];
  showNode: GraphState["showNode"];
  showAncestors: GraphState["showAncestors"];
  showSubtree: GraphState["showSubtree"];
  showSubtrees: GraphState["showSubtrees"];
  showAll: GraphState["showAll"];
  revealSubtree: GraphState["revealSubtree"];
  setMaxDisplayDepth: GraphState["setMaxDisplayDepth"];
  autoHideLargeFolders: GraphState["autoHideLargeFolders"];
  setAutoHideThreshold: GraphState["setAutoHideThreshold"];
}>;

export const createHideShowSlice: HideShowSliceCreator = (set, get) => ({
  maxDisplayDepth: 6,
  autoHideCount: 0,
  revealedRootIds: [],
  autoHiddenIds: [],
  revealedFromHidden: [],
  autoHideThreshold: 10,
  hideNode: (id) => {
    const { hiddenIds, edges, selectedNodeIds, revealedRootIds, autoHiddenIds } = get();
    if (hiddenIds.includes(id)) return;
    const toHide = new Set([id, ...getDescendants(id, edges)]);
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: [...before.hiddenIds, ...toHide] };
    get().pushOp(viewStateOp(before, after));
    set({
      hiddenIds: [...hiddenIds, ...toHide],
      autoHiddenIds: autoHiddenIds.filter((h) => !toHide.has(h)),
      selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)),
      revealedRootIds: revealedRootIds.filter((r) => !toHide.has(r)),
      graphVersion: get().graphVersion + 1,
    });
  },
  hideNodes: (ids) => {
    const { hiddenIds, edges, selectedNodeIds, revealedRootIds, autoHiddenIds } = get();
    const toHide = new Set([...ids, ...ids.flatMap((id) => getDescendants(id, edges))]);
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: [...before.hiddenIds, ...toHide] };
    get().pushOp(viewStateOp(before, after));
    set({
      hiddenIds: [...hiddenIds, ...toHide],
      autoHiddenIds: autoHiddenIds.filter((h) => !toHide.has(h)),
      selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)),
      revealedRootIds: revealedRootIds.filter((r) => !toHide.has(r)),
      graphVersion: get().graphVersion + 1,
    });
  },
  showNode: (id) => {
    const before = captureViewState(get());
    if (!before.hiddenIds.includes(id)) return;
    const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => h !== id) };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: s.hiddenIds.filter((h) => h !== id), autoHiddenIds: s.autoHiddenIds.filter((h) => h !== id), graphVersion: s.graphVersion + 1 }));
    get().relayoutIfAuto();
  },
  showAncestors: (id) => {
    const { hiddenIds, edges, revealedFromHidden, autoHiddenIds, independentlyHiddenIds } = get();
    if (!hiddenIds.includes(id)) return;
    const hiddenSet = new Set(hiddenIds);
    const revealedSet = new Set(revealedFromHidden);
    const parentMap = parentMapOf(edges);
    const toShow = new Set<string>([id]);
    for (const ancestorId of ancestorChainOf(id, parentMap)) {
      if (!hiddenSet.has(ancestorId)) break;
      toShow.add(ancestorId);
    }
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toShow.has(h)), independentlyHiddenIds: before.independentlyHiddenIds.filter((h) => !toShow.has(h)) };
    get().pushOp(viewStateOp(before, after));
    set({ hiddenIds: hiddenIds.filter((h) => !toShow.has(h)), independentlyHiddenIds: independentlyHiddenIds.filter((h) => !toShow.has(h)), autoHiddenIds: autoHiddenIds.filter((h) => !toShow.has(h)), revealedFromHidden: [...new Set([...revealedFromHidden, ...toShow])], graphVersion: get().graphVersion + 1 });
    get().relayoutIfAuto();
  },
  showSubtree: (id) => {
    const { hiddenIds, edges, independentlyHiddenIds } = get();
    const toShow = walkSubtreeReveal(edges, new Set(hiddenIds), new Set(independentlyHiddenIds), [id]);
    commitShow(set, get, toShow, false);
  },
  showSubtrees: (ids) => {
    const { hiddenIds, edges, independentlyHiddenIds } = get();
    const toShow = collectShowSubtrees(edges, hiddenIds, independentlyHiddenIds, ids);
    if (toShow.size === 0) return;
    commitShow(set, get, toShow, true);
  },
  showAll: () => {
    const before = captureViewState(get());
    if (before.hiddenIds.length === 0) return;
    const after = { ...before, hiddenIds: [] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [], autoHiddenIds: [], revealedRootIds: [], graphVersion: s.graphVersion + 1 }));
    get().relayoutIfAuto();
  },
  revealSubtree: (id) => {
    const { revealedRootIds } = get();
    get().showAncestors(id);
    get().showSubtree(id);
    set({ revealedRootIds: [...new Set([...revealedRootIds, id])] });
    get().autoHideLargeFolders();
    get().relayoutIfAuto();
  },
  setMaxDisplayDepth: (maxDepth) => {
    const { nodes, hiddenIds, direction, edges, searchQuery, graphVersion, maxDisplayDepth: oldMaxDepth, revealedFromHidden } = get();
    const before = captureViewState(get());
    const depthHidden = new Set(computeDisplayDepthHiddenIds(nodes, maxDepth));
    const oldDepthHidden = new Set(computeDisplayDepthHiddenIds(nodes, oldMaxDepth));
    const hiddenSet = new Set(hiddenIds);
    const revealedSet = new Set(revealedFromHidden);
    const parentMap = parentMapOf(edges);
    const kept = hiddenIds.filter((id) => {
      if (depthHidden.has(id)) return false;
      const depth = nodes.find((n) => n.id === id)?.data.depth ?? 0;
      if (maxDepth > 0 && depth > maxDepth) return false;
      if (oldDepthHidden.has(id)) {
        const blocked = ancestorChainOf(id, parentMap).some(
          (ancestorId) => revealedSet.has(ancestorId) || (hiddenSet.has(ancestorId) && !oldDepthHidden.has(ancestorId)),
        );
        if (blocked) return true;
        return false;
      }
      return true;
    });
    const largeHidden = computeLargeFolderHiddenIds(nodes, edges, get().autoHideThreshold, new Set(get().revealedRootIds));
    const mergedIds = [...new Set([...depthHidden, ...kept, ...largeHidden])];
    const excludeFromLayout = mergedIds.length > 0 ? new Set(mergedIds) : undefined;
    const laid = layoutGraphSync(nodes, edges, direction, { excludeFromLayout, shynessScale: get().shynessScale, sortKey: get().sortKey, sortDir: get().sortDir, tagLabelById: makeTagLabelLookup(get().tags) })
    const searched = applySearchHighlight(laid, searchQuery, get().categoryFilter);
    const after = { ...before, maxDisplayDepth: maxDepth, hiddenIds: mergedIds };
    get().pushOp(viewStateOp(before, after));
    const { autoHiddenIds: nextAutoHidden } = reconcileAutoHide(
      nodes,
      edges,
      mergedIds,
      get().autoHiddenIds,
      get().revealedRootIds,
      get().autoHideThreshold,
    );
    set({
      maxDisplayDepth: maxDepth,
      hiddenIds: mergedIds,
      autoHiddenIds: nextAutoHidden,
      nodes: searched,
      graphVersion: graphVersion + 1,
    });
  },
  autoHideLargeFolders: (threshold?) => {
    const { nodes, edges, hiddenIds, revealedRootIds, autoHiddenIds, autoHideThreshold, showFiles } = get();
    const thresholdValue = threshold ?? autoHideThreshold;
    const { hiddenIds: reconciled, autoHiddenIds: nextAuto } = reconcileAutoHide(
      nodes,
      edges,
      hiddenIds,
      autoHiddenIds,
      revealedRootIds,
      thresholdValue,
    );
    const fileIds = !showFiles ? nodes.filter((n) => n.data.type === "file").map((n) => n.id) : null;
    const nextHidden: string[] = fileIds
      ? [...new Set<string>([...reconciled, ...fileIds])]
      : reconciled;
    const fileIdSet = fileIds ? new Set(fileIds) : null;
    const nextAutoFiltered = fileIdSet ? nextAuto.filter((id) => !fileIdSet.has(id)) : nextAuto;
    if (nextHidden.length !== hiddenIds.length || nextAutoFiltered.length !== autoHiddenIds.length) {
      set({ hiddenIds: nextHidden, autoHiddenIds: nextAutoFiltered, graphVersion: get().graphVersion + 1 });
    }
  },
  setAutoHideThreshold: (threshold) => {
    const { nodes, edges, hiddenIds, revealedRootIds, autoHiddenIds, showFiles } = get();
    const before = captureViewState(get());
    const { hiddenIds: reconciled, autoHiddenIds: nextAuto } = reconcileAutoHide(
      nodes,
      edges,
      hiddenIds,
      autoHiddenIds,
      revealedRootIds,
      threshold,
    );
    const fileIds = !showFiles ? nodes.filter((n) => n.data.type === "file").map((n) => n.id) : null;
    const nextHidden: string[] = fileIds
      ? [...new Set<string>([...reconciled, ...fileIds])]
      : reconciled;
    const fileIdSet = fileIds ? new Set(fileIds) : null;
    const nextAutoFiltered = fileIdSet ? nextAuto.filter((id) => !fileIdSet.has(id)) : nextAuto;
    const after = { ...before, autoHideThreshold: threshold, hiddenIds: nextHidden, autoHiddenIds: nextAutoFiltered };
    set({ autoHideThreshold: threshold, hiddenIds: nextHidden, autoHiddenIds: nextAutoFiltered, graphVersion: get().graphVersion + 1 });
    get().pushOp(viewStateOp(before, after));
  },
});

