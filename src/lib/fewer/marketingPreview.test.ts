import { describe, expect, test } from "bun:test";
import {
  PREVIEW_CANVAS,
  PREVIEW_NODES,
  graphToTextLines,
  nodeBox,
  previewEdgePaths,
} from "./marketingPreview";

describe("marketingPreview", () => {
  test("every node sits inside the canvas box", () => {
    for (const node of PREVIEW_NODES) {
      const box = nodeBox(node);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(PREVIEW_CANVAS.w);
      expect(box.y + box.h).toBeLessThanOrEqual(PREVIEW_CANVAS.h);
    }
  });

  test("parents are declared before use and every parent resolves", () => {
    const ids = new Set(PREVIEW_NODES.map((n) => n.id));
    for (const node of PREVIEW_NODES) {
      if (node.parent) expect(ids.has(node.parent)).toBe(true);
    }
    const roots = PREVIEW_NODES.filter((n) => !n.parent);
    expect(roots).toHaveLength(1);
  });

  test("graphToTextLines renders the tree shape of the same data", () => {
    const lines = graphToTextLines();
    expect(lines).toEqual([
      "./fewer",
      "├── src/",
      "│   ├── layout.ts",
      "│   └── types.ts",
      "├── docs/",
      "├── README.md",
      "└── package.json",
    ]);
  });

  test("previewEdgePaths connects every non-root exactly once", () => {
    const paths = previewEdgePaths();
    expect(paths).toHaveLength(PREVIEW_NODES.length - 1);
    for (const p of paths) expect(p.d.startsWith("M ")).toBe(true);
    // A folder's edge leaves its right edge; a child's arrives at its left.
    const src = paths.find((p) => p.to === "layout");
    expect(src?.from).toBe("src");
  });
});
