import type { FewerEdge, FewerNode, ConnectOp } from "./types";
import { getDescendants } from "./validation";

/**
 * Rewrite paths for a connection and capture its undo/redo payload. Validation,
 * edge creation and store updates belong to the caller. Preserve unchanged node
 * identities and the existing raw-import behavior (including missing endpoints).
 */
export function rewriteConnectionPaths(
  nodes: FewerNode[],
  edges: FewerEdge[],
  source: string,
  target: string,
): { nodes: FewerNode[]; prevPaths: ConnectOp["prevPaths"]; nextPaths: ConnectOp["nextPaths"] } {
  const parent = nodes.find((n) => n.id === source);
  const child = nodes.find((n) => n.id === target);
  let updatedNodes = nodes;
  const descendantIds = new Set(
    parent && child && child.data.type === "folder" ? getDescendants(target, edges) : [],
  );
  if (parent && child) {
    const childFullLabel = child.data.extension ? `${child.data.label}.${child.data.extension}` : child.data.label;
    const newChildPath = `${parent.data.path}/${childFullLabel}`;
    const oldChildPath = child.data.path;
    const isFolder = child.data.type === "folder";
    updatedNodes = nodes.map((n) => {
      if (n.id === target) return { ...n, data: { ...n.data, path: newChildPath, isRoot: false } };
      if (isFolder && descendantIds.has(n.id) && n.data.path.startsWith(oldChildPath)) return { ...n, data: { ...n.data, path: n.data.path.replace(oldChildPath, newChildPath) } };
      return n;
    });
  }
  // History includes reachable nodes even when a mismatched prefix leaves their
  // path unchanged. Empty paths are omitted, matching the existing action.
  const changedNodeIds = child && child.data.type === "folder" ? [target, ...descendantIds] : [target];
  const prevPaths = changedNodeIds
    .map((nodeId) => ({ nodeId, path: nodes.find((n) => n.id === nodeId)?.data.path ?? "" }))
    .filter((p) => p.path !== "");
  const nextPaths = changedNodeIds
    .map((nodeId) => ({ nodeId, path: updatedNodes.find((n) => n.id === nodeId)?.data.path ?? "" }))
    .filter((p) => p.path !== "");
  return { nodes: updatedNodes, prevPaths, nextPaths };
}
