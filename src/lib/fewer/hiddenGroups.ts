import type { FewerNode, FewerEdge } from "./types";
import { ancestorChainOf, parentMapOf } from "./validation";
import { childrenIndexOf, nodeIndexOf, parentIndexOf } from "./graphIndex";

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

/** Nearest node id that is NOT in the hidden set, walking up from `id`. Null if it
 *  is its own top-of-tree. Used to find the visible folder a hidden node sits in.
 *
 *  Stops at the FIRST visible ancestor — this runs once per hidden card, and the
 *  ancestorChainOf it replaced built the whole chain (past the answer) and
 *  allocated an array for each one. The walk is bounded by the hidden set's size
 *  rather than a `seen` set, so an imported cycle still terminates with no
 *  per-call allocation. */
function nearestVisibleId(id: string, parentMap: Map<string, string>, hiddenSet: ReadonlySet<string>): string | null {
  let cur = parentMap.get(id);
  for (let hops = 0; cur !== undefined && hops <= hiddenSet.size; hops++) {
    if (!hiddenSet.has(cur)) return cur;
    cur = parentMap.get(cur);
  }
  return null;
}

/**
 * How much of each hidden subtree to materialise.
 *
 * `roots` — only the top-most hidden node of each branch (the panel renders
 * exactly these by default; a row loads its own children when expanded).
 * `all` — the full nested tree, which the search box needs so a deep match can
 * keep its ancestor path.
 */
export type HiddenExpand = "roots" | "all";

const NO_CHILDREN: HiddenTreeNode[] = [];

/**
 * One level of a node's hidden children, folders first then A→Z. Reads the
 * identity-cached indexes, so repeated calls over an unchanged graph are map
 * reads. Used by the panel to expand a row on demand.
 */
export function hiddenChildrenOf(
  nodeId: string,
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenSet: ReadonlySet<string>,
): HiddenTreeNode[] {
  const childIds = childrenIndexOf(edges).get(nodeId);
  if (!childIds || childIds.length === 0) return NO_CHILDREN;
  const nodeMap = nodeIndexOf(nodes);
  const out: HiddenTreeNode[] = [];
  const seen = new Set<string>();
  for (const cid of childIds) {
    if (seen.has(cid) || !hiddenSet.has(cid)) continue;
    const node = nodeMap.get(cid);
    if (!node) continue;
    seen.add(cid);
    out.push({ node, children: NO_CHILDREN });
  }
  out.sort(hiddenTreeSort);
  return out;
}

/**
 * Builds the Hidden-panel list from the live graph in ONE pass over the hidden
 * ids: each id is attributed to the visible folder above it (its nearest
 * non-hidden ancestor), counted there, and kept as a group root when its own
 * parent is hidden. That replaces building a nested tree over every hidden node
 * and then re-walking it to count — the tree held 15k nodes at ~28ms on a 30k
 * graph, and the panel renders only the roots until a row is expanded.
 *
 * `expand: "all"` materialises the full nested tree (search), `"roots"` only the
 * top level (default; the panel expands rows via `hiddenChildrenOf`).
 *
 * Count semantics are unchanged — a group's `hiddenCount` is every hidden id
 * beneath that visible folder — except that a node with two parents (an
 * imported fan-in) is now counted once instead of once per path, which the
 * recursive version over-counted.
 */
