import { describe, expect, it } from "bun:test";
import {
  DIALOG_WIDTH,
  TOP_OFFSET,
  THEME_EDITOR_SECTIONS,
  clampDockRaw,
  clampPosition,
  colorOpacityToHexAlpha,
  dialogWidth,
  hexAlphaToColorOpacity,
  snapDockPosition,
} from "./themeEditor";
import { THEME_COLOR_META } from "./types";

// Canvas bounds used across the dock/clamp tests.
const B = { left: 100, top: 80, width: 800, height: 500 };

describe("dialogWidth", () => {
  it("returns the full dialog width on wide viewports", () => {
    expect(dialogWidth(1920)).toBe(DIALOG_WIDTH);
  });

  it("clamps to viewport minus margin on narrow screens", () => {
    expect(dialogWidth(300)).toBe(284);
    expect(dialogWidth(376)).toBe(360); // exactly at the boundary
    expect(dialogWidth(200)).toBe(Math.max(0, 200 - 16));
  });
});

describe("clampPosition", () => {
  it("leaves in-bounds positions alone", () => {
    // Default height = min(85vh, 600) = 600 at vh=800, so maxY = 200.
    expect(clampPosition(100, 150, 1000, 800)).toEqual({ x: 100, y: 150 });
  });

  it("clamps x to [0, viewportWidth - dialogWidth]", () => {
    expect(clampPosition(-50, 300, 1000, 800).x).toBe(0);
    expect(clampPosition(999, 300, 1000, 800).x).toBe(1000 - DIALOG_WIDTH); // 640
  });

  it("clamps y to [TOP_OFFSET, viewportHeight - height]", () => {
    expect(clampPosition(100, 0, 1000, 800).y).toBe(TOP_OFFSET);
  });

  it("uses default height min(85vh, 600) for the y max bound", () => {
    // vh=800 -> h=600 -> maxY = max(80, 800-600) = 200
    expect(clampPosition(100, 1000, 1000, 800).y).toBe(200);
  });

  it("respects an explicit dialogHeight", () => {
    // h=100 -> maxY = max(80, 800-100) = 700
    expect(clampPosition(100, 750, 1000, 800, 100).y).toBe(700);
    expect(clampPosition(100, 500, 1000, 800, 100).y).toBe(500);
  });
});

describe("snapDockPosition", () => {
  it("snaps to the top edge when nearest", () => {
    const snapped = snapDockPosition(500, 90, B);
    expect(snapped.edge).toBe("top");
    expect(snapped.y).toBe(B.top + 12); // pad
  });

  it("snaps to the bottom edge when nearest", () => {
    const snapped = snapDockPosition(500, 570, B);
    expect(snapped.edge).toBe("bottom");
    expect(snapped.y).toBe(B.top + B.height - 12 - 26); // pad + pill height
  });

  it("snaps to the left edge when nearest", () => {
    const snapped = snapDockPosition(105, 550, B);
    expect(snapped.edge).toBe("left");
    expect(snapped.x).toBe(B.left + 12);
  });

  it("snaps to the right edge when nearest", () => {
    const snapped = snapDockPosition(895, 330, B);
    expect(snapped.edge).toBe("right");
    expect(snapped.x).toBe(B.left + B.width - 12 - 26); // pad + vertical pill width
  });

  it("keeps the perpendicular position clamped inside the edge", () => {
    // Near-top point whose pill would overhang the left edge: x clamps to left+pad.
    const snapped = snapDockPosition(105, 82, B);
    expect(snapped.edge).toBe("top");
    expect(snapped.x).toBe(B.left + 12);

    // Near-left point dragged past the bottom clamp: y clamps to bottom limit.
    const snappedLeft = snapDockPosition(105, 550, B);
    expect(snappedLeft.edge).toBe("left");
    expect(snappedLeft.y).toBe(B.top + B.height - 12 - 48); // pad + vertical pill height
  });

  it("keeps in-range perpendicular positions untouched", () => {
    expect(snapDockPosition(500, 90, B).x).toBe(460); // x - horizontalPillW/2 stays within bounds
  });
});

describe("clampDockRaw", () => {
  it("leaves positions inside the bounds untouched", () => {
    expect(clampDockRaw(500, 300, B)).toEqual({ x: 500, y: 300 });
  });

  it("clamps outside positions to bounds minus pill size", () => {
    expect(clampDockRaw(0, 0, B)).toEqual({ x: B.left, y: B.top });
    expect(clampDockRaw(2000, 2000, B)).toEqual({
      x: B.left + B.width - 36,
      y: B.top + B.height - 36,
    });
  });
});

describe("hexAlphaToColorOpacity", () => {
  it("parses #RRGGBBAA into color + rounded opacity", () => {
    expect(hexAlphaToColorOpacity("#fd7e1480")).toEqual({ color: "#fd7e14", opacity: 0.5 }); // 128/255 ≈ 0.502
    expect(hexAlphaToColorOpacity("#fd7e14ff")).toEqual({ color: "#fd7e14", opacity: 1 });
  });

  it("accepts input without the # prefix", () => {
    expect(hexAlphaToColorOpacity("ffa94dab")).toEqual({ color: "#ffa94d", opacity: 0.67 }); // 171/255 ≈ 0.671
  });

  it("preserves the fallback opacity when no alpha channel is present", () => {
    expect(hexAlphaToColorOpacity("#fd7e14", 0.25)).toEqual({ color: "#fd7e14", opacity: 0.25 });
    expect(hexAlphaToColorOpacity("#fd7e14")).toEqual({ color: "#fd7e14", opacity: 1 });
  });
});

describe("colorOpacityToHexAlpha", () => {
  it("appends a two-digit alpha channel", () => {
    expect(colorOpacityToHexAlpha("#fd7e14", 1)).toBe("#fd7e14ff"); // 255 -> "ff"
    expect(colorOpacityToHexAlpha("#fd7e14", 0)).toBe("#fd7e1400"); // 0 -> "00"
    expect(colorOpacityToHexAlpha("#fd7e14", 0.5)).toBe("#fd7e1480"); // round(127.5)=128 -> "80"
  });
});

describe("THEME_EDITOR_SECTIONS", () => {
  it("has the three expected sections", () => {
    expect(THEME_EDITOR_SECTIONS.map((s) => s.title)).toEqual(["Canvas & Text", "Folders", "Files"]);
  });

  it("covers every THEME_COLOR_META key exactly once (no gaps, no duplicates)", () => {
    const sectionKeys = THEME_EDITOR_SECTIONS.flatMap((s) => s.keys.map((m) => m.key));
    const metaKeys = THEME_COLOR_META.map((m) => m.key);
    expect([...sectionKeys].sort()).toEqual([...metaKeys].sort());
    expect(new Set(sectionKeys).size).toBe(sectionKeys.length);
  });
});