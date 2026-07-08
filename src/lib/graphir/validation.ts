import type { GraphirNode, GraphirEdge } from "./types";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a potential parent→child connection in the graph.
 * Enforces:
 *  - no self-parenting
 *  - child can only have ONE parent (no multi-parent)
 *  - no circular dependencies (child must not be an ancestor of parent)
 *  - no duplicate names within the same parent
 */
export function validateConnection(
  parentNodeId: string,
  childNodeId: string,
  nodes: GraphirNode[],
  edges: GraphirEdge[]
): ValidationResult {
  if (parentNodeId === childNodeId) {
    return { ok: false, reason: "A node cannot be its own parent." };
  }

  // Does child already have a parent?
  const existingParent = edges.find((e) => e.target === childNodeId);
  if (existingParent && existingParent.source !== parentNodeId) {
    return {
      ok: false,
      reason: "A node can only have one parent. Remove the existing edge first.",
    };
  }

  // Circular dependency check: is parentNodeId a descendant of childNodeId?
  if (isAncestor(childNodeId, parentNodeId, edges)) {
    return {
      ok: false,
      reason: "Circular dependency detected. This would create a cycle.",
    };
  }

  // Duplicate name check: does parent already have a child with the same name?
  const parent = nodes.find((n) => n.id === parentNodeId);
  const child = nodes.find((n) => n.id === childNodeId);
  if (parent && child) {
    const siblingIds = edges
      .filter((e) => e.source === parentNodeId && e.target !== childNodeId)
      .map((e) => e.target);
    const duplicate = nodes.find(
      (n) =>
        siblingIds.includes(n.id) &&
        n.data.label.toLowerCase() === child.data.label.toLowerCase()
    );
    if (duplicate) {
      return {
        ok: false,
        reason: `Duplicate name: "${child.data.label}" already exists in this parent.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Walk the edge list to determine if `ancestorId` is an ancestor of `descendantId`.
 * Used for circular dependency prevention.
 */
export function isAncestor(
  ancestorId: string,
  descendantId: string,
  edges: GraphirEdge[]
): boolean {
  // BFS upward from descendantId — does ancestorId appear in its parent chain?
  const visited = new Set<string>();
  const queue = [descendantId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const parents = edges.filter((e) => e.target === current).map((e) => e.source);
    for (const p of parents) {
      if (p === ancestorId) return true;
      queue.push(p);
    }
  }
  return false;
}

/**
 * Collect all descendant node ids of the given root (not including root).
 * Uses BFS over the edge list.
 */
export function getDescendants(
  rootId: string,
  edges: GraphirEdge[]
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const children = edges.filter((e) => e.source === current).map((e) => e.target);
    for (const c of children) {
      if (c !== rootId) {
        result.push(c);
        queue.push(c);
      }
    }
  }
  return result;
}

/**
 * Build the full relative path of a node by walking up its parent chain.
 */
export function getRelativePath(
  nodeId: string,
  nodes: GraphirNode[],
  edges: GraphirEdge[]
): string {
  const parts: string[] = [];
  let current: string | null = nodeId;
  while (current) {
    const node = nodes.find((n) => n.id === current);
    if (!node) break;
    parts.unshift(node.data.label);
    const parentEdge = edges.find((e) => e.target === current);
    current = parentEdge?.source ?? null;
  }
  return parts.join("/");
}
