import { describe, expect, test } from "bun:test";
import type { FewerEdge, FewerNode } from "@/lib/fewer/types";
import { filterVisibleEdges, filterVisibleNodes } from "./use-canvas-visible-graph";

const node = (id: string) => ({ id }) as unknown as FewerNode;
const edge = (id: string, source: string, target: string) =>
  ({ id, source, target }) as unknown as FewerEdge;

describe("filterVisibleNodes", () => {
  test("drops hidden ids and locks zIndex 1000 on every survivor", () => {
    const out = filterVisibleNodes([node("a"), node("b"), node("c")], ["b"]);
    expect(out.map((n) => n.id)).toEqual(["a", "c"]);
    expect(out.every((n) => n.zIndex === 1000)).toBe(true);
  });

  test("returns every node (locked) when nothing is hidden", () => {
    const out = filterVisibleNodes([node("a"), node("b")], []);
    expect(out.map((n) => n.id)).toEqual(["a", "b"]);
    expect(out.every((n) => n.zIndex === 1000)).toBe(true);
  });

  test("never returns the input array reference (React Flow needs fresh nodes)", () => {
    const all = [node("a")];
    expect(filterVisibleNodes(all, [])).not.toBe(all);
  });

  test("keeps node fields other than zIndex", () => {
    const all = [
      { id: "a", position: { x: 1, y: 2 }, data: { label: "x", path: "a", type: "file" } },
    ] as unknown as FewerNode[];
    const out = filterVisibleNodes(all, []);
    expect(out[0].position).toEqual({ x: 1, y: 2 });
    expect(out[0].data).toEqual({ label: "x", path: "a", type: "file" });
  });
});

describe("filterVisibleEdges", () => {
  test("drops edges touching a hidden endpoint", () => {
    const all = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "d")];
    const out = filterVisibleEdges(all, ["b"]);
    expect(out.map((e) => e.id)).toEqual(["e3"]);
  });

  test("returns the same array reference when nothing is hidden", () => {
    const all = [edge("e1", "a", "b")];
    expect(filterVisibleEdges(all, [])).toBe(all);
  });

  test("unhiding every node restores the full edge set", () => {
    const all = [edge("e1", "a", "b"), edge("e2", "b", "c")];
    expect(filterVisibleEdges(all, [])).toEqual(all);
  });
});
