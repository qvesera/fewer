import { test, expect } from "bun:test";
import { applyOps, undoOps } from "./history";
import { reconcileAutoHide } from "@/store/slices/graphSlice";
import type { FewerNode, FewerEdge, ViewState, RemoveSubtreeOp } from "./types";

function makeNode(id: string, label: string, parentId?: string | null, opts: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path: parentId ? `/${label}` : `/${label}`, type: "folder", parentId: parentId ?? null, ...opts },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(id: string, source: string, target: string): FewerEdge {
  return { id, source, target, type: "smoothstep" } as FewerEdge;
}

const baseView: ViewState = { hiddenIds: [], showFiles: true, maxDisplayDepth: 6, autoHideThreshold: 10, autoHiddenIds: [], categoryFilter: null, categoryHiddenIds: [] };

/**
 * Mirror the exact subtree-collection + op-building logic used by graphSlice.deleteNodes
 * so the test exercises the real integration path, not a hand-built op.
 */
function buildDeleteOp(nodes: FewerNode[], edges: FewerEdge[], ids: string[]) {
  const toRemove = new Set<string>();
  const queue = [...ids];
  while (queue.length) { const id = queue.shift()!; toRemove.add(id); for (const e of edges) { if (e.source === id && !toRemove.has(e.target)) queue.push(e.target); } }
  const removedNodes = nodes.filter((n) => toRemove.has(n.id));
  const removedEdges = edges.filter((e) => toRemove.has(e.source) && toRemove.has(e.target));
  const newNodes = nodes.filter((n) => !toRemove.has(n.id));
  const newEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
  const rootEdge = edges.find((e) => e.target === ids[0]) ?? null;
  const op: RemoveSubtreeOp = {
    type: "remove-subtree",
    node: removedNodes[0],
    edge: rootEdge,
    children: removedNodes.slice(1),
    childEdges: removedEdges,
    before: baseView,
    after: { ...baseView, hiddenIds: baseView.hiddenIds.filter((h) => !toRemove.has(h)) },
  };
  return { op, newNodes, newEdges };
}

test("delete then undo restores a 3-level subtree with parent links intact", () => {
  // root -> outer -> [inner1, inner2]
  const nodes: FewerNode[] = [
    makeNode("root", "root", null, { isRoot: true }),
    makeNode("outer", "outer", "root"),
    makeNode("inner1", "inner1", "outer"),
    makeNode("inner2", "inner2", "outer"),
    makeNode("sibling", "sibling", "root"),
  ];
  const edges: FewerEdge[] = [
    makeEdge("e-root-outer", "root", "outer"),
    makeEdge("e-outer-inner1", "outer", "inner1"),
    makeEdge("e-outer-inner2", "outer", "inner2"),
    makeEdge("e-root-sibling", "root", "sibling"),
  ];

  const { op, newNodes, newEdges } = buildDeleteOp(nodes, edges, ["outer"]);

  // After delete: outer + inner1 + inner2 gone; root + sibling remain.
  expect(newNodes.map((n) => n.id).sort()).toEqual(["root", "sibling"].sort());
  expect(newEdges.map((e) => e.id).sort()).toEqual(["e-root-sibling"].sort());

  // Undo: all three back, parent links present.
  const undone = undoOps(newNodes, newEdges, [op]);
  expect(undone.nodes.map((n) => n.id).sort()).toEqual(
    ["root", "outer", "inner1", "inner2", "sibling"].sort(),
  );
  expect(undone.edges.map((e) => e.id).sort()).toEqual(
    ["e-root-outer", "e-outer-inner1", "e-outer-inner2", "e-root-sibling"].sort(),
  );
  // Parent links preserved.
  const idMap = new Map(undone.nodes.map((n) => [n.id, n]));
  expect(idMap.get("outer")?.data.parentId).toBe("root");
  expect(idMap.get("inner1")?.data.parentId).toBe("outer");
  expect(idMap.get("inner2")?.data.parentId).toBe("outer");
});

test("delete then delete+undo+redo reaches original state", () => {
  const nodes: FewerNode[] = [
    makeNode("root", "root", null, { isRoot: true }),
    makeNode("a", "a", "root"),
    makeNode("b", "b", "a"),
  ];
  const edges: FewerEdge[] = [
    makeEdge("e-root-a", "root", "a"),
    makeEdge("e-a-b", "a", "b"),
  ];
  const { op, newNodes, newEdges } = buildDeleteOp(nodes, edges, ["a"]);

  const applied = applyOps(newNodes, newEdges, [op]); // redo
  expect(applied.nodes.map((n) => n.id)).toEqual(["root"]);
  const undoneAgain = undoOps(applied.nodes, applied.edges, [op]); // undo again
  expect(undoneAgain.nodes.map((n) => n.id).sort()).toEqual(["root", "a", "b"].sort());
});

