import { describe, it, expect } from "bun:test";
import { createArea } from "./panelLayout";
import {
  defaultTree, makeLeaf, leafList, leafCount,
  getPrimary, splitLeaf, joinLeaf,
  serializeTree, parseTree, migrateV1ToTree, isLeaf, dedupeLeafIds,
} from "./panelTree";
import {
  computeEffectiveHidden, type HideLayers,
  type ResolvedViewSettings,
  resolveViewSettings,
} from "./viewState";

const FILE_IDS = ["f1", "f2", "f3", "f4", "f5"];
const GLOBAL_HIDDEN = ["g1", "g2"];
const DEFAULT_RESOLVED: ResolvedViewSettings = {
  showFiles: true, minimapHidden: false, edgeStyle: "curved",
  edgeAnimated: true, edgeAnimatedSelectedOnly: false, edgeStrokeStyle: "solid",
  edgeWidth: 1.5, direction: "TB", hiddenIds: [],
};

describe("panelTree", () => {
  it("split + round-trip", () => {
    const root = defaultTree();
    const t = splitLeaf(root, root.area.id, "h");
    expect(leafCount(t)).toBe(2);
    expect(leafCount(parseTree(serializeTree(t))!)).toBe(2);
  });
  it("join + round-trip", () => {
    const root = splitLeaf(defaultTree(), defaultTree().area.id, "h");
    const leaves = leafList(root);
    const result = joinLeaf(root, leaves[0].area.id);
    expect(leafCount(result)).toBe(1);
  });
  it("migrate v1", () => {
    const t = migrateV1ToTree({ leftAreas: [createArea("layout")], rightAreas: [] });
    expect(leafCount(t)).toBe(2);
  });
  it("dedupe renames duplicate ids", () => {
    const a = createArea("graph");
    const root = { kind: "split", dir: "h", ratio: 0.5,
      first: { kind: "leaf", area: a, primary: true },
      second: { kind: "leaf", area: { ...a, width: 999 }, primary: false },
    } as any;
    const ids = leafList(dedupeLeafIds(root)).map((l) => l.area.id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.length).toBe(2);
  });
  it("splitLeaf preserves primary", () => {
    const root = defaultTree();
    const result = splitLeaf(root, root.area.id, "h");
    const p = leafList(result).find((l) => l.primary);
    expect(p).not.toBeNull();
    expect(p!.area.id).toBe(root.area.id);
  });
});

describe("computeEffectiveHidden", () => {
  const layers: HideLayers = {
    individual: ["a", "b"],
    subtrees: { "parent": ["c", "d"] },
    filesBulkActive: false,
    filesBulkExempt: [],
  };
  it("returns global when no layers", () => {
    expect(computeEffectiveHidden(GLOBAL_HIDDEN, undefined, FILE_IDS)).toEqual(GLOBAL_HIDDEN);
  });
  it("individual + subtree layers overlay global", () => {
    const r = computeEffectiveHidden(GLOBAL_HIDDEN, layers, FILE_IDS);
    expect(r.sort()).toEqual(["a", "b", "c", "d", "g1", "g2"].sort());
  });
  it("bulk files layer adds all files", () => {
    const bulk = { ...layers, filesBulkActive: true };
    const r = computeEffectiveHidden(GLOBAL_HIDDEN, bulk, FILE_IDS);
    expect(r.length).toBe(11);
    expect(r).toContain("f1");
  });
  it("bulk exempt excludes files from bulk layer", () => {
    const bulk = { ...layers, filesBulkActive: true, filesBulkExempt: ["f1"] };
    const r = computeEffectiveHidden(GLOBAL_HIDDEN, bulk, FILE_IDS);
    expect(r).not.toContain("f1");
    expect(r).toContain("f2");
  });
  it("hide A then bulk show -> A still hidden", () => {
    const l: HideLayers = { individual: ["A"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
    expect(computeEffectiveHidden([], l, ["A","B","C"])).toContain("A");
  });
  it("hide A then bulk hide then eye A -> A visible", () => {
    const l: HideLayers = { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: ["A"] };
    expect(computeEffectiveHidden([], l, ["A","B","C"])).not.toContain("A");
  });
  it("subtree show/hide per folder", () => {
    const l: HideLayers = { individual: [], subtrees: { "F": ["c1","c2"] }, filesBulkActive: false, filesBulkExempt: [] };
    expect(computeEffectiveHidden([], l, [])).toContain("c1");
    const cleared: HideLayers = { ...l, subtrees: {} };
    expect(computeEffectiveHidden([], cleared, [])).toHaveLength(0);
  });
});

describe("resolveViewSettings with hideLayers", () => {
  it("no layers -> global defaults", () => {
    const r = resolveViewSettings({}, "x", DEFAULT_RESOLVED, GLOBAL_HIDDEN, FILE_IDS);
    expect(r.showFiles).toBe(true);
    expect(r.hiddenIds).toEqual(GLOBAL_HIDDEN);
  });
  it("bulk active -> showFiles false + files hidden", () => {
    const vs = { hideLayers: { individual: [], subtrees: {}, filesBulkActive: true, filesBulkExempt: [] } };
    const r = resolveViewSettings({ "x": vs }, "x", DEFAULT_RESOLVED, [], FILE_IDS);
    expect(r.showFiles).toBe(false);
    expect(r.hiddenIds).toContain("f1");
    expect(r.hiddenIds).toContain("f5");
  });
  it("bulk active with exempt -> exempt file visible", () => {
    const vs = { hideLayers: { individual: [], subtrees: {}, filesBulkActive: true, filesBulkExempt: ["f1"] } };
    const r = resolveViewSettings({ "x": vs }, "x", DEFAULT_RESOLVED, [], FILE_IDS);
    expect(r.hiddenIds).not.toContain("f1");
    expect(r.hiddenIds).toContain("f2");
  });
});
