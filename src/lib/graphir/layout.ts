import dagre from "@dagrejs/dagre";
import type { GraphirNode, GraphirEdge, LayoutDirection } from "./types";

/**
 * Default dimensions per node type.
 * Folder cards are taller because they contain a child list + header + footer.
 * File cards are single-row.
 */
const DEFAULT_FOLDER_WIDTH = 240;
const DEFAULT_FOLDER_HEIGHT = 200;
const DEFAULT_FILE_WIDTH = 220;
const DEFAULT_FILE_HEIGHT = 58;

/**
 * Get the best available dimensions for a node, in priority order:
 * 1. React Flow's measured dimensions (after render — most accurate)
 * 2. Node's style.width/height (set by NodeResizer or setNodeDimensions)
 * 3. Type-based defaults (folder vs file)
 */
function getNodeDimensions(node: GraphirNode): { w: number; h: number } {
  // React Flow stores measured dimensions in node.measured after the first render
  const measuredW = node.measured?.width;
  const measuredH = node.measured?.height;

  // Also check node.width/height (set by React Flow or resizer)
  const nodeW = node.width;
  const nodeH = node.height;

  // Check style.width/height (set by our setNodeDimensions or NodeResizer)
  const styleW = node.style?.width as number | undefined;
  const styleH = node.style?.height as number | undefined;
  const styleMinH = node.style?.minHeight as number | undefined;

  // Type-based defaults
  const isFolder = node.data.type === "folder" || node.type === "folder";
  const defaultW = isFolder ? DEFAULT_FOLDER_WIDTH : DEFAULT_FILE_WIDTH;
  const defaultH = isFolder ? DEFAULT_FOLDER_HEIGHT : DEFAULT_FILE_HEIGHT;

  // For folder nodes: use style.height if set (from setNodeDimensions), otherwise measured
  // For file nodes: use style.minHeight if set, otherwise measured
  const w = measuredW || nodeW || styleW || defaultW;
  const h = isFolder
    ? (styleH || measuredH || nodeH || defaultH)
    : (measuredH || nodeH || styleH || styleMinH || defaultH);

  return { w, h };
}

/**
 * Run a dagre layout pass over the supplied nodes/edges.
 * Supports four layout directions and returns NEW node objects with
 * updated positions and a stashed layout direction for handle placement.
 *
 * Uses each node's MEASURED dimensions (from React Flow) when available,
 * falling back to type-based defaults. This ensures dagre positions
 * nodes with correct spacing for their actual rendered size.
 */
export function layoutGraph(
  nodes: GraphirNode[],
  edges: GraphirEdge[],
  direction: LayoutDirection = "TB"
): GraphirNode[] {
  const isHorizontal = direction === "LR" || direction === "RL";

  const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
  g.setGraph({
    rankdir: direction,
    // Use larger separation for vertical layouts since folder cards are wide
    nodesep: isHorizontal ? 40 : 30,
    ranksep: isHorizontal ? 80 : 70,
    marginx: 24,
    marginy: 24,
    ranker: "tight-tree",
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Track dimensions per node so we can center positions correctly
  const dims = new Map<string, { w: number; h: number }>();

  for (const node of nodes) {
    const { w, h } = getNodeDimensions(node);
    g.setNode(node.id, { width: w, height: h });
    dims.set(node.id, { w, h });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    const d = dims.get(node.id) ?? { w: DEFAULT_FILE_WIDTH, h: DEFAULT_FILE_HEIGHT };
    return {
      ...node,
      position: {
        x: pos.x - d.w / 2,
        y: pos.y - d.h / 2,
      },
      data: { ...node.data, layoutDirection: direction, isHorizontal },
    } as GraphirNode;
  });

  return positioned;
}

export const LAYOUT_DIMENSIONS = {
  width: DEFAULT_FILE_WIDTH,
  height: DEFAULT_FILE_HEIGHT,
};
