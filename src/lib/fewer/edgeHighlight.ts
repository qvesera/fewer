import type { EdgeStrokeStyle, EdgeStyle, FewerEdge, FewerNode } from "./types";
import { contrastStroke, edgeDashPattern } from "./types";

/** React Flow edge subtype for a UI edge-style choice. */
export function edgeTypeFor(style: EdgeStyle): FewerEdge["type"] {
  switch (style) {
    case "curved": return "default";
    case "angled": return "smoothstep";
    case "straight": return "straight";
  }
}

/**
 * Static stroke-dash pattern used for the canvas's default (unhighlighted)
 * edges. Deliberately NOT `edgeDashPattern` from types.ts: the animated
 * edges must share a dash-clock period (a common multiple of every period in
 * play), while static edges use a lighter hand-tuned spacing. Keep the two
 * consistent only when changing both dash clocks together.
 */
export function staticEdgeDashArray(style: EdgeStrokeStyle): string | undefined {
  switch (style) {
    case "dashed": return "6 6";
    case "dotted": return "2 6";
    case "solid":
    default: return undefined;
  }
}

/** Themed edge colors resolved once per theme change (see GraphCanvas). */
export interface EdgeThemeColors {
  edge: string;
  folderIcon: string;
  fileIcon: string;
}

export interface EdgeAnimationOptions {
  /** Global motion toggle (sidebar) — drives non-selected edges when selectedOnly is on, otherwise all edges. */
  animated: boolean;
  /** Animate only the ancestor-path edges of selected nodes. */
  selectedOnly: boolean;
  animatedStrokeStyle: EdgeStrokeStyle;
  baseStrokeStyle: EdgeStrokeStyle;
}

/** node id → its entry type (undefined when the id isn't in `nodes`). */
export type NodeTypeLookup = Map<string, "folder" | "file" | undefined>;
/** child target id → the single edge pointing into it (its parent edge). */
export type ParentEdgeMap = Map<string, FewerEdge>;

/**
 * Zip `nodes` + `edges` into the two lookups the highlight walk needs:
 *   - typeByNodeId: node id → its entry type
 *   - parentEdgeOf: target id → the incoming edge (the node's "parent" edge)
 * The graph is a tree (at most one parent edge per node), so walking this map
 * upward from a node yields exactly the ancestor-path edges — child edges are
 * never visited.
 */
export function buildTreeLookups(
  nodes: FewerNode[],
  edges: FewerEdge[],
): { typeByNodeId: NodeTypeLookup; parentEdgeOf: ParentEdgeMap } {
  const typeByNodeId: NodeTypeLookup = new Map();
  for (const n of nodes) typeByNodeId.set(n.id, n.data?.type);

  const parentEdgeOf: ParentEdgeMap = new Map();
  for (const e of edges) {
    if (!parentEdgeOf.has(e.target)) parentEdgeOf.set(e.target, e);
  }
  return { typeByNodeId, parentEdgeOf };
}

/**
 * Walk each id (and its ancestors) up the parent-edge map, recording an entry
 * for every edge on the ancestor path. The `visited` set guarantees termination
 * even when the edge set is malformed (a cycle). Path-edge width floors at 3.
 */
export function ancestorPathHighlight(
  ids: string[],
  parentEdgeOf: ParentEdgeMap,
  typeByNodeId: NodeTypeLookup,
  strokeFor: (t: "folder" | "file" | undefined) => string,
  width: number,
): Map<string, { stroke: string; width: number }> {
  const highlight = new Map<string, { stroke: string; width: number }>();
  for (const id of ids) {
    let nodeId: string | undefined = id;
    const visited = new Set<string>();
    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId);
      const parentEdge = parentEdgeOf.get(nodeId);
      if (!parentEdge) break;
      highlight.set(parentEdge.id, {
        stroke: strokeFor(typeByNodeId.get(parentEdge.target)),
        width: Math.max(width, 3),
      });
      nodeId = parentEdge.source;
    }
  }
  return highlight;
}

