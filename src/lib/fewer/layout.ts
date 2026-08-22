import type { FewerNode, FewerEdge, LayoutDirection } from "./types";

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

export interface LayoutOptions {
  excludeFromLayout?: Set<string>;
  /**
   * Crown shyness: sibling subtrees ("crowns") keep gaps that scale with
   * contour depth and subtree size, like real tree canopies that never touch.
   * Default true.
   */
  shyness?: boolean;
  /** Crown-shyness intensity multiplier. 0 = flat gaps, 1 = default, up to 3. Default 1. */
  shynessScale?: number;
}

// ponytail: linear per-level/per-log-size gap growth, capped at 3x base —
// upgrade path is per-contour-point gap shaping if trees ever need it.
export const SHYNESS_DEPTH_K = 8; // extra px per contour level below the sibling pair
export const SHYNESS_SIZE_K = 2; // extra px per log2(1 + smaller subtree's node count)
export const SHYNESS_MAX_MULTIPLE = 3; // gap never exceeds baseGap * this

/** Crown-shyness gap between two sibling crowns at a given contour level. */
export function shynessGap(
  baseGap: number,
  contourDepth: number,
  sizeA: number,
  sizeB: number,
  scale = 1,
): number {
  const sizeTerm = SHYNESS_SIZE_K * Math.log2(1 + Math.min(sizeA, sizeB));
  return Math.min(
    baseGap * SHYNESS_MAX_MULTIPLE,
    baseGap + (SHYNESS_DEPTH_K * contourDepth + sizeTerm) * scale,
  );
}

interface TreeContour {
  left: number[];  // min relative position for each depth level below this node
  right: number[]; // max relative position for each depth level below this node
}

/**
 * Strict Reingold-Tilford Tree Layout with Contour Matching.
 * Guarantees parents stay centered over children while preventing cross-level collisions.
 */
