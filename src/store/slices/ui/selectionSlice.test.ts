import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";

// bun's src process ships no DOM; graphStore's persist layer expects the
// window/localStorage pair (same harness as src/lib/fewer/uiSlices.test.ts).
function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
}
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = makeStorage();

const s = () => useGraphStore.getState();

beforeEach(() => {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    viewSettings: {},
    // selectionSlice state — reset per test so echoes are deterministic
    selectedNodeIds: [],
    selectedGroupIds: [],
    leafSelections: {},
    activeLeafId: null,
    selectionVersion: 0,
    hoverHighlightIds: [],
    renamingId: null,
    renameSource: null,
    zoomToNode: null,
    zoomToNodeIds: null,
    mousePosition: null,
    pastePosition: null,
    pendingCreatePosition: null,
    focusedNodeId: null,
  });
});

describe("setSelectedNodeIds", () => {
  it("a real change writes the selection, bumps the version and mirrors into the active leaf", () => {
    useGraphStore.setState({ activeLeafId: "leafA" });
    s().setSelectedNodeIds(["n1"]);
    expect(s().selectedNodeIds).toEqual(["n1"]);
    expect(s().selectionVersion).toBe(1);
    expect(s().leafSelections["leafA"]).toEqual(["n1"]);
  });

  it("an identical re-select writes nothing (no version bump, no mirror churn)", () => {
    useGraphStore.setState({ activeLeafId: "leafA", selectedNodeIds: ["n1"], selectionVersion: 3, leafSelections: { leafA: ["n1"] } });
    s().setSelectedNodeIds(["n1"]);
    expect(s().selectionVersion).toBe(3);
    expect(s().leafSelections).toEqual({ leafA: ["n1"] });
  });

  it("without an active leaf nothing is mirrored into leafSelections", () => {
    s().setSelectedNodeIds(["n2"]);
    expect(s().selectedNodeIds).toEqual(["n2"]);
    expect(s().leafSelections).toEqual({});
  });

  it("mutual exclusion: selecting cards clears selected groups …", () => {
    useGraphStore.setState({ selectedGroupIds: ["g1"] });
    s().setSelectedNodeIds(["n1"]);
    expect(s().selectedGroupIds).toEqual([]);
  });

  it("… and so does an empty list (Escape/blur clearing), even when cards were already empty", () => {
    useGraphStore.setState({ selectedGroupIds: ["g1"], selectedNodeIds: [] });
    s().setSelectedNodeIds([]);
    expect(s().selectedGroupIds).toEqual([]);
    expect(s().selectionVersion).toBe(0); // the card echo itself wrote nothing
  });
});

describe("setSelectedGroupIds", () => {
  it("selecting a group clears the card selection and the per-leaf mirror, bumping the version", () => {
    useGraphStore.setState({ selectedNodeIds: ["n1"], leafSelections: { leafA: ["n1"] }, selectionVersion: 2 });
    s().setSelectedGroupIds(["g1"]);
    expect(s().selectedGroupIds).toEqual(["g1"]);
    expect(s().selectedNodeIds).toEqual([]);
    expect(s().leafSelections).toEqual({});
    expect(s().selectionVersion).toBe(3);
  });

  it("clearing groups does NOT touch the card selection (only ids.length > 0 excludes)", () => {
    useGraphStore.setState({ selectedGroupIds: ["g1"], selectedNodeIds: ["n1"], selectionVersion: 4 });
    s().setSelectedGroupIds([]);
    expect(s().selectedGroupIds).toEqual([]);
    expect(s().selectedNodeIds).toEqual(["n1"]);
    expect(s().selectionVersion).toBe(5);
  });

  it("an identical group re-select is a no-op", () => {
    useGraphStore.setState({ selectedGroupIds: ["g1"], selectionVersion: 7 });
    s().setSelectedGroupIds(["g1"]);
    expect(s().selectionVersion).toBe(7);
  });
});