export function getHiddenLayerGroups(
  nodes: FewerNode[],
  edges: FewerEdge[],
  hiddenIds: string[],
  expand: HiddenExpand = "all",
): HiddenGroup[] {
  const nodeMap = nodeIndexOf(nodes);
  const parentMap = parentIndexOf(edges);
  const childrenMap = childrenIndexOf(edges);

  // Only consider hidden ids that still map to a live node. A stale id (e.g. a
  // node deleted while hidden) must never be dereferenced below — nodeMap.get
  // would return undefined and hiddenTreeSort would throw on `.node.data`.
  const liveHiddenIds = hiddenIds.filter((id) => nodeMap.has(id));
  const hiddenSet = new Set(liveHiddenIds);

  // Nested tree for the "all" (search) path; the "roots" path never fills it.
  const buildAll = (id: string): HiddenTreeNode => ({
    node: nodeMap.get(id)!,
    children: (childrenMap.get(id) ?? [])
      .filter((cid) => hiddenSet.has(cid))
      .map((cid) => buildAll(cid))
      .sort(hiddenTreeSort),
  });
  const build = expand === "all" ? buildAll : null;

  const grouped = new Map<string | null, HiddenGroup>();
  for (const id of liveHiddenIds) {
    const key = nearestVisibleId(id, parentMap, hiddenSet);
    let group = grouped.get(key);
    if (!group) {
      const parentNode = key ? nodeMap.get(key) ?? null : null;
      group = { parentNode, parentPath: parentNode?.data.path ?? "", hiddenCount: 0, roots: [] };
      grouped.set(key, group);
    }
    group.hiddenCount += 1;
    // Root of its branch: its parent is visible, or it has no parent at all.
    const parentId = parentMap.get(id);
    if (parentId && hiddenSet.has(parentId)) continue;
    group.roots.push(build ? build(id) : { node: nodeMap.get(id)!, children: NO_CHILDREN });
  }

  const groups = [...grouped.values()];
  // A group with no roots can only come from a cycle of hidden nodes (every
  // hidden id's parent is itself hidden, so none of them starts a branch). It
  // has no revealable row, and the recursive builder dropped it too — keep that.
  const revealable = groups.filter((g) => g.roots.length > 0);
  for (const g of revealable) g.roots.sort(hiddenTreeSort);
  // A→Z by folder label keeps the list scannable and predictable for new users.
  revealable.sort((a, b) =>
    (a.parentNode?.data.label ?? "").localeCompare(b.parentNode?.data.label ?? ""),
  );
  return revealable;
}

/**
 * Index a built tree's children by the CHILD-holding node's id, so a row can
 * expand from the (possibly search-pruned) tree in O(1) instead of scanning it.
 * Note a group's visible context folder is not itself a node in the tree — it
 * has no row and needs no entry.
 */
export function indexHiddenTreeChildren(groups: HiddenGroup[]): Map<string, HiddenTreeNode[]> {
  const byParent = new Map<string, HiddenTreeNode[]>();
  const walk = (list: HiddenTreeNode[]) => {
    for (const t of list) {
      if (t.children.length === 0) continue;
      byParent.set(t.node.id, t.children);
      walk(t.children);
    }
  };
  for (const g of groups) walk(g.roots);
  return byParent;
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
  return ancestorChainOf(id, parentMapOf(edges));
}

/**
 * Node ids to ring on canvas when a Hidden-panel row is hovered: the row's node
 * itself and its full ancestor chain (so the visible folder cards up to the root
 * glow), plus — for a folder group hover — the group's hidden ROOTS.
 *
 * Roots only, no descent. A hidden card is painted in one of two places: as its
 * own card (it can't — it's hidden) or as a dimmed child row inside its parent's
 * folder card. So the only hidden ids a hover can visibly colour are the ones
 * whose parent is a VISIBLE folder — exactly the group roots. A deeper hidden
 * descendant's parent is itself hidden, so no card renders a row for it. The
 * descent it replaced therefore coloured nothing while pushing every id in the
 * subtree through the store on each hover (5,002 ids for one Hide Children
 * subtree) and making every card and child row scan that array.
 */
export function buildRingIds(
  nodeId: string | null | undefined,
  edges: FewerEdge[],
  subtreeRoots?: HiddenTreeNode[],
): string[] {
  if (!nodeId) return [];
  const ids = [nodeId, ...ancestorChain(nodeId, edges)];
  if (subtreeRoots) for (const root of subtreeRoots) ids.push(root.node.id);
  return ids;
}


