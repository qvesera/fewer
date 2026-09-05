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
export interface HideLayers {
  /** Per-node hides (H key, node menu, batch hide). */
  individual: string[];
  /** folderId → hidden descendant ids (Hide Children). Per-folder so Show Children targets one folder. */
  subtrees: Record<string, string[]>;
  /** "Hide Files" bulk layer active. */
  filesBulkActive: boolean;
  /** Files eye-revealed while bulk layer is on (subset exemption). */
  filesBulkExempt: string[];
}

export interface ViewSettings {
  hideLayers?: HideLayers;
  minimapHidden?: boolean;
  edgeStyle?: EdgeStyle;
  edgeAnimated?: boolean;
  edgeAnimatedSelectedOnly?: boolean;
  edgeStrokeStyle?: EdgeStrokeStyle;
  edgeWidth?: number;
  direction?: "TB" | "LR" | "BT" | "RL";
  positions?: Record<string, { x: number; y: number }>;
}

/** Fully resolved settings — every field is present (no undefined). */
export interface ResolvedViewSettings {
  /** Derived: true if no files hidden via bulk layer. */
  showFiles: boolean;
  minimapHidden: boolean;
  edgeStyle: EdgeStyle;
  edgeAnimated: boolean;
  edgeAnimatedSelectedOnly: boolean;
  edgeStrokeStyle: EdgeStrokeStyle;
  edgeWidth: number;
  direction: "TB" | "LR" | "BT" | "RL";
  positions?: Record<string, { x: number; y: number }>;
  /** Effective hidden list computed from layers + global hiddenIds + allFileIds. */
  hiddenIds: string[];
}

// ── Effective hidden computation ──

/**
 * Compute the effective hidden list from layers + global hiddenIds + all file ids.
 * Pure, DOM-free, testable.
 */
export function computeEffectiveHidden(
  globalHiddenIds: string[],
  layers: HideLayers | undefined,
  allFileIds: string[],
): string[] {
  if (!layers) return globalHiddenIds;
  // Start from global hidden ids
  const result = new Set(globalHiddenIds);
  // Add individual hides
  for (const id of layers.individual) result.add(id);
  // Add all subtree hides
  for (const ids of Object.values(layers.subtrees)) {
    for (const id of ids) result.add(id);
  }
  // Bulk files layer
  if (layers.filesBulkActive) {
    const exempt = new Set(layers.filesBulkExempt);
    for (const fid of allFileIds) {
      if (!exempt.has(fid)) result.add(fid);
    }
  }
  return [...result];
}

// ── Resolution ──

/** Resolve a single setting: leaf override takes precedence over global. */
function pick<T>(leaf: T | undefined, global: T): T {
  return leaf !== undefined ? leaf : global;
}

/**
 * Merge per-leaf overrides with global defaults into a fully resolved object.
 * `global` is the current store snapshot of the global settings.
 * `allFileIds` is the list of all file node ids (passed from CanvasInner for
 * computing the effective hidden list).
 */
export function resolveViewSettings(
  byLeaf: Record<string, ViewSettings>,
  leafId: string | null | undefined,
  global: ResolvedViewSettings,
  globalHiddenIds?: string[],
  allFileIds?: string[],
): ResolvedViewSettings {
  const vs: ViewSettings = leafId && byLeaf[leafId] ? byLeaf[leafId] : {};
  const hidden = computeEffectiveHidden(
    globalHiddenIds ?? global.hiddenIds,
    vs.hideLayers,
    allFileIds ?? [],
  );
  return {
    showFiles: !vs.hideLayers?.filesBulkActive && global.showFiles,
    minimapHidden: pick(vs.minimapHidden, global.minimapHidden),
    edgeStyle: pick(vs.edgeStyle, global.edgeStyle),
    edgeAnimated: pick(vs.edgeAnimated, global.edgeAnimated),
    edgeAnimatedSelectedOnly: pick(vs.edgeAnimatedSelectedOnly, global.edgeAnimatedSelectedOnly),
    edgeStrokeStyle: pick(vs.edgeStrokeStyle, global.edgeStrokeStyle),
    edgeWidth: pick(vs.edgeWidth, global.edgeWidth),
    direction: pick(vs.direction, global.direction),
    positions: vs.positions,
    hiddenIds: hidden,
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

function sanitizeHideLayers(raw: unknown): HideLayers | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const individual = Array.isArray(obj.individual) ? obj.individual.filter((x: unknown) => typeof x === "string") : [];
  const subtrees: Record<string, string[]> = {};
  if (obj.subtrees && typeof obj.subtrees === "object") {
    for (const [k, v] of Object.entries(obj.subtrees as Record<string, unknown>)) {
      if (Array.isArray(v)) subtrees[k] = v.filter((x: unknown) => typeof x === "string");
    }
  }
  return {
    individual,
    subtrees,
    filesBulkActive: obj.filesBulkActive === true,
    filesBulkExempt: Array.isArray(obj.filesBulkExempt) ? obj.filesBulkExempt.filter((x: unknown) => typeof x === "string") : [],
  };
}

function sanitizeViewSettings(raw: unknown): ViewSettings {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  const obj = raw as Record<string, unknown>;
  if (obj.hideLayers) out.hideLayers = sanitizeHideLayers(obj.hideLayers);
  if (typeof obj.showFiles === "boolean") out.showFiles = obj.showFiles; // v1 compat: migrate below
  if (typeof obj.minimapHidden === "boolean") out.minimapHidden = obj.minimapHidden;
  if (typeof obj.edgeStyle === "string") out.edgeStyle = obj.edgeStyle;
  if (typeof obj.edgeAnimated === "boolean") out.edgeAnimated = obj.edgeAnimated;
  if (typeof obj.edgeAnimatedSelectedOnly === "boolean") out.edgeAnimatedSelectedOnly = obj.edgeAnimatedSelectedOnly;
  if (typeof obj.edgeStrokeStyle === "string") out.edgeStrokeStyle = obj.edgeStrokeStyle;
  if (typeof obj.edgeWidth === "number") out.edgeWidth = obj.edgeWidth;
  if (typeof obj.direction === "string") out.direction = obj.direction;
  if (obj.positions && typeof obj.positions === "object") out.positions = obj.positions;
  // v1→v2 migration: convert legacy showFiles boolean to filesBulkActive layer
  if (!out.hideLayers && typeof obj.showFiles === "boolean") {
    out.hideLayers = { individual: [], subtrees: {}, filesBulkActive: !obj.showFiles, filesBulkExempt: [] };
  }
  // v1→v2 migration: convert legacy hiddenIds to individual layer
  if (!out.hideLayers && Array.isArray(obj.hiddenIds)) {
    out.hideLayers = { individual: obj.hiddenIds as string[], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
  }
  return out as ViewSettings;
}

/** Create an empty HideLayers with all arrays empty and bulk inactive. */
export function emptyHideLayers(): HideLayers {
  return { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
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
  // v1 migration: convert showFiles booleans to filesBulkActive layers
  if (showFilesByLeaf) {
    for (const [k, v] of Object.entries(showFilesByLeaf)) {
      if (!out[k]) out[k] = {};
      if (!out[k].hideLayers) out[k].hideLayers = { individual: [], subtrees: {}, filesBulkActive: !v, filesBulkExempt: [] };
      else out[k].hideLayers!.filesBulkActive = !v;
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