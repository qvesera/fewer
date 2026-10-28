"use client";
// Hide/show bodies moved verbatim from graphSlice.ts. commitShow helper moves
// too so showSubtree/showSubtrees keep identical undo + hidden-set behavior.
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { getDescendants, parentMapOf, ancestorChainOf } from "@/lib/fewer/validation";
import { computeLargeFolderHiddenIds, computeDisplayDepthHiddenIds, orderFromStore } from "@/lib/fewer/importMerge";
import { layoutGraphSync } from "@/lib/fewer/layout";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { captureViewState, viewStateOp } from "../historySlice";
import { applySearchHighlight } from "../searchHighlight";
import { collectShowSubtrees, walkSubtreeReveal, reconcileAutoHide } from "./reveal";
import { openedCollapsedGroupsForLeaf, withGroupReveal, type GroupRevealPatch } from "./revealGroups";

/** Order-insensitive id-set equality — hide lists are Sets with array storage. */
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

function commitShow(
  set: (p: any) => void,
  get: () => GraphState,
  toShow: Set<string>,
  clearIndie: boolean,
  /** The groups this gesture opened (T-167), and what it parked (T-169) —
   *  merged into the same write. */
  opened: GroupRevealPatch | null = null,
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
    ...(opened ? { viewSettings: withGroupReveal(get().viewSettings, opened) } : {}),
    autoHiddenIds: shown(get().autoHiddenIds),
    // Register the exemption: the auto-hide reconciler re-hides every
    // non-exempt child of an over-threshold folder, so a reveal that does NOT
    // register here is undone by the next reconcile.
    revealedRootIds: [...new Set([...get().revealedRootIds, ...toShow])],
    graphVersion: get().graphVersion + 1,
  });
  if (opened) get()._persistLayout();
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

/**
 * Action bodies at module scope, one function per action — see the note in
 * folderSlice.ts. A factory wrapper would only rename the finding; top-level
 * functions each carry their own CCN. Behavior unchanged.
 */
type HideSet = Parameters<HideShowSliceCreator>[0];
type HideGet = () => GraphState;

function hideNode(set: HideSet, get: HideGet, id: string): void {
  const { hiddenIds, edges, selectedNodeIds, revealedRootIds, revealedFromHidden, autoHiddenIds } = get();
  if (hiddenIds.includes(id)) return;
  const toHide = new Set([id, ...getDescendants(id, edges)]);
  const before = captureViewState(get());
  const after = { ...before, hiddenIds: [...before.hiddenIds, ...toHide] };
  get().pushOp(viewStateOp(before, after));
  set({
    hiddenIds: [...hiddenIds, ...toHide],
    autoHiddenIds: autoHiddenIds.filter((h) => !toHide.has(h)),
    selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)),
    // Hidden again ⇒ no longer exempt from the auto-hide pass, and no longer
    // "already revealed" for the depth slider.
    revealedRootIds: revealedRootIds.filter((r) => !toHide.has(r)),
    revealedFromHidden: revealedFromHidden.filter((r) => !toHide.has(r)),
    graphVersion: get().graphVersion + 1,
  });
}

function showNode(set: HideSet, get: HideGet, id: string): void {
  const before = captureViewState(get());
  // A card can be hidden by THIS view's collapsed group instead of a hide
  // set (T-164), and then revealing it means opening that group (T-167).
  const opened = openedCollapsedGroupsForLeaf(get(), [id]);
  if (!before.hiddenIds.includes(id)) {
    if (opened) {
      set({
        viewSettings: withGroupReveal(get().viewSettings, opened),
        graphVersion: get().graphVersion + 1,
      });
      get()._persistLayout();
      get().relayoutIfAuto();
    }
    return;
  }
  const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => h !== id) };
  get().pushOp(viewStateOp(before, after));
  set((s) => ({
    hiddenIds: s.hiddenIds.filter((h) => h !== id),
    autoHiddenIds: s.autoHiddenIds.filter((h) => h !== id),
    // Exempt the card: without this the next auto-hide reconcile re-hides it
    // as a child of an over-threshold folder — the canvas double-click reveal
    // that a sidebar reveal used to undo.
    revealedRootIds: [...new Set([...s.revealedRootIds, id])],
    ...(opened ? { viewSettings: withGroupReveal(s.viewSettings, opened) } : {}),
    graphVersion: s.graphVersion + 1,
  }));
  if (opened) get()._persistLayout();
  get().relayoutIfAuto();
}

