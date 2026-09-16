import type { FewerNode, FewerEdge } from "./types";

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
  nodes: FewerNode[],
  edges: FewerEdge[]
): ValidationResult {
  if (parentNodeId === childNodeId) {
    return { ok: false, reason: "A node cannot be its own parent." };
  }

  // File nodes cannot have children
  const parentNode = nodes.find((n) => n.id === parentNodeId);
  if (parentNode && parentNode.data.type === "file") {
    return { ok: false, reason: "File nodes cannot have children." };
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
    const childFull = child.data.extension ? `${child.data.label}.${child.data.extension}` : child.data.label;
    const duplicate = nodes.find(
      (n) => {
        if (!siblingIds.includes(n.id)) return false;
        const nFull = n.data.extension ? `${n.data.label}.${n.data.extension}` : n.data.label;
        return nFull.toLowerCase() === childFull.toLowerCase();
      }
    );
    if (duplicate) {
      return {
        ok: false,
        reason: `Duplicate name: "${childFull}" already exists in this parent.`,
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
  edges: FewerEdge[]
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
 * Index the edge list as parent id → direct child ids. Single home for the
 * edge→children grouping that the store slices, layout and Hidden panel all do.
 */
export function childrenMapOf(edges: FewerEdge[]): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
  }
  return childrenMap;
}

/**
 * Collect the descendant node ids of the given root, in BFS order: every
 * descendant listed exactly once, never including the root itself.
 *
 * Deduplication is part of the contract, not an optimisation. The edge list is
 * a DAG, so a node with several parents is reachable by more than one path and
 * a per-path push would list it once per path. Callers depend on one entry per
 * node — e.g. CustomNode's "Hide Children" toast reports `descendants.length`
 * straight to the user, and its sibling `countDescendants` dedupes for exactly
 * the same reason.
 */
export function getDescendants(
  rootId: string,
  edges: FewerEdge[]
): string[] {
  const result: string[] = [];
  // Seeding with the root both excludes it from the result and stops a cycle
  // back to it from re-emitting the origin.
  const visited = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    const children = edges.filter((e) => e.source === current).map((e) => e.target);
    for (const c of children) {
      // Filtering before enqueueing keeps the queue itself duplicate-free, so
      // the pop-time re-check is unnecessary.
      if (visited.has(c)) continue;
      visited.add(c);
      result.push(c);
      queue.push(c);
    }
  }
  return result;
}

/**
 * Build the full relative path of a node by walking up its parent chain.
 */
export function getRelativePath(
  nodeId: string,
  nodes: FewerNode[],
  edges: FewerEdge[]
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
