import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore, isAnyDialogOpen } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "./tutorial";
import * as treeModule from "./panelTree";

// bun's test env ships no localStorage; dialogsSlice gate-guards on
// `typeof window === "undefined"`, so stub both (same harness as snapshot.test.ts).
function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
}
const localStorage = makeStorage();
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = localStorage;

function makeNode(id: string, type: "folder" | "file", opts: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type, parentId: null, ...opts },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep" } as FewerEdge;
}

/** Seed a root -> outer -> [inner1, inner2] + sibling graph, clear UI state. */
function seedTree() {
  useGraphStore.setState({
    nodes: [
      makeNode("root", "folder", { isRoot: true }),
      makeNode("outer", "folder"),
      makeNode("inner1", "file"),
      makeNode("inner2", "file"),
      makeNode("sibling", "file"),
    ],
    edges: [
      makeEdge("root", "outer"),
      makeEdge("outer", "inner1"),
      makeEdge("outer", "inner2"),
      makeEdge("root", "sibling"),
    ],
    selectedNodeIds: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    autoHiddenIds: [],
    categoryFilter: [],
    categoryHiddenIds: [],
    viewSettings: {},
    showFiles: true,
  });
}

beforeEach(seedTree);
const s = () => useGraphStore.getState();

describe("visibilitySlice (global hidden)", () => {
  it("toggleHidden hides and reveals, tracking independently-hidden ids", () => {
    s().toggleHidden("outer");
    expect(s().hiddenIds).toContain("outer");
    expect(s().independentlyHiddenIds).toContain("outer");
    s().toggleHidden("outer");
    expect(s().hiddenIds).not.toContain("outer");
    expect(s().independentlyHiddenIds).not.toContain("outer");
  });

  it("toggleHidden reveal also clears the auto-hidden tag", () => {
    useGraphStore.setState({ hiddenIds: ["inner1"], autoHiddenIds: ["inner1"], independentlyHiddenIds: ["inner1"] });
    s().toggleHidden("inner1");
    expect(s().autoHiddenIds).not.toContain("inner1");
  });

  it("hideSelected hides selection + descendants and clears selection", () => {
    useGraphStore.setState({ selectedNodeIds: ["outer"] });
    s().hideSelected();
    expect(s().hiddenIds).toEqual(expect.arrayContaining(["outer", "inner1", "inner2"]));
    expect(s().selectedNodeIds).toEqual([]);
  });

  it("hideSelected is a no-op with empty selection", () => {
    s().hideSelected();
    expect(s().hiddenIds).toEqual([]);
  });

  it("showAll clears hidden + category layers", () => {
    useGraphStore.setState({ hiddenIds: ["outer"], independentlyHiddenIds: ["outer"], categoryFilter: ["image" as never], categoryHiddenIds: ["sibling"] });
    s().showAll();
    expect(s().hiddenIds).toEqual([]);
    expect(s().categoryFilter).toEqual([]);
    expect(s().categoryHiddenIds).toEqual([]);
  });

  it("showAll is a no-op when nothing is hidden", () => {
    const before = s().past.length;
    s().showAll();
    expect(s().past.length).toBe(before);
  });

  it("setShowFiles(false) hides every file", () => {
    s().setShowFiles(false);
    expect(s().showFiles).toBe(false);
    expect(s().hiddenIds).toEqual(expect.arrayContaining(["inner1", "inner2", "sibling"]));
  });

  it("setShowFiles(true) keeps files under hidden folders hidden", () => {
    // inner1/inner2 live under hidden "outer" → stay hidden.
    // sibling is NOT user-hidden: it was hidden only by the showFiles(false)
    // bulk hide; with a visible parent and no other mechanism, it reveals.
    useGraphStore.setState({
      showFiles: false,
      hiddenIds: ["outer", "inner1", "inner2", "sibling"],
      independentlyHiddenIds: [],
      autoHiddenIds: [],
      autoHideThreshold: 10,
      maxDisplayDepth: 6,
      revealedRootIds: [],
    });
    s().setShowFiles(true);
    expect(s().showFiles).toBe(true);
    expect(s().hiddenIds).toContain("outer");
    expect(s().hiddenIds).toContain("inner1");
    expect(s().hiddenIds).toContain("inner2");
    expect(s().hiddenIds).not.toContain("sibling");
  });

  it("setShowFiles(true) never reveals independently-hidden files", () => {
    // Mirrors the real showFiles(false)→(true) composition: bulk hide adds ALL
    // files to hiddenIds; directly-toggled ones are also in
    // independentlyHiddenIds and must survive the re-reveal.
    useGraphStore.setState({
      showFiles: false,
      hiddenIds: ["sibling", "inner1", "inner2"],
      independentlyHiddenIds: ["sibling"],
      autoHiddenIds: [],
      autoHideThreshold: 10,
      maxDisplayDepth: 6,
      revealedRootIds: [],
    });
    s().setShowFiles(true);
    expect(s().hiddenIds).toContain("sibling");
    expect(s().hiddenIds).not.toContain("inner1");
  });

  it("setShowFiles(true) with maxDisplayDepth 0 (unlimited) reveals all", () => {
    useGraphStore.setState({
      showFiles: false,
      hiddenIds: ["inner1", "sibling"],
      maxDisplayDepth: 0,
      autoHideThreshold: 10,
      revealedRootIds: [],
      independentlyHiddenIds: [],
      autoHiddenIds: [],
    });
    s().setShowFiles(true);
    expect(s().hiddenIds).toEqual([]);
  });
});

