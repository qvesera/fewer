/**
 * Canvas groups (T-124) — the model half.
 *
 * A group is a titled, noted box of explicitly-listed node ids, drawn as a
 * gray frame behind the member cards (T-125 renders it). Membership is an
 * explicit id list, never "whatever happens to sit inside the box": layout
 * moves cards on every re-flow, so geometric membership would silently rewrite
 * itself — and an explicit list survives undo, refresh, and relayout.
 *
 * Pure module: no store, no React, no DOM. Node/edge/position lookups all take
 * `nodes` as an argument, so the rules are testable without a graph store.
 */
import type { FewerNode, LayoutDirection } from "./types";

/** One group: a title, a note, and the node ids it owns. */
export interface Group {
  /** Stable id (`g-…`), independent of node ids. */
  id: string;
  /** Short title shown on the frame header. */
  title: string;
  /** Free-text note shown on hover over the title (T-125). */
  note: string;
  /** Explicit membership, in the order it was built. Always CARDS only — a
   *  nested child group is referenced via `parentId`, never listed here. */
  memberIds: string[];
  /** Nesting (W4): the id of the containing group. Absent = root-level group.
   *  Cycles and dangling parents are repaired in `normalizeGroups`, so a
   *  loaded graph is always a forest. */
  parentId?: string;
  /** Frame color (hex). Absent = the default slate; dropped on load when
   *  malformed, so a hand-edited `.fwr` cannot paint an invalid border. */
  color?: string;
}

/** Gap between the member bounding box and the frame edge. */
export const GROUP_PADDING = 24;

/** Header height the frame reserves so the title never overlaps a card. */
export const GROUP_HEADER_HEIGHT = 32;

/** Collapsed frames shrink to a pill anchored where the cluster was, so the
 *  group stays findable after its cards are hidden. */
/** Collapsed-group pill: the FLOOR for the pill's width and its height. The
 *  rendered pill is content-driven (a long title widens it — T-142); this
 *  keeps short ones reading as a card, not a chip. Card-sized to match a
 *  collapsed folder pill (same shell family, T-139). */
export const COLLAPSED_PILL_WIDTH = 240;
export const COLLAPSED_PILL_HEIGHT = 48;

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Geometry of a collapsed group: a fixed-size pill at the cluster's flow-START
 * corner — placement follows the layout direction instead of always reading as
 * top-bottom:
 *
 * - TB / LR → top-left corner (unchanged, the historical default),
 * - BT      → the far corner below the cluster (flow starts at the bottom),
 * - RL      → the far corner past the cluster's right (flow starts at the right).
 *
 * `bounds` is `groupBounds` output (padded cluster, header reserved above), so
 * the far corner sits exactly `GROUP_PADDING` past the CARDS' edge on the
 * primary axis. The cross-axis corner stays at the cluster's start (top for
 * BT/RL), matching TB's top-left convention.
 */
export function groupPill(bounds: GroupBounds, direction: LayoutDirection = "TB"): GroupBounds {
  const x = direction === "RL" ? bounds.x + bounds.width : bounds.x;
  const y = direction === "BT" ? bounds.y + bounds.height : bounds.y;
  return { x, y, width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT };
}

/** Rendered size of a card. React Flow reports the real size in `measured`,
 *  and a folder card grows well past its nominal height once it lists children
 *  — reading only `style` made frames too short, so cards spilled out of the
 *  box. Precedence mirrors layout.ts: measured wins for height, style for width. */
export function nodeRenderedSize(node: FewerNode): { w: number; h: number } {
  const w = (node.style?.width as number | undefined) || node.measured?.width || node.width || 0;
  const h = node.measured?.height || (node.style?.height as number | undefined) || node.height || 0;
  return { w, h };
}

/**
 * Bounding box of a group's members, padded, or `null` when none of them are on
 * the canvas.
 *
 * `visible` (optional) restricts the box to the members this VIEW paints — the
 * frame then hugs what the user actually sees, and a group whose members are
 * all hidden returns `null` (nothing to frame). Hidden members still count
 * without it: a collapsed group keeps the footprint the cluster had, so its
 * pill lands where the cards were.
 */
