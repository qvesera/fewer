import { describe, it, expect } from "bun:test";
import { resolveViewSettings, parseViewSettings, mergeViewSettings } from "./viewState";
import type { ViewSettings, ResolvedViewSettings } from "./viewState";

const globalDefaults: ResolvedViewSettings = {
  showFiles: true,
  minimapHidden: false,
  edgeStyle: "curved",
  edgeAnimated: true,
  edgeAnimatedSelectedOnly: false,
  edgeStrokeStyle: "solid",
  edgeWidth: 1.5,
  direction: "TB",
  hiddenIds: [],
};

describe("resolveViewSettings", () => {
  it("uses globals when no leaf overrides", () => {
    const result = resolveViewSettings({}, "any-id", globalDefaults);
    expect(result).toEqual(globalDefaults);
  });

  it("uses globals when leafId is null", () => {
    const result = resolveViewSettings({ "x": { showFiles: false } }, null, globalDefaults);
    expect(result.showFiles).toBe(true);
  });

  it("leaf override wins for showFiles", () => {
    const result = resolveViewSettings({ "x": { showFiles: false } }, "x", globalDefaults);
    expect(result.showFiles).toBe(false);
  });

  it("leaf override wins for edgeStyle", () => {
    const result = resolveViewSettings({ "x": { edgeStyle: "straight" } }, "x", globalDefaults);
    expect(result.edgeStyle).toBe("straight");
  });

  it("partial override merges with globals", () => {
    const result = resolveViewSettings({ "x": { showFiles: false, edgeWidth: 3 } }, "x", globalDefaults);
    expect(result.showFiles).toBe(false);
    expect(result.edgeWidth).toBe(3);
    expect(result.edgeStyle).toBe("curved"); // global
  });

  it("empty override object falls back to globals", () => {
    const result = resolveViewSettings({ "x": {} }, "x", globalDefaults);
    expect(result).toEqual(globalDefaults);
  });
});

describe("parseViewSettings", () => {
  it("null returns empty", () => {
    expect(parseViewSettings(null)).toEqual({});
  });

  it("valid settings preserved", () => {
    const raw = { "a": { showFiles: false, edgeStyle: "angled" } };
    expect(parseViewSettings(raw)).toEqual({ "a": { showFiles: false, edgeStyle: "angled" } });
  });

  it("invalid keys stripped", () => {
    const raw = { "a": { showFiles: true, bogus: "x" } };
    const result = parseViewSettings(raw);
    expect(result.a).toEqual({ showFiles: true });
  });

  it("non-object entries ignored", () => {
    const raw = { "a": "not-object", "b": null, "c": 42 };
    expect(parseViewSettings(raw)).toEqual({});
  });
});

describe("mergeViewSettings", () => {
  it("migrates showFilesByLeaf", () => {
    const result = mergeViewSettings({ "a": false }, undefined, undefined);
    expect(result.a?.showFiles).toBe(false);
  });

  it("migrates minimapHiddenByIds", () => {
    const result = mergeViewSettings(undefined, new Set(["b"]), undefined);
    expect(result.b?.minimapHidden).toBe(true);
  });

  it("preserves existing viewSettings", () => {
    const existing = { "c": { edgeStyle: "straight" as const } };
    const result = mergeViewSettings({ "c": false }, undefined, existing);
    expect(result.c?.edgeStyle).toBe("straight");
    expect(result.c?.showFiles).toBe(false);
  });

  it("combines all three sources", () => {
    const result = mergeViewSettings(
      { "x": true },
      new Set(["x"]),
      { "x": { edgeStyle: "angled" } },
    );
    expect(result.x).toEqual({ showFiles: true, minimapHidden: true, edgeStyle: "angled" });
  });
});