// __PART2__
describe("folderSlice (per-leaf hide layers)", () => {
  it("hideForLeaf seeds individual from global hidden and expands descendants", () => {
    useGraphStore.setState({ hiddenIds: ["sibling"] });
    s().hideForLeaf("leaf1", ["outer"]);
    const leaf = s().viewSettings["leaf1"];
    expect(leaf.hideLayers?.individual).toEqual(expect.arrayContaining(["sibling", "outer"]));
    expect(leaf.hideLayers?.subtrees["outer"]).toEqual(expect.arrayContaining(["inner1", "inner2"]));
  });

  it("eyeRevealForLeaf removes id from individual + subtrees", () => {
    s().hideForLeaf("leaf1", ["outer"]);
    s().eyeRevealForLeaf("leaf1", "inner1");
    const layers = s().viewSettings["leaf1"].hideLayers!;
    expect(layers.individual).not.toContain("inner1");
    expect(layers.subtrees["outer"] ?? []).not.toContain("inner1");
    expect(layers.subtrees["outer"]).toContain("inner2");
  });

  it("hideSubtreeForLeaf merges without re-hiding revealed children", () => {
    s().hideForLeaf("leaf1", ["outer"]);
    s().eyeRevealForLeaf("leaf1", "inner1");
    s().hideSubtreeForLeaf("leaf1", "outer", ["inner2"]);
    const sub = s().viewSettings["leaf1"].hideLayers!.subtrees["outer"];
    expect(sub).toEqual(expect.arrayContaining(["inner2"]));
    expect(sub).not.toContain("inner1");
  });

  it("showSubtreeForLeaf drops one folder's subtree layer", () => {
    s().hideForLeaf("leaf1", ["outer"]);
    s().showSubtreeForLeaf("leaf1", "outer");
    expect(s().viewSettings["leaf1"].hideLayers!.subtrees["outer"]).toBeUndefined();
  });

  it("showSubtreeForLeaf reveals files hidden by the bulk Hide Files layer", () => {
    s().setFilesBulkForLeaf("leaf1", true);
    s().showSubtreeForLeaf("leaf1", "outer");
    const layers = s().viewSettings["leaf1"].hideLayers!;
    // The folder's files are exempted so Show Children wins over Hide Files…
    expect(layers.filesBulkExempt).toEqual(expect.arrayContaining(["inner1", "inner2"]));
    // …while the bulk layer stays on and other files remain hidden.
    expect(layers.filesBulkActive).toBe(true);
    expect(layers.filesBulkExempt).not.toContain("sibling");
  });

  it("showSubtreeForLeaf reveals descendants hidden globally (show files off)", () => {
    s().setShowFiles(false);
    expect(s().hiddenIds).toEqual(expect.arrayContaining(["inner1", "inner2", "sibling"]));
    s().showSubtreeForLeaf("leaf1", "outer");
    expect(s().hiddenIds).not.toContain("inner1");
    expect(s().hiddenIds).not.toContain("inner2");
    // Files outside the folder stay hidden — only this folder's subtree is revealed.
    expect(s().hiddenIds).toContain("sibling");
  });

  it("setFilesBulkForLeaf toggles bulk layer; revealAllForLeaf clears all", () => {
    s().setFilesBulkForLeaf("leaf1", true);
    expect(s().viewSettings["leaf1"].hideLayers!.filesBulkActive).toBe(true);
    s().revealAllForLeaf("leaf1");
    expect(s().viewSettings["leaf1"].hideLayers).toEqual({ individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] });
  });

  it("hideNodesForLeaf aliases hideForLeaf", () => {
    s().hideNodesForLeaf("leaf1", ["sibling"]);
    expect(s().viewSettings["leaf1"].hideLayers!.individual).toContain("sibling");
  });
});

