import { describe, expect, it } from "bun:test";
import { buildBatchActions } from "./batchActions";

const noopToast = () => {};
const base = { toast: noopToast, selectedIds: ["a", "b"], canSetParent: false };

describe("buildBatchActions", () => {
  it("exposes one canonical action list shared by all menus", () => {
    const actions = buildBatchActions(base);
    expect(actions.map((a) => a.id)).toEqual([
      "rename",
      "copy",
      "cut",
      "duplicate",
      "move-to-folder",
      "unparent",
      "delete",
    ]);
  });

  it("marks only destructive actions as danger", () => {
    const actions = buildBatchActions(base);
    expect(actions.filter((a) => a.danger).map((a) => a.id)).toEqual(["delete"]);
  });

  it("labels the delete action with the selection count", () => {
    const del = buildBatchActions({ ...base, selectedIds: ["a", "b", "c"] }).find(
      (a) => a.id === "delete",
    );
    expect(del?.label).toBe("Delete 3 Items");
  });
});
