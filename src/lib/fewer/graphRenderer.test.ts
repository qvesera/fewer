import { test, expect } from "bun:test";
import { buildGraphSVG } from "./graphRenderer";
import type { FewerNode, FewerEdge } from "./types";
import type { RenderPalette, GraphRenderOptions } from "./graphRenderer";

const palette: RenderPalette = {
  background: "#0b0b13",
  text: "#f8f9fa",
  subtle: "#adb5bd",
  edge: "rgba(173, 181, 189, 0.5)",
  folderBg: "rgba(253, 126, 20, 0.12)",
  folderBorder: "rgba(253, 126, 20, 0.45)",
  folderText: "#ffd8a8",
  folderSubtle: "#adb5bd",
  folderIcon: "#ffa94d",
  fileBg: "rgba(190, 75, 219, 0.18)",
  fileBorder: "rgba(190, 75, 219, 0.45)",
  fileText: "#f8f9fa",
  fileSubtle: "#adb5bd",
  fileIcon: "#e599f7",
};

function makeNode(
  id: string,
  label: string,
  opts: { type?: "folder" | "file"; x?: number; y?: number; w?: number; h?: number; dir?: "TB" | "LR" | "BT" | "RL"; category?: string } = {},
): FewerNode {
  const type = opts.type ?? "folder";
  return {
    id,
    type,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    data: {
      label,
      path: `/${label}`,
      type,
      category: (opts.category as never) ?? "text",
      layoutDirection: opts.dir ?? "TB",
      isHorizontal: opts.dir === "LR" || opts.dir === "RL",
    },
    style: { width: opts.w ?? 240, height: opts.h ?? 200 },
  } as unknown as FewerNode;
}

function makeEdge(id: string, source: string, target: string, type: "smoothstep" | "default" | "straight" = "smoothstep"): FewerEdge {
  return { id, source, target, type } as FewerEdge;
}

function opts(extra: Partial<GraphRenderOptions> = {}): GraphRenderOptions {
  return { palette, fontFamily: "sans-serif", ...extra };
}

test("renders theme colors + background rect", () => {
  const nodes = [
    makeNode("r", "root"),
    makeNode("c", "child", { type: "file", x: 300, w: 220 }),
    makeNode("e", "empty", { x: 300, y: 300 }),
  ];
  const edges = [makeEdge("e0", "r", "c")];
  const scene = buildGraphSVG(nodes, edges, opts());
  expect(scene.svg).toContain("#ffa94d"); // folderIcon in header
  expect(scene.svg).toContain("rgba(173, 181, 189, 0.5)"); // edge stroke fallback
  expect(scene.svg).toContain(`fill="${palette.background}"`);
  expect(scene.svg).toContain("Empty folder");
});

test("selection adds the glow filter to the selected node only", () => {
  const nodes = [makeNode("r", "root"), makeNode("c", "child", { x: 300 })];
  const edges = [makeEdge("e0", "r", "c")];
  const scene = buildGraphSVG(nodes, edges, opts({ selectedIds: new Set(["c"]) }));
  // defs contains the glow filter...
  expect(scene.svg).toContain('<filter id="filter-glow"');
  // and only node c references it.
  const used = (scene.svg.match(/filter="url\(#filter-glow\)"/g) ?? []).length;
  expect(used).toBe(1);
});

test("edge path geometry differs per edge style", () => {
  const nodes = [makeNode("r", "root"), makeNode("c", "child", { x: 300 })];
  const straight = buildGraphSVG(nodes, [makeEdge("e0", "r", "c", "straight")], opts());
  const smooth = buildGraphSVG(nodes, [makeEdge("e1", "r", "c", "smoothstep")], opts());
  expect(straight.svg).toContain('stroke="rgba(173, 181, 189, 0.5)"');
  const extract = (s: string) => (s.match(/<path d="([^"]+)"/) ?? ["", ""])[1];
  expect(extract(straight.svg)).not.toBe(extract(smooth.svg));
  // Straight path has no curve or rounded-corner segments.
  expect(extract(straight.svg)).toMatch(/^M /);
  expect(extract(straight.svg)).not.toContain("Q");
  expect(extract(smooth.svg)).toContain("Q"); // smoothstep rounds corners when cornerRadius set
});

test("LR layout places source anchor on the right edge", () => {
  const nodes = [
    makeNode("r", "root", { dir: "LR" }),
    makeNode("c", "child", { dir: "LR", x: 300 }),
  ];
  const scene = buildGraphSVG(nodes, [makeEdge("e0", "r", "c", "straight")], opts());
  // source anchor on the right edge of root at y-centre => M 240,100
  expect(scene.svg).toContain('d="M 240,100');
});

test("hidden nodes are excluded from the scene, kept as folder rows", () => {
  const nodes = [
    makeNode("r", "root"),
    makeNode("a", "ama", { x: 300 }),
    makeNode("b", "bbb", { x: 300, y: 300 }),
  ];
  const edges = [makeEdge("e0", "r", "a"), makeEdge("e1", "a", "b")];
  const scene = buildGraphSVG(nodes, edges, opts({ hiddenIds: new Set(["b"]) }));
  // b is hidden: not drawn as its own card (path text absent), only as a child
  // row inside folder "a" (mirroring how the canvas shows hidden children).
  expect(scene.svg).not.toContain(">/bbb<");
  expect(scene.svg).toContain(">ama<");
});