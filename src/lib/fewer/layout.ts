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
 * State the bottom-up contour pass reads and fills. The maps are as much an
 * output as an input (relativeXMap is written as subtrees are placed), so they
 * travel together instead of as eight positional arguments.
 */
interface LayoutPass {
  nodeMap: Map<string, FewerNode>;
  childrenMap: Map<string, string[]>;
  subtreeSizes: Map<string, number>;
  relativeXMap: Map<string, number>;
  isHorizontal: boolean;
  nodeGap: number; // spacing between adjacent subtrees on the sibling axis
  shyness: boolean;
  shynessScale: number;
}

/** childrenMap + parentMap over the edges that survive excludeFromLayout. */
function buildHierarchy(
  edges: FewerEdge[],
  excludeSet: Set<string>
): { childrenMap: Map<string, string[]>; parentMap: Map<string, string> } {
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const edge of edges) {
    if (excludeSet.has(edge.source) || excludeSet.has(edge.target)) continue;
    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
    childrenMap.get(edge.source)!.push(edge.target);
    parentMap.set(edge.target, edge.source);
  }
  return { childrenMap, parentMap };
}

/** Order every sibling list by the requested sort. */
function sortChildLists(
  childrenMap: Map<string, string[]>,
  nodeMap: Map<string, FewerNode>,
  options?: LayoutOptions
): void {
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
}

/** Depth of every node reachable from the roots; roots sit at 0. */
function computeDepths(
  roots: FewerNode[],
  childrenMap: Map<string, string[]>
): Map<string, number> {
  const nodeDepths = new Map<string, number>();
  // `path` is the chain currently being walked, so a back-edge into it is cut
  // instead of recursing forever. On an acyclic graph it can never contain
  // `nodeId` on entry — a node is not its own ancestor — so the traversal, and
  // the last-write-wins depth, are unchanged. On an imported cycle it stops the
  // unbounded recursion that used to overflow the stack.
  function calculateDepths(nodeId: string, currentDepth: number, path: Set<string>) {
    nodeDepths.set(nodeId, currentDepth);
    if (path.has(nodeId)) return;
    path.add(nodeId);
    const children = childrenMap.get(nodeId) ?? [];
    for (const childId of children) {
      calculateDepths(childId, currentDepth + 1, path);
    }
    path.delete(nodeId);
  }
  for (const root of roots) {
    calculateDepths(root.id, 0, new Set<string>());
  }
  return nodeDepths;
}

/** Primary-axis start of every depth layer: deepest card in the layer + layer gap. */
function computeDepthPositions(
  nodeDepths: Map<string, number>,
  nodeMap: Map<string, FewerNode>,
  isHorizontal: boolean,
  layerGap: number
): number[] {
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
  return depthPositions;
}

/** Node count per subtree, post-order and memoized — the crown-shyness size term. */
function computeSubtreeSizes(
  roots: FewerNode[],
  childrenMap: Map<string, string[]>
): Map<string, number> {
  const subtreeSizes = new Map<string, number>();
  // Nodes on the chain currently being walked. The memo is written *after* the
  // recursion returns, so a back-edge would otherwise never hit the cache and
  // would recurse forever. On an acyclic graph this never fires, so sizes are
  // unchanged; on an imported cycle the repeated node counts once.
  const visiting = new Set<string>();
  function computeSubtreeSize(nodeId: string): number {
    const cached = subtreeSizes.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) return 1;
    visiting.add(nodeId);
    let count = 1;
    for (const childId of childrenMap.get(nodeId) ?? []) {
      count += computeSubtreeSize(childId);
    }
    visiting.delete(nodeId);
    subtreeSizes.set(nodeId, count);
    return count;
  }
  for (const root of roots) computeSubtreeSize(root.id);
  return subtreeSizes;
}

/**
 * How far `contour` must sit right of one already-placed sibling: the worst
 * required shift over every contour level the two crowns share, widened by
 * crown shyness.
 */
function shiftClearOf(
  pass: LayoutPass,
  prevContour: TreeContour,
  prevOffset: number,
  contour: TreeContour,
  prevSize: number,
  size: number
): number {
  const baseGap = pass.isHorizontal ? 50 : pass.nodeGap;
  const compareDepth = Math.min(prevContour.right.length, contour.left.length);
  let maxOverlapShift = 0;

  for (let d = 0; d < compareDepth; d++) {
    const prevRight = prevOffset + prevContour.right[d];
    const currLeft = contour.left[d];
    // Crown shyness: gap grows with crown depth + crown size
    const gap = pass.shyness
      ? shynessGap(baseGap, d, prevSize, size, pass.shynessScale)
      : baseGap;
    const requiredShift = prevRight - currLeft + gap;
    if (requiredShift > maxOverlapShift) {
      maxOverlapShift = requiredShift;
    }
  }
  return maxOverlapShift;
}

/** Fold a child's contour into its parent's, shifted by the child's offset. */
function mergeIntoParent(target: TreeContour, child: TreeContour, relX: number): void {
  for (let d = 0; d < child.left.length; d++) {
    const targetDepth = d + 1;
    const cLeft = child.left[d] + relX;
    const cRight = child.right[d] + relX;

    if (target.left[targetDepth] === undefined) {
      target.left[targetDepth] = cLeft;
      target.right[targetDepth] = cRight;
    } else {
      target.left[targetDepth] = Math.min(target.left[targetDepth], cLeft);
      target.right[targetDepth] = Math.max(target.right[targetDepth], cRight);
    }
  }
}

/**
 * Bottom-up contour pass over one subtree: places its siblings left to right
 * against every sibling already placed, centers the parent over the group, and
 * records each child's offset from that parent center in pass.relativeXMap.
 */
