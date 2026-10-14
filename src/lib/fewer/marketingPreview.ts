/**
 * The demo tree behind the marketing home page (T-150, revised).
 *
 * One source of truth for BOTH views of the same data: the hero canvas and
 * the `tree` pane, so the two can never disagree. Pure module (no React) so
 * the layout rules, the paths and the edge geometry are unit-testable.
 *
 * The tree IS the feature catalogue (T-151 follow-up): a folder card per
 * MARKETING_CATEGORIES group, a file card per MARKETING_FEATURES feature, and
 * the card's id IS the feature's id. The earlier version modelled a sample
 * project (`src/`, `docs/`, `package.json`) and then asserted - through an
 * anchor map - that package.json "demonstrates" exporting, which was a
 * relationship the graph never had. Deriving the graph from the catalogue
 * makes the relationship structural: hovering a card activates that feature
 * because they are the same id, and the rail, the canvas and the tree pane
 * all read one list.
 *
 * The cards keep the product's look (same shell, tokens and proportions): the
 * folder cards are the product's own DEFAULT_FOLDER_WIDTH/HEIGHT (240x200),
 * the file cards are 220 wide like DEFAULT_FILE_WIDTH but a single line tall
 * (44, vs the product's 58) - a demo feature card carries its name and
 * nothing else, and a two-line card holding one line was just padding (T-154).
 * The positions are DERIVED, not hand-placed: one sibling gap, one level gap,
 * every parent centred on its children. Hand-placed coords had drifted apart -
 * the three `docs` children were stacked with no gap at all while `src`'s had
 * 20px, and the last card sat flush against the box edge where its own outline
 * got clipped.
 *
 * The layout takes the Crown Shyness dial (1 = default, up to 3) and scales
 * the SIBLING axis with the product's own curve (effectiveShynessScale from
 * layout.ts). Sibling axis, not depth: that is the gap shynessGap() widens for
 * a left-right tree, and it is the only axis a change is visible here - the
 * canvas fits its container by WIDTH, so a horizontal spread would be
 * cancelled out by the fit zoom.
 *
 * PreviewGraph lays these cards out in this coordinate space and zooms the
 * whole box to fit, which is what keeps the preview honest instead of a
 * stylised miniature.
 */

import { effectiveShynessScale } from "./layout";
import { MARKETING_CATEGORIES, MARKETING_FEATURES } from "./marketingFeatures";

/**
 * The graph's data shape: the product's node fields that actually exist here.
 * No `extension`, `size` or `category` - these cards are features, not files,
 * and inventing file metadata for them would be the same lie the anchor map
 * told with a prettier face.
 */
export interface PreviewNode {
  id: string;
  label: string;
  kind: "folder" | "file";
  parent: string | null;
  /** Derived left-direction coord in the canvas box (see previewLayout). */
  x: number;
  /** Derived top coord in the canvas box. */
  y: number;
}

/** Folder cards are the product's; file cards are single-line (see header). */
export const PREVIEW_FOLDER = { w: 240, h: 200 } as const;
export const PREVIEW_FILE = { w: 220, h: 44 } as const;

/** Below this rendered width the box stops shrinking and scrolls instead. */
export const PREVIEW_MIN_WIDTH = 520;

/** Sibling-axis gap at the default dial (1). Exported for the layout tests. */
export const SIBLING_GAP = 20;

/** Level-axis gap: a card's right edge to the next column. Never scaled. */
export const LEVEL_GAP = 80;

/** Clearance around the graph: the active outline and the card shadow need it. */
export const CANVAS_PAD = 16;

/** The tree itself; previewLayout() adds the derived x/y and the canvas box. */
interface PreviewSpec {
  id: string;
  label: string;
  kind: "folder" | "file";
  parent: string | null;
}

/**
 * Derived from the catalogue: root folder, one folder per rail group, one
 * file card per feature (id = feature id, label = chip). The non-null
 * assertions are load-bearing - a category naming an unknown feature fails
 * here at module load, and marketingFeatures.test.ts pins the bijection.
 */
