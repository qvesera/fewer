import { describe, expect, it } from "bun:test";
import {
  DIALOG_WIDTH,
  TOP_OFFSET,
  THEME_EDITOR_SECTIONS,
  SECTION_UNDO_LIMIT,
  SECTION_UNDO_COALESCE_MS,
  clampDockRaw,
  clampPosition,
  colorOpacityToHexAlpha,
  dialogWidth,
  hexAlphaToColorOpacity,
  snapDockPosition,
  sectionDiffers,
  snapshotSection,
  recordSectionChange,
  sectionUndoDepth,
  popSectionUndo,
} from "./themeEditor";
import { THEME_COLOR_META, type CustomTheme } from "./types";

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

// A minimal CustomTheme-shaped object for undo tests (only the fields that
// slotEquals compares). Cast via Partial<CustomTheme> where needed.
function makeTheme(overrides: Record<string, { color: string; opacity: number; gradientTo?: string | null; gradientAngle?: number }>): CustomTheme {
  const base: Record<string, { color: string; opacity: number; gradientTo?: string | null; gradientAngle?: number }> = {};
  for (const m of THEME_COLOR_META) base[m.key] = { color: m.defaultColor, opacity: m.defaultOpacity };
  return { ...base, ...overrides } as unknown as CustomTheme;
}

