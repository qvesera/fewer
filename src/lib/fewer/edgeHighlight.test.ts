import { describe, expect, test } from "bun:test";
import type { FewerEdge, FewerNode } from "./types";
import { buildSelectedEdgeHighlight } from "./edgeHighlight";

function makeNode(id: string, type: "folder" | "file" = "folder"): FewerNode {
  return { id, type, position: { x: 0, y: 0 }, data: { label: id, path: `/${id}`, type } };
}

function makeEdge(id: string, source: string, target: string): FewerEdge {
  return { id, source, target, type: "default" };
}

const THEME = { edge: "#888888", folderIcon: "#ff9900", fileIcon: "#cc00ff" };

interface BaseOpts {
  animated?: boolean;
  selectedOnly?: boolean;
  animatedStrokeStyle?: "dashed" | "dotted" | "solid";
  baseStrokeStyle?: "dashed" | "dotted" | "solid";
}

function baseOpts(overrides: BaseOpts = {}) {
  return {
    animated: overrides.animated ?? false,
    selectedOnly: overrides.selectedOnly ?? false,
    animatedStrokeStyle: overrides.animatedStrokeStyle ?? "dashed",
    baseStrokeStyle: overrides.baseStrokeStyle ?? "solid",
  };
}

// Chain root(r) → a → b → c(file); detached off-tree edge x → y.
const nodes = [
  makeNode("r", "folder"),
  makeNode("a", "folder"),
  makeNode("b", "folder"),
  makeNode("c", "file"),
  makeNode("x", "folder"),
  makeNode("y", "file"),
];
const edges = [
  makeEdge("e-ra", "r", "a"),
  makeEdge("e-ab", "a", "b"),
  makeEdge("e-bc", "b", "c"),
  makeEdge("e-xy", "x", "y"),
];

const byId = (result: FewerEdge[]) => new Map(result.map((e) => [e.id, e]));

describe("buildSelectedEdgeHighlight", () => {
  test("empty selection resets every edge to the default stroke with animation off", () => {
    const result = byId(buildSelectedEdgeHighlight([], [], edges, nodes, THEME, 2, baseOpts()));
    for (const e of edges) {
      expect(result.get(e.id)?.style?.stroke).toBe(THEME.edge);
      expect(result.get(e.id)?.animated).toBe(false);
      expect(result.get(e.id)?.zIndex).toBeUndefined();
    }
  });

  test("selecting a leaf highlights exactly its ancestor path (child edges excluded)", () => {
    const result = byId(buildSelectedEdgeHighlight(["c"], [], edges, nodes, THEME, 2, baseOpts()));
    // e-bc, e-ab, e-ra sit on c's path → highlighted at zIndex 1.
    expect(result.get("e-bc")?.zIndex).toBe(1);
    expect(result.get("e-ab")?.zIndex).toBe(1);
    expect(result.get("e-ra")?.zIndex).toBe(1);
    // Stroke of e-bc follows the file target c; e-ab/e-ra follow folder targets.
    expect(result.get("e-bc")?.style?.stroke).toBe(THEME.fileIcon);
    expect(result.get("e-ab")?.style?.stroke).toBe(THEME.folderIcon);
    expect(result.get("e-ra")?.style?.stroke).toBe(THEME.folderIcon);
    // Detached edge stays untouched.
    expect(result.get("e-xy")?.zIndex).toBeUndefined();
    expect(result.get("e-xy")?.style?.stroke).toBe(THEME.edge);
  });

  test("selecting a parent does not highlight its child edges", () => {
    const result = byId(buildSelectedEdgeHighlight(["a"], [], edges, nodes, THEME, 2, baseOpts()));
    expect(result.get("e-ra")?.zIndex).toBe(1); // a's own path to root
    expect(result.get("e-ab")?.zIndex).toBeUndefined(); // a → b is a child edge
    expect(result.get("e-bc")?.zIndex).toBeUndefined();
  });

  test("multi-selection highlights the union of ancestor paths", () => {
    const result = byId(buildSelectedEdgeHighlight(["c", "y"], [], edges, nodes, THEME, 2, baseOpts()));
    expect(result.get("e-ra")?.zIndex).toBe(1);
    expect(result.get("e-ab")?.zIndex).toBe(1);
    expect(result.get("e-bc")?.zIndex).toBe(1);
    expect(result.get("e-xy")?.zIndex).toBe(1);
  });

  test("hover stroke wins over selection on shared edges", () => {
    const result = byId(buildSelectedEdgeHighlight(["c"], ["b"], edges, nodes, THEME, 2, baseOpts()));
    // e-ab and e-ra sit on both c's and b's paths → amber (hover) wins.
    expect(result.get("e-ab")?.style?.stroke).toBe("#fbbf24");
    expect(result.get("e-ra")?.style?.stroke).toBe("#fbbf24");
    // e-bc is only on c's path → keeps the selection stroke.
    expect(result.get("e-bc")?.style?.stroke).toBe(THEME.fileIcon);
    expect(result.get("e-xy")?.style?.stroke).toBe(THEME.edge);
  });

  test("animated on animates every edge", () => {
    const result = byId(buildSelectedEdgeHighlight(["c"], [], edges, nodes, THEME, 2, baseOpts({ animated: true })));
    for (const e of edges) expect(result.get(e.id)?.animated).toBe(true);
  });

  test("selectedOnly animates the path edges but not the rest", () => {
    const result = byId(buildSelectedEdgeHighlight(["c"], [], edges, nodes, THEME, 2, baseOpts({ selectedOnly: true })));
    expect(result.get("e-bc")?.animated).toBe(true);
    expect(result.get("e-ab")?.animated).toBe(true);
    expect(result.get("e-ra")?.animated).toBe(true);
    expect(result.get("e-xy")?.animated).toBe(false);
  });

  test("path-edge width floors at 3 and honours larger custom widths", () => {
    const narrow = byId(buildSelectedEdgeHighlight(["c"], [], edges, nodes, THEME, 1, baseOpts()));
    expect(narrow.get("e-bc")?.style?.strokeWidth).toBe(3);
    const wide = byId(buildSelectedEdgeHighlight(["c"], [], edges, nodes, THEME, 5, baseOpts()));
    expect(wide.get("e-bc")?.style?.strokeWidth).toBe(5);
  });

  test("a cyclic edge set does not hang the ancestor walk", () => {
    const cycleNodes = [makeNode("p"), makeNode("q", "file")];
    const cycleEdges = [makeEdge("e-pq", "q", "p"), makeEdge("e-qp", "p", "q")];
    const result = buildSelectedEdgeHighlight(["p"], [], cycleEdges, cycleNodes, THEME, 2, baseOpts());
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.zIndex === 1)).toBe(true);
  });

  test("dashed base stroke style is preserved on path and non-path edges", () => {
    const result = byId(buildSelectedEdgeHighlight(["c"], [], edges, nodes, THEME, 2, baseOpts({ baseStrokeStyle: "dashed" })));
    expect(result.get("e-ab")?.style?.strokeDasharray).toBe("8 4");
    expect(result.get("e-xy")?.style?.strokeDasharray).toBe("8 4");
  });
});