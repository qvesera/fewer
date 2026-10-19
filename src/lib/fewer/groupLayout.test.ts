import { describe, expect, test } from "bun:test";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  groupBounds,
  groupPill,
  type Group,
} from "./groups";
import {
  collapseToLayoutBlocks,
  collapsedGroupBlocks,
  groupPillNodeId,
  injectGroupPillNodes,
  isCompactLeafRun,
  isGroupPillNodeId,
  pillRectsFromNodes,
  pillsForViewEdges,
} from "./groupLayout";
import { deriveViewLayout, emptyHideLayers, type ResolvedViewSettings } from "./viewState";
import type { FewerEdge, FewerNode } from "./types";

function file(id: string, x = 0, y = 0): FewerNode {
  return {
    id,
    type: "file",
    position: { x, y },
    style: { width: 240, height: 58 },
    data: { label: id, path: `/${id}`, type: "file", extension: "eps", size: 100 },
  } as FewerNode;
}
function folder(id: string, x = 0, y = 0): FewerNode {
  return {
    id,
    type: "folder",
    position: { x, y },
    style: { width: 240, height: 200 },
    data: { label: id, path: `/${id}`, type: "folder" },
  } as FewerNode;
}
function edge(source: string, target: string): FewerEdge {
  return { id: `${source}->${target}`, source, target } as FewerEdge;
}
function group(id: string, memberIds: string[], parentId?: string): Group {
  return { id, title: id, note: "", memberIds, ...(parentId ? { parentId } : {}) };
}

const GLOBAL = {
  direction: "TB" as const,
  hiddenIds: [] as string[],
  fileIds: [] as string[],
};

function resolved(direction: "TB" | "LR" | "BT" | "RL" = "TB"): ResolvedViewSettings {
  return {
    showFiles: true,
    minimapHidden: false,
    edgeStyle: "curved",
    edgeAnimated: false,
    edgeAnimatedSelectedOnly: false,
    edgeStrokeStyle: "solid",
    edgeWidth: 2,
    direction,
    hiddenIds: [],
    collapsedFolderIds: [],
  };
}

describe("collapsedGroupBlocks", () => {
  test("empty when nothing collapses", () => {
    expect(collapsedGroupBlocks([group("g", ["a"])], [])).toEqual([]);
  });

  test("a collapsed ancestor suppresses the nested group's block", () => {
    const groups = [group("p", ["a"]), group("c", ["b"], "p")];
    expect(collapsedGroupBlocks(groups, ["p", "c"]).map((g) => g.id)).toEqual(["p"]);
  });
});

describe("collapseToLayoutBlocks", () => {
  const nodes = [folder("root"), folder("parent"), file("a"), file("b"), file("c")];
  const edges = [edge("root", "parent"), edge("parent", "a"), edge("parent", "b"), edge("parent", "c")];
  const groups = [group("g", ["a", "b"])];

  test("a collapsed group's members become ONE pill-sized synthetic node", () => {
    const { nodes: out, pillNodes } = collapseToLayoutBlocks(nodes, edges, groups, ["g"]);
    const ids = out.map((n) => n.id);
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("b");
    expect(ids).toContain("c");
    const pill = out.find((n) => n.id === groupPillNodeId("g"))!;
    expect(pill).toBeDefined();
    expect(pill.style).toMatchObject({
      width: COLLAPSED_PILL_WIDTH,
      height: COLLAPSED_PILL_HEIGHT,
    });
    // The pill inherits the FIRST member's sort keys so the cluster keeps its
    // place in the sibling order.
    expect(pill.data.label).toBe("a");
    expect(pill.data.extension).toBe("eps");
    // It is a REAL node (T-180): the edge layer attaches to it, so it carries
    // the pill's own RF type and a tie back to the group.
    expect(pill.type).toBe("groupPill");
    expect(pill.data.groupId).toBe("g");
    expect(pill.data.anchor).toBe(false);
    expect(pillNodes.get("g")).toBe(groupPillNodeId("g"));
  });

  test("member edges redirect onto the pill and the duplicates collapse to one", () => {
    const { edges: out } = collapseToLayoutBlocks(nodes, edges, groups, ["g"]);
    const parentToPill = out.filter((e) => e.source === "parent" && e.target === groupPillNodeId("g"));
    expect(parentToPill).toHaveLength(1);
    expect(out.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      `parent->${groupPillNodeId("g")}`,
      "parent->c",
      "root->parent",
    ]);
  });

  test("a member folder with visible children ANCHORS instead of re-parenting them (T-180)", () => {
    // A folder member with content outside the group: compacting would pull the
    // content up a level and re-flow it (the #439 stretch), so the member stays
    // in the layout as invisible geometry and nothing is redirected.
    const withKids = [file("a"), file("child")];
    const kidEdges = [edge("a", "child")];
    const { nodes: out, edges: outEdges, pillNodes, anchored } = collapseToLayoutBlocks(
      withKids, kidEdges, [group("g", ["a"])], ["g"],
    );
    expect(out).toEqual(withKids);
    expect(outEdges).toEqual(kidEdges);
    expect(pillNodes.size).toBe(0);
    expect(anchored.get("g")).toEqual(["a"]);
  });

  test("nothing to collapse → the inputs pass through", () => {
    const { nodes: outNodes, edges: outEdges, pillNodes } = collapseToLayoutBlocks(nodes, edges, groups, []);
    expect(outNodes).toEqual(nodes);
    expect(outEdges).toEqual(edges);
    expect(pillNodes.size).toBe(0);
  });

  test("a group whose members are all gone reserves nothing", () => {
    const { nodes: out, pillNodes } = collapseToLayoutBlocks(nodes, edges, [group("g", ["ghost"])], ["g"]);
    expect(out).toEqual(nodes);
    expect(pillNodes.size).toBe(0);
  });
});

