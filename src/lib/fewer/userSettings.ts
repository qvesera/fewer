"use client";

import type {
  LayoutDirection,
  EdgeStyle,
  EdgeStrokeStyle,
  ThemeMode,
  CustomTheme,
  ExportSettings,
} from "./types";
import type { SortKey, SortDir } from "@/lib/fewer/sorting";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { useGraphStore } from "@/store/graphStore";
import type { PanelSide } from "./panelLayout";
import { parseLayoutStorage, serializeLayoutStorage } from "./panelLayout";
import type { PanelNode } from "./panelTree";
import { serializeTree, parseTree } from "./panelTree";
import type { ViewSettings } from "./viewState";
import { parseViewSettings } from "./viewState";

const STORAGE_KEY = "fewer-user-settings";
const VERSION = 1;

/**
 * Serializable per-account app settings — everything the user customizes that
 * is NOT part of a specific graph (nodes/edges). Persisted locally (so it works
 * signed-out too) and synced to the account's `user_settings` row in the cloud,
 * so a user's preferences follow them across devices and sessions.
 */
export interface UserSettings {
  version: number;
  // Theme
  themeMode: ThemeMode;
  customTheme?: CustomTheme;
  // Layout / appearance
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  edgeAnimated: boolean;
  edgeAnimatedSelectedOnly: boolean;
  edgeStrokeStyle: EdgeStrokeStyle;
  edgeAnimatedStrokeStyle: EdgeStrokeStyle;
  edgeWidth: number;
  cornerRadius: number;
  nodeWidth: number;
  nodeHeight: number;
  /** Sibling sort key (persisted like direction/edgeStyle). */
  sortKey: SortKey;
  /** Sibling sort direction. */
  sortDir: SortDir;
  // Display
  showMiniMap: boolean;
  miniMapPosition: string;
  miniMapSize: number;
  miniMapX: number;
  miniMapY: number;
  scrollAction: "pan" | "zoom";
  showFiles: boolean;
  maxDisplayDepth: number;
  autoHideThreshold: number;
  advancedModeEnabled: boolean;
  includeFiles: boolean;
  // Import / export
  importOptions: ImportOptions;
  exportSettings: ExportSettings;
  // Sidebar
  sidebarOpen: boolean;
  advancedOpen: boolean;
  // Panel layout (Blender-style docked areas) — synced across devices
  panelLayout?: {
    sidebarSide: PanelSide;
    panelTree: ReturnType<typeof serializeTree>;
    viewSettings?: Record<string, ViewSettings>;
  };
}

/** The subset of store state that is a persisted user setting. */
function pick(store: Record<string, unknown>): UserSettings {
  return {
    version: VERSION,
    themeMode: store.themeMode as ThemeMode,
    customTheme: store.customTheme as CustomTheme | undefined,
    direction: store.direction as LayoutDirection,
    edgeStyle: store.edgeStyle as EdgeStyle,
    edgeAnimated: store.edgeAnimated as boolean,
    edgeAnimatedSelectedOnly: store.edgeAnimatedSelectedOnly as boolean,
    edgeStrokeStyle: store.edgeStrokeStyle as EdgeStrokeStyle,
    edgeAnimatedStrokeStyle: store.edgeAnimatedStrokeStyle as EdgeStrokeStyle,
    edgeWidth: store.edgeWidth as number,
    cornerRadius: store.cornerRadius as number,
    nodeWidth: store.nodeWidth as number,
    nodeHeight: store.nodeHeight as number,
    sortKey: store.sortKey as SortKey,
    sortDir: store.sortDir as SortDir,
    showMiniMap: store.showMiniMap as boolean,
    miniMapPosition: store.miniMapPosition as string,
    miniMapSize: store.miniMapSize as number,
    miniMapX: store.miniMapX as number,
    miniMapY: store.miniMapY as number,
    scrollAction: store.scrollAction as "pan" | "zoom",
    showFiles: store.showFiles as boolean,
    maxDisplayDepth: store.maxDisplayDepth as number,
    autoHideThreshold: store.autoHideThreshold as number,
    advancedModeEnabled: store.advancedModeEnabled as boolean,
    includeFiles: store.includeFiles as boolean,
    importOptions: store.importOptions as ImportOptions,
    exportSettings: store.exportSettings as ExportSettings,
    sidebarOpen: store.sidebarOpen as boolean,
    advancedOpen: store.advancedOpen as boolean,
    // Panel layout snapshot — serialized tree + per-view settings.
    // Per-leaf node `positions` are view state, not settings: they persist
    // locally via the panel-layout key and must never reach the settings
    // payload, or every canvas drag would look like a settings change and
    // trigger a cloud sync. Strip them here (both the diff in
    // settingsChanged and the POST body share pick()).
    ...((): { panelLayout?: UserSettings["panelLayout"] } => {
      const panelTree = store.panelTree as PanelNode;
      const sidebarSide = store.sidebarSide as PanelSide;
      const viewSettings = store.viewSettings as Record<string, ViewSettings> | undefined;
      const serialized = serializeTree(panelTree);
      const snap = serializeLayoutStorage({
        sidebarSide,
        panelTree: panelTree,
        viewSettings,
      });
      // Size guard: skip if layout blob is unreasonably large (cloud column cap)
      if (snap.length > 65_536) return {};
      let vs: Record<string, ViewSettings> | undefined;
      if (viewSettings && Object.keys(viewSettings).length > 0) {
        const stripped = Object.fromEntries(
          Object.entries(viewSettings).map(([id, leaf]) => {
            const { positions: _drop, ...rest } = leaf as ViewSettings & { positions?: unknown };
            return [id, rest as ViewSettings];
          }),
        );
        if (Object.keys(stripped).length > 0) vs = stripped;
      }
      return { panelLayout: { sidebarSide, panelTree: serialized as ReturnType<typeof serializeTree>, viewSettings: vs } };
    })(),
  };
}

