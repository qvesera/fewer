import { test, expect } from "bun:test";
import { buildGraphSVG, truncateToWidth, estimateTextWidth } from "./graphRenderer";
import type { FewerNode, FewerEdge } from "./types";
import type { RenderPalette, GraphRenderOptions } from "./graphRenderer";

const palette: RenderPalette = {
  background: "#0b0b13",
  text: "#f8f9fa",
  subtle: "#adb5bd",
  edge: "rgba(173, 181, 189, 0.5)",
  selectRing: "#22d3ee",
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

test("selection is not drawn in exports — selected card keeps its normal border", () => {
  const nodes = [makeNode("r", "root"), makeNode("c", "child", { type: "file", x: 300, w: 220 })];
  const edges = [makeEdge("e0", "r", "c")];
  const scene = buildGraphSVG(nodes, edges, opts({ selectedIds: new Set(["c"]) }));
  // The selection ring is a canvas-only affordance and must not bake into the image.
  expect(scene.svg).not.toContain("#22d3ee");
  // The selected node renders with its normal file border + 1px stroke.
  expect(scene.svg).toContain('stroke="rgba(190, 75, 219, 0.45)"');
  expect(scene.svg).toContain('stroke-width="1"');
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

test("file card text is aligned to the icon box and vertically centered", () => {
  const file = makeNode("f", "index.ts", { type: "file", category: "code" });
  file.measured = { width: 240, height: 36 };
  const scene = buildGraphSVG([file], [], opts());
  // Icon sits flush (centered in 36px box) at x=9; text column starts after gap.
  expect(scene.svg).toContain('<g transform="translate(9, 8)">');
  const labelY = scene.svg.match(/<text x="49" y="(\d+)"/)?.[1];
  const metaY = scene.svg.match(/<text x="49" y="(\d+)"[^>]*style="text-transform:uppercase/)?.[1];
  const lY = Number(labelY);
  const mY = Number(metaY);
  expect(Number.isInteger(lY) && Number.isInteger(mY)).toBe(true);
  expect(lY).toBeLessThan(mY);
  // Both lines sit inside a 36px card.
  expect(lY).toBeGreaterThan(0);
  expect(mY).toBeLessThan(36);
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

test("label truncation is width-aware so long names never spill past the card", () => {
  // Short runs are returned untouched.
  expect(truncateToWidth("index.ts", 181, 14, 600)).toBe("index.ts");
  // A long uppercase run (14px semibold) truncates to a width that fits the
  // card's 181px text budget (240px card minus icon column + padding).
  const long = "AGILEXEL PRIVATE LIMITED DIRECTORY";
  const cut = truncateToWidth(long, 181, 14, 600);
  expect(cut).toMatch(/…$/);
  expect(estimateTextWidth(cut, 14, 600)).toBeLessThanOrEqual(181);
  // The old fixed-pixel assumption would keep far too many chars.
  expect(cut.length).toBeLessThan(23);

  // End-to-end: a drawn file card must render a label whose estimated width
  // stays within its text column (text x=49, right padding ~10 for w=240).
  const file = makeNode("f", "AGILEXEL PRIVATE LIMITED DIRECTORY.ts", {
    type: "file",
    category: "document",
  });
  file.measured = { width: 240, height: 36 };
  const scene = buildGraphSVG([file], [], opts());
  const label = (scene.svg.match(/<text x="49" y="\d+"[^>]*>(.*?)<\/text>/) ?? ["", ""])[1];
  const clean = label.replace(/&#x26;|&amp;|&lt;|&gt;|&quot;/g, (m) =>
    m === "&amp;" ? "&" : m === "&lt;" ? "<" : m === "&gt;" ? ">" : m === "&quot;" ? '"' : "&",
  );
  if (clean.includes("…")) {
    expect(estimateTextWidth(clean, 14, 600)).toBeLessThanOrEqual(240 - 59);
  }
  // And the folder header label (w - 48 budget) also stays inside bounds.
  const froot = makeNode("r", "SOME REALLY LONG UPPERCASE FOLDER HEADER TITLE");
  const fscene = buildGraphSVG([froot], [], opts());
  const header = (fscene.svg.match(/<text x="36" y="20"[^>]*>(.*?)<\/text>/) ?? ["", ""])[1];
  const fclean = header.replace(/&amp;|&lt;|&gt;|&quot;/g, (m) =>
    m === "&amp;" ? "&" : m === "&lt;" ? "<" : m === "&gt;" ? ">" : '"',
  );
  if (fclean.includes("…")) {
    expect(estimateTextWidth(fclean, 14, 600)).toBeLessThanOrEqual(240 - 48);
  }
});