function showAncestors(set: HideSet, get: HideGet, id: string): void {
  const { hiddenIds, edges, revealedFromHidden, autoHiddenIds, independentlyHiddenIds } = get();
  const opened = openedCollapsedGroupsForLeaf(get(), [id]);
  if (!hiddenIds.includes(id)) {
    if (opened) {
      set({
        viewSettings: withGroupReveal(get().viewSettings, opened),
        graphVersion: get().graphVersion + 1,
      });
      get()._persistLayout();
      get().relayoutIfAuto();
    }
    return;
  }
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
  set({ hiddenIds: hiddenIds.filter((h) => !toShow.has(h)), independentlyHiddenIds: independentlyHiddenIds.filter((h) => !toShow.has(h)), autoHiddenIds: autoHiddenIds.filter((h) => !toShow.has(h)), revealedFromHidden: [...new Set([...revealedFromHidden, ...toShow])], revealedRootIds: [...new Set([...get().revealedRootIds, ...toShow])], ...(opened ? { viewSettings: withGroupReveal(get().viewSettings, opened) } : {}), graphVersion: get().graphVersion + 1 });
  if (opened) get()._persistLayout();
  get().relayoutIfAuto();
}

function showSubtrees(set: HideSet, get: HideGet, ids: string[]): void {
  const { hiddenIds, edges, independentlyHiddenIds, nodes, revealedRootIds, autoHideThreshold } = get();
  const stop = new Set(
    computeLargeFolderHiddenIds(
      nodes,
      edges,
      autoHideThreshold,
      new Set([...revealedRootIds, ...ids]),
      orderFromStore(get()),
    ),
  );
  const toShow = collectShowSubtrees(edges, hiddenIds, independentlyHiddenIds, ids, stop);
  // The folder ids themselves are targets too: a member folder collapsed
  // away appears in no hide set, and "Show Children" must open its group
  // instead of silently no-opping (T-167).
  const opened = openedCollapsedGroupsForLeaf(get(), ids);
  if (toShow.size === 0) {
    if (opened) {
      set({
        viewSettings: withGroupReveal(get().viewSettings, opened),
        graphVersion: get().graphVersion + 1,
      });
      get()._persistLayout();
    }
    return;
  }
  commitShow(set, get, toShow, true, opened);
}

function showAll(set: HideSet, get: HideGet): void {
  // NOTE: the shipped showAll is visibilitySlice's (it also clears the
  // category filters and the per-view collapsed groups, T-167); this one is
  // the graph-slice fallback kept for its narrower contract.
  const before = captureViewState(get());
  if (before.hiddenIds.length === 0) return;
  const after = { ...before, hiddenIds: [] };
  get().pushOp(viewStateOp(before, after));
  set((s) => ({ hiddenIds: [], autoHiddenIds: [], revealedRootIds: [], graphVersion: s.graphVersion + 1 }));
  get().relayoutIfAuto();
}

function setMaxDisplayDepth(set: HideSet, get: HideGet, maxDepth: number): void {
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
  const largeHidden = computeLargeFolderHiddenIds(nodes, edges, get().autoHideThreshold, new Set(get().revealedRootIds), orderFromStore(get()));
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
    orderFromStore(get()),
  );
  set({
    maxDisplayDepth: maxDepth,
    hiddenIds: mergedIds,
    autoHiddenIds: nextAutoHidden,
    nodes: searched,
    graphVersion: graphVersion + 1,
  });
}

