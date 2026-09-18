"use client";
// Nodes bodies part 1: clipboard + delete + rename. Verbatim from graphSlice.ts.
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { categorizeByExtension, getFileExtension } from "@/lib/fewer/categorize";
import { getDescendants } from "@/lib/fewer/validation";
import { captureViewState } from "../historySlice";
import { applySearchHighlight } from "../searchHighlight";
import { fullName } from "@/lib/fewer/nodeName";
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import { mergeImportedGraph } from "@/lib/fewer/importMerge";
import { edgeTypeFromStyle } from "@/lib/fewer/types";
import { sortEdges } from "@/lib/fewer/importMerge";
import type { HistoryOp } from "@/lib/fewer/types";

export type NodesSliceCreator = StateCreator<GraphState, [], [], {
  setClipboard: GraphState["setClipboard"];
  clearClipboard: GraphState["clearClipboard"];
  _makeCopyNode: GraphState["_makeCopyNode"];
  _duplicateSubtree: GraphState["_duplicateSubtree"];
  duplicateNodeUnderParent: GraphState["duplicateNodeUnderParent"];
  pasteNode: GraphState["pasteNode"];
  pasteFromClipboard: GraphState["pasteFromClipboard"];
  duplicateNode: GraphState["duplicateNode"];
  moveNode: GraphState["moveNode"];
  _findFreePositionForBounds: GraphState["_findFreePositionForBounds"];
  _findCreationPosition: GraphState["_findCreationPosition"];
  deleteNodes: GraphState["deleteNodes"];
  renameNode: GraphState["renameNode"];
  renameNodes: GraphState["renameNodes"];
  addNode: GraphState["addNode"];
  addStandaloneNode: GraphState["addStandaloneNode"];
  addParentNode: GraphState["addParentNode"];
}>;

