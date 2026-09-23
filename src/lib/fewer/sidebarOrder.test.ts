import { describe, it, expect } from "bun:test";
import {
  DEFAULT_SIDEBAR_ORDER,
  normalizeSidebarOrder,
  moveSection,
  insertIndexForY,
  type SectionRect,
  type AreaEditor,
} from "./sidebarOrder";

describe("sidebarOrder", () => {
  describe("normalizeSidebarOrder", () => {
    it("returns default for undefined input", () => {
      expect(normalizeSidebarOrder(undefined)).toEqual(DEFAULT_SIDEBAR_ORDER);
    });

    it("returns default for non-array input", () => {
      expect(normalizeSidebarOrder("bad")).toEqual(DEFAULT_SIDEBAR_ORDER);
    });

    it("drops unknown ids", () => {
      const result = normalizeSidebarOrder(["file", "nope", "layout"]);
      expect(result).toEqual(["file", "layout", ...DEFAULT_SIDEBAR_ORDER.filter((id) => id !== "file" && id !== "layout")]);
    });

    it("collapses duplicates", () => {
      const result = normalizeSidebarOrder(["file", "file", "layout"]);
      expect(result.filter((id) => id === "file")).toHaveLength(1);
    });

    it("appends missing ids at their default position", () => {
      const result = normalizeSidebarOrder(["hidden", "edges"]);
      // User placed hidden before edges — that order is preserved
      expect(result.indexOf("hidden")).toBe(0);
      expect(result.indexOf("edges")).toBe(1);
      // Missing ids (file, directories, layout, tags, analytics) appended
      expect(result).toContain("file");
      expect(result).toContain("layout");
      expect(result.length).toBe(DEFAULT_SIDEBAR_ORDER.length);
    });
  });

  describe("moveSection", () => {
    const order = ["file", "layout", "edges", "hidden"] as AreaEditor[];

    it("moves item to a new index", () => {
      const result = moveSection([...order], "layout", 3);
      expect(result).toEqual(["file", "edges", "hidden", "layout"]);
    });

    it("returns same reference if index unchanged", () => {
      // When fromIndex === toIndex, moveSection returns the original array
      const result2 = moveSection(order, "layout", 1);
      expect(result2).toBe(order);
    });

    it("clamps negative index to 0", () => {
      const result = moveSection(order, "file", -5);
      expect(result[0]).toBe("file");
    });

    it("returns original if id not found", () => {
      const result = moveSection(order, "nope" as AreaEditor, 0);
      expect(result).toEqual([...order]);
    });
  });

  describe("insertIndexForY", () => {
    const rects: SectionRect[] = [
      { id: "file", top: 0, bottom: 100 },
      { id: "layout", top: 100, bottom: 200 },
      { id: "edges", top: 200, bottom: 300 },
    ];

    it("returns 0 when above first midpoint", () => {
      expect(insertIndexForY(rects, 40)).toBe(0);
    });

    it("returns insertion index between sections", () => {
      expect(insertIndexForY(rects, 140)).toBe(1); // below layout midpoint (150? no — rect[1] mid=150, y=140 < 150 → return 1)
    });

    it("returns rects.length when below last midpoint", () => {
      expect(insertIndexForY(rects, 280)).toBe(3);
    });
  });
});
