import dagre from "@dagrejs/dagre";
import type { GraphirNode, GraphirEdge, LayoutDirection } from "./types";

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 56;

/**
 * Run a dagre layout pass over the supplied nodes/edges.
 * Supports four layout directions and returns NEW node objects with
 * updated positions and a stashed layout direction for handle placement.
 *
 * Uses each node's style.width / style.height if set, otherwise falls back
 * to the default dimensions.
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
    nodesep: 24,
    ranksep: 60,
    marginx: 20,
    marginy: 20,
    ranker: "tight-tree",
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Track dimensions per node so we can center positions correctly
  const dims = new Map<string, { w: number; h: number }>();

  for (const node of nodes) {
    const w = (node.style?.width as number) || node.width || DEFAULT_NODE_WIDTH;
    const h = (node.style?.height as number) ||
      node.height ||
      (node.style?.minHeight as number) ||
      DEFAULT_NODE_HEIGHT;
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
    const d = dims.get(node.id) ?? { w: DEFAULT_NODE_WIDTH, h: DEFAULT_NODE_HEIGHT };
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
  width: DEFAULT_NODE_WIDTH,
  height: DEFAULT_NODE_HEIGHT,
};
