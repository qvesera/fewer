/**
 * Per-graph-view settings resolution.
 * Pure, DOM-free, unit-testable with bun test.
 *
 * Every graph leaf can override global defaults (edge style, theme, showFiles,
 * minimap visibility). Resolved settings = leaf override ?? global value.
 */
import {
  COLLAPSED_PILL_HEIGHT,
  type EdgeStyle,
  type EdgeStrokeStyle,
  type FewerEdge,
  type FewerNode,
  type LayoutDirection,
} from "./types";
import { layoutGraphContour, type LayoutOptions } from "./layout";

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
  /** Per-leaf collapsed folder ids — descendants are pruned from this leaf's canvas. */
  collapsedFolderIds?: string[];
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
  /** Descendants hidden by per-leaf folder collapse (folder itself stays visible). */
  collapsedFolderIds: string[];
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

// ── Derivation predicate ──

/**
 * True when a leaf renders a layout of its own instead of the shared (store)
 * positions: its direction differs from the global one, it collapses folders,
 * or its hide layers change the visible set.
 *
 * This is the single source of truth for both the canvas (which then runs the
 * layout engine locally) and the Organize action (which knows that clearing a
 * view's card positions is enough — no global relayout needed). Keys explicitly
 * set to `undefined`, as `updateViewSettings` leaves behind when it clears
 * positions, are not overrides.
 */
export function needsLayoutDerivation(
  vs: ViewSettings | undefined,
  global: { direction: "TB" | "LR" | "BT" | "RL"; hiddenIds: string[] },
  allFileIds: string[],
): boolean {
  if (!vs) return false;
  if (vs.direction !== undefined && vs.direction !== global.direction) return true;
  if ((vs.collapsedFolderIds?.length ?? 0) > 0) return true;
  return computeEffectiveHidden(global.hiddenIds, vs.hideLayers, allFileIds).length !== global.hiddenIds.length;
}

// ── Graph replacement ──

/**
 * One leaf's hide layers, minus every id the current graph does not contain.
 * Returns `undefined` when nothing survives, so the caller can drop the key
 * entirely — a leaf that has never hidden anything must not keep an empty
 * `hideLayers` around: presence is what the Shift+H rules and the layout
 * derivation read.
 *
 * `filesBulkActive` is a preference, not ids, so it survives.
 */
export function pruneHideLayers(layers: HideLayers, live: Set<string>): HideLayers | undefined {
  const individual = layers.individual.filter((id) => live.has(id));
  const filesBulkExempt = layers.filesBulkExempt.filter((id) => live.has(id));
  const subtrees: Record<string, string[]> = {};
  for (const [folderId, ids] of Object.entries(layers.subtrees)) {
    if (!live.has(folderId)) continue; // the folder itself is gone
    const kept = (ids as string[]).filter((id) => live.has(id));
    if (kept.length > 0) subtrees[folderId] = kept;
  }
  if (!layers.filesBulkActive && individual.length === 0 && filesBulkExempt.length === 0 && Object.keys(subtrees).length === 0) {
    return undefined;
  }
  return { individual, subtrees, filesBulkActive: layers.filesBulkActive, filesBulkExempt };
}

/**
 * Drop every per-view id that the incoming graph does not contain.
 *
 * Import mints fresh node ids, so the previous graph's hidden cards, collapsed
 * folders and dragged positions are all dead references. They still fed
 * `computeEffectiveHidden` (the Hidden Cards badge counted them while the panel
 * — which filters to live nodes — had no rows to show) and tripped
 * `needsLayoutDerivation`, forcing every view into its own layout pass. View
 * *preferences* (direction, edge style, theme, minimap) are untouched, and a
 * reload of the same graph keeps everything: its ids are the same ids.
 */
export function pruneViewSettingsForGraph(
  viewSettings: Record<string, ViewSettings>,
  liveIds: Iterable<string>,
): Record<string, ViewSettings> {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
  const out: Record<string, ViewSettings> = {};
  for (const [leafId, vs] of Object.entries(viewSettings)) {
    const next: ViewSettings = { ...vs };
    if (vs.hideLayers) {
      const pruned = pruneHideLayers(vs.hideLayers, live);
      if (pruned) next.hideLayers = pruned;
      else delete next.hideLayers;
    }
    if (vs.collapsedFolderIds) {
      const kept = vs.collapsedFolderIds.filter((id) => live.has(id));
      if (kept.length > 0) next.collapsedFolderIds = kept;
      else delete next.collapsedFolderIds;
    }
    if (vs.positions) {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const [id, pos] of Object.entries(vs.positions)) {
        if (live.has(id)) positions[id] = pos;
      }
      if (Object.keys(positions).length > 0) next.positions = positions;
      else delete next.positions;
    }
    if (Object.keys(next).length > 0) out[leafId] = next;
  }
  return out;
}

// ── Collapsed-folder pill geometry ──

