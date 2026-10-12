/**
 * Zoom-to-selection geometry (T-143): `selectionBounds` unions everything
 * selected — cards by rendered box, groups by frame box (expanded) or pill box
 * (collapsed) — and `viewportForBounds` centers that box in the pane. Both
 * entries (the crosshair button and Alt+F) consumed these; the bug was that
 * they read `selectedNodeIds` alone, so a selected group fit the whole graph.
 */
import { describe, expect, test } from "bun:test";
import { SELECTION_FIT, selectionBounds, viewportForBounds, type SelectionState } from "./fitBounds";
import {
  COLLAPSED_PILL_HEIGHT,
  COLLAPSED_PILL_WIDTH,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  type Group,
} from "./groups";
import type { FewerNode } from "./types";

const NODES = [
  { id: "n1", position: { x: 0, y: 0 }, style: { width: 140, height: 60 } },
  { id: "n2", position: { x: 300, y: 0 }, style: { width: 140, height: 60 } },
] as unknown as FewerNode[];

const GROUP: Group = { id: "g1", title: "G", note: "", memberIds: ["n1", "n2"] };

function state(over: Partial<SelectionState> = {}): SelectionState {
  return { nodes: NODES, groups: [GROUP], selectedNodeIds: [], selectedGroupIds: [], ...over };
}

describe("selectionBounds", () => {
  test("selected cards contribute their rendered boxes", () => {
    expect(selectionBounds(state({ selectedNodeIds: ["n1"] }))).toEqual({ x: 0, y: 0, width: 140, height: 60 });
  });

  test("an expanded group contributes the padded frame box, header included", () => {
    expect(selectionBounds(state({ selectedGroupIds: ["g1"] }))).toEqual({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING - GROUP_HEADER_HEIGHT,
      width: 440 + GROUP_PADDING * 2,
      height: 60 + GROUP_PADDING * 2 + GROUP_HEADER_HEIGHT,
    });
  });

  test("a collapsed group contributes the PILL box, not the member cluster", () => {
    const b = selectionBounds(state({ groups: [{ ...GROUP, collapsed: true }], selectedGroupIds: ["g1"] }))!;
    expect(b.width).toBe(COLLAPSED_PILL_WIDTH);
    expect(b.height).toBe(COLLAPSED_PILL_HEIGHT);
    expect(b.x).toBe(-GROUP_PADDING); // still anchored at the cluster corner
  });

  test("cards and groups union into one box", () => {
    const far = { id: "n3", position: { x: 1000, y: 500 }, style: { width: 100, height: 40 } } as unknown as FewerNode;
    const b = selectionBounds(
      state({ nodes: [...NODES, far], selectedNodeIds: ["n3"], selectedGroupIds: ["g1"] }),
    )!;
    // Union of n3 (1000..1100 × 500..540) and the frame (−24..464 × −56..84).
    expect(b).toEqual({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING - GROUP_HEADER_HEIGHT,
      width: 1100 + GROUP_PADDING,
      height: 540 + GROUP_PADDING + GROUP_HEADER_HEIGHT,
    });
  });

  test("nothing selected — or only stale ids — yields null", () => {
    expect(selectionBounds(state())).toBeNull();
    expect(selectionBounds(state({ selectedNodeIds: ["ghost"], selectedGroupIds: ["ghost2"] }))).toBeNull();
    // A group whose members are all gone from the store contributes nothing;
    // alone, that is still null.
    expect(
      selectionBounds(state({ nodes: [], selectedGroupIds: ["g1"] })),
    ).toBeNull();
  });

  test("per-view positions shift the box to where the cards paint (T-137)", () => {
    const b = selectionBounds(
      state({
        activeLeafId: "leaf-1",
        viewSettings: { "leaf-1": { positions: { n1: { x: 500, y: 40 } } } },
        selectedNodeIds: ["n1"],
      }),
    )!;
    expect(b).toEqual({ x: 500, y: 40, width: 140, height: 60 });
  });
});

describe("viewportForBounds", () => {
  const size = { width: 1000, height: 800 };

  test("centers the bounds in the pane (center-exact)", () => {
    const box = { x: -GROUP_PADDING, y: -GROUP_PADDING - GROUP_HEADER_HEIGHT, width: 488, height: 140 };
    const v = viewportForBounds(box, size);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    expect(cx * v.zoom + v.x).toBeCloseTo(size.width / 2, 6);
    expect(cy * v.zoom + v.y).toBeCloseTo(size.height / 2, 6);
  });

  test("padding shrinks the usable pane to (1 − 2·padding) per axis", () => {
    const v = viewportForBounds({ x: 0, y: 0, width: 488, height: 140 }, size);
    // Width binds: 1000·0.4 / 488 < 800·0.4 / 140.
    expect(v.zoom).toBeCloseTo((size.width * (1 - 2 * SELECTION_FIT.padding)) / 488, 6);
  });

  test("clamps at maxZoom for a small selection and minZoom for a huge one", () => {
    expect(viewportForBounds({ x: 0, y: 0, width: 10, height: 10 }, size).zoom).toBe(SELECTION_FIT.maxZoom);
    expect(viewportForBounds({ x: 0, y: 0, width: 100000, height: 80000 }, size).zoom).toBe(SELECTION_FIT.minZoom);
  });

  test("degenerate zero-size bounds never divide by zero", () => {
    const v = viewportForBounds({ x: 5, y: 5, width: 0, height: 0 }, size);
    expect(Number.isFinite(v.zoom)).toBe(true);
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(v.y)).toBe(true);
  });
});