export function groupBounds(
  nodes: readonly FewerNode[],
  memberIds: readonly string[],
  padding = GROUP_PADDING,
  visible?: ReadonlySet<string>,
  /** Per-view position override (`viewSettings[leafId].positions`). When a canvas
   *  has one, cards paint from it, not from shared `nodes[].position` — so the
   *  frame must measure the same coordinates or it detaches from the cluster
   *  (T-137: handles moved the invisible shared coords while the cards stayed). */
  viewPositions?: ReadonlyMap<string, { x: number; y: number }>,
): GroupBounds | null {
  const members = new Set(memberIds);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = 0;

  for (const node of nodes) {
    if (!members.has(node.id)) continue;
    if (visible && !visible.has(node.id)) continue;
    const { w, h } = nodeRenderedSize(node);
    const { x, y } = viewPositions?.get(node.id) ?? node.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
    found++;
  }

  if (found === 0) return null;
  // The header strip is RESERVED height above the cards, not padding inside
  // them — otherwise a tall card slides under the title (and its hover note).
  return {
    x: minX - padding,
    y: minY - padding - GROUP_HEADER_HEIGHT,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2 + GROUP_HEADER_HEIGHT,
  };
}

/**
 * Non-member cards that sit ENTIRELY inside a group's box (T-141).
 *
 * Membership is explicit, so a re-flow can park a stranger inside the frame —
 * the box then reads as "containing" a card the group does not own. The group
 * menu offers to include exactly these, so box and membership can agree again.
 * Fully-contained only: a card straddling the border belongs to the layout,
 * not to the group.
 */
export function cardsInsideBox(
  nodes: FewerNode[],
  box: GroupBounds,
  memberIds: readonly string[],
  visible?: ReadonlySet<string>,
): string[] {
  const members = new Set(memberIds);
  const inside: string[] = [];
  for (const node of nodes) {
    if (members.has(node.id)) continue;
    if (visible && !visible.has(node.id)) continue;
    const { w, h } = nodeRenderedSize(node);
    if (
      node.position.x >= box.x &&
      node.position.y >= box.y &&
      node.position.x + w <= box.x + box.width &&
      node.position.y + h <= box.y + box.height
    ) {
      inside.push(node.id);
    }
  }
  return inside;
}

/** Construct a group. Id comes from the caller so this stays pure. */
export function newGroup(id: string, title: string, memberIds: readonly string[]): Group {
  return {
    id,
    title: title.trim() || "Untitled group",
    note: "",
    memberIds: dedupe(memberIds),
  };
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Valid six-digit hex, lowercased; anything else → undefined (frame keeps the
 *  default). Shared by the load-time repair and the store action. */
export function normalizeGroupColor(color: unknown): string | undefined {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined;
}

/**
 * Repair a loaded group list: drop dangling member ids (nodes deleted since
 * the save), de-duplicate, drop groups left with no members, and clamp the
 * title. Runs on load so a hand-edited `.fwr` cannot put the frame renderer in
 * a state it was never designed for.
 */
export function normalizeGroups(groups: readonly Group[] | undefined, nodeIds: ReadonlySet<string>): Group[] {
  if (!Array.isArray(groups)) return [];

  // Pass 1 — structural validation: keep the id, coerce title/note/color, drop
  // card refs that don't exist, and carry a RAW parentId (never self). A group
  // is kept even with zero own cards for now — a parent containing only
  // subgroups is still a group.
  const kept = new Map<string, Group>();
  for (const g of groups) {
    if (!g || typeof g.id !== "string" || !g.id) continue;
    if (kept.has(g.id)) continue; // duplicate id — first wins
    const memberIds = dedupe(g.memberIds ?? []).filter((id) => nodeIds.has(id));
    kept.set(g.id, {
      id: g.id,
      title: (typeof g.title === "string" ? g.title : "").slice(0, 80) || "Untitled group",
      note: typeof g.note === "string" ? g.note : "",
      memberIds,
      ...(() => {
        const color = normalizeGroupColor(g.color);
        return color ? { color } : {};
      })(),
      ...(typeof g.parentId === "string" && g.parentId && g.parentId !== g.id ? { parentId: g.parentId } : {}),
    });
  }

  // Pass 2 — drop parentIds that don't point at a surviving group (dangling).
  for (const node of kept.values()) {
    if (node.parentId !== undefined && !kept.has(node.parentId)) delete node.parentId;
  }

  // Pass 3 — break any cycle by clearing the parentId of the first node we
  // revisit walking up the chain, so a loaded graph is always a forest.
  for (const start of kept.keys()) {
    const path = new Set<string>();
    let cur = start;
    while (kept.has(cur)) {
      if (path.has(cur)) {
        delete kept.get(cur)!.parentId;
        break;
      }
      path.add(cur);
      const p = kept.get(cur)!.parentId;
      if (p === undefined) break;
      cur = p;
    }
  }

  // Pass 4 — drop degenerate empty groups (no cards AND no children) to a fixed
  // point: removing a childless empty group can leave its parent empty. A group
  // with cards, or with surviving children, is always kept.
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of [...kept.values()]) {
      if (node.memberIds.length > 0) continue;
      const hasChildren = [...kept.values()].some((c) => c.parentId === node.id);
      if (!hasChildren) {
        kept.delete(node.id);
        changed = true;
      }
    }
  }

  return [...kept.values()];
}

