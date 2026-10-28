/**
 * Collapsed groups as real layout blocks (T-179/T-180, issues #437/#439).
 *
 * A collapsed group is drawn as a pill, so the layout must reserve exactly one
 * pill-sized slot for it — otherwise the tree either keeps the whole expanded
 * member block (a multi-card hole in TB) or compacts over it and strands the
 * pill at coordinates from another layout (any view that derives its own,
 * e.g. every non-TB direction).
 *
 * Two shapes of group, two modes (T-180):
 *
 * - COMPACT — a run of LEAF cards under at most one visible parent: the
 *   members are replaced by ONE synthetic node sized
 *   `COLLAPSED_PILL_WIDTH × COLLAPSED_PILL_HEIGHT`, carrying the first
 *   member's `data` (so sibling sort order does not jump) with the members'
 *   edges redirected onto it. The engine places it in the view's own
 *   coordinates and the resolved position IS the pill rect.
 * - ANCHOR — anything else (members with visible children outside the group,
 *   members under several parents, an ancestor and its descendant in the same
 *   group): nothing is re-parented. The members stay in the layout as
 *   invisible geometry, so their subtrees keep their depth and position, and
 *   the pill rect is derived from the members' laid-out block at the
 *   flow-start corner. Re-parenting here is what put a pill in another column
 *   and promoted a depth level (#439).
 *
 * The pill is a REAL node (`type: "groupPill"`), so its inherited connections
 * are ordinary React Flow edges re-pointed at it (`pillsForViewEdges`) — the
 * same renderer, style, dash and width as every folder→file edge, no drawn
 * stub layer.
 *
 * Pure module: no store, no React, no DOM.
 */
import type { FewerEdge, FewerNode, LayoutDirection } from "./types";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  groupBounds,
  groupPill,
  groupsIndexOf,
  subtreeMemberIds,
  type Group,
  type GroupBounds,
} from "./groups";

/** Prefix of a synthetic pill node's id — never in the store, only painted. */
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

/**
 * Can this collapsed group be ONE compact pill block? (T-180)
 *
 * Only when the members form a run of leaf cards under at most one visible
 * parent, because compacting re-parents everything onto the pill:
 *
 * - a member with visible children OUTSIDE the group → those columns would be
 *   pulled up a level and re-flowed (the multi-level stretch of #439), and the
 *   pill cannot hold a folder's whole subtree as a row;
 * - members under MORE THAN ONE parent → the block becomes a child of both:
 *   `parentMap` keeps the last edge (the pill lands in an arbitrary subtree)
 *   while every other parent reserves a phantom slot for it;
 * - a member→member edge (an ancestor and its descendant both in the group)
 *   would collapse to a self-loop and silently delete a level.
 *
 * `edges` are the layout-input edges (hidden edges already filtered out), so
 * "visible children" and "visible parents" mean exactly that.
 */
export function isCompactLeafRun(
  memberIds: readonly string[],
  edges: readonly FewerEdge[],
): boolean {
  const members = new Set(memberIds);
  if (members.size === 0) return false;
  const parents = new Set<string>();
  for (const e of edges) {
    if (members.has(e.source) && members.has(e.target)) return false; // internal level
    if (members.has(e.source) && !members.has(e.target)) return false; // member with outside children
    if (members.has(e.target) && !members.has(e.source)) parents.add(e.source);
  }
  return parents.size <= 1;
}

export interface CollapsedLayoutInput {
  /** Layout input: the visible cards, plus the synthetic pills (compact groups only). */
  nodes: FewerNode[];
  /** Layout input: edges re-pointed at the pills (deduped, self-loops dropped). */
  edges: FewerEdge[];
  /** groupId → synthetic node id, for the groups that COMPACT. */
  pillNodes: Map<string, string>;
  /** groupId → the member cards left IN the layout as invisible geometry. */
  anchored: Map<string, string[]>;
}

/** Nothing to do: the input passes through unchanged. */
function unchanged(nodes: readonly FewerNode[], edges: readonly FewerEdge[]): CollapsedLayoutInput {
  return { nodes: [...nodes], edges: [...edges], pillNodes: new Map(), anchored: new Map() };
}

