import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";

/** Minimal React Flow shapes — see groupsSlice.test.ts for the same node shape. */
function folder(id: string, label: string) {
  return { id, type: "folder", position: { x: 0, y: 0 }, style: { width: 120, height: 40 }, data: { label, path: `/${label}`, type: "folder" } };
}
function file(id: string, label: string) {
  return { id, type: "file", position: { x: 200, y: 0 }, style: { width: 100, height: 30 }, data: { label, path: `/${label}`, type: "file" } };
}
function edge(source: string, target: string) {
  return { id: `${source}->${target}`, source, target };
}

/** Reset the slices core.ts touches; unlisted keys keep the store defaults. */
function resetStore() {
  useGraphStore.setState({
    nodes: [] as never,
    edges: [],
    groups: [],
    hiddenIds: [],
    autoHiddenIds: [],
    independentlyHiddenIds: [],
    revealedFromHidden: [],
    categoryHiddenIds: [],
    viewSettings: {},
    past: [],
    future: [],
    leafHistories: {},
    graphVersion: 0,
    searchQuery: "",
    categoryFilter: [],
    autoRelayout: true,
    reflowVersion: 0,
    reflowTarget: null,
    tier: "guest",
    activeLeafId: null,
  });
}

beforeEach(() => resetStore());

test("setGraph lays out the import, resets graph bookkeeping, and records one bulk-import undo", () => {
  // A previous graph must exist for the history push to fire (pushHistory && nodes.length > 0).
  useGraphStore.setState({
    nodes: [folder("old", "Old")] as never,
    edges: [],
    groups: [{ id: "g-1", label: "Stale", memberIds: ["old"], color: "#fff" }] as never,
    viewSettings: { deadLeaf: { positions: { gone: { x: 1, y: 2 } } } },
    independentlyHiddenIds: ["gone-id"],
    revealedFromHidden: ["gone-id"],
  });

  useGraphStore.getState().setGraph([folder("f1", "F1"), file("c1", "c1")], [edge("f1", "c1")]);

  const s = useGraphStore.getState();
  expect(s.nodes.map((n) => n.id).sort()).toEqual(["c1", "f1"]);
  expect(s.graphVersion).toBe(1);
  expect(s.groups).toEqual([]); // T-145: stale frames never survive a graph swap
  expect(Object.keys(s.viewSettings)).toEqual([]); // pruned to live ids
  expect(s.independentlyHiddenIds).toEqual([]);
  expect(s.revealedFromHidden).toEqual([]);
  expect(s.edges).toHaveLength(1);
  expect(s.edges[0].type).toBeDefined(); // edgeTypeFromStyle applied

  const last = s.past[s.past.length - 1];
  expect(last.ops[0].type).toBe("bulk-import");
});

test("setGraph with pushHistory=false does not push an undo entry", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1")], [], false);
  expect(useGraphStore.getState().past).toHaveLength(0);
});

test("setGraph seeds hidden file ids into the hidden set", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1"), file("c1", "c1")], [edge("f1", "c1")], false, ["c1"]);
  expect(useGraphStore.getState().hiddenIds).toContain("c1");
});

test("setGraph with preservePositions keeps the incoming positions instead of re-laying out", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1"), file("c1", "c1")], [edge("f1", "c1")], false);

  // The plain path would re-place these via layoutGraphSync; preservePositions must not.
  const incoming = { f1: { x: 11, y: 22 }, c1: { x: 33, y: 44 } };
  useGraphStore.setState({ searchQuery: "zzz-no-match" });
  useGraphStore.getState().setGraph(
    [{ ...folder("f1", "F1"), position: incoming.f1 }, { ...file("c1", "c1"), position: incoming.c1 }],
    [edge("f1", "c1")],
    false,
    undefined,
    { preservePositions: true },
  );

  const positions = Object.fromEntries(useGraphStore.getState().nodes.map((n) => [n.id, n.position]));
  expect(positions).toEqual(incoming);
});

test("setGraph styles edges animated on capable tiers only", () => {
  // Set BOTH stroke styles: the animated branch reads edgeAnimatedStrokeStyle,
  // whose default another suite may have overwritten on the shared store.
  useGraphStore.setState({ tier: "free", edgeAnimated: true, edgeAnimatedSelectedOnly: false, edgeAnimatedStrokeStyle: "dashed", edgeStrokeStyle: "dashed" });
  useGraphStore.getState().setGraph([folder("f1", "F1")], [edge("f1", "f1")], false);
  const animated = useGraphStore.getState().edges[0];
  expect(animated.animated).toBe(true);
  expect(animated.style?.strokeDasharray).toBe("8 4");

  useGraphStore.setState({ tier: "guest" });
  useGraphStore.getState().setGraph([folder("f1", "F1")], [edge("f1", "f1")], false);
  expect(useGraphStore.getState().edges[0].animated).toBe(false);
});

