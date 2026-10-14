import { describe, expect, test } from "bun:test";
import {
  PREVIEW_CANVAS,
  PREVIEW_FILE,
  PREVIEW_FOLDER,
  PREVIEW_NODES,
  SIBLING_GAP,
  graphToTextLines,
  nodeBox,
  previewChildren,
  previewEdgePaths,
  previewLayout,
  previewPaths,
} from "./marketingPreview";
import { MARKETING_CATEGORIES, MARKETING_FEATURES } from "./marketingFeatures";

// The layouts the Crown Shyness proof can drive: 1 is the default, 3 the top
// of the dial (the same range layout.ts's shynessScale takes).
const SHYNESS_STOPS = [1, 2, 3];

describe("marketingPreview", () => {
  test("every node sits inside the canvas box, with room for its outline", () => {
    // The box is a scroll container (overflow-x-auto computes overflow-y to
    // auto as well), so a card flush with an edge loses its 2px outline and its
    // shadow there. CANVAS_PAD is what keeps the active ring whole.
    const pad = 8;
    for (const node of PREVIEW_NODES) {
      const box = nodeBox(node);
      expect(box.x).toBeGreaterThanOrEqual(pad);
      expect(box.y).toBeGreaterThanOrEqual(pad);
      expect(box.x + box.w).toBeLessThanOrEqual(PREVIEW_CANVAS.w - pad);
      expect(box.y + box.h).toBeLessThanOrEqual(PREVIEW_CANVAS.h - pad);
    }
  });

  test("no two cards ever touch, at any dial setting", () => {
    // What the hand-placed coords got wrong: the three docs children were
    // stacked at zero gap while src's had 20px. One rule now, asserted at
    // every stop of the slider.
    for (const shyness of SHYNESS_STOPS) {
      const { nodes } = previewLayout(shyness);
      for (const parent of nodes) {
        const kids = previewChildren(parent.id, nodes);
        for (let i = 1; i < kids.length; i += 1) {
          const prev = nodeBox(kids[i - 1]);
          const next = nodeBox(kids[i]);
          expect(next.y - (prev.y + prev.h)).toBeGreaterThanOrEqual(SIBLING_GAP - 1);
        }
      }
    }
  });

  test("crown shyness opens the sibling axis, and only that axis", () => {
    const layouts = SHYNESS_STOPS.map((shyness) => previewLayout(shyness));
    const base = layouts[0];

    // Columns never move: the fit zoom is by width, so a horizontal spread
    // would be cancelled out by zoom and show nothing.
    for (const layout of layouts) {
      expect(layout.canvas.w).toBe(base.canvas.w);
      for (let i = 0; i < layout.nodes.length; i += 1) {
        expect(layout.nodes[i].id).toBe(base.nodes[i].id);
        expect(layout.nodes[i].x).toBe(base.nodes[i].x);
      }
    }

    // The gap between the root's first two children (the first two group
    // folders) is the dial's own readout: 20px at the default, wider every
    // stop after it, and the box grows with it.
    const gapOf = (layout: ReturnType<typeof previewLayout>) => {
      const [first, second] = previewChildren("root", layout.nodes);
      return nodeBox(second).y - (nodeBox(first).y + nodeBox(first).h);
    };
    const gaps = layouts.map(gapOf);
    expect(gaps[0]).toBeGreaterThanOrEqual(SIBLING_GAP - 1);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
    expect(layouts[2].canvas.h).toBeGreaterThan(layouts[0].canvas.h);

    // Every stop still fits its own box (the guard above, re-checked).
    for (const layout of layouts) {
      for (const node of layout.nodes) {
        const box = nodeBox(node);
        expect(box.y + box.h).toBeLessThanOrEqual(layout.canvas.h - 8);
      }
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

  test("feature cards carry only what the type allows - no invented file metadata", () => {
    // PreviewNode has no extension/size/category at all (TS enforces that);
    // this pins the runtime shape too, and the labels: every file card is a
    // chip, not a filename.
    const chips = new Set(MARKETING_FEATURES.map((f) => f.chip));
    for (const node of PREVIEW_NODES.filter((n) => n.kind === "file")) {
      expect(Object.keys(node).sort()).toEqual(["id", "kind", "label", "parent", "x", "y"]);
      expect(chips.has(node.label)).toBe(true);
    }
  });

  test("previewPaths stacks labels the way the app prints data.path", () => {
    const paths = previewPaths();
    expect(paths.root).toBe("~/fewer");
    expect(paths.arrange).toBe("~/fewer/Arrange & edit");
    expect(paths.plan).toBe("~/fewer/Arrange & edit/Plan first");
    expect(paths.tags).toBe("~/fewer/Look & share/Tags");
  });

  test("graphToTextLines renders the catalogue as the same tree", () => {
    const lines = graphToTextLines();
    expect(lines).toEqual([
      "./fewer",
      "├── Arrange & edit/",
      "│   ├── Plan first",
      "│   ├── Canvas groups",
      "│   ├── Batch actions",
      "│   ├── Wildcard rename",
      "│   ├── Organize",
      "│   └── Keyboard-first",
      "├── Watch & connect/",
      "│   ├── Import anything",
      "│   ├── Watch a URL",
      "│   └── Export in 8 formats",
      "└── Look & share/",
      "    ├── Themes",
      "    ├── Share and save",
      "    └── Tags",
    ]);
  });

  test("previewEdgePaths connects every non-root exactly once", () => {
    const paths = previewEdgePaths();
    expect(paths).toHaveLength(PREVIEW_NODES.length - 1);
    for (const p of paths) expect(p.d.startsWith("M ")).toBe(true);
    const plan = paths.find((p) => p.to === "plan");
    expect(plan?.from).toBe("arrange");
  });
});
