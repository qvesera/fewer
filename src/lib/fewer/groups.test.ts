import { describe, expect, test } from "bun:test";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  GROUP_HEADER_HEIGHT,
  GROUP_MIN_BOX,
  GROUP_PADDING,
  cardsInsideBox,
  childGroups,
  descendantGroupIds,
  groupBounds,
  groupDepth,
  groupFrameRects,
  groupsIndexOf,
  groupPill,
  handleAxes,
  handleOrigin,
  membershipMap,
  minScaleFor,
  newGroup,
  normalizeGroupColor,
  normalizeGroups,
  scaleFactorFor,
  scaleMemberPositions,
  subtreeMemberIds,
  wouldCreateCycle,
} from "./groups";
import type { Group } from "./groups";
import type { FewerNode } from "./types";

function node(id: string, x: number, y: number, w = 100, h = 50): FewerNode {
  return {
    id,
    type: "folder",
    position: { x, y },
    style: { width: w, height: h },
    data: { label: id, path: id, type: "folder" },
  } as FewerNode;
}

describe("groupBounds", () => {
  test("null when none of the members are on the canvas", () => {
    expect(groupBounds([node("a", 0, 0)], ["missing"])).toBeNull();
    expect(groupBounds([], ["a"])).toBeNull();
  });

  test("single member: node box plus padding, with the header reserved above", () => {
    const b = groupBounds([node("a", 100, 200, 100, 50)], ["a"]);
    expect(b).toEqual({
      x: 100 - GROUP_PADDING,
      y: 200 - GROUP_PADDING - GROUP_HEADER_HEIGHT,
      width: 100 + GROUP_PADDING * 2,
      height: 50 + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
    });
  });

  test("uses the rendered (measured) size, so tall folder cards stay inside", () => {
    // A folder card's nominal height is ~50, but it renders taller once it
    // lists children — reading only `style` made frames too short (cards
    // spilled out of the gray box).
    const tall = {
      ...node("a", 0, 0, 100, 50),
      measured: { width: 100, height: 260 },
    } as FewerNode;
    const b = groupBounds([tall], ["a"]);
    expect(b?.height).toBe(260 + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT);
  });

  test("several members: union box plus padding", () => {
    const b = groupBounds(
      [node("a", 0, 0, 100, 50), node("b", 400, 300, 100, 50), node("c", 50, 60, 10, 10)],
      ["a", "b", "c"],
    );
    expect(b).toEqual({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING - GROUP_HEADER_HEIGHT,
      width: 500 + GROUP_PADDING * 2,
      height: 350 + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
    });
  });

  test("non-members never widen the box", () => {
    const b = groupBounds(
      [node("a", 0, 0, 100, 50), node("far", 5000, 5000, 100, 50)],
      ["a"],
    );
    expect(b?.width).toBe(100 + GROUP_PADDING * 2);
  });

  test("with a visible set, the box hugs only the visible members (T-134)", () => {
    const nodes = [node("a", 0, 0, 100, 50), node("b", 400, 300, 100, 50)];
    const b = groupBounds(nodes, ["a", "b"], GROUP_PADDING, new Set(["a"]));
    expect(b).toEqual({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING - GROUP_HEADER_HEIGHT,
      width: 100 + GROUP_PADDING * 2,
      height: 50 + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
    });
  });

  test("null when no member is visible (an all-hidden group draws nothing)", () => {
    expect(groupBounds([node("a", 0, 0)], ["a"], GROUP_PADDING, new Set())).toBeNull();
  });

  test("without a visible set, hidden members still count (collapsed anchor)", () => {
    // The pill must keep the cluster's footprint even though every member is
    // hidden — collapse is what hides them.
    const nodes = [node("a", 0, 0, 100, 50)];
    expect(groupBounds(nodes, ["a"], GROUP_PADDING, new Set())).toBeNull();
    expect(groupBounds(nodes, ["a"], GROUP_PADDING)).not.toBeNull();
  });
});

