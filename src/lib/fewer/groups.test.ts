import { describe, expect, test } from "bun:test";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  groupBounds,
  groupsIndexOf,
  groupPill,
  membershipMap,
  newGroup,
  normalizeGroupColor,
  normalizeGroups,
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
