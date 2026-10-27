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

/**
 * Action bodies at module scope, one function per action — see the note in
 * folderSlice.ts. A factory wrapper would only rename the finding; top-level
 * functions each carry their own CCN. Behavior unchanged.
 */
type CoreSet = Parameters<CoreSliceCreator>[0];
type CoreGet = () => GraphState;

/** Size incoming cards for the current layout settings. */
function styleImportNodes(nodes: any[], state: GraphState): any[] {
  return nodes.map((n) => ({
    ...n,
    style: { ...n.style, width: state.nodeWidth, height: n.data.type === "folder" ? state.nodeHeight : undefined, minHeight: undefined },
  }));
}

/** Stamp incoming edges with the store's style: type, animation, dash clock. */
function styleImportEdges(edges: any[], state: GraphState): any[] {
  const edgeType = edgeTypeFromStyle(state.edgeStyle);
  const animated = can("edgeMotion", state.tier) && state.edgeAnimated && !state.edgeAnimatedSelectedOnly;
  const strokeDasharray = animated ? edgeDashPattern(state.edgeAnimatedStrokeStyle) : edgeDashPattern(state.edgeStrokeStyle);
  return edges.map((e) => ({
    ...e,
    type: edgeType,
    animated,
    style: { ...e.style, strokeWidth: state.edgeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
  }));
}

/** Place the imported cards: a layout pass unless the caller preserved
 *  positions; the hidden set is excluded and the search highlight applied
 *  either way. */
function placeImportedNodes(
  styledNodes: any[],
  edges: any[],
  state: GraphState,
  idsToHide: string[],
  options?: { preservePositions?: boolean },
): any[] {
  const highlighted = (placed: any[]) => applySearchHighlight(placed, state.searchQuery, state.categoryFilter);
  if (options?.preservePositions) return highlighted(styledNodes);
  return highlighted(
    layoutGraphSync(styledNodes, edges, state.direction, {
      excludeFromLayout: idsToHide.length > 0 ? new Set(idsToHide) : undefined,
      shynessScale: state.shynessScale,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      tagLabelById: makeTagLabelLookup(state.tags),
    }),
  );
}

function setGraph(
  set: CoreSet,
  get: CoreGet,
  nodes: any[],
  edges: any[],
  pushHistory = true,
  hiddenFileIds?: string[],
  options?: { preservePositions?: boolean },
): void {
  const state = get();
  if (pushHistory && state.nodes.length > 0) {
    get().pushOp({ type: "bulk-import", nodes: state.nodes, edges: state.edges });
  }
  const styledNodes = styleImportNodes(nodes, state);
  const styledEdges = styleImportEdges(edges, state);
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
  const laidFinal = placeImportedNodes(styledNodes, edges, state, idsToHide, options);
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
}

function relayout(set: CoreSet, get: CoreGet): void {
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
}

function relayoutIfAuto(set: CoreSet, get: CoreGet): void {
  if (!get().autoRelayout) return;
  get().relayout();
}

function organize(set: CoreSet, get: CoreGet, leafId?: string | null): void {
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
}

/** Re-flow everything the user can see. `organize` stays per-view on
 *  purpose (Crown Shyness is documented as clearing the current view's manual
 *  card positions), but the Organize *action* — button, Alt+R, canvas context
 *  menu — is a "re-flow the tree" command. Scoping it to the active leaf left
 *  every other pane pinned to positions spaced for the old tree, so a card
 *  dragged out of a parent in one view never moved in the other. */
function organizeAll(set: CoreSet, get: CoreGet): void {
  const s = get();
  for (const leafId of Object.keys(s.viewSettings)) {
    if (s.viewSettings[leafId]?.positions) s.clearViewPositions(leafId);
  }
  s.relayout();
  // The Organize button is a whole-workspace re-flow: every mounted canvas
  // fits the graph to its view afterwards (#286).
  s.bumpReflow();
}

/** Swap a folder's subtree: lay the new children under the folder's current
 *  position and collect what the old subtree took with it. */
function rebuildFolderSubtree(folderNode: any, childNodes: any[], childEdges: any[], state: GraphState) {
  const oldIds = new Set(getDescendants(folderNode.id, state.edges));
  const oldNodes = state.nodes.filter((n) => oldIds.has(n.id));
  const oldEdges = state.edges.filter((e) => oldIds.has(e.source) && oldIds.has(e.target));
  const subtreeEdges = childEdges.map((e) => ({ ...e, type: edgeTypeFromStyle(state.edgeStyle) }));
  const laid = layoutGraphSync([folderNode, ...childNodes], subtreeEdges, state.direction, {
    shynessScale: state.shynessScale,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    tagLabelById: makeTagLabelLookup(state.tags),
  });
  const dx = (folderNode.position.x ?? 0) - (laid[0]?.position?.x ?? 0);
  const dy = (folderNode.position.y ?? 0) - (laid[0]?.position?.y ?? 0);
  const newChildNodes = laid.slice(1).map((n) => ({
    ...n,
    position: { x: (n.position.x ?? 0) + dx, y: (n.position.y ?? 0) + dy },
    style: { width: state.nodeWidth, height: n.data.type === "folder" ? state.nodeHeight : undefined, minHeight: undefined },
  }));
  return { oldIds, oldNodes, oldEdges, newChildNodes, subtreeEdges };
}

/** Re-derive the hide layers for the refreshed graph: prior hides survive
 *  (minus the old subtree), auto-hides/depth/category are recomputed, and
 *  `showFiles=false` hides the subtree's files. */
function refreshHideSets(finalNodes: any[], finalEdges: any[], state: GraphState, oldIds: Set<string>) {
  // Previous auto-hides are re-derived (they live in `autoHiddenIds`); every
  // other hide the graph still carries is seeded so it is never relabelled
  // as an auto-hide of the refreshed subtree.
  const seeded = new Set((state.hiddenIds as string[]).filter((h) => !state.autoHiddenIds.includes(h)));
  const autoHideIds = computeLargeFolderHiddenIds(finalNodes, finalEdges, state.autoHideThreshold, new Set(state.revealedRootIds as string[]), {
    ...orderFromStore(state),
    hiddenSeed: seeded,
  });
  const depthIds = computeDisplayDepthHiddenIds(finalNodes, state.maxDisplayDepth);
  const catHiddenIds = categoryHiddenNodeIds(finalNodes, state.categoryFilter);
  let idsToHide: string[] = [...(state.hiddenIds as string[]).filter((h) => !oldIds.has(h))];
  if (!state.showFiles) idsToHide = [...new Set([...idsToHide, ...finalNodes.filter((n) => n.data.type === "file").map((n) => n.id)])];
  idsToHide = [...new Set([...idsToHide, ...autoHideIds, ...depthIds, ...catHiddenIds])];
  return { idsToHide, autoHideIds, catHiddenIds };
}

function applyFolderRefresh(
  set: CoreSet,
  get: CoreGet,
  nodeId: string,
  childNodes: any[],
  childEdges: any[],
): { added: number; removed: number } {
  const state = get();
  const folderNode = state.nodes.find((n) => n.id === nodeId);
  if (!folderNode || folderNode.data.type !== "folder") return { added: 0, removed: 0 };
  const { oldIds, oldNodes, oldEdges, newChildNodes, subtreeEdges } = rebuildFolderSubtree(folderNode, childNodes, childEdges, state);
  for (const id of oldIds) fsHandleStore.delete(id);
  const finalNodes = [...state.nodes.filter((n) => n.id !== nodeId && !oldIds.has(n.id)), folderNode, ...newChildNodes];
  const finalEdges = [...state.edges.filter((e) => !oldIds.has(e.source) && !oldIds.has(e.target)), ...subtreeEdges];
  const { idsToHide, autoHideIds, catHiddenIds } = refreshHideSets(finalNodes, finalEdges, state, oldIds);
  const before = captureViewState(get());
  set({
    nodes: applySearchHighlight(finalNodes, state.searchQuery, state.categoryFilter),
    edges: sortEdges(finalEdges, finalNodes),
    hiddenIds: idsToHide,
    categoryHiddenIds: catHiddenIds,
    autoHiddenIds: autoHideIds,
    graphVersion: state.graphVersion + 1,
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
}

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
  setGraph: (nodes, edges, pushHistory = true, hiddenFileIds, options) => setGraph(set, get, nodes, edges, pushHistory, hiddenFileIds, options),
  relayout: () => relayout(set, get),
  relayoutIfAuto: () => relayoutIfAuto(set, get),
  organize: (leafId) => organize(set, get, leafId),
  organizeAll: () => organizeAll(set, get),
  applySearch: () => {
    const { nodes, searchQuery, categoryFilter, graphVersion } = get();
    set({ nodes: applySearchHighlight(nodes, searchQuery, categoryFilter), graphVersion: graphVersion + 1 });
  },
  applyFolderRefresh: (nodeId, childNodes, childEdges) => applyFolderRefresh(set, get, nodeId, childNodes, childEdges),
});