describe("per-section undo", () => {
  const section = THEME_EDITOR_SECTIONS[0]; // Canvas & Text

  describe("sectionDiffers", () => {
    it("returns false when nothing changed", () => {
      const t = makeTheme({});
      expect(sectionDiffers(section, t, makeTheme({}))).toBe(false);
    });

    it("detects a color change in the section", () => {
      const prev = makeTheme({});
      const next = makeTheme({ background: { color: "#123456", opacity: 1 } });
      expect(sectionDiffers(section, prev, next)).toBe(true);
    });

    it("detects opacity and gradient field changes", () => {
      const prev = makeTheme({ background: { color: "#000000", opacity: 1, gradientTo: null } });
      const nextOpacity = makeTheme({ background: { color: "#000000", opacity: 0.5, gradientTo: null } });
      expect(sectionDiffers(section, prev, nextOpacity)).toBe(true);

      const nextGrad = makeTheme({ background: { color: "#000000", opacity: 1, gradientTo: "#ffffff", gradientAngle: 90 } });
      expect(sectionDiffers(section, prev, nextGrad)).toBe(true);
    });

    it("returns false for changes outside the section", () => {
      const prev = makeTheme({});
      const next = makeTheme({ folderBg: { color: "#123456", opacity: 0.5 } });
      expect(sectionDiffers(section, prev, next)).toBe(false);
    });
  });

  describe("snapshotSection", () => {
    it("captures only the section's slots", () => {
      const t = makeTheme({ background: { color: "#123456", opacity: 0.4, gradientTo: "#abcdef", gradientAngle: 45 } });
      const snap = snapshotSection(section, t);
      expect(snap.background).toEqual({ color: "#123456", opacity: 0.4, gradientTo: "#abcdef", gradientAngle: 45 });
      expect(snap.folderBg).toBeUndefined();
    });

    it("produces an independent copy (no shared references)", () => {
      const t = makeTheme({});
      const snap = snapshotSection(section, t);
      (snap.background as { color: string }).color = "#000000";
      expect((t.background as { color: string }).color).not.toBe("#000000");
    });
  });

  describe("recordSectionChange", () => {
    it("pushes the previous state when a section changes", () => {
      const prev = makeTheme({});
      const next = makeTheme({ background: { color: "#123456", opacity: 1 } });
      const { stacks } = recordSectionChange(THEME_EDITOR_SECTIONS, prev, next, {}, {}, 1000, false);
      expect(stacks["Canvas & Text"]).toHaveLength(1);
      expect((stacks["Canvas & Text"]![0].background as { color: string }).color).toBe(
        THEME_COLOR_META.find((m) => m.key === "background")!.defaultColor,
      );
    });

    it("does not push when nothing changed", () => {
      const t = makeTheme({});
      const { stacks, changed } = recordSectionChange(THEME_EDITOR_SECTIONS, t, makeTheme({}), {}, {}, 1000, false);
      expect(changed).toBe(false);
      expect(stacks["Canvas & Text"]).toEqual([]);
    });

    it("coalesces edits within the window into one step", () => {
      let state = recordSectionChange(
        THEME_EDITOR_SECTIONS,
        makeTheme({}),
        makeTheme({ background: { color: "#111111", opacity: 1 } }),
        {},
        {},
        1000,
        false,
      );
      state = recordSectionChange(
        THEME_EDITOR_SECTIONS,
        makeTheme({ background: { color: "#111111", opacity: 1 } }),
        makeTheme({ background: { color: "#222222", opacity: 1 } }),
        state.stacks,
        state.lastChangeAt,
        1200,
        false,
      );
      expect(state.stacks["Canvas & Text"]).toHaveLength(1);
    });

    it("starts a new step after the coalesce window elapses", () => {
      let state = recordSectionChange(
        THEME_EDITOR_SECTIONS,
        makeTheme({}),
        makeTheme({ background: { color: "#111111", opacity: 1 } }),
        {},
        {},
        1000,
        false,
      );
      state = recordSectionChange(
        THEME_EDITOR_SECTIONS,
        makeTheme({ background: { color: "#111111", opacity: 1 } }),
        makeTheme({ background: { color: "#222222", opacity: 1 } }),
        state.stacks,
        state.lastChangeAt,
        1000 + SECTION_UNDO_COALESCE_MS + 1,
        false,
      );
      expect(state.stacks["Canvas & Text"]).toHaveLength(2);
    });

    it("does not record while undoing", () => {
      const prev = makeTheme({});
      const next = makeTheme({ background: { color: "#123456", opacity: 1 } });
      const { stacks, changed } = recordSectionChange(THEME_EDITOR_SECTIONS, prev, next, {}, {}, 1000, true);
      expect(changed).toBe(false);
      expect(stacks["Canvas & Text"]).toBeUndefined();
    });

    it("respects the per-section undo limit", () => {
      let state: { stacks: Record<string, Partial<CustomTheme>[]>; lastChangeAt: Record<string, number> } = { stacks: {}, lastChangeAt: {} };
      for (let i = 0; i < SECTION_UNDO_LIMIT + 5; i++) {
        const prev = makeTheme({ background: { color: `#${i.toString(16).padStart(6, "0")}`, opacity: 1 } });
        const next = makeTheme({ background: { color: `#${(i + 1).toString(16).padStart(6, "0")}`, opacity: 1 } });
        state = recordSectionChange(THEME_EDITOR_SECTIONS, prev, next, state.stacks, state.lastChangeAt, 1000 + i * (SECTION_UNDO_COALESCE_MS + 1), false);
      }
      expect(state.stacks["Canvas & Text"]).toHaveLength(SECTION_UNDO_LIMIT);
    });
  });

  describe("sectionUndoDepth / popSectionUndo", () => {
    it("reports depth and pops in LIFO order", () => {
      const mid = makeTheme({ background: { color: "#111111", opacity: 1 } });
      let { stacks } = recordSectionChange(THEME_EDITOR_SECTIONS, makeTheme({}), mid, {}, {}, 1000, false);
      ({ stacks } = recordSectionChange(THEME_EDITOR_SECTIONS, mid, makeTheme({ background: { color: "#222222", opacity: 1 } }), stacks, {}, 2000, false));

      expect(sectionUndoDepth("Canvas & Text", stacks)).toBe(2);

      let pop = popSectionUndo(stacks["Canvas & Text"]!);
      expect(pop.snapshot).toBeDefined();
      expect(pop.stack).toHaveLength(1);
      expect((pop.snapshot!.background as { color: string }).color).toBe("#111111");

      pop = popSectionUndo(pop.stack);
      expect((pop.snapshot!.background as { color: string }).color).toBe(
        THEME_COLOR_META.find((m) => m.key === "background")!.defaultColor,
      );
      expect(pop.stack).toHaveLength(0);

      pop = popSectionUndo(pop.stack);
      expect(pop.snapshot).toBeUndefined();
    });

    it("does not mutate the input stack", () => {
      const { stacks } = recordSectionChange(
        THEME_EDITOR_SECTIONS,
        makeTheme({}),
        makeTheme({ background: { color: "#123456", opacity: 1 } }),
        {},
        {},
        1000,
        false,
      );
      const before = JSON.stringify(stacks);
      popSectionUndo(stacks["Canvas & Text"]!);
      expect(JSON.stringify(stacks)).toBe(before);
    });
  });
});