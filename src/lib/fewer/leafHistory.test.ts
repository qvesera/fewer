import { describe, expect, it, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { dropLeafHistory } from "@/store/slices/historySlice";
import { defaultTree, leafList, splitLeaf } from "./panelTree";
import { leafPositionsFor, leafMoveOrigin } from "./history";
import type { FewerNode } from "./types";
import type { HistoryEntry } from "@/store/slices/types";

const s = () => useGraphStore.getState();

function makeNode(id: string, x = 0, y = 0): FewerNode {
  return {
    id,
    type: "folder",
    position: { x, y },
    data: { label: id, path: `/${id}`, type: "file", parentId: null },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

/** Minimal valid rename op so undo/redo exercise the real op handlers. */
function renameOp(tag = "a"): HistoryEntry["ops"][number] {
  return { type: "rename", nodeId: "a", oldLabel: `${tag}`, newLabel: `${tag}-renamed` };
}

function entry(tag = "a"): HistoryEntry {
  return { ops: [renameOp(tag)], timestamp: 1 };
}

beforeEach(() => {
  useGraphStore.setState({
    nodes: [makeNode("a"), makeNode("b")],
    edges: [],
    past: [],
    future: [],
    leafHistories: {},
    activeLeafId: null,
    viewSettings: {},
    leafSelections: {},
  });
});

describe("per-leaf undo stacks", () => {
  it("routes an op tagged with a non-active leaf into that leaf's stored stack", () => {
    s().setActiveLeaf("leaf-graph");
    s().pushOp(renameOp("live"));
    s().pushOp(renameOp("other"), "leaf-other");

    expect(s().past).toHaveLength(1);
    expect(s().past[0].ops[0]).toEqual(renameOp("live"));
    expect(s().leafHistories["leaf-other"].past).toHaveLength(1);
    expect(s().leafHistories["leaf-other"].past[0].ops[0]).toEqual(renameOp("other"));
  });

  it("swaps the live stacks when the active leaf changes", () => {
    s().setActiveLeaf("leaf-graph");
    s().pushOp(renameOp("in-graph"));

    s().setActiveLeaf("leaf-layout");
    expect(s().past).toHaveLength(0); // fresh leaf, its own empty history
    s().pushOp(renameOp("in-layout"));
    expect(s().past).toHaveLength(1);

    s().setActiveLeaf("leaf-graph");
    expect(s().past).toHaveLength(1);
    expect(s().past[0].ops[0]).toEqual(renameOp("in-graph"));
    expect(s().leafHistories["leaf-layout"].past).toHaveLength(1);
  });

  it("undo only touches the active leaf's stack", () => {
    s().setActiveLeaf("leaf-graph");
    s().pushOp(renameOp("in-graph"));
    s().setActiveLeaf("leaf-layout");
    s().pushOp(renameOp("in-layout"));

    s().undo();
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(1);

    s().setActiveLeaf("leaf-graph");
    expect(s().past).toHaveLength(1);
    expect(s().future).toHaveLength(0);
  });

  it("rides ops recorded before any leaf was active into the first activated leaf", () => {
    s().pushOp(renameOp("pre-leaf")); // activeLeafId still null
    expect(s().past).toHaveLength(1);

    s().setActiveLeaf("leaf-graph");
    expect(s().past).toHaveLength(1);
    expect(s().past[0].ops[0]).toEqual(renameOp("pre-leaf"));
  });

  it("caps each leaf at 50 steps", () => {
    s().setActiveLeaf("leaf-graph");
    for (let i = 0; i < 55; i++) s().pushOp(renameOp(`live-${i}`));
    expect(s().past).toHaveLength(50);
    expect(s().past[0].ops[0]).toEqual(renameOp("live-5"));

    for (let i = 0; i < 55; i++) s().pushOp(renameOp(`stored-${i}`), "leaf-stored");
    expect(s().leafHistories["leaf-stored"].past).toHaveLength(50);
    expect(s().leafHistories["leaf-stored"].past[0].ops[0]).toEqual(renameOp("stored-5"));
  });

  it("clears a leaf's redo stack when a new op lands in it", () => {
    s().setActiveLeaf("leaf-graph");
    s().pushOp(renameOp("first"));
    s().undo();
    expect(s().future).toHaveLength(1);

    s().pushOp(renameOp("second"));
    expect(s().future).toHaveLength(0);
    expect(s().past).toHaveLength(1);
  });
});

describe("undo restores per-leaf positions (panel-mode drag fix)", () => {
  it("rewrites viewSettings[leafId].positions on undo and redo, never the shared seed", () => {
    useGraphStore.setState({
      nodes: [makeNode("a", 50, 60)],
      viewSettings: { "leaf-graph": { positions: { a: { x: 300, y: 300 } } } },
    });
    s().setActiveLeaf("leaf-graph");
    // Exactly what GraphCanvas's drag-stop handler calls now.
    s().recordDragMoves([{ nodeId: "a", from: { x: 10, y: 10 }, to: { x: 300, y: 300 } }], "leaf-graph");
    expect(s().past).toHaveLength(1);

    s().undo();
    expect(s().viewSettings["leaf-graph"].positions.a).toEqual({ x: 10, y: 10 });
    // Shared position is the layout seed this view never wrote, so undo has to
    // leave it alone — relocating it moved the card in every other view.
    expect(s().nodes[0].position).toEqual({ x: 50, y: 60 });

    s().redo();
    expect(s().viewSettings["leaf-graph"].positions.a).toEqual({ x: 300, y: 300 });
    expect(s().nodes[0].position).toEqual({ x: 50, y: 60 });
  });

  it("keeps a second view (which renders shared positions) put through undo + redo", () => {
    // The reported bug: drag in the primary view, hit undo, and the same card in
    // a split sibling view jumps to a position it has never been in — because
    // undo relocated shared nodes to the primary view's private coordinate.
    useGraphStore.setState({
      nodes: [makeNode("a", 50, 60)],
      viewSettings: { "leaf-primary": { positions: { a: { x: 900, y: 900 } } } },
    });
    s().setActiveLeaf("leaf-primary");
    s().recordDragMoves([{ nodeId: "a", from: { x: 900, y: 900 }, to: { x: 1200, y: 400 } }], "leaf-primary");

    s().undo();
    expect(s().nodes[0].position).toEqual({ x: 50, y: 60 }); // sibling view's card
    expect(s().viewSettings["leaf-primary"].positions.a).toEqual({ x: 900, y: 900 });
    expect(s().viewSettings["leaf-secondary"]).toBeUndefined();

    s().redo();
    expect(s().nodes[0].position).toEqual({ x: 50, y: 60 });
    expect(s().viewSettings["leaf-primary"].positions.a).toEqual({ x: 1200, y: 400 });
  });

  it("restores a tagged drag even when the recording leaf's map is gone", () => {
    useGraphStore.setState({ nodes: [makeNode("a", 300, 300)], viewSettings: {} });
    s().setActiveLeaf("leaf-shared");
    s().recordDragMoves([{ nodeId: "a", from: { x: 10, y: 10 }, to: { x: 300, y: 300 } }], "leaf-shared");

    s().undo();
    // Only the moved card gets an entry — everything else still paints shared.
    expect(s().viewSettings["leaf-shared"].positions).toEqual({ a: { x: 10, y: 10 } });
    expect(s().nodes[0].position).toEqual({ x: 300, y: 300 });
  });

  it("still relocates shared positions for an untagged (shared-space) drag", () => {
    useGraphStore.setState({ nodes: [makeNode("a", 300, 300)], viewSettings: {} });
    s().setActiveLeaf("leaf-graph");
    s().recordDragMoves([{ nodeId: "a", from: { x: 10, y: 10 }, to: { x: 300, y: 300 } }]);

    s().undo();
    expect(s().nodes[0].position).toEqual({ x: 10, y: 10 });
  });

  it("does not record a click without movement as a history step", () => {
    s().setActiveLeaf("leaf-graph");
    s().recordDragMoves([{ nodeId: "a", from: { x: 5, y: 5 }, to: { x: 5, y: 5 } }], "leaf-graph");
    expect(s().past).toHaveLength(0);
  });
});

describe("closed leaves drop their stacks", () => {
  it("dropLeafHistory removes only the target stack", () => {
    const state = { leafHistories: { gone: { past: [entry()], future: [] }, keep: { past: [entry()], future: [] } } };
    const patch = dropLeafHistory(state as never, "gone");
    expect(patch.leafHistories).toEqual({ keep: state.leafHistories.keep });
    expect(dropLeafHistory({ leafHistories: {} } as never, "gone")).toEqual({});
  });

  it("joinArea drops the joined leaf's stack", () => {
    const base = defaultTree();
    const tree = splitLeaf(base, base.area.id, "h");
    const doomed = leafList(tree).find((l) => !l.primary)!;
    useGraphStore.setState({
      panelTree: tree,
      leafHistories: { [doomed.area.id]: { past: [entry()], future: [] }, keep: { past: [entry()], future: [] } },
    });

    s().joinArea(doomed.area.id);

    expect(s().leafHistories[doomed.area.id]).toBeUndefined();
    expect(s().leafHistories.keep).toBeDefined();
  });
});

describe("leafPositionsFor", () => {
  const moves = { type: "move-positions" as const, moves: [{ nodeId: "a", from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }] };

  it("returns null without a positions map or move ops", () => {
    expect(leafPositionsFor(undefined, [moves], "from")).toBeNull();
    expect(leafPositionsFor({}, [], "from")).toBeNull();
    expect(leafPositionsFor({ a: { x: 9, y: 9 } }, [renameOp()], "from")).toBeNull();
  });

  it("picks from for undo and to for redo", () => {
    const positions = { a: { x: 9, y: 9 }, b: { x: 0, y: 0 } };
    expect(leafPositionsFor(positions, [moves], "from")).toEqual({ a: { x: 1, y: 1 }, b: { x: 0, y: 0 } });
    expect(leafPositionsFor(positions, [moves], "to")).toEqual({ a: { x: 2, y: 2 }, b: { x: 0, y: 0 } });
  });

  it("keeps the earliest position when one node moved twice in a batch", () => {
    const ops = [
      { type: "move-positions" as const, moves: [{ nodeId: "a", from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }] },
      { type: "move-positions" as const, moves: [{ nodeId: "a", from: { x: 2, y: 2 }, to: { x: 3, y: 3 } }] },
    ];
    expect(leafPositionsFor({ a: { x: 3, y: 3 } }, ops, "from")).toEqual({ a: { x: 1, y: 1 } });
    expect(leafPositionsFor({ a: { x: 0, y: 0 } }, ops, "to")).toEqual({ a: { x: 3, y: 3 } });
  });
});

describe("leafMoveOrigin", () => {
  it("finds the leaf that recorded the drag", () => {
    const tagged = {
      type: "move-positions" as const,
      moves: [{ nodeId: "a", from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }],
      leafId: "leaf-graph",
    };
    expect(leafMoveOrigin([renameOp(), tagged])).toBe("leaf-graph");
  });

  it("is null for shared-space drags and non-drag batches", () => {
    const untagged = { type: "move-positions" as const, moves: [{ nodeId: "a", from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }] };
    expect(leafMoveOrigin([untagged])).toBeNull();
    expect(leafMoveOrigin([renameOp()])).toBeNull();
    expect(leafMoveOrigin([])).toBeNull();
  });
});