describe("pill nodes (T-180)", () => {
  const nodes = [folder("root"), file("a"), file("b")];
  const edges = [edge("root", "a"), edge("root", "b")];
  const groups = [group("g", ["a", "b"])];

  test("pillRectsFromNodes reads the painted pill node — after every overlay", () => {
    const blocks = collapseToLayoutBlocks(nodes, edges, groups, ["g"]);
    const laid = blocks.nodes.map((n) => ({ ...n, position: { x: 42, y: 7 } }));
    expect(pillRectsFromNodes(laid, groups, ["g"]).get("g")).toEqual({
      x: 42, y: 7, width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT,
    });
    // Nothing collapsed → nothing to target.
    expect(pillRectsFromNodes(laid, groups, []).size).toBe(0);
    expect(isGroupPillNodeId(groupPillNodeId("g"))).toBe(true);
  });

  test("an ANCHOR group gets its pill injected on the members' block, anchored", () => {
    // f is a MEMBER: hidden from the paint, present only in the member source.
    const memberFolder = folder("f", 100, 0);
    const painted = [folder("root", 0, 0), file("kid1", 400, 0), file("kid2", 400, 100)];
    const out = injectGroupPillNodes(painted, [memberFolder], [group("g", ["f"])], ["g"], "TB");
    const pill = out.find((n) => n.id === groupPillNodeId("g"))!;
    expect(pill).toBeDefined();
    expect(pill.type).toBe("groupPill");
    expect(pill.data.anchor).toBe(true);
    expect(pill.position).toEqual(groupPill(groupBounds([memberFolder], ["f"])!, "TB"));
    // The painted cards themselves are untouched.
    expect(out.filter((n) => !isGroupPillNodeId(n.id))).toEqual(painted);
  });

  test("a COMPACT pill arriving from the layout is never injected twice", () => {
    const blocks = collapseToLayoutBlocks(nodes, edges, groups, ["g"]);
    const out = injectGroupPillNodes(blocks.nodes, nodes, groups, ["g"], "TB");
    expect(out.filter((n) => isGroupPillNodeId(n.id))).toHaveLength(1);
  });

  test("no collapsed ids → the node array passes through BY IDENTITY", () => {
    expect(injectGroupPillNodes(nodes, nodes, groups, [], "TB")).toBe(nodes);
    expect(injectGroupPillNodes(nodes, nodes, groups, [], "TB")).toEqual(nodes);
  });

  test("pillsForViewEdges re-points boundary edges at the pill, deduped", () => {
    // parent → members (hidden → remapped, deduped), parent → c (no member:
    // not ours), a → b (internal → self-loop, dropped), a → c (member output).
    const all = [
      edge("root", "a"), edge("root", "b"),
      edge("root", "c"),
      edge("a", "b"),
      edge("a", "c"),
    ];
    const out = pillsForViewEdges(all, groups, ["g"], new Set<string>(), new Set(["root", "c"]));
    const pill = groupPillNodeId("g");
    expect(out.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      `${pill}->c`,
      `root->${pill}`,
    ]);
    // The pill end needs no painted id (it is injected, not a card)…
    expect(out.every((e) => e.id === `${e.source}->${e.target}`)).toBe(true);
    // …but a hidden far end still drops the wire.
    expect(
      pillsForViewEdges([edge("root", "a")], groups, ["g"], new Set(["root"]), new Set<string>()),
    ).toEqual([]);
  });
});

