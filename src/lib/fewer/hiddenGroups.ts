import type { FewerNode, FewerEdge } from "./types";

export interface HiddenTreeNode {
  node: FewerNode;
  children: HiddenTreeNode[];
}

/** A group of hidden roots that share the same visible context folder. */
export interface HiddenGroup {
  /** The visible folder these hidden nodes "live in" (the hover/scan target on canvas).
   *  `null` only for standalone root nodes with no parent (rare). */
  parentNode: FewerNode | null;
  parentPath: string;
  hiddenCount: number;
  roots: HiddenTreeNode[];
}

/** App-wide ordering convention: folders first, then labels A→Z. */
function hiddenTreeSort(a: HiddenTreeNode, b: HiddenTreeNode): number {
  if (a.node.data.type !== b.node.data.type) return a.node.data.type === "folder" ? -1 : 1;
  return a.node.data.label.localeCompare(b.node.data.label);
}

/** Sum of a hidden subtree's node count (self + all descendants). */
function countHidden(node: HiddenTreeNode): number {
  let count = 1;
  for (const child of node.children) count += countHidden(child);
  return count;
}

/** Nearest node id that is NOT in the hidden set, walking up from `id`. Null if it
 *  is its own top-of-tree. Used to find the visible folder a hidden node sits in. */
function nearestVisibleId(id: string, parentMap: Map<string, string>, hiddenSet: Set<string>): string | null {
  let cur = parentMap.get(id) ?? null;
  while (cur && hiddenSet.has(cur)) cur = parentMap.get(cur) ?? null;
  return cur;
}

/**
 * Builds the Hidden-panel list from the live graph. Hidden nodes are rooted into a
 * nested tree (a hidden parent keeps its hidden children under it), then the
 * top-level hidden roots are grouped by their nearest *visible* ancestor folder —
 * so individually hidden files (auto-hide / category filter) are recoverable with
 * folder context instead of one flat alphabetized list.
 */
export function getHiddenLayerGroups(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenIds: string[],
): HiddenGroup[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();
  for (const e of edges) {
    parentMap.set(e.target, e.source);
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
  }

  // Only consider hidden ids that still map to a live node. A stale id (e.g. a
  // node deleted while hidden) must never be dereferenced below — nodeMap.get
  // would return undefined and hiddenTreeSort would throw on `.node.data`.
  const liveHiddenIds = hiddenIds.filter((id) => nodeMap.has(id));
  const idSet = new Set(liveHiddenIds);
  const roots: HiddenTreeNode[] = [];
  const processed = new Set<string>();

  function build(id: string): HiddenTreeNode {
    processed.add(id);
    const node = nodeMap.get(id)!;
    const children = (childrenMap.get(id) ?? [])
      .filter((cid) => idSet.has(cid))
      .map((cid) => build(cid))
      .sort(hiddenTreeSort);
    return { node, children };
  }

  for (const id of liveHiddenIds) {
    if (processed.has(id)) continue;
    const parentId = parentMap.get(id);
    if (parentId && idSet.has(parentId)) continue;
    roots.push(build(id));
  }

  // Group the top-level hidden roots by their nearest *visible* ancestor folder.
  const grouped = new Map<string | null, HiddenTreeNode[]>();
  for (const root of roots) {
    const pid = nearestVisibleId(root.node.id, parentMap, idSet);
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(root);
  }

  const groups: HiddenGroup[] = [];
  for (const [pid, rs] of grouped) {
    const parentNode = pid ? nodeMap.get(pid) ?? null : null;
    groups.push({
      parentNode,
      parentPath: parentNode?.data.path ?? "",
      hiddenCount: rs.reduce((sum, r) => sum + countHidden(r), 0),
      roots: rs.sort(hiddenTreeSort),
    });
  }
  // A→Z by folder label keeps the list scannable and predictable for new users.
  groups.sort((a, b) =>
    (a.parentNode?.data.label ?? "").localeCompare(b.parentNode?.data.label ?? ""),
  );
  return groups;
}

export function filterHiddenTree(tree: HiddenTreeNode[], query: string): HiddenTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  const result: HiddenTreeNode[] = [];
  for (const t of tree) {
    const children = filterHiddenTree(t.children, q);
    const selfMatch = t.node.data.label.toLowerCase().includes(q);
    if (selfMatch || children.length > 0) {
      result.push({ node: t.node, children });
    }
  }
  return result;
}

export function filterHiddenGroups(groups: HiddenGroup[], query: string): HiddenGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const result: HiddenGroup[] = [];
  for (const g of groups) {
    const roots = filterHiddenTree(g.roots, q);
    const parentMatch =
      (g.parentNode?.data.label ?? "").toLowerCase().includes(q) ||
      g.parentPath.toLowerCase().includes(q);
    // Parent matches → keep the whole group; otherwise keep only matched roots.
    if (parentMatch || roots.length > 0) {
      result.push({ ...g, roots: parentMatch && roots.length === 0 ? g.roots : roots });
    }
  }
  return result;
}

/** Every ancestor id of a node (parent, grandparent, … up to the root). */
export function ancestorChain(id: string, edges: FewerEdge[]): string[] {
  const parentMap = new Map<string, string>();
  for (const e of edges) parentMap.set(e.target, e.source);
  const out: string[] = [];
  let cur: string | undefined = parentMap.get(id);
  while (cur) {
    out.push(cur);
    cur = parentMap.get(cur);
  }
  return out;
}

/**
 * Node ids to ring on canvas when a Hidden-panel row is hovered: the row's node
 * itself, its full ancestor chain (so the visible folder cards up to the root
 * glow), plus — for a folder group hover — every node in the hidden subtrees,
 * so hidden child rows light up inside their parent card on canvas.
 */
export function buildRingIds(
  nodeId: string | null | undefined,
  edges: FewerEdge[],
  subtreeRoots?: HiddenTreeNode[],
): string[] {
  if (!nodeId) return [];
  const ids = [nodeId, ...ancestorChain(nodeId, edges)];
  if (subtreeRoots) {
    const stack = [...subtreeRoots];
    while (stack.length) {
      const t = stack.pop()!;
      ids.push(t.node.id);
      stack.push(...t.children);
    }
  }
  return ids;
}


