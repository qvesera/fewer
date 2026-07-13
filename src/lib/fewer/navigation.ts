import type { FewerNode, FewerEdge } from "./types";

/**
 * Navigation helpers for keyboard arrow-key movement between nodes.
 * Supports tree-style navigation:
 *   ↑   = parent
 *   ↓   = first child (or next sibling if no children)
 *   ←   = previous sibling
 *   →   = next sibling (or first child if collapsed)
 */

/**
 * Find the parent of a node by walking the edge list.
 */
export function getParent(
  nodeId: string,
  edges: FewerEdge[]
): string | null {
  const parentEdge = edges.find((e) => e.target === nodeId);
  return parentEdge?.source ?? null;
}

/**
 * Find all children of a node, sorted by their Y position (top to bottom).
 */
export function getChildren(
  nodeId: string,
  nodes: FewerNode[],
  edges: FewerEdge[]
): FewerNode[] {
  const childIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);
  return nodes
    .filter((n) => childIds.includes(n.id))
    .sort((a, b) => a.position.y - b.position.y);
}

/**
 * Find all siblings (same parent) of a node, sorted by Y position.
 */
export function getSiblings(
  nodeId: string,
  nodes: FewerNode[],
  edges: FewerEdge[]
): FewerNode[] {
  const parentId = getParent(nodeId, edges);
  if (parentId === null) {
    // Root nodes are siblings of each other
    const hasParent = new Set(edges.map((e) => e.target));
    return nodes
      .filter((n) => !hasParent.has(n.id))
      .sort((a, b) => a.position.y - b.position.y);
  }
  return getChildren(parentId, nodes, edges);
}

/**
 * Navigate from the current node in the given direction.
 * Returns the target node ID, or null if there's nowhere to go.
 */
export function navigate(
  currentId: string,
  direction: "up" | "down" | "left" | "right",
  nodes: FewerNode[],
  edges: FewerEdge[]
): string | null {
  const current = nodes.find((n) => n.id === currentId);
  if (!current) return null;

  const siblings = getSiblings(currentId, nodes, edges);
  const currentIdx = siblings.findIndex((s) => s.id === currentId);

  switch (direction) {
    case "up": {
      // Go to parent
      const parentId = getParent(currentId, edges);
      if (parentId) return parentId;
      // If no parent, go to previous sibling
      if (currentIdx > 0) return siblings[currentIdx - 1].id;
      return null;
    }

    case "down": {
      // Go to first child
      const children = getChildren(currentId, nodes, edges);
      if (children.length > 0) return children[0].id;
      // No children — go to next sibling
      if (currentIdx < siblings.length - 1) return siblings[currentIdx + 1].id;
      // No next sibling — go to parent's next sibling (aunt/uncle)
      const parentId = getParent(currentId, edges);
      if (parentId) {
        const parentSiblings = getSiblings(parentId, nodes, edges);
        const parentIdx = parentSiblings.findIndex((s) => s.id === parentId);
        if (parentIdx < parentSiblings.length - 1) {
          return parentSiblings[parentIdx + 1].id;
        }
      }
      return null;
    }

    case "left": {
      // Previous sibling
      if (currentIdx > 0) return siblings[currentIdx - 1].id;
      // No previous sibling — go to parent
      const parentId = getParent(currentId, edges);
      return parentId;
    }

    case "right": {
      // Next sibling
      if (currentIdx < siblings.length - 1) return siblings[currentIdx + 1].id;
      // No next sibling — go to first child
      const children = getChildren(currentId, nodes, edges);
      if (children.length > 0) return children[0].id;
      return null;
    }
  }
}
