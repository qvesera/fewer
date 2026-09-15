import type { FewerNode, FewerEdge, LayoutDirection } from "./types";
import { compareSiblings } from "./sorting";
import type { SortKey, SortDir } from "./sorting";
import { DEFAULT_SORT_KEY, DEFAULT_SORT_DIR } from "./sorting";

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
  /** How siblings are ordered within a level. Defaults to name A→Z (current behavior). */
  sortKey?: SortKey;
  /** Direction applied to the primary sort key. Defaults to asc. */
  sortDir?: SortDir;
  /** tagId → label lookup, required only when `sortKey === "tag"`. */
  tagLabelById?: (id: string) => string;
}

// ponytail: linear per-level/per-log-size gap growth, capped at 20x base —
// upgrade path is per-contour-point gap shaping if trees ever need it.
// Coefficients are full-strength values: the slider applies a fraction of them
// (SHYNESS_TOP at the top, scaled down further by effectiveShynessScale below).
// Tuned against the real SAMPLE_TREE plus a 1.7K-node synthetic tree so every
// step of the slider is worth seeing (measured with
// `bun test src/lib/fewer/layout.shyness.tuning.test.ts` while tuning; re-measure
// before changing these):
//   sample TB: 0 -> 1 +1%, 0 -> 2 +8%, 0 -> 3 +28% span
//   sample LR: 0 -> 1 +3%, 0 -> 2 +21%, 0 -> 3 +71% span
// The sibling axis in TB is dominated by card width, so its relative growth is
// smaller than LR's, where the sibling axis is card height — both ends of the
// slider are clearly different. Growth stays proportional on large trees (the
// 1.7K node probe spreads the same ~3x over 0 -> 3, no accumulation blow-up).
// A big SHYNESS_SIZE_K is what opens up leaf-pair layers: sibling separation is
// otherwise dominated by card widths, which is why the old 8/2 pair with a 3x
// cap moved a wide flat project by ~2% end to end — below the threshold of
// noticing, the "0 and 3 look the same" report.
export const SHYNESS_DEPTH_K = 40; // extra px per contour level below the sibling pair, at full strength
export const SHYNESS_SIZE_K = 70; // extra px per log2(1 + smaller subtree's node count), at full strength
export const SHYNESS_MAX_MULTIPLE = 20; // gap never exceeds baseGap * this

/** Cubic slider response: the dial is a position, not the strength. */
export const SHYNESS_CURVE = 3;

/**
 * Strength the top of the slider applies, as a multiple of the tuned
 * coefficients: 3 * (2/3)^SHYNESS_CURVE = 8/9, the value 2x produced before the
 * cap. Full strength spaced a wide graph out further than is useful to read, so
 * the dial now stops where 2x used to — 3x is still the strongest setting, it
 * just tops out at 8/9 of the coefficients instead of all of them.
 */
export const SHYNESS_TOP = 3 * Math.pow(2 / 3, SHYNESS_CURVE); // = 8/9

/**
 * Crown Shyness slider value → coefficient multiplier.
 *
 * Deliberately superlinear, and capped below full strength. 1x is the default,
 * and the initial fit clamps at zoom 0.35 (use-canvas-initial-fit.ts), so a fat
 * default pushes the far side of the tree outside the viewport, where
 * `onlyRenderVisibleElements` culls it (measured on a 1280x600 canvas: a linear
 * response spread the sample tree's LR layout 78% wider at 1x and dropped the
 * initial-fit coverage from 71% to 40%, which is how the e2e suite lost nodes on
 * the initial view). Curving the response keeps the default at the spacing a
 * default canvas has always had, while the top of the range — SHYNESS_TOP, the
 * strength 2x used to produce — is where the slider does its work: 0 -> 3 is
 * +28% (TB) / +71% (LR) on the sample tree.
 */
export function effectiveShynessScale(scale: number): number {
  const clamped = Math.max(0, Math.min(3, scale));
  return SHYNESS_TOP * Math.pow(clamped / 3, SHYNESS_CURVE);
}

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
  // The slider value is mapped through the cubic response here — the single
  // funnel every layout call goes through — so shynessGap stays a plain
  // "base + extra * scale" primitive.
  const shynessScale = effectiveShynessScale(options?.shynessScale ?? 1);
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

  const sortKey = options?.sortKey ?? DEFAULT_SORT_KEY;
  const sortDir = options?.sortDir ?? DEFAULT_SORT_DIR;
  const tagLabelById = options?.tagLabelById;

  for (const childIds of childrenMap.values()) {
    childIds.sort((a, b) => {
      const nodeA = nodeMap.get(a);
      const nodeB = nodeMap.get(b);
      if (!nodeA || !nodeB) {
        // Fallback to the original label sort when a node hasn't been built yet.
        const labelA = nodeA?.data?.label || a;
        const labelB = nodeB?.data?.label || b;
        return labelA.localeCompare(labelB);
      }
      return compareSiblings(nodeA, nodeB, sortKey, sortDir, tagLabelById);
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