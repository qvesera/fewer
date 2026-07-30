import ELK from "elkjs";
import type { FewerNode, FewerEdge, LayoutDirection } from "./types";

/**
 * Default dimensions per node type.
 * Folder cards are taller because they contain a child list + header + footer.
 * File cards are single-row.
 */
const DEFAULT_FOLDER_WIDTH = 240;
const DEFAULT_FOLDER_HEIGHT = 200;
const DEFAULT_FILE_WIDTH = 220;
const DEFAULT_FILE_HEIGHT = 58;

function getNodeDimensions(node: FewerNode): { w: number; h: number } {
  const styleW = node.style?.width as number | undefined;
  const styleH = node.style?.height as number | undefined;
  const measuredW = node.measured?.width;
  const measuredH = node.measured?.height;
  const nodeW = node.width;
  const nodeH = node.height;
  const isFolder = node.data.type === "folder" || node.type === "folder";
  const defaultW = isFolder ? DEFAULT_FOLDER_WIDTH : DEFAULT_FILE_WIDTH;
  const defaultH = isFolder ? DEFAULT_FOLDER_HEIGHT : DEFAULT_FILE_HEIGHT;
  const w = styleW || measuredW || nodeW || defaultW;
  const h = isFolder
    ? (styleH || measuredH || nodeH || defaultH)
    : (measuredH || nodeH || defaultH);
  return { w, h };
}

function elkDirection(dir: LayoutDirection): string {
  switch (dir) {
    case "TB": return "DOWN";
    case "BT": return "UP";
    case "LR": return "RIGHT";
    case "RL": return "LEFT";
  }
}

export interface LayoutOptions {
  excludeFromLayout?: Set<string>;
}

const elk = new ELK();

/**
 * Run an ELK layout pass configured to pack wide leaf branches into
 * compact multi-row grids under each parent folder.
 */
export async function layoutGraph(
  nodes: FewerNode[],
  edges: FewerEdge[],
  direction: LayoutDirection = "TB",
  options?: LayoutOptions
): Promise<FewerNode[]> {
  const excludeSet = options?.excludeFromLayout ?? new Set();

  const elkNodes: any[] = [];
  const elkEdges: any[] = [];
  const dims = new Map<string, { w: number; h: number }>();

  for (const node of nodes) {
    if (excludeSet.has(node.id)) {
      dims.set(node.id, { w: DEFAULT_FILE_WIDTH, h: DEFAULT_FILE_HEIGHT });
      continue;
    }
    const { w, h } = getNodeDimensions(node);
    elkNodes.push({
      id: node.id,
      width: w,
      height: h,
    });
    dims.set(node.id, { w, h });
  }

  const nodeIds = new Set(elkNodes.map((n) => n.id));
  for (const edge of edges) {
    if (excludeSet.has(edge.source) && excludeSet.has(edge.target)) continue;
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      elkEdges.push({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      });
    }
  }

  const isHorizontal = direction === "LR" || direction === "RL";

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection(direction),
      
      // Tight spacing between items
      "elk.spacing.nodeNode": "30",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      
      // Target aspect ratio (approx 1.2 square-ish bounding box for the graph)
      "elk.aspectRatio": "1.2",
      
      // Center parents strictly above child branches
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      
      // Wrapping strategy: allow nodes in the same rank to wrap across multiple rows
      "elk.layered.wrapping.strategy": "SINGLE_EDGE",
      "elk.layered.wrapping.correctionFactor": "1.0",
      
      // Post-compaction scans horizontally and vertically to pull subtrees together
      "elk.layered.compaction.postCompaction.strategy": "SCANLINE",
      
      // Prevents high-out-degree nodes (e.g. folder with 10 files) from staying in one line
      "elk.layered.highDegreeNodes.treatment": "true",
      "elk.layered.highDegreeNodes.threshold": "3",
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const result = await elk.layout(elkGraph);

  const elkPositions = new Map<string, { x: number; y: number }>();
  if (result.children) {
    for (const child of result.children) {
      if (child.x !== undefined && child.y !== undefined) {
        elkPositions.set(child.id, { x: child.x, y: child.y });
      }
    }
  }

  return nodes.map((node) => {
    if (excludeSet.has(node.id)) {
      return { ...node, data: { ...node.data, layoutDirection: direction, isHorizontal } } as FewerNode;
    }
    const pos = elkPositions.get(node.id);
    if (!pos) return node as FewerNode;
    return {
      ...node,
      position: {
        x: pos.x,
        y: pos.y,
      },
      data: { ...node.data, layoutDirection: direction, isHorizontal },
    } as FewerNode;
  });
}

