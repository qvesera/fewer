import type { NodeHandle } from "@xyflow/react";
import { Position } from "@xyflow/react";
import type { FewerNode, LayoutDirection } from "./types";
import { getNodeDimensions } from "./layout";
import { getHandlePositions } from "./nodeDisplay";

/**
 * First-paint internals for React Flow, so culling works before the DOM exists
 * (T-225).
 *
 * RF's `getNodesInside` force-renders any node whose `internals.handleBounds`
 * is unset (`forceInitialRender = !handleBounds`), and a node with no
 * `measured`/`width` has zero area, which also reads as "visible" (`0 >= 0`).
 * On a fresh document no node has either, so the first pass mounted all 5 001
 * cards of the 5k fixture — each running the context menu's O(edges) scans —
 * which profiled as ~13.5 s of script, ~146k DOM nodes and a renderer crash at
 * 25k (`.agents/doc/2026-10-26-open-profile.md`, corrected by the T-225 A/B).
 *
 * The fix lives at the RF boundary only (the stamped node array, never the
 * store): unmeasured folder/file nodes get seeded `measured` + `handles` so the
 * first render culls to the viewport. The seed is *self-correcting*: the moment
 * RF reports real dimensions, `applyDimensionChanges` writes `measured` to the
 * store node, the seed drops, and `parseHandles` preserves the DOM-measured
 * `handleBounds` — so seeded geometry only ever serves nodes that have never
 * been in the viewport, whose handle anchors sit outside the screen anyway.
 *
 * Excluded from seeding:
 * - nodes with store `measured` (DOM path owns them from here),
 * - collapsed folders (`applyDimensionChanges` never writes their `measured`,
 *   so a seed would stick forever against pill geometry it does not model),
 * - `groupPill` nodes (one per collapsed group — cheap to force-render, and
 *   their card/handle geometry differs from folder/file cards).
 */

/** Tailwind `!h-2 !w-2` on every card handle, border-box (Tailwind preflight). */
const HANDLE_SIZE = 8;
/** Card root carries Tailwind `border` (1px); handle offsets resolve against
 *  the wrapper's border box, so the border is the only inset to account for. */
const CARD_BORDER = 1;

export interface SeedOptions {
  direction: LayoutDirection;
  /** Effective collapsed folders for THIS canvas (view-scoped). */
  collapsedIds: ReadonlySet<string>;
}

/** Same predicate the card uses to render the one-line pill (CustomNode). */
function isCollapsed(node: FewerNode, collapsedIds: ReadonlySet<string>): boolean {
  return node.data.collapsed === true || collapsedIds.has(node.id);
}

export function shouldSeedRfInternals(node: FewerNode, opts: SeedOptions): boolean {
  if (node.measured || node.handles) return false;
  if (node.type !== "folder" && node.type !== "file") return false;
  if (isCollapsed(node, opts.collapsedIds)) return false;
  return true;
}

/**
 * Handle rect in node-local border-box coords, matching what RF's
 * `getHandleBounds` would read off the DOM (`(handleRect − nodeRect) / zoom`,
 * 8×8 handle pinned to the padding edge by `.react-flow__handle-{side}`):
 * each side's center sits ON the padding edge (border in), half the handle
 * hangs outside the border box.
 */
function handleRect(position: Position, w: number, h: number): { x: number; y: number } {
  const c = HANDLE_SIZE / 2;
  const b = CARD_BORDER;
  switch (position) {
    case Position.Left:
      return { x: b - c, y: h / 2 - c };
    case Position.Right:
      return { x: w - b - c, y: h / 2 - c };
    case Position.Top:
      return { x: w / 2 - c, y: b - c };
    case Position.Bottom:
      return { x: w / 2 - c, y: h - b - c };
  }
}

function seedHandle(
  kind: "source" | "target",
  position: Position,
  w: number,
  h: number,
): NodeHandle {
  const { x, y } = handleRect(position, w, h);
  return {
    id: `${kind}-${position}`,
    type: kind,
    position,
    x,
    y,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  };
}

function seedNode(node: FewerNode, opts: SeedOptions): FewerNode {
  const { w, h } = getNodeDimensions(node);
  const { source, target } = getHandlePositions(opts.direction);
  return {
    ...node,
    measured: { width: w, height: h },
    handles: [seedHandle("source", source, w, h), seedHandle("target", target, w, h)],
  };
}

/**
 * Identity cache: the stamped array is rebuilt on every selection/position
 * re-stamp (drag frames included), so re-seeding on each pass would mint fresh
 * objects per call and defeat RF's `checkEquality` adoption + `stampSelection`
 * copy-on-write. Keyed by the store node (WeakMap — a node replaced by a
 * store update is collectable) with handles per layout direction, since a
 * direction switch moves source/target to the other axes and the cached
 * geometry must not be reused across it.
 */
const seedCache = new WeakMap<FewerNode, Map<LayoutDirection, FewerNode>>();

/**
 * Stamp first-paint `measured` + `handles` onto card nodes. Pure and
 * identity-stable: seeded outputs are cached per store node + direction (see
 * `seedCache` below), untouched nodes keep their identity, and inputs are never
 * mutated — so RF's `checkEquality` adoption and `stampSelection`'s
 * copy-on-write economics survive untouched (a drag re-stamps the whole array
 * every frame; without stable identities it would hand RF 5001 fresh objects
 * per frame and #281 would come back).
 *
 * Seeded geometry equals what `getHandleBounds` would measure off the DOM (the
 * `handleRect` math mirrors RF's own `.react-flow__handle-{side}` CSS), so the
 * seed → DOM handover at first mount moves no edge endpoint at all.
 */
export function seedRfInternals(
  nodes: readonly FewerNode[],
  opts: SeedOptions,
): FewerNode[] {
  const out = nodes.map((n) => {
    if (!shouldSeedRfInternals(n, opts)) return n;
    let byDirection = seedCache.get(n);
    if (!byDirection) {
      byDirection = new Map();
      seedCache.set(n, byDirection);
    }
    const hit = byDirection.get(opts.direction);
    if (hit) return hit;
    const seeded = seedNode(n, opts);
    byDirection.set(opts.direction, seeded);
    return seeded;
  });
  // "Changed" = any element differs from the input — cache hits are still
  // seeds (a fresh object the input did not have), so the flag cannot be
  // decided at seed time alone.
  return out.some((s, i) => s !== nodes[i]) ? out : (nodes as FewerNode[]);
}