describe("deriveViewLayout reserves a pill slot for a collapsed group (T-179)", () => {
  // root → parent → [a b c d], with [a b] grouped and collapsed. The canvas
  // hands the layout the FULL set (members included — see GraphCanvas
  // layoutInput) and deriveViewLayout drops the members again before painting.
  const nodes = [
    folder("root", 0, 0), folder("parent", 0, 200),
    file("a"), file("b"), file("c"), file("d"),
  ];
  const edges = [
    edge("root", "parent"),
    edge("parent", "a"), edge("parent", "b"), edge("parent", "c"), edge("parent", "d"),
  ];
  const groups = [group("g", ["a", "b"])];
  const raw = { collapsedGroupIds: ["g"], hideLayers: { ...emptyHideLayers(), individual: ["a", "b"] } };

  test("collapse alone now derives a layout", () => {
    expect(deriveViewLayout(nodes, edges, raw, resolved(), GLOBAL, {}, groups)).not.toBeNull();
  });

  test("the pill lands in the VIEW's coordinate space, sized as the pill", () => {
    const out = deriveViewLayout(nodes, edges, raw, resolved("LR"), GLOBAL, {}, groups)!;
    const rect = pillRectsFromNodes(out.nodes, groups, ["g"]).get("g")!;
    expect(rect.width).toBe(COLLAPSED_PILL_WIDTH);
    expect(rect.height).toBe(COLLAPSED_PILL_HEIGHT);
    // LR: a node's x is its depth layer, so the pill sits in the SAME column as
    // the siblings it replaced — never a stray store coordinate far away.
    const c = out.nodes.find((n) => n.id === "c")!;
    expect(rect.x).toBe(c.position.x);
    // …and it is placed by the layout, not at an arbitrary corner.
    expect(Number.isFinite(rect.y)).toBe(true);
  });

  test("the painted nodes keep their members out and the layout compacts", () => {
    const out = deriveViewLayout(nodes, edges, raw, resolved(), GLOBAL, {}, groups)!;
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["c", "d", "parent", "root", groupPillNodeId("g")].sort());
    // No hole: the reserved block is the PILL, so the next sibling sits within a
    // pill + gap of it instead of a full cluster's width away (TB).
    const rect = pillRectsFromNodes(out.nodes, groups, ["g"]).get("g")!;
    const c = out.nodes.find((n) => n.id === "c")!;
    expect(c.position.x - rect.x).toBeLessThan(COLLAPSED_PILL_WIDTH + 200);
    expect(c.position.x).toBeGreaterThan(rect.x);
  });
});

describe("isCompactLeafRun (T-180)", () => {
  const e = (s: string, t: string) => edge(s, t);

  test("leaf cards under one parent compact", () => {
    expect(isCompactLeafRun(["a", "b"], [e("p", "a"), e("p", "b"), e("p", "c")])).toBe(true);
  });
  test("root members (no parent at all) still compact", () => {
    expect(isCompactLeafRun(["a", "b"], [])).toBe(true);
  });
  test("members under TWO parents anchor — the block would have two owners", () => {
    expect(isCompactLeafRun(["a", "c"], [e("p1", "a"), e("p2", "c")])).toBe(false);
  });
  test("a member with children outside the group anchors", () => {
    expect(isCompactLeafRun(["f"], [e("p", "f"), e("f", "kid")])).toBe(false);
  });
  test("an ancestor and its descendant in the same group anchor", () => {
    expect(isCompactLeafRun(["p", "a"], [e("p", "a")])).toBe(false);
  });
  test("an empty membership is never compact", () => {
    expect(isCompactLeafRun([], [e("p", "x")])).toBe(false);
  });
});

