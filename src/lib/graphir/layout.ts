import dagre from "@dagrejs/dagre";
import type { GraphirNode, GraphirEdge, LayoutDirection } from "./types";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

/**
 * Run a dagre layout pass over the supplied nodes/edges.
 * Supports four layout directions and returns NEW node objects with
 * updated positions and a stashed layout direction for handle placement.
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
    nodesep: 36,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
    ranker: "tight-tree",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
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
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { ...node.data, layoutDirection: direction, isHorizontal },
    } as GraphirNode;
  });

  return positioned;
}

export const LAYOUT_DIMENSIONS = { width: NODE_WIDTH, height: NODE_HEIGHT };
