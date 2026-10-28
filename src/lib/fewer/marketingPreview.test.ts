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
  previewPathIds,
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

  test("card dimensions: folders are the product's, files are single-line", () => {
    // Folder cards: DEFAULT_FOLDER_* in src/lib/fewer/layout.ts. File cards
    // keep the product's width but drop to one line (T-154) - the demo card
    // carries its name and no metadata sub-line, so the second row would be
    // padding around a single line of text.
    expect(PREVIEW_FOLDER).toEqual({ w: 240, h: 200 });
    expect(PREVIEW_FILE).toEqual({ w: 220, h: 44 });
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
    expect(paths.see).toBe("~/fewer/See your files");
    expect(paths.plan).toBe("~/fewer/Shape it/Plan ahead");
    expect(paths.themes).toBe("~/fewer/Keep & share/Themes");
  });

  test("graphToTextLines renders the catalogue as the same tree", () => {
    const lines = graphToTextLines();
    expect(lines).toEqual([
      "./fewer",
      "├── See your files/",
      "│   ├── Open anything",
      "│   ├── Search everything",
      "│   └── Keyboard-first",
      "├── Shape it/",
      "│   ├── Plan ahead",
      "│   ├── Groups & notes",
      "│   ├── Batch edit",
      "│   └── Organize",
      "└── Keep & share/",
      "    ├── Save & share",
      "    ├── Watch for changes",
      "    └── Themes",
    ]);
  });

  test("previewEdgePaths connects every non-root exactly once", () => {
    const paths = previewEdgePaths();
    expect(paths).toHaveLength(PREVIEW_NODES.length - 1);
    for (const p of paths) expect(p.d.startsWith("M ")).toBe(true);
    const plan = paths.find((p) => p.to === "plan");
    expect(plan?.from).toBe("shape");
  });

  test("previewPathIds is exactly the chain whose edges stay lit (T-160)", () => {
    // One chain per active card: itself, then every ancestor to the root -
    // never the siblings, which is what let a kept folder keep all of its own
    // connections bright before.
    expect([...previewPathIds("organize")]).toEqual(["organize", "shape", "root"]);
    expect([...previewPathIds("see")]).toEqual(["see", "root"]);
    expect([...previewPathIds("root")]).toEqual(["root"]);
    expect(previewPathIds("nope").size).toBe(0);
    expect(previewPathIds(null).size).toBe(0);
    expect(previewPathIds(undefined).size).toBe(0);

    // Against the real edges: two of the thirteen stay lit for a feature card,
    // and the four-wide fan-out beside the chain is not among them.
    const lit = previewPathIds("organize");
    const litEdges = previewEdgePaths().filter((e) => lit.has(e.from) && lit.has(e.to));
    expect(litEdges.map((e) => `${e.from}->${e.to}`)).toEqual(["root->shape", "shape->organize"]);
  });
});
