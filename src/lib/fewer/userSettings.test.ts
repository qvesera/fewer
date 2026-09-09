import { describe, it, expect } from "bun:test";
import { applyUserSettings, settingsChanged } from "./userSettings";
import { useGraphStore } from "@/store/graphStore";
import { parseLayoutStorage } from "./panelLayout";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";

const DEFAULT_EXPORT = { format: "json" as const, quality: 80, transparentBackground: false, includeStats: false, includeBranding: false };

function makeStore(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    themeMode: "dark",
    direction: "LR",
    edgeStyle: "curved",
    edgeAnimated: false,
    edgeAnimatedSelectedOnly: false,
    edgeStrokeStyle: "solid",
    edgeAnimatedStrokeStyle: "solid",
    edgeWidth: 2,
    cornerRadius: 8,
    nodeWidth: 180,
    nodeHeight: 60,
    sortKey: "name",
    sortDir: "asc",
    showMiniMap: true,
    miniMapPosition: "bottom-right",
    miniMapSize: 150,
    miniMapX: 0,
    miniMapY: 0,
    scrollAction: "pan",
    showFiles: true,
    maxDisplayDepth: 0,
    autoHideThreshold: 0,
    advancedModeEnabled: false,
    includeFiles: true,
    importOptions: DEFAULT_IMPORT_OPTIONS,
    exportSettings: DEFAULT_EXPORT,
    sidebarOpen: true,
    advancedOpen: false,
    sidebarSide: "left",
    panelTree: { kind: "leaf", area: { id: "test-graph", width: 480, editor: "graph" }, primary: true },
    viewSettings: {},
    ...overrides,
  };
}

function minimalSettings(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    themeMode: "dark" as const,
    direction: "LR" as const,
    edgeStyle: "curved" as const,
    edgeAnimated: false,
    edgeAnimatedSelectedOnly: false,
    edgeStrokeStyle: "solid" as const,
    edgeAnimatedStrokeStyle: "solid" as const,
    edgeWidth: 2,
    cornerRadius: 8,
    nodeWidth: 180,
    nodeHeight: 60,
    sortKey: "name" as const,
    sortDir: "asc" as const,
    showMiniMap: true,
    miniMapPosition: "bottom-right",
    miniMapSize: 150,
    miniMapX: 0,
    miniMapY: 0,
    scrollAction: "pan" as const,
    showFiles: true,
    maxDisplayDepth: 0,
    autoHideThreshold: 0,
    advancedModeEnabled: false,
    includeFiles: true,
    importOptions: DEFAULT_IMPORT_OPTIONS,
    exportSettings: DEFAULT_EXPORT,
    sidebarOpen: true,
    advancedOpen: false,
    ...overrides,
  };
}

describe("userSettings panelLayout", () => {
  it("applyUserSettings sets panelTree from cloud payload", () => {
    applyUserSettings(minimalSettings({
      panelLayout: {
        sidebarSide: "right",
        panelTree: {
          kind: "split",
          dir: "h",
          ratio: 0.5,
          first: { kind: "leaf", area: { id: "g1", width: 400, editor: "graph" }, primary: true },
          second: { kind: "leaf", area: { id: "t1", width: 250, editor: "tags" }, primary: false },
        },
        viewSettings: { g1: { edgeStyle: "angled" } },
      },
    }));

    const state = useGraphStore.getState();
    expect(state.sidebarSide).toBe("right");
    expect(state.panelTree.kind).toBe("split");
    expect(state.viewSettings["g1"]?.edgeStyle).toBe("angled");
  });

  it("applyUserSettings skips invalid panelTree gracefully", () => {
    // Reset to default first (prior test set split)
    useGraphStore.getState().resetPanelLayout();
    applyUserSettings(minimalSettings({
      panelLayout: {
        sidebarSide: "left",
        panelTree: { kind: "banana" } as never,
      },
    }));
    // parseTree returns null → panel layout left untouched (still default)
    const state = useGraphStore.getState();
    expect(state.panelTree.kind).toBe("leaf");
  });

  it("settingsChanged detects panelLayout differences via store fields", () => {
    // settingsChanged uses pick() which reads sidebarSide/panelTree/viewSettings
    const a = makeStore();
    const b = makeStore({ sidebarSide: "right" });
    expect(settingsChanged(a, b)).toBe(true);
  });

  it("settingsChanged returns false for identical stores", () => {
    const a = makeStore();
    const b = makeStore();
    expect(settingsChanged(a, b)).toBe(false);
  });

  it("parseLayoutStorage roundtrips panelLayout payload", () => {
    const serialized = JSON.stringify({
      sidebarSide: "left",
      panelTree: { kind: "leaf", area: { id: "a1", width: 300, editor: "tags" }, primary: true },
      viewSettings: { a1: { edgeStyle: "angled" } },
    });
    const parsed = parseLayoutStorage(serialized);
    expect(parsed).not.toBeNull();
    expect(parsed!.sidebarSide).toBe("left");
    expect(parsed!.panelTree.kind).toBe("leaf");
    expect(parsed!.viewSettings?.["a1"]?.edgeStyle).toBe("angled");
  });
});