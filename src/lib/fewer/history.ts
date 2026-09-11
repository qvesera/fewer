import type { FewerNode, FewerEdge, HistoryOp, ViewState } from "./types";

type Graph = { nodes: FewerNode[]; edges: FewerEdge[] };
/* ponytail: dispatch tables replace two CCN-24 switches; flat per-op fns. */
type AnyHandler = (nodes: FewerNode[], edges: FewerEdge[], op: never) => Graph;

const passthrough: AnyHandler = (nodes, edges) => ({ nodes, edges });

function excludeIds<T extends { id: string }>(items: T[], ids: Set<string>): T[] {
  return ids.size === 0 ? items : items.filter((it) => !ids.has(it.id));
}

/** Append additions, skipping nulls + ids already present (idempotent redo/undo). */
function mergeNew<T extends { id: string }>(existing: T[], additions: readonly (T | null)[]): T[] {
  if (additions.length === 0) return existing;
  const seen = new Set(existing.map((t) => t.id));
  const out = [...existing];
  for (const a of additions) {
    if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
  }
  return out;
}

/** Rewrite node paths from a {nodeId,path} list in one pass (Map, not .find-in-.map). */
function repath(nodes: FewerNode[], pairs: readonly { nodeId: string; path: string }[] | undefined, extra?: Record<string, unknown>): FewerNode[] {
  if (!pairs?.length) return nodes;
  const byId = new Map(pairs.map((p) => [p.nodeId, p.path] as const));
  return nodes.map((nd) => {
    const path = byId.get(nd.id);
    return path === undefined ? nd : { ...nd, data: { ...nd.data, path, ...extra } };
  });
}

function relocate(nodes: FewerNode[], moves: readonly { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[], pick: "from" | "to"): FewerNode[] {
  if (moves.length === 0) return nodes;
  const byId = new Map(moves.map((m) => [m.nodeId, m[pick]] as const));
  return nodes.map((nd) => {
    const p = byId.get(nd.id);
    return p ? { ...nd, position: { x: p.x, y: p.y } } : nd;
  });
}

function resizeTo(nodes: FewerNode[], changes: readonly { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[], pick: "from" | "to"): FewerNode[] {
  if (changes.length === 0) return nodes;
  const byId = new Map(changes.map((c) => [c.nodeId, c[pick]] as const));
  return nodes.map((nd) => {
    const d = byId.get(nd.id);
    return d ? { ...nd, style: { ...nd.style, width: d.w, height: d.h }, measured: undefined } : nd;
  });
}

function setCollapsed(nodes: FewerNode[], changes: readonly { nodeId: string; wasCollapsed: boolean; willCollapse: boolean }[], pick: "wasCollapsed" | "willCollapse"): FewerNode[] {
  if (changes.length === 0) return nodes;
  const byId = new Map(changes.map((c) => [c.nodeId, c[pick]] as const));
  return nodes.map((nd) => {
    const v = byId.get(nd.id);
    return v === undefined ? nd : { ...nd, data: { ...nd.data, collapsed: v } };
  });
}

function subtreeIds(op: { node: FewerNode; children: FewerNode[] }): Set<string> {
  return new Set([op.node.id, ...op.children.map((c) => c.id)]);
}

function subtreeEdgeIds(op: { edge: FewerEdge | null; childEdges: FewerEdge[] }): Set<string> {
  return new Set([op.edge, ...op.childEdges].filter(Boolean).map((e) => e!.id));
}

const doAddNode: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "add-node" }>;
  return { nodes: mergeNew(nodes, [o.node]), edges: o.edge ? mergeNew(edges, [o.edge]) : edges };
};
const doRemoveNode: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "remove-node" }>;
  return { nodes: excludeIds(nodes, subtreeIds(o)), edges: excludeIds(edges, subtreeEdgeIds(o)) };
};
const doMoveNode: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "move-node" }>;
  return { nodes: nodes.map((nd) => nd.id !== o.nodeId ? nd : { ...nd, position: { x: o.to.x, y: o.to.y }, data: { ...nd.data, parentId: o.to.parentId } }), edges };
};
const doRename: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "rename" }>;
  return { nodes: nodes.map((nd) => nd.id !== o.nodeId ? nd : { ...nd, data: { ...nd.data, label: o.newLabel } }), edges };
};
const doBulkImport: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "bulk-import" }>;
  return { nodes: mergeNew(nodes, o.nodes), edges: mergeNew(edges, o.edges) };
};
const doToggleCollapse: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "toggle-collapse" }>;
  return { nodes: nodes.map((nd) => nd.id !== o.nodeId ? nd : { ...nd, data: { ...nd.data, collapsed: !o.wasCollapsed } }), edges };
};
const doRemoveSubtree: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "remove-subtree" }>;
  return { nodes: excludeIds(nodes, subtreeIds(o)), edges: excludeIds(edges, subtreeEdgeIds(o)) };
};
const doRefreshSubtree: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "refresh-subtree" }>;
  return { nodes: mergeNew(excludeIds(nodes, new Set(o.oldNodes.map((n) => n.id))), o.newNodes), edges: mergeNew(excludeIds(edges, new Set(o.oldEdges.map((e) => e.id))), o.newEdges) };
};
const doConnect: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "connect" }>;
  return { nodes: repath(nodes, o.nextPaths), edges: mergeNew(edges, [o.edge]) };
};
const doRemoveEdges: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "remove-edges" }>;
  return { nodes: repath(nodes, o.pathChanges?.map((pc) => ({ nodeId: pc.nodeId, path: pc.nextPath })), { isRoot: true }), edges: excludeIds(edges, new Set(o.edges.map((e) => e.id))) };
};
const doMovePositions: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "move-positions" }>;
  return { nodes: relocate(nodes, o.moves, "to"), edges };
};
const doResize: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "resize" }>;
  return { nodes: resizeTo(nodes, o.changes, "to"), edges };
};
const doCollapseBatch: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "collapse-batch" }>;
  return { nodes: setCollapsed(nodes, o.changes, "willCollapse"), edges };
};

