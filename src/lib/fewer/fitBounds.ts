import type { FewerNode, LayoutDirection } from "./types";
import type { Group } from "./groups";
import { groupBounds, groupPill, nodeRenderedSize, type GroupBounds } from "./groups";

/**
 * Zoom-to-selection geometry (T-143): both entry points (the crosshair button
 * and Alt+F) used to read `selectedNodeIds` alone, and group selection is
 * mutually exclusive with card selection — so selecting a group and asking to
 * zoom fit the WHOLE graph instead. These two pure functions make the target
 * "everything selected, cards and groups alike".
 *
 * Fit constants mirror what the old React Flow `fitView({ nodes })` produced:
 * padding 0.3 was passed at both call sites, and 0.15/3 are the `<ReactFlow
 * minZoom maxZoom>` clamps (GraphCanvas) that RF's own fitView consulted.
 */
export const SELECTION_FIT = { padding: 0.3, minZoom: 0.15, maxZoom: 3 } as const;

/** The slice of store state zoom-to-selection reads — the raw store and the
 *  keyboard test's StoreReader both satisfy it structurally. */
export interface SelectionState {
  nodes: readonly FewerNode[];
  groups: readonly Group[];
  selectedNodeIds: readonly string[];
  selectedGroupIds: readonly string[];
  activeLeafId?: string | null;
  viewSettings?: Readonly<Record<string, {
    positions?: Readonly<Record<string, { x: number; y: number }>>;
    /** This view's collapsed group ids (T-164): a collapsed group's pill box is
     *  the fit target here, not its (hidden) member cluster. */
    collapsedGroupIds?: readonly string[];
  }>>;
  /** Layout direction — only the COLLAPSED pill box consults it (the pill
   *  anchors at the flow-start corner, T-163). Absent = TB, the historical
   *  top-left placement. */
  direction?: LayoutDirection;
}

/**
 * Union bounding box of everything selected — selected cards (their rendered
 * boxes) and selected groups (the frame box for an expanded group, the pill
 * box for a collapsed one) — or `null` when nothing usable is selected.
 *
 * Store coordinates, not painted ones: the helper is caller-independent, so
 * the active leaf's per-view position map (`viewSettings[leafId].positions`)
 * is honored through the same override `groupBounds` already supports — a
 * view that pins cards away from the shared coords must zoom to where they
 * actually paint (the T-137 lesson).
 *
 * Collapsed members are hidden and culled nodes may never have been measured,
 * so callers must NOT hand this to React Flow's `fitView({ nodes })` (it fits
 * measured nodes only) — pair it with `viewportForBounds` + `setViewport`.
 */
export function selectionBounds(state: SelectionState): GroupBounds | null {
  const viewPositions = state.activeLeafId
    ? state.viewSettings?.[state.activeLeafId]?.positions
    : undefined;
  const viewMap = viewPositions ? new Map(Object.entries(viewPositions)) : undefined;
  // Collapse is per-view (T-164): the ACTIVE view's collapsed set decides which
  // selected groups contribute their pill box instead of the member cluster.
  const collapsedGroupIds = state.activeLeafId
    ? state.viewSettings?.[state.activeLeafId]?.collapsedGroupIds
    : undefined;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  const add = (b: GroupBounds) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
    found = true;
  };

  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  for (const id of state.selectedNodeIds) {
    const n = byId.get(id);
    if (!n) continue; // stale selection id
    const { w, h } = nodeRenderedSize(n);
    const { x, y } = viewMap?.get(id) ?? n.position;
    add({ x, y, width: w, height: h });
  }

  for (const id of state.selectedGroupIds) {
    const g = state.groups.find((x) => x.id === id);
    if (!g) continue;
    // Full member footprint (no `visible` filter): a collapsed group's members
    // are hidden BY the collapse, and an all-hidden frame is still the thing
    // the user selected. `null` = members are gone from the store entirely.
    const bounds = groupBounds(state.nodes as FewerNode[], g.memberIds, undefined, undefined, viewMap);
    if (!bounds) continue;
    add(collapsedGroupIds?.includes(g.id) ? groupPill(bounds, state.direction) : bounds);
  }

  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Viewport that centers `bounds` in `size` with `padding` breathing room —
 * the same math React Flow's `getViewportForBounds` runs for `fitView`
 * (scalar padding resolves to `1 - 2·padding` of the pane per axis), minus
 * its asymmetric-padding offset, which only bites when minZoom forces the
 * zoom UP and only shifts an already-clamped result. Center-exact, like the
 * hand-rolled initial fit in `use-canvas-initial-fit.ts`.
 */
export function viewportForBounds(
  bounds: GroupBounds,
  size: { width: number; height: number },
  opts: { padding: number; minZoom: number; maxZoom: number } = SELECTION_FIT,
): { x: number; y: number; zoom: number } {
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);
  const zoom = Math.min(
    opts.maxZoom,
    Math.max(
      opts.minZoom,
      Math.min(
        (size.width * (1 - 2 * opts.padding)) / bw,
        (size.height * (1 - 2 * opts.padding)) / bh,
      ),
    ),
  );
  return {
    x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}