describe("collapseSlice", () => {
  it("toggleCollapseForLeaf collapses then expands", () => {
    s().toggleCollapseForLeaf("leaf1", "outer");
    expect(s().viewSettings["leaf1"].collapsedFolderIds).toContain("outer");
    s().toggleCollapseForLeaf("leaf1", "outer");
    expect(s().viewSettings["leaf1"].collapsedFolderIds ?? []).not.toContain("outer");
  });

  it("is view-only: the shared node keeps the geometry other views draw from", () => {
    const before = s().nodes.find((n) => n.id === "outer")!;
    s().toggleCollapseForLeaf("leaf1", "outer");
    const after = s().nodes.find((n) => n.id === "outer")!;
    // Untouched by identity — no height cleared, no pill measurement pinned.
    expect(after).toBe(before);
    expect(after.style?.height).toBe(120);
    // Only the toggling leaf's own settings change.
    expect(s().viewSettings["leaf2"]?.collapsedFolderIds ?? []).not.toContain("outer");
  });
});

describe("panelUiSlice (per-view positions)", () => {
  it("stores the dragged card's position for the view", () => {
    s().setNodePositionsBatch("leaf1", [{ id: "outer", pos: { x: 12, y: 34 } }]);
    expect(s().viewSettings["leaf1"].positions).toEqual({ outer: { x: 12, y: 34 } });
  });

  it("a report of the position the view already holds writes nothing (#281)", () => {
    s().setNodePositionsBatch("leaf1", [{ id: "outer", pos: { x: 12, y: 34 } }]);
    const before = s().viewSettings;
    // React Flow re-reports a position when it re-adopts the node array the
    // canvas pushed; writing it again restarted the whole store → canvas →
    // React Flow round trip on a value that did not move.
    s().setNodePositionsBatch("leaf1", [{ id: "outer", pos: { x: 12, y: 34 } }]);
    expect(s().viewSettings).toBe(before);
  });

  it("a mixed batch keeps the cards that moved and leaves the rest alone", () => {
    s().setNodePositionsBatch("leaf1", [
      { id: "outer", pos: { x: 1, y: 1 } },
      { id: "inner1", pos: { x: 2, y: 2 } },
    ]);
    s().setNodePositionsBatch("leaf1", [
      { id: "outer", pos: { x: 1, y: 1 } },
      { id: "inner1", pos: { x: 9, y: 9 } },
    ]);
    expect(s().viewSettings["leaf1"].positions).toEqual({
      outer: { x: 1, y: 1 },
      inner1: { x: 9, y: 9 },
    });
  });
});