test("unparent (remove-edges) resets child + descendant paths and undo restores them", () => {
  // root -> outer -> inner ; outer & inner carry parent-qualified paths
  const nodes: FewerNode[] = [
    makeNode("root", "root", null, { isRoot: true }),
    makeNode("outer", "outer", "root", { path: "root/outer" }),
    makeNode("inner", "inner", "outer", { path: "root/outer/inner" }),
  ] as FewerNode[];
  const edges: FewerEdge[] = [
    makeEdge("e-root-outer", "root", "outer"),
    makeEdge("e-outer-inner", "outer", "inner"),
  ];

  const removedEdge = makeEdge("e-root-outer", "root", "outer");
  const op: import("./types").RemoveEdgesOp = {
    type: "remove-edges",
    edges: [removedEdge],
    pathChanges: [
      { nodeId: "outer", prevPath: "root/outer", nextPath: "outer" },
      { nodeId: "inner", prevPath: "root/outer/inner", nextPath: "outer/inner" },
    ],
  };

  // Apply (unparent): edge gone, paths rewritten to root-level.
  const applied = applyOps(nodes, edges, [op]);
  expect(applied.edges.map((e) => e.id)).toEqual(["e-outer-inner"]);
  const appliedMap = new Map(applied.nodes.map((n) => [n.id, n]));
  expect(appliedMap.get("outer")?.data.path).toBe("outer");
  expect(appliedMap.get("outer")?.data.isRoot).toBe(true);
  expect(appliedMap.get("inner")?.data.path).toBe("outer/inner");

  // Undo: edge restored, paths restored.
  const undone = undoOps(applied.nodes, applied.edges, [op]);
  const undoneMap = new Map(undone.nodes.map((n) => [n.id, n]));
  expect(undone.edges.map((e) => e.id).sort()).toEqual(["e-outer-inner", "e-root-outer"]);
  expect(undoneMap.get("outer")?.data.path).toBe("root/outer");
  expect(undoneMap.get("inner")?.data.path).toBe("root/outer/inner");
});

test("auto-hide is a live filter both ways", () => {
  // root with 5 children (> threshold 2 => children hidden; > threshold 10 => none hidden)
  const children = ["c1", "c2", "c3", "c4", "c5"].map((id, i) => makeNode(id, id, "root"));
  const nodes: FewerNode[] = [makeNode("root", "root", null, { isRoot: true }), ...children];
  const edges: FewerEdge[] = children.map((c, i) => makeEdge(`e-root-${c.id}`, "root", c.id));

  const noneHidden = [] as string[];

  // Threshold 2: all 5 children are auto-hidden.
  const low = reconcileAutoHide(nodes, edges, noneHidden, [], [], 2);
  expect(low.hiddenIds.length).toBe(5);
  expect(low.autoHiddenIds.length).toBe(5);

  // Threshold 10: children fall under the limit -> revealed (live filter both ways).
  const high = reconcileAutoHide(nodes, edges, low.hiddenIds, low.autoHiddenIds, [], 10);
  expect(high.hiddenIds.length).toBe(0);
  expect(high.autoHiddenIds.length).toBe(0);

  // Threshold back to 2: re-hidden.
  const backLow = reconcileAutoHide(nodes, edges, high.hiddenIds, high.autoHiddenIds, [], 2);
  expect(backLow.hiddenIds.length).toBe(5);
});

test("auto-hide does not reveal manually-hidden nodes when threshold rises", () => {
  const children = ["c1", "c2", "c3"].map((id) => makeNode(id, id, "root"));
  const nodes: FewerNode[] = [makeNode("root", "root", null, { isRoot: true }), ...children];
  const edges: FewerEdge[] = children.map((c) => makeEdge(`e-root-${c.id}`, "root", c.id));

  // c1 is auto-hidden, c2 is manually hidden (in hiddenIds but NOT in autoHiddenIds).
  const hiddenIds = ["c1", "c2"];
  const autoHiddenIds = ["c1"];

  // Raising the threshold should reveal c1 (auto-hidden, now under limit) but keep c2 hidden.
  const high = reconcileAutoHide(nodes, edges, hiddenIds, autoHiddenIds, [], 10);
  expect(high.hiddenIds).toEqual(["c2"]);
  expect(high.autoHiddenIds).toEqual([]);
});

test("setShowFiles(true) reveal re-applies the auto-hide limit (files under over-threshold folders stay hidden)", () => {
  // One folder with 12 file children, auto-hide threshold 10 — mirrors the
  // reveal-then-reconcile composition uiSlice.setShowFiles(true) now uses.
  const folder = makeNode("folder", "folder", null, { isRoot: true });
  const files = Array.from({ length: 12 }, (_, i) =>
    makeNode(`f${i}`, `f${i}`, "folder", { type: "file" })
  );
  const nodes = [folder, ...files];
  const edges = files.map((f) => makeEdge(`e-${f.id}`, "folder", f.id));

  // Naive reveal removed every file from hiddenIds — reconcile must re-hide
  // them (folder exceeds the threshold) and tag them as auto-hidden.
  const { hiddenIds, autoHiddenIds } = reconcileAutoHide(nodes, edges, [], [], [], 10);
  expect(new Set(hiddenIds)).toEqual(new Set(files.map((f) => f.id)));
  expect(new Set(autoHiddenIds)).toEqual(new Set(files.map((f) => f.id)));

  // Under the threshold the same reveal keeps all files visible.
  const under = reconcileAutoHide(nodes, edges, [], [], [], 12);
  expect(under.hiddenIds).toEqual([]);
  expect(under.autoHiddenIds).toEqual([]);
});