describe("setSelectionForLeaf", () => {
  it("a first report writes the leaf, activates it and bumps the version", () => {
    s().setSelectionForLeaf("leafA", ["n1"]);
    expect(s().leafSelections.leafA).toEqual(["n1"]);
    expect(s().activeLeafId).toBe("leafA");
    expect(s().selectedNodeIds).toEqual(["n1"]);
    expect(s().selectionVersion).toBe(1);
  });

  it("an echo of the current leaf selection writes nothing (the #285 loop guard)", () => {
    useGraphStore.setState({ leafSelections: { leafA: ["n1"] }, activeLeafId: "leafA", selectedNodeIds: ["n1"], selectionVersion: 5 });
    s().setSelectionForLeaf("leafA", ["n1"]);
    expect(s().selectionVersion).toBe(5);
    expect(s().activeLeafId).toBe("leafA");
  });

  it("an empty report from a view that owns nothing is ignored — it must not steal activation", () => {
    useGraphStore.setState({ leafSelections: { leafB: ["n9"] }, activeLeafId: "leafB", selectionVersion: 2 });
    s().setSelectionForLeaf("leafA", []);
    expect(s().leafSelections.leafA).toBeUndefined();
    expect(s().activeLeafId).toBe("leafB");
    expect(s().selectionVersion).toBe(2);
  });

  it("a different set on the same leaf updates selection, activation and version", () => {
    useGraphStore.setState({ leafSelections: { leafA: ["n1"] }, activeLeafId: "leafA", selectedNodeIds: ["n1"], selectionVersion: 1 });
    s().setSelectionForLeaf("leafA", ["n1", "n2"]);
    expect(s().leafSelections.leafA).toEqual(["n1", "n2"]);
    expect(s().selectedNodeIds).toEqual(["n1", "n2"]);
    expect(s().selectionVersion).toBe(2);
  });
});

describe("setActiveLeaf", () => {
  it("null and same-leaf activations are no-ops", () => {
    useGraphStore.setState({ activeLeafId: "leafA", selectionVersion: 3 });
    s().setActiveLeaf(null);
    s().setActiveLeaf("leafA");
    expect(s().activeLeafId).toBe("leafA");
    expect(s().selectionVersion).toBe(3);
  });

  it("switching leaves swaps in that leaf's selection and bumps the version", () => {
    useGraphStore.setState({ activeLeafId: "leafA", leafSelections: { leafA: ["n1"], leafB: ["n9"] }, selectionVersion: 1 });
    s().setActiveLeaf("leafB");
    expect(s().activeLeafId).toBe("leafB");
    expect(s().selectedNodeIds).toEqual(["n9"]);
    expect(s().selectionVersion).toBe(2);
    // The outgoing leaf's live stacks were parked for it (undo is leaf-scoped).
    expect(s().leafHistories?.leafA).toBeDefined();
  });
});

describe("setRenamingId", () => {
  it("a hidden node zooms to its parent edge's source first", () => {
    useGraphStore.setState({
      hiddenIds: ["inner1"],
      edges: [{ id: "e-outer-inner1", source: "outer", target: "inner1", type: "smoothstep" }] as never,
    });
    s().setRenamingId("inner1", "folder");
    expect(s().renamingId).toBe("inner1");
    expect(s().renameSource).toBe("folder");
    expect(s().zoomToNode?.nodeId).toBe("outer");
  });

  it("a visible node zooms to itself; source defaults to canvas", () => {
    s().setRenamingId("n1");
    expect(s().renameSource).toBe("canvas");
    expect(s().zoomToNode?.nodeId).toBe("n1");
  });

  it("clearing removes the id, the source and the zoom target", () => {
    s().setRenamingId("n1");
    s().setRenamingId(null);
    expect(s().renamingId).toBeNull();
    expect(s().renameSource).toBeNull();
    expect(s().zoomToNode).toBeNull();
  });
});

describe("transient setters", () => {
  it("zoom/mouse/paste/create/focus/hover setters round-trip their values", () => {
    s().setZoomToNode("n7");
    expect(s().zoomToNode?.nodeId).toBe("n7");
    expect(s().zoomToNode?.timestamp).toBeGreaterThan(0);
    s().setZoomToNode(null);
    expect(s().zoomToNode).toBeNull();

    s().setZoomToNodeIds(["a", "b"]);
    expect(s().zoomToNodeIds).toEqual(["a", "b"]);

    s().setMousePosition({ x: 1, y: 2 });
    expect(s().mousePosition).toEqual({ x: 1, y: 2 });
    s().setPastePosition({ x: 3, y: 4 });
    expect(s().pastePosition).toEqual({ x: 3, y: 4 });
    s().setPendingCreatePosition({ x: 5, y: 6 });
    expect(s().pendingCreatePosition).toEqual({ x: 5, y: 6 });

    s().setFocusedNodeId("n8");
    expect(s().focusedNodeId).toBe("n8");
    s().setFocusedNodeId(null);
    expect(s().focusedNodeId).toBeNull();

    s().setHoverHighlight(["h1", "h2"]);
    expect(s().hoverHighlightIds).toEqual(["h1", "h2"]);
    s().setHoverHighlight([]);
    expect(s().hoverHighlightIds).toEqual([]);
  });
});