describe("groupPill", () => {
  test("collapsed frame is a fixed pill at the cluster corner", () => {
    expect(groupPill({ x: 40, y: 60, width: 900, height: 400 })).toEqual({
      x: 40,
      y: 60,
      width: COLLAPSED_PILL_WIDTH,
      height: COLLAPSED_PILL_HEIGHT,
    });
  });

  test("anchors at the layout direction's flow-start corner (T-163)", () => {
    const bounds = { x: 40, y: 60, width: 900, height: 400 };
    const size = { width: COLLAPSED_PILL_WIDTH, height: COLLAPSED_PILL_HEIGHT };
    // TB / LR keep the historical top-left anchor (default direction included).
    expect(groupPill(bounds, "TB")).toEqual({ x: 40, y: 60, ...size });
    expect(groupPill(bounds, "LR")).toEqual({ x: 40, y: 60, ...size });
    // BT: far corner below the cluster — bounds.bottom = cards' bottom + GROUP_PADDING.
    expect(groupPill(bounds, "BT")).toEqual({ x: 40, y: 460, ...size });
    // RL: far corner past the cluster's right — bounds.right = cards' right + GROUP_PADDING.
    expect(groupPill(bounds, "RL")).toEqual({ x: 940, y: 60, ...size });
  });
});

describe("newGroup", () => {
  test("de-duplicates members and falls back on a blank title", () => {
    const g = newGroup("g-1", "   ", ["a", "b", "a"]);
    expect(g).toEqual({ id: "g-1", title: "Untitled group", note: "", memberIds: ["a", "b"] });
  });

  test("trims the title", () => {
    expect(newGroup("g-1", "  Assets  ", []).title).toBe("Assets");
  });
});

describe("normalizeGroups", () => {
  const ids = new Set(["a", "b"]);

  test("absent or non-array input → empty", () => {
    expect(normalizeGroups(undefined, ids)).toEqual([]);
    expect(normalizeGroups(null as unknown as Group[], ids)).toEqual([]);
  });

  test("drops dangling members and groups left empty", () => {
    const out = normalizeGroups(
      [
        { id: "g-1", title: "Kept", note: "", memberIds: ["a", "deleted"] },
        { id: "g-2", title: "All gone", note: "", memberIds: ["nope"] },
      ],
      ids,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "g-1", title: "Kept", note: "", memberIds: ["a"] });
  });

  test("de-duplicates members and skips entries without an id", () => {
    const out = normalizeGroups(
      [
        { id: "", title: "no id", note: "", memberIds: ["a"] },
        { id: "g-1", title: "T", note: "", memberIds: ["a", "a", "b"] },
        null as unknown as Group,
      ] as Group[],
      ids,
    );
    expect(out).toHaveLength(1);
    expect(out[0].memberIds).toEqual(["a", "b"]);
  });

  test("clamps the title, keeps note and collapsed", () => {
    const out = normalizeGroups(
      [{ id: "g-1", title: "x".repeat(500), note: "readme", memberIds: ["a"], collapsed: true }],
      ids,
    );
    expect(out[0].title).toHaveLength(80);
    expect(out[0].note).toBe("readme");
    expect(out[0].collapsed).toBe(true);
  });
});

