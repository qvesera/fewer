"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { FewerNode, FewerEdge, HistoryOp, FileCategory } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import { categorizeByExtension, getFileExtension, categoryHiddenNodeIds } from "@/lib/fewer/categorize";
import { layoutGraph, layoutGraphSync } from "@/lib/fewer/layout";
import { validateConnection } from "@/lib/fewer/validation";
import { fsHandleStore, edgeDashPattern } from "@/lib/fewer/types";

/** Full display name for a node: label.ext for files, label for folders. */
const fullName = (n: { data: { label: string; extension?: string } }) =>
  n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;

import { captureViewState, viewStateOp } from "./historySlice";

const DEFAULT_AUTO_HIDE_THRESHOLD = 10;

/**
 * Pure helper: ids of nodes deeper than `maxDepth`.
 * `maxDepth <= 0` means unlimited — no depth-based hiding.
 */
function computeDisplayDepthHiddenIds(nodes: FewerNode[], maxDepth: number): string[] {
  if (maxDepth <= 0) return [];
  return nodes
    .filter((n) => (n.data.depth ?? 0) > maxDepth)
    .map((n) => n.id);
}

function computeLargeFolderHiddenIds(
  nodes: FewerNode[],
  edges: FewerEdge[],
  threshold: number,
  revealedSet?: Set<string>,
): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
  }
  const toHide = new Set<string>();
  const revealed = revealedSet ?? new Set<string>();
  for (const node of nodes) {
    if (node.data.type !== "folder") continue;
    const directChildren = childrenMap.get(node.id) ?? [];
    // Skip already-hidden or explicitly-revealed children
    const visibleChildren = directChildren.filter((cid) => !toHide.has(cid) && !revealed.has(cid));
    if (visibleChildren.length > threshold) {
      const queue = [...visibleChildren];
      while (queue.length) {
        const cid = queue.shift()!;
        if (toHide.has(cid) || revealed.has(cid)) continue;
        toHide.add(cid);
        for (const gc of childrenMap.get(cid) ?? []) queue.push(gc);
      }
    }
  }
  return [...toHide];
}

/**
 * Live-reconcile the large-folder auto-hide filter against the current threshold.
 * Works both ways:
 *   - children whose folder now exceeds the threshold are newly hidden;
 *   - children that were auto-hidden but whose folder now falls under the threshold
 *     are revealed (removed from hiddenIds), as long as they were not hidden by any
 *     other mechanism (manual, depth, file) — only `autoHiddenIds` are ever revealed.
 * Returns the reconciled hiddenIds + autoHiddenIds.
 */
export function reconcileAutoHide(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenIds: string[],
  autoHiddenIds: string[],
  revealedRootIds: string[],
  threshold: number,
): { hiddenIds: string[]; autoHiddenIds: string[] } {
  // Compute the target auto-hidden set from scratch (never reveals manual/depth/file hides).
  const target = computeLargeFolderHiddenIds(
    nodes.filter((n) => !new Set(hiddenIds).has(n.id)),
    edges,
    threshold,
    new Set(revealedRootIds),
  );
  const targetSet = new Set(target);
  const revealedRoots = new Set(revealedRootIds);
  const nextHidden = new Set(hiddenIds);
  const nextAuto = new Set<string>();

  // Reveal previously-auto-hidden nodes that are no longer in the target set.
  for (const id of autoHiddenIds) {
    if (!targetSet.has(id) && !revealedRoots.has(id)) {
      nextHidden.delete(id);
    }
  }
  // Hide + re-tag nodes that belong in the target set.
  for (const id of targetSet) {
    nextHidden.add(id);
    nextAuto.add(id);
  }
  return { hiddenIds: [...nextHidden], autoHiddenIds: [...nextAuto] };
}

function edgeTypeFromStyle(style: string): FewerEdge["type"] {
  switch (style) {
    case "curved": return "default";
    case "angled": return "smoothstep";
    case "straight": return "straight";
    default: return "default";
  }
}

function sortEdges(edges: FewerEdge[], nodes: FewerNode[]): FewerEdge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return [...edges].sort((a, b) => {
    const aNode = nodeMap.get(a.target);
    const bNode = nodeMap.get(b.target);
    const aType = aNode?.data.type ?? "file";
    const bType = bNode?.data.type ?? "file";
    const typeDiff = (aType === "folder" ? 1 : 0) - (bType === "folder" ? 1 : 0);
    if (typeDiff !== 0) return typeDiff;
    const aLabel = aNode?.data.label ?? "";
    const bLabel = bNode?.data.label ?? "";
    const labelDiff = bLabel.localeCompare(aLabel);
    if (labelDiff !== 0) return labelDiff;
    // Keep highlighted/raised edges last so store re-sorts (relayout, connect,
    // import) can't bury them under default edges while a selection is active.
    return (a.zIndex ?? 0) - (b.zIndex ?? 0);
  });
}

/**
 * After removing edges, reset the path of any node that lost its last parent edge
 * (and of its descendants) so breadcrumbs reflect the new root-level location.
 * Returns the updated nodes plus the path changes for the history op.
 */
