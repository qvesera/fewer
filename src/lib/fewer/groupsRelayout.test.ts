import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import type { FewerEdge, FewerNode } from "./types";

// bun's test env ships no localStorage (same harness as uiSlices.test.ts).
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

function folder(id: string, x: number, y: number): FewerNode {
  return { id, type: "folder", position: { x, y }, data: { label: id, path: id, type: "folder" } } as FewerNode;
}
function edge(source: string, target: string): FewerEdge {
  return { id: `${source}->${target}`, source, target } as FewerEdge;
}

/**
 * T-140/T-164: a collapsed group's members must stay part of the tree layout,
 * or visible cards re-flow into their block and the group pill (the union of
 * those positions) draws over them. Before T-164 the members lived in
 * hiddenIds and relayout needed a reserved-set filter to keep them in the
 * layout; since T-164 collapse is per-leaf view state and they are never
 * globally hidden at all, so the reservation falls out of the model — these
 * tests pin that.
 */
describe("collapsed groups reserve their block in the layout (T-140)", () => {
  beforeEach(() => {
    // direction is GLOBAL store state and other suites (userSettings.test.ts)
    // leave it at "LR" — bun's file order is not stable, so the layout this
    // test asserts on has to pin it rather than trust whoever ran last (T-145).
    useGraphStore.setState({
      nodes: [], edges: [], hiddenIds: [], groups: [], viewSettings: {},
      searchQuery: "", categoryFilter: [], tags: [], past: [], future: [], leafHistories: {},
      direction: "TB",
    });
  });

  test("a collapsed group's members are not globally hidden, so relayout lays them with the tree", () => {
    useGraphStore.setState({
      nodes: [folder("root", 0, 0), folder("a", 0, 200), folder("b", 5000, 5000), folder("c", 6000, 5000)],
      edges: [edge("root", "a"), edge("root", "b"), edge("root", "c")],
      // T-164: collapse is per-leaf state; it never writes hiddenIds, so the
      // members ride the tree layout unconditionally.
      hiddenIds: [],
      viewSettings: { "leaf-1": { collapsedGroupIds: ["g-1"] } },
      groups: [{ id: "g-1", title: "", note: "", memberIds: ["b", "c"] }],
    });
    useGraphStore.getState().relayout();
    const s = useGraphStore.getState();
    expect(s.hiddenIds).toEqual([]); // the model invariant itself
    const a = s.nodes.find((n) => n.id === "a")!;
    const b = s.nodes.find((n) => n.id === "b")!;
    // The block moves with the tree: its members land on their depth layer,
    // next to their siblings, so the pill sits on reserved space instead of
    // cards that re-flowed into the hole.
    expect(b.position).not.toEqual({ x: 5000, y: 5000 });
    expect(b.position.y).toBe(a.position.y); // same depth layer (TB layout)
    expect(Math.abs(b.position.x - a.position.x)).toBeLessThan(600);
  });

  test("an ordinary hidden node keeps its frozen position", () => {
    useGraphStore.setState({
      nodes: [folder("root", 0, 0), folder("a", 0, 200), folder("d", 7000, 7000)],
      edges: [edge("root", "a"), edge("root", "d")],
      hiddenIds: ["d"], // hidden, but in no collapsed group
    });
    useGraphStore.getState().relayout();
    const d = useGraphStore.getState().nodes.find((n) => n.id === "d")!;
    expect(d.position).toEqual({ x: 7000, y: 7000 });
  });
});
