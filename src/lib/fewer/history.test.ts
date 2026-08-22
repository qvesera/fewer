import { test, expect } from "bun:test";
import { applyOps, undoOps } from "./history";
import type { FewerNode, FewerEdge, ViewState } from "./types";

function makeNode(id: string, label: string, opts: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path: `/${label}`, type: "folder", ...opts },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(id: string, source: string, target: string, type: "smoothstep" | "default" | "straight" = "smoothstep"): FewerEdge {
  return { id, source, target, type } as FewerEdge;
}

const baseView: ViewState = {
  hiddenIds: [],
  showFiles: true,
  maxDisplayDepth: 6,
  autoHideThreshold: 10,
  autoHiddenIds: [],
  categoryFilter: null,
  categoryHiddenIds: [],
  independentlyHiddenIds: [],
};

function expectRoundTrip(nodes: FewerNode[], edges: FewerEdge[], op: Parameters<typeof applyOps>[2][number]) {
  const applied = applyOps(nodes, edges, [op]);
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.nodes.map((n) => n.id).sort()).toEqual(nodes.map((n) => n.id).sort());
  expect(undone.edges.map((e) => e.id).sort()).toEqual(edges.map((e) => e.id).sort());
  return applied;
}

test("add-node round-trips", () => {
  const nodes = [makeNode("a", "A")];
  const edges = [] as FewerEdge[];
  const applied = expectRoundTrip(nodes, edges, {
    type: "add-node",
    node: makeNode("b", "B"),
    edge: null,
  });
  expect(applied.nodes).toHaveLength(2);
});

test("remove-subtree round-trips a folder with children", () => {
  const child = makeNode("c", "C", { depth: 1 });
  const grandchild = makeNode("g", "G", { depth: 2 });
  const nodes = [makeNode("a", "A"), child, grandchild];
  const edges = [makeEdge("e1", "a", "c"), makeEdge("e2", "c", "g")];
  const op = {
    type: "remove-subtree" as const,
    node: child,
    edge: makeEdge("e1", "a", "c"),
    children: [grandchild],
    childEdges: [makeEdge("e2", "c", "g")],
    before: baseView,
    after: { ...baseView, hiddenIds: [] },
  };
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.nodes.map((n) => n.id)).toEqual(["a"]);
  expect(applied.edges).toHaveLength(0);
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.nodes).toHaveLength(3);
  expect(undone.edges).toHaveLength(2);
});

test("connect round-trips (adds edge, restores path on undo without deleting node)", () => {
  const parent = makeNode("a", "A");
  const child = makeNode("c", "C", { path: "/C", isRoot: true });
  const nodes = [parent, child];
  const edges = [] as FewerEdge[];
  const op = {
    type: "connect" as const,
    edge: makeEdge("e1", "a", "c"),
    prevPaths: [{ nodeId: "c", path: "/C" }],
    nextPaths: [{ nodeId: "c", path: "/A/C" }],
  };
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.edges).toHaveLength(1);
  expect(applied.nodes.find((n) => n.id === "c")?.data.path).toBe("/A/C");
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  // Child node must still exist after undo (critical fix).
  expect(undone.nodes.map((n) => n.id)).toContain("c");
  expect(undone.edges).toHaveLength(0);
  expect(undone.nodes.find((n) => n.id === "c")?.data.path).toBe("/C");
});

test("remove-edges round-trips (restores edges on undo)", () => {
  const nodes = [makeNode("a", "A"), makeNode("b", "B")];
  const edges = [makeEdge("e1", "a", "b")];
  const op = { type: "remove-edges" as const, edges };
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.edges).toHaveLength(0);
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.edges).toHaveLength(1);
});

test("move-positions round-trips a drag", () => {
  const nodes = [makeNode("a", "A")];
  nodes[0] = { ...nodes[0], position: { x: 10, y: 10 } };
  const edges = [] as FewerEdge[];
  const op = {
    type: "move-positions" as const,
    moves: [{ nodeId: "a", from: { x: 10, y: 10 }, to: { x: 100, y: 200 } }],
  };
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.nodes[0].position).toEqual({ x: 100, y: 200 });
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.nodes[0].position).toEqual({ x: 10, y: 10 });
});

test("resize round-trips dimensions", () => {
  const nodes = [makeNode("a", "A")];
  const edges = [] as FewerEdge[];
  const op = {
    type: "resize" as const,
    changes: [{ nodeId: "a", from: { w: 200, h: 120 }, to: { w: 400, h: 300 } }],
  };
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.nodes[0].style?.width).toBe(400);
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.nodes[0].style?.width).toBe(200);
  expect(undone.nodes[0].style?.height).toBe(120);
});

test("collapse-batch round-trips collapse/expand all", () => {
  const nodes = [makeNode("a", "A", { collapsed: false }), makeNode("b", "B", { collapsed: true })];
  const edges = [] as FewerEdge[];
  const op = {
    type: "collapse-batch" as const,
    changes: [
      { nodeId: "a", wasCollapsed: false, willCollapse: true },
      { nodeId: "b", wasCollapsed: true, willCollapse: false },
    ],
  };
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.nodes.find((n) => n.id === "a")?.data.collapsed).toBe(true);
  expect(applied.nodes.find((n) => n.id === "b")?.data.collapsed).toBe(false);
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  expect(undone.nodes.find((n) => n.id === "a")?.data.collapsed).toBe(false);
  expect(undone.nodes.find((n) => n.id === "b")?.data.collapsed).toBe(true);
});

test("view-state op exposes before/after for undo/redo", () => {
  const before: ViewState = { ...baseView, hiddenIds: ["a"] };
  const after: ViewState = { ...baseView, hiddenIds: [] };
  const op = { type: "view-state" as const, before, after };
  // applyOps/undoOps don't touch view state (it lives in the store), but the
  // sidecar must be readable by the history slice.
  expect(op.before.hiddenIds).toEqual(["a"]);
  expect(op.after.hiddenIds).toEqual([]);
});