/** Capture the current persisted settings from the store. */
export function captureUserSettings(): UserSettings {
  return pick(useGraphStore.getState() as unknown as Record<string, unknown>);
}

/** True if two store states differ in any persisted setting field. */
export function settingsChanged(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return JSON.stringify(pick(prev)) !== JSON.stringify(pick(next));
}

/**
 * Apply saved settings to the store. Missing/optional fields are left at their
 * current values. Appearance scalars are set directly (NOT via setDirection /
 * setNodeDimensions — those re-run the tree layout and would scatter a loaded
 * graph's node positions); edge-affecting values go through their setters so
 * edges stay in sync, since none of them re-lay-out.
 */
export function applyUserSettings(data: Partial<UserSettings>): void {
  const s = useGraphStore.getState();

  if (data.themeMode) s.setThemeMode(data.themeMode);
  // Custom-theme CSS vars must only be injected when the active mode is
  // actually "custom"; otherwise they'd override the Light/Dark palettes
  // (e.g. the folder-icon orange differs between the custom theme and the app's
  // built-in dark theme).
  if (data.themeMode === "custom" && data.customTheme) s.setCustomTheme(data.customTheme);

  useGraphStore.setState({
    direction: data.direction ?? s.direction,
    nodeWidth: data.nodeWidth ?? s.nodeWidth,
    nodeHeight: data.nodeHeight ?? s.nodeHeight,
    sortKey: data.sortKey ?? s.sortKey,
    sortDir: data.sortDir ?? s.sortDir,
    showMiniMap: data.showMiniMap ?? s.showMiniMap,
    miniMapPosition: data.miniMapPosition ?? s.miniMapPosition,
    miniMapSize: data.miniMapSize ?? s.miniMapSize,
    miniMapX: data.miniMapX ?? s.miniMapX,
    miniMapY: data.miniMapY ?? s.miniMapY,
    scrollAction: data.scrollAction ?? s.scrollAction,
    showFiles: data.showFiles ?? s.showFiles,
    maxDisplayDepth: data.maxDisplayDepth ?? s.maxDisplayDepth,
    autoHideThreshold: data.autoHideThreshold ?? s.autoHideThreshold,
    advancedModeEnabled: data.advancedModeEnabled ?? s.advancedModeEnabled,
    includeFiles: data.includeFiles ?? s.includeFiles,
    sidebarOpen: data.sidebarOpen ?? s.sidebarOpen,
    advancedOpen: data.advancedOpen ?? s.advancedOpen,
    importOptions: { ...DEFAULT_IMPORT_OPTIONS, ...data.importOptions },
  });

  // Edge-affecting styling: these touch live edges but never re-lay out.
  if (data.edgeStyle) s.setEdgeStyle(data.edgeStyle);
  if (data.edgeAnimated !== undefined) s.setEdgeAnimated(data.edgeAnimated);
  // The selected-only flag is read by the canvas when (re)styling edges, so a
  // plain state set is enough — no edge rewrite needed here.
  useGraphStore.setState((s) => ({ edgeAnimatedSelectedOnly: data.edgeAnimatedSelectedOnly ?? s.edgeAnimatedSelectedOnly }));
  if (data.edgeAnimatedStrokeStyle) s.setEdgeAnimatedStrokeStyle(data.edgeAnimatedStrokeStyle);
  if (data.edgeStrokeStyle) s.setEdgeStrokeStyle(data.edgeStrokeStyle);
  if (data.edgeWidth !== undefined) s.setEdgeWidth(data.edgeWidth);
  if (data.cornerRadius !== undefined) s.setCornerRadius(data.cornerRadius);

  if (data.exportSettings) s.setExportSettings(data.exportSettings);

  // Panel layout — Blender-style docked areas (optional, newer field).
  // Cloud viewSettings never carry `positions` (stripped in pick()); keep
  // the device-local positions so applying cloud settings can't wipe them.
  if (data.panelLayout) {
    const tree = parseTree(data.panelLayout.panelTree);
    const vs = parseViewSettings(data.panelLayout.viewSettings);
    if (tree) {
      const local = useGraphStore.getState().viewSettings;
      for (const [id, leaf] of Object.entries(local)) {
        if (leaf.positions) vs[id] = { ...(vs[id] ?? {}), positions: leaf.positions };
      }
      useGraphStore.setState({ sidebarSide: data.panelLayout.sidebarSide, viewSettings: vs });
      useGraphStore.getState().setPanelTree(tree);
    }
  }
}

// ── Local persistence (works signed-out / offline) ──────────────────────────

/** True while applyUserSettings is executing from a cross-tab sync handler.
 *  Prevents the useSettingsSync subscriber from writing back the same values
 *  to localStorage (feedback loop). */
export let applyingFromSync = false;
export function withSyncGuard<T>(fn: () => T): T { applyingFromSync = true; try { return fn(); } finally { applyingFromSync = false; } }

export function saveSettingsLocal(settings: UserSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadSettingsLocal(): UserSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSettings;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}
