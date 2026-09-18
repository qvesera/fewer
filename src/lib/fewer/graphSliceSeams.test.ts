import { describe, test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/createStore";
import type { FewerNode, FewerEdge } from "./types";

/**
 * Characterization suite for the 7 untested graphSlice seams:
 * duplicateNodeUnderParent, pasteNode, _findCreationPosition, connectNodes,
 * renameNodes (batch transform), parentNodesTo, setGraph, reset (+_makeCopyNode).
 * Pins CURRENT behavior before the createGraphSlice file split.
 */

function folder(id: string, label: string, path: string, x = 0, y = 0): FewerNode {
  return { id, type: "folder", position: { x, y }, data: { label, path, type: "folder" } };
}
function file(id: string, label: string, path: string, x = 0, y = 0): FewerNode {
  const ext = path.includes(".") ? path.split(".").pop() : undefined;
  return { id, type: "file", position: { x, y }, data: { label, path, type: "file", extension: ext } };
}
function edge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target };
}

beforeEach(() => {
  useGraphStore.setState({
    nodes: [], edges: [], past: [], future: [],
    selectedNodeIds: [], searchQuery: "", categoryFilter: [],
  });
});

/** root > a > b > c(file) */
function seedTree() {
  const nodes = [
    folder("root", "root", "/root"),
    folder("a", "a", "/root/a"),
    folder("b", "b", "/root/a/b"),
    file("c", "c", "/root/a/b/c.txt"),
  ];
  const edges = [edge("root", "a"), edge("a", "b"), edge("b", "c")];
  useGraphStore.setState({ nodes, edges, searchQuery: "", categoryFilter: [] });
}

function state() { return useGraphStore.getState(); }
function byId(id: string) { return state().nodes.find((n) => n.id === id)!; }

describe("duplicateNodeUnderParent", () => {
  test("clones node under same parent with 'copy' label, selects clone, pushes history", () => {
    seedTree();
    const pastBefore = state().past.length;
    state().duplicateNodeUnderParent("b");

    const after = state();
    expect(after.nodes.length).toBe(6); // b-clone + c-clone (whole subtree)
    const clone = after.nodes.find((n) => n.id !== "b" && n.data.label === "b copy");
    expect(clone).toBeDefined();
    expect(after.edges.some((e) => e.source === "a" && e.target === clone!.id)).toBe(true);
    const cloneChild = after.nodes.find((n) => n.id !== "c" && n.data.label === "c");
    expect(cloneChild).toBeDefined();
    expect(after.edges.some((e) => e.source === clone!.id && e.target === cloneChild!.id)).toBe(true);
    expect(byId("b").data.path).toBe("/root/a/b");
    expect(after.selectedNodeIds).toEqual([clone!.id]);
    expect(after.past.length).toBe(pastBefore + 1);
    expect(clone!.position).not.toEqual(byId("b").position);
  });

  test("root-level node duplicates to root with copy label", () => {
    seedTree();
    state().duplicateNodeUnderParent("root");
    const clone = state().nodes.find((n) => n.id !== "root" && n.data.label === "root copy");
    expect(clone).toBeDefined();
    expect(clone!.data.isRoot).toBe(true);
    expect(state().edges.some((e) => e.target === clone!.id)).toBe(false);
  });
});

describe("pasteNode", () => {
  test("duplicates under given folder parent with parent edge", () => {
    seedTree();
    state().pasteNode("c", "root");
    const after = state();
    const clone = after.nodes.find((n) => n.id !== "c" && n.data.label === "c copy");
    expect(clone).toBeDefined();
    expect(after.edges.some((e) => e.source === "root" && e.target === clone!.id)).toBe(true);
    expect(after.selectedNodeIds).toEqual([clone!.id]);
    // ponytail quirk: paste keeps SOURCE path prefix, not new parent's
    expect(clone!.data.path).toBe("/root/a/b/c copy.txt");
  });

  test("non-folder parent id falls back to root-level paste", () => {
    seedTree();
    state().pasteNode("c", "c"); // c is a file, not a folder
    const clone = state().nodes.find((n) => n.id !== "c" && n.data.label === "c copy");
    expect(clone).toBeDefined();
    expect(clone!.data.isRoot).toBe(true);
  });
});

describe("_makeCopyNode", () => {
  test("copy label increments when 'copy' sibling exists; root flag set for null parent", () => {
    seedTree();
    const s = state();
    const first = s._makeCopyNode(byId("b"), "a");
    expect(first.newNode.data.label).toBe("b copy");
    // sibling check reads edges from parent, so wire the first copy in fully
    useGraphStore.setState({
      nodes: [...state().nodes, first.newNode],
      edges: [...state().edges, edge("a", first.newNode.id)],
    });
    const second = useGraphStore.getState()._makeCopyNode(byId("b"), "a");
    expect(second.newNode.data.label).toBe("b copy 2");
    const rootCopy = useGraphStore.getState()._makeCopyNode(byId("a"), null);
    expect(rootCopy.newNode.data.isRoot).toBe(true);
    expect(rootCopy.newNode.data.path).toBe(rootCopy.newNode.data.label);
  });
});