const PREVIEW_SPECS: PreviewSpec[] = [
  { id: "root", label: "fewer", kind: "folder", parent: null },
  ...MARKETING_CATEGORIES.flatMap((group) => [
    { id: group.id, label: group.label, kind: "folder" as const, parent: "root" },
    ...group.features.map((featureId) => {
      const feature = MARKETING_FEATURES.find((f) => f.id === featureId)!;
      return { id: feature.id, label: feature.chip, kind: "file" as const, parent: group.id };
    }),
  ]),
];

function cardSize(kind: "folder" | "file") {
  return kind === "folder" ? PREVIEW_FOLDER : PREVIEW_FILE;
}

/**
 * Lay the demo tree out at one Crown Shyness setting.
 *
 * Columns are fixed per depth, siblings stack down a single gap, every parent
 * is centred on its children's CARDS (the product centres a parent over the
 * child positions too - childrenCenter in layout.ts), and the whole block is
 * pushed down so its top sits CANVAS_PAD from the box edge. A parent's extent
 * for CLEARING is its own card OR its children's subtree, whichever reaches
 * further: a 200px folder whose children spill below it still reserves that
 * spill for the next sibling, which is why no two cards can ever touch,
 * whatever the dial says.
 */
export function previewLayout(
  shyness = 1,
): { nodes: PreviewNode[]; canvas: { w: number; h: number } } {
  const rowGap = SIBLING_GAP * (1 + effectiveShynessScale(shyness));
  const childrenOf = (id: string) => PREVIEW_SPECS.filter((s) => s.parent === id);

  const depthOf = (spec: PreviewSpec): number => {
    let depth = 0;
    let current = spec;
    while (current.parent) {
      current = PREVIEW_SPECS.find((s) => s.id === current.parent)!;
      depth += 1;
    }
    return depth;
  };

  const maxDepth = Math.max(...PREVIEW_SPECS.map(depthOf));
  const columnX: number[] = [];
  let x = CANVAS_PAD;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    columnX[depth] = x;
    const widest = Math.max(
      ...PREVIEW_SPECS.filter((s) => depthOf(s) === depth).map((s) => cardSize(s.kind).w),
    );
    x += widest + LEVEL_GAP;
  }
  const canvasW = x - LEVEL_GAP + CANVAS_PAD;

  const ys = new Map<string, number>();
  let cursor = 0;
  const subtreeIds = (id: string): string[] =>
    childrenOf(id).flatMap((kid) => [kid.id, ...subtreeIds(kid.id)]);
  const place = (spec: PreviewSpec): { top: number; bottom: number } => {
    const kids = childrenOf(spec.id);
    const { h } = cardSize(spec.kind);
    if (kids.length === 0) {
      const top = cursor;
      cursor += h;
      ys.set(spec.id, top);
      return { top, bottom: cursor };
    }
    const start = cursor;
    let subTop = Infinity;
    let subBottom = -Infinity;
    let cardTop = Infinity;
    let cardBottom = -Infinity;
    kids.forEach((kid, i) => {
      if (i > 0) cursor += rowGap;
      const span = place(kid);
      subTop = Math.min(subTop, span.top);
      subBottom = Math.max(subBottom, span.bottom);
      // Centre on the child's CARD, like the product does (childrenCenter in
      // layout.ts), not on its subtree extent: a folder whose children spill
      // well past its own 200px would otherwise drag the parent off the line
      // the reader sees as "centred".
      const kidTop = ys.get(kid.id)!;
      cardTop = Math.min(cardTop, kidTop);
      cardBottom = Math.max(cardBottom, kidTop + cardSize(kid.kind).h);
    });
    const parentTop = (cardTop + cardBottom) / 2 - h / 2;
    // A folder taller than its children block (3 single-line cards = 172 vs
    // the card's 200) would centre by floating ABOVE its slot - and the next
    // sibling's card then lands inside this one's gap. When that happens, move
    // the whole placed subtree down with the card instead: centring holds, the
    // card starts at its slot, and the sibling gap stays a real gap (T-154).
    let shift = 0;
    if (parentTop < start) {
      shift = start - parentTop;
      for (const id of subtreeIds(spec.id)) ys.set(id, ys.get(id)! + shift);
      subTop += shift;
      subBottom += shift;
      cursor += shift;
    }
    ys.set(spec.id, parentTop + shift);
    // The next sibling still clears the WHOLE subtree (children included),
    // not just the cards: a folder's children may hang past its card.
    const extent = {
      top: Math.min(start, subTop, parentTop + shift),
      bottom: Math.max(cursor, subBottom, parentTop + shift + h),
    };
    cursor = extent.bottom;
    return extent;
  };
  const span = place(PREVIEW_SPECS.find((s) => !s.parent)!);

  const shift = CANVAS_PAD - span.top;
  const nodes: PreviewNode[] = PREVIEW_SPECS.map((spec) => ({
    ...spec,
    x: columnX[depthOf(spec)],
    y: Math.round((ys.get(spec.id) ?? 0) + shift),
  }));

  return {
    nodes,
    canvas: { w: canvasW, h: Math.round(span.bottom + shift + CANVAS_PAD) },
  };
}

