import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import {
  computeEffectiveHidden,
  needsLayoutDerivation,
  pruneHideLayers,
  type ViewSettings,
} from "./viewState";
import type { FewerEdge, FewerNode } from "./types";

// Importing replaces the graph; the visibility state that described the PREVIOUS
// graph must not survive it.
//
// Hiding with a view active routes to hideForLeaf, whose seed-on-write copies the
// entire global hidden list into that view's `individual` layer. Import mints
// fresh node ids, so that list becomes dead references — which still fed
// computeEffectiveHidden, and therefore the Hidden Cards badge, the dock section
// meta and the canvas chip, while the panel itself (which filters to live nodes)
// had no rows left to show. Reveal All papered over it: the only action that
// cleared both ledgers.

const DEAD = ["old1", "old2", "oldFolder", "oldFile"];

function makeNode(id: string, type: "folder" | "file"): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type, parentId: null, depth: 1 },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep" } as FewerEdge;
}

/** The new import: root → dir → f1. Small, so auto-hide adds nothing. */
function newGraph() {
  return {
    nodes: [makeNode("root", "folder"), makeNode("dir", "folder"), makeNode("f1", "file")],
    edges: [makeEdge("root", "dir"), makeEdge("dir", "f1")],
  };
}

/** A view that hid the previous graph's cards, collapsed one folder, dragged one. */
const dirtyView = (): ViewSettings => ({
  direction: "LR",
  edgeStyle: "curved",
  hideLayers: {
    individual: ["old1", "old2"],
    subtrees: { oldFolder: ["oldFile"], dir: ["old2"] },
    filesBulkActive: false,
    filesBulkExempt: ["oldFile"],
  },
  collapsedFolderIds: ["oldFolder"],
  positions: { old1: { x: 1, y: 2 } },
});

beforeEach(() => {
  const { nodes, edges } = newGraph();
  useGraphStore.setState({
    nodes,
    edges,
    viewSettings: { leaf1: dirtyView() },
    activeLeafId: "leaf1",
    hiddenIds: [],
    autoHiddenIds: [],
    independentlyHiddenIds: ["old1", "old2"],
    revealedFromHidden: ["old1"],
    revealedRootIds: [],
    categoryFilter: [],
    categoryHiddenIds: [],
    showFiles: true,
    autoHideThreshold: 10,
    maxDisplayDepth: 6,
    past: [],
    future: [],
  });
});

const s = () => useGraphStore.getState();

/** What the badge, the dock meta, the chip and the panel gate all read. */
const badgeCount = () =>
  computeEffectiveHidden(
    s().hiddenIds,
    s().viewSettings.leaf1?.hideLayers,
    s().nodes.filter((n) => n.data.type === "file").map((n) => n.id),
  ).length;

describe("importing drops the previous graph's visibility state", () => {
  it("the Hidden Cards count is the new graph's, not the old one's", () => {
    expect(badgeCount()).toBeGreaterThan(0); // the stale layer is what used to stick
    const { nodes, edges } = newGraph();
    s().setGraph(nodes, edges, false);
    expect(badgeCount()).toBe(0);
    expect(s().hiddenIds).toEqual([]);
  });

  it("an emptied hide layer disappears entirely (presence means 'this view hid things')", () => {
    const { nodes, edges } = newGraph();
    s().setGraph(nodes, edges, false);
    expect(s().viewSettings.leaf1.hideLayers).toBeUndefined();
  });

  it("preferences survive, ids do not", () => {
    const { nodes, edges } = newGraph();
    s().setGraph(nodes, edges, false);
    const leaf = s().viewSettings.leaf1;
    expect(leaf.direction).toBe("LR");
    expect(leaf.edgeStyle).toBe("curved");
    expect(leaf.collapsedFolderIds).toBeUndefined();
    expect(leaf.positions).toBeUndefined();
    expect(s().independentlyHiddenIds).toEqual([]);
    expect(s().revealedFromHidden).toEqual([]);
  });

  it("no view is forced into its own layout pass by a dead layer", () => {
    // This view's own direction matches the global one, so the ONLY reasons left
    // to derive a private layout are its hide layers and collapsed folders.
    const global = { direction: "LR" as const, hiddenIds: [] as string[] };
    expect(needsLayoutDerivation(s().viewSettings.leaf1, global, [])).toBe(true); // stale state
    const { nodes, edges } = newGraph();
    s().setGraph(nodes, edges, false);
    expect(needsLayoutDerivation(s().viewSettings.leaf1, global, [])).toBe(false);
  });
});

describe("reloading the same graph keeps its view state", () => {
  it("live ids survive setGraph (a page reload restores the same ids)", () => {
    useGraphStore.setState({
      viewSettings: {
        leaf1: {
          hideLayers: { individual: ["f1"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] },
          collapsedFolderIds: ["dir"],
          positions: { dir: { x: 5, y: 6 } },
        },
      },
      independentlyHiddenIds: ["f1"],
      revealedFromHidden: ["f1"],
    });
    const { nodes, edges } = newGraph();
    s().setGraph(nodes, edges, false);
    const leaf = s().viewSettings.leaf1;
    expect(leaf.hideLayers.individual).toEqual(["f1"]);
    expect(leaf.collapsedFolderIds).toEqual(["dir"]);
    expect(leaf.positions).toEqual({ dir: { x: 5, y: 6 } });
    expect(s().independentlyHiddenIds).toEqual(["f1"]);
    expect(s().revealedFromHidden).toEqual(["f1"]);
  });
});

describe("pruneHideLayers", () => {
  const live = new Set(["dir", "f1"]);

  it("keeps only live ids and drops a subtree whose folder is gone", () => {
    const pruned = pruneHideLayers(
      {
        individual: ["f1", ...DEAD],
        subtrees: { oldFolder: ["oldFile"], dir: ["f1", "old2"] },
        filesBulkActive: false,
        filesBulkExempt: ["oldFile", "f1"],
      },
      live,
    );
    expect(pruned!.individual).toEqual(["f1"]);
    expect(pruned!.subtrees).toEqual({ dir: ["f1"] });
    expect(pruned!.filesBulkExempt).toEqual(["f1"]);
  });

  it("keeps the Hide Files preference even with no ids left", () => {
    const pruned = pruneHideLayers(
      { individual: DEAD, subtrees: {}, filesBulkActive: true, filesBulkExempt: DEAD },
      live,
    );
    expect(pruned).toBeDefined();
    expect(pruned!.filesBulkActive).toBe(true);
    expect(pruned!.individual).toEqual([]);
  });

  it("returns undefined when the view hid nothing that still exists", () => {
    expect(
      pruneHideLayers(
        { individual: DEAD, subtrees: { oldFolder: DEAD }, filesBulkActive: false, filesBulkExempt: [] },
        live,
      ),
    ).toBeUndefined();
  });
});
