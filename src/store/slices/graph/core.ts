"use client";
// Core bodies moved verbatim: setGraph, relayout, organize, applySearch,
// applyFolderRefresh. DEFAULT_AUTO_HIDE_THRESHOLD moves too.
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { layoutGraphSync } from "@/lib/fewer/layout";
import { getDescendants } from "@/lib/fewer/validation";
import { fsHandleStore, edgeDashPattern, edgeTypeFromStyle } from "@/lib/fewer/types";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { needsLayoutDerivation, pruneViewSettingsForGraph } from "@/lib/fewer/viewState";
import { can } from "@/lib/fewer/tiers";
import { sortEdges, computeLargeFolderHiddenIds, computeDisplayDepthHiddenIds, computeImportedHideSets, orderFromStore } from "@/lib/fewer/importMerge";
import { categoryHiddenNodeIds } from "@/lib/fewer/categorize";
import { captureViewState } from "../historySlice";
import { applySearchHighlight } from "../searchHighlight";

const DEFAULT_AUTO_HIDE_THRESHOLD = 10;

export type CoreSliceCreator = StateCreator<GraphState, [], [], {
  setGraph: GraphState["setGraph"];
  /** T-206: merge one progressive-scan batch (no history entry). */
  appendGraphBatch: (nodes: import("@/lib/fewer/types").FewerNode[], edges: import("@/lib/fewer/types").FewerEdge[]) => { added: number };
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
      orderFromStore(state),
    );
    const excludeFromLayoutFinal = idsToHide.length > 0 ? new Set(idsToHide) : undefined;
    const laidFinal = options?.preservePositions
      ? applySearchHighlight(styledNodes, state.searchQuery, state.categoryFilter)
      : applySearchHighlight(layoutGraphSync(styledNodes, edges, state.direction, { excludeFromLayout: excludeFromLayoutFinal, shynessScale: state.shynessScale, sortKey: state.sortKey, sortDir: state.sortDir, tagLabelById: makeTagLabelLookup(state.tags) }), state.searchQuery, state.categoryFilter);
    const sortedEdges = sortEdges(styledEdges, laidFinal);
    const baseHidden = new Set(hiddenFileIds ?? []);
    const seedAutoHidden = autoHideIds.filter((id) => !baseHidden.has(id));
    // Everything the incoming graph cannot contain is dead: the previous graph's
    // hidden cards (per-view hide layers seeded with the whole global hidden
    // list), its collapsed folders and its dragged positions. Left in place they
    // kept counting in the Hidden Cards badge — with no rows to click, because
    // the panel filters to live nodes — and tripped needsLayoutDerivation into a
    // per-view layout pass for a graph that never asked for one.
    const liveIds = new Set(laidFinal.map((n) => n.id));
    const keepLive = (ids: string[] | undefined) => (ids ?? []).filter((id) => liveIds.has(id));
    set({
      nodes: laidFinal,
      edges: sortedEdges,
      // setGraph REPLACES the whole graph, and every structural builder mints a
      // fresh id space (file-import-…, refresh-…, uuid) — so group membership
      // from the previous graph can never map onto these cards. Left in place,
      // the frames describe ids that no longer exist (T-145: snapshots set their
      // own groups immediately after, via applySnapshot).
      groups: [],
      hiddenIds: idsToHide,
      categoryHiddenIds: catHiddenIds,
      graphVersion: state.graphVersion + 1,
      autoHideCount,
      revealedRootIds: [],
      autoHiddenIds: seedAutoHidden,
      viewSettings: pruneViewSettingsForGraph(state.viewSettings, liveIds),
      independentlyHiddenIds: keepLive(state.independentlyHiddenIds),
      revealedFromHidden: keepLive(state.revealedFromHidden),
    });
    // View settings just changed; persist the pruned map (debounced) so storage
    // cannot resurrect the dead ids on the next load.
    get()._persistLayout();
  },
  /**
   * T-206: append one progressive-scan batch to the loaded graph. Existing
   * paths win (their ids and positions are kept, size/symlink refresh);
   * brand-new paths are placed near their parent until the next relayout.
   * No history entry: background appends are not user operations.
   */
  appendGraphBatch: (incomingNodes, incomingEdges) => {
    const state = get();
    const pathIndex = new Map<string, string>();
    for (const n of state.nodes) {
      if (n.data.path) pathIndex.set(n.data.path, n.id);
    }
    const nextNodes = [...state.nodes];
    const indexOfId = new Map<string, number>(nextNodes.map((n, i) => [n.id, i]));
    const idMap = new Map<string, string>();
    const incomingParent = new Map<string, string>(incomingEdges.map((e) => [e.target, e.source]));
    let added = 0;
    for (const n of incomingNodes) {
      if (!n.data.path) continue;
      const existingId = pathIndex.get(n.data.path);
      if (existingId) {
        idMap.set(n.id, existingId);
        const i = indexOfId.get(existingId);
        if (i !== undefined) {
          const cur = nextNodes[i];
          nextNodes[i] = {
            ...cur,
            data: {
              ...cur.data,
              size: n.data.size ?? cur.data.size,
              symlink: n.data.symlink ?? cur.data.symlink,
            },
          };
        }
        continue;
      }
      pathIndex.set(n.data.path, n.id);
      indexOfId.set(n.id, nextNodes.length);
      // Park new cards near their parent; the debounced relayout settles them.
      const parentId = incomingParent.get(n.id);
      const parent = parentId ? nextNodes[indexOfId.get(parentId) ?? -1] : undefined;
      const siblings = incomingNodes.filter((m) => incomingParent.get(m.id) === parentId);
      const ordinal = Math.max(0, siblings.findIndex((m) => m.id === n.id));
      nextNodes.push({
        ...n,
        position: {
          x: (parent?.position.x ?? 0) + ordinal * 30,
          y: (parent?.position.y ?? 0) + 140,
        },
        style: {
          ...n.style,
          width: state.nodeWidth,
          height: n.data.type === "folder" ? state.nodeHeight : undefined,
          minHeight: undefined,
        },
      });
      added++;
    }
    // T-212: no `added === 0` early return — a batch whose nodes all exist
    // still repairs MISSING EDGES (the scan-end orphan heal appends edge-only
    // batches, and a re-emitted directory re-wires any edge that was lost).
    const liveIds = new Set(nextNodes.map((n) => n.id));
    const edgeType = edgeTypeFromStyle(state.edgeStyle);
    const animated = can("edgeMotion", state.tier) && state.edgeAnimated && !state.edgeAnimatedSelectedOnly;
    const strokeDasharray = animated ? edgeDashPattern(state.edgeAnimatedStrokeStyle) : edgeDashPattern(state.edgeStrokeStyle);
    const edgeKeys = new Set(state.edges.map((e) => e.id));
    const nextEdges = [...state.edges];
    for (const e of incomingEdges) {
      const source = idMap.get(e.source) ?? e.source;
      const target = idMap.get(e.target) ?? e.target;
      if (!liveIds.has(source) || !liveIds.has(target)) continue;
      const id = `e-${source}-${target}`;
      if (edgeKeys.has(id)) continue;
      edgeKeys.add(id);
      nextEdges.push({
        ...e,
        id,
        source,
        target,
        type: edgeType,
        animated,
        style: { ...e.style, strokeWidth: state.edgeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
      });
    }
    set({
      nodes: applySearchHighlight(nextNodes, state.searchQuery, state.categoryFilter),
      edges: sortEdges(nextEdges, nextNodes),
      graphVersion: state.graphVersion + 1,
    });
    return { added };
  },
  relayout: () => {
    const { nodes, edges, direction, searchQuery, categoryFilter, hiddenIds, graphVersion, shynessScale, sortKey, sortDir } = get();
    if (nodes.length === 0) return;
    // A collapsed group's members are NOT in hiddenIds at all since T-164
    // (collapse is per-view state on the leaf; their hidden-ness derives from
    // the leaf's collapsedGroupIds), so they always lay out with the tree — the
    // T-140 block reservation now falls out of the model instead of a filter.
    const hidden = hiddenIds as string[];
    const excludeFromLayout = hidden.length > 0 ? new Set(hidden) : undefined;
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
      // A direction-less Organize is the whole canvas asking to re-flow.
      s.bumpReflow();
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
    // Organize is a user-requested re-flow: this view fits the whole graph once
    // the new layout settles (#286).
    s.bumpReflow(leafId);
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
    // The Organize button is a whole-workspace re-flow: every mounted canvas
    // fits the graph to its view afterwards (#286).
    s.bumpReflow();
  },
  applySearch: () => {
    const { nodes, searchQuery, categoryFilter, graphVersion } = get();
    set({ nodes: applySearchHighlight(nodes, searchQuery, categoryFilter), graphVersion: graphVersion + 1 });
  },
  applyFolderRefresh: (nodeId, childNodes, childEdges) => {
    const {
      nodes, edges, searchQuery, categoryFilter, hiddenIds, autoHiddenIds,
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
    // Previous auto-hides are re-derived (they live in `autoHiddenIds`); every
    // other hide the graph still carries is seeded so it is never relabelled
    // as an auto-hide of the refreshed subtree.
    const seeded = new Set((hiddenIds as string[]).filter((h) => !autoHiddenIds.includes(h)));
    const autoHideIds = computeLargeFolderHiddenIds(finalNodes, finalEdges, autoHideThreshold, new Set(revealedRootIds as string[]), {
      ...orderFromStore(get()),
      hiddenSeed: seeded,
    });
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
