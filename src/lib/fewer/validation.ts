import type { FewerNode, FewerEdge } from "./types";
import { childrenIndexOf, parentIndexOf } from "./graphIndex";

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
 * Whether `ancestorId` can be reached by walking parent edges upward from
 * `descendantId`. Used for circular dependency prevention.
 *
 * The old form re-scanned the whole edge list at every node it visited, so a
 * connect attempt cost O(nodes × edges); this indexes the parents once and
 * keeps the same reachability. Unlike the other upward walks it must consider
 * EVERY parent of a node — `parentMapOf` keeps only one (last edge wins), which
 * would miss an ancestor that is reachable through the other parent of an
 * imported multi-parent node.
 */
export function isAncestor(
  ancestorId: string,
  descendantId: string,
  edges: FewerEdge[]
): boolean {
  const parentsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = parentsOf.get(e.target);
    if (list) list.push(e.source);
    else parentsOf.set(e.target, [e.source]);
  }
  const seen = new Set<string>([descendantId]);
  const stack: string[] = [descendantId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const parentId of parentsOf.get(current) ?? []) {
      if (parentId === ancestorId) return true;
      if (!seen.has(parentId)) {
        seen.add(parentId);
        stack.push(parentId);
      }
    }
  }
  return false;
}

/**
 * Index the edge list as parent id → direct child ids. Single home for the
 * edge→children grouping that the store slices, layout and Hidden panel all do.
 *
 * Backed by the identity-cached index (graphIndex) so repeated lookups over an
 * unchanged graph cost a map read instead of another pass over every edge.
 */
export function childrenMapOf(edges: FewerEdge[]): Map<string, string[]> {
  return childrenIndexOf(edges);
}

/**
 * Index the edge list as child id → parent id, the inverse of `childrenMapOf`.
 * Single home for the ancestor walks the store slices, layout and Hidden panel
 * all hand-rolled.
 *
 * Last edge wins when a node has several incoming edges. The connect UI cannot
 * produce that (it enforces a single parent), but `setGraph` stores edges
 * verbatim, so imports can.
 */
export function parentMapOf(edges: FewerEdge[]): Map<string, string> {
  return parentIndexOf(edges);
}

/**
 * Every ancestor id of a node, walking up the parent map: parent, grandparent,
 * … up to the root. Never includes `id` itself.
 *
 * Cycle-safe — each id is emitted at most once, so an imported cycle ends the
 * walk instead of looping forever. That is reachable because `setGraph`
 * (saved-graph load, JSON/CSV import) stores edges verbatim, and
 * `validateConnection` is the only acyclicity guard, which only the connect UI
 * calls. Every upward walk in the app goes through here so none of them can
 * spin on such a graph.
 */
export function ancestorChainOf(id: string, parentMap: Map<string, string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = parentMap.get(id);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = parentMap.get(cur);
  }
  return out;
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
 *
 * Walks the identity-cached children index rather than re-scanning the edge
 * list per dequeued node: that scan made this O(descendants × edges), which
 * froze the UI for a second or more on a graph of ~18k edges (a folder with
 * thousands of descendants is exactly what "Hide Children" hides).
 */
export function getDescendants(
  rootId: string,
  edges: FewerEdge[]
): string[] {
  const children = childrenIndexOf(edges);
  const result: string[] = [];
  // Seeding with the root both excludes it from the result and stops a cycle
  // back to it from re-emitting the origin.
  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  // Index-based cursor instead of shift(): same breadth-first order, no O(n²)
  // array shifting on a walk that can cover thousands of cards.
  for (let i = 0; i < queue.length; i++) {
    // Filtering before enqueueing keeps the queue itself duplicate-free, so
    // the pop-time re-check is unnecessary.
    for (const c of children.get(queue[i]) ?? []) {
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
