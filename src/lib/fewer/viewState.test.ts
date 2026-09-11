import { describe, expect, test } from "bun:test";
import {
  computeEffectiveHidden,
  emptyHideLayers,
  mergeViewSettings,
  parseViewSettings,
  resolveViewSettings,
  type ResolvedViewSettings,
  type ViewSettings,
} from "./viewState";

const GLOBAL: ResolvedViewSettings = {
  showFiles: true,
  minimapHidden: false,
  edgeStyle: "curved",
  edgeAnimated: false,
  edgeAnimatedSelectedOnly: false,
  edgeStrokeStyle: "solid",
  edgeWidth: 2,
  direction: "TB",
  hiddenIds: [],
  collapsedFolderIds: [],
};

describe("computeEffectiveHidden", () => {
  test("no layers → global hidden ids unchanged", () => {
    expect(computeEffectiveHidden(["a", "b"], undefined, [])).toEqual(["a", "b"]);
  });

  test("layers union individual hides, subtree hides, and global ids", () => {
    const layers = emptyHideLayers();
    layers.individual = ["a"];
    layers.subtrees = { f1: ["c", "d"], f2: ["e"] };
    expect(computeEffectiveHidden(["b"], layers, []).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("bulk files layer hides all files except exempt ones", () => {
    const layers = emptyHideLayers();
    layers.filesBulkActive = true;
    layers.filesBulkExempt = ["keep-me"];
    expect(computeEffectiveHidden([], layers, ["f1", "f2", "keep-me"])).toEqual(["f1", "f2"]);
  });
});

describe("resolveViewSettings — override resolution", () => {
  test("leaf override wins; global fills the rest", () => {
    const leaf: ViewSettings = { edgeStyle: "angled", edgeWidth: 4, minimapHidden: true };
    const r = resolveViewSettings({ leaf1: leaf }, "leaf1", GLOBAL);
    expect(r.edgeStyle).toBe("angled");
    expect(r.edgeWidth).toBe(4);
    expect(r.minimapHidden).toBe(true);
    // untouched fields fall back to global
    expect(r.direction).toBe("TB");
    expect(r.edgeAnimated).toBe(false);
    expect(r.edgeStrokeStyle).toBe("solid");
  });

  test("unknown leaf id → pure global resolution", () => {
    const r = resolveViewSettings({}, "missing", GLOBAL);
    expect(r).toEqual({ ...GLOBAL, hiddenIds: [], collapsedFolderIds: [] });
  });

  test("showFiles false when the leaf's bulk layer is active", () => {
    const leaf: ViewSettings = { hideLayers: { individual: [], subtrees: {}, filesBulkActive: true, filesBulkExempt: [] } };
    expect(resolveViewSettings({ l: leaf }, "l", GLOBAL).showFiles).toBe(false);
    expect(resolveViewSettings({}, "l", GLOBAL).showFiles).toBe(true);
  });

  test("collapsed folders pass through to the leaf list", () => {
    const leaf: ViewSettings = { collapsedFolderIds: ["f1", "f2"] };
    expect(resolveViewSettings({ l: leaf }, "l", GLOBAL).collapsedFolderIds).toEqual(["f1", "f2"]);
  });
});

describe("parseViewSettings — sanitize + v1→v2 migration", () => {
  test("non-object input yields an empty map", () => {
    expect(parseViewSettings(null)).toEqual({});
    expect(parseViewSettings("nope")).toEqual({});
    expect(parseViewSettings({ leaf: 42 })).toEqual({});
  });

  test("keeps only well-typed fields, drops garbage", () => {
    const out = parseViewSettings({
      leaf: {
        edgeStyle: "angled",
        edgeWidth: "not-a-number",
        minimapHidden: true,
        direction: 7,
        extra: "ignored",
      },
    });
    expect(out.leaf).toEqual({ edgeStyle: "angled", minimapHidden: true });
  });

  test("sanitizeHideLayers drops non-string members and bogus subtrees", () => {
    const out = parseViewSettings({
      leaf: {
        hideLayers: {
          individual: ["a", 5, null, "b"],
          subtrees: { f: ["c", {}, "d"], bad: "nope" },
          filesBulkActive: "yes",
          filesBulkExempt: ["e", 1],
        },
      },
    });
    const hl = out.leaf!.hideLayers!;
    expect(hl.individual).toEqual(["a", "b"]);
    expect(hl.subtrees).toEqual({ f: ["c", "d"] });
    expect(hl.filesBulkActive).toBe(false);
    expect(hl.filesBulkExempt).toEqual(["e"]);
  });

  test("v1 compat: legacy showFiles boolean becomes a filesBulkActive layer", () => {
    const out = parseViewSettings({ leaf: { showFiles: false } });
    expect(out.leaf!.hideLayers).toEqual({
      individual: [],
      subtrees: {},
      filesBulkActive: true,
      filesBulkExempt: [],
    });
  });

  test("v1 compat: legacy hiddenIds array becomes the individual layer", () => {
    const out = parseViewSettings({ leaf: { hiddenIds: ["x", "y"] } });
    expect(out.leaf!.hideLayers).toEqual({
      individual: ["x", "y"],
      subtrees: {},
      filesBulkActive: false,
      filesBulkExempt: [],
    });
  });

  test("empty leaves are dropped from the map", () => {
    expect(parseViewSettings({ empty: {}, real: { minimapHidden: true } })).toEqual({
      real: { minimapHidden: true },
    });
  });
});

describe("mergeViewSettings — v1/v2 → v3 migration", () => {
  test("converts showFiles booleans into filesBulkActive layers", () => {
    const out = mergeViewSettings({ l1: true, l2: false }, undefined, undefined);
    expect(out.l1!.hideLayers!.filesBulkActive).toBe(false);
    expect(out.l2!.hideLayers!.filesBulkActive).toBe(true);
  });

  test("flips filesBulkActive on an existing hideLayers without touching individual", () => {
    const existing: ViewSettings = {
      hideLayers: { individual: ["a"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] },
    };
    const out = mergeViewSettings({ l1: false }, undefined, { l1: existing });
    const hl = out.l1!.hideLayers!;
    expect(hl.filesBulkActive).toBe(true);
    expect(hl.individual).toEqual(["a"]);
  });

  test("applies minimap-hidden ids on top", () => {
    const out = mergeViewSettings(undefined, new Set(["l1", "l3"]), undefined);
    expect(out.l1!.minimapHidden).toBe(true);
    expect(out.l3!.minimapHidden).toBe(true);
  });
});
