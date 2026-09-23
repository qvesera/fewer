import { describe, it, expect } from "bun:test";
import {
  REORDER_EASE,
  REORDER_DURATION_MS,
  computeFlipOffsets,
} from "./reorderMotion";

describe("reorderMotion", () => {
  describe("computeFlipOffsets", () => {
    it("returns deltas for moved ids", () => {
      const prev = new Map([["a", 0], ["b", 100], ["c", 200]]);
      const next = new Map([["a", 100], ["b", 0], ["c", 200]]);
      const result = computeFlipOffsets(prev, next);
      expect(result).toEqual([
        { id: "a", dy: -100 },
        { id: "b", dy: 100 },
      ]);
    });

    it("skips ids missing on either side", () => {
      const prev = new Map([["a", 0], ["b", 100]]);
      const next = new Map([["b", 100], ["c", 200]]);
      const result = computeFlipOffsets(prev, next);
      // b: dy=0 → skip; a: missing in next; c: missing in prev
      expect(result).toEqual([]);
    });

    it("skips sub-pixel deltas", () => {
      const prev = new Map([["a", 0], ["b", 100]]);
      const next = new Map([["a", 0.5], ["b", 100]]);
      const result = computeFlipOffsets(prev, next);
      expect(result).toEqual([]);
    });

    it("returns empty under reduced motion", () => {
      const prev = new Map([["a", 0], ["b", 100]]);
      const next = new Map([["a", 100], ["b", 0]]);
      const result = computeFlipOffsets(prev, next, { reducedMotion: true });
      expect(result).toEqual([]);
    });

    it("respects custom minDeltaPx", () => {
      const prev = new Map([["a", 0]]);
      const next = new Map([["a", 5]]);
      const result = computeFlipOffsets(prev, next, { minDeltaPx: 10 });
      expect(result).toEqual([]);
    });
  });

  it("constants match the repo's sidebar easing curve", () => {
    expect(REORDER_EASE).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(REORDER_DURATION_MS).toBe(180);
  });
});
