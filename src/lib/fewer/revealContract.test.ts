import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { reconcileAutoHide } from "@/store/slices/graph/reveal";
import type { FewerEdge, FewerNode } from "./types";

// The reveal contract: ONE reveal gesture, ONE store write, and no reconcile
// that can undo it.
//
// The bug: a canvas double-click reveal removed a card from the hide sets but
// recorded no exemption, while a sidebar reveal recorded its exemption (and then
// re-ran the auto-hide reconcile, which re-hides every non-exempt child of an
// over-threshold folder). So revealing from the sidebar wiped the canvas
// reveals and kept its own history — and cost four version bumps, four layout
// passes and a localStorage write per click.

const CHILDREN = 12; // > the default threshold of 10
const PARKED = 99999;

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

/** root → big(12 files) + two small folders, all of big's files auto-hidden. */
function seedGraph() {
  const nodes: FewerNode[] = [makeNode("root", "folder", 0), makeNode("big", "folder", 1)];
  const edges: FewerEdge[] = [makeEdge("root", "big")];
  for (let i = 0; i < CHILDREN; i++) {
    nodes.push(makeNode(`b${i}`, "file", 2));
    edges.push(makeEdge("big", `b${i}`));
  }
  for (const name of ["small1", "small2"]) {
    nodes.push(makeNode(name, "folder", 1));
    edges.push(makeEdge("root", name));
    nodes.push(makeNode(`${name}-f`, "file", 2));
    edges.push(makeEdge(name, `${name}-f`));
  }
  const autoHidden = Array.from({ length: CHILDREN }, (_, i) => `b${i}`);
  useGraphStore.setState({
    nodes,
    edges,
    hiddenIds: [...autoHidden],
    autoHiddenIds: [...autoHidden],
    independentlyHiddenIds: [],
    revealedRootIds: [],
    revealedFromHidden: [],
    selectedNodeIds: [],
    viewSettings: {},
    activeLeafId: null,
    categoryFilter: [],
    categoryHiddenIds: [],
    showFiles: true,
    autoHideThreshold: 10,
    maxDisplayDepth: 6,
    autoRelayout: true,
    past: [],
    future: [],
  });
}

const s = () => useGraphStore.getState();

/** Park every card off-screen; "a pass ran" = something moved back. */
function park() {
  useGraphStore.setState({
    nodes: useGraphStore.getState().nodes.map((n) => ({ ...n, position: { x: PARKED, y: PARKED } })),
  });
}
function aPassRan(): boolean {
  return useGraphStore.getState().nodes.some((n) => n.position.x !== PARKED);
}

/** Count layout passes by shadowing relayout (relayoutIfAuto calls get().relayout). */
function countLayoutPasses() {
  const original = useGraphStore.getState().relayout;
  let passes = 0;
  useGraphStore.setState({
    relayout: () => {
      passes++;
      original();
    },
  });
  return () => passes;
}

describe("a reveal survives every later auto-hide reconcile", () => {
  it("canvas double-click reveal is not undone by a later sidebar reveal", () => {
    s().showNode("b0"); // the canvas path: eyeRevealForLeaf + showNode
    expect(s().hiddenIds).not.toContain("b0");

    s().revealSubtree("small1"); // the sidebar path
    s().autoHideLargeFolders(); // import / threshold / folder-refresh path

    expect(s().hiddenIds).not.toContain("b0");
    expect(s().autoHiddenIds).not.toContain("b0");
  });

  it("sidebar reveal history survives later sidebar reveals", () => {
    s().revealSubtree("small1");
    s().revealSubtree("small2");
    s().autoHideLargeFolders();
    expect(s().hiddenIds).not.toContain("small1");
    expect(s().hiddenIds).not.toContain("small2");
  });

  it("a reveal recorded only in a view's layers survives a reconcile", () => {
    useGraphStore.setState({
      viewSettings: {
        leaf1: { hideLayers: { individual: ["b1"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] } },
      },
    });
    s().eyeRevealForLeaf("leaf1", "b1");
    s().autoHideLargeFolders();
    // b1 was never in the global hide set, so only the exemption can keep the
    // reconciler from adding it back as a child of the over-threshold folder.
    expect(s().hiddenIds).toContain("b1");
  });

  it("re-hiding a card ends its exemption, so a reconcile may hide it again", () => {
    s().showNode("b0");
    expect(s().revealedRootIds).toContain("b0");
    s().hideNode("b0");
    expect(s().revealedRootIds).not.toContain("b0");
    s().autoHideLargeFolders();
    expect(s().hiddenIds).toContain("b0");
  });

  it("a folder reveal keeps the whole subtree it promised to show", () => {
    s().revealInView(null, "big", { subtree: true });
    for (let i = 0; i < CHILDREN; i++) {
      expect(s().hiddenIds).not.toContain(`b${i}`);
    }
  });
});

describe("one reveal gesture is one store write", () => {
  it("sidebar eye: one version bump, one layout pass, one undo step", () => {
    useGraphStore.setState({
      viewSettings: {
        leaf1: { hideLayers: { individual: ["b0"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] } },
      },
    });
    s().setActiveLeaf("leaf1");
    park();
    const passes = countLayoutPasses();
    const version = s().graphVersion;
    const past = s().past.length;

    s().revealInView("leaf1", "b0", { subtree: false });

    expect(passes()).toBe(1);
    expect(aPassRan()).toBe(true);
    // Two bumps: the reveal write + the single layout pass it asks for. The old
    // chain bumped four times before the relayouts even started.
    expect(s().graphVersion).toBe(version + 2);
    expect(s().past.length).toBe(past + 1);
    expect(s().viewSettings.leaf1.hideLayers.individual).not.toContain("b0");
    expect(s().hiddenIds).not.toContain("b0");
  });

  it("canvas double-click reveal costs the same", () => {
    park();
    const passes = countLayoutPasses();
    const version = s().graphVersion;

    s().revealInView(null, "b1");

    expect(passes()).toBe(1);
    expect(s().graphVersion).toBe(version + 2);
    expect(s().hiddenIds).not.toContain("b1");
  });

  it("revealing something nothing hides is a no-op", () => {
    const version = s().graphVersion;
    const past = s().past.length;
    s().revealInView(null, "root");
    expect(s().graphVersion).toBe(version);
    expect(s().past.length).toBe(past);
  });
});

describe("the auto-hide reconcile is linear", () => {
  it("30k nodes / 15k hidden reconciles fast (it used to build a Set per node)", () => {
    const nodes: FewerNode[] = [];
    const edges: FewerEdge[] = [];
    const hidden: string[] = [];
    for (let i = 0; i < 30_000; i++) {
      const parent = i === 0 ? null : `d${Math.floor((i - 1) / 12)}`;
      nodes.push(makeNode(`n${i}`, i % 3 === 0 ? "folder" : "file", 1));
      if (parent) edges.push(makeEdge(parent, `n${i}`));
      if (i % 2 === 0) hidden.push(`n${i}`);
    }
    const started = performance.now();
    reconcileAutoHide(nodes, edges, hidden, hidden, [], 10);
    const elapsed = performance.now() - started;
    // Quadratic (a Set rebuilt for every node) took seconds here; linear is ms.
    expect(elapsed).toBeLessThan(500);
  });
});


beforeEach(seedGraph);
