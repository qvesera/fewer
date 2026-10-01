import { describe, expect, test } from "bun:test";
import { mergeSelection, nextSelectionIds, selectionForLeaf } from "./canvasSelection";

describe("nextSelectionIds (drag-safe selection, #281)", () => {
  test("a drag keeps its selection when React Flow reports nothing selected", () => {
    // The canvas pushed the dragged card unselected (the store had no entry for
    // this view yet) → an empty report is the canvas's echo, not a user action.
    expect(nextSelectionIds({
      prevIds: [], selected: [], selectedIds: new Set(), base: null,
      dragSelection: ["n1"],
    })).toEqual(["n1"]);
  });

  test("outside a drag an empty report still clears the selection", () => {
    expect(nextSelectionIds({
      prevIds: ["n1"], selected: [], selectedIds: new Set(), base: null,
      dragSelection: null,
    })).toEqual([]);
  });

  test("mid-drag a real report wins over the seeded ids", () => {
    expect(nextSelectionIds({
      prevIds: ["n1"], selected: [{ id: "n1" }, { id: "n2" }], selectedIds: new Set(["n1", "n2"]),
      base: null, dragSelection: ["n1"],
    })).toEqual(["n1", "n2"]);
  });

  test("a shift-box gesture still unions with its base mid-drag", () => {
    expect(nextSelectionIds({
      prevIds: ["n1"], selected: [{ id: "n2" }], selectedIds: new Set(["n2"]),
      base: new Set(["n1"]), dragSelection: ["n1"],
    })).toEqual(["n1", "n2"]);
  });
});

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

  test("a large selection on both sides does not go quadratic", () => {
    // 20k already selected and still selected, one new card clicked. The second
    // pass used `prevIds.includes` per reported node — a Set lookup now.
    const prev = Array.from({ length: 20_000 }, (_, i) => `n${i}`);
    const selected = [{ id: "n0" }, { id: "fresh" }];
    const selectedIds = new Set([...prev, "fresh"]);
    const out = mergeSelection(prev, selected, selectedIds, null);
    // Still-selected ids keep their previous order; the new one is appended.
    expect(out).toHaveLength(20_001);
    expect(out[0]).toBe("n0");
    expect(out[19_999]).toBe("n19999");
    expect(out[20_000]).toBe("fresh");
  });
});

describe("selectionForLeaf (which id list a leaf paints, #285)", () => {
  const shared = ["n1"];

  test("a leaf's own entry always wins", () => {
    expect(selectionForLeaf({ a: ["n2"] }, "a", "a", shared)).toEqual(["n2"]);
    // ...even when another leaf owns the shared list.
    expect(selectionForLeaf({ a: ["n2"] }, "a", "b", shared)).toEqual(["n2"]);
  });

  test("no entry and no owner → the shared list (pristine session)", () => {
    // Nothing has claimed the shared selection yet (e.g. a search jump before
    // the first canvas interaction), so it is the only selection there is.
    expect(selectionForLeaf({}, "a", null, shared)).toEqual(["n1"]);
  });

  test("no entry while another leaf owns it → nothing (#285)", () => {
    // A brand-new canvas must NOT borrow the active view's selection: painting
    // it made the new leaf report it as its own, and the two canvases then
    // traded `activeLeafId` until React tore the tree down.
    const painted = selectionForLeaf({ a: ["n1"] }, "b", "a", ["n1"]);
    expect(painted).toEqual([]);
    // ...and it must be the SAME array every call: the canvas memoises its node
    // lens on this identity, so a fresh `[]` re-derives and re-pushes forever.
    expect(painted).toBe(selectionForLeaf({ a: ["n1"] }, "b", "a", ["n1"]));
  });

  test("no leafId (single legacy canvas) → the shared list", () => {
    expect(selectionForLeaf({}, undefined, null, shared)).toEqual(["n1"]);
    expect(selectionForLeaf({}, null, "a", shared)).toEqual(["n1"]);
  });
});