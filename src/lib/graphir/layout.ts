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
 * Layout spacing — generous so nodes don't feel cramped.
 * These are the gaps BETWEEN nodes, not the node sizes themselves.
 */
const NODE_SEP = 60;   // horizontal gap between nodes in the same rank
const RANK_SEP_TB = 120; // vertical gap between ranks (parent → child) for TB/BT
const RANK_SEP_LR = 160; // horizontal gap between ranks for LR/RL

/**
 * Get the best available dimensions for a node, in priority order:
 * 1. Node's style.width/height (set by setNodeDimensions or NodeResizer)
 * 2. React Flow's measured dimensions (after render)
 * 3. Type-based defaults (folder vs file)
 */
function getNodeDimensions(node: GraphirNode): { w: number; h: number } {
  // Check style.width/height first — these are explicitly set by the user
  // via the sidebar sliders or NodeResizer, so they take priority.
  const styleW = node.style?.width as number | undefined;
  const styleH = node.style?.height as number | undefined;

  // React Flow stores measured dimensions in node.measured after render
  const measuredW = node.measured?.width;
  const measuredH = node.measured?.height;

  // Also check node.width/height (set by React Flow or resizer)
  const nodeW = node.width;
  const nodeH = node.height;

  // Type-based defaults
  const isFolder = node.data.type === "folder" || node.type === "folder";
  const defaultW = isFolder ? DEFAULT_FOLDER_WIDTH : DEFAULT_FILE_WIDTH;
  const defaultH = isFolder ? DEFAULT_FOLDER_HEIGHT : DEFAULT_FILE_HEIGHT;

  // For folder nodes: use style.height if set (from setNodeDimensions), otherwise measured/default
  // For file nodes: NEVER use style.height/minHeight — files always render at
  // their natural height (~58px) regardless of the node height slider.
  const w = styleW || measuredW || nodeW || defaultW;
  const h = isFolder
    ? (styleH || measuredH || nodeH || defaultH)
    : (measuredH || nodeH || defaultH);

  return { w, h };
}

/**
 * Run a dagre layout pass over the supplied nodes/edges.
 * Supports four layout directions and returns NEW node objects with
 * updated positions and a stashed layout direction for handle placement.
 *
 * Uses each node's style or measured dimensions (from React Flow) when
 * available, falling back to type-based defaults. This ensures dagre
 * positions nodes with correct spacing for their actual rendered size.
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
    // Generous spacing so nodes aren't cramped
    nodesep: NODE_SEP,
    ranksep: isHorizontal ? RANK_SEP_LR : RANK_SEP_TB,
    marginx: 40,
    marginy: 40,
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