describe("selectionSlice", () => {
  it("keeps the id list canonical and leaves the store's nodes untouched", () => {
    // The canvas stamps `selected` onto the RF node array from this list
    // (viewState.stampSelection), so a selection write must not rewrite every
    // node in the store: that replaced 30k node objects per click, which
    // invalidated the identity-cached tree index and every card's child memo.
    const nodesBefore = s().nodes;
    const versionBefore = s().selectionVersion;
    s().setSelectedNodeIds(["outer", "sibling"]);
    expect(s().selectedNodeIds).toEqual(["outer", "sibling"]);
    expect(s().nodes).toBe(nodesBefore);
    expect(s().selectionVersion).toBe(versionBefore + 1);
  });

  it("a selection change is not a graphVersion change", () => {
    // graphVersion means "the graph's contents changed" and makes the canvas
    // rebuild its whole node/edge arrays — a selection must never trigger that.
    const graphVersionBefore = s().graphVersion;
    s().setSelectedNodeIds(["outer"]);
    expect(s().graphVersion).toBe(graphVersionBefore);
  });

  it("a selection write that changes nothing is a no-op", () => {
    s().setSelectedNodeIds(["outer"]);
    const { selectionVersion } = s();
    s().setSelectedNodeIds(["outer"]);
    expect(s().selectionVersion).toBe(selectionVersion);
  });

  it("setSelectionForLeaf / setActiveLeaf round-trip per-leaf selection", () => {
    s().setSelectionForLeaf("leaf1", ["outer"]);
    expect(s().activeLeafId).toBe("leaf1");
    s().setSelectionForLeaf("leaf2", ["sibling"]);
    s().setActiveLeaf("leaf1");
    expect(s().selectedNodeIds).toEqual(["outer"]);
  });

  it("switching leaves bumps the selection version, not the graph version", () => {
    s().setSelectionForLeaf("leaf1", ["outer"]);
    const graphVersionBefore = s().graphVersion;
    const selectionVersionBefore = s().selectionVersion;
    s().setActiveLeaf("leaf2");
    expect(s().selectionVersion).toBe(selectionVersionBefore + 1);
    expect(s().graphVersion).toBe(graphVersionBefore);
  });

  it("a leaf re-reporting what it already paints writes NOTHING — not even activeLeafId (#285)", () => {
    // React Flow re-reports a view's selection whenever its nodes are re-pushed.
    // Treating that echo as a claim on the shared selection let two mounted
    // canvases trade `activeLeafId` back and forth — each flip makes the other
    // view inactive, which re-pushes its edges, which makes it report again —
    // until React hit its 50-nested-update limit and tore the tree down when
    // splitting a canvas with a card selected. Activation is an input event now
    // (GraphCanvas activates on pointer-down), so an echo must be inert.
    s().setSelectionForLeaf("leaf1", ["outer"]);
    s().setSelectionForLeaf("leaf2", ["outer"]); // leaf2 takes the shared list
    expect(s().activeLeafId).toBe("leaf2");
    const versionBefore = s().selectionVersion;
    const sharedBefore = s().selectedNodeIds;
    s().setSelectionForLeaf("leaf1", ["outer"]); // leaf1's canvas echoes it back
    expect(s().activeLeafId).toBe("leaf2"); // no flip
    expect(s().selectedNodeIds).toBe(sharedBefore); // no shared write
    expect(s().selectionVersion).toBe(versionBefore); // no rebuild

    // ...and the gesture still activates a view, through input:
    s().setActiveLeaf("leaf1");
    expect(s().activeLeafId).toBe("leaf1");
    expect(s().selectedNodeIds).toEqual(["outer"]);
  });

  it("a leaf re-reporting a DIFFERENT selection still bumps the version", () => {
    s().setSelectionForLeaf("leaf1", ["outer"]);
    s().setSelectionForLeaf("leaf2", ["outer"]);
    const versionBefore = s().selectionVersion;
    s().setSelectionForLeaf("leaf1", ["outer", "sibling"]);
    expect(s().selectionVersion).toBe(versionBefore + 1);
  });

  it("a background leaf's report never disturbs the view that owns the shared list (#285)", () => {
    useGraphStore.setState({ leafSelections: {}, activeLeafId: null });
    s().setSelectionForLeaf("leaf1", ["outer"]);
    s().setActiveLeaf("leaf2"); // shared list becomes leaf2's (empty)
    const versionBefore = s().selectionVersion;
    const sharedBefore = s().selectedNodeIds;
    const activeBefore = s().activeLeafId;
    // leaf1 still paints ["outer"] (its own entry), so React Flow re-reports it
    // whenever leaf1's nodes are re-pushed. That is an echo of what leaf1 holds,
    // not a bid for ownership: the shared list belongs to the active view.
    s().setSelectionForLeaf("leaf1", ["outer"]);
    expect(s().selectedNodeIds).toBe(sharedBefore); // leaf2's list untouched
    expect(s().activeLeafId).toBe(activeBefore); // no ownership steal
    expect(s().selectionVersion).toBe(versionBefore); // nothing rebuilt
  });

  it("an empty report from a leaf that owns nothing is ignored (#285)", () => {
    useGraphStore.setState({ leafSelections: {}, activeLeafId: null, selectedNodeIds: [] });
    s().setSelectionForLeaf("leaf1", ["outer"]);
    const versionBefore = s().selectionVersion;
    // A brand-new leaf's canvas re-derives an empty selection on mount:
    s().setSelectionForLeaf("leaf2", []);
    expect(s().activeLeafId).toBe("leaf1");
    expect(s().selectedNodeIds).toEqual(["outer"]);
    expect(s().selectionVersion).toBe(versionBefore);
    // ...and the same once the leaf has been seeded an empty entry (the split
    // path seeds one before the canvas mounts).
    useGraphStore.setState({ leafSelections: { leaf1: ["outer"], leaf2: [] } });
    s().setSelectionForLeaf("leaf2", []);
    expect(s().activeLeafId).toBe("leaf1");
    expect(s().selectionVersion).toBe(versionBefore);
  });

  it("splitting gives the new leaf its own empty selection, not the shared one (#285)", () => {
    useGraphStore.setState({ tier: "pro", leafSelections: {}, activeLeafId: null, selectedNodeIds: [] });
    const a = treeModule.makeLeaf(treeModule.createArea("graph"), true);
    const b = treeModule.makeLeaf(treeModule.createArea("graph"));
    s().setPanelTree(treeModule.makeSplit("h", a, b));
    s().setSelectionForLeaf(a.area.id, ["outer"]); // a owns the shared selection
    const versionBefore = s().selectionVersion;

    // The gesture: a third leaf appears.
    const c = treeModule.makeLeaf(treeModule.createArea("graph"));
    s().setPanelTree(treeModule.makeSplit("v", treeModule.makeSplit("h", a, b), c));

    expect(s().leafSelections[a.area.id]).toEqual(["outer"]); // preserved
    expect(s().leafSelections[c.area.id]).toEqual([]); // seeded EMPTY — no borrow
    expect(s().selectionVersion).toBe(versionBefore); // no selection churn
    expect(s().activeLeafId).toBe(a.area.id); // activation untouched
  });

  it("joining a leaf drops its selection and hands activation to the survivor (#285)", () => {
    useGraphStore.setState({ tier: "pro", leafSelections: {}, activeLeafId: null, selectedNodeIds: [] });
    const a = treeModule.makeLeaf(treeModule.createArea("graph"), true);
    const b = treeModule.makeLeaf(treeModule.createArea("graph"));
    s().setPanelTree(treeModule.makeSplit("h", a, b));
    s().setSelectionForLeaf(b.area.id, ["outer"]); // b owns
    expect(s().activeLeafId).toBe(b.area.id);

    s().joinArea(b.area.id); // b is merged away

    expect(s().leafSelections[b.area.id]).toBeUndefined(); // pruned
    expect(s().activeLeafId).not.toBe(b.area.id); // no dangling owner
    expect(s().activeLeafId).not.toBeNull();
    expect(s().selectedNodeIds).toEqual(s().leafSelections[s().activeLeafId!] ?? []);
  });
});

