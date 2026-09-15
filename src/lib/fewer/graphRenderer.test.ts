import { test, expect } from "bun:test";
import { buildGraphSVG, truncateToWidth, estimateTextWidth } from "./graphRenderer";
import type { FewerNode, FewerEdge } from "./types";
import type { RenderPalette, GraphRenderOptions } from "./graphRenderer";
import type { Tag } from "./tags";

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

test("edge anchors follow the view direction, not a card's stale layout stamp", () => {
  // Cards were laid out TB (their stamps still say so) but the exported view
  // overrides the direction to LR — the canvas puts handles on the view's sides,
  // so the source must anchor on its right edge, not its bottom.
  const nodes = [
    makeNode("r", "root", { dir: "TB" }),
    makeNode("c", "child", { dir: "TB", x: 300 }),
  ];
  const edges = [makeEdge("e0", "r", "c", "straight")];
  const path = (svg: string) => (svg.match(/<path d="([^"]+)"/) ?? ["", ""])[1];

  // Fallback (no view direction given): the stamp wins, as before.
  expect(path(buildGraphSVG(nodes, edges, opts()).svg)).toContain("M 120,200");
  // View direction wins over the stamp.
  expect(path(buildGraphSVG(nodes, edges, opts({ direction: "LR" })).svg)).toContain("M 240,100");
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
  // ...and that row is faded, exactly like CustomNode desaturates hidden entries.
  expect(scene.svg).toContain('opacity="0.4"');
});

test("collapsed folder renders the one-line pill, not a card", () => {
  const nodes = [makeNode("r", "root"), makeNode("c", "kid", { type: "file", x: 300, w: 220 })];
  const edges = [makeEdge("e0", "r", "c")];

  const expanded = buildGraphSVG(nodes, edges, opts());
  expect(expanded.svg).toContain('y="76"'); // first child-list row (HEADER 52 + 6 + 18)
  expect(expanded.svg).toContain('rx="16"'); // full folder card radius
  expect(expanded.height).toBe(200 + 80); // folder height + scene padding

  const collapsed = buildGraphSVG(nodes, edges, opts({ collapsedIds: new Set(["r"]) }));
  // Pill: label + item count remain, the child list (and its rows) is gone.
  expect(collapsed.svg).toContain(">root<");
  expect(collapsed.svg).toContain(">1 item<");
  expect(collapsed.svg).not.toContain('y="76"');
  expect(collapsed.svg).toContain('rx="12"'); // pill corner radius, not the card's
  // The pill's own height drives the scene box, so it shrinks: the 58px file card
  // now sets the bottom edge instead of the folder's 200px card.
  expect(collapsed.height).toBe(58 + 80);
  expect(collapsed.height).toBeLessThan(expanded.height);
});

test("tag ring and dots use the registry colors; selection hides the ring", () => {
  const tags: Tag[] = [
    { id: "t1", label: "One", color: "#f87171" },
    { id: "t2", label: "Two", color: "#38bdf8" },
  ];
  const file = makeNode("f", "index.ts", { type: "file", category: "code" });
  file.measured = { width: 240, height: 36 };
  file.data.tagIds = ["t1", "t2"];

  const scene = buildGraphSVG([file], [], opts({ tags }));
  // Two ring bands (dashed strokes) …
  expect(scene.svg.match(/stroke-dasharray/g)?.length).toBe(2);
  expect(scene.svg).toContain('stroke="#f87171"');
  expect(scene.svg).toContain('stroke="#38bdf8"');
  // … plus one dot per tag (ring stroke + dot fill each carry the color).
  expect(scene.svg.match(/#f87171/g)?.length).toBe(2);

  // No registry → no ring and no dots (nothing to resolve colors from).
  expect(buildGraphSVG([file], [], opts()).svg).not.toContain("#f87171");

  // Selected cards hide the ring on the canvas (the selection ring wins), so the
  // export must not paint one either.
  const selected = buildGraphSVG([file], [], opts({ tags, selectedIds: new Set(["f"]) }));
  expect(selected.svg).not.toContain("stroke-dasharray");
  expect(selected.svg).toContain('fill="#f87171"'); // the dot remains

  // A single tag is a solid band, not a split one.
  file.data.tagIds = ["t1"];
  const single = buildGraphSVG([file], [], opts({ tags }));
  expect(single.svg).not.toContain("stroke-dasharray");
  expect(single.svg.match(/#f87171/g)?.length).toBe(2); // ring + dot
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