import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";

// The store actions below all collect "a node and its descendants" before
// writing to state. They delegate to `getDescendants` (single home in
// validation.ts) instead of hand-rolled BFS copies.
//
// Two properties matter and neither is reachable from the connect UI:
//   - a node reachable by more than one path (fan-in / diamond) must be listed
//     ONCE, or the id leaks into state twice,
//   - a cycle must terminate the walk.
// Both are reachable from a raw graph import: `setGraph` (used by saved-graph
// load and JSON/CSV import) stores edges verbatim, with no validateConnection
// pass — and validateConnection is the only thing that enforces single-parent
// and acyclicity.

function makeNode(id: string, type: "folder" | "file"): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type, parentId: null },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep" } as FewerEdge;
}

/** a → b, a → c, b → d, c → d: `d` is reachable by two paths. */
function seedDiamond() {
  useGraphStore.setState({
    nodes: [makeNode("a", "folder"), makeNode("b", "folder"), makeNode("c", "folder"), makeNode("d", "file")],
    edges: [makeEdge("a", "b"), makeEdge("a", "c"), makeEdge("b", "d"), makeEdge("c", "d")],
    selectedNodeIds: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    autoHiddenIds: [],
    revealedRootIds: [],
    categoryFilter: [],
    categoryHiddenIds: [],
    viewSettings: {},
  });
}

/** a → b, b → a: a cycle the connect UI can never produce. */
function seedCycle() {
  useGraphStore.setState({
    nodes: [makeNode("a", "folder"), makeNode("b", "folder")],
    edges: [makeEdge("a", "b"), makeEdge("b", "a")],
    selectedNodeIds: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    autoHiddenIds: [],
    revealedRootIds: [],
    categoryFilter: [],
    categoryHiddenIds: [],
    viewSettings: {},
  });
}

/**
 * a → b, b → c, c → b. The cycle b↔c never passes back through the root `a`,
 * which is the shape the old renameNode walk could not escape: it re-queued `b`
 * on every visit to `c` (no add-time dedupe), so the pop count grew without
 * bound and the UI froze. Paths are nested under `/a` so the descendant path
 * rewrite is observable.
 */
function seedNonRootCycle() {
  const mk = (id: string, type: "folder" | "file", path: string): FewerNode =>
    ({ id, type: "folder", position: { x: 0, y: 0 }, data: { label: id, path, type, parentId: null }, style: { width: 200, height: 120 } }) as FewerNode;
  useGraphStore.setState({
    nodes: [mk("a", "folder", "a"), mk("b", "folder", "a/b"), mk("c", "folder", "a/c")],
    edges: [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("c", "b")],
    selectedNodeIds: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    autoHiddenIds: [],
    revealedRootIds: [],
    categoryFilter: [],
    categoryHiddenIds: [],
    viewSettings: {},
  });
}

const s = () => useGraphStore.getState();

const countOf = (list: string[], id: string) => list.filter((x) => x === id).length;

describe("hiddenId collection is duplicate-free on fan-in graphs", () => {
  beforeEach(seedDiamond);

  it("hideNode lists a shared descendant once", () => {
    s().hideNode("a");
    expect(s().hiddenIds).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
    for (const id of ["a", "b", "c", "d"]) expect(countOf(s().hiddenIds, id)).toBe(1);
  });

  it("hideNodes lists a shared descendant once across several seeds", () => {
    s().hideNodes(["a", "b"]);
    for (const id of ["a", "b", "c", "d"]) expect(countOf(s().hiddenIds, id)).toBe(1);
  });

  it("hideSelected lists a shared descendant once", () => {
    useGraphStore.setState({ selectedNodeIds: ["a"] });
    s().hideSelected();
    for (const id of ["a", "b", "c", "d"]) expect(countOf(s().hiddenIds, id)).toBe(1);
  });
});

describe("descendant walks terminate on cycles", () => {
  beforeEach(seedCycle);

  it("hideNode on a cycle terminates and hides both nodes once", () => {
    s().hideNode("a");
    for (const id of ["a", "b"]) expect(countOf(s().hiddenIds, id)).toBe(1);
  });

  it("hideNodes on a cycle terminates and hides both nodes once", () => {
    s().hideNodes(["a", "b"]);
    for (const id of ["a", "b"]) expect(countOf(s().hiddenIds, id)).toBe(1);
  });
});

describe("renameNode terminates on a cycle that never returns to the root", () => {
  beforeEach(seedNonRootCycle);

  // Regression: the old inline walk re-queued `b` on every visit to `c` with no
  // add-time guard, so this graph made renameNode spin forever and freeze the
  // UI. The root-exclusion check never rescued it because no edge returns to `a`.
  it("renames the folder and rewrites descendant paths", () => {
    expect(s().renameNode("a", "renamed")).toBe(true);
    const pathOf = (id: string) => s().nodes.find((n) => n.id === id)!.data.path;
    expect(pathOf("a")).toBe("renamed");
    expect(pathOf("b")).toBe("renamed/b");
    expect(pathOf("c")).toBe("renamed/c");
  });
});
