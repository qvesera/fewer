"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { FewerNode, FewerEdge, HistoryOp } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import { categorizeByExtension, getFileExtension } from "@/lib/fewer/categorize";
import { layoutGraph, layoutGraphSync } from "@/lib/fewer/layout";
import { validateConnection } from "@/lib/fewer/validation";
import { fsHandleStore } from "@/lib/fewer/types";

const DEFAULT_AUTO_HIDE_THRESHOLD = 10;

/**
 * Pure helper: ids of nodes deeper than `maxDepth`.
 */
function computeDisplayDepthHiddenIds(nodes: FewerNode[], maxDepth: number): string[] {
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
    return bLabel.localeCompare(aLabel);
  });
}

export type GraphSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    nodes: FewerNode[];
    edges: FewerEdge[];
    dataSource: string | null;
    graphVersion: number;
    hiddenPanelExpandTrigger: number;
    clipboard: GraphState["clipboard"];

    setGraph: (nodes: FewerNode[], edges: FewerEdge[], pushHistory?: boolean, hiddenFileIds?: string[]) => void;
    setDataSource: (v: string | null) => void;
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
    renameNode: (id: string, newLabel: string) => void;
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
    revealSubtree: (id: string) => void;
    autoHideThreshold: number;
    setAutoHideThreshold: (threshold: number) => void;
  }
>;

export const createGraphSlice: GraphSliceCreator = (set, get) => ({
  nodes: [],
  edges: [],
  dataSource: null,
  graphVersion: 0,
  hiddenPanelExpandTrigger: 0,
  clipboard: null,
  maxDisplayDepth: 6,
  autoHideCount: 0,
  revealedRootIds: [],
      revealedFromHidden: [],
  autoHideThreshold: DEFAULT_AUTO_HIDE_THRESHOLD,

  setDataSource: (v) => set({ dataSource: v }),

  triggerHiddenPanelExpand: () => {
    set((s) => ({ hiddenPanelExpandTrigger: s.hiddenPanelExpandTrigger + 1 }));
  },

  setGraph: (nodes, edges, pushHistory = true, hiddenFileIds) => {
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
    const strokeDasharray = state.edgeStrokeStyle === "dashed" ? "8 4" : state.edgeStrokeStyle === "dotted" ? "2 4" : undefined;
    const styledEdges = edges.map((e) => ({
      ...e,
      type: edgeType,
      animated: state.edgeAnimated,
      style: { ...e.style, strokeWidth: state.edgeWidth, ...(strokeDasharray ? { strokeDasharray } : {}) },
    }));
    // Fresh import resets reveal memory
    // Auto-hide children of folders with many children so big graphs stay fast
    const autoHideIds = computeLargeFolderHiddenIds(nodes, edges, state.autoHideThreshold, new Set());
    // Hide nodes beyond the max display depth
    const displayDepthIds = computeDisplayDepthHiddenIds(nodes, state.maxDisplayDepth);
    idsToHide = [...new Set([...idsToHide, ...autoHideIds, ...displayDepthIds])];
    const excludeFromLayoutFinal = idsToHide.length > 0 ? new Set(idsToHide) : undefined;
    const laidFinal = layoutGraphSync(styledNodes, edges, state.direction, { excludeFromLayout: excludeFromLayoutFinal });
    const searchedFinal = applySearchInternal(laidFinal, state.searchQuery);
    const sortedEdges = sortEdges(styledEdges, searchedFinal);
    // Count auto-hidden large-folder children (not from file hiding or depth)
    const baseHidden = new Set(hiddenFileIds ?? []);
    const autoHideCount = autoHideIds.filter((id) => !baseHidden.has(id)).length;
    set({ nodes: searchedFinal, edges: sortedEdges, hiddenIds: idsToHide, graphVersion: state.graphVersion + 1, autoHideCount, revealedRootIds: [] });
  },

  relayout: () => {
    const { nodes, edges, direction, searchQuery, hiddenIds, graphVersion } = get();
    if (nodes.length === 0) return;
    const excludeFromLayout = (hiddenIds as string[]).length > 0 ? new Set(hiddenIds as string[]) : undefined;
    const laid = layoutGraphSync(nodes, edges, direction, { excludeFromLayout });
    const searched = applySearchInternal(laid, searchQuery);
    set({ nodes: searched, graphVersion: graphVersion + 1 });
  },

  applySearch: () => {
    const { nodes, searchQuery, graphVersion } = get();
    set({ nodes: applySearchInternal(nodes, searchQuery), graphVersion: graphVersion + 1 });
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
    // Store only the removed subtree (not the full array) for undo
    if (removedNodes.length > 0) {
      get().pushOp({ type: "bulk-import", nodes: removedNodes, edges: removedEdges });
    }
    set({ nodes: applySearchInternal(newNodes, searchQuery), edges: newEdges, selectedNodeIds: [], graphVersion: get().graphVersion + 1 });
  },

  renameNode: (id, newLabel) => {
    const { nodes, edges, searchQuery } = get();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const oldLabel = node.data.label;
    const newExt = node.data.type === "file" ? getFileExtension(trimmed) : "";
    const newLabelOnly = newExt ? trimmed.slice(0, -(newExt.length + 1)) : trimmed;
    const oldFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
    const newFullLabel = newExt ? `${newLabelOnly}.${newExt}` : newLabelOnly;
    const parentEdge = edges.find((e) => e.target === id);
    const parent = parentEdge ? nodes.find((n) => n.id === parentEdge.source) : null;
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
    set({ nodes: applySearchInternal(newNodes, searchQuery), renamingId: null, graphVersion: get().graphVersion + 1 });
  },

  _makeCopyNode: (sourceNode, parentId) => {
    const { nodes, edges, nodeWidth, nodeHeight } = get();
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
    const siblingLabels = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label));
    let copyLabel = `${sourceNode.data.label} copy`;
    if (siblingLabels.has(copyLabel)) { let counter = 2; while (siblingLabels.has(`${sourceNode.data.label} copy ${counter}`)) counter++; copyLabel = `${sourceNode.data.label} copy ${counter}`; }
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
    const siblingLabels = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label));
    let copyLabel = `${sourceNode.data.label} copy`;
    if (siblingLabels.has(copyLabel)) { let counter = 2; while (siblingLabels.has(`${sourceNode.data.label} copy ${counter}`)) counter++; copyLabel = `${sourceNode.data.label} copy ${counter}`; }
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
    set({ nodes: applySearchInternal([...updatedNodes, ...newNodes], searchQuery), edges: mergedEdges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
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
    set({ nodes: applySearchInternal([...updatedNodes, ...newNodes], searchQuery), edges: mergedEdges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
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
        const parentSiblingIds = effectiveParentId ? edges.filter((e) => e.source === effectiveParentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
        const parentSiblingLabels = new Set(nodes.filter((n) => parentSiblingIds.includes(n.id)).map((n) => n.data.label));
        if (parentSiblingLabels.has(orig.data.label)) { let cl = `${stem} copy`; if (parentSiblingLabels.has(cl)) { let counter = 2; while (parentSiblingLabels.has(`${stem} copy ${counter}`)) counter++; cl = `${stem} copy ${counter}`; } copyLabel = cl; }
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
    set({ nodes: applySearchInternal([...updatedNodes, ...newNodes], searchQuery), edges: mergedEdges, selectedNodeIds: selectId ? [selectId] : [], graphVersion: get().graphVersion + 1 });
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
    // Store only the removed subtree for undo
    get().pushOp({ type: "bulk-import", nodes: removedNodes, edges: removedEdges });
    set({ nodes: applySearchInternal(filteredNodes, searchQuery), edges: filteredEdges, selectedNodeIds: [], graphVersion: get().graphVersion + 1 });
  },

  addNode: (parentId, label, type) => {
    const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
    const parent = nodes.find((n) => n.id === parentId);
    const ext = type === "file" ? getFileExtension(label) : "";
    const baseLabel = ext ? label.slice(0, -(ext.length + 1)) : label;
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : [];
    const siblingLabels = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label));
    let displayLabel = baseLabel;
    if (siblingLabels.has(displayLabel)) {
      let counter = 1;
      while (siblingLabels.has(`${baseLabel} (${counter})`)) counter++;
      displayLabel = `${baseLabel} (${counter})`;
    }
    const finalLabel = ext ? `${displayLabel}.${ext}` : displayLabel;
    const newPath = parent ? `${parent.data.path}/${finalLabel}` : finalLabel;
    const newNode: FewerNode = { id: `n-new-${Date.now()}`, type, position: parent ? { x: parent.position.x + 30, y: parent.position.y + 80 } : { x: 0, y: 0 }, data: { label: displayLabel, path: newPath, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: parent ? (parent.data.depth ?? 0) + 1 : 0, isRoot: parentId === null }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newEdge: { id: string; source: string; target: string; type?: string } | null = parentId ? { id: `e-${parentId}-${newNode.id}`, source: parentId, target: newNode.id, type: edgeTypeFromStyle(get().edgeStyle) } : null;
    const newEdgesUnordered = newEdge ? [...edges, newEdge] : edges;
    const newNodes = [...nodes, newNode];
    const sorted = sortEdges(newEdgesUnordered, newNodes);
    // Targeted add-node op — stores only the new node, not the full array
    get().pushOp({ type: "add-node", node: newNode, edge: newEdge as FewerEdge | null });
    set({ nodes: applySearchInternal(newNodes, searchQuery), edges: sorted, graphVersion: get().graphVersion + 1 });
    get().relayout();
    return newNode.id;
  },

  addStandaloneNode: (label, type, position) => {
    const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
    const trimmed = label.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    const ext = type === "file" ? getFileExtension(trimmed) : "";
    const baseLabel = ext ? trimmed.slice(0, -(ext.length + 1)) : trimmed;
    const rootNodeLabels = new Set(nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.data.label));
    let displayLabel = baseLabel;
    if (rootNodeLabels.has(displayLabel)) {
      let counter = 1;
      while (rootNodeLabels.has(`${baseLabel} (${counter})`)) counter++;
      displayLabel = `${baseLabel} (${counter})`;
    }
    const finalLabel = ext ? `${displayLabel}.${ext}` : displayLabel;
    const newNode: FewerNode = { id: `n-${uuid().slice(0, 8)}`, type, position, data: { label: displayLabel, path: finalLabel, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: 0, isRoot: true }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newNodes = [...nodes, newNode];
    // Targeted add-node op — stores only the new node
    get().pushOp({ type: "add-node", node: newNode, edge: null });
    set({ nodes: applySearchInternal(newNodes, searchQuery), graphVersion: get().graphVersion + 1 });
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
    // Store the new edge + changed nodes for undo
    get().pushOp({ type: "bulk-import", nodes: updatedNodes.filter((n) => changedNodeIds.includes(n.id)), edges: [newEdge] });
    const nextEdges = sortEdges([...edges, newEdge], updatedNodes);
    set({ nodes: applySearchInternal(updatedNodes, searchQuery), edges: nextEdges, graphVersion: get().graphVersion + 1 });
    return { ok: true };
  },

  removeEdgesFromHandle: (nodeId, handleType) => {
    const { nodes, edges, searchQuery } = get();
    const filteredEdges = edges.filter((e) => { if (handleType === "source") return e.source !== nodeId; if (handleType === "target") return e.target !== nodeId; return true; });
    if (filteredEdges.length === edges.length) return;
    const removedEdges = edges.filter((e) => !filteredEdges.includes(e));
    get().pushOp({ type: "bulk-import", nodes: [], edges: removedEdges });
    set({ edges: filteredEdges, graphVersion: get().graphVersion + 1 });
  },

  deleteEdges: (ids) => {
    const { nodes, edges, searchQuery } = get();
    const idSet = new Set(ids);
    const filtered = edges.filter((e) => !idSet.has(e.id));
    if (filtered.length === edges.length) return;
    const removedEdges = edges.filter((e) => idSet.has(e.id));
    get().pushOp({ type: "bulk-import", nodes: [], edges: removedEdges });
    set({ edges: filtered, graphVersion: get().graphVersion + 1 });
  },

  hideNode: (id) => {
    const { hiddenIds, edges, selectedNodeIds, revealedRootIds } = get();
    if (hiddenIds.includes(id)) return;
    const toHide = new Set([id]); const queue = [id];
    while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } } }
    set({
      hiddenIds: [...hiddenIds, ...toHide],
      selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)),
      revealedRootIds: revealedRootIds.filter((r) => !toHide.has(r)),
      graphVersion: get().graphVersion + 1,
    });
  },

  hideNodes: (ids) => {
    const { hiddenIds, edges, selectedNodeIds, revealedRootIds } = get();
    const toHide = new Set(ids);
    for (const id of ids) { const queue = [id]; while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } } } }
    set({
      hiddenIds: [...hiddenIds, ...toHide],
      selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)),
      revealedRootIds: revealedRootIds.filter((r) => !toHide.has(r)),
    });
    setTimeout(() => get().relayout(), 50);
  },

  showNode: (id) => { set((s) => ({ hiddenIds: s.hiddenIds.filter((h) => h !== id) })); get().relayout(); },

  showAncestors: (id) => {
    const { hiddenIds, edges, revealedFromHidden } = get();
    if (!hiddenIds.includes(id)) return;
    const hiddenSet = new Set(hiddenIds);
    const revealedSet = new Set(revealedFromHidden);
    const parentMap = new Map<string, string>();
    for (const e of edges) parentMap.set(e.target, e.source);
    const toShow = new Set<string>([id]); let currentId: string | undefined = parentMap.get(id);
    while (currentId && hiddenSet.has(currentId)) { toShow.add(currentId); currentId = parentMap.get(currentId); }
    set({ hiddenIds: hiddenIds.filter((h) => !toShow.has(h)), revealedFromHidden: [...new Set([...revealedFromHidden, ...toShow])] }); get().relayout();
  },

  showSubtree: (id) => {
    const { hiddenIds, edges } = get();
    const toShow = new Set([id]); const queue = [id];
    while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && hiddenIds.includes(e.target)) { toShow.add(e.target); queue.push(e.target); } } }
        set({ hiddenIds: hiddenIds.filter((h) => !toShow.has(h)) }); get().relayout();
  },

  showAll: () => set((s) => ({ hiddenIds: [], revealedRootIds: [], graphVersion: s.graphVersion + 1 })),

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
      if (depth > maxDepth) return false;
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
    const searched = applySearchInternal(laid, searchQuery);
    set({
      maxDisplayDepth: maxDepth,
      hiddenIds: mergedIds,
      nodes: searched,
      graphVersion: graphVersion + 1,
    });
  },

  autoHideLargeFolders: (threshold?) => {
    const { nodes, edges, hiddenIds, revealedRootIds, autoHideThreshold } = get();
    const thresholdValue = threshold ?? autoHideThreshold;
    const hiddenSet = new Set(hiddenIds);
    const toHide = computeLargeFolderHiddenIds(
      nodes.filter((n) => !hiddenSet.has(n.id)),
      edges,
      thresholdValue,
      new Set(revealedRootIds),
    );
    const newIds = toHide.filter((id) => !hiddenSet.has(id));
    if (newIds.length === 0) return;
    get().hideNodes(newIds);
  },

  setAutoHideThreshold: (threshold) => {
    set({ autoHideThreshold: threshold });
    get().autoHideLargeFolders(threshold);
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
    set({ nodes: applySearchInternal(newNodes, searchQuery), graphVersion: get().graphVersion + 1 });
    setTimeout(() => get().relayout(), 50);
  },

  collapseAll: () => {
    const { nodes, searchQuery } = get();
    const newNodes = nodes.map((n) => n.data.type === "folder" ? { ...n, data: { ...n.data, collapsed: true } } : n);
    set({ nodes: applySearchInternal(newNodes, searchQuery), graphVersion: get().graphVersion + 1 });
    setTimeout(() => get().relayout(), 50);
  },

  expandAll: () => {
    const { nodes, searchQuery } = get();
    const newNodes = nodes.map((n) => ({ ...n, data: { ...n.data, collapsed: false } }));
    set({ nodes: applySearchInternal(newNodes, searchQuery), graphVersion: get().graphVersion + 1 });
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
      searchQuery: "", hiddenIds: [], renamingId: null, clipboard: null,
      graphVersion: 0, revealedRootIds: [],
      revealedFromHidden: [],
    });
  },
});

function applySearchInternal(
  nodes: FewerNode[],
  query: string,
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