describe("reflowVersion (auto-fit after a direction change or Organize, #286)", () => {
  const v = () => s().reflowVersion;

  it("a global direction change re-flows every canvas", () => {
    useGraphStore.setState({ reflowVersion: 0, reflowTarget: null });
    s().setDirection("LR");
    expect(s().reflowVersion).toBe(1);
    expect(s().reflowTarget).toBeNull(); // null = every mounted canvas fits
  });

  it("a per-view direction change re-flows only that view", () => {
    useGraphStore.setState({ reflowVersion: 0, reflowTarget: null });
    s().updateViewSettings("leafA", { direction: "LR" });
    expect(s().reflowVersion).toBe(1);
    expect(s().reflowTarget).toBe("leafA");

    const before = v();
    s().setViewSetting("leafB", "direction", "TB");
    expect(s().reflowVersion).toBe(before + 1);
    expect(s().reflowTarget).toBe("leafB");
  });

  it("a view setting that is not a direction change does not re-flow", () => {
    useGraphStore.setState({ reflowVersion: 0, reflowTarget: null });
    s().setViewSetting("leafA", "showFiles", false);
    s().updateViewSettings("leafA", { edgeStyle: "straight" });
    expect(s().reflowVersion).toBe(0);
  });

  it("Organize re-flows the target view; Organize-all re-flows every canvas", () => {
    useGraphStore.setState({ reflowVersion: 0, reflowTarget: null, tier: "pro" });
    s().organize("leafA");
    expect(s().reflowVersion).toBe(1);
    expect(s().reflowTarget).toBe("leafA");

    s().organizeAll();
    expect(s().reflowVersion).toBe(2);
    expect(s().reflowTarget).toBeNull();

    s().organize();
    expect(s().reflowVersion).toBe(3);
    expect(s().reflowTarget).toBeNull();
  });

  it("relayouts that the user did not ask for never bump the re-flow", () => {
    // graphVersion drives the canvas rebuilds; fitting on those made the
    // viewport jump while the user was working (cut/paste, parent/unparent).
    useGraphStore.setState({ reflowVersion: 0, reflowTarget: null });
    s().relayout();
    s().setEdgeStyle("straight");
    expect(s().reflowVersion).toBe(0);
  });
});

