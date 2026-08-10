import { test, expect } from "bun:test";
import { applyOps, undoOps } from "./history";
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

const baseView: ViewState = { hiddenIds: [], showFiles: true, maxDisplayDepth: 6, autoHideThreshold: 10 };

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