/**
 * The unhighlighted edge array: every edge carrying the default stroke, the base
 * dash pattern and the global motion setting.
 *
 * Split out from the highlight so a SELECTION change doesn't renormalise 30k
 * edges to change the stroke on a handful: the base depends only on the edges,
 * the theme, the width and the animation options, and the canvas memoises it on
 * exactly those. `buildSelectedEdgeHighlight` below is the composition of the
 * two, kept for callers that want the whole thing in one call.
 */
export function buildEdgeBase(
  edges: FewerEdge[],
  themeColors: EdgeThemeColors,
  edgeWidth: number,
  edgeAnimation: EdgeAnimationOptions,
  /**
   * Ids of nodes that are symlinks (edges pointing INTO one get the contrast
   * stroke + a target-end arrowhead). Derived per graph by the caller — the
   * appearance is a pure function of node metadata + view settings, never
   * stored on the edge.
   */
  symlinkTargetIds?: ReadonlySet<string>,
): FewerEdge[] {
  const defaultStroke = themeColors.edge;
  const anim = edgeAnimation.animated;
  // The base dash is the BASE stroke style whether or not motion is on — with
  // motion off the old one-shot builder still dashed the edges per that style,
  // and a "dashed"/"dotted" base must keep looking dashed when still.
  const dash = edgeDashPattern(edgeAnimation.baseStrokeStyle);
  // Symlink edges contrast the base style (solid↔dashed axis) so they never
  // match their siblings, whatever the global setting is.
  const linkDash = edgeDashPattern(contrastStroke(edgeAnimation.baseStrokeStyle));
  return edges.map((e) => {
    const isLink = symlinkTargetIds?.has(e.target) ?? false;
    return {
      ...e,
      animated: anim,
      ...(isLink ? { markerEnd: { type: "arrowclosed", color: defaultStroke, width: 14, height: 14 } } : {}),
      style: {
        ...e.style,
        stroke: defaultStroke,
        strokeWidth: edgeWidth,
        ...(isLink
          ? { strokeDasharray: linkDash }
          : dash
            ? { strokeDasharray: dash }
            : { strokeDasharray: undefined }),
      },
    };
  });
}

/** The two lookups `applyEdgeHighlights` walks. Built once per graph change. */
export interface TreeLookups {
  typeByNodeId: NodeTypeLookup;
  parentEdgeOf: ParentEdgeMap;
}

/**
 * Style the ancestor-path edges of the selected and hovered cards over an
 * already-normalised `base` array.
 *
 * Copy-on-write: an edge that is not on a path is returned BY IDENTITY, so a
 * selection change allocates a handful of objects instead of one per edge, and
 * React Flow can skip the untouched ones. The highlighted edges are moved to the
 * end with an O(E) partition — the same result as the stable "non-highlighted
 * first, then highlighted" sort this replaced, without the O(E log E).
 *
 * Returns `base` unchanged when nothing is highlighted, which is the common
 * case (an empty selection, or ids that aren't in the graph).
 */