function layoutSubtree(pass: LayoutPass, nodeId: string, path: Set<string>): TreeContour {
  const node = pass.nodeMap.get(nodeId)!;
  const { w, h } = getNodeDimensions(node);
  const nodeSize = pass.isHorizontal ? h : w;
  const children = pass.childrenMap.get(nodeId) ?? [];

  // A back-edge into the chain being walked would recurse forever. On an
  // acyclic graph it never fires; on an imported cycle the repeated node is
  // laid out as a leaf, which keeps the whole layout finite.
  if (children.length === 0 || path.has(nodeId)) {
    pass.relativeXMap.set(nodeId, 0);
    return {
      left: [-nodeSize / 2],
      right: [nodeSize / 2],
    };
  }
  path.add(nodeId);

  const childContours: TreeContour[] = [];
  const childOffsets: number[] = [];

  for (let i = 0; i < children.length; i++) {
    const childId = children[i];
    const contour = layoutSubtree(pass, childId, path);
    childContours.push(contour);

    if (i === 0) {
      childOffsets.push(0);
      continue;
    }

    // Compare against ALL previously placed siblings to prevent cross-subtree overlap
    let maxOverlapShift = 0;
    for (let j = 0; j < i; j++) {
      const shift = shiftClearOf(
        pass,
        childContours[j],
        childOffsets[j],
        contour,
        pass.subtreeSizes.get(children[j]) ?? 1,
        pass.subtreeSizes.get(childId) ?? 1
      );
      if (shift > maxOverlapShift) {
        maxOverlapShift = shift;
      }
    }
    childOffsets.push(maxOverlapShift);
  }

  // Center parent over children group
  const childrenCenter = (childOffsets[0] + childOffsets[childOffsets.length - 1]) / 2;

  const merged: TreeContour = { left: [-nodeSize / 2], right: [nodeSize / 2] };
  for (let i = 0; i < children.length; i++) {
    // Final relative position from parent
    const relX = childOffsets[i] - childrenCenter;
    pass.relativeXMap.set(children[i], relX);
    mergeIntoParent(merged, childContours[i], relX);
  }

  pass.relativeXMap.set(nodeId, 0);
  path.delete(nodeId);
  return merged;
}

/** Top-down absolute sibling-axis position for every node of a subtree. */
function assignPositions(
  pass: LayoutPass,
  nodeId: string,
  currentAbsoluteX: number,
  out: Map<string, number>,
  path: Set<string>
): void {
  out.set(nodeId, currentAbsoluteX);
  // Same back-edge cut as layoutSubtree: a no-op on acyclic graphs.
  if (path.has(nodeId)) return;
  path.add(nodeId);

  for (const childId of pass.childrenMap.get(nodeId) ?? []) {
    const relX = pass.relativeXMap.get(childId) ?? 0;
    assignPositions(pass, childId, currentAbsoluteX + relX, out, path);
  }
  path.delete(nodeId);
}

/** Depth-layer position + sibling position → final x/y for the direction. */
function directionPosition(
  node: FewerNode,
  direction: LayoutDirection,
  depthPos: number,
  xPos: number,
  maxDepthPos: number
): { x: number; y: number } {
  const { w, h } = getNodeDimensions(node);
  switch (direction) {
    case "LR":
      return { x: depthPos, y: xPos - h / 2 };
    case "RL":
      return { x: maxDepthPos - depthPos - w, y: xPos - h / 2 };
    case "BT":
      return { x: xPos - w / 2, y: maxDepthPos - depthPos - h };
    case "TB":
    default:
      return { x: xPos - w / 2, y: depthPos };
  }
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

  const { childrenMap, parentMap } = buildHierarchy(edges, excludeSet);
  const roots = nodes.filter(
    (n) => !excludeSet.has(n.id) && !parentMap.has(n.id)
  );
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  sortChildLists(childrenMap, nodeMap, options);

  // 1. Depth level for every node
  const nodeDepths = computeDepths(roots, childrenMap);

  // 2. Dynamic depth layer positions (Y in TB/BT, X in LR/RL)
  const depthPositions = computeDepthPositions(nodeDepths, nodeMap, isHorizontal, layerGap);

  // 2b. Crown-shyness gap scaling reads the subtree sizes; the contour pass
  // writes each node's offset from its parent center into pass.relativeXMap.
  const pass: LayoutPass = {
    nodeMap,
    childrenMap,
    subtreeSizes: computeSubtreeSizes(roots, childrenMap),
    relativeXMap: new Map(),
    isHorizontal,
    nodeGap,
    shyness,
    shynessScale,
  };

  // 3. Bottom-up subtree layout with exact contour matching, then top-down
  // assignment of absolute sibling-axis positions per root.
  const rootXMap = new Map<string, number>();
  let rootXOffset = 0;
  for (const root of roots) {
    const contour = layoutSubtree(pass, root.id, new Set<string>());
    const minL = Math.min(...contour.left);
    const maxR = Math.max(...contour.right);

    assignPositions(pass, root.id, rootXOffset - minL, rootXMap, new Set<string>());
    rootXOffset += (maxR - minL) + 120;
  }

  // 4. Build output node positions with direction inversions (TB, LR, BT, RL)
  const maxDepthPos = depthPositions[depthPositions.length - 1] ?? 0;

  return nodes.map((node) => {
    const data = { ...node.data, layoutDirection: direction, isHorizontal };
    if (excludeSet.has(node.id)) {
      return { ...node, data } as FewerNode;
    }

    const depth = nodeDepths.get(node.id) ?? 0;
    return {
      ...node,
      position: directionPosition(
        node,
        direction,
        depthPositions[depth],
        rootXMap.get(node.id) ?? 0,
        maxDepthPos
      ),
      data,
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