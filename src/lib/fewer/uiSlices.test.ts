import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge } from "./types";

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
});

describe("selectionSlice", () => {
  it("setSelectedNodeIds mirrors per-node selected flags", () => {
    s().setSelectedNodeIds(["outer", "sibling"]);
    expect(s().selectedNodeIds).toEqual(["outer", "sibling"]);
    expect(s().nodes.find((n) => n.id === "outer")?.selected).toBe(true);
    expect(s().nodes.find((n) => n.id === "root")?.selected).toBe(false);
  });

  it("setSelectionForLeaf / setActiveLeaf round-trip per-leaf selection", () => {
    s().setSelectionForLeaf("leaf1", ["outer"]);
    expect(s().activeLeafId).toBe("leaf1");
    s().setSelectionForLeaf("leaf2", ["sibling"]);
    s().setActiveLeaf("leaf1");
    expect(s().selectedNodeIds).toEqual(["outer"]);
  });
});

describe("nodeName shared helper", () => {
  it("fullName appends extension", async () => {
    const { fullName } = await import("./nodeName");
    expect(fullName({ data: { label: "a" } })).toBe("a");
    expect(fullName({ data: { label: "a", extension: "ts" } })).toBe("a.ts");
  });
});
