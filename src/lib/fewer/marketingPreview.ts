/**
 * The demo tree behind the marketing home page (T-150, revised).
 *
 * One source of truth for BOTH views of the same folder: the hero canvas and
 * the `tree` pane, so the two can never disagree about the data they show off.
 * Pure module (no React) so the layout rules, the paths and the edge geometry
 * are unit-testable.
 *
 * The cards are the product's own dimensions (DEFAULT_FOLDER_WIDTH/HEIGHT and
 * DEFAULT_FILE_WIDTH/HEIGHT from src/lib/fewer/layout.ts) and the positions
 * are DERIVED, not hand-placed: one sibling gap, one level gap, every parent centred on its
 * children. Hand-placed coords had drifted apart - the three `docs` children
 * were stacked with no gap at all while `src`'s had 20px, and the last card
 * sat flush against the box edge where its own outline got clipped.
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
import type { FileCategory } from "./types";

export interface PreviewNode {
  id: string;
  label: string;
  kind: "folder" | "file";
  parent: string | null;
  /** Derived left-direction coord in the canvas box (see previewLayout). */
  x: number;
  /** Derived top coord in the canvas box. */
  y: number;
  /** Drives the icon through CATEGORY_ICON, exactly like a real file card. */
  category?: FileCategory;
  /** Files store the stem and the extension separately, like `data.label` + `data.extension`. */
  extension?: string;
  /** Bytes; rendered through formatSize() like a real file card. */
  size?: number;
}

/** The product's real card dimensions (src/lib/fewer/layout.ts), not scaled. */
export const PREVIEW_FOLDER = { w: 240, h: 200 } as const;
export const PREVIEW_FILE = { w: 220, h: 58 } as const;

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
  category?: FileCategory;
  extension?: string;
  size?: number;
}

const PREVIEW_SPECS: PreviewSpec[] = [
  { id: "root", label: "fewer", kind: "folder", parent: null },
  { id: "src", label: "src", kind: "folder", parent: "root" },
  { id: "layout", label: "layout", kind: "file", parent: "src", category: "code", extension: "ts", size: 4300 },
  { id: "types", label: "types", kind: "file", parent: "src", category: "code", extension: "ts", size: 1850 },
  // docs carries children because it carries two hotspots: an empty folder
  // card renders "Empty folder" next to a watch story about its contents,
  // which is the demo contradicting itself in one glance.
  { id: "docs", label: "docs", kind: "folder", parent: "root" },
  { id: "doc-editing", label: "editing", kind: "file", parent: "docs", category: "document", extension: "md", size: 8400 },
  { id: "doc-watch", label: "watch", kind: "file", parent: "docs", category: "document", extension: "md", size: 2600 },
  { id: "doc-import", label: "import-export", kind: "file", parent: "docs", category: "document", extension: "md", size: 12100 },
  { id: "readme", label: "README", kind: "file", parent: "root", category: "document", extension: "md", size: 6100 },
  { id: "pkg", label: "package", kind: "file", parent: "root", category: "config", extension: "json", size: 2150 },
];

function cardSize(kind: "folder" | "file") {
  return kind === "folder" ? PREVIEW_FOLDER : PREVIEW_FILE;
}

/**
 * Lay the demo tree out at one Crown Shyness setting.
 *
 * Columns are fixed per depth, siblings stack down a single gap, every parent
 * is centred on the span of its children, and the whole block is pushed down so
 * its top sits CANVAS_PAD from the box edge. A parent's extent is its own card
 * OR its children's span, whichever is taller: a 200px folder with three 58px
 * children stacks 215px tall and overhangs it by a few px, and that extent is
 * what the next sibling has to clear - which is why no two cards can ever
 * touch, whatever the dial says.
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
    let top = Infinity;
    let bottom = -Infinity;
    kids.forEach((kid, i) => {
      if (i > 0) cursor += rowGap;
      const span = place(kid);
      top = Math.min(top, span.top);
      bottom = Math.max(bottom, span.bottom);
    });
    const parentTop = (top + bottom) / 2 - h / 2;
    ys.set(spec.id, parentTop);
    const extent = {
      top: Math.min(start, top, parentTop),
      bottom: Math.max(cursor, bottom, parentTop + h),
    };
    // The next sibling clears the WHOLE subtree, not just its children: a
    // parent's card may hang below the stack it is centred on.
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

/** File labels carry their extension separately, the way the app stores them. */
export function nodeFileName(node: PreviewNode): string {
  if (node.kind !== "file") return node.label;
  return node.extension ? `${node.label}.${node.extension}` : node.label;
}

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
    const name = nodeFileName(node);
    paths[node.id] = node.parent
      ? `${resolve(byId.get(node.parent)!)}/${name}`
      : `~/${name}`;
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
      lines.push(`${prefix}${last ? "└── " : "├── "}${nodeFileName(kid)}${kid.kind === "folder" ? "/" : ""}`);
      if (kid.kind === "folder") emit(kid, prefix + (last ? "    " : "│   "));
    });
  };

  for (const root of nodes.filter((n) => !n.parent)) {
    lines.push(`./${nodeFileName(root)}`);
    emit(root, "");
  }
  return lines;
}
