/**
 * The demo tree behind the marketing home page (T-150).
 *
 * One source of truth for BOTH panes of the "tree vs fewer" comparison and for
 * the hero canvas, so the two views can never disagree about the data they are
 * showing off. Pure module (no React) so the tree text and the edge geometry
 * are unit-testable.
 */

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
}

/** Canvas box the coords above live in; also the <svg> viewBox / aspect ratio. */
export const PREVIEW_CANVAS = { w: 578, h: 419 } as const;

/** Real product proportions from src/lib/fewer/layout.ts, scaled down. */
export const PREVIEW_FOLDER = { w: 168, h: 140 } as const; // 240×200 × 0.7
export const PREVIEW_FILE = { w: 154, h: 40 } as const; //   220×58 × 0.7

export const PREVIEW_NODES: PreviewNode[] = [
  { id: "root", label: "fewer", kind: "folder", parent: null, x: 0, y: 148 },
  { id: "src", label: "src", kind: "folder", parent: "root", x: 212, y: 17 },
  { id: "layout", label: "layout.ts", kind: "file", parent: "src", x: 424, y: 40 },
  { id: "types", label: "types.ts", kind: "file", parent: "src", x: 424, y: 94 },
  { id: "docs", label: "docs", kind: "folder", parent: "root", x: 212, y: 171 },
  { id: "readme", label: "README.md", kind: "file", parent: "root", x: 212, y: 325 },
  { id: "pkg", label: "package.json", kind: "file", parent: "root", x: 212, y: 379 },
];

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
  const childrenOf = (id: string) => nodes.filter((n) => n.parent === id);
  const lines: string[] = [];

  const emit = (parent: PreviewNode, prefix: string) => {
    const kids = childrenOf(parent.id);
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
