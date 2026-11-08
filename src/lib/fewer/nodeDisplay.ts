import { Position } from "@xyflow/react";
import type { FewerNode, FewerEdge } from "./types";
import { childrenIndexOf, nodeIndexOf } from "./graphIndex";

// CATEGORY_ICON, formatSize and providerLabelFromSource live in nodeVisuals.ts
// (no @xyflow/react import there) so the marketing preview and the context-menu
// model can use them without pulling the graph library into their bundles.
// Re-exported here so every existing import path keeps working.
export { CATEGORY_ICON, formatSize, providerLabelFromSource } from "./nodeVisuals";

/** Child badges count edges, not just existing/visible nodes. */
export function folderChildCount(id: string, isFolder: boolean, edges: FewerEdge[]): number {
  return isFolder ? (childrenIndexOf(edges).get(id)?.length ?? 0) : 0;
}

export function getHandlePositions(layoutDirection?: string): {
  source: Position;
  target: Position;
} {
  switch (layoutDirection) {
    case "TB":
      return { source: Position.Bottom, target: Position.Top };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "LR":
      return { source: Position.Right, target: Position.Left };
    case "RL":
      return { source: Position.Left, target: Position.Right };
    default:
      return { source: Position.Bottom, target: Position.Top };
  }
}

/** Select the stem, but select an entire dotfile or extensionless name. */
export function renameSelection(label: string): readonly [number, number] {
  const dot = label.lastIndexOf(".");
  return [0, dot > 0 ? dot : label.length];
}

/** Rows are unique existing nodes; counters intentionally count edges, even dangling ones. */
export function sortedChildRows(
  parentId: string,
  nodes: FewerNode[],
  edges: FewerEdge[],
): FewerNode[] {
  const childIds = childrenIndexOf(edges).get(parentId);
  if (!childIds || childIds.length === 0) return [];
  const nodeMap = nodeIndexOf(nodes);
  const seen = new Set<string>();
  const children: FewerNode[] = [];
  // Edge order, then the app-wide sort below. Equal labels can't tie: the
  // connect/rename rules keep sibling names unique, so the sort is a total
  // order over the rows and the pre-sort order is unobservable.
  for (const id of childIds) {
    if (seen.has(id)) continue;
    const node = nodeMap.get(id);
    if (!node) continue;
    seen.add(id);
    children.push(node);
  }
  children.sort((a, b) => {
    if (a.data.type !== b.data.type) return a.data.type === "folder" ? -1 : 1;
    return a.data.label.localeCompare(b.data.label);
  });
  return children;
}

export function nodeChildren(
  id: string,
  isFolder: boolean,
  nodes: FewerNode[],
  edges: FewerEdge[],
  visibleIds: ReadonlySet<string>,
): { children: FewerNode[]; childCount: number; hiddenChildCount: number } {
  if (!isFolder) return { children: [], childCount: 0, hiddenChildCount: 0 };
  const childIds = childrenIndexOf(edges).get(id) ?? [];
  let hiddenChildCount = 0;
  for (const cid of childIds) if (!visibleIds.has(cid)) hiddenChildCount++;
  return {
    children: sortedChildRows(id, nodes, edges),
    childCount: childIds.length,
    hiddenChildCount,
  };
}