describe("_findCreationPosition", () => {
  test("collision-free base returned as-is; colliding base nudged away", () => {
    useGraphStore.setState({
      nodes: [folder("n1", "n1", "/n1", 0, 0)],
      edges: [], searchQuery: "", categoryFilter: [],
      hiddenIds: [], autoHiddenIds: [],
    });
    const s = state();
    expect(s._findCreationPosition(5000, 5000, 200, 120)).toEqual({ x: 5000, y: 5000 });
    const nudged = s._findCreationPosition(0, 0, 200, 120);
    expect(nudged).not.toEqual({ x: 0, y: 0 });
  });
});

describe("connectNodes", () => {
  test("creates edge, rewrites child path, returns ok, pushes history", () => {
    useGraphStore.setState({
      nodes: [folder("p", "p", "/p"), file("f", "f", "/f.txt")],
      edges: [], searchQuery: "", categoryFilter: [],
    });
    const pastBefore = state().past.length;
    const r = state().connectNodes({ source: "p", target: "f" });
    expect(r).toEqual({ ok: true });
    expect(state().edges.some((e) => e.source === "p" && e.target === "f")).toBe(true);
    expect(byId("f").data.path).toBe("/p/f.txt");
    expect(state().past.length).toBe(pastBefore + 1);
  });

  test("rejects cycle, self-parent, file-as-parent without mutating", () => {
    seedTree();
    const before = JSON.stringify({ n: state().nodes, e: state().edges });
    expect(state().connectNodes({ source: "b", target: "root" }).ok).toBe(false);
    expect(state().connectNodes({ source: "a", target: "a" }).ok).toBe(false);
    expect(state().connectNodes({ source: "c", target: "a" }).ok).toBe(false);
    expect(JSON.stringify({ n: state().nodes, e: state().edges })).toBe(before);
    expect(state().connectNodes({ source: "", target: "a" })).toEqual({ ok: false, reason: "Missing source or target." });
  });
});

describe("renameNodes (batch transform)", () => {
  test("applies transform per node, returns count, rewrites descendant paths, one history entry", () => {
    seedTree();
    const pastBefore = state().past.length;
    const n = state().renameNodes(["a", "c"], (node, i) => `${node.data.label}-r${i}`);
    expect(n).toBe(2);
    expect(byId("a").data.label).toBe("a-r0");
    expect(byId("a").data.path).toBe("/root/a-r0");
    expect(byId("b").data.path).toBe("/root/a-r0/b");
    expect(byId("c").data.label).toBe("c-r1");
    expect(state().past.length).toBe(pastBefore + 1);
  });

  test("skips blank/unchanged transforms, returns 0 with no history when all skip", () => {
    seedTree();
    const pastBefore = state().past.length;
    const n = state().renameNodes(["a", "b"], (node) =>
      node.id === "a" ? "   " : node.data.label,
    );
    expect(n).toBe(0);
    expect(state().past.length).toBe(pastBefore);
    expect(byId("a").data.label).toBe("a");
  });
});

describe("parentNodesTo", () => {
  test("moves folder subtree to new target, rewrites descendant paths", () => {
    seedTree();
    useGraphStore.setState({ nodes: [...state().nodes, folder("t", "t", "/t")], edges: state().edges });
    const r = state().parentNodesTo(["b"], "t");
    expect(r.moved).toBe(1);
    expect(state().edges.some((e) => e.source === "t" && e.target === "b")).toBe(true);
    expect(state().edges.some((e) => e.source === "a" && e.target === "b")).toBe(false);
    expect(byId("b").data.path).toBe("/t/b");
    expect(byId("c").data.path).toBe("/t/b/c.txt");
    expect(byId("b").data.isRoot).toBe(false);
  });

  test("rejects non-folder target and already-there no-op with reasons", () => {
    seedTree();
    expect(state().parentNodesTo(["a"], "c")).toEqual({ moved: 0, reason: "Target must be a folder." });
    expect(state().parentNodesTo(["b"], "a")).toEqual({ moved: 0, reason: "Items are already in that folder." });
  });
});

describe("setGraph", () => {
  test("replaces graph, bumps version, styles edges, no history push on empty prior graph", () => {
    const nodes = [folder("x", "x", "/x"), folder("y", "y", "/y")];
    const edges = [edge("x", "y")];
    const vBefore = state().graphVersion;
    state().setGraph(nodes, edges);
    const after = state();
    expect(after.nodes.map((n) => n.id).sort()).toEqual(["x", "y"]);
    expect(after.graphVersion).toBe(vBefore + 1);
    expect(after.edges[0].type).toBeDefined();
    expect(after.past.length).toBe(0);
  });
});

describe("reset", () => {
  test("clears nodes, edges, history, selection, and UI-adjacent graph fields", () => {
    seedTree();
    useGraphStore.setState({
      selectedNodeIds: ["a"], searchQuery: "q", hiddenIds: ["b"],
      tags: [{ id: "t1", label: "T" } as never],
    });
    state().reset();
    const after = state();
    expect(after.nodes).toEqual([]);
    expect(after.edges).toEqual([]);
    expect(after.past).toEqual([]);
    expect(after.future).toEqual([]);
    expect(after.selectedNodeIds).toEqual([]);
    expect(after.searchQuery).toBe("");
    expect(after.graphVersion).toBe(0);
    expect(after.clipboard).toBeNull();
    expect(after.tags).toEqual([]);
  });
});