/** The default (shyness = 1) layout: what the page ships and what tests pin. */
export const PREVIEW_LAYOUT = previewLayout();
export const PREVIEW_NODES: PreviewNode[] = PREVIEW_LAYOUT.nodes;
export const PREVIEW_CANVAS = PREVIEW_LAYOUT.canvas;

export interface PreviewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nodeBox(node: PreviewNode): PreviewBox {
  const { w, h } = cardSize(node.kind);
  return { x: node.x, y: node.y, w, h };
}

/** Children of a node, in declaration order. */
export function previewChildren(id: string, nodes: PreviewNode[] = PREVIEW_NODES): PreviewNode[] {
  return nodes.filter((n) => n.parent === id);
}

/**
 * `~/…` path for every node, built from the same labels the cards show. The
 * real cards print `data.path` under the name; this is the demo equivalent.
 */
export function previewPaths(nodes: PreviewNode[] = PREVIEW_NODES): Record<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const paths: Record<string, string> = {};
  const resolve = (node: PreviewNode): string => {
    if (paths[node.id]) return paths[node.id];
    paths[node.id] = node.parent
      ? `${resolve(byId.get(node.parent)!)}/${node.label}`
      : `~/${node.label}`;
    return paths[node.id];
  };
  for (const node of nodes) resolve(node);
  return paths;
}

/**
 * Bezier edges from a parent's right edge to a child's left edge — the same
 * routing React Flow uses (getBezierPath), controls at 40% of the gap.
 */
export function previewEdgePaths(
  nodes: PreviewNode[] = PREVIEW_NODES,
): { from: string; to: string; d: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const paths: { from: string; to: string; d: string }[] = [];
  for (const node of nodes) {
    if (!node.parent) continue;
    const parent = byId.get(node.parent);
    if (!parent) continue;
    const a = nodeBox(parent);
    const b = nodeBox(node);
    const sx = a.x + a.w;
    const sy = a.y + a.h / 2;
    const ex = b.x;
    const ey = b.y + b.h / 2;
    const dx = (ex - sx) * 0.4;
    paths.push({
      from: parent.id,
      to: node.id,
      d: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`,
    });
  }
  return paths;
}

/**
 * `tree`-style text of the same graph, for the comparison pane's "before"
 * side. Box-drawing connectors, folders marked with a trailing slash.
 */
export function graphToTextLines(nodes: PreviewNode[] = PREVIEW_NODES): string[] {
  const lines: string[] = [];

  const emit = (parent: PreviewNode, prefix: string) => {
    const kids = previewChildren(parent.id, nodes);
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${kid.label}${kid.kind === "folder" ? "/" : ""}`);
      if (kid.kind === "folder") emit(kid, prefix + (last ? "    " : "│   "));
    });
  };

  for (const root of nodes.filter((n) => !n.parent)) {
    lines.push(`./${root.label}`);
    emit(root, "");
  }
  return lines;
}
