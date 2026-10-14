import { describe, expect, test } from "bun:test";
import {
  PREVIEW_CANVAS,
  PREVIEW_FILE,
  PREVIEW_FOLDER,
  PREVIEW_NODES,
  graphToTextLines,
  nodeBox,
  nodeFileName,
  previewChildren,
  previewEdgePaths,
  previewPaths,
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

  test("card dimensions are the product's, not a stylised miniature", () => {
    // DEFAULT_FOLDER_* / DEFAULT_FILE_* in src/lib/fewer/layout.ts.
    expect(PREVIEW_FOLDER).toEqual({ w: 240, h: 200 });
    expect(PREVIEW_FILE).toEqual({ w: 220, h: 58 });
  });

  test("each folder is vertically centred on its children", () => {
    for (const folder of PREVIEW_NODES.filter((n) => n.kind === "folder")) {
      const kids = previewChildren(folder.id);
      if (kids.length === 0) continue;
      const top = Math.min(...kids.map((k) => nodeBox(k).y));
      const bottom = Math.max(...kids.map((k) => nodeBox(k).y + nodeBox(k).h));
      const folderBox = nodeBox(folder);
      const folderMid = folderBox.y + folderBox.h / 2;
      expect(Math.abs(folderMid - (top + bottom) / 2)).toBeLessThanOrEqual(1);
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

  test("file nodes carry an extension and a category for their icon", () => {
    for (const node of PREVIEW_NODES.filter((n) => n.kind === "file")) {
      expect(node.extension).toBeTruthy();
      expect(node.category).toBeTruthy();
      expect(nodeFileName(node)).toBe(`${node.label}.${node.extension}`);
    }
    expect(nodeFileName(PREVIEW_NODES.find((n) => n.id === "pkg")!)).toBe("package.json");
  });

  test("previewPaths stacks labels the way the app prints data.path", () => {
    const paths = previewPaths();
    expect(paths.root).toBe("~/fewer");
    expect(paths.src).toBe("~/fewer/src");
    expect(paths.layout).toBe("~/fewer/src/layout.ts");
    expect(paths.pkg).toBe("~/fewer/package.json");
  });

  test("graphToTextLines renders the tree shape of the same data", () => {
    const lines = graphToTextLines();
    expect(lines).toEqual([
      "./fewer",
      "├── src/",
      "│   ├── layout.ts",
      "│   └── types.ts",
      "├── docs/",
      "│   ├── editing.md",
      "│   ├── watch.md",
      "│   └── import-export.md",
      "├── README.md",
      "└── package.json",
    ]);
  });

  test("previewEdgePaths connects every non-root exactly once", () => {
    const paths = previewEdgePaths();
    expect(paths).toHaveLength(PREVIEW_NODES.length - 1);
    for (const p of paths) expect(p.d.startsWith("M ")).toBe(true);
    const src = paths.find((p) => p.to === "layout");
    expect(src?.from).toBe("src");
  });
});