export const createNodesSlice: NodesSliceCreator = (set, get) => ({
  clipboard: null,
  setClipboard: (mode, nodeIds) => {
    const { nodes, edges } = get();
    const allIds = new Set([...nodeIds, ...nodeIds.flatMap((id) => getDescendants(id, edges))]);
    const subtreeNodes = nodes.filter((n) => allIds.has(n.id));
    const subtreeEdges = edges.filter((e) => allIds.has(e.source) && allIds.has(e.target));
    set({ clipboard: { mode, nodeIds: [...nodeIds], subtreeNodes, subtreeEdges } });
  },
  clearClipboard: () => set({ clipboard: null }),
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
    const allIds = new Set([id, ...getDescendants(id, edges)]);
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
    get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
    const merged = mergeImportedGraph(nodes, edges, newNodes, newEdges);
    set({ nodes: applySearchHighlight(merged.nodes, searchQuery, get().categoryFilter), edges: merged.edges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
  },
  pasteNode: (id, parentFolderId?) => {
    const { nodes, edges, searchQuery } = get();
    let effectiveParentId: string | null = null;
    if (parentFolderId) { const parent = nodes.find((n) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, effectiveParentId);
    if (!newRoot) return;
    get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
    const merged = mergeImportedGraph(nodes, edges, newNodes, newEdges);
    set({ nodes: applySearchHighlight(merged.nodes, searchQuery, get().categoryFilter), edges: merged.edges, selectedNodeIds: [newRoot.id], graphVersion: get().graphVersion + 1 });
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
    get().pushOp({ type: "bulk-import", nodes: newNodes, edges: newEdges });
    const merged = mergeImportedGraph(nodes, edges, newNodes, newEdges);
    set({ nodes: applySearchHighlight(merged.nodes, searchQuery, get().categoryFilter), edges: merged.edges, selectedNodeIds: selectId ? [selectId] : [], graphVersion: get().graphVersion + 1 });
  },
  duplicateNode: (id) => { get().duplicateNodeUnderParent(id); },
  moveNode: (id) => {
    const { nodes, edges, searchQuery } = get();
    const toRemove = new Set([id, ...getDescendants(id, edges)]);
    const removedNodes = nodes.filter((n) => toRemove.has(n.id));
    const removedEdges = edges.filter((e) => toRemove.has(e.source) && toRemove.has(e.target));
    const filteredNodes = nodes.filter((n) => !toRemove.has(n.id));
    const filteredEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
    if (removedNodes.length > 0) {
      const rootEdge = edges.find((e) => e.target === id) ?? null;
      const before = captureViewState(get());
      const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toRemove.has(h)) };
      get().pushOp({ type: "remove-subtree", node: removedNodes[0], edge: rootEdge, children: removedNodes.slice(1), childEdges: removedEdges, before, after });
    }
    set({ nodes: applySearchHighlight(filteredNodes, searchQuery, get().categoryFilter), edges: filteredEdges, selectedNodeIds: [], graphVersion: get().graphVersion + 1 });
  },
  _findFreePositionForBounds: (baseX, baseY, boundsWidth, boundsHeight) => {
    const { nodes, nodeWidth, nodeHeight } = get(); const PADDING = 40; let x = baseX; let y = baseY; let attempts = 0;
    while (attempts < 50) {
      const overlapping = nodes.some((n) => { const nw = n.style?.width ?? nodeWidth; const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 60; return !(x + boundsWidth + PADDING < n.position.x || x > n.position.x + Number(nw) + PADDING || y + boundsHeight + PADDING < n.position.y || y > n.position.y + Number(nh) + PADDING); });
      if (!overlapping) break; x += boundsWidth + PADDING; if (x > baseX + boundsWidth * 3) { x = baseX; y += boundsHeight + PADDING; } attempts++;
    }
    return { x, y };
  },
  _findCreationPosition: (baseX, baseY, boundsW, boundsH, originX, originY) => {
    const { nodes, nodeWidth, nodeHeight, hiddenIds, autoHiddenIds } = get();
    const PADDING = 12;
    const hiddenSet = new Set([...hiddenIds, ...autoHiddenIds]);
    const isVisible = (n: any) => !hiddenSet.has(n.id);
    const nodeDims = (n: any) => {
      const nw = n.style?.width ?? nodeWidth;
      const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 58;
      return { nw, nh };
    };
    const aabbOverlap = (x: number, y: number, nx: number, ny: number, nw: number, nh: number) =>
      !(x + boundsW + PADDING < nx || x > nx + nw + PADDING || y + boundsH + PADDING < ny || y > ny + nh + PADDING);
    const collides = (x: number, y: number) => nodes.some((n) => {
      if (!isVisible(n)) return false;
      const { nw, nh } = nodeDims(n);
      return aabbOverlap(x, y, n.position.x, n.position.y, nw, nh);
    });
    if (!collides(baseX, baseY)) return { x: baseX, y: baseY };
    const hit = nodes.find((n) => {
      if (!isVisible(n)) return false;
      const { nw, nh } = nodeDims(n);
      return aabbOverlap(baseX, baseY, n.position.x, n.position.y, nw, nh);
    });
    if (hit) {
      const hitCx = hit.position.x + (nodeDims(hit).nw) / 2;
      const hitCy = hit.position.y + (nodeDims(hit).nh) / 2;
      const cx = baseX + boundsW / 2, cy = baseY + boundsH / 2;
      let dx = originX != null ? cx - originX : 0;
      let dy = originY != null ? cy - originY : 1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= len; dy /= len;
      for (let s = 1; s <= 15; s++) {
        const nx = baseX + dx * s * 20, ny = baseY + dy * s * 20;
        if (!collides(nx, ny)) return { x: nx, y: ny };
      }
    }
    let x = baseX, y = baseY, attempts = 0;
    while (attempts < 50) {
      if (!collides(x, y)) return { x, y };
      x += boundsW + PADDING;
      if (x > baseX + boundsW * 3) { x = baseX; y += boundsH + PADDING; }
      attempts++;
    }
    return { x, y };
  },
  deleteNodes: (ids) => {
    const { nodes, edges, searchQuery } = get();
    const toRemove = new Set([...ids, ...ids.flatMap((id) => getDescendants(id, edges))]);
    const removedNodes = nodes.filter((n) => toRemove.has(n.id));
    const removedEdges = edges.filter((e) => toRemove.has(e.source) && toRemove.has(e.target));
    const newNodes = nodes.filter((n) => !toRemove.has(n.id));
    const newEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
    if (removedNodes.length > 0) {
      const rootEdge = edges.find((e) => e.target === ids[0]) ?? null;
      const before = captureViewState(get());
      const after = { ...before, hiddenIds: before.hiddenIds.filter((h) => !toRemove.has(h)) };
      get().pushOp({ type: "remove-subtree", node: removedNodes[0], edge: rootEdge, children: removedNodes.slice(1), childEdges: removedEdges, before, after });
    }
    set((s) => ({
      nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter),
      edges: newEdges,
      selectedNodeIds: [],
      hiddenIds: s.hiddenIds.filter((h) => !toRemove.has(h)),
      autoHiddenIds: s.autoHiddenIds.filter((h) => !toRemove.has(h)),
      revealedRootIds: s.revealedRootIds.filter((h) => !toRemove.has(h)),
      independentlyHiddenIds: s.independentlyHiddenIds.filter((h) => !toRemove.has(h)),
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
    const oldFull = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
    const newFull = newExt ? `${newLabelOnly}.${newExt}` : newLabelOnly;
    if (newFull.toLowerCase() === oldFull.toLowerCase()) { set({ renamingId: null }); return false; }
    const parentEdge = edges.find((e) => e.target === id);
    const parent = parentEdge ? nodes.find((n) => n.id === parentEdge.source) : null;
    const sibIds = parentEdge
      ? edges.filter((e) => e.source === parentEdge.source && e.target !== id).map((e) => e.target)
      : nodes.filter((n) => !edges.some((e) => e.target === n.id) && n.id !== id).map((n) => n.id);
    const clash = sibIds.some((sid) => {
      const s = nodes.find((n) => n.id === sid);
      if (!s) return false;
      const sFull = s.data.extension ? `${s.data.label}.${s.data.extension}` : s.data.label;
      return sFull.toLowerCase() === newFull.toLowerCase();
    });
    if (clash) { set({ renamingId: null }); return false; }
    const parentPath = parent ? parent.data.path : "";
    const oldPrefix = parent ? `${parentPath}/${oldFull}` : oldFull;
    const newPrefix = parent ? `${parentPath}/${newFull}` : newFull;
    const isFolder = node.data.type === "folder";
    const descIds = new Set(isFolder ? getDescendants(id, edges) : []);
    const newNodes = nodes.map((n) => {
      if (n.id === id) return { ...n, data: { ...n.data, label: newLabelOnly, path: newPrefix, extension: newExt, category: newExt ? categorizeByExtension(newExt) : undefined } };
      if (isFolder && descIds.has(n.id) && n.data.path.startsWith(oldPrefix)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldPrefix, newPrefix) } };
      return n;
    });
    get().pushOp({ type: "rename", nodeId: id, oldLabel, newLabel: newLabelOnly });
    set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), renamingId: null, graphVersion: get().graphVersion + 1 });
    return true;
  },
  renameNodes: (ids, transform) => {
    const { nodes, edges, searchQuery } = get();
    let nextNodes = nodes;
    const ops: HistoryOp[] = [];
    ids.forEach((id, index) => {
      const node = nextNodes.find((n) => n.id === id);
      if (!node) return;
      const raw = transform(node, index);
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (!trimmed) return;
      const newExt = node.data.type === "file" ? getFileExtension(trimmed) : "";
      const newLabelOnly = newExt ? trimmed.slice(0, -(newExt.length + 1)) : trimmed;
      const oldFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
      const newFullLabel = newExt ? `${newLabelOnly}.${newExt}` : newLabelOnly;
      if (newFullLabel.toLowerCase() === oldFullLabel.toLowerCase()) return;
      const parentEdge = edges.find((e) => e.target === id);
      const siblingIds = parentEdge
        ? edges.filter((e) => e.source === parentEdge.source && e.target !== id).map((e) => e.target)
        : nextNodes.filter((n) => !edges.some((e) => e.target === n.id) && n.id !== id).map((n) => n.id);
      const siblingHasLabel = siblingIds.some((sid) => {
        const s = nextNodes.find((n) => n.id === sid);
        if (!s) return false;
        const sFull = s.data.extension ? `${s.data.label}.${s.data.extension}` : s.data.label;
        return sFull.toLowerCase() === newFullLabel.toLowerCase();
      });
      if (siblingHasLabel) return;
      const parentPath = parentEdge ? (nextNodes.find((n) => n.id === parentEdge.source)?.data.path ?? "") : "";
      const oldPathPrefix = parentEdge ? `${parentPath}/${oldFullLabel}` : oldFullLabel;
      const newPathPrefix = parentEdge ? `${parentPath}/${newFullLabel}` : newFullLabel;
      const isFolder = node.data.type === "folder";
      const descendantIds = new Set(isFolder ? getDescendants(id, edges) : []);
      nextNodes = nextNodes.map((n) => {
        if (n.id === id) return { ...n, data: { ...n.data, label: newLabelOnly, path: newPathPrefix, extension: newExt, category: newExt ? categorizeByExtension(newExt) : undefined } };
        if (isFolder && descendantIds.has(n.id) && n.data.path.startsWith(oldPathPrefix)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldPathPrefix, newPathPrefix) } };
        return n;
      });
      ops.push({ type: "rename", nodeId: id, oldLabel: node.data.label, newLabel: newLabelOnly });
    });
    if (ops.length === 0) {
      set({ renamingId: null });
      return 0;
    }
    get().pushOp(ops);
    set({ nodes: applySearchHighlight(nextNodes, searchQuery, get().categoryFilter), renamingId: null, graphVersion: get().graphVersion + 1 });
    return ops.length;
  },
  addNode: (parentId, label, type, position) => {
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
    const nh = type === "folder" ? nodeHeight : 58;
    const rawPos = position
      ? { x: position.x - nodeWidth / 2, y: position.y - nh / 2 }
      : parent ? { x: parent.position.x + 30, y: parent.position.y + 80 } : { x: 0, y: 0 };
    const originCx = parent ? parent.position.x + nodeWidth / 2 : rawPos.x + nodeWidth / 2;
    const originCy = parent ? parent.position.y + nodeHeight / 2 : rawPos.y + nh / 2;
    const resolvedPos = position
      ? get()._findCreationPosition(rawPos.x, rawPos.y, nodeWidth, nh, originCx, originCy)
      : get()._findFreePositionForBounds(rawPos.x, rawPos.y, nodeWidth, nh);
    const newNode: FewerNode = { id: `n-new-${Date.now()}`, type, position: resolvedPos, data: { label: nodeLabel, path: newPath, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: parent ? (parent.data.depth ?? 0) + 1 : 0, isRoot: parentId === null }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newEdge: { id: string; source: string; target: string; type?: string } | null = parentId ? { id: `e-${parentId}-${newNode.id}`, source: parentId, target: newNode.id, type: edgeTypeFromStyle(get().edgeStyle) } : null;
    const newEdgesUnordered = newEdge ? [...edges, newEdge] : edges;
    const newNodes = [...nodes, newNode];
    const sorted = sortEdges(newEdgesUnordered, newNodes);
    get().pushOp({ type: "add-node", node: newNode, edge: newEdge as FewerEdge | null });
    set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), edges: sorted, graphVersion: get().graphVersion + 1 });
    const leaf = get().activeLeafId;
    if (leaf && get().viewSettings[leaf]?.positions) get().setNodePositionForLeaf(leaf, newNode.id, resolvedPos);
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
    const nh = type === "folder" ? nodeHeight : 58;
    const resolvedPos = get()._findCreationPosition(position.x, position.y, nodeWidth, nh);
    const newNode: FewerNode = { id: `n-${uuid().slice(0, 8)}`, type, position: resolvedPos, data: { label: nodeLabel, path: finalLabel, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: 0, isRoot: true }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newNodes = [...nodes, newNode];
    get().pushOp({ type: "add-node", node: newNode, edge: null });
    set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
    return newNode.id;
  },
  addParentNode: (nodeId, label, position) => {
    const { nodes, edges, nodeWidth, nodeHeight, searchQuery } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { ok: false, reason: "Node not found." };
    const trimmed = label.trim() || "New Folder";
    const oldEdge = edges.find((e) => e.target === nodeId);
    const oldParent = oldEdge ? nodes.find((n) => n.id === oldEdge.source) : null;
    const siblingIds = oldParent ? edges.filter((e) => e.source === oldParent.id).map((e) => e.target) : null;
    const siblingFullNames = siblingIds
      ? new Set(nodes.filter((n) => n.id !== nodeId && siblingIds.includes(n.id)).map(fullName))
      : new Set(nodes.filter((n) => n.id !== nodeId && !edges.some((e) => e.target === n.id)).map(fullName));
    if (siblingFullNames.has(trimmed)) return { ok: false, reason: `A node named "${trimmed}" already exists here.` };
    const newPath = oldParent ? `${oldParent.data.path}/${trimmed}` : trimmed;
    const edgeType = edgeTypeFromStyle(get().edgeStyle);
    const rawPos = position
      ? { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 }
      : { x: node.position.x - 40, y: node.position.y - 120 };
    const originCx = node.position.x + nodeWidth / 2;
    const originCy = node.position.y + nodeHeight / 2;
    const resolvedPos = position
      ? get()._findCreationPosition(rawPos.x, rawPos.y, nodeWidth, nodeHeight, originCx, originCy)
      : get()._findFreePositionForBounds(rawPos.x, rawPos.y, nodeWidth, nodeHeight);
    const newNode: FewerNode = {
      id: `n-${uuid().slice(0, 8)}`, type: "folder",
      position: resolvedPos,
      data: { label: trimmed, path: newPath, type: "folder", size: 0, depth: oldParent ? (oldParent.data.depth ?? 0) + 1 : 0, isRoot: !oldParent },
      style: { width: nodeWidth, height: nodeHeight, minHeight: undefined },
    };
    const parentEdge: FewerEdge | null = oldParent ? { id: `e-${oldParent.id}-${newNode.id}`, source: oldParent.id, target: newNode.id, type: edgeType } : null;
    const childEdge: FewerEdge = { id: `e-${newNode.id}-${nodeId}`, source: newNode.id, target: nodeId, type: edgeType };
    const nodeFullLabel = node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label;
    const oldChildPath = node.data.path;
    const newChildPath = `${newPath}/${nodeFullLabel}`;
    const isFolder = node.data.type === "folder";
    const descendantIds = isFolder ? getDescendants(nodeId, edges) : [];
    const changedNodeIds = [nodeId, ...descendantIds];
    const prevPaths = changedNodeIds
      .map((nid) => ({ nodeId: nid, path: nodes.find((n) => n.id === nid)?.data.path ?? "" }))
      .filter((p) => p.path !== "");
    const nextPaths = changedNodeIds
      .map((nid) => {
        if (nid === nodeId) return { nodeId: nid, path: newChildPath };
        const d = nodes.find((n) => n.id === nid);
        return { nodeId: nid, path: d ? d.data.path.replace(oldChildPath, newChildPath) : "" };
      })
      .filter((p) => p.path !== "");
    const updatedNodes = nodes.map((n) => {
      if (n.id === nodeId) return { ...n, data: { ...n.data, path: newChildPath, isRoot: false } };
      if (descendantIds.includes(n.id) && n.data.path.startsWith(oldChildPath)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldChildPath, newChildPath) } };
      return n;
    });
    let nextEdges = oldEdge ? edges.filter((e) => e.id !== oldEdge.id) : edges;
    nextEdges = [...nextEdges, ...(parentEdge ? [parentEdge] : []), childEdge];
    nextEdges = sortEdges(nextEdges, [...updatedNodes, newNode]);
    const ops: HistoryOp[] = [{ type: "add-node", node: newNode, edge: parentEdge }];
    if (oldEdge) ops.push({ type: "remove-edges", edges: [oldEdge] });
    ops.push({ type: "connect", edge: childEdge, prevPaths, nextPaths });
    get().pushOp(ops);
    set({
      nodes: applySearchHighlight([...updatedNodes, newNode], searchQuery, get().categoryFilter),
      edges: nextEdges,
      graphVersion: get().graphVersion + 1,
      selectedNodeIds: [newNode.id],
    });
    const leaf = get().activeLeafId;
    if (leaf && get().viewSettings[leaf]?.positions) get().setNodePositionForLeaf(leaf, newNode.id, resolvedPos);
    return { ok: true, id: newNode.id };
  },
});
