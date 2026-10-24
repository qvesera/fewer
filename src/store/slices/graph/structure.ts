"use client";
// Structure bodies: edge ops + collapse + remove/reset moved verbatim.
import type { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { FewerEdge } from "@/lib/fewer/types";
import { v4 as uuid } from "uuid";
import { validateConnection, parentMapOf, ancestorChainOf, getDescendants } from "@/lib/fewer/validation";
import { fsHandleStore, edgeTypeFromStyle } from "@/lib/fewer/types";
import { sortEdges } from "@/lib/fewer/importMerge";
import type { HistoryOp } from "@/lib/fewer/types";
import { rewriteConnectionPaths } from "@/lib/fewer/pathRewrite";
import { applySearchHighlight } from "../searchHighlight";
import { unparentSubtree } from "./detach";

export type StructureSliceCreator = StateCreator<GraphState, [], [], {
  connectNodes: GraphState["connectNodes"];
  removeEdgesFromHandle: GraphState["removeEdgesFromHandle"];
  unparentNodes: GraphState["unparentNodes"];
  parentNodesTo: GraphState["parentNodesTo"];
  deleteEdges: GraphState["deleteEdges"];
  connect: GraphState["connect"];
  toggleCollapse: GraphState["toggleCollapse"];
  collapseAll: GraphState["collapseAll"];
  expandAll: GraphState["expandAll"];
  removeNode: GraphState["removeNode"];
  removeSelected: GraphState["removeSelected"];
  reset: GraphState["reset"];
}>;

export const createStructureSlice: StructureSliceCreator = (set, get) => ({
  connectNodes: (connection) => {
    const { nodes, edges, searchQuery } = get();
    if (!connection.source || !connection.target) return { ok: false, reason: "Missing source or target." };
    const result = validateConnection(connection.source, connection.target, nodes, edges);
    if (!result.ok) return result;
    const newEdge: FewerEdge = { id: `e-${connection.source}-${connection.target}-${uuid().slice(0, 6)}`, source: connection.source, target: connection.target, type: edgeTypeFromStyle(get().edgeStyle) };
    const { nodes: updatedNodes, prevPaths, nextPaths } = rewriteConnectionPaths(nodes, edges, connection.source, connection.target);
    get().pushOp({ type: "connect", edge: newEdge, prevPaths, nextPaths });
    const nextEdges = sortEdges([...edges, newEdge], updatedNodes);
    set({ nodes: applySearchHighlight(updatedNodes, searchQuery, get().categoryFilter), edges: nextEdges, graphVersion: get().graphVersion + 1 });
    return { ok: true };
  },
  removeEdgesFromHandle: (nodeId, handleType) => {
    const { nodes, edges, searchQuery } = get();
    const filteredEdges = edges.filter((e) => { if (handleType === "source") return e.source !== nodeId; if (handleType === "target") return e.target !== nodeId; return true; });
    if (filteredEdges.length === edges.length) return;
    const removedEdges = edges.filter((e) => !filteredEdges.includes(e));
    const { nodes: nextNodes, pathChanges } = unparentSubtree(nodes, filteredEdges, removedEdges);
    get().pushOp({ type: "remove-edges", edges: removedEdges, pathChanges });
    set({ nodes: applySearchHighlight(nextNodes, searchQuery, get().categoryFilter), edges: filteredEdges, graphVersion: get().graphVersion + 1 });
  },
  unparentNodes: (ids) => {
    const { nodes, edges, searchQuery } = get();
    const idSet = new Set(ids);
    const parentMap = parentMapOf(edges);
    const roots = ids.filter((id) => !ancestorChainOf(id, parentMap).some((a) => idSet.has(a)));
    const removedEdges = edges.filter((e) => roots.includes(e.target));
    if (removedEdges.length === 0) return 0;
    const removedKey = new Set(removedEdges.map((e) => e.id));
    const filteredEdges = edges.filter((e) => !removedKey.has(e.id));
    const { nodes: nextNodes, pathChanges } = unparentSubtree(nodes, filteredEdges, removedEdges);
    get().pushOp({ type: "remove-edges", edges: removedEdges, pathChanges });
    set({ nodes: applySearchHighlight(nextNodes, searchQuery, get().categoryFilter), edges: filteredEdges, graphVersion: get().graphVersion + 1 });
    return removedEdges.length;
  },
  parentNodesTo: (ids, parentId) => {
    const { nodes, edges, searchQuery } = get();
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent || parent.data.type !== "folder") return { moved: 0, reason: "Target must be a folder." };
    const idSet = new Set(ids);
    const parentMap = parentMapOf(edges);
    const roots = ids.filter((id) => {
      if (id === parentId) return false;
      if (parentMap.get(id) === parentId) return false;
      return !ancestorChainOf(id, parentMap).some((a) => idSet.has(a));
    });
    if (roots.length === 0) {
      const alreadyThere = ids.length > 0 && ids.every((id) => id === parentId || parentMap.get(id) === parentId);
      return { moved: 0, reason: alreadyThere ? "Items are already in that folder." : undefined };
    }
    const ops: HistoryOp[] = [];
    let workNodes = nodes;
    let workEdges = edges;
    const oldEdges = edges.filter((e) => roots.includes(e.target));
    if (oldEdges.length > 0) {
      const oldKey = new Set(oldEdges.map((e) => e.id));
      workEdges = edges.filter((e) => !oldKey.has(e.id));
      const detached = unparentSubtree(nodes, workEdges, oldEdges);
      workNodes = detached.nodes;
      ops.push({ type: "remove-edges", edges: oldEdges, pathChanges: detached.pathChanges });
    }
    const addedEdges: FewerEdge[] = [];
    for (const id of roots) {
      const combinedEdges = [...workEdges, ...addedEdges];
      if (!validateConnection(parentId, id, workNodes, combinedEdges).ok) continue;
      const child = workNodes.find((n) => n.id === id)!;
      const childFullLabel = child.data.extension ? `${child.data.label}.${child.data.extension}` : child.data.label;
      const newChildPath = `${parent.data.path}/${childFullLabel}`;
      const oldChildPath = child.data.path;
      const isFolder = child.data.type === "folder";
      const descendantIds = new Set(isFolder ? getDescendants(id, combinedEdges) : []);
      workNodes = workNodes.map((n) => {
        if (n.id === id) return { ...n, data: { ...n.data, path: newChildPath, isRoot: false } };
        if (isFolder && descendantIds.has(n.id) && n.data.path.startsWith(oldChildPath)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldChildPath, newChildPath) } };
        return n;
      });
      const changedNodeIds = isFolder ? [id, ...Array.from(descendantIds)] : [id];
      const prevPaths = changedNodeIds
        .map((nid) => ({ nodeId: nid, path: nodes.find((n) => n.id === nid)?.data.path ?? "" }))
        .filter((p) => p.path !== "");
      const nextPaths = changedNodeIds
        .map((nid) => ({ nodeId: nid, path: workNodes.find((n) => n.id === nid)?.data.path ?? "" }))
        .filter((p) => p.path !== "");
      const newEdge: FewerEdge = { id: `e-${parentId}-${id}-${uuid().slice(0, 6)}`, source: parentId, target: id, type: edgeTypeFromStyle(get().edgeStyle) };
      addedEdges.push(newEdge);
      ops.push({ type: "connect", edge: newEdge, prevPaths, nextPaths });
    }
    if (addedEdges.length === 0) {
      return { moved: 0, reason: "None of the selected items can be moved there." };
    }
    get().pushOp(ops);
    set({
      nodes: applySearchHighlight(workNodes, searchQuery, get().categoryFilter),
      edges: sortEdges([...workEdges, ...addedEdges], workNodes),
      graphVersion: get().graphVersion + 1,
    });
    return { moved: addedEdges.length };
  },
  deleteEdges: (ids) => {
    const { nodes, edges, searchQuery } = get();
    const idSet = new Set(ids);
    const filtered = edges.filter((e) => !idSet.has(e.id));
    if (filtered.length === edges.length) return;
    const removedEdges = edges.filter((e) => idSet.has(e.id));
    const { nodes: nextNodes, pathChanges } = unparentSubtree(nodes, filtered, removedEdges);
    get().pushOp({ type: "remove-edges", edges: removedEdges, pathChanges });
    set({ nodes: applySearchHighlight(nextNodes, searchQuery, get().categoryFilter), edges: filtered, graphVersion: get().graphVersion + 1 });
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
    set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
  },
  collapseAll: () => {
    const { nodes, searchQuery } = get();
    const changes = nodes
      .filter((n) => n.data.type === "folder")
      .map((n) => ({ nodeId: n.id, wasCollapsed: !!n.data.collapsed, willCollapse: true }));
    const newNodes = nodes.map((n) => n.data.type === "folder" ? { ...n, data: { ...n.data, collapsed: true } } : n);
    get().pushOp({ type: "collapse-batch", changes });
    set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
  },
  expandAll: () => {
    const { nodes, searchQuery } = get();
    const changes = nodes.map((n) => ({ nodeId: n.id, wasCollapsed: !!n.data.collapsed, willCollapse: false }));
    const newNodes = nodes.map((n) => ({ ...n, data: { ...n.data, collapsed: false } }));
    get().pushOp({ type: "collapse-batch", changes });
    set({ nodes: applySearchHighlight(newNodes, searchQuery, get().categoryFilter), graphVersion: get().graphVersion + 1 });
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
      nodes: [], edges: [], past: [], future: [], leafHistories: {}, selectedNodeIds: [],
      searchQuery: "", categoryFilter: [], categoryHiddenIds: [], hiddenIds: [], renamingId: null, clipboard: null,
      graphVersion: 0, revealedRootIds: [], autoHiddenIds: [],
      revealedFromHidden: [], independentlyHiddenIds: [], localRootPath: null,
      tags: [], tagFilter: [], tagFilterHiddenIds: [],
    });
  },
});