/**
 * Stamp the compact-pill height onto THIS leaf's copies of the folders it has
 * collapsed. The shared store node keeps its expanded height, so collapsing a
 * folder in one view can never squish the expanded card another view paints
 * (nor the slot a global relayout reserves for it).
 *
 * A pill keeps the shared node's `measured` height, so React Flow does re-report
 * the collapsed card's size; the canvas deliberately refuses to pin the pill
 * height into the shared node, and `applyDimensionChanges` drops that no-op batch
 * instead of handing every mounted canvas a new node array.
 *
 * Returns `nodes` by identity when the leaf collapses nothing.
 */
export function withCollapsedPillGeometry(
  nodes: FewerNode[],
  collapsedIds: string[],
): FewerNode[] {
  if (collapsedIds.length === 0) return nodes;
  const collapsed = new Set(collapsedIds);
  return nodes.map((n) =>
    n.data.type === "folder" && collapsed.has(n.id)
      ? { ...n, style: { ...n.style, height: COLLAPSED_PILL_HEIGHT } }
      : n,
  );
}

// ── View node resolution ──

/**
 * Stamp the canonical selection onto a node array, copy-on-write: only the cards
 * whose flag actually flips are cloned, so React Flow skips the rest.
 *
 * This is the ONLY place the selection reaches the canvas. It used to be written
 * back into the store's node array, which meant a click replaced every node
 * object — invalidating the identity-cached tree index, every mounted card's
 * child-list memo and the Hidden panel build. The id list stays canonical and the
 * canvas derives the flags from it, so a rebuild for any other reason (hide,
 * cut/paste, undo) can't resurrect a stale selection: the stamp runs on every
 * rebuild path, after the layout.
 */
export function stampSelection(nodes: FewerNode[], selectedIds: ReadonlySet<string>): FewerNode[] {
  return nodes.map((n) => {
    const shouldSelect = selectedIds.has(n.id);
    if (!!n.selected === shouldSelect) return n;
    return { ...n, selected: shouldSelect };
  });
}

/**
 * The node set + positions a leaf actually paints: explicit per-view card
 * positions win, otherwise the layout engine re-derives when the view diverges
 * (`needsLayoutDerivation`), otherwise the shared store positions pass through.
 *
 * Single source of truth for the canvas AND the image exporter, so exporting
 * `nodes` from the store is no longer what an export shows — a view that hides
 * nodes, overrides the direction or drags its own cards exports that way.
 *
 * `visibleNodes`/`visibleEdges` are the already-hidden-filtered graph; hidden
 * nodes stay in the caller's full list so folder child rows can still show them.
 */
export function resolveViewNodes(
  visibleNodes: FewerNode[],
  visibleEdges: FewerEdge[],
  raw: ViewSettings | undefined,
  resolved: ResolvedViewSettings,
  global: {
    direction: LayoutDirection;
    hiddenIds: string[];
    /** All file ids — needed by the derivation predicate (bulk files layer). */
    fileIds: string[];
  },
  layout: LayoutOptions = {},
): FewerNode[] {
  return applyViewPositions(
    deriveViewLayout(visibleNodes, visibleEdges, raw, resolved, global, layout) ?? visibleNodes,
    resolved.positions,
  );
}

/**
 * The expensive half of a view's node set: decide whether this view derives its
 * own layout, and if so run the layout engine.
 *
 * Its result is a function of the visible set, the direction, the derivation
 * predicate and the layout options — and deliberately NOT of the per-view
 * position overrides. Those are rewritten on every frame of a drag, so a canvas
 * that derived both in one memo re-ran the whole layout per frame: 193ms on a
 * 30k-node graph, in ANY view that diverges (hide layers, a collapsed folder, a
 * direction override), which is what made dragging in those views crawl.
 *
 * The caller memoises this on the leaf's *fields* the predicate reads
 * (hideLayers / direction / collapsedFolderIds) rather than on the settings
 * object, which a drag replaces wholesale.
 */
export function deriveViewLayout(
  visibleNodes: FewerNode[],
  visibleEdges: FewerEdge[],
  raw: ViewSettings | undefined,
  resolved: ResolvedViewSettings,
  global: {
    direction: LayoutDirection;
    hiddenIds: string[];
    /** All file ids — needed by the derivation predicate (bulk files layer). */
    fileIds: string[];
  },
  layout: LayoutOptions = {},
): FewerNode[] | null {
  // 1. Direction override OR diverged visible set: derive this view's own
  //    layout. This runs BEFORE the per-view positions are applied, because a
  //    view's map only ever holds the cards the user dragged in that view — a
  //    card it has no entry for (created after the map was seeded by a drag,
  //    or inherited when the graph was re-flowed) has to land in the layout its
  //    siblings were placed by. Falling through to the shared store position
  //    instead put a new card at a coordinate from the *global* layout, which
  //    is how a card created in the primary view showed up in a dock pane in
  //    the wrong slot — and why Sort/Organize read as inert on that pane.
  if (!needsLayoutDerivation(raw, global, global.fileIds)) return null;
  return layoutGraphContour(visibleNodes, visibleEdges, resolved.direction, layout);
}

