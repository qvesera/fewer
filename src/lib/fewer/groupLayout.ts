/**
 * Collapsed groups as real layout blocks (T-179, issue #437).
 *
 * A collapsed group is drawn as a pill, so the layout must reserve exactly one
 * pill-sized slot for it — otherwise the tree either keeps the whole expanded
 * member block (a multi-card hole in TB) or compacts over it and strands the
 * pill at coordinates from another layout (any view that derives its own,
 * e.g. every non-TB direction).
 *
 * The block is a SYNTHETIC node in the layout input: the group's member cards
 * are replaced by one node sized `COLLAPSED_PILL_WIDTH × COLLAPSED_PILL_HEIGHT`
 * carrying the first member's `data` (so sibling sort order does not jump) and
 * with the members' edges redirected onto it. After the layout the synthetic
 * node's resolved position IS the pill rect — direction, centering and spacing
 * fall out of the engine, and no coordinate space is ever mixed.
 *
 * Pure module: no store, no React, no DOM.
 */
import type { FewerEdge, FewerNode } from "./types";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  groupsIndexOf,
  subtreeMemberIds,
  type Group,
  type GroupBounds,
} from "./groups";

/** Prefix of a synthetic pill node's id — never painted, never in the store. */
const PILL_ID_PREFIX = "__group_pill__:";

/** Id of the synthetic layout node standing in for a collapsed group. */
export function groupPillNodeId(groupId: string): string {
  return `${PILL_ID_PREFIX}${groupId}`;
}

/** True for a synthetic pill node id (so no consumer mistakes it for a card). */
export function isGroupPillNodeId(id: string): boolean {
  return id.startsWith(PILL_ID_PREFIX);
}

/**
 * The groups this view collapses INTO A BLOCK: every id in `collapsedIds`,
 * minus the ones a collapsed ancestor already covers (an ancestor's pill hides
 * the whole subtree, so a nested pill would never be seen and would take its
 * cards out of the layout twice).
 */
export function collapsedGroupBlocks(
  groups: readonly Group[],
  collapsedIds: readonly string[],
): Group[] {
  if (collapsedIds.length === 0 || groups.length === 0) return [];
  const collapsed = new Set(collapsedIds);
  const byId = groupsIndexOf(groups);
  const hasCollapsedAncestor = (g: Group): boolean => {
    const seen = new Set<string>();
    let cur = g.parentId ? byId.get(g.parentId) : undefined;
    while (cur && !seen.has(cur.id)) {
      if (collapsed.has(cur.id)) return true;
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  return groups.filter((g) => collapsed.has(g.id) && !hasCollapsedAncestor(g));
}

export interface CollapsedLayoutInput {
  /** Layout input: the visible cards minus the collapsed members, plus pills. */
  nodes: FewerNode[];
  /** Layout input: edges re-pointed at the pills (deduped, self-loops dropped). */
  edges: FewerEdge[];
  /** groupId → synthetic node id, for the groups that got a block. */
  pillNodes: Map<string, string>;
}

/**
 * Replace each collapsed group's member cards with one pill-sized synthetic
 * node. Returns `nodes`/`edges` by identity when nothing collapses.
 *
 * Members are `subtreeMemberIds` (a group's own cards plus every descendant
 * group's), so a nested group is covered by its ancestor's block — and a
 * member that is itself a folder keeps its children, which are re-parented
 * onto the pill (collapse hides the member card, not its tree).
 */
export function collapseToLayoutBlocks(
  nodes: readonly FewerNode[],
  edges: readonly FewerEdge[],
  groups: readonly Group[],
  collapsedIds: readonly string[],
): CollapsedLayoutInput {
  const blocks = collapsedGroupBlocks(groups, collapsedIds);
  if (blocks.length === 0) return { nodes: [...nodes], edges: [...edges], pillNodes: new Map() };

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  /** member card id → the synthetic node that replaces it. */
  const replace = new Map<string, string>();
  const pills: FewerNode[] = [];
  const pillNodes = new Map<string, string>();

  for (const g of blocks) {
    const present = subtreeMemberIds(groups, g.id).filter((id) => nodeById.has(id));
    if (present.length === 0) continue; // every member is hidden/deleted: nothing to reserve
    const id = groupPillNodeId(g.id);
    // The pill inherits the FIRST member's data (label/type/extension/size), so
    // its place in the sibling sort is where the cluster started.
    const proto = nodeById.get(present[0])!;
    pills.push({
      ...proto,
      id,
      position: { x: 0, y: 0 },
      style: { ...proto.style, width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT },
    } as FewerNode);
    for (const m of present) replace.set(m, id);
    pillNodes.set(g.id, id);
  }
  if (pills.length === 0) return { nodes: [...nodes], edges: [...edges], pillNodes: new Map() };

  const nextNodes = [...nodes.filter((n) => !replace.has(n.id)), ...pills];

  // Re-point edges at the pills. Several members share one parent, so the
  // redirect can produce the same edge several times — a duplicate would lay
  // the pill out once per copy; a member→member edge inside the group becomes
  // a self-loop and disappears.
  const seen = new Set<string>();
  const nextEdges: FewerEdge[] = [];
  for (const e of edges) {
    const source = replace.get(e.source) ?? e.source;
    const target = replace.get(e.target) ?? e.target;
    if (source === target) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nextEdges.push(
      source === e.source && target === e.target
        ? e
        : { ...e, id: key, source, target },
    );
  }

  return { nodes: nextNodes, edges: nextEdges, pillNodes };
}

/**
 * Read the pill rects back out of the laid-out node array: the synthetic
 * node's resolved top-left and the pill's size, in the layout's own
 * coordinates (so the rect is correct in every direction).
 */
export function pillRectsFrom(
  laidNodes: readonly FewerNode[],
  pillNodes: ReadonlyMap<string, string>,
): Map<string, GroupBounds> {
  const out = new Map<string, GroupBounds>();
  if (pillNodes.size === 0) return out;
  const byId = new Map(laidNodes.map((n) => [n.id, n]));
  for (const [groupId, nodeId] of pillNodes) {
    const n = byId.get(nodeId);
    if (!n) continue;
    out.set(groupId, {
      x: n.position.x,
      y: n.position.y,
      width: COLLAPSED_PILL_WIDTH,
      height: COLLAPSED_PILL_HEIGHT,
    });
  }
  return out;
}

/** Drop the synthetic pill nodes from a laid-out array (they are never painted). */
export function stripPillNodes(laidNodes: readonly FewerNode[]): FewerNode[] {
  return laidNodes.filter((n) => !isGroupPillNodeId(n.id));
}
