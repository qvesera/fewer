/**
 * Per-graph-view settings resolution.
 * Pure, DOM-free, unit-testable with bun test.
 *
 * Every graph leaf can override global defaults (edge style, theme, showFiles,
 * minimap visibility). Resolved settings = leaf override ?? global value.
 */
import type { EdgeStyle, EdgeStrokeStyle } from "./types";

// ── Types ──

/** Per-view override fields. All optional — absent means "use global default". */
export interface ViewSettings {
  showFiles?: boolean;
  minimapHidden?: boolean;
  edgeStyle?: EdgeStyle;
  edgeAnimated?: boolean;
  edgeAnimatedSelectedOnly?: boolean;
  edgeStrokeStyle?: EdgeStrokeStyle;
  edgeWidth?: number;
  /** Per-view light/dark. "system" resolves to the global value at call time. */
  themeMode?: "light" | "dark" | "system";
  /** Per-view layout direction override. */
  direction?: "TB" | "LR" | "BT" | "RL";
  /** Per-view node position overrides (when direction is overridden). */
  positions?: Record<string, { x: number; y: number }>;
}

/** Fully resolved settings — every field is present (no undefined). */
export interface ResolvedViewSettings {
  showFiles: boolean;
  minimapHidden: boolean;
  edgeStyle: EdgeStyle;
  edgeAnimated: boolean;
  edgeAnimatedSelectedOnly: boolean;
  edgeStrokeStyle: EdgeStrokeStyle;
  edgeWidth: number;
  themeMode: "light" | "dark";
  /** Per-view layout direction. "TB" default when no override. */
  direction: "TB" | "LR" | "BT" | "RL";
  /** Per-view position overrides. undefined = use shared positions. */
  positions?: Record<string, { x: number; y: number }>;
}

// ── Resolution ──

/** Resolve a single setting: leaf override takes precedence over global. */
function pick<T>(leaf: T | undefined, global: T): T {
  return leaf !== undefined ? leaf : global;
}

/**
 * Merge per-leaf overrides with global defaults into a fully resolved object.
 * `global` is the current store snapshot of the global settings.
 */
export function resolveViewSettings(
  byLeaf: Record<string, ViewSettings>,
  leafId: string | null | undefined,
  global: ResolvedViewSettings,
): ResolvedViewSettings {
  const vs: ViewSettings = leafId && byLeaf[leafId] ? byLeaf[leafId] : {};
  const themeMode = pick(vs.themeMode, global.themeMode);
  return {
    showFiles: pick(vs.showFiles, global.showFiles),
    minimapHidden: pick(vs.minimapHidden, global.minimapHidden),
    edgeStyle: pick(vs.edgeStyle, global.edgeStyle),
    edgeAnimated: pick(vs.edgeAnimated, global.edgeAnimated),
    edgeAnimatedSelectedOnly: pick(vs.edgeAnimatedSelectedOnly, global.edgeAnimatedSelectedOnly),
    edgeStrokeStyle: pick(vs.edgeStrokeStyle, global.edgeStrokeStyle),
    edgeWidth: pick(vs.edgeWidth, global.edgeWidth),
    themeMode: themeMode === "system" ? global.themeMode : themeMode,
    direction: pick(vs.direction, global.direction),
    positions: vs.positions, // undefined = use shared positions (no override)
  };
}

// ── Persistence ──

interface LayoutViewSettingsSnapshot {
  viewSettings: Record<string, ViewSettings>;
}

/** Valid ViewSettings keys for loose validation on load. */
const VALID_KEYS = new Set<string>([
  "showFiles", "minimapHidden", "edgeStyle", "edgeAnimated",
  "edgeAnimatedSelectedOnly", "edgeStrokeStyle", "edgeWidth", "themeMode",
]);

function sanitizeViewSettings(raw: unknown): ViewSettings {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  const obj = raw as Record<string, unknown>;
  if (typeof obj.showFiles === "boolean") out.showFiles = obj.showFiles;
  if (typeof obj.minimapHidden === "boolean") out.minimapHidden = obj.minimapHidden;
  if (typeof obj.edgeStyle === "string") out.edgeStyle = obj.edgeStyle;
  if (typeof obj.edgeAnimated === "boolean") out.edgeAnimated = obj.edgeAnimated;
  if (typeof obj.edgeAnimatedSelectedOnly === "boolean") out.edgeAnimatedSelectedOnly = obj.edgeAnimatedSelectedOnly;
  if (typeof obj.edgeStrokeStyle === "string") out.edgeStrokeStyle = obj.edgeStrokeStyle;
  if (typeof obj.edgeWidth === "number") out.edgeWidth = obj.edgeWidth;
  if (typeof obj.themeMode === "string") out.themeMode = obj.themeMode;
  if (typeof obj.direction === "string") out.direction = obj.direction;
  if (obj.positions && typeof obj.positions === "object") out.positions = obj.positions;
  return out as ViewSettings;
}

/** Parse viewSettings from a layout storage value (v3 format). */
export function parseViewSettings(raw: unknown): Record<string, ViewSettings> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, ViewSettings> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "object" && v !== null) {
      const clean = sanitizeViewSettings(v);
      if (Object.keys(clean).length > 0) out[k] = clean;
    }
  }
  return out;
}

/** Merge two view settings maps (for v1/v2 migration into v3). */
export function mergeViewSettings(
  showFilesByLeaf: Record<string, boolean> | undefined,
  minimapHiddenByIds: Set<string> | undefined,
  viewSettings: Record<string, ViewSettings> | undefined,
): Record<string, ViewSettings> {
  const out: Record<string, ViewSettings> = { ...(viewSettings ?? {}) };
  if (showFilesByLeaf) {
    for (const [k, v] of Object.entries(showFilesByLeaf)) {
      if (!out[k]) out[k] = {};
      out[k].showFiles = v;
    }
  }
  if (minimapHiddenByIds) {
    for (const id of minimapHiddenByIds) {
      if (!out[id]) out[id] = {};
      out[id].minimapHidden = true;
    }
  }
  return out;
}