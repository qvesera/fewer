import { describe, expect, test } from "bun:test";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  type Group,
} from "./groups";
import {
  collapseToLayoutBlocks,
  collapsedGroupBlocks,
  groupPillNodeId,
  isGroupPillNodeId,
  pillRectsFrom,
  stripPillNodes,
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

  test("a member's children are re-parented onto the pill", () => {
    const withKids = [file("a"), file("child")];
    const kidEdges = [edge("a", "child")];
    const { nodes: out, edges: outEdges } = collapseToLayoutBlocks(
      withKids, kidEdges, [group("g", ["a"])], ["g"],
    );
    expect(out.map((n) => n.id)).toEqual([file("child").id, groupPillNodeId("g")]);
    expect(outEdges[0]).toMatchObject({ source: groupPillNodeId("g"), target: "child" });
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

describe("pill rect read-back", () => {
  test("pillRectsFrom reads the laid-out slot and stripPillNodes drops the synthetic nodes", () => {
    const nodes = [folder("root"), file("a"), file("b")];
    const edges = [edge("root", "a"), edge("root", "b")];
    const blocks = collapseToLayoutBlocks(nodes, edges, [group("g", ["a"])], ["g"]);
    expect(blocks.pillNodes.size).toBe(1);
    const laid = blocks.nodes.map((n) => ({ ...n, position: { x: 42, y: 7 } }));
    const rects = pillRectsFrom(laid, blocks.pillNodes);
    expect(rects.get("g")).toEqual({ x: 42, y: 7, width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT });
    expect(stripPillNodes(laid).map((n) => n.id)).toEqual(["root", "b"]);
    expect(isGroupPillNodeId(groupPillNodeId("g"))).toBe(true);
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
    const rect = out.pillRects!.get("g")!;
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
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["c", "d", "parent", "root"]);
    // No hole: the reserved block is the PILL, so the next sibling sits within a
    // pill + gap of it instead of a full cluster's width away (TB).
    const rect = out.pillRects!.get("g")!;
    const c = out.nodes.find((n) => n.id === "c")!;
    expect(c.position.x - rect.x).toBeLessThan(COLLAPSED_PILL_WIDTH + 200);
    expect(c.position.x).toBeGreaterThan(rect.x);
  });
});
