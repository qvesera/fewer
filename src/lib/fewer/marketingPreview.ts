/**
 * The demo tree behind the marketing home page (T-150).
 *
 * One source of truth for BOTH panes of the "tree vs fewer" comparison and for
 * the hero canvas, so the two views can never disagree about the data they are
 * showing off. Pure module (no React) so the tree text, the paths and the edge
 * geometry are unit-testable.
 *
 * The geometry below is the product's own: DEFAULT_FOLDER_WIDTH/HEIGHT and
 * DEFAULT_FILE_WIDTH/HEIGHT from src/lib/fewer/layout.ts, at 1:1. PreviewGraph
 * lays these cards out in this coordinate space and zooms the whole box to
 * fit, which is what keeps the preview honest instead of a stylised miniature.
 */

import type { FileCategory } from "./types";

export interface PreviewNode {
  id: string;
  label: string;
  kind: "folder" | "file";
  parent: string | null;
  /**
   * Hand-placed left-direction coords in PREVIEW_CANVAS space, centred so each
   * folder sits on the middle of its children.
   * ponytail: hand-placed, not `layout.ts` — that one measures real DOM nodes
   * and this graph is static. Revisit if the demo ever grows past one screen.
   */
  x: number;
  y: number;
  /** Drives the icon through CATEGORY_ICON, exactly like a real file card. */
  category?: FileCategory;
  /** Files store the stem and the extension separately, like `data.label` + `data.extension`. */
  extension?: string;
  /** Bytes; rendered through formatSize() like a real file card. */
  size?: number;
}

/** Design box the coords live in; PreviewGraph zooms it to fit its container. */
export const PREVIEW_CANVAS = { w: 860, h: 584 } as const;

/** The product's real card dimensions (src/lib/fewer/layout.ts), not scaled. */
export const PREVIEW_FOLDER = { w: 240, h: 200 } as const;
export const PREVIEW_FILE = { w: 220, h: 58 } as const;

/** Below this rendered width the box stops shrinking and scrolls instead. */
export const PREVIEW_MIN_WIDTH = 520;

export const PREVIEW_NODES: PreviewNode[] = [
  { id: "root", label: "fewer", kind: "folder", parent: null, x: 0, y: 196 },
  { id: "src", label: "src", kind: "folder", parent: "root", x: 320, y: 8 },
  { id: "layout", label: "layout", kind: "file", parent: "src", x: 640, y: 40, category: "code", extension: "ts", size: 4300 },
  { id: "types", label: "types", kind: "file", parent: "src", x: 640, y: 118, category: "code", extension: "ts", size: 1850 },
  { id: "docs", label: "docs", kind: "folder", parent: "root", x: 320, y: 228 },
  { id: "readme", label: "README", kind: "file", parent: "root", x: 320, y: 448, category: "document", extension: "md", size: 6100 },
  { id: "pkg", label: "package", kind: "file", parent: "root", x: 320, y: 526, category: "config", extension: "json", size: 2150 },
];

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
  const { w, h } = node.kind === "folder" ? PREVIEW_FOLDER : PREVIEW_FILE;
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
