import { describe, test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/createStore";
import { buildBatchActions } from "./batchActions";
import type { FewerNode, FewerEdge } from "./types";

/**
 * Regression tests for batch unparent.
 *
 * `unparentNodes` only detaches the *top-most* selection roots (a node whose
 * ancestor is also selected keeps its in-selection parent edge). A selection
 * made only of already-root-level cards therefore has nothing to detach — that
 * is a no-op and must not be reported as success, and must not push history.
 */

function folder(id: string, label: string, path: string): FewerNode {
  return { id, type: "folder", position: { x: 0, y: 0 }, data: { label, path, type: "folder" } };
}
function file(id: string, label: string, path: string): FewerNode {
  const ext = path.includes(".") ? path.split(".").pop() : undefined;
  return { id, type: "file", position: { x: 0, y: 0 }, data: { label, path, type: "file", extension: ext } };
}
function edge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target };
}

/** gp > p > c > f1 */
function setup() {
  const nodes = [
    folder("gp", "grandparent", "/grandparent"),
    folder("p", "parent", "/grandparent/parent"),
    folder("c", "child", "/grandparent/parent/child"),
    file("f1", "file1", "/grandparent/parent/child/file1.txt"),
  ];
  const edges = [edge("gp", "p"), edge("p", "c"), edge("c", "f1")];
  useGraphStore.setState({ nodes, edges, searchQuery: "", categoryFilter: [], past: [], future: [], selectedNodeIds: [] });
}

beforeEach(() => {
  useGraphStore.setState({ nodes: [], edges: [], past: [], future: [], selectedNodeIds: [] });
});

describe("unparentNodes — detached count", () => {
  test("returns 0 and pushes no history when every selected card is already root-level", () => {
    setup();
    const s = useGraphStore.getState();
    const pastBefore = s.past.length;

    // gp is a root with no parent; c is its descendant. Nothing can detach.
    const detached = s.unparentNodes(["gp", "c"]);

    expect(detached).toBe(0);
    const after = useGraphStore.getState();
    expect(after.past.length).toBe(pastBefore);
    expect(after.edges.length).toBe(3);
    expect(after.nodes.map((n) => n.id)).toEqual(["gp", "p", "c", "f1"]);
  });

  test("detaches only the top-most roots and keeps in-selection parent edges", () => {
    setup();

    const detached = useGraphStore.getState().unparentNodes(["p", "c", "f1"]);

    // p is the top-most root; c and f1 keep their in-selection parents.
    expect(detached).toBe(1);
    const { nodes, edges } = useGraphStore.getState();
    expect(edges.some((e) => e.source === "gp" && e.target === "p")).toBe(false);
    expect(edges.some((e) => e.source === "p" && e.target === "c")).toBe(true);
    expect(edges.some((e) => e.source === "c" && e.target === "f1")).toBe(true);
    expect(nodes.find((n) => n.id === "p")!.data.isRoot).toBe(true);
    expect(nodes.find((n) => n.id === "p")!.data.path).toBe("parent");
  });

  test("detaches unrelated roots from separate branches", () => {
    const nodes = [
      folder("root", "root", "/root"),
      folder("a", "a", "/root/a"),
      folder("b", "b", "/root/b"),
    ];
    const edges = [edge("root", "a"), edge("root", "b")];
    useGraphStore.setState({ nodes, edges, past: [], future: [] });

    const detached = useGraphStore.getState().unparentNodes(["a", "b"]);

    expect(detached).toBe(2);
    const { nodes: next, edges: nextEdges } = useGraphStore.getState();
    expect(nextEdges.length).toBe(0);
    expect(next.find((n) => n.id === "a")!.data.path).toBe("a");
    expect(next.find((n) => n.id === "b")!.data.path).toBe("b");
  });

  test("a single successful unparent is undoable", () => {
    setup();
    useGraphStore.getState().unparentNodes(["c"]);
    expect(useGraphStore.getState().edges.some((e) => e.source === "p" && e.target === "c")).toBe(false);

    useGraphStore.getState().undo();
    const restored = useGraphStore.getState();
    expect(restored.edges.some((e) => e.source === "p" && e.target === "c")).toBe(true);
    expect(restored.nodes.find((n) => n.id === "c")!.data.path).toBe("/grandparent/parent/child");
  });
});

describe("batch unparent action — toast gating", () => {
  test("toasts the detached count, not the selection size", () => {
    setup();
    useGraphStore.setState({ selectedNodeIds: ["p", "c", "f1"] });
    const toasts: { title: string; description?: string }[] = [];
    const action = buildBatchActions({ toast: (t) => toasts.push(t), selectedIds: ["p", "c", "f1"] }).find(
      (a) => a.id === "unparent",
    );

    action?.run();

    expect(toasts.length).toBe(1);
    expect(toasts[0].description).toBe("1 item made root-level");
  });

  test("stays silent on a no-op (root + descendant selection)", () => {
    setup();
    useGraphStore.setState({ selectedNodeIds: ["gp", "c"] });
    const toasts: { title: string; description?: string }[] = [];
    const action = buildBatchActions({ toast: (t) => toasts.push(t), selectedIds: ["gp", "c"] }).find(
      (a) => a.id === "unparent",
    );

    action?.run();

    expect(toasts).toEqual([]);
  });
});