test("applyFolderRefresh swaps the subtree, records refresh-subtree, and undo restores it", () => {
  const s0 = useGraphStore.getState();
  s0.setGraph([folder("f1", "F1"), file("c1", "c1"), file("c2", "c2")], [edge("f1", "c1"), edge("f1", "c2")], false);

  const result = useGraphStore.getState().applyFolderRefresh("f1", [file("c3", "c3")], [edge("f1", "c3")]);
  expect(result).toEqual({ added: 1, removed: 2 });

  const s = useGraphStore.getState();
  expect(s.nodes.map((n) => n.id).sort()).toEqual(["c3", "f1"]);
  expect(s.graphVersion).toBe(2);
  const last = s.past[s.past.length - 1];
  expect(last.ops[0].type).toBe("refresh-subtree");

  useGraphStore.getState().undo();
  const undone = useGraphStore.getState();
  expect(undone.nodes.map((n) => n.id).sort()).toEqual(["c1", "c2", "f1"]);
});

test("applyFolderRefresh on an unknown or non-folder node is a no-op", () => {
  useGraphStore.getState().setGraph([file("c1", "c1")], [], false);
  const pastBefore = useGraphStore.getState().past.length;
  const res = useGraphStore.getState().applyFolderRefresh("missing", [file("x", "x")], []);
  expect(res).toEqual({ added: 0, removed: 0 });
  expect(useGraphStore.getState().past).toHaveLength(pastBefore);
  expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(["c1"]);
});

test("applyFolderRefresh with showFiles off hides the refreshed subtree's files", () => {
  useGraphStore.setState({ showFiles: false });
  useGraphStore.getState().setGraph([folder("f1", "F1"), file("c1", "c1")], [edge("f1", "c1")], false);
  useGraphStore.getState().applyFolderRefresh("f1", [file("c3", "c3")], [edge("f1", "c3")]);
  expect(useGraphStore.getState().hiddenIds).toContain("c3");
});

test("relayoutIfAuto honours the autoRelayout gate; empty graph is a no-op", () => {
  useGraphStore.getState().relayout();
  expect(useGraphStore.getState().graphVersion).toBe(0); // nodes.length === 0 early-return

  useGraphStore.getState().setGraph([folder("f1", "F1")], [], false);
  const v = useGraphStore.getState().graphVersion;

  useGraphStore.setState({ autoRelayout: false });
  useGraphStore.getState().relayoutIfAuto();
  expect(useGraphStore.getState().graphVersion).toBe(v);

  useGraphStore.setState({ autoRelayout: true });
  useGraphStore.getState().relayoutIfAuto();
  expect(useGraphStore.getState().graphVersion).toBe(v + 1);
});

test("organize without a leaf reflows the canvas and bumps the fit request", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1")], [], false);
  const v = useGraphStore.getState().graphVersion;
  useGraphStore.getState().organize(null);
  const s = useGraphStore.getState();
  expect(s.graphVersion).toBe(v + 1);
  expect(s.reflowVersion).toBe(1);
  expect(s.reflowTarget).toBeNull();
});

test("organize for a leaf clears that view's positions and bumps the fit for that leaf", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1")], [], false);
  useGraphStore.setState({ viewSettings: { leafA: { positions: { f1: { x: 9, y: 9 } } }, leafB: { positions: { f1: { x: 1, y: 1 } } } } });
  useGraphStore.getState().organize("leafA");
  const s = useGraphStore.getState();
  expect(s.viewSettings.leafA?.positions).toBeUndefined();
  expect(s.viewSettings.leafB?.positions).toBeDefined(); // other views untouched
  expect(s.reflowVersion).toBe(1);
  expect(s.reflowTarget).toBe("leafA");
});

test("organizeAll clears every view's positions, relayouts, and bumps the fit request", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1")], [], false);
  useGraphStore.setState({
    viewSettings: { leafA: { positions: { f1: { x: 9, y: 9 } } }, leafB: { positions: { f1: { x: 1, y: 1 } } } },
  });
  const v = useGraphStore.getState().graphVersion;
  useGraphStore.getState().organizeAll();
  const s = useGraphStore.getState();
  expect(s.viewSettings.leafA?.positions).toBeUndefined();
  expect(s.viewSettings.leafB?.positions).toBeUndefined();
  expect(s.graphVersion).toBeGreaterThan(v); // clearViewPositions bumps per view, then relayout
  expect(s.reflowVersion).toBe(1);
  expect(s.reflowTarget).toBeNull();
});

test("applySearch re-derives nodes with the highlight pass", () => {
  useGraphStore.getState().setGraph([folder("f1", "F1"), file("c1", "c1")], [], false);
  const v = useGraphStore.getState().graphVersion;
  useGraphStore.getState().applySearch();
  expect(useGraphStore.getState().graphVersion).toBe(v + 1);
});