export function applyEdgeHighlights(
  base: FewerEdge[],
  selectedIds: string[],
  hoverIds: string[],
  lookups: TreeLookups,
  themeColors: EdgeThemeColors,
  edgeWidth: number,
  edgeAnimation: EdgeAnimationOptions,
  /** See buildEdgeBase — keeps the contrast stroke + recolors the arrowhead
   *  under highlight, so a symlink edge never loses its identity. */
  symlinkTargetIds?: ReadonlySet<string>,
): FewerEdge[] {
  if (selectedIds.length === 0 && hoverIds.length === 0) return base;
  const { typeByNodeId, parentEdgeOf } = lookups;

  // Selection path uses the themed folder/file stroke.
  const selectedHighlight = ancestorPathHighlight(
    selectedIds,
    parentEdgeOf,
    typeByNodeId,
    (t) => (t === "folder" ? themeColors.folderIcon : themeColors.fileIcon),
    edgeWidth,
  );

  // Hover path (sidebar Hidden-panel hover): amber, matching the node ring and
  // the exporter's highlight — distinct from selection so the two don't conflate.
  const hoverHighlight = ancestorPathHighlight(
    hoverIds,
    parentEdgeOf,
    typeByNodeId,
    () => "#fbbf24",
    edgeWidth,
  );

  const highlightedIds = new Set([...selectedHighlight.keys(), ...hoverHighlight.keys()]);
  if (highlightedIds.size === 0) return base;

  const out = base.map((e) => {
    const sel = selectedHighlight.get(e.id);
    // Hover wins on overlap — it's the user's current focus; selection styling
    // returns on mouse-leave once the hover recompute drops these edges.
    const h = hoverHighlight.get(e.id) ?? sel;
    if (!h) return e;
    // Per-edge animation: selected-path edges always animate when selectedOnly
    // is on; non-selected edges animate only when the global motion toggle is on.
    const selectedPath = edgeAnimation.selectedOnly && !!sel;
    const anim = selectedPath || edgeAnimation.animated;
    const isLink = symlinkTargetIds?.has(e.target) ?? false;
    // Selected-path edges use the dialog-chosen pattern; everything else uses
    // the sidebar base pattern (so unselected edges stay solid/static when
    // motion is off). Symlink edges invert whichever pattern applies so the
    // contrast survives highlight states.
    const pattern = selectedPath
      ? edgeAnimation.animatedStrokeStyle
      : edgeAnimation.baseStrokeStyle;
    const dash = edgeDashPattern(isLink ? contrastStroke(pattern) : pattern);
    return {
      ...e,
      zIndex: 1,
      animated: anim,
      ...(isLink ? { markerEnd: { ...(e.markerEnd as object), color: h.stroke } } : {}),
      style: { ...e.style, stroke: h.stroke, strokeWidth: h.width, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) },
    } as FewerEdge;
  });

  // Highlighted last, so a highlighted edge is never covered by a grey one.
  const head: FewerEdge[] = [];
  const tail: FewerEdge[] = [];
  for (const e of out) (highlightedIds.has(e.id) ? tail : head).push(e);
  return head.concat(tail);
}

/**
 * Style the edges on the ancestor path of EVERY selected node — i.e. each edge
 * from a selected node up to its root parent (child edges are NOT highlighted).
 * Each path edge is colored by its target node type (folder vs file) so
 * multi-selection shows every selected node's path, not just the last-picked
 * one. Empty selection → all edges reset to default stroke.
 * Highlighted edges get zIndex 1 (above other edges but below every node,
 * which is locked at zIndex 1000 in GraphCanvas's visibleNodes).
 *
 * Animation semantics:
 *   - selectedOnly on → selected-path edges ALWAYS animate (dialog pattern)
 *     and non-selected edges animate only when `animated` (sidebar motion).
 *   - selectedOnly off → `animated` drives all edges (sidebar pattern).
 *
 * The canvas calls `buildEdgeBase` + `applyEdgeHighlights` separately (both
 * memoised on their own inputs); this is the two in one call.
 */
export function buildSelectedEdgeHighlight(
  selectedIds: string[],
  hoverIds: string[],
  edges: FewerEdge[],
  nodes: FewerNode[],
  themeColors: EdgeThemeColors,
  edgeWidth: number,
  edgeAnimation: EdgeAnimationOptions,
  symlinkTargetIds?: ReadonlySet<string>,
): FewerEdge[] {
  return applyEdgeHighlights(
    buildEdgeBase(edges, themeColors, edgeWidth, edgeAnimation, symlinkTargetIds),
    selectedIds,
    hoverIds,
    buildTreeLookups(nodes, edges),
    themeColors,
    edgeWidth,
    edgeAnimation,
    symlinkTargetIds,
  );
}

/**
 * Merge React Flow's live edge-selection state onto a freshly-rebuilt edge array.
 *
 * `buildSelectedEdgeHighlight` reconstructs edges from the store, which never
 * carries a `selected` flag — so every rebuild (theme change, hover, node
 * selection, graphVersion sync) would otherwise wipe RF's selection. Call this
 * right before `setRfEdges` to restore the flags RF is tracking internally.
 */
export function applyEdgeSelection(
  edges: FewerEdge[],
  selectedIds: Set<string>,
): FewerEdge[] {
  if (selectedIds.size === 0) return edges;
  return edges.map((e) => (selectedIds.has(e.id) ? { ...e, selected: true } : e));
}