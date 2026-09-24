import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";
import { ancestorChain, getHiddenLayerGroups } from "./hiddenGroups";

// The mirror image of descendantWalks.test.ts: the store actions below walk the
// *ancestor* chain before writing to state, now via `ancestorChainOf` (single
// home in validation.ts).
//
// The property that matters here is termination. Every one of the old inline
// walks followed `parentMap` with no visited set, so an imported cycle made it
// spin forever and freeze the UI. The connect UI cannot build a cycle
// (validateConnection enforces a single parent and rejects cycles) — but
// `setGraph`, used by saved-graph load and JSON/CSV import, stores edges
// verbatim with no validation pass.

function makeNode(id: string, type: "folder" | "file", depth = 0): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type, parentId: null, depth },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep" } as FewerEdge;
}

const baseState = () => ({
  selectedNodeIds: [],
  hiddenIds: [],
  independentlyHiddenIds: [],
  autoHiddenIds: [],
  revealedRootIds: [],
  revealedFromHidden: [],
  categoryFilter: [],
  categoryHiddenIds: [],
  viewSettings: {},
});

/**
 * p → s, q → p, p → q. Walking up from `s` steps onto the p↔q cycle, which
 * contains no selected node — so the old `while (p) { … p = get(p) }` root
 * filters could never match and never stop. This is the rho shape: the walked
 * node is *not* itself on the cycle.
 */
function seedRhoCycle() {
  useGraphStore.setState({
    nodes: [makeNode("s", "folder"), makeNode("p", "folder"), makeNode("q", "folder")],
    edges: [makeEdge("p", "s"), makeEdge("q", "p"), makeEdge("p", "q")],
    ...baseState(),
  });
}

/** a ↔ b, both hidden: `showAncestors` walks up through the cycle. */
function seedHiddenCycle() {
  useGraphStore.setState({
    nodes: [makeNode("a", "folder"), makeNode("b", "folder")],
    edges: [makeEdge("a", "b"), makeEdge("b", "a")],
    ...baseState(),
    hiddenIds: ["a", "b"],
  });
}

/**
 * a(0) → b(1) → c(2), c → b. `c` is hidden only by the depth limit, so raising
 * the limit sends setMaxDisplayDepth up the b↔c cycle.
 */
function seedDepthCycle() {
  useGraphStore.setState({
    nodes: [makeNode("a", "folder", 0), makeNode("b", "folder", 1), makeNode("c", "file", 2)],
    edges: [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("c", "b")],
    ...baseState(),
    hiddenIds: ["c"],
    // This fixture isolates depth hiding, not another test's large-folder limit.
    autoHideThreshold: 10,
    maxDisplayDepth: 1,
  });
}

const s = () => useGraphStore.getState();
describe("root filters terminate on a cycle above the walked node", () => {
  beforeEach(seedRhoCycle);

  // Regression: the old walk never matched (p and q are not selected) and never
  // stopped, so this froze the UI. `s` is a genuine top-most root — its only
  // ancestor chain is s → p → q → (p, already seen).
  it("unparentNodes detaches s", () => {
    expect(s().unparentNodes(["s"])).toBe(1);
    expect(s().edges.some((e) => e.target === "s")).toBe(false);
  });

  it("parentNodesTo resolves instead of spinning", () => {
    const res = s().parentNodesTo(["s"], "q");
    expect(typeof res.moved).toBe("number");
  });
});

describe("ancestor walks terminate on a hidden cycle", () => {
  beforeEach(seedHiddenCycle);

  it("showAncestors reveals the whole cycle", () => {
    s().showAncestors("b");
    expect(s().hiddenIds).toEqual([]);
    expect(new Set(s().revealedFromHidden)).toEqual(new Set(["a", "b"]));
  });

  it("getHiddenLayerGroups resolves instead of spinning", () => {
    const groups = getHiddenLayerGroups(s().nodes, s().edges, ["a", "b"]);
    expect(Array.isArray(groups)).toBe(true);
  });

  it("ancestorChain stops at the first repeat", () => {
    expect(ancestorChain("a", s().edges)).toEqual(["b"]);
  });
});

describe("setMaxDisplayDepth terminates on a cycle", () => {
  beforeEach(seedDepthCycle);

  // Regression: c is hidden only by the old depth limit, so the walk climbed
  // b → c → b … looking for a manual/auto-hidden ancestor and never stopped.
  it("raising the limit reveals c", () => {
    s().setMaxDisplayDepth(2);
    expect(s().hiddenIds).not.toContain("c");
  });
});
