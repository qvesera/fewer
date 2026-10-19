import { describe, expect, test } from "bun:test";
import { layoutGraphSync } from "./layout";
import { GROUP_HEADER_HEIGHT, GROUP_PADDING } from "./groups";
import type { FewerEdge, FewerNode, LayoutDirection } from "./types";

/** The space a canvas group frame reserves ABOVE its topmost member. A layout
 *  gap below this lets the neighbouring card overlap the group's title strip. */
const FRAME_INSET = GROUP_PADDING + GROUP_HEADER_HEIGHT; // 56

function file(id: string): FewerNode {
  return {
    id,
    type: "file",
    position: { x: 0, y: 0 },
    style: { width: 240, height: 58 },
    data: { label: id, path: `/${id}`, type: "file" },
  } as FewerNode;
}
function edge(source: string, target: string): FewerEdge {
  return { id: `${source}->${target}`, source, target } as FewerEdge;
}

describe("sibling gaps clear a group frame's title inset (T-179)", () => {
  const nodes = [file("root"), file("a"), file("b")];
  const edges = [edge("root", "a"), edge("root", "b")];

  // Siblings stack on the cross axis: Y in the horizontal layouts, X in the
  // vertical ones. `crown shyness` only widens the gap, so the base gap is the
  // floor to assert.
  const crossGap = (direction: LayoutDirection): number => {
    const laid = layoutGraphSync(nodes, edges, direction, { shynessScale: 0 });
    const a = laid.find((n) => n.id === "a")!;
    const b = laid.find((n) => n.id === "b")!;
    if (direction === "LR" || direction === "RL") {
      const [top, bottom] = a.position.y < b.position.y ? [a, b] : [b, a];
      return bottom.position.y - (top.position.y + 58);
    }
    const [left, right] = a.position.x < b.position.x ? [a, b] : [b, a];
    return right.position.x - (left.position.x + 240);
  };

  for (const direction of ["LR", "RL", "TB", "BT"] as const) {
    test(`${direction}: the gap between adjacent siblings is at least the inset`, () => {
      expect(crossGap(direction)).toBeGreaterThanOrEqual(FRAME_INSET);
    });
  }
});