export function layoutGraphContour(
  nodes: FewerNode[],
  edges: FewerEdge[],
  direction: LayoutDirection = "TB",
  options?: LayoutOptions
): FewerNode[] {
  const excludeSet = options?.excludeFromLayout ?? new Set();
  const shyness = options?.shyness ?? true;
  const shynessScale = Math.max(0, Math.min(3, options?.shynessScale ?? 1));
  const isHorizontal = direction === "LR" || direction === "RL";
  const nodeGap = isHorizontal ? 50 : 60;  // Spacing between adjacent subtrees
  const layerGap = 70; // Spacing between tree depths

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

  for (const childIds of childrenMap.values()) {
    childIds.sort((a, b) => {
      const labelA = nodeMap.get(a)?.data?.label || a;
      const labelB = nodeMap.get(b)?.data?.label || b;
      return labelA.localeCompare(labelB);
    });
  }

  // 1. Calculate depth level for every node
  const nodeDepths = new Map<string, number>();
  function calculateDepths(nodeId: string, currentDepth: number) {
    nodeDepths.set(nodeId, currentDepth);
    const children = childrenMap.get(nodeId) ?? [];
    for (const childId of children) {
      calculateDepths(childId, currentDepth + 1);
    }
  }
  for (const root of roots) {
    calculateDepths(root.id, 0);
  }

  // 2. Compute dynamic depth layer positions (Y in TB/BT, X in LR/RL)
  const depthMaxBreadth: number[] = [];
  nodeDepths.forEach((depth, nodeId) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const { w, h } = getNodeDimensions(node);
    const b = isHorizontal ? w : h;
    depthMaxBreadth[depth] = Math.max(depthMaxBreadth[depth] ?? 0, b);
  });

  const effectiveLayerGap = isHorizontal ? layerGap + 60 : layerGap + 30; // Extra clearance between layers for folders

  const depthPositions: number[] = [0];
  for (let d = 0; d < depthMaxBreadth.length; d++) {
    depthPositions[d + 1] = depthPositions[d] + depthMaxBreadth[d] + effectiveLayerGap;
  }

  // Store relative offsets from parent center
  const relativeXMap = new Map<string, number>();

  // 2b. Subtree sizes for crown-shyness gap scaling (post-order, memoized)
  const subtreeSizes = new Map<string, number>();
  function computeSubtreeSize(nodeId: string): number {
    const cached = subtreeSizes.get(nodeId);
    if (cached !== undefined) return cached;
    let count = 1;
    for (const childId of childrenMap.get(nodeId) ?? []) {
      count += computeSubtreeSize(childId);
    }
    subtreeSizes.set(nodeId, count);
    return count;
  }
  for (const root of roots) computeSubtreeSize(root.id);

  // 3. Bottom-up subtree layout with exact contour matching
  function layoutSubtree(nodeId: string): TreeContour {
    const node = nodeMap.get(nodeId)!;
    const { w, h } = getNodeDimensions(node);
    const nodeSize = isHorizontal ? h : w;
    const children = childrenMap.get(nodeId) ?? [];

    if (children.length === 0) {
      relativeXMap.set(nodeId, 0);
      return {
        left: [-nodeSize / 2],
        right: [nodeSize / 2],
      };
    }

    const childContours: TreeContour[] = [];
    const childOffsets: number[] = [];

    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      const contour = layoutSubtree(childId);
      childContours.push(contour);

      if (i === 0) {
        childOffsets.push(0);
      } else {
        let maxOverlapShift = 0;
        const baseGap = isHorizontal ? 50 : nodeGap;

        // Compare against ALL previously placed siblings to prevent cross-subtree overlap
        for (let j = 0; j < i; j++) {
          const prevContour = childContours[j];
          const compareDepth = Math.min(prevContour.right.length, contour.left.length);

          for (let d = 0; d < compareDepth; d++) {
            const prevRight = childOffsets[j] + prevContour.right[d];
            const currLeft = contour.left[d];
            // Crown shyness: gap grows with crown depth + crown size
            const gap = shyness
              ? shynessGap(
                  baseGap,
                  d,
                  computeSubtreeSize(children[j]),
                  computeSubtreeSize(childId),
                  shynessScale,
                )
              : baseGap;
            const requiredShift = prevRight - currLeft + gap;
            if (requiredShift > maxOverlapShift) {
              maxOverlapShift = requiredShift;
            }
          }
        }
        childOffsets.push(maxOverlapShift);
      }
    }

    // Center parent over children group
    const firstChildOffset = childOffsets[0];
    const lastChildOffset = childOffsets[childOffsets.length - 1];
    const childrenCenter = (firstChildOffset + lastChildOffset) / 2;

    const mergedLeft: number[] = [-nodeSize / 2];
    const mergedRight: number[] = [nodeSize / 2];

    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      // Final relative position from parent
      const relX = childOffsets[i] - childrenCenter;
      relativeXMap.set(childId, relX);

      const c = childContours[i];
      for (let d = 0; d < c.left.length; d++) {
        const targetDepth = d + 1;
        const cLeft = c.left[d] + relX;
        const cRight = c.right[d] + relX;

        if (mergedLeft[targetDepth] === undefined) {
          mergedLeft[targetDepth] = cLeft;
          mergedRight[targetDepth] = cRight;
        } else {
          mergedLeft[targetDepth] = Math.min(mergedLeft[targetDepth], cLeft);
          mergedRight[targetDepth] = Math.max(mergedRight[targetDepth], cRight);
        }
      }
    }

    relativeXMap.set(nodeId, 0);
    return { left: mergedLeft, right: mergedRight };
  }

  // 4. Top-down position assignment
  const finalXMap = new Map<string, number>();

  function assignPositions(nodeId: string, currentAbsoluteX: number) {
    finalXMap.set(nodeId, currentAbsoluteX);

    const children = childrenMap.get(nodeId) ?? [];
    for (const childId of children) {
      const relX = relativeXMap.get(childId) ?? 0;
      assignPositions(childId, currentAbsoluteX + relX);
    }
  }

  let rootXOffset = 0;
  for (const root of roots) {
    const contour = layoutSubtree(root.id);
    const minL = Math.min(...contour.left);
    const maxR = Math.max(...contour.right);

    assignPositions(root.id, rootXOffset - minL);
    rootXOffset += (maxR - minL) + 120;
  }

  // 5. Build output node positions with direction inversions (TB, LR, BT, RL)
  const maxDepthPos = depthPositions[depthPositions.length - 1] ?? 0;

  return nodes.map((node) => {
    if (excludeSet.has(node.id)) {
      return { ...node, data: { ...node.data, layoutDirection: direction, isHorizontal } } as FewerNode;
    }

    const { w, h } = getNodeDimensions(node);
    const depth = nodeDepths.get(node.id) ?? 0;
    const depthPos = depthPositions[depth];
    const xPos = finalXMap.get(node.id) ?? 0;

    let finalX = 0;
    let finalY = 0;

    switch (direction) {
      case "LR":
        finalX = depthPos;
        finalY = xPos - h / 2;
        break;
      case "RL":
        finalX = maxDepthPos - depthPos - w;
        finalY = xPos - h / 2;
        break;
      case "BT":
        finalX = xPos - w / 2;
        finalY = maxDepthPos - depthPos - h;
        break;
      case "TB":
      default:
        finalX = xPos - w / 2;
        finalY = depthPos;
        break;
    }

    return {
      ...node,
      position: { x: finalX, y: finalY },
      data: { ...node.data, layoutDirection: direction, isHorizontal },
    } as FewerNode;
  });
}

/**
 * Main Layout Entrypoints
 */
export async function layoutGraph(
  nodes: FewerNode[],
  edges: FewerEdge[],
  direction: LayoutDirection = "TB",
  options?: LayoutOptions
): Promise<FewerNode[]> {
  return layoutGraphContour(nodes, edges, direction, options);
}

export function layoutGraphSync(
  nodes: FewerNode[],
  edges: FewerEdge[],
  direction: LayoutDirection = "TB",
  options?: LayoutOptions
): FewerNode[] {
  return layoutGraphContour(nodes, edges, direction, options);
}

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