/**
 * Synchronous Fallback Tree Layout
 */
export function layoutGraphSync(
  nodes: FewerNode[],
  edges: FewerEdge[],
  direction: LayoutDirection = "TB",
  options?: LayoutOptions
): FewerNode[] {
  const excludeSet = options?.excludeFromLayout ?? new Set();
  const isHorizontal = direction === "LR" || direction === "RL";
  const gap = 25;
  const levelGap = 80;

  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const edge of edges) {
    if (excludeSet.has(edge.source) || excludeSet.has(edge.target)) continue;
    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
    childrenMap.get(edge.source)!.push(edge.target);
    parentMap.set(edge.target, edge.source);
  }

  const roots = nodes.filter(
    (n) => !excludeSet.has(n.id) && !parentMap.has(n.id)
  );

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const positions = new Map<string, { x: number; y: number }>();

  function layoutSubtree(nodeId: string, depth: number, offset: number): number {
    const node = nodeMap.get(nodeId);
    if (!node) return offset;

    const { w, h } = getNodeDimensions(node);
    const children = childrenMap.get(nodeId) ?? [];

    if (children.length === 0) {
      if (isHorizontal) {
        positions.set(nodeId, { x: depth * (240 + levelGap), y: offset });
      } else {
        positions.set(nodeId, { x: offset, y: depth * (DEFAULT_FOLDER_HEIGHT + levelGap) });
      }
      return offset + (isHorizontal ? h : w) + gap;
    }

    let currentOffset = offset;
    const childCenters: number[] = [];

    for (const childId of children) {
      const childStart = currentOffset;
      currentOffset = layoutSubtree(childId, depth + 1, currentOffset);
      const childEnd = currentOffset - gap;
      childCenters.push((childStart + childEnd) / 2);
    }

    const subtreeCenter = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    const parentPos = subtreeCenter - (isHorizontal ? h : w) / 2;

    if (isHorizontal) {
      positions.set(nodeId, { x: depth * (240 + levelGap), y: parentPos });
    } else {
      positions.set(nodeId, { x: parentPos, y: depth * (DEFAULT_FOLDER_HEIGHT + levelGap) });
    }

    return Math.max(currentOffset, parentPos + (isHorizontal ? h : w) + gap);
  }

  let currentOffset = 0;
  for (const root of roots) {
    currentOffset = layoutSubtree(root.id, 0, currentOffset) + 40;
  }

  return nodes.map((node) => {
    if (excludeSet.has(node.id)) {
      return { ...node, data: { ...node.data, layoutDirection: direction, isHorizontal } } as FewerNode;
    }
    const pos = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      ...node,
      position: pos,
      data: { ...node.data, layoutDirection: direction, isHorizontal },
    } as FewerNode;
  });
}

/**
 * Run layout asynchronously via ELK.
 */
export function runLayoutAsync(
  nodes: FewerNode[],
  edges: FewerEdge[],
  direction: LayoutDirection = "TB",
  options?: LayoutOptions
): Promise<FewerNode[]> {
  return layoutGraph(nodes, edges, direction, options);
}

export const LAYOUT_DIMENSIONS = {
  width: DEFAULT_FILE_WIDTH,
  height: DEFAULT_FILE_HEIGHT,
};