import { afterEach, describe, expect, test } from "bun:test";
import { groupBatchActions } from "./menuSections";
import { buildBatchActions } from "./batchActions";
import { useGraphStore } from "@/store/graphStore";

const ids = ["a", "b", "c"];
const build = () => groupBatchActions({ toast: () => {}, selectedIds: ids });

/** Guest (the default) has no `nodeGroups`; `free` does — flip it back after. */
function withTier<Tier extends string>(tier: Tier, run: () => void): void {
  const before = useGraphStore.getState().tier;
  useGraphStore.setState({ tier } as never);
  try {
    run();
  } finally {
    useGraphStore.setState({ tier: before } as never);
  }
}

afterEach(() => useGraphStore.setState({ tier: "guest" } as never));

describe("groupBatchActions", () => {
  test("partitions every batch action exactly once — no junk drawer, no loss", () => {
    withTier("pro", () => {
      const g = build();
      const all = buildBatchActions({ toast: () => {}, selectedIds: ids });
      const grouped = [...g.edit, ...g.structure, ...g.visibility];
      if (g.delete) grouped.push(g.delete);

      expect(grouped.length).toBe(all.length);
      expect(new Set(grouped.map((a) => a.id))).toEqual(new Set(all.map((a) => a.id)));
    });
  });

  test("edit comes first, with Rename leading it (the primary action)", () => {
    expect(build().edit.map((a) => a.id)).toEqual(["rename", "copy", "cut", "duplicate"]);
  });

  test("structure reads Move to Folder → Unparent → Group N Items", () => {
    withTier("pro", () => {
      expect(build().structure.map((a) => a.id)).toEqual([
        "move-to-folder",
        "unparent",
        "group",
      ]);
    });
  });

  test("visibility pairs Hide with Show instead of splitting them", () => {
    expect(build().visibility.map((a) => a.id)).toEqual([
      "hide",
      "show",
      "collapse",
      "expand",
    ]);
  });

  test("a guest tier simply has no group action — the cluster still aligns", () => {
    expect(build().structure.map((a) => a.id)).toEqual(["move-to-folder", "unparent"]);
  });

  test("delete is the danger action, kept out of the clusters for the renderer", () => {
    const g = build();
    expect(g.delete?.danger).toBe(true);
    expect(g.delete?.id).toBe("delete");
    for (const cluster of [g.edit, g.structure, g.visibility]) {
      expect(cluster.some((a) => a.danger)).toBe(false);
    }
  });

  test("selection helpers stay in their own submenu list", () => {
    expect(build().select.map((a) => a.id)).toEqual([
      "select-descendants",
      "select-same-extension",
      "select-same-category",
    ]);
  });
});