describe("nodeName shared helper", () => {
  it("fullName appends extension", async () => {
    const { fullName } = await import("./nodeName");
    expect(fullName({ data: { label: "a" } })).toBe("a");
    expect(fullName({ data: { label: "a", extension: "ts" } })).toBe("a.ts");
  });
});

describe("searchSlice (category filter hide layer)", () => {
  // Categories come off node.data.category (see categorize.ts), which seedTree
  // leaves unset, so this block re-seeds the same shape with categories.
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [
        makeNode("root", "folder", { isRoot: true }),
        makeNode("outer", "folder"),
        makeNode("inner1", "file", { category: "code" }),
        makeNode("inner2", "file", { category: "image" }),
        makeNode("sibling", "file", { category: "code" }),
      ],
      categoryFilter: [],
      categoryHiddenIds: [],
      hiddenIds: [],
      independentlyHiddenIds: [],
    });
  });

  it("hides exactly the files outside the selected categories", () => {
    s().setCategoryFilter(["code"]);
    expect(s().hiddenIds).toEqual(["inner2"]);
    expect(s().categoryHiddenIds).toEqual(["inner2"]);
  });

  it("preserves a manual hide overlapping the category-hidden set", () => {
    s().toggleHidden("inner2"); // manual hide on an image file
    s().setCategoryFilter(["code"]); // category layer hides that very node
    expect(s().hiddenIds).toEqual(expect.arrayContaining(["inner2"]));

    s().setCategoryFilter(["image"]); // swap: the code files go, inner2 returns
    expect(s().hiddenIds).toEqual(expect.arrayContaining(["inner1", "inner2", "sibling"]));

    s().clearCategoryFilter(); // clearing must not reveal a manual hide
    expect(s().hiddenIds).toEqual(["inner2"]);
  });

  it("records the category filter so undo restores the chip and the hidden set", () => {
    const pastBefore = s().past.length;
    s().setCategoryFilter(["code"]);
    expect(s().past.length).toBe(pastBefore + 1);

    s().undo();
    expect(s().categoryFilter).toEqual([]);
    expect(s().categoryHiddenIds).toEqual([]);
    expect(s().hiddenIds).toEqual([]);
  });
});
describe("dialogsSlice", () => {
  beforeEach(() => {
    useGraphStore.setState({
      tutorialBeginnerDone: [],
      tutorialDismissed: false,
      tutorialDemoStep: 0,
      rightClickDetected: false,
    });
    localStorage.clear();
  });

  it("markTutorialBeginnerStep dedupes and persists the checklist", () => {
    s().markTutorialBeginnerStep("load-sample");
    s().markTutorialBeginnerStep("load-sample");
    s().markTutorialBeginnerStep("search");
    expect(s().tutorialBeginnerDone).toEqual(["load-sample", "search"]);
    expect(JSON.parse(localStorage.getItem(TUTORIAL_BEGINNER_DONE_KEY)!)).toEqual(["load-sample", "search"]);
  });

  it("unmarkTutorialBeginnerStep drops the step and persists", () => {
    s().markTutorialBeginnerStep("load-sample");
    s().markTutorialBeginnerStep("search");
    s().unmarkTutorialBeginnerStep("load-sample");
    expect(s().tutorialBeginnerDone).toEqual(["search"]);
    expect(JSON.parse(localStorage.getItem(TUTORIAL_BEGINNER_DONE_KEY)!)).toEqual(["search"]);
    s().unmarkTutorialBeginnerStep("never-marked"); // no-op, no duplicate write
    expect(s().tutorialBeginnerDone).toEqual(["search"]);
  });

  it("setTutorialDismissed persists, resetTutorial clears state and storage", () => {
    s().setTutorialDismissed();
    expect(s().tutorialDismissed).toBe(true);
    expect(localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBe("true");

    s().markTutorialBeginnerStep("search");
    s().setTutorialDemoStep(3);
    s().setRightClickDetected();
    s().resetTutorial();

    expect(s().tutorialDismissed).toBe(false);
    expect(s().tutorialBeginnerDone).toEqual([]);
    expect(s().tutorialDemoStep).toBe(0);
    expect(s().rightClickDetected).toBe(false);
    expect(localStorage.getItem(TUTORIAL_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(TUTORIAL_BEGINNER_DONE_KEY)).toBeNull();
  });

  it("isAnyDialogOpen gates every *Open flag except the search panel and sidebar", () => {
    // Derived from live state, so a dialog added without updating the gate fails here.
    // Boolean-only: the `set*Open` setters end in "Open" too.
    const flags = Object.keys(s()).filter((k) => k.endsWith("Open") && typeof s()[k] === "boolean");
    const excluded = ["searchOpen", "sidebarOpen"]; // transient chrome (PR #119)
    expect(flags.length).toBeGreaterThan(excluded.length);

    expect(isAnyDialogOpen(s())).toBe(false);
    for (const flag of excluded) {
      expect(isAnyDialogOpen({ ...s(), [flag]: true })).toBe(false);
    }
    for (const flag of flags.filter((f) => !excluded.includes(f))) {
      expect(isAnyDialogOpen({ ...s(), [flag]: true })).toBe(true);
    }
  });
});
