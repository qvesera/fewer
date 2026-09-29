import { describe, expect, test } from "bun:test";
import type { NodeChange } from "@xyflow/react";
import type { FewerNode } from "@/lib/fewer/types";
import { applyDimensionChanges, flipBoxSelectDeselects, type DimensionChange } from "./use-canvas-node-change-handler";

const select = (id: string, selected: boolean) =>
  ({ id, type: "select", selected }) as unknown as NodeChange<FewerNode>;
const position = (id: string) =>
  ({ id, type: "position", position: { x: 1, y: 2 } }) as unknown as NodeChange<FewerNode>;

describe("flipBoxSelectDeselects", () => {
  test("re-selects nodes that were selected when the gesture began", () => {
    const out = flipBoxSelectDeselects([select("a", false)], new Set(["a"]));
    expect(out[0]).toMatchObject({ id: "a", type: "select", selected: true });
  });

  test("leaves deselects of non-base nodes alone", () => {
    const out = flipBoxSelectDeselects([select("b", false)], new Set(["a"]));
    expect(out[0]).toMatchObject({ id: "b", selected: false });
  });

  test("leaves explicit selections alone", () => {
    const changes = [select("b", true)];
    expect(flipBoxSelectDeselects(changes, new Set(["a"]))).toEqual(changes);
  });

  test("passes position changes through untouched", () => {
    const out = flipBoxSelectDeselects([position("a")], new Set(["a"]));
    expect(out[0]).toMatchObject({ id: "a", type: "position", position: { x: 1, y: 2 } });
  });

  test("no base set → same array reference, no rewriting", () => {
    const changes = [select("a", false)];
    expect(flipBoxSelectDeselects(changes, null)).toBe(changes);
  });

  test("mixed batch flips only the base deselect", () => {
    const out = flipBoxSelectDeselects(
      [select("a", false), select("b", false), position("a")],
      new Set(["a"]),
    );
    expect(out.map((c) => (c.type === "select" ? c.selected : "position"))).toEqual([true, false, "position"]);
  });
});

describe("applyDimensionChanges", () => {
  const card = (id: string, type: "folder" | "file", style: Record<string, number>, measured?: { width: number; height: number }): FewerNode =>
    ({ id, position: { x: 0, y: 0 }, data: { label: id, path: `/${id}`, type }, style, ...(measured ? { measured } : {}) }) as unknown as FewerNode;
  const dims = (id: string, width: number, height: number): DimensionChange =>
    ({ id, type: "dimensions", dimensions: { width, height } }) as unknown as DimensionChange;
  const noCollapsed = new Set<string>();

  test("a re-measure of an unchanged card leaves the array identical", () => {
    const nodes = [card("a", "folder", { width: 200, height: 120 }, { width: 200, height: 120 })];
    const out = applyDimensionChanges(nodes, [dims("a", 200, 120)], noCollapsed);
    expect(out.changed).toBe(false);
    expect(out.nodes).toBe(nodes);
  });

  test("a collapsed folder's pill re-measure never rewrites the store", () => {
    // React Flow keeps reporting the pill as 38px while the shared node holds
    // the expanded measured height. The branch skips it by design, so the whole
    // batch is a no-op — the array must stay identical.
    const nodes = [card("a", "folder", { width: 200, height: 200 }, { width: 200, height: 200 })];
    const out = applyDimensionChanges(nodes, [dims("a", 200, 38)], new Set(["a"]));
    expect(out.changed).toBe(false);
    expect(out.nodes).toBe(nodes);
  });

  test("a real resize does rewrite the node and reports the change", () => {
    const nodes = [card("a", "folder", { width: 200, height: 120 }, { width: 200, height: 120 })];
    const out = applyDimensionChanges(nodes, [dims("a", 260, 140)], noCollapsed);
    expect(out.changed).toBe(true);
    expect(out.nodes[0].style).toMatchObject({ width: 260, height: 140 });
    expect(out.nodes[0].measured).toEqual({ width: 260, height: 140 });
  });

  test("a file keeps its pinned style height while the measured height follows", () => {
    const nodes = [card("c", "file", { width: 200, height: 58 }, { width: 200, height: 58 })];
    const out = applyDimensionChanges(nodes, [dims("c", 200, 72)], noCollapsed);
    expect(out.changed).toBe(true);
    expect(out.nodes[0].style).toMatchObject({ width: 200, height: 58 });
    expect(out.nodes[0].measured).toEqual({ width: 200, height: 72 });
  });

  test("an empty batch is a no-op", () => {
    const nodes = [card("a", "folder", { width: 200, height: 120 })];
    const out = applyDimensionChanges(nodes, [], noCollapsed);
    expect(out.changed).toBe(false);
    expect(out.nodes).toBe(nodes);
  });

  test("onFirstResize fires only for nodes that really moved", () => {
    const nodes = [
      card("a", "folder", { width: 200, height: 120 }, { width: 200, height: 120 }),
      card("b", "file", { width: 200, height: 58 }, { width: 200, height: 58 }),
    ];
    const seen: string[] = [];
    applyDimensionChanges(nodes, [dims("a", 200, 120), dims("b", 240, 58)], noCollapsed, (n) => seen.push(n.id));
    expect(seen).toEqual(["b"]);
  });
});