function autoHideLargeFolders(set: HideSet, get: HideGet, threshold?: number): void {
  const { nodes, edges, hiddenIds, revealedRootIds, autoHiddenIds, autoHideThreshold, showFiles } = get();
  const thresholdValue = threshold ?? autoHideThreshold;
  const { hiddenIds: reconciled, autoHiddenIds: nextAuto } = reconcileAutoHide(
    nodes,
    edges,
    hiddenIds,
    autoHiddenIds,
    revealedRootIds,
    thresholdValue,
    orderFromStore(get()),
  );
  const fileIds = !showFiles ? nodes.filter((n) => n.data.type === "file").map((n) => n.id) : null;
  const nextHidden: string[] = fileIds
    ? [...new Set<string>([...reconciled, ...fileIds])]
    : reconciled;
  const fileIdSet = fileIds ? new Set(fileIds) : null;
  const nextAutoFiltered = fileIdSet ? nextAuto.filter((id) => !fileIdSet.has(id)) : nextAuto;
  // Compare the SETS, not the lengths: a sort change re-caps at the same
  // count, and a length-equal swap would otherwise skip the write and leave
  // the canvas showing the previous sort's selection.
  if (!sameIds(nextHidden, hiddenIds) || !sameIds(nextAutoFiltered, autoHiddenIds)) {
    set({ hiddenIds: nextHidden, autoHiddenIds: nextAutoFiltered, graphVersion: get().graphVersion + 1 });
  }
}

function setAutoHideThreshold(set: HideSet, get: HideGet, threshold: number): void {
  const { nodes, edges, hiddenIds, revealedRootIds, autoHiddenIds, showFiles } = get();
  const before = captureViewState(get());
  const { hiddenIds: reconciled, autoHiddenIds: nextAuto } = reconcileAutoHide(
    nodes,
    edges,
    hiddenIds,
    autoHiddenIds,
    revealedRootIds,
    threshold,
    orderFromStore(get()),
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
}

export const createHideShowSlice: HideShowSliceCreator = (set, get) => ({
  maxDisplayDepth: 6,
  autoHideCount: 0,
  revealedRootIds: [],
  autoHiddenIds: [],
  revealedFromHidden: [],
  autoHideThreshold: 10,
  hideNode: (id) => hideNode(set, get, id),
  hideNodes: (ids) => {
    const { hiddenIds, edges, selectedNodeIds, revealedRootIds, revealedFromHidden, autoHiddenIds } = get();
    const toHide = new Set([...ids, ...ids.flatMap((id) => getDescendants(id, edges))]);
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: [...before.hiddenIds, ...toHide] };
    get().pushOp(viewStateOp(before, after));
    set({
      hiddenIds: [...hiddenIds, ...toHide],
      autoHiddenIds: autoHiddenIds.filter((h) => !toHide.has(h)),
      selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)),
      revealedRootIds: revealedRootIds.filter((r) => !toHide.has(r)),
      revealedFromHidden: revealedFromHidden.filter((r) => !toHide.has(r)),
      graphVersion: get().graphVersion + 1,
    });
  },
  showNode: (id) => showNode(set, get, id),

  showAncestors: (id) => showAncestors(set, get, id),
  showSubtree: (id) => {
    const { hiddenIds, edges, independentlyHiddenIds, nodes, revealedRootIds, autoHideThreshold } = get();
    // Cap the reveal: the folder's beyond-limit children stay hidden (the user
    // reveals those one by one), the folder's first N come up.
    const stop = new Set(
      computeLargeFolderHiddenIds(nodes, edges, autoHideThreshold, new Set([...revealedRootIds, id]), orderFromStore(get())),
    );
    const toShow = walkSubtreeReveal(edges, new Set(hiddenIds), new Set(independentlyHiddenIds), [id], stop);
    commitShow(set, get, toShow, false, openedCollapsedGroupsForLeaf(get(), [id]));
  },
  showSubtrees: (ids) => showSubtrees(set, get, ids),
  showAll: () => showAll(set, get),
  revealSubtree: (id) => {
    // The reveal gesture, as one write. No auto-hide reconcile: that pass
    // re-hides every non-exempt child of an over-threshold folder, so running
    // it here undid reveals made on the canvas while keeping this path's own
    // history — and it was the whole cost of a sidebar click. Auto-hide still
    // runs where it belongs: import, threshold change, folder refresh.
    get().revealInView(null, id, { subtree: true });
  },
  setMaxDisplayDepth: (maxDepth) => setMaxDisplayDepth(set, get, maxDepth),
  autoHideLargeFolders: (threshold?) => autoHideLargeFolders(set, get, threshold),
  setAutoHideThreshold: (threshold) => setAutoHideThreshold(set, get, threshold),
});