/** id → group. */
export function groupsIndexOf(groups: readonly Group[]): Map<string, Group> {
  return new Map(groups.map((g) => [g.id, g]));
}

/**
 * node id → the group owning it. A node belongs to at most one group — the
 * first group listing it wins, and `normalizeGroups` never reorders, so the
 * winner is deterministic on load.
 */
export function membershipMap(groups: readonly Group[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.memberIds) {
      if (!owner.has(id)) owner.set(id, g.id);
    }
  }
  return owner;
}

// ── Nesting (W4) ────────────────────────────────────────────────────────────
// A group may contain other groups through `parentId`, forming a forest.
// Membership (`memberIds`) stays CARDS ONLY — a child group is linked by
// `parentId`, so "everything a group owns" = its own cards + its descendants'
// cards. `normalizeGroups` guarantees no cycles / dangling parents, so these
// walks always terminate.

/** Direct child groups of `id` (groups whose parentId === id). */
export function childGroups(groups: readonly Group[], id: string): Group[] {
  return groups.filter((g) => g.parentId === id);
}

/** Transitive closure of `id`'s descendant group ids (excludes `id` itself). */
export function descendantGroupIds(groups: readonly Group[], id: string): Set<string> {
  const out = new Set<string>();
  const stack = childGroups(groups, id).map((g) => g.id);
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue; // defensive: a cycle cannot survive normalize, but never hang
    out.add(cur);
    for (const c of childGroups(groups, cur)) stack.push(c.id);
  }
  return out;
}

