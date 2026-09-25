"use client";
// Core bodies moved verbatim: setGraph, relayout, organize, applySearch,
// applyFolderRefresh. DEFAULT_AUTO_HIDE_THRESHOLD moves too.
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { layoutGraphSync } from "@/lib/fewer/layout";
import { getDescendants } from "@/lib/fewer/validation";
import { fsHandleStore, edgeDashPattern, edgeTypeFromStyle } from "@/lib/fewer/types";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { needsLayoutDerivation } from "@/lib/fewer/viewState";
import { can } from "@/lib/fewer/tiers";
import { sortEdges, computeLargeFolderHiddenIds, computeDisplayDepthHiddenIds, computeImportedHideSets } from "@/lib/fewer/importMerge";
import { categoryHiddenNodeIds } from "@/lib/fewer/categorize";
import { captureViewState } from "../historySlice";
import { applySearchHighlight } from "../searchHighlight";

const DEFAULT_AUTO_HIDE_THRESHOLD = 10;

export type CoreSliceCreator = StateCreator<GraphState, [], [], {
  setGraph: GraphState["setGraph"];
  setDataSource: GraphState["setDataSource"];
  setLocalRootPath: GraphState["setLocalRootPath"];
  triggerHiddenPanelExpand: GraphState["triggerHiddenPanelExpand"];
  triggerSavedGraphsExpand: GraphState["triggerSavedGraphsExpand"];
  relayout: GraphState["relayout"];
  /** Relayout only when `autoRelayout` is on. The single gate for the implicit
   *  re-flows that hide/show and folder-collapse actions used to run. */
  relayoutIfAuto: GraphState["relayoutIfAuto"];
  organize: GraphState["organize"];
  organizeAll: GraphState["organizeAll"];
  applySearch: GraphState["applySearch"];
  applyFolderRefresh: GraphState["applyFolderRefresh"];
}>;