/**
 * Split each collapsed group into a compact block or an anchor, per
 * `isCompactLeafRun`. Returns `nodes`/`edges` unchanged when nothing compacts.
 */
export function collapseToLayoutBlocks(
  nodes: readonly FewerNode[],
  edges: readonly FewerEdge[],
  groups: readonly Group[],
  collapsedIds: readonly string[],
): CollapsedLayoutInput {
  const blocks = collapsedGroupBlocks(groups, collapsedIds);
  if (blocks.length === 0) return unchanged(nodes, edges);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  /** member card id → the synthetic node that replaces it (compact only). */
  const replace = new Map<string, string>();
  const anchored = new Map<string, string[]>();
  const pills: FewerNode[] = [];
  const pillNodes = new Map<string, string>();

  for (const g of blocks) {
    const present = subtreeMemberIds(groups, g.id).filter((id) => nodeById.has(id));
    if (present.length === 0) continue; // every member is hidden/deleted: nothing to reserve
    if (!isCompactLeafRun(present, edges)) {
      anchored.set(g.id, present);
      continue;
    }
    const id = groupPillNodeId(g.id);
    // The pill inherits the FIRST member's data (label/type/extension/size), so
    // its place in the sibling sort is where the cluster started. Its RF node
    // type is `groupPill`, so the canvas paints a handle-bearing stub instead of
    // a card, and `data.groupId` ties it back to the group.
    const proto = nodeById.get(present[0])!;
    pills.push(makePillNode(g, proto, { x: 0, y: 0 }));
    for (const m of present) replace.set(m, id);
    pillNodes.set(g.id, id);
  }
  if (pills.length === 0) {
    // Anchors only: the layout input is untouched (the members were never in it
    // twice) — the pill rects come from their laid-out block instead.
    return { nodes: [...nodes], edges: [...edges], pillNodes, anchored };
  }

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

  return { nodes: nextNodes, edges: nextEdges, pillNodes, anchored };
}

/**
 * The pill NODE: a real React Flow node (`type: "groupPill"`) the edge layer
 * can attach to, so a collapsed group's connections are ordinary edges instead
 * of a drawn stub layer. `GroupPillNode` paints a transparent body + the four
 * handles; the visible shell is still `GroupFrame`'s, at the same rect.
 *
 * `proto` supplies the card data (sibling sort must not jump); `data.groupId`
 * ties the node back to its group, `data.anchor` marks a post-layout injection.
 */
export function makePillNode(
  group: Group,
  proto: FewerNode,
  position: { x: number; y: number },
  anchored = false,
): FewerNode {
  return {
    ...proto,
    id: groupPillNodeId(group.id),
    type: "groupPill",
    position,
    data: { ...proto.data, groupId: group.id, anchor: anchored },
    style: { ...proto.style, width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT },
  } as FewerNode;
}

/**
 * Anchor groups' pills, injected AFTER positions are applied (T-180): a
 * compact group's pill arrives from the layout, but an anchor group never runs
 * a pass — its members stay invisible geometry — so its pill is placed on their
 * block (`groupPill`, the invariant #439 was about) with no re-flow.
 *
 * `members` is where to FIND the hidden members (the store list with the
 * leaf's positions overlaid): they are hidden from the paint, so a single
 * array could never show them.
 */
export function injectGroupPillNodes(
  painted: readonly FewerNode[],
  members: readonly FewerNode[],
  groups: readonly Group[],
  collapsedIds: readonly string[],
  direction: LayoutDirection,
): FewerNode[] {
  // Identity-stable when there is nothing to inject: a pass-through must not
  // clone the whole array (callers hand it straight to React Flow).
  if (collapsedIds.length === 0) return painted as FewerNode[];
  const paintedIds = new Set(painted.map((n) => n.id));
  const byMemberId = new Map(members.map((n) => [n.id, n]));
  let out: FewerNode[] | null = null;
  for (const g of collapsedGroupBlocks(groups, collapsedIds)) {
    if (paintedIds.has(groupPillNodeId(g.id))) continue; // compact pill: already laid out
    const memberIds = subtreeMemberIds(groups, g.id).filter((m) => byMemberId.has(m));
    if (memberIds.length === 0) continue;
    const bounds = groupBounds(members, memberIds);
    if (!bounds) continue;
    (out ??= [...painted]).push(
      makePillNode(g, byMemberId.get(memberIds[0])!, groupPill(bounds, direction), true),
    );
  }
  return out ?? (painted as FewerNode[]);
}