describe("anchor mode in deriveViewLayout (T-180)", () => {
  // root → f → [kid1 kid2], with the FOLDER f grouped. Everything about the
  // visible cards must be untouched by collapsing: that is the whole point of
  // anchor mode (the #439 stretch was the re-parented children).
  const nodes = [folder("root", 0, 0), folder("f"), file("kid1"), file("kid2")];
  const edges = [edge("root", "f"), edge("f", "kid1"), edge("f", "kid2")];
  const groups = [group("g", ["f"])];
  const collapsedRaw = { direction: "LR" as const, collapsedGroupIds: ["g"] };

  const run = (raw: Parameters<typeof deriveViewLayout>[2]) =>
    deriveViewLayout(nodes, edges, raw, resolved("LR"), GLOBAL, {}, groups)!;

  test("collapsing a folder-member group moves no visible card and hides the member", () => {
    const base = run({ direction: "LR" });
    const out = run(collapsedRaw);
    expect(out.nodes.some((n) => n.id === "f")).toBe(false);
    expect(out.nodes.filter((n) => n.id !== "f")).toEqual(base.nodes.filter((n) => n.id !== "f"));
  });

  test("the pill rect is the member block's flow-start corner, in view coordinates", () => {
    const laidF = run({ direction: "LR" }).nodes.find((n) => n.id === "f")!;
    const collapsedOut = run(collapsedRaw);
    // The member hides by derivation, so the injection reads it from the LAID
    // set the derivation hands back — same coordinates the visible cards use.
    const withPill = injectGroupPillNodes(collapsedOut.nodes, collapsedOut.members ?? [], groups, ["g"], "LR");
    expect(pillRectsFromNodes(withPill, groups, ["g"]).get("g")).toEqual(
      groupPill(groupBounds([laidF], ["f"])!, "LR"),
    );
  });

  test("the pill inherits the boundary: parent in, children out", () => {
    const out = run(collapsedRaw);
    const pill = groupPillNodeId("g");
    const wires = pillsForViewEdges(
      edges, groups, ["g"], new Set<string>(), new Set(out.nodes.map((n) => n.id)),
    );
    expect(wires.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      `${pill}->kid1`,
      `${pill}->kid2`,
      `root->${pill}`,
    ]);
  });

  test("an anchor-only collapse never forces a layout pass (no card jump)", () => {
    // The folder member already occupies its slot in the shared layout: with no
    // other divergence the view paints the store's positions untouched — and
    // the pill + its wires still derive from that paint, no pass required.
    const out = deriveViewLayout(nodes, edges, { collapsedGroupIds: ["g"] }, resolved(), GLOBAL, {}, groups);
    expect(out).toBeNull();
    const paintedIds = new Set(["root", "kid1", "kid2"]);
    const pill = groupPillNodeId("g");
    expect(
      pillsForViewEdges(edges, groups, ["g"], new Set<string>(), paintedIds),
    ).toHaveLength(3);
    const withPill = injectGroupPillNodes(
      nodes.filter((n) => n.id !== "f"), nodes, groups, ["g"], "TB",
    );
    expect(pillRectsFromNodes(withPill, groups, ["g"]).has("g")).toBe(true);
    expect(withPill.find((n) => n.id === pill)?.data.anchor).toBe(true);
  });

  test("a compact (leaf-run) group still compacts, with its pill node + wire", () => {
    const leafNodes = [folder("root", 0, 0), file("a"), file("b"), file("c")];
    const leafEdges = [edge("root", "a"), edge("root", "b"), edge("root", "c")];
    const leafGroups = [group("g", ["a", "b"])];
    const out = deriveViewLayout(
      leafNodes, leafEdges,
      { collapsedGroupIds: ["g"] },
      resolved(), GLOBAL, {}, leafGroups,
    )!;
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["c", "root", groupPillNodeId("g")].sort());
    const pill = out.nodes.find((n) => n.id === groupPillNodeId("g"))!;
    expect(pill.type).toBe("groupPill");
    expect(pill.data.anchor).toBe(false);
    expect(
      pillsForViewEdges(leafEdges, leafGroups, ["g"], new Set<string>(), new Set(out.nodes.map((n) => n.id))),
    ).toEqual([
      { ...edge("root", "a"), id: `root->${pill.id}`, source: "root", target: pill.id },
    ]);
  });
});