/**
 * The cheap half: explicit per-view card positions (set by drag) override, card
 * by card. With no derived layout the shared positions are already this view's
 * layout, so only the overridden cards are cloned and the rest keep identity.
 */
export function applyViewPositions(
  base: FewerNode[],
  positions: Record<string, { x: number; y: number }> | undefined,
): FewerNode[] {
  if (!positions) return base;
  // Copy-on-write, and identity-stable when nothing moved: only the overridden
  // cards are cloned. This runs on every drag frame (a drag rewrites the leaf's
  // map), so cloning the whole array handed React Flow a new object for every
  // card — it re-adopted and re-rendered the entire graph per frame, then
  // answered with its own reports, which is the store→canvas round trip behind
  // "Maximum update depth exceeded" (#281).
  let moved = false;
  const next = base.map((n) => {
    const pos = positions[n.id];
    if (!pos || (n.position.x === pos.x && n.position.y === pos.y)) return n;
    moved = true;
    return { ...n, position: pos };
  });
  return moved ? next : base;
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
    // Shared empty list, not a fresh `[]`: a view with no collapsed folder must
    // not hand every consumer a new array identity each time this runs — the
    // canvas re-resolves it on every drag frame, and the collapsed ids are a dep
    // of the pill-geometry and card memos (#281).
    collapsedFolderIds: vs.collapsedFolderIds ?? EMPTY_IDS,
  };
}

/** Identity-stable stand-in for "this view has no collapsed folder". */
const EMPTY_IDS: string[] = [];

// ── Persistence ──

interface LayoutViewSettingsSnapshot {
  viewSettings: Record<string, ViewSettings>;
}

/** Keep only the string entries of a possibly-untrusted array (else empty). */
function stringIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === "string") : [];
}

/** Validate a folderId → hidden-descendant-ids map, dropping malformed entries. */
function sanitizeSubtrees(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = stringIds(v);
    }
  }
  return out;
}

function sanitizeHideLayers(raw: unknown): HideLayers | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    individual: stringIds(obj.individual),
    subtrees: sanitizeSubtrees(obj.subtrees),
    filesBulkActive: obj.filesBulkActive === true,
    filesBulkExempt: stringIds(obj.filesBulkExempt),
  };
}

/**
 * Recognised simple fields and the `typeof` that admits them. Fields needing
 * their own sanitising step (hideLayers, collapsedFolderIds, positions) are
 * handled explicitly below. `showFiles` is the v1 spelling that
 * migrateLegacyHideLayers still reads straight off the raw object.
 *
 * Key order is the order the fields land in the collected object.
 */
const SIMPLE_FIELD_TYPES: Record<string, "boolean" | "string" | "number"> = {
  showFiles: "boolean", // v1 compat: migrated into hideLayers below
  minimapHidden: "boolean",
  edgeStyle: "string",
  edgeAnimated: "boolean",
  edgeAnimatedSelectedOnly: "boolean",
  edgeStrokeStyle: "string",
  edgeWidth: "number",
  direction: "string",
};

/** Copy the recognised ViewSettings fields off a raw object, applying the
 *  v1→v2 migrations (legacy `showFiles` / `hiddenIds` → hide layers). */
function collectViewSettings(raw: unknown): ViewSettings {
  const out: Record<string, unknown> = {};
  const obj = raw as Record<string, unknown>;
  if (obj.hideLayers) out.hideLayers = sanitizeHideLayers(obj.hideLayers);
  for (const [field, type] of Object.entries(SIMPLE_FIELD_TYPES)) {
    if (typeof obj[field] === type) out[field] = obj[field];
  }
  if (Array.isArray(obj.collapsedFolderIds)) out.collapsedFolderIds = stringIds(obj.collapsedFolderIds);
  if (obj.positions && typeof obj.positions === "object") out.positions = obj.positions;
  migrateLegacyHideLayers(out, obj);
  return out as ViewSettings;
}

/** Preserve legacy precedence: explicit layers, then showFiles, then hiddenIds. */
function migrateLegacyHideLayers(
  out: Record<string, unknown>,
  obj: Record<string, unknown>,
): void {
  // v1→v2 migration: convert legacy showFiles boolean to filesBulkActive layer
  if (!out.hideLayers && typeof obj.showFiles === "boolean") {
    out.hideLayers = { ...emptyHideLayers(), filesBulkActive: !obj.showFiles };
  }
  // v1→v2 migration: convert legacy hiddenIds to individual layer
  if (!out.hideLayers && Array.isArray(obj.hiddenIds)) {
    out.hideLayers = { ...emptyHideLayers(), individual: obj.hiddenIds as string[] };
  }
}

function sanitizeViewSettings(raw: unknown): ViewSettings {
  if (!raw || typeof raw !== "object") return {};
  return collectViewSettings(raw);
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
      if (!out[k].hideLayers) out[k].hideLayers = { ...emptyHideLayers(), filesBulkActive: !v };
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