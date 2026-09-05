import { describe, it, expect } from "bun:test";
import {
  clampWidth,
  createArea,
  sectionsDockedAnywhere,
  dropSideForPointerX,
  parseLayoutStorage,
  serializeLayoutStorage,
  defaultLayout,
  MIN_AREA_WIDTH,
  MAX_AREA_WIDTH,
} from "./panelLayout";

describe("panelLayout", () => {
  describe("clampWidth", () => {
    it("clamps below minimum", () => {
      expect(clampWidth(50)).toBe(MIN_AREA_WIDTH);
    });

    it("clamps above maximum", () => {
      expect(clampWidth(999)).toBe(MAX_AREA_WIDTH);
    });

    it("passes through valid range", () => {
      expect(clampWidth(300)).toBe(300);
    });
  });

  describe("createArea", () => {
    it("creates section area with default width", () => {
      const a = createArea("layout");
      expect(a.editor).toBe("layout");
      expect(a.width).toBe(280);
      expect(a.id).toContain("area-");
    });

    it("creates graph area with default width", () => {
      const a = createArea("graph");
      expect(a.width).toBe(480);
    });

    it("honors custom width", () => {
      const a = createArea("edges", 350);
      expect(a.width).toBe(350);
    });
  });

  describe("sectionsDockedAnywhere", () => {
    it("returns empty when no areas", () => {
      const s = sectionsDockedAnywhere([], []);
      expect(s.size).toBe(0);
    });

    it("collects section editors from both sides", () => {
      const a1 = createArea("layout");
      const a2 = createArea("tags");
      const s = sectionsDockedAnywhere([a1], [a2]);
      expect(s.has("layout")).toBe(true);
      expect(s.has("tags")).toBe(true);
    });

    it("excludes graph editor", () => {
      const a = createArea("graph");
      const s = sectionsDockedAnywhere([a], []);
      expect(s.size).toBe(0);
    });
  });

  describe("dropSideForPointerX", () => {
    it("left half → left", () => {
      expect(dropSideForPointerX(100, 1920)).toBe("left");
    });

    it("right half → right", () => {
      expect(dropSideForPointerX(1800, 1920)).toBe("right");
    });

    it("exact center → right", () => {
      expect(dropSideForPointerX(960, 1920)).toBe("right");
    });
  });

  describe("parseLayoutStorage / serializeLayoutStorage round-trip", () => {
    it("null returns null", () => {
      expect(parseLayoutStorage(null)).toBeNull();
    });

    it("invalid JSON returns null", () => {
      expect(parseLayoutStorage("not-json")).toBeNull();
    });

    it("round-trips valid snapshot", () => {
      const snap = {
        sidebarSide: "right" as const,
        leftAreas: [createArea("layout"), createArea("graph", 500)],
        rightAreas: [],
      };
      const raw = serializeLayoutStorage(snap);
      expect(parseLayoutStorage(raw)).toEqual(snap);
    });

    it("filters invalid editors", () => {
      const raw = JSON.stringify({
        sidebarSide: "left",
        leftAreas: [{ id: "x", width: 200, editor: "bogus" }],
        rightAreas: [],
      });
      const snap = parseLayoutStorage(raw);
      expect(snap!.leftAreas).toHaveLength(0);
    });

    it("defaults sidebarSide on invalid value", () => {
      const raw = JSON.stringify({ sidebarSide: 42, leftAreas: [], rightAreas: [] });
      const snap = parseLayoutStorage(raw);
      expect(snap!.sidebarSide).toBe("left");
    });
  });

  describe("defaultLayout", () => {
    it("sidebar left, no areas", () => {
      const d = defaultLayout();
      expect(d.sidebarSide).toBe("left");
      expect(d.leftAreas).toHaveLength(0);
      expect(d.rightAreas).toHaveLength(0);
    });
  });
});
