import { describe, expect, test } from "bun:test";
import {
  computeEffectiveHidden,
  emptyHideLayers,
  mergeViewSettings,
  needsLayoutDerivation,
  parseViewSettings,
  resolveViewNodes,
  resolveViewSettings,
  withCollapsedPillGeometry,
  type ResolvedViewSettings,
  type ViewSettings,
} from "./viewState";
import { COLLAPSED_PILL_HEIGHT, type FewerEdge, type FewerNode } from "./types";

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

  test("v1 compat: legacy showFiles wins over legacy hiddenIds", () => {
    const out = parseViewSettings({ leaf: { showFiles: false, hiddenIds: ["x", "y"] } });
    expect(out.leaf!.hideLayers).toEqual({
      individual: [],
      subtrees: {},
      filesBulkActive: true,
      filesBulkExempt: [],
    });
  });

  test("an explicit v2 layer beats both legacy fields", () => {
    const out = parseViewSettings({
      leaf: { hideLayers: emptyHideLayers(), showFiles: false, hiddenIds: ["x"] },
    });
    expect(out.leaf!.hideLayers).toEqual(emptyHideLayers());
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
describe("resolveViewNodes", () => {
  const global = {
    direction: "TB" as const,
    hiddenIds: [] as string[],
    fileIds: [] as string[],
  };
  const node = (id: string, x: number, y: number): FewerNode =>
    ({
      id,
      position: { x, y },
      data: { label: id, path: `/${id}`, type: "folder" },
    }) as unknown as FewerNode;
  const resolved = (
    extra: Partial<ResolvedViewSettings> = {},
  ): ResolvedViewSettings => ({ ...GLOBAL, ...extra });
  const chain = (ids: string[]): FewerEdge[] =>
    ids.slice(1).map((id, i) => ({
      id: `e${i}`,
      source: ids[i],
      target: id,
    })) as FewerEdge[];
  const samePosition = (out: FewerNode[]) => out[1]!.position;

  test("no overrides → shared positions pass through untouched", () => {
    const nodes = [node("a", 1, 2)];
    expect(resolveViewNodes(nodes, [], undefined, resolved(), global)).toBe(nodes);
  });

  test("per-view card positions win over the shared ones", () => {
    const nodes = [node("a", 0, 0), node("b", 10, 10)];
    const positions = { b: { x: 99, y: 88 } };
    const out = resolveViewNodes(nodes, [], { positions }, resolved({ positions }), global);
    expect(out.find((n) => n.id === "b")!.position).toEqual({ x: 99, y: 88 });
    // A card the view has no position for keeps the shared one — and its identity.
    expect(out[0]).toBe(nodes[0]);
  });

  test("a direction override re-derives instead of reusing shared positions", () => {
    const nodes = [node("a", 5, 5), node("b", 5, 5)];
    const out = resolveViewNodes(
      nodes,
      chain(["a", "b"]),
      { direction: "LR" },
      resolved({ direction: "LR" }),
      global,
    );
    expect(samePosition(out)).not.toEqual({ x: 5, y: 5 });
  });

  test("a collapsed folder alone forces a derived layout too", () => {
    const nodes = [node("a", 5, 5), node("b", 5, 5)];
    const out = resolveViewNodes(
      nodes,
      chain(["a", "b"]),
      { collapsedFolderIds: ["a"] },
      resolved({ collapsedFolderIds: ["a"] }),
      global,
    );
    expect(samePosition(out)).not.toEqual({ x: 5, y: 5 });
  });

  test("derived layouts honour the global Crown Shyness intensity", () => {
    const nodes = [node("a", 0, 0), node("b", 0, 0), node("c", 0, 0)];
    const edges = [
      { id: "e0", source: "a", target: "b" },
      { id: "e1", source: "a", target: "c" },
    ] as FewerEdge[];
    const view = { direction: "LR" } as ViewSettings;
    // Siblings in an LR layout separate along Y.
    const span = (out: FewerNode[]) => {
      const ys = out.map((n) => n.position.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const tight = resolveViewNodes(nodes, edges, view, resolved({ direction: "LR" }), global, {
      shynessScale: 0,
    });
    const loose = resolveViewNodes(nodes, edges, view, resolved({ direction: "LR" }), global, {
      shynessScale: 3,
    });
    expect(span(loose)).toBeGreaterThan(span(tight));
  });
});

describe("needsLayoutDerivation", () => {
  const global = { direction: "TB" as const, hiddenIds: [] as string[] };
  const files = ["f1", "f2"];

  test("no view settings → shared layout", () => {
    expect(needsLayoutDerivation(undefined, global, files)).toBe(false);
    expect(needsLayoutDerivation({}, global, files)).toBe(false);
  });

  test("per-view card positions alone are not a derivation", () => {
    expect(needsLayoutDerivation({ positions: { n1: { x: 1, y: 2 } } }, global, files)).toBe(false);
  });

  test("a direction that differs from the global one derives", () => {
    expect(needsLayoutDerivation({ direction: "LR" }, global, files)).toBe(true);
    // Explicitly re-declaring the global direction is not a divergence.
    expect(needsLayoutDerivation({ direction: "TB" }, global, files)).toBe(false);
  });

  test("collapsed folders derive", () => {
    expect(needsLayoutDerivation({ collapsedFolderIds: ["a"] }, global, files)).toBe(true);
    expect(needsLayoutDerivation({ collapsedFolderIds: [] }, global, files)).toBe(false);
  });

  test("hide layers only derive when they actually change the visible set", () => {
    expect(needsLayoutDerivation({ hideLayers: emptyHideLayers() }, global, files)).toBe(false);
    expect(needsLayoutDerivation({ hideLayers: { ...emptyHideLayers(), individual: ["a"] } }, global, files)).toBe(true);
    expect(needsLayoutDerivation({ hideLayers: { ...emptyHideLayers(), filesBulkActive: true } }, global, files)).toBe(true);
    expect(needsLayoutDerivation({ hideLayers: { ...emptyHideLayers(), subtrees: { a: [] } } }, global, files)).toBe(false);
  });

  test("hiding an id that is globally hidden already does not derive", () => {
    const withGlobal: { direction: "TB"; hiddenIds: string[] } = { direction: "TB", hiddenIds: ["a"] };
    expect(needsLayoutDerivation({ hideLayers: { ...emptyHideLayers(), individual: ["a"] } }, withGlobal, files)).toBe(false);
  });
});

describe("withCollapsedPillGeometry", () => {
  const node = (id: string, type: "folder" | "file", height: number): FewerNode =>
    ({
      id,
      position: { x: 0, y: 0 },
      data: { label: id, path: `/${id}`, type },
      style: { width: 200, height },
    }) as unknown as FewerNode;

  test("leaf collapses nothing → same array identity", () => {
    const nodes = [node("a", "folder", 240)];
    expect(withCollapsedPillGeometry(nodes, [])).toBe(nodes);
  });

  test("only the collapsed folder takes the pill height; shared nodes stay untouched", () => {
    const nodes = [node("a", "folder", 240), node("b", "folder", 240), node("c", "file", 58)];
    const out = withCollapsedPillGeometry(nodes, ["a"]);
    expect(out[0]!.style?.height).toBe(COLLAPSED_PILL_HEIGHT);
    // A sibling folder in the SAME leaf keeps its expanded height…
    expect(out[1]).toBe(nodes[1]);
    expect(out[2]).toBe(nodes[2]);
    // …and the shared node the leaf copied from is never mutated.
    expect(nodes[0]!.style?.height).toBe(240);
  });

  test("a file id in the collapsed list is ignored", () => {
    const nodes = [node("c", "file", 58)];
    expect(withCollapsedPillGeometry(nodes, ["c"])[0]).toBe(nodes[0]);
  });
});
});