/**
 * Apply a history operation forward (undo → redo or initial push).
 * Returns the new nodes/edges arrays after applying the op.
 */
export function applyOp(nodes: FewerNode[], edges: FewerEdge[], op: HistoryOp): Graph {
  return applyTable[op.type](nodes, edges, op as never);
}

/**
 * Reverse a history operation (redo → undo).
 * Returns the state before the op was applied.
 */
export function undoOp(nodes: FewerNode[], edges: FewerEdge[], op: HistoryOp): Graph {
  return undoTable[op.type](nodes, edges, op as never);
}
const undoAddNode: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "add-node" }>;
  return { nodes: nodes.filter((nd) => nd.id !== o.node.id), edges: o.edge ? edges.filter((ed) => ed.id !== o.edge!.id) : edges };
};
const undoRemoveNode: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "remove-node" }>;
  return { nodes: mergeNew(nodes, [o.node, ...o.children]), edges: mergeNew(edges, [o.edge, ...o.childEdges]) };
};
const undoMoveNode: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "move-node" }>;
  return { nodes: nodes.map((nd) => nd.id !== o.nodeId ? nd : { ...nd, position: { x: o.from.x, y: o.from.y }, data: { ...nd.data, parentId: o.from.parentId } }), edges };
};
const undoRename: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "rename" }>;
  return { nodes: nodes.map((nd) => nd.id !== o.nodeId ? nd : { ...nd, data: { ...nd.data, label: o.oldLabel } }), edges };
};
const undoBulkImport: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "bulk-import" }>;
  return { nodes: excludeIds(nodes, new Set(o.nodes.map((n) => n.id))), edges: excludeIds(edges, new Set(o.edges.map((e) => e.id))) };
};
const undoToggleCollapse: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "toggle-collapse" }>;
  return { nodes: nodes.map((nd) => nd.id !== o.nodeId ? nd : { ...nd, data: { ...nd.data, collapsed: o.wasCollapsed } }), edges };
};
const undoRemoveSubtree: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "remove-subtree" }>;
  return { nodes: mergeNew(nodes, [o.node, ...o.children]), edges: mergeNew(edges, [o.edge, ...o.childEdges]) };
};
const undoRefreshSubtree: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "refresh-subtree" }>;
  return { nodes: mergeNew(excludeIds(nodes, new Set(o.newNodes.map((n) => n.id))), o.oldNodes), edges: mergeNew(excludeIds(edges, new Set(o.newEdges.map((e) => e.id))), o.oldEdges) };
};
const undoConnect: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "connect" }>;
  return { nodes: repath(nodes, o.prevPaths), edges: edges.filter((e) => e.id !== o.edge.id) };
};
const undoRemoveEdges: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "remove-edges" }>;
  return { nodes: repath(nodes, o.pathChanges?.map((pc) => ({ nodeId: pc.nodeId, path: pc.prevPath }))), edges: mergeNew(edges, o.edges) };
};
const undoMovePositions: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "move-positions" }>;
  return { nodes: relocate(nodes, o.moves, "from"), edges };
};
const undoResize: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "resize" }>;
  return { nodes: resizeTo(nodes, o.changes, "from"), edges };
};
const undoCollapseBatch: AnyHandler = (nodes, edges, op) => {
  const o = op as unknown as Extract<HistoryOp, { type: "collapse-batch" }>;
  return { nodes: setCollapsed(nodes, o.changes, "wasCollapsed"), edges };
};
const applyTable: Record<HistoryOp["type"], AnyHandler> = { "add-node": doAddNode, "remove-node": doRemoveNode, "move-node": doMoveNode, rename: doRename, "bulk-import": doBulkImport, "toggle-collapse": doToggleCollapse, "remove-subtree": doRemoveSubtree, "refresh-subtree": doRefreshSubtree, connect: doConnect, "remove-edges": doRemoveEdges, "move-positions": doMovePositions, resize: doResize, "collapse-batch": doCollapseBatch, "view-state": passthrough };
const undoTable: Record<HistoryOp["type"], AnyHandler> = { "add-node": undoAddNode, "remove-node": undoRemoveNode, "move-node": undoMoveNode, rename: undoRename, "bulk-import": undoBulkImport, "toggle-collapse": undoToggleCollapse, "remove-subtree": undoRemoveSubtree, "refresh-subtree": undoRefreshSubtree, connect: undoConnect, "remove-edges": undoRemoveEdges, "move-positions": undoMovePositions, resize: undoResize, "collapse-batch": undoCollapseBatch, "view-state": passthrough };
/** Apply a batch of ops in sequence (forward). */
export function applyOps(nodes: FewerNode[], edges: FewerEdge[], ops: HistoryOp[]): Graph {
  let result = { nodes, edges };
  for (const op of ops) result = applyOp(result.nodes, result.edges, op);
  return result;
}
/** Reverse a batch of ops in reverse order (undo). */
export function undoOps(nodes: FewerNode[], edges: FewerEdge[], ops: HistoryOp[]): Graph {
  let result = { nodes, edges };
  for (let i = ops.length - 1; i >= 0; i--) result = undoOp(result.nodes, result.edges, ops[i]);
  return result;
}
/**
 * Extract the "before" view-state that a batched op wants restored on undo.
 */
export function getUndoViewState(op: HistoryOp): Partial<ViewState> | null {
  return "before" in op ? op.before : null;
}
/** Extract the "after" view-state an op wants applied on redo. */
export function getRedoViewState(op: HistoryOp): Partial<ViewState> | null {
  return "after" in op ? op.after : null;
}