function unparentSubtree(
  nodes: FewerNode[],
  edges: FewerEdge[],
  removedEdges: FewerEdge[],
): { nodes: FewerNode[]; pathChanges: { nodeId: string; prevPath: string; nextPath: string }[] } {
  // Nodes whose last parent edge was removed.
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }
  const rootless = new Set<string>();
  for (const e of removedEdges) {
    const parents = (incoming.get(e.target) ?? []).filter((p) => !removedEdges.some((re) => re.source === p && re.target === e.target));
    if (parents.length === 0) rootless.add(e.target);
  }

  const pathChanges: { nodeId: string; prevPath: string; nextPath: string }[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const next = nodes.map((n) => ({ ...n }));

  for (const rid of rootless) {
    const label = byId.get(rid)?.data.label ?? rid;
    const extension = byId.get(rid)?.data.extension ? `.${byId.get(rid)!.data.extension}` : "";
    const newRootPath = `${label}${extension}`;
    const cur = byId.get(rid);
    if (!cur) continue;
    const prevRootPath = cur.data.path;
    // Reset the rootless node itself.
    const idx = next.findIndex((n) => n.id === rid);
    if (idx !== -1) {
      pathChanges.push({ nodeId: rid, prevPath: prevRootPath, nextPath: newRootPath });
      next[idx] = { ...next[idx], data: { ...next[idx].data, path: newRootPath, isRoot: true } };
    }
    // Reset descendants whose path was under the old root prefix.
    const queue = [rid];
    const seen = new Set<string>([rid]);
    while (queue.length) {
      const nid = queue.shift()!;
      for (const e of edges) {
        if (e.source !== nid) continue;
        if (seen.has(e.target)) continue;
        seen.add(e.target);
        const child = byId.get(e.target);
        const childIdx = next.findIndex((n) => n.id === e.target);
        if (child && child.data.path.startsWith(prevRootPath) && childIdx !== -1) {
          const newPath = child.data.path.replace(prevRootPath, newRootPath);
          pathChanges.push({ nodeId: e.target, prevPath: child.data.path, nextPath: newPath });
          next[childIdx] = { ...next[childIdx], data: { ...next[childIdx].data, path: newPath } };
        }
        queue.push(e.target);
      }
    }
  }
  return { nodes: next, pathChanges };
}

export type GraphSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    nodes: FewerNode[];
    edges: FewerEdge[];
    dataSource: string | null;
    /** Absolute path of the current graph's root folder on this dev machine
     *  (optional). Populated when a directory import can be resolved, or when a
     *  saved graph carries one. Enables direct OS opens instead of path-search. */
    localRootPath: string | null;
    graphVersion: number;
    hiddenPanelExpandTrigger: number;
    clipboard: GraphState["clipboard"];

    setGraph: (nodes: FewerNode[], edges: FewerEdge[], pushHistory?: boolean, hiddenFileIds?: string[], options?: { preservePositions?: boolean }) => void;
    setDataSource: (v: string | null) => void;
    setLocalRootPath: (v: string | null) => void;
    addNode: (parentId: string | null, label: string, type: "folder" | "file") => string;
    addStandaloneNode: (label: string, type: "folder" | "file", position: { x: number; y: number }) => string;
    removeNode: (id: string) => void;
    removeSelected: () => void;
    toggleCollapse: (id: string) => void;
    collapseAll: () => void;
    expandAll: () => void;
    connect: (source: string, target: string) => void;
    reset: () => void;
    applySearch: () => void;
    relayout: () => void;
    triggerHiddenPanelExpand: () => void;
    setClipboard: (mode: "copy" | "cut", nodeIds: string[]) => void;
    clearClipboard: () => void;
    _makeCopyNode: (sourceNode: FewerNode, parentId: string | null) => { newNode: FewerNode; newId: string };
    _duplicateSubtree: (id: string, parentId: string | null) => { newRoot: FewerNode | null; newNodes: FewerNode[]; newEdges: FewerEdge[] };
    duplicateNodeUnderParent: (id: string) => void;
    pasteNode: (id: string, parentId?: string | null) => void;
    pasteFromClipboard: (parentId?: string | null) => void;
    moveNode: (id: string) => void;
    _findFreePositionForBounds: (baseX: number, baseY: number, boundsWidth: number, boundsHeight: number) => { x: number; y: number };
    deleteNodes: (ids: string[]) => void;
    renameNode: (id: string, newLabel: string) => boolean;
    duplicateNode: (id: string) => void;
    connectNodes: (connection: { source: string; target: string }) => { ok: boolean; reason?: string };
    removeEdgesFromHandle: (nodeId: string, handleType: "source" | "target") => void;
    deleteEdges: (ids: string[]) => void;
    hideNode: (id: string) => void;
    hideNodes: (ids: string[]) => void;
    showAll: () => void;
    showNode: (id: string) => void;
    showAncestors: (id: string) => void;
    showSubtree: (id: string) => void;
    autoHideLargeFolders: (threshold?: number) => void;
    maxDisplayDepth: number;
    setMaxDisplayDepth: (depth: number) => void;
    autoHideCount: number;
    revealedRootIds: string[];
    /** Ids hidden by the large-folder auto-hide filter (as opposed to manual/depth/file hides). */
    autoHiddenIds: string[];
    revealSubtree: (id: string) => void;
    autoHideThreshold: number;
    setAutoHideThreshold: (threshold: number) => void;
  }
>;

export const createGraphSlice: GraphSliceCreator = (set, get) => ({
  nodes: [],
  edges: [],
  dataSource: null,
  localRootPath: null,
  graphVersion: 0,
  hiddenPanelExpandTrigger: 0,
  clipboard: null,
  maxDisplayDepth: 6,
  autoHideCount: 0,
  revealedRootIds: [],
  autoHiddenIds: [],
      revealedFromHidden: [],
  autoHideThreshold: DEFAULT_AUTO_HIDE_THRESHOLD,

  setDataSource: (v) => set({ dataSource: v }),
  setLocalRootPath: (v) => set({ localRootPath: v }),

  triggerHiddenPanelExpand: () => {
    set((s) => ({ hiddenPanelExpandTrigger: s.hiddenPanelExpandTrigger + 1 }));
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
    let idsToHide = hiddenFileIds ?? [];
    if (!state.showFiles) {
      const fileIds = nodes.filter((n) => n.data.type === "file").map((n) => n.id);
      idsToHide = [...new Set([...idsToHide, ...fileIds])];
    }
    const edgeType = edgeTypeFromStyle(state.edgeStyle);
    // Animated edges use the dedicated animated pattern; everything else uses
    // the base pattern (solid stays solid when edge motion is on).
    const animated = state.edgeAnimated && !state.edgeAnimatedSelectedOnly;
    const strokeDasharray = animated ? edgeDashPattern(state.edgeAnimatedStrokeStyle) : edgeDashPattern(state.edgeStrokeStyle);
    const styledEdges = edges.map((e) => ({
      ...e,
      type: edgeType,
      // Fresh graph has no selection yet — with "selected only" animation on,
      // nothing animates until the user selects a node.
      animated,
      style: { ...e.style, strokeWidth: state.edgeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
    }));
    // Fresh import resets reveal memory
    // Auto-hide children of folders with many children so big graphs stay fast
    const autoHideIds = computeLargeFolderHiddenIds(nodes, edges, state.autoHideThreshold, new Set());
    // Hide nodes beyond the max display depth
    const displayDepthIds = computeDisplayDepthHiddenIds(nodes, state.maxDisplayDepth);
    idsToHide = [...new Set([...idsToHide, ...autoHideIds, ...displayDepthIds])];
    // A persistent category filter survives imports: hide files that don't match.
    const catHiddenIds = categoryHiddenNodeIds(nodes, state.categoryFilter);
    idsToHide = [...new Set([...idsToHide, ...catHiddenIds])];
    const excludeFromLayoutFinal = idsToHide.length > 0 ? new Set(idsToHide) : undefined;
    // Keep saved positions (saved/graph loads) or lay out fresh (imports).
    const laidFinal = options?.preservePositions
      ? applySearchInternal(styledNodes, state.searchQuery, state.categoryFilter)
      : applySearchInternal(layoutGraphSync(styledNodes, edges, state.direction, { excludeFromLayout: excludeFromLayoutFinal }), state.searchQuery, state.categoryFilter);
    const sortedEdges = sortEdges(styledEdges, laidFinal);
    // Count auto-hidden large-folder children (not from file hiding or depth)
    const baseHidden = new Set(hiddenFileIds ?? []);
    const autoHideCount = autoHideIds.filter((id) => !baseHidden.has(id)).length;
    const seedAutoHidden = autoHideIds.filter((id) => !baseHidden.has(id));
    set({ nodes: laidFinal, edges: sortedEdges, hiddenIds: idsToHide, categoryHiddenIds: catHiddenIds, graphVersion: state.graphVersion + 1, autoHideCount, revealedRootIds: [], autoHiddenIds: seedAutoHidden });
  },

  relayout: () => {
    const { nodes, edges, direction, searchQuery, categoryFilter, hiddenIds, graphVersion } = get();
    if (nodes.length === 0) return;
    // hiddenIds already includes category-filtered ids, so layout exclusion covers them.
    const excludeFromLayout = (hiddenIds as string[]).length > 0 ? new Set(hiddenIds as string[]) : undefined;
    const laid = layoutGraphSync(nodes, edges, direction, { excludeFromLayout });
    const searched = applySearchInternal(laid, searchQuery, categoryFilter);
    set({ nodes: searched, graphVersion: graphVersion + 1 });
  },

  applySearch: () => {
    const { nodes, searchQuery, categoryFilter, graphVersion } = get();
    set({ nodes: applySearchInternal(nodes, searchQuery, categoryFilter), graphVersion: graphVersion + 1 });
  },

  setClipboard: (mode, nodeIds) => {
    const { nodes, edges } = get();
    const allIds = new Set<string>();
    for (const id of nodeIds) {
      allIds.add(id);
      const queue = [id];
      while (queue.length) {
        const qid = queue.shift()!;
        for (const e of edges) { if (e.source === qid && !allIds.has(e.target)) { allIds.add(e.target); queue.push(e.target); } }
      }
    }
    const subtreeNodes = nodes.filter((n) => allIds.has(n.id));
    const subtreeEdges = edges.filter((e) => allIds.has(e.source) && allIds.has(e.target));
    set({ clipboard: { mode, nodeIds: [...nodeIds], subtreeNodes, subtreeEdges } });
  },

  clearClipboard: () => set({ clipboard: null }),

  deleteNodes: (ids) => {
    const { nodes, edges, searchQuery } = get();
    // Collect all nodes to remove (including descendants)
    const toRemove = new Set<string>();
    const queue = [...ids];
    while (queue.length) { const id = queue.shift()!; toRemove.add(id); for (const e of edges) { if (e.source === id && !toRemove.has(e.target)) queue.push(e.target); } }
    const removedNodes = nodes.filter((n) => toRemove.has(n.id));
    const removedEdges = edges.filter((e) => toRemove.has(e.source) && toRemove.has(e.target));
    const newNodes = nodes.filter((n) => !toRemove.has(n.id));
    const newEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
    // Store only the removed subtree (not the full array) for undo. Undo restores it.
    if (removedNodes.length > 0) {
      const root = nodes.find((n) => n.id === ids[0]);
      const rootEdge = edges.find((e) => e.target === ids[0]) ?? null;
      const before = captureViewState(get());
      const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toRemove.has(h)) };
      get().pushOp({
        type: "remove-subtree",
        node: removedNodes[0],
        edge: rootEdge,
        children: removedNodes.slice(1),
        childEdges: removedEdges,
        before,
        after,
      });
    }
    set((s) => ({
      nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter),
      edges: newEdges,
      selectedNodeIds: [],
      // Purge the deleted subtree from the view-state so it no longer appears
      // in the hidden list. Matches the op's `after` for consistent undo/redo.
      hiddenIds: s.hiddenIds.filter((h) => !toRemove.has(h)),
      autoHiddenIds: s.autoHiddenIds.filter((h) => !toRemove.has(h)),
      revealedRootIds: s.revealedRootIds.filter((h) => !toRemove.has(h)),
      graphVersion: s.graphVersion + 1,
    }));
  },

  renameNode: (id, newLabel) => {
    const { nodes, edges, searchQuery } = get();
    const trimmed = newLabel.trim();
    if (!trimmed) return false;
    const node = nodes.find((n) => n.id === id);
    if (!node) return false;
    const oldLabel = node.data.label;
    const newExt = node.data.type === "file" ? getFileExtension(trimmed) : "";
    const newLabelOnly = newExt ? trimmed.slice(0, -(newExt.length + 1)) : trimmed;
    const oldFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
    const newFullLabel = newExt ? `${newLabelOnly}.${newExt}` : newLabelOnly;
    if (newFullLabel.toLowerCase() === oldFullLabel.toLowerCase()) {
      set({ renamingId: null });
      return false;
    }
    const parentEdge = edges.find((e) => e.target === id);
    const parent = parentEdge ? nodes.find((n) => n.id === parentEdge.source) : null;
    // Block rename when a sibling already uses the same full label
    const siblingIds = parentEdge
      ? edges.filter((e) => e.source === parentEdge.source && e.target !== id).map((e) => e.target)
      : nodes.filter((n) => !edges.some((e) => e.target === n.id) && n.id !== id).map((n) => n.id);
    const siblingHasLabel = siblingIds.some((sid) => {
      const s = nodes.find((n) => n.id === sid);
      if (!s) return false;
      const sFull = s.data.extension ? `${s.data.label}.${s.data.extension}` : s.data.label;
      return sFull.toLowerCase() === newFullLabel.toLowerCase();
    });
    if (siblingHasLabel) {
      set({ renamingId: null });
      return false;
    }
    const parentPath = parent ? parent.data.path : "";
    const oldPathPrefix = parent ? `${parentPath}/${oldFullLabel}` : oldFullLabel;
    const newPathPrefix = parent ? `${parentPath}/${newFullLabel}` : newFullLabel;
    const isFolder = node.data.type === "folder";
    const descendantIds = new Set<string>();
    if (isFolder) {
      const queue = [id];
      while (queue.length) {
        const nid = queue.shift()!;
        for (const e of edges) { if (e.source === nid && e.target !== id) { descendantIds.add(e.target); queue.push(e.target); } }
      }
    }
    const newNodes = nodes.map((n) => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, label: newLabelOnly, path: newPathPrefix, extension: newExt, category: newExt ? categorizeByExtension(newExt) : undefined } };
      }
      if (isFolder && descendantIds.has(n.id) && n.data.path.startsWith(oldPathPrefix)) {
        return { ...n, data: { ...n.data, path: n.data.path.replace(oldPathPrefix, newPathPrefix) } };
      }
      return n;
    });
    // Targeted rename op — stores only the diff, not the full array
    get().pushOp({ type: "rename", nodeId: id, oldLabel, newLabel: newLabelOnly });
    set({ nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter), renamingId: null, graphVersion: get().graphVersion + 1 });
    return true;
  },

  _makeCopyNode: (sourceNode, parentId) => {
    const { nodes, edges, nodeWidth, nodeHeight } = get();
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
    const siblingFullNames = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map(fullName));
    const sourceExt = sourceNode.data.extension || "";
    const baseStem = sourceNode.data.label;
    let copyFullLabel = sourceExt ? `${baseStem} copy.${sourceExt}` : `${baseStem} copy`;
    if (siblingFullNames.has(copyFullLabel)) { let counter = 2; while (siblingFullNames.has(`${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`)) counter++; copyFullLabel = `${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`; }
    const copyLabel = sourceExt ? copyFullLabel.slice(0, -(sourceExt.length + 1)) : copyFullLabel;
    const newId = `n-dup-${uuid().slice(0, 8)}`;
    return { newNode: { id: newId, type: sourceNode.type, position: { x: sourceNode.position.x + 40, y: sourceNode.position.y + 40 }, data: { ...sourceNode.data, label: copyLabel, extension: sourceNode.data.extension || "", path: parentId ? `${sourceNode.data.path.replace(sourceNode.data.label, copyLabel)}` : copyLabel, isRoot: parentId === null, selected: true }, style: { ...sourceNode.style, width: nodeWidth, height: sourceNode.data.type === "folder" ? nodeHeight : undefined } } as FewerNode, newId };
  },

  _duplicateSubtree: (id, parentId) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => n.id === id);
    if (!sourceNode) return { newRoot: null as FewerNode | null, newNodes: [] as FewerNode[], newEdges: [] as FewerEdge[] };
    const allIds = new Set<string>([id]); const queue = [id];
    while (queue.length) { const qid = queue.shift()!; for (const e of edges) { if (e.source === qid && !allIds.has(e.target)) { allIds.add(e.target); queue.push(e.target); } } }
    const idMap = new Map<string, string>();
    for (const oid of allIds) idMap.set(oid, `n-dup-${uuid().slice(0, 8)}`);
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
    const siblingFullNames = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map(fullName));
    const sourceExt = sourceNode.data.extension || "";
    const baseStem = sourceNode.data.label;
    let copyFullLabel = sourceExt ? `${baseStem} copy.${sourceExt}` : `${baseStem} copy`;
    if (siblingFullNames.has(copyFullLabel)) { let counter = 2; while (siblingFullNames.has(`${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`)) counter++; copyFullLabel = `${baseStem} copy ${counter}${sourceExt ? `.${sourceExt}` : ""}`; }
    const copyLabel = sourceExt ? copyFullLabel.slice(0, -(sourceExt.length + 1)) : copyFullLabel;
    const { nodeWidth, nodeHeight } = get();
    const newNodes: FewerNode[] = [];
    for (const oid of allIds) {
      const orig = nodes.find((n) => n.id === oid)!;
      const nid = idMap.get(oid)!;
      const isRoot = oid === id;
      newNodes.push({ ...orig, id: nid, position: isRoot ? { x: orig.position.x + 40, y: orig.position.y + 40 } : { ...orig.position }, data: { ...orig.data, label: isRoot ? copyLabel : orig.data.label, path: isRoot ? (parentId ? `${sourceNode.data.path.replace(sourceNode.data.label, copyLabel)}` : copyLabel) : orig.data.path, isRoot: isRoot && parentId === null, selected: isRoot }, style: { ...orig.style, width: nodeWidth, height: orig.data.type === "folder" ? nodeHeight : undefined }, selected: isRoot });
    }
    const newEdges: FewerEdge[] = [];
    for (const e of edges) { if (allIds.has(e.source) && allIds.has(e.target)) { newEdges.push({ ...e, id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`, source: idMap.get(e.source)!, target: idMap.get(e.target)! }); } }
    if (parentId) newEdges.push({ id: `e-${parentId}-${idMap.get(id)}`, source: parentId, target: idMap.get(id)!, type: edgeTypeFromStyle(get().edgeStyle) });
    return { newRoot: newNodes.find((n) => n.id === idMap.get(id))!, newNodes, newEdges };
  },

  duplicateNodeUnderParent: (id) => {
    const { nodes, edges, searchQuery } = get();
    const parentId = edges.find((e) => e.target === id)?.source ?? null;
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, parentId);
    if (!newRoot) return;
    // Store only the new nodes (not the full array) for undo
    get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    const mergedEdges = sortEdges([...edges, ...newEdges], [...updatedNodes, ...newNodes]);
    set({ nodes: applySearchInternal([...updatedNodes, ...newNodes], searchQuery, get().categoryFilter), edges: mergedEdges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
  },

  pasteNode: (id, parentFolderId?) => {
    const { nodes, edges, searchQuery } = get();
    let effectiveParentId: string | null = null;
    if (parentFolderId) { const parent = nodes.find((n) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, effectiveParentId);
    if (!newRoot) return;
    // Store only the new nodes for undo
    get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    const mergedEdges = sortEdges([...edges, ...newEdges], [...updatedNodes, ...newNodes]);
    set({ nodes: applySearchInternal([...updatedNodes, ...newNodes], searchQuery, get().categoryFilter), edges: mergedEdges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
  },

  _findFreePosition: (baseX, baseY, nodeWidth, nodeHeight) => {
    const { nodes } = get(); const PADDING = 40; let x = baseX; let y = baseY; let attempts = 0;
    while (attempts < 50) { const overlapping = nodes.some((n) => Math.abs(n.position.x - x) < nodeWidth + PADDING && Math.abs(n.position.y - y) < nodeHeight + PADDING); if (!overlapping) break; x += nodeWidth + PADDING; if (x > baseX + nodeWidth * 3) { x = baseX; y += nodeHeight + PADDING; } attempts++; }
    return { x, y };
  },

  _findFreePositionForBounds: (baseX, baseY, boundsWidth, boundsHeight) => {
    const { nodes, nodeWidth, nodeHeight } = get(); const PADDING = 40; let x = baseX; let y = baseY; let attempts = 0;
    while (attempts < 50) {
      const overlapping = nodes.some((n) => { const nw = n.style?.width ?? nodeWidth; const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 60; return !(x + boundsWidth + PADDING < n.position.x || x > n.position.x + Number(nw) + PADDING || y + boundsHeight + PADDING < n.position.y || y > n.position.y + Number(nh) + PADDING); });
      if (!overlapping) break; x += boundsWidth + PADDING; if (x > baseX + boundsWidth * 3) { x = baseX; y += boundsHeight + PADDING; } attempts++;
    }
    return { x, y };
  },

  pasteFromClipboard: (parentFolderId?) => {
    const clip = get().clipboard;
    if (!clip || clip.nodeIds.length === 0) return;
    const { pastePosition, mousePosition, nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
    const effectivePastePos = pastePosition ?? mousePosition;
    let effectiveParentId: string | null = null;
    if (parentFolderId) { const parent = nodes.find((n) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
    const { subtreeNodes, subtreeEdges } = clip;
    const allIds = new Set<string>(subtreeNodes.map((n: any) => n.id));
    const rootIds = (clip.nodeIds as unknown as string[]).filter((id) => allIds.has(id));
    const idMap = new Map<string, string>();
    for (const oid of allIds) idMap.set(oid, `n-paste-${uuid().slice(0, 8)}`);
    const newNodes: FewerNode[] = [];
    const rootOrig = subtreeNodes.find((n) => rootIds.includes(n.id));
    const minX = Math.min(...subtreeNodes.map((n: any) => n.position.x));
    const minY = Math.min(...subtreeNodes.map((n: any) => n.position.y));
    const maxX = Math.max(...subtreeNodes.map((n: any) => n.position.x + Number(n.style?.width ?? nodeWidth)));
    const maxY = Math.max(...subtreeNodes.map((n: any) => n.position.y + Number(n.style?.height ?? 60)));
    const boundsW = maxX - minX; const boundsH = maxY - minY;
    const defaultBase = rootOrig ? { x: rootOrig.position.x + 40, y: rootOrig.position.y + 40 } : { x: 0, y: 0 };
    const tryBase = effectivePastePos ? effectivePastePos : defaultBase;
    const rootBase = rootOrig ? get()._findFreePositionForBounds(tryBase.x, tryBase.y, boundsW, boundsH) : { x: 0, y: 0 };
    const rootDelta = rootOrig ? { x: rootBase.x - rootOrig.position.x, y: rootBase.y - rootOrig.position.y } : { x: 0, y: 0 };
    for (const orig of subtreeNodes) {
      const nid = idMap.get(orig.id)!;
      const isRoot = rootIds.includes(orig.id);
      let copyLabel = orig.data.label;
      if (isRoot) {
        const stem = orig.data.label;
        const origExt = orig.data.extension || "";
        const origFull = origExt ? `${stem}.${origExt}` : stem;
        const parentSiblingIds = effectiveParentId ? edges.filter((e) => e.source === effectiveParentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
        const parentSiblingFullNames = new Set(nodes.filter((n) => parentSiblingIds.includes(n.id)).map(fullName));
        if (parentSiblingFullNames.has(origFull)) { let cl = `${stem} copy`; let clFull = origExt ? `${cl}.${origExt}` : cl; if (parentSiblingFullNames.has(clFull)) { let counter = 2; while (parentSiblingFullNames.has(`${stem} copy ${counter}${origExt ? `.${origExt}` : ""}`)) counter++; cl = `${stem} copy ${counter}`; } copyLabel = cl; }
      }
      const pos = isRoot ? rootBase : { x: orig.position.x + rootDelta.x, y: orig.position.y + rootDelta.y };
      newNodes.push({ ...orig, id: nid, position: pos, data: { ...orig.data, label: copyLabel, path: isRoot ? copyLabel : orig.data.path, isRoot: isRoot && effectiveParentId === null, selected: isRoot }, style: { ...orig.style, width: nodeWidth, height: orig.data.type === "folder" ? nodeHeight : undefined }, selected: isRoot });
    }
    const newEdges: FewerEdge[] = [];
    for (const e of subtreeEdges) { if (allIds.has(e.source) && allIds.has(e.target)) { newEdges.push({ ...e, id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`, source: idMap.get(e.source)!, target: idMap.get(e.target)! }); } }
    if (effectiveParentId) {
      const parentNode = nodes.find((n) => n.id === effectiveParentId);
      const parentPath = parentNode?.data.path ?? "";
      for (const rootId of rootIds) {
        const newId = idMap.get(rootId);
        if (!newId) continue;
        newEdges.push({ id: `e-${effectiveParentId}-${newId}`, source: effectiveParentId, target: newId, type: edgeTypeFromStyle(get().edgeStyle) });
        const pastedNode = newNodes.find((n) => n.id === newId);
        if (pastedNode) {
          const fullLabel = pastedNode.data.extension ? `${pastedNode.data.label}.${pastedNode.data.extension}` : pastedNode.data.label;
          pastedNode.data.path = `${parentPath}/${fullLabel}`;
          pastedNode.data.isRoot = false;
        }
      }
    }
    const firstRoot = newNodes.find((n) => rootIds.includes((clip.nodeIds as unknown as string[])[0]) || n.selected);
    const selectId = firstRoot?.id ?? newNodes[0]?.id;
    // Store only the new nodes (not the full array) for undo
    get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    const mergedEdges = sortEdges([...edges, ...newEdges], [...updatedNodes, ...newNodes]);
    set({ nodes: applySearchInternal([...updatedNodes, ...newNodes], searchQuery, get().categoryFilter), edges: mergedEdges, selectedNodeIds: selectId ? [selectId] : [], graphVersion: get().graphVersion + 1 });
  },

  duplicateNode: (id) => { get().duplicateNodeUnderParent(id); },

  moveNode: (id) => {
    const { nodes, edges, searchQuery } = get();
    const toRemove = new Set([id]); const queue = [id];
    while (queue.length) { const qid = queue.shift()!; for (const e of edges) { if (e.source === qid && !toRemove.has(e.target)) { toRemove.add(e.target); queue.push(e.target); } } }
    const removedNodes = nodes.filter((n) => toRemove.has(n.id));
    const removedEdges = edges.filter((e) => toRemove.has(e.source) && toRemove.has(e.target));
    const filteredNodes = nodes.filter((n) => !toRemove.has(n.id));
    const filteredEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
    // Store only the removed subtree for undo. Undo restores it.
    if (removedNodes.length > 0) {
      const rootEdge = edges.find((e) => e.target === id) ?? null;
      const before = captureViewState(get());
      const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toRemove.has(h)) };
      get().pushOp({
        type: "remove-subtree",
        node: removedNodes[0],
        edge: rootEdge,
        children: removedNodes.slice(1),
        childEdges: removedEdges,
        before,
        after,
      });
    }
    set({ nodes: applySearchInternal(filteredNodes, searchQuery, get().categoryFilter), edges: filteredEdges, selectedNodeIds: [], graphVersion: get().graphVersion + 1 });
  },

  addNode: (parentId, label, type) => {
    const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
    const parent = nodes.find((n) => n.id === parentId);
    const ext = type === "file" ? getFileExtension(label) : "";
    const baseLabel = ext ? label.slice(0, -(ext.length + 1)) : label;
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : [];
    const siblingFullNames = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map(fullName));
    let finalLabel = ext ? `${baseLabel}.${ext}` : baseLabel;
    if (siblingFullNames.has(finalLabel)) {
      let counter = 1;
      while (siblingFullNames.has(`${baseLabel} (${counter})${ext ? `.${ext}` : ""}`)) counter++;
      finalLabel = `${baseLabel} (${counter})${ext ? `.${ext}` : ""}`;
    }
    const newPath = parent ? `${parent.data.path}/${finalLabel}` : finalLabel;
    const nodeLabel = ext ? finalLabel.slice(0, -(ext.length + 1)) : finalLabel;
    const newNode: FewerNode = { id: `n-new-${Date.now()}`, type, position: parent ? { x: parent.position.x + 30, y: parent.position.y + 80 } : { x: 0, y: 0 }, data: { label: nodeLabel, path: newPath, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: parent ? (parent.data.depth ?? 0) + 1 : 0, isRoot: parentId === null }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newEdge: { id: string; source: string; target: string; type?: string } | null = parentId ? { id: `e-${parentId}-${newNode.id}`, source: parentId, target: newNode.id, type: edgeTypeFromStyle(get().edgeStyle) } : null;
    const newEdgesUnordered = newEdge ? [...edges, newEdge] : edges;
    const newNodes = [...nodes, newNode];
    const sorted = sortEdges(newEdgesUnordered, newNodes);
    // Targeted add-node op — stores only the new node, not the full array
    get().pushOp({ type: "add-node", node: newNode, edge: newEdge as FewerEdge | null });
    set({ nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter), edges: sorted, graphVersion: get().graphVersion + 1 });
    get().relayout();
    return newNode.id;
  },

  addStandaloneNode: (label, type, position) => {
    const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
    const trimmed = label.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    const ext = type === "file" ? getFileExtension(trimmed) : "";
    const baseLabel = ext ? trimmed.slice(0, -(ext.length + 1)) : trimmed;
    const rootNodeLabels = new Set(nodes.filter((n) => !edges.some((e) => e.target === n.id)).map(fullName));
    let finalLabel = ext ? `${baseLabel}.${ext}` : baseLabel;
    if (rootNodeLabels.has(finalLabel)) {
      let counter = 1;
      while (rootNodeLabels.has(`${baseLabel} (${counter})${ext ? `.${ext}` : ""}`)) counter++;
      finalLabel = `${baseLabel} (${counter})${ext ? `.${ext}` : ""}`;
    }
    const nodeLabel = ext ? finalLabel.slice(0, -(ext.length + 1)) : finalLabel;
    const newNode: FewerNode = { id: `n-${uuid().slice(0, 8)}`, type, position, data: { label: nodeLabel, path: finalLabel, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: 0, isRoot: true }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newNodes = [...nodes, newNode];
    // Targeted add-node op — stores only the new node
    get().pushOp({ type: "add-node", node: newNode, edge: null });
    set({ nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
    return newNode.id;
  },

  connectNodes: (connection) => {
    const { nodes, edges, searchQuery } = get();
    if (!connection.source || !connection.target) return { ok: false, reason: "Missing source or target." };
    const result = validateConnection(connection.source, connection.target, nodes, edges);
    if (!result.ok) return result;
    const newEdge: FewerEdge = { id: `e-${connection.source}-${connection.target}-${uuid().slice(0, 6)}`, source: connection.source, target: connection.target, type: edgeTypeFromStyle(get().edgeStyle) };
    const parent = nodes.find((n) => n.id === connection.source);
    const child = nodes.find((n) => n.id === connection.target);
    let updatedNodes = nodes;
    const descendantIds = new Set<string>();
    if (parent && child) {
      const childFullLabel = child.data.extension ? `${child.data.label}.${child.data.extension}` : child.data.label;
      const newChildPath = `${parent.data.path}/${childFullLabel}`;
      const oldChildPath = child.data.path;
      const isFolder = child.data.type === "folder";
      if (isFolder) {
        const queue = [connection.target];
        while (queue.length) {
          const nid = queue.shift()!;
          for (const e of edges) { if (e.source === nid && e.target !== connection.target) { descendantIds.add(e.target); queue.push(e.target); } }
        }
      }
      updatedNodes = nodes.map((n) => {
        if (n.id === connection.target) return { ...n, data: { ...n.data, path: newChildPath, isRoot: false } };
        if (isFolder && descendantIds.has(n.id) && n.data.path.startsWith(oldChildPath)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldChildPath, newChildPath) } };
        return n;
      });
    }
    const changedNodeIds = child && child.data.type === "folder" 
      ? [connection.target, ...Array.from(descendantIds)] 
      : [connection.target];
    // Capture the original paths so undo can restore them (without deleting the node).
    const prevPaths = changedNodeIds
      .map((nid) => ({ nodeId: nid, path: nodes.find((n) => n.id === nid)?.data.path ?? "" }))
      .filter((p) => p.path !== "");
    const nextPaths = changedNodeIds
      .map((nid) => ({ nodeId: nid, path: updatedNodes.find((n) => n.id === nid)?.data.path ?? "" }))
      .filter((p) => p.path !== "");
    get().pushOp({ type: "connect", edge: newEdge, prevPaths, nextPaths });
    const nextEdges = sortEdges([...edges, newEdge], updatedNodes);
    set({ nodes: applySearchInternal(updatedNodes, searchQuery, get().categoryFilter), edges: nextEdges, graphVersion: get().graphVersion + 1 });
    return { ok: true };
  },

  removeEdgesFromHandle: (nodeId, handleType) => {
    const { nodes, edges, searchQuery } = get();
    const filteredEdges = edges.filter((e) => { if (handleType === "source") return e.source !== nodeId; if (handleType === "target") return e.target !== nodeId; return true; });
    if (filteredEdges.length === edges.length) return;
    const removedEdges = edges.filter((e) => !filteredEdges.includes(e));
    const { nodes: nextNodes, pathChanges } = unparentSubtree(nodes, filteredEdges, removedEdges);
    get().pushOp({ type: "remove-edges", edges: removedEdges, pathChanges });
    set({ nodes: applySearchInternal(nextNodes, searchQuery, get().categoryFilter), edges: filteredEdges, graphVersion: get().graphVersion + 1 });
  },

  deleteEdges: (ids) => {
    const { nodes, edges, searchQuery } = get();
    const idSet = new Set(ids);
    const filtered = edges.filter((e) => !idSet.has(e.id));
    if (filtered.length === edges.length) return;
    const removedEdges = edges.filter((e) => idSet.has(e.id));
    const { nodes: nextNodes, pathChanges } = unparentSubtree(nodes, filtered, removedEdges);
    get().pushOp({ type: "remove-edges", edges: removedEdges, pathChanges });
    set({ nodes: applySearchInternal(nextNodes, searchQuery, get().categoryFilter), edges: filtered, graphVersion: get().graphVersion + 1 });
  },

  hideNode: (id) => {
    const { hiddenIds, edges, selectedNodeIds, revealedRootIds, autoHiddenIds } = get();
    if (hiddenIds.includes(id)) return;
    const toHide = new Set([id]); const queue = [id];
    while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } } }
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
    const toHide = new Set(ids);
    for (const id of ids) { const queue = [id]; while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } } } }
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
  },

  showAncestors: (id) => {
    const { hiddenIds, edges, revealedFromHidden, autoHiddenIds } = get();
    if (!hiddenIds.includes(id)) return;
    const hiddenSet = new Set(hiddenIds);
    const revealedSet = new Set(revealedFromHidden);
    const parentMap = new Map<string, string>();
    for (const e of edges) parentMap.set(e.target, e.source);
    const toShow = new Set<string>([id]); let currentId: string | undefined = parentMap.get(id);
    while (currentId && hiddenSet.has(currentId)) { toShow.add(currentId); currentId = parentMap.get(currentId); }
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toShow.has(h)) };
    get().pushOp(viewStateOp(before, after));
    set({ hiddenIds: hiddenIds.filter((h) => !toShow.has(h)), autoHiddenIds: autoHiddenIds.filter((h) => !toShow.has(h)), revealedFromHidden: [...new Set([...revealedFromHidden, ...toShow])], graphVersion: get().graphVersion + 1 });
  },

  showSubtree: (id) => {
    const { hiddenIds, edges, autoHiddenIds } = get();
    const toShow = new Set([id]); const queue = [id];
    while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && hiddenIds.includes(e.target)) { toShow.add(e.target); queue.push(e.target); } } }
    const before = captureViewState(get());
    const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toShow.has(h)) };
    get().pushOp(viewStateOp(before, after));
    set({ hiddenIds: hiddenIds.filter((h) => !toShow.has(h)), autoHiddenIds: autoHiddenIds.filter((h) => !toShow.has(h)), graphVersion: get().graphVersion + 1 });
  },

  showAll: () => {
    const before = captureViewState(get());
    if (before.hiddenIds.length === 0) return;
    const after = { ...before, hiddenIds: [] };
    get().pushOp(viewStateOp(before, after));
    set((s) => ({ hiddenIds: [], autoHiddenIds: [], revealedRootIds: [], graphVersion: s.graphVersion + 1 }));
  },

  revealSubtree: (id) => {
    const { revealedRootIds } = get();
    // Reveal ancestors first so the folder is reachable
    get().showAncestors(id);
    // Then reveal the subtree
    get().showSubtree(id);
    set({ revealedRootIds: [...new Set([...revealedRootIds, id])] });
    // Re-apply auto-hide so folders with >10 children underneath stay hidden,
    // while the explicitly-revealed root is protected from being re-hidden.
    get().autoHideLargeFolders();
  },

  setMaxDisplayDepth: (maxDepth) => {
    const { nodes, hiddenIds, direction, edges, searchQuery, graphVersion, maxDisplayDepth: oldMaxDepth, revealedFromHidden } = get();
    const before = captureViewState(get());
    // Recompute depth-hidden from scratch
    const depthHidden = new Set(computeDisplayDepthHiddenIds(nodes, maxDepth));
    // When depth increases, reveal nodes that were hidden by the old depth limit
    const oldDepthHidden = new Set(computeDisplayDepthHiddenIds(nodes, oldMaxDepth));
    // Keep only existing hidden ids that are within the new depth AND were not hidden by old depth (manual/auto hides)
    const hiddenSet = new Set(hiddenIds);
    const revealedSet = new Set(revealedFromHidden);
    const parentMap = new Map<string, string>();
    for (const e of edges) parentMap.set(e.target, e.source);
    const kept = hiddenIds.filter((id) => {
      if (depthHidden.has(id)) return false;
      const depth = nodes.find((n) => n.id === id)?.data.depth ?? 0;
      if (maxDepth > 0 && depth > maxDepth) return false;
      // If this node was hidden by old depth limit and is now within new limit, reveal it
      if (oldDepthHidden.has(id)) {
        // Check if any ancestor was hidden by non-depth reasons (manual/auto-hide)
        let ancestorId = parentMap.get(id);
        while (ancestorId) {
          if (revealedSet.has(ancestorId) || (hiddenSet.has(ancestorId) && !oldDepthHidden.has(ancestorId))) {
            // Ancestor was hidden by manual/auto-hide, not depth → keep this node hidden
            return true;
          }
          ancestorId = parentMap.get(ancestorId);
        }
        // All hidden ancestors were depth-hidden → reveal
        return false;
      }
      return true;
    });
    // Re-apply large-folder auto-hide since visibility changed
    const largeHidden = computeLargeFolderHiddenIds(nodes, edges, get().autoHideThreshold, new Set(get().revealedRootIds));
    const mergedIds = [...new Set([...depthHidden, ...kept, ...largeHidden])];
    const excludeFromLayout = mergedIds.length > 0 ? new Set(mergedIds) : undefined;
    const laid = layoutGraphSync(nodes, edges, direction, { excludeFromLayout });
    const searched = applySearchInternal(laid, searchQuery, get().categoryFilter);
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
    // reconcileAutoHide reveals any autoHiddenIds entry that falls out of the
    // target set. When Include File Nodes is off, file nodes must stay hidden
    // regardless of the auto-hide calculation — re-hide them.
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
    // reconcileAutoHide reveals any autoHiddenIds entry that falls out of the
    // target set. When Include File Nodes is off, file nodes must stay hidden
    // regardless of the auto-hide calculation — re-hide them.
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

  connect: (source, target) => {
    get().connectNodes({ source, target });
  },

  toggleCollapse: (id) => {
    const { nodes, searchQuery } = get();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const wasCollapsed = node.data.collapsed ?? false;
    get().pushOp({ type: "toggle-collapse", nodeId: id, wasCollapsed });
    const newNodes = nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, collapsed: !wasCollapsed } } : n);
    set({ nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
    setTimeout(() => get().relayout(), 50);
  },

  collapseAll: () => {
    const { nodes, searchQuery } = get();
    const changes = nodes
      .filter((n) => n.data.type === "folder")
      .map((n) => ({ nodeId: n.id, wasCollapsed: !!n.data.collapsed, willCollapse: true }));
    const newNodes = nodes.map((n) => n.data.type === "folder" ? { ...n, data: { ...n.data, collapsed: true } } : n);
    get().pushOp({ type: "collapse-batch", changes });
    set({ nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
    setTimeout(() => get().relayout(), 50);
  },

  expandAll: () => {
    const { nodes, searchQuery } = get();
    const changes = nodes.map((n) => ({ nodeId: n.id, wasCollapsed: !!n.data.collapsed, willCollapse: false }));
    const newNodes = nodes.map((n) => ({ ...n, data: { ...n.data, collapsed: false } }));
    get().pushOp({ type: "collapse-batch", changes });
    set({ nodes: applySearchInternal(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
    setTimeout(() => get().relayout(), 50);
  },

  removeNode: (id) => {
    get().deleteNodes([id]);
  },

  removeSelected: () => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.length > 0) get().deleteNodes(selectedNodeIds);
  },

  reset: () => {
    fsHandleStore.clear();
    set({
      nodes: [], edges: [], past: [], future: [], selectedNodeIds: [],
      searchQuery: "", categoryFilter: null, categoryHiddenIds: [], hiddenIds: [], renamingId: null, clipboard: null,
      graphVersion: 0, revealedRootIds: [], autoHiddenIds: [],
      revealedFromHidden: [], localRootPath: null,
    });
  },
});

function applySearchInternal(
  nodes: FewerNode[],
  query: string,
  _categoryFilter?: FileCategory | null,
): FewerNode[] {
  if (!query.trim()) {
    return nodes.map((n) => ({
      ...n,
      data: { ...n.data, highlighted: false, dimmed: false },
    }));
  }
  const q = query.toLowerCase();
  return nodes.map((n) => {
    const matches =
      n.data.label.toLowerCase().includes(q) ||
      (n.data.extension ?? "").toLowerCase().includes(q);
    return {
      ...n,
      data: { ...n.data, highlighted: matches, dimmed: !matches },
    };
  });
}