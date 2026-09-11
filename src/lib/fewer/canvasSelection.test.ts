import { describe, expect, test } from "bun:test";
import { mergeSelection } from "./canvasSelection";

describe("mergeSelection", () => {
  test("keeps previously selected ids still present in the fresh snapshot, appends new ones in RF order", () => {
    const prev = ["a", "b", "c"];
    const selected = [{ id: "b" }, { id: "d" }];
    const selectedIds = new Set(["b", "d"]);
    // "a" was deselected, "b" stays, "d" is new
    expect(mergeSelection(prev, selected, selectedIds, null)).toEqual(["b", "d"]);
  });

  test("preserves selection order and drops stale ids", () => {
    const prev = ["x", "y"];
    const selected = [{ id: "y" }, { id: "z" }];
    const selectedIds = new Set(["y", "z"]);
    expect(mergeSelection(prev, selected, selectedIds, null)).toEqual(["y", "z"]);
  });

  test("unions with the box-select base when a gesture is in flight", () => {
    const prev = ["a"];
    const selected = [{ id: "c" }];
    const selectedIds = new Set(["c"]);
    const base = new Set(["a", "b"]);
    expect(mergeSelection(prev, selected, selectedIds, base)).toEqual(["a", "b", "c"]);
  });

  test("double-click guard id survives an empty fresh snapshot via the prev branch", () => {
    const prev = ["n"];
    const selected: { id: string }[] = [];
    const selectedIds = new Set(["n"]); // id added by the double-click guard
    expect(mergeSelection(prev, selected, selectedIds, null)).toEqual(["n"]);
  });

  test("dedupes when base already contains a fresh id", () => {
    const selected = [{ id: "b" }];
    expect(mergeSelection([], selected, new Set(["b"]), new Set(["a", "b"]))).toEqual(["a", "b"]);
  });
});