/**
 * Where `injectGroupPillNodes` should look for the hidden members: the LAID
 * members when the view derived a layout (same coordinates its visible cards
 * moved to), otherwise the store list filtered to this collapse's members.
 */
export function viewMemberNodes(
  laidMembers: readonly FewerNode[] | undefined,
  storeNodes: readonly FewerNode[],
  groups: readonly Group[],
  collapsedIds: readonly string[],
): readonly FewerNode[] {
  if (laidMembers) return laidMembers;
  if (collapsedIds.length === 0) return [];
  const ids = new Set<string>();
  for (const g of collapsedGroupBlocks(groups, collapsedIds)) {
    for (const m of subtreeMemberIds(groups, g.id)) ids.add(m);
  }
  return storeNodes.filter((n) => ids.has(n.id));
}

/**
 * The pills' inherited connections, as ORDINARY edges: every edge touching a
 * hidden member is re-pointed at that member's pill, deduped (several members
 * share one parent) with member→member self-loops dropped, and only when the
 * far end is painted. Same `id: source->target` convention as the compact
 * layout rewrite, so the two never collide. Derived from the edge list alone —
 * nothing enters the snapshot, the exporter, undo or the store.
 */
export function pillsForViewEdges(
  allEdges: readonly FewerEdge[],
  groups: readonly Group[],
  collapsedIds: readonly string[],
  hidden: ReadonlySet<string>,
  paintedIds: ReadonlySet<string>,
): FewerEdge[] {
  if (collapsedIds.length === 0) return [];
  const memberToPill = new Map<string, string>();
  for (const g of collapsedGroupBlocks(groups, collapsedIds)) {
    const pill = groupPillNodeId(g.id);
    for (const card of subtreeMemberIds(groups, g.id)) memberToPill.set(card, pill);
  }
  if (memberToPill.size === 0) return [];
  const pillIds = new Set(memberToPill.values());
  const seen = new Set<string>();
  const out: FewerEdge[] = [];
  for (const e of allEdges) {
    const source = memberToPill.get(e.source) ?? e.source;
    const target = memberToPill.get(e.target) ?? e.target;
    if (source === e.source && target === e.target) continue; // no member here
    if (source === target) continue; // inside the pill
    if (hidden.has(source) || hidden.has(target)) continue;
    // The far end must be painted; the pill end is exempt (it is a node this
    // function's callers inject, not a card in their visible list).
    if (!pillIds.has(source) && !paintedIds.has(source)) continue;
    if (!pillIds.has(target) && !paintedIds.has(target)) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      source === e.source && target === e.target
        ? e
        : { ...e, id: key, source, target },
    );
  }
  return out;
}

/**
 * The pill rects, read from the PAINTED pill nodes — compact and anchor alike,
 * after every overlay (per-view position overrides included), so the rect, the
 * node and its handles can never disagree. Feeds the frame shell and the
 * zoom-to-selection targets from one source.
 */
export function pillRectsFromNodes(
  nodes: readonly FewerNode[],
  groups: readonly Group[],
  collapsedIds: readonly string[],
): Map<string, GroupBounds> {
  const out = new Map<string, GroupBounds>();
  if (collapsedIds.length === 0) return out;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const g of collapsedGroupBlocks(groups, collapsedIds)) {
    const n = byId.get(groupPillNodeId(g.id));
    if (!n) continue;
    out.set(g.id, {
      x: n.position.x,
      y: n.position.y,
      width: (n.style?.width as number | undefined) ?? COLLAPSED_PILL_WIDTH,
      height: (n.style?.height as number | undefined) ?? COLLAPSED_PILL_HEIGHT,
    });
  }
  return out;
}

