import { describe, expect, test } from "bun:test";
import type { NodeChange } from "@xyflow/react";
import type { FewerNode } from "@/lib/fewer/types";
import { flipBoxSelectDeselects } from "./use-canvas-node-change-handler";

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