/** All cards a group owns: its own members plus every descendant's members. */
export function subtreeMemberIds(groups: readonly Group[], id: string): string[] {
  const root = groups.find((g) => g.id === id);
  if (!root) return [];
  const out = [...root.memberIds];
  const seen = new Set(root.memberIds);
  for (const did of descendantGroupIds(groups, id)) {
    const d = groups.find((g) => g.id === did);
    if (!d) continue;
    for (const m of d.memberIds) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

/** True when re-parenting `id` under `parentId` would BREAK the forest: the
 *  target must exist, must not be `id`, and must not be a descendant of `id`. */
export function wouldCreateCycle(groups: readonly Group[], id: string, parentId: string): boolean {
  if (id === parentId) return true;
  if (!groups.some((g) => g.id === parentId)) return true;
  return descendantGroupIds(groups, id).has(parentId);
}

// ── Recursive frame geometry (W5) ───────────────────────────────────────────
// A parent's frame must CONTAIN its children's frames (else they overlap), a
// collapsed ancestor suppresses its whole subtree (no orphan pills), and
// children paint ABOVE parents. All rects are in `groupBounds` space: the box
// already includes the header strip at its top, so nesting works below it.

/** Depth = number of ancestors (roots are 0). Drives paint order: parents first. */
export function groupDepth(groups: readonly Group[], id: string): number {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const seen = new Set<string>();
  let depth = 0;
  let cur = byId.get(id);
  while (cur && cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId.get(cur.parentId);
    if (!next) break;
    depth++;
    cur = next;
  }
  return depth;
}

function padRect(r: GroupBounds, p: number): GroupBounds {
  return { x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 };
}

function unionRect(a: GroupBounds, b: GroupBounds): GroupBounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * Final frame rect for every group that draws, nesting- and cascade-aware.
 *
 * - `painted` measures EXPANDED members (the canvas's painted array).
 * - `anchor` measures COLLAPSED pills (store nodes + per-view positions, so
 *   hidden members still anchor the pill where the cluster was).
 * - A collapsed group becomes a pill over its whole SUBTREE's cards, anchored
 *   at the layout direction's flow-start corner; its descendants are suppressed
 *   (draw nothing).
 * - A parent's rect contains each child's rect (padded) so frames never overlap.
 * - Groups with nothing to draw are omitted; `order` is paint order (parents
 *   before children, so children render above).
 */
/** Identity-stable "nothing collapsed" default for `groupFrameRects`. */
const EMPTY_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * Cards hidden by THIS set of collapsed groups — the union of each group's
 * whole subtree (W5 cascade: collapsing a group hides its nested groups' cards
 * too). A leaf's effective hidden derives from it (T-164), so the pill and the
 * hidden set can never disagree the way the old stored `collapsed` flag plus a
 * hiddenIds write did.
 */
export function collapsedGroupMembers(
  groups: readonly Group[],
  collapsedIds: ReadonlySet<string> | readonly string[],
): string[] {
  const ids = collapsedIds instanceof Set ? collapsedIds : new Set(collapsedIds);
  if (ids.size === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    if (!ids.has(g.id)) continue;
    for (const m of subtreeMemberIds(groups, g.id)) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * Groups a reveal gesture has to OPEN (T-167): every group in `collapsedIds`
 * whose SUBTREE contains one of the revealed ids. A collapsed group is a pill
 * INSTEAD of its members' cards, so the moment a gesture wants a member on
 * canvas the pill has to become a frame — in this view only (collapse is
 * per-view since T-164), and ancestors open too (a nested pill would still
 * suppress the frame). Null when nothing intersects, so a reveal that never
 * touched a collapsed group stays a no-op write.
 */
export function groupsOpenedByReveal(
  groups: readonly Group[],
  collapsedIds: readonly string[],
  revealedIds: Iterable<string>,
): string[] | null {
  if (collapsedIds.length === 0) return null;
  const revealed = revealedIds instanceof Set ? revealedIds : new Set(revealedIds);
  if (revealed.size === 0) return null;
  const byId = groupsIndexOf(groups);
  const kept = collapsedIds.filter((id) => {
    const g = byId.get(id);
    // A dead id (group deleted or loaded away) is inert — leave it alone;
    // this gesture's business is the cards it reveals.
    if (!g) return true;
    return !subtreeMemberIds(groups, id).some((m) => revealed.has(m));
  });
  return kept.length === collapsedIds.length ? null : kept;
}

export function groupFrameRects(
  groups: readonly Group[],
  painted: readonly FewerNode[],
  anchor: readonly FewerNode[],
  visible?: ReadonlySet<string>,
  direction: LayoutDirection = "TB",
  /** Which groups THIS view has collapsed — per-leaf since T-164, so the pure
   *  pass takes it instead of reading a flag off the group (whose collapse is
   *  no longer stored on the group at all). */
  collapsedIds: ReadonlySet<string> = EMPTY_COLLAPSED,
): { rects: Map<string, GroupBounds>; order: string[] } {
  const byId = new Map(groups.map((g) => [g.id, g]));

  // Cascade: a group is suppressed when any ANCESTOR is collapsed.
  const suppressed = new Set<string>();
  const isSuppressed = (id: string): boolean => {
    const seen = new Set<string>();
    let cur = byId.get(id);
    while (cur && cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (collapsedIds.has(cur.parentId)) return true;
      const next = byId.get(cur.parentId);
      if (!next) break;
      cur = next;
    }
    return false;
  };
  for (const g of groups) if (isSuppressed(g.id)) suppressed.add(g.id);

  const memo = new Map<string, GroupBounds | null>();
  const rect = (id: string): GroupBounds | null => {
    if (memo.has(id)) return memo.get(id)!;
    const g = byId.get(id);
    if (!g || suppressed.has(id)) {
      memo.set(id, null);
      return null;
    }
    let out: GroupBounds | null;
    if (collapsedIds.has(g.id)) {
      // Anchor the pill on the whole subtree's cards (store coords — they're hidden).
      const ids = subtreeMemberIds(groups, id);
      const own = groupBounds(anchor, ids) ?? groupBounds(painted, ids, GROUP_PADDING, visible);
      out = own ? groupPill(own, direction) : null;
    } else {
      // Own content (header already reserved by groupBounds), minus the header
      // so children union into the region BELOW the header.
      const own = groupBounds(painted, g.memberIds, GROUP_PADDING, visible);
      let content: GroupBounds | null = own
        ? { x: own.x, y: own.y + GROUP_HEADER_HEIGHT, width: own.width, height: own.height - GROUP_HEADER_HEIGHT }
        : null;
      for (const c of childGroups(groups, id)) {
        const cr = rect(c.id);
        if (cr) {
          const padded = padRect(cr, GROUP_PADDING);
          content = content ? unionRect(content, padded) : padded;
        }
      }
      out = content
        ? { x: content.x, y: content.y - GROUP_HEADER_HEIGHT, width: content.width, height: content.height + GROUP_HEADER_HEIGHT }
        : null;
    }
    memo.set(id, out);
    return out;
  };

  const rects = new Map<string, GroupBounds>();
  for (const g of groups) {
    const r = rect(g.id);
    if (r) rects.set(g.id, r);
  }
  const order = groups
    .filter((g) => rects.has(g.id))
    .map((g) => g.id)
    .sort((a, b) => groupDepth(groups, a) - groupDepth(groups, b));
  return { rects, order };
}

// ── Resize-by-scale (T-136) ────────────────────────────────────────────────
// A selected frame grows corner/edge handles; dragging one SCALES the member
// arrangement around a fixed origin (the opposite corner/edge). Cards keep
// their size — only their offsets from the origin are multiplied — and the
// frame stores no geometry: the box is always re-derived from the members, so
// this is pure `move-positions` (one undo op per gesture, nothing persisted).

export type GroupHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const GROUP_HANDLES: readonly GroupHandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Which axes a handle drives: corners scale both, edges one. */
export function handleAxes(id: GroupHandleId): { x: boolean; y: boolean } {
  const x = id.includes("e") || id.includes("w");
  const y = id.includes("n") || id.includes("s");
  return { x, y };
}

/** The fixed point of the scale: the point/edge OPPOSITE the dragged handle. */
export function handleOrigin(id: GroupHandleId, box: GroupBounds): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  switch (id) {
    case "nw": return { x: box.x + box.width, y: box.y + box.height };
    case "se": return { x: box.x, y: box.y };
    case "ne": return { x: box.x, y: box.y + box.height };
    case "sw": return { x: box.x + box.width, y: box.y };
    case "n": return { x: cx, y: box.y + box.height };
    case "s": return { x: cx, y: box.y };
    case "e": return { x: box.x, y: cy };
    case "w": return { x: box.x + box.width, y: cy };
  }
}

/** Below this the frame would swallow its own cards: padding×2 + header + one card. */
export const GROUP_MIN_BOX = {
  width: GROUP_PADDING * 2 + 120,
  height: GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT + 60,
} as const;

/** Smallest scale that keeps the frame at least GROUP_MIN_BOX. Above 1 when the
 *  box is already under the minimum — then the gesture may only grow it. */
export function minScaleFor(box: GroupBounds): { x: number; y: number } {
  return {
    x: GROUP_MIN_BOX.width / Math.max(1, box.width),
    y: GROUP_MIN_BOX.height / Math.max(1, box.height),
  };
}

/**
 * Scale factor for one axis: how far the pointer sits from the origin now,
 * relative to where the gesture started. A degenerate start (handle on the
 * origin) pins the axis at 1 — there is no reference length to scale from.
 */
export function scaleFactorFor(current: number, origin: number, start: number, min: number): number {
  const ref = start - origin;
  if (Math.abs(ref) < 1) return 1;
  return Math.max(min, (current - origin) / ref);
}

/**
 * New member positions for a scale: `to = origin + (from − origin) × (sx, sy)`.
 * Cards keep their own size; only offsets scale. Pure — the gesture feeds it
 * the captured start positions every frame so nothing drifts.
 */
export function scaleMemberPositions(
  starts: ReadonlyMap<string, { x: number; y: number }>,
  origin: { x: number; y: number },
  sx: number,
  sy: number,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const [id, p] of starts) {
    out[id] = {
      x: origin.x + (p.x - origin.x) * sx,
      y: origin.y + (p.y - origin.y) * sy,
    };
  }
  return out;
}