describe("nesting model (W4)", () => {
  const ids = new Set(["a", "b", "c", "d"]);
  // P (root) → C → G, plus P and C also own cards directly.
  const forest: Group[] = [
    { id: "P", title: "P", note: "", memberIds: ["a"], parentId: undefined },
    { id: "C", title: "C", note: "", memberIds: ["b"], parentId: "P" },
    { id: "G", title: "G", note: "", memberIds: ["c"], parentId: "C" },
    { id: "S", title: "S", note: "", memberIds: ["d"], parentId: undefined },
  ];

  test("childGroups returns direct children only", () => {
    expect(childGroups(forest, "P").map((g) => g.id)).toEqual(["C"]);
    expect(childGroups(forest, "C").map((g) => g.id)).toEqual(["G"]);
    expect(childGroups(forest, "G")).toEqual([]);
    expect(childGroups(forest, "S")).toEqual([]);
  });

  test("descendantGroupIds is the transitive closure, excluding self", () => {
    expect([...descendantGroupIds(forest, "P")].sort()).toEqual(["C", "G"]);
    expect([...descendantGroupIds(forest, "C")]).toEqual(["G"]);
    expect(descendantGroupIds(forest, "G").size).toBe(0);
    expect(descendantGroupIds(forest, "S").size).toBe(0);
    expect(descendantGroupIds(forest, "missing").size).toBe(0);
  });

  test("subtreeMemberIds unions own + descendant cards, no dupes, order stable", () => {
    expect(subtreeMemberIds(forest, "P")).toEqual(["a", "b", "c"]);
    expect(subtreeMemberIds(forest, "C")).toEqual(["b", "c"]);
    expect(subtreeMemberIds(forest, "G")).toEqual(["c"]);
    expect(subtreeMemberIds(forest, "S")).toEqual(["d"]);
    expect(subtreeMemberIds(forest, "missing")).toEqual([]);
  });

  test("wouldCreateCycle: self, missing, and descendant targets are rejected", () => {
    expect(wouldCreateCycle(forest, "P", "P")).toBe(true); // self
    expect(wouldCreateCycle(forest, "P", "nope")).toBe(true); // missing
    expect(wouldCreateCycle(forest, "P", "C")).toBe(true); // direct child
    expect(wouldCreateCycle(forest, "P", "G")).toBe(true); // deep descendant
    expect(wouldCreateCycle(forest, "C", "P")).toBe(false); // move up to ancestor — valid
    expect(wouldCreateCycle(forest, "S", "P")).toBe(false); // unrelated — valid
  });

  describe("normalizeGroups repairs the parent links", () => {
    test("preserves a valid parent", () => {
      const out = normalizeGroups(forest, ids);
      expect(out.find((g) => g.id === "C")?.parentId).toBe("P");
      expect(out.find((g) => g.id === "G")?.parentId).toBe("C");
      expect(out.find((g) => g.id === "P")?.parentId).toBeUndefined();
    });

    test("drops a dangling parent (parent group gone)", () => {
      const out = normalizeGroups(
        [
          { id: "C", title: "C", note: "", memberIds: ["b"], parentId: "ghost" },
        ],
        ids,
      );
      expect(out[0].parentId).toBeUndefined();
    });

    test("drops a self-parent", () => {
      const out = normalizeGroups([{ id: "C", title: "C", note: "", memberIds: ["b"], parentId: "C" }], ids);
      expect(out[0].parentId).toBeUndefined();
    });

    test("breaks a 2-node cycle so the result is a forest", () => {
      const out = normalizeGroups(
        [
          { id: "A", title: "A", note: "", memberIds: ["a"], parentId: "B" },
          { id: "B", title: "B", note: "", memberIds: ["b"], parentId: "A" },
        ],
        ids,
      );
      // Exactly one of the two links must be severed — no 2-cycle remains.
      const a = out.find((g) => g.id === "A")!;
      const b = out.find((g) => g.id === "B")!;
      expect(!(a.parentId === "B" && b.parentId === "A")).toBe(true);
      // And both survive (each still owns a card).
      expect(out).toHaveLength(2);
    });

    test("breaks a longer cycle (A→B→C→A)", () => {
      const out = normalizeGroups(
        [
          { id: "A", title: "A", note: "", memberIds: ["a"], parentId: "C" },
          { id: "B", title: "B", note: "", memberIds: ["b"], parentId: "A" },
          { id: "C", title: "C", note: "", memberIds: ["c"], parentId: "B" },
        ],
        ids,
      );
      // Walk up from any node must terminate (no infinite loop) → forest holds.
      const byId = new Map(out.map((g) => [g.id, g]));
      for (const start of byId.keys()) {
        const seen = new Set<string>();
        let cur: string | undefined = start;
        while (cur !== undefined) {
          expect(seen.has(cur)).toBe(false);
          seen.add(cur);
          cur = byId.get(cur)?.parentId;
        }
      }
      expect(out).toHaveLength(3);
    });

    test("keeps a parent that only contains subgroups (not dropped as empty)", () => {
      const out = normalizeGroups(
        [
          { id: "P", title: "P", note: "", memberIds: [], parentId: undefined },
          { id: "C", title: "C", note: "", memberIds: ["b"], parentId: "P" },
        ],
        ids,
      );
      expect(out.map((g) => g.id).sort()).toEqual(["C", "P"]);
      expect(out.find((g) => g.id === "P")?.parentId).toBeUndefined();
    });

    test("still drops a truly empty group (no cards, no children)", () => {
      const out = normalizeGroups(
        [
          { id: "P", title: "P", note: "", memberIds: ["a"] },
          { id: "E", title: "E", note: "", memberIds: ["ghost"], parentId: "P" },
        ],
        ids,
      );
      // E has no reachable cards and no children → dropped, even though it had a parent.
      expect(out.map((g) => g.id)).toEqual(["P"]);
    });
  });
});

