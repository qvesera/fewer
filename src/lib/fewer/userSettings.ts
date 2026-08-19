"use client";

import type {
  LayoutDirection,
  EdgeStyle,
  EdgeStrokeStyle,
  ThemeMode,
  CustomTheme,
  ExportSettings,
} from "./types";
import type { ImportOptions } from "./importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { useGraphStore } from "@/store/graphStore";

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
  edgeStrokeStyle: EdgeStrokeStyle;
  edgeWidth: number;
  cornerRadius: number;
  nodeWidth: number;
  nodeHeight: number;
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
    edgeStrokeStyle: store.edgeStrokeStyle as EdgeStrokeStyle,
    edgeWidth: store.edgeWidth as number,
    cornerRadius: store.cornerRadius as number,
    nodeWidth: store.nodeWidth as number,
    nodeHeight: store.nodeHeight as number,
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
  if (data.edgeStrokeStyle) s.setEdgeStrokeStyle(data.edgeStrokeStyle);
  if (data.edgeWidth !== undefined) s.setEdgeWidth(data.edgeWidth);
  if (data.cornerRadius !== undefined) s.setCornerRadius(data.cornerRadius);

  if (data.exportSettings) s.setExportSettings(data.exportSettings);
}

// ── Local persistence (works signed-out / offline) ──────────────────────────
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
