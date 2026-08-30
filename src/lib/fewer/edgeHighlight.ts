import type { EdgeStrokeStyle, FewerEdge, FewerNode } from "./types";
import { edgeDashPattern } from "./types";

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
 */
export function buildSelectedEdgeHighlight(
  selectedIds: string[],
  hoverIds: string[],
  edges: FewerEdge[],
  nodes: FewerNode[],
  themeColors: EdgeThemeColors,
  edgeWidth: number,
  edgeAnimation: EdgeAnimationOptions,
): FewerEdge[] {
  const { typeByNodeId, parentEdgeOf } = buildTreeLookups(nodes, edges);

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
  const defaultStroke = themeColors.edge;
  return edges
    .map((e) => {
      const sel = selectedHighlight.get(e.id);
      const hov = hoverHighlight.get(e.id);
      // Hover wins on overlap — it's the user's current focus; selection styling
      // returns on mouse-leave once the hover recompute drops these edges.
      const h = hov ?? sel;
      // Per-edge animation: selected-path edges always animate when selectedOnly
      // is on; non-selected edges animate only when the global motion toggle is on.
      const selectedPath = edgeAnimation.selectedOnly && !!sel;
      const anim = selectedPath || edgeAnimation.animated;
      // Selected-path edges use the dialog-chosen pattern; everything else uses
      // the sidebar base pattern (so unselected edges stay solid/static when
      // motion is off).
      const dash = anim
        ? edgeDashPattern(selectedPath ? edgeAnimation.animatedStrokeStyle : edgeAnimation.baseStrokeStyle)
        : edgeDashPattern(edgeAnimation.baseStrokeStyle);
      return h
        ? {
            ...e,
            zIndex: 1,
            animated: anim,
            style: { ...e.style, stroke: h.stroke, strokeWidth: h.width, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) },
          }
        : {
            ...e,
            animated: anim,
            style: { ...e.style, stroke: defaultStroke, strokeWidth: edgeWidth, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) },
          };
    })
    .sort((a, b) => (highlightedIds.has(a.id) ? 1 : 0) - (highlightedIds.has(b.id) ? 1 : 0));
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