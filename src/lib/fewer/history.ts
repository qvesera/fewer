import type { FewerNode, FewerEdge, HistoryOp, BulkImportOp } from "./types";

/**
 * Apply a history operation forward (undo → redo or initial push).
 * Returns the new nodes/edges arrays after applying the op.
 */
export function applyOp(
  nodes: FewerNode[],
  edges: FewerEdge[],
  op: HistoryOp,
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  switch (op.type) {
    case "add-node": {
      const n = [...nodes, op.node];
      const e = op.edge ? [...edges, op.edge] : edges;
      return { nodes: n, edges: e };
    }
    case "remove-node": {
      const removedIds = new Set([op.node.id, ...op.children.map((c) => c.id)]);
      const n = nodes.filter((nd) => !removedIds.has(nd.id));
      const edgeIds = new Set(
        [op.edge, ...op.childEdges].filter(Boolean).map((e) => e!.id),
      );
      const e = edges.filter((ed) => !edgeIds.has(ed.id));
      return { nodes: n, edges: e };
    }
    case "move-node": {
      const n = nodes.map((nd) => {
        if (nd.id !== op.nodeId) return nd;
        return {
          ...nd,
          position: { x: op.to.x, y: op.to.y },
          data: {
            ...nd.data,
            parentId: op.to.parentId,
          },
        };
      });
      return { nodes: n, edges };
    }
    case "rename": {
      const n = nodes.map((nd) => {
        if (nd.id !== op.nodeId) return nd;
        return {
          ...nd,
          data: { ...nd.data, label: op.newLabel },
        };
      });
      return { nodes: n, edges };
    }
    case "bulk-import": {
      // Deduplicate: existing nodes/edges take priority
      const existingNodeIds = new Set(nodes.map((n) => n.id));
      const existingEdgeIds = new Set(edges.map((e) => e.id));
      const newNodes = op.nodes.filter((n) => !existingNodeIds.has(n.id));
      const newEdges = op.edges.filter((e) => !existingEdgeIds.has(e.id));
      return {
        nodes: [...nodes, ...newNodes],
        edges: [...edges, ...newEdges],
      };
    }
    case "toggle-collapse": {
      const n = nodes.map((nd) => {
        if (nd.id !== op.nodeId) return nd;
        return {
          ...nd,
          data: { ...nd.data, collapsed: !op.wasCollapsed },
        };
      });
      return { nodes: n, edges };
    }
    default:
      return { nodes, edges };
  }
}

/**
 * Reverse a history operation (redo → undo).
 * Returns the state before the op was applied.
 */
export function undoOp(
  nodes: FewerNode[],
  edges: FewerEdge[],
  op: HistoryOp,
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  switch (op.type) {
    case "add-node": {
      const n = nodes.filter((nd) => nd.id !== op.node.id);
      const e = op.edge ? edges.filter((ed) => ed.id !== op.edge!.id) : edges;
      return { nodes: n, edges: e };
    }
    case "remove-node": {
      const restoredIds = new Set([op.node.id, ...op.children.map((c) => c.id)]);
      // Restore nodes that were removed
      const existingIds = new Set(nodes.map((n) => n.id));
      const toRestore = [op.node, ...op.children].filter(
        (n) => !existingIds.has(n.id),
      );
      const n = [...nodes, ...toRestore];
      const edgeIds = new Set(
        [op.edge, ...op.childEdges].filter(Boolean).map((e) => e!.id),
      );
      const existingEdgeIds = new Set(edges.map((e) => e.id));
      const edgesToRestore = [op.edge, ...op.childEdges].filter(
        (e): e is FewerEdge => e !== null && !existingEdgeIds.has(e.id),
      );
      const e = [...edges, ...edgesToRestore];
      // Restore original positions
      return { nodes: n, edges: e };
    }
    case "move-node": {
      const n = nodes.map((nd) => {
        if (nd.id !== op.nodeId) return nd;
        return {
          ...nd,
          position: { x: op.from.x, y: op.from.y },
          data: {
            ...nd.data,
            parentId: op.from.parentId,
          },
        };
      });
      return { nodes: n, edges };
    }
    case "rename": {
      const n = nodes.map((nd) => {
        if (nd.id !== op.nodeId) return nd;
        return {
          ...nd,
          data: { ...nd.data, label: op.oldLabel },
        };
      });
      return { nodes: n, edges };
    }
    case "bulk-import": {
      const importIds = new Set(op.nodes.map((n) => n.id));
      const edgeIds = new Set(op.edges.map((e) => e.id));
      return {
        nodes: nodes.filter((n) => !importIds.has(n.id)),
        edges: edges.filter((e) => !edgeIds.has(e.id)),
      };
    }
    case "toggle-collapse": {
      const n = nodes.map((nd) => {
        if (nd.id !== op.nodeId) return nd;
        return {
          ...nd,
          data: { ...nd.data, collapsed: op.wasCollapsed },
        };
      });
      return { nodes: n, edges };
    }
    default:
      return { nodes, edges };
  }
}

/**
 * Apply a batch of ops in sequence (forward).
 */
export function applyOps(
  nodes: FewerNode[],
  edges: FewerEdge[],
  ops: HistoryOp[],
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  let result = { nodes, edges };
  for (const op of ops) {
    result = applyOp(result.nodes, result.edges, op);
  }
  return result;
}

/**
 * Reverse a batch of ops in reverse order (undo).
 */
export function undoOps(
  nodes: FewerNode[],
  edges: FewerEdge[],
  ops: HistoryOp[],
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  let result = { nodes, edges };
  for (let i = ops.length - 1; i >= 0; i--) {
    result = undoOp(result.nodes, result.edges, ops[i]);
  }
  return result;
}