describe("normalizeGroupColor", () => {
  test("accepts six-digit hex and lowercases it", () => {
    expect(normalizeGroupColor("#A78BFA")).toBe("#a78bfa");
  });

  test("rejects everything that is not a six-digit hex", () => {
    expect(normalizeGroupColor("red")).toBeUndefined();
    expect(normalizeGroupColor("#fff")).toBeUndefined();
    // The half-typed value a hex field shows mid-edit: committing it must be a
    // no-op, so closing the picker keeps the previous colour.
    expect(normalizeGroupColor("#12")).toBeUndefined();
    expect(normalizeGroupColor("#zzzzzz")).toBeUndefined();
    expect(normalizeGroupColor(undefined)).toBeUndefined();
  });

  test("keeps a complete value untouched (what the picker emits)", () => {
    expect(normalizeGroupColor("#abcdef")).toBe("#abcdef");
  });

  test("normalizeGroups keeps a valid color and drops an invalid one", () => {
    const out = normalizeGroups(
      [
        { id: "g-1", title: "T", note: "", memberIds: ["a"], color: "#A78BFA" },
        { id: "g-2", title: "T", note: "", memberIds: ["b"], color: "not-a-color" },
      ],
      new Set(["a", "b"]),
    );
    expect(out[0].color).toBe("#a78bfa");
    expect(out[1].color).toBeUndefined();
  });
});

describe("indexes", () => {
  const groups: Group[] = [
    newGroup("g-1", "One", ["a"]),
    newGroup("g-2", "Two", ["a", "b"]),
  ];

  test("groupsIndexOf maps id → group", () => {
    expect(groupsIndexOf(groups).get("g-2")?.title).toBe("Two");
  });

  test("membershipMap: a node belongs to exactly one group, first wins", () => {
    const m = membershipMap(groups);
    expect(m.get("a")).toBe("g-1");
    expect(m.get("b")).toBe("g-2");
    expect(m.has("nope")).toBe(false);
  });
});

describe("resize-by-scale model (T-136)", () => {
  const BOX = { x: 0, y: 0, width: 400, height: 300 };

  test("corners drive both axes, edges one", () => {
    expect(handleAxes("se")).toEqual({ x: true, y: true });
    expect(handleAxes("nw")).toEqual({ x: true, y: true });
    expect(handleAxes("e")).toEqual({ x: true, y: false });
    expect(handleAxes("n")).toEqual({ x: false, y: true });
  });

  test("each handle anchors on the opposite corner/edge", () => {
    expect(handleOrigin("se", BOX)).toEqual({ x: 0, y: 0 });
    expect(handleOrigin("nw", BOX)).toEqual({ x: 400, y: 300 });
    expect(handleOrigin("ne", BOX)).toEqual({ x: 0, y: 300 });
    expect(handleOrigin("e", BOX)).toEqual({ x: 0, y: 150 });
    expect(handleOrigin("n", BOX)).toEqual({ x: 200, y: 300 });
  });

  test("scaleFactorFor is pointer-vs-start around the origin", () => {
    // origin 0, start 200, now 100 → halve.
    expect(scaleFactorFor(100, 0, 200, 0.1)).toBeCloseTo(0.5);
    // now 400 → double.
    expect(scaleFactorFor(400, 0, 200, 0.1)).toBeCloseTo(2);
    // Negative direction (crossed the origin) clamps at the min.
    expect(scaleFactorFor(-50, 0, 200, 0.25)).toBe(0.25);
    // Degenerate reference pins the axis.
    expect(scaleFactorFor(3, 0, 0.5, 0.25)).toBe(1);
  });

  test("minScaleFor keeps the frame at least GROUP_MIN_BOX", () => {
    const tiny = minScaleFor({ ...BOX, width: 100, height: 80 });
    // Already under the minimum: only growing is allowed (factor > 1).
    expect(tiny.x).toBeCloseTo(GROUP_MIN_BOX.width / 100);
    expect(tiny.y).toBeCloseTo(GROUP_MIN_BOX.height / 80);
    expect(tiny.x).toBeGreaterThan(1);
    // A big-enough box may shrink, down to just-fit and no further.
    const big = minScaleFor(BOX);
    expect(big.x).toBeCloseTo(GROUP_MIN_BOX.width / 400);
    expect(big.y).toBeCloseTo(GROUP_MIN_BOX.height / 300);
    expect(big.x).toBeLessThan(1);
  });

  test("scaleMemberPositions multiplies offsets from the origin; cards keep size", () => {
    const starts = new Map([
      ["a", { x: 100, y: 100 }],
      ["b", { x: 300, y: 200 }],
    ]);
    const out = scaleMemberPositions(starts, { x: 0, y: 0 }, 2, 0.5);
    expect(out.a).toEqual({ x: 200, y: 50 });
    expect(out.b).toEqual({ x: 600, y: 100 });
    // The map of starts is never mutated (the gesture reuses it every frame).
    expect(starts.get("a")).toEqual({ x: 100, y: 100 });
  });

  test("scaleMemberPositions respects a non-zero origin (edge handles)", () => {
    const starts = new Map([["a", { x: 100, y: 100 }]]);
    // Horizontal-only scale around the left edge: y passes through untouched.
    const out = scaleMemberPositions(starts, { x: 50, y: 999 }, 3, 1);
    expect(out.a).toEqual({ x: 200, y: 100 });
  });
});

describe("cardsInsideBox (T-141)", () => {
  const BOX = { x: 0, y: 0, width: 300, height: 200 };

  test("a fully-contained non-member is offered; members never are", () => {
    const inside = node("stranger", 50, 50);
    const member = node("member", 60, 60);
    const out = cardsInsideBox([inside, member], BOX, ["member"]);
    expect(out).toEqual(["stranger"]);
  });

  test("a card straddling the border is not 'inside'", () => {
    // Right edge at 310 — past the box's 300.
    const straddling = node("edge", 210, 50);
    expect(cardsInsideBox([straddling], BOX, [])).toEqual([]);
  });

  test("the visible set filters, same as groupBounds", () => {
    const hidden = node("ghost", 50, 50);
    expect(cardsInsideBox([hidden], BOX, [], new Set<string>())).toEqual([]);
    expect(cardsInsideBox([hidden], BOX, [], new Set(["ghost"]))).toEqual(["ghost"]);
  });
});

describe("groupFrameRects + groupDepth (W5 nesting geometry)", () => {
  const painted = [
    node("pa", 0, 0, 100, 50),     // P's own card
    node("ca", 0, 300, 100, 50),   // C's own card (below)
    node("ga", 0, 600, 100, 50),   // G's own card (grandchild, deeper)
  ];

  test("groupDepth counts ancestors (roots 0)", () => {
    const gs = [
      { id: "P", title: "P", note: "", memberIds: ["pa"] },
      { id: "C", title: "C", note: "", memberIds: ["ca"], parentId: "P" },
      { id: "G", title: "G", note: "", memberIds: ["ga"], parentId: "C" },
      { id: "S", title: "S", note: "", memberIds: [] },
    ];
    expect(groupDepth(gs, "P")).toBe(0);
    expect(groupDepth(gs, "C")).toBe(1);
    expect(groupDepth(gs, "G")).toBe(2);
    expect(groupDepth(gs, "S")).toBe(0);
  });

  test("a childless group's rect equals groupBounds (no nesting side-effects)", () => {
    const gs = [{ id: "P", title: "P", note: "", memberIds: ["pa"] }];
    const { rects } = groupFrameRects(gs, painted, painted);
    expect(rects.get("P")).toEqual(groupBounds(painted, ["pa"])!);
  });

  test("a parent frame CONTAINS its child frame (padded), never overlapping", () => {
    const gs = [
      { id: "P", title: "P", note: "", memberIds: ["pa"] },
      { id: "C", title: "C", note: "", memberIds: ["ca"], parentId: "P" },
    ];
    const { rects } = groupFrameRects(gs, painted, painted);
    const p = rects.get("P")!;
    const c = rects.get("C")!;
    expect(p.x).toBeLessThanOrEqual(c.x);
    expect(p.y).toBeLessThanOrEqual(c.y);
    expect(p.x + p.width).toBeGreaterThanOrEqual(c.x + c.width);
    expect(p.y + p.height).toBeGreaterThanOrEqual(c.y + c.height);
    // The parent grew beyond its own card to fit the child (child is far below).
    expect(p.height).toBeGreaterThan(groupBounds(painted, ["pa"])!.height);
  });

  test("paint order is parents-first (children render above)", () => {
    const gs = [
      { id: "G", title: "G", note: "", memberIds: ["ga"], parentId: "C" },
      { id: "C", title: "C", note: "", memberIds: ["ca"], parentId: "P" },
      { id: "P", title: "P", note: "", memberIds: ["pa"] },
      { id: "S", title: "S", note: "", memberIds: ["ga"] },
    ];
    const { order } = groupFrameRects(gs, painted, painted);
    expect(order.indexOf("P")).toBeLessThan(order.indexOf("C"));
    expect(order.indexOf("C")).toBeLessThan(order.indexOf("G"));
  });

  test("a collapsed parent becomes a pill and SUPPRESSES its subtree", () => {
    const gs = [
      { id: "P", title: "P", note: "", memberIds: ["pa"], collapsed: true },
      { id: "C", title: "C", note: "", memberIds: ["ca"], parentId: "P" },
      { id: "G", title: "G", note: "", memberIds: ["ga"], parentId: "C" },
    ];
    const { rects } = groupFrameRects(gs, painted, painted);
    expect(rects.has("C")).toBe(false); // orphan pill suppressed
    expect(rects.has("G")).toBe(false);
    expect(rects.has("P")).toBe(true);
    expect(rects.get("P")!.width).toBe(COLLAPSED_PILL_WIDTH); // pill, not frame
    expect(rects.get("P")!.height).toBe(COLLAPSED_PILL_HEIGHT);
  });

  test("a collapsed pill follows the layout direction (T-163)", () => {
    const gs = [{ id: "P", title: "P", note: "", memberIds: ["pa"], collapsed: true }];
    const bounds = groupBounds(painted, ["pa"])!;
    // Default direction: top-left pill, exactly as before.
    expect(groupFrameRects(gs, painted, painted).rects.get("P")).toEqual(groupPill(bounds));
    // BT anchors below the cluster, RL past its right edge.
    expect(groupFrameRects(gs, painted, painted, undefined, "BT").rects.get("P")).toEqual(
      groupPill(bounds, "BT"),
    );
    expect(groupFrameRects(gs, painted, painted, undefined, "RL").rects.get("P")).toEqual(
      groupPill(bounds, "RL"),
    );
  });

  test("an expanded parent with hidden own cards still frames visible children", () => {
    // P's own card is not in the painted/visible set, but its child C is.
    const gs = [
      { id: "P", title: "P", note: "", memberIds: ["pa"] },
      { id: "C", title: "C", note: "", memberIds: ["ca"], parentId: "P" },
    ];
    const visible = new Set(["ca"]); // pa hidden
    const { rects } = groupFrameRects(gs, painted, painted, visible);
    expect(rects.has("C")).toBe(true);
    expect(rects.has("P")).toBe(true); // P still draws around C
  });

  test("a group with nothing visible and no visible children is omitted", () => {
    const gs = [{ id: "P", title: "P", note: "", memberIds: ["pa"] }];
    const { rects } = groupFrameRects(gs, painted, painted, new Set(["other"]));
    expect(rects.has("P")).toBe(false);
  });
});