export const createCoreSlice: CoreSliceCreator = (set, get) => ({
  nodes: [],
  edges: [],
  dataSource: null,
  localRootPath: null,
  graphVersion: 0,
  hiddenPanelExpandTrigger: 0,
  savedGraphsExpandTrigger: 0,
  setDataSource: (v) => set({ dataSource: v }),
  setLocalRootPath: (v) => set({ localRootPath: v }),
  triggerHiddenPanelExpand: () => {
    set((s) => ({ hiddenPanelExpandTrigger: s.hiddenPanelExpandTrigger + 1 }));
  },
  triggerSavedGraphsExpand: () => {
    set((s) => ({ savedGraphsExpandTrigger: s.savedGraphsExpandTrigger + 1 }));
  },
  setGraph: (nodes, edges, pushHistory = true, hiddenFileIds, options) => {
    const state = get();
    if (pushHistory && state.nodes.length > 0) {
      get().pushOp({ type: "bulk-import", nodes: state.nodes, edges: state.edges });
    }
    const styledNodes = nodes.map((n) => ({
      ...n,
      style: { ...n.style, width: state.nodeWidth, height: n.data.type === "folder" ? state.nodeHeight : undefined, minHeight: undefined },
    }));
    const edgeType = edgeTypeFromStyle(state.edgeStyle);
    const animated = can("edgeMotion", state.tier) && state.edgeAnimated && !state.edgeAnimatedSelectedOnly;
    const strokeDasharray = animated ? edgeDashPattern(state.edgeAnimatedStrokeStyle) : edgeDashPattern(state.edgeStrokeStyle);
    const styledEdges = edges.map((e) => ({
      ...e,
      type: edgeType,
      animated,
      style: { ...e.style, strokeWidth: state.edgeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
    }));
    const { idsToHide, autoHideIds, catHiddenIds, autoHideCount } = computeImportedHideSets(
      nodes,
      edges,
      hiddenFileIds,
      state.showFiles,
      state.autoHideThreshold,
      state.maxDisplayDepth,
      state.categoryFilter,
    );
    const excludeFromLayoutFinal = idsToHide.length > 0 ? new Set(idsToHide) : undefined;
    const laidFinal = options?.preservePositions
      ? applySearchHighlight(styledNodes, state.searchQuery, state.categoryFilter)
      : applySearchHighlight(layoutGraphSync(styledNodes, edges, state.direction, { excludeFromLayout: excludeFromLayoutFinal, shynessScale: state.shynessScale, sortKey: state.sortKey, sortDir: state.sortDir, tagLabelById: makeTagLabelLookup(state.tags) }), state.searchQuery, state.categoryFilter);
    const sortedEdges = sortEdges(styledEdges, laidFinal);
    const baseHidden = new Set(hiddenFileIds ?? []);
    const seedAutoHidden = autoHideIds.filter((id) => !baseHidden.has(id));
    set({ nodes: laidFinal, edges: sortedEdges, hiddenIds: idsToHide, categoryHiddenIds: catHiddenIds, graphVersion: state.graphVersion + 1, autoHideCount, revealedRootIds: [], autoHiddenIds: seedAutoHidden });
  },
  relayout: () => {
    const { nodes, edges, direction, searchQuery, categoryFilter, hiddenIds, graphVersion, shynessScale, sortKey, sortDir } = get();
    if (nodes.length === 0) return;
    const excludeFromLayout = (hiddenIds as string[]).length > 0 ? new Set(hiddenIds as string[]) : undefined;
    const laid = layoutGraphSync(nodes, edges, direction, { excludeFromLayout, shynessScale, sortKey, sortDir, tagLabelById: makeTagLabelLookup(get().tags) });
    const searched = applySearchHighlight(laid, searchQuery, categoryFilter);
    set({ nodes: searched, graphVersion: graphVersion + 1 });
  },
  relayoutIfAuto: () => {
    if (!get().autoRelayout) return;
    get().relayout();
  },
  organize: (leafId) => {
    const s = get();
    if (!leafId) {
      s.relayout();
      return;
    }
    const allFileIds = (s.nodes).filter((n) => n.data.type === "file").map((n) => n.id);
    const derivesOwnLayout = needsLayoutDerivation(
      s.viewSettings[leafId],
      { direction: s.direction, hiddenIds: s.hiddenIds as string[] },
      allFileIds,
    );
    s.clearViewPositions(leafId);
    if (!derivesOwnLayout) {
      s.relayout();
    } else {
      set({ graphVersion: get().graphVersion + 1 });
    }
  },
  /** Re-flow everything the user can see. `organize` stays per-view on
   *  purpose (Crown Shyness is documented as clearing the current view's manual
   *  card positions), but the Organize *action* — button, Alt+R, canvas context
   *  menu — is a "re-flow the tree" command. Scoping it to the active leaf left
   *  every other pane pinned to positions spaced for the old tree, so a card
   *  dragged out of a parent in one view never moved in the other. */
  organizeAll: () => {
    const s = get();
    for (const leafId of Object.keys(s.viewSettings)) {
      if (s.viewSettings[leafId]?.positions) s.clearViewPositions(leafId);
    }
    s.relayout();
  },
  applySearch: () => {
    const { nodes, searchQuery, categoryFilter, graphVersion } = get();
    set({ nodes: applySearchHighlight(nodes, searchQuery, categoryFilter), graphVersion: graphVersion + 1 });
  },
  applyFolderRefresh: (nodeId, childNodes, childEdges) => {
    const {
      nodes, edges, searchQuery, categoryFilter, hiddenIds,
      revealedRootIds, autoHideThreshold, maxDisplayDepth,
      direction, shynessScale, edgeStyle, nodeWidth, nodeHeight, sortKey, sortDir, graphVersion, showFiles,
    } = get();
    const folderNode = nodes.find((n) => n.id === nodeId);
    if (!folderNode || folderNode.data.type !== "folder") return { added: 0, removed: 0 };
    const oldIds = new Set(getDescendants(nodeId, edges));
    const oldNodes = nodes.filter((n) => oldIds.has(n.id));
    const oldEdges = edges.filter((e) => oldIds.has(e.source) && oldIds.has(e.target));
    const subtreeEdges = childEdges.map((e) => ({ ...e, type: edgeTypeFromStyle(edgeStyle) }));
    const laid = layoutGraphSync([folderNode, ...childNodes], subtreeEdges, direction, { shynessScale, sortKey, sortDir, tagLabelById: makeTagLabelLookup(get().tags) });
    const dx = (folderNode.position.x ?? 0) - (laid[0]?.position?.x ?? 0);
    const dy = (folderNode.position.y ?? 0) - (laid[0]?.position?.y ?? 0);
    const newChildNodes = laid.slice(1).map((n) => ({
      ...n,
      position: { x: (n.position.x ?? 0) + dx, y: (n.position.y ?? 0) + dy },
      style: { width: nodeWidth, height: n.data.type === "folder" ? nodeHeight : undefined, minHeight: undefined },
    }));
    for (const id of oldIds) fsHandleStore.delete(id);
    const finalNodes = [...nodes.filter((n) => n.id !== nodeId && !oldIds.has(n.id)), folderNode, ...newChildNodes];
    const finalEdges = [...edges.filter((e) => !oldIds.has(e.source) && !oldIds.has(e.target)), ...subtreeEdges];
    const autoHideIds = computeLargeFolderHiddenIds(finalNodes, finalEdges, autoHideThreshold, new Set(revealedRootIds as string[]));
    const depthIds = computeDisplayDepthHiddenIds(finalNodes, maxDisplayDepth);
    const catHiddenIds = categoryHiddenNodeIds(finalNodes, categoryFilter);
    let idsToHide: string[] = [...(hiddenIds as string[]).filter((h) => !oldIds.has(h))];
    if (!showFiles) idsToHide = [...new Set([...idsToHide, ...finalNodes.filter((n) => n.data.type === "file").map((n) => n.id)])];
    idsToHide = [...new Set([...idsToHide, ...autoHideIds, ...depthIds, ...catHiddenIds])];
    const before = captureViewState(get());
    set({
      nodes: applySearchHighlight(finalNodes, searchQuery, categoryFilter),
      edges: sortEdges(finalEdges, finalNodes),
      hiddenIds: idsToHide,
      categoryHiddenIds: catHiddenIds,
      autoHiddenIds: autoHideIds,
      graphVersion: graphVersion + 1,
    });
    const after = captureViewState(get());
    get().pushOp({
      type: "refresh-subtree",
      nodeId,
      oldNodes,
      oldEdges,
      newNodes: newChildNodes,
      newEdges: subtreeEdges,
      before,
      after,
    });
    return { added: newChildNodes.length, removed: oldNodes.length };
  },
});
