import type { Node, Edge } from "@xyflow/react";

/** Type of filesystem entry */
export type EntryType = "folder" | "file";

/** Categories used for icon + color selection */
export type FileCategory =
  | "code"
  | "config"
  | "image"
  | "document"
  | "archive"
  | "data"
  | "media"
  | "binary"
  | "text";

export interface FewerNodeData {
  /** Display label (file/folder name) */
  label: string;
  /** Absolute path inside the loaded tree */
  path: string;
  /** Folder vs file */
  type: EntryType;
  /** File extension (e.g. "ts", "tsx"). Empty for folders. */
  extension?: string;
  /** High-level category for icon/color */
  category?: FileCategory;
  /** Approx size in bytes (files only) */
  size?: number;
  /** Whether this entry is currently matched by the search query */
  highlighted?: boolean;
  /** Whether this entry is dimmed because it's NOT matched (search active) */
  dimmed?: boolean;
  /** Read-only flag derived from the tree */
  readonly?: boolean;
  /** Depth in the tree (0 = root) */
  depth?: number;
  /** Whether this node is the root of the loaded tree */
  isRoot?: boolean;
  /** Provider web URL for cloud-imported entries (open in a new tab) */
  webUrl?: string;
  /** Layout direction stored at layout time, used by the node component */
  layoutDirection?: "TB" | "LR" | "RL" | "BT";
  isHorizontal?: boolean;
  /** Whether folder is collapsed */
  collapsed?: boolean;
  /** Parent node id (for tree navigation) */
  parentId?: string | null;
  /** Allow arbitrary extra fields (required by React Flow Node type) */
  [key: string]: unknown;
}

export type FewerNode = Node<FewerNodeData, "folder" | "file">;
export type FewerEdge = Edge<{ label?: string }, "default" | "smoothstep" | "straight">;

export type LayoutDirection = "TB" | "LR" | "RL" | "BT";

export type EdgeStyle = "curved" | "angled" | "straight";
export type EdgeStrokeStyle = "solid" | "dashed" | "dotted";

/**
 * SVG `stroke-dasharray` for a stroke style. Used for BOTH the plain edges and
 * the animated edges (which need an explicit pattern so the shared dash clock's
 * wrap distance is a common multiple of every period in play — see dashClock).
 */
export function edgeDashPattern(style: EdgeStrokeStyle): string | undefined {
  switch (style) {
    case "dashed": return "8 4";
    case "dotted": return "2 4";
    case "solid":
    default: return undefined;
  }
}

export interface GraphSnapshot {
  nodes: FewerNode[];
  edges: FewerEdge[];
}

export interface DirectoryStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  byCategory: Record<FileCategory, number>;
}

export interface ExportSettings {
  format: "svg" | "png" | "json" | "csv" | "dot" | "script" | "tree";
  quality: number; // 1-100
  transparentBackground: boolean;
  includeStats: boolean;
  includeBranding: boolean; // append "Created with fewer" credit / watermark
}

/** A simplified serializable file-tree entry used to build the graph */
export interface TreeEntry {
  name: string;
  type: EntryType;
  size?: number;
  children?: TreeEntry[];
  /** File System Access handle (if loaded from disk) */
  fsHandle?: FileSystemHandle | null;
  /** Provider web URL for cloud-imported entries (open in a new tab) */
  webUrl?: string;
}

/** Optional File System Access handle stored on each node/item */
export interface FSHandle {
  /** directory or file handle from the File System Access API */
  handle?: FileSystemHandle;
  /** relative path from the root */
  relativePath?: string;
}

/** A single theme color: hex value + independent opacity (0..1). */
export interface CustomThemeColor {
  /** Hex color, e.g. "#fd7e14". */
  color: string;
  /** Opacity 0..1 applied to the color. */
  opacity: number;
}

/**
 * Custom theme — structured color overrides with per-color opacity.
 * When themeMode === "custom", these values are injected as inline CSS variables
 * on document.documentElement.
 */
export interface CustomTheme {
  background: CustomThemeColor;
  defaultText: CustomThemeColor;
  subtleText: CustomThemeColor;
  itemHover: CustomThemeColor;
  handle: CustomThemeColor;
  edge: CustomThemeColor;
  // Folder-specific colors
  folderBg: CustomThemeColor;
  folderBorder: CustomThemeColor;
  folderText: CustomThemeColor;
  folderSubtleText: CustomThemeColor;
  folderIcon: CustomThemeColor;
  // File-specific colors
  fileBg: CustomThemeColor;
  fileBorder: CustomThemeColor;
  fileText: CustomThemeColor;
  fileSubtleText: CustomThemeColor;
  fileIcon: CustomThemeColor;
  // Legacy fields retained for runtime migration from old plain-string schema
  nodeBg?: string;
  nodeBorder?: string;
  headerBg?: string;
  headerText?: string;
  icon?: string;
  accent?: string;
}

export type ThemeMode = "light" | "dark" | "custom";

/** A custom theme the signed-in user has saved to their Supabase account. */
export interface SavedTheme {
  id: string;
  name: string;
  theme: CustomTheme;
  created_at: string;
  updated_at: string;
}


/** Metadata for each editable color slot. */
export interface ThemeColorMeta {
  key: keyof Omit<CustomTheme, "nodeBg" | "nodeBorder" | "headerBg" | "headerText" | "icon" | "accent">;
  label: string;
  cssVar: string;
  description: string;
  defaultColor: string;
  defaultOpacity: number;
  /** Open Color palette used for this slot in the dark theme. */
  openColor: { family: string; index: number };
}

export const THEME_COLOR_META: ThemeColorMeta[] = [
  { key: "background", label: "Canvas Background", cssVar: "--fewer-background", description: "Graph canvas background", defaultColor: "#0b0b13", defaultOpacity: 1, openColor: { family: "black", index: 0 } },
  { key: "defaultText", label: "Primary Text", cssVar: "--fewer-text", description: "Node titles and file names", defaultColor: "#f8f9fa", defaultOpacity: 1, openColor: { family: "gray", index: 0 } },
  { key: "subtleText", label: "Secondary Text", cssVar: "--fewer-text-subtle", description: "Paths, sizes, and meta text", defaultColor: "#adb5bd", defaultOpacity: 1, openColor: { family: "gray", index: 5 } },
  { key: "itemHover", label: "Child Row Hover", cssVar: "--fewer-item-hover", description: "Hover background on folder children", defaultColor: "#adb5bd", defaultOpacity: 0.15, openColor: { family: "gray", index: 5 } },
  { key: "handle", label: "Connection Handle", cssVar: "--fewer-handle", description: "React Flow handle dots", defaultColor: "#868e96", defaultOpacity: 1, openColor: { family: "gray", index: 6 } },
  { key: "edge", label: "Edge Line", cssVar: "--fewer-edge", description: "Default connection lines", defaultColor: "#adb5bd", defaultOpacity: 0.5, openColor: { family: "gray", index: 5 } },
  { key: "folderBg", label: "Folder Body", cssVar: "--fewer-folder-bg", description: "Main folder card background", defaultColor: "#fd7e14", defaultOpacity: 0.12, openColor: { family: "orange", index: 6 } },
  { key: "folderText", label: "Folder Text", cssVar: "--fewer-folder-text", description: "Folder title text", defaultColor: "#1e293b", defaultOpacity: 1, openColor: { family: "gray", index: 8 } },
  { key: "folderSubtleText", label: "Folder Secondary", cssVar: "--fewer-folder-subtle-text", description: "Folder path and footer text", defaultColor: "#adb5bd", defaultOpacity: 1, openColor: { family: "gray", index: 5 } },
  { key: "folderIcon", label: "Folder Icon", cssVar: "--fewer-folder-icon", description: "Folder/root icon color", defaultColor: "#ffa94d", defaultOpacity: 1, openColor: { family: "orange", index: 4 } },
  { key: "fileBg", label: "File Body", cssVar: "--fewer-file-bg", description: "File card background", defaultColor: "#be4bdb", defaultOpacity: 0.18, openColor: { family: "grape", index: 6 } },
  { key: "fileText", label: "File Text", cssVar: "--fewer-file-text", description: "File name text", defaultColor: "#f8f9fa", defaultOpacity: 1, openColor: { family: "gray", index: 0 } },
  { key: "fileSubtleText", label: "File Secondary", cssVar: "--fewer-file-subtle-text", description: "File extension and size text", defaultColor: "#adb5bd", defaultOpacity: 1, openColor: { family: "gray", index: 5 } },
  { key: "fileIcon", label: "File Icon", cssVar: "--fewer-file-icon", description: "File type icon color", defaultColor: "#e599f7", defaultOpacity: 1, openColor: { family: "grape", index: 4 } },
];

/** Default custom theme (Open Color gray + orange + grape palette) */
export const DEFAULT_CUSTOM_THEME: CustomTheme = Object.fromEntries(
  THEME_COLOR_META.map((m) => [m.key, { color: m.defaultColor, opacity: m.defaultOpacity }]),
) as unknown as CustomTheme;

/**
 * Operation-based history: each undo/redo step stores a diff instead of
 * cloning the full nodes/edges arrays. This is critical for 10K+ node graphs.
 */
export interface AddNodeOp {
  type: "add-node";
  node: FewerNode;
  edge: FewerEdge | null;
}

export interface RemoveNodeOp {
  type: "remove-node";
  node: FewerNode;
  edge: FewerEdge | null;
  children: FewerNode[];
  childEdges: FewerEdge[];
}

export interface MoveNodeOp {
  type: "move-node";
  nodeId: string;
  from: { parentId: string | null; x: number; y: number };
  to: { parentId: string | null; x: number; y: number };
}

export interface RenameOp {
  type: "rename";
  nodeId: string;
  oldLabel: string;
  newLabel: string;
}

export interface BulkImportOp {
  type: "bulk-import";
  nodes: FewerNode[];
  edges: FewerEdge[];
}

export interface ToggleCollapseOp {
  type: "toggle-collapse";
  nodeId: string;
  wasCollapsed: boolean;
}

/** Auxiliary graph/view state some ops must restore on undo/redo (beyond nodes+edges). */
export interface ViewState {
  hiddenIds: string[];
  showFiles: boolean;
  maxDisplayDepth: number;
  autoHideThreshold: number;
  autoHiddenIds: string[];
  /** Active file-type filter (null = none). Restored with the view state. */
  categoryFilter: FileCategory | null;
  /** Ids that the category filter added to hiddenIds in this view state. */
  categoryHiddenIds: string[];
}

/** Delete/cut a node + its subtree. Undo restores them. */
export interface RemoveSubtreeOp {
  type: "remove-subtree";
  node: FewerNode;
  edge: FewerEdge | null;
  children: FewerNode[];
  childEdges: FewerEdge[];
  before: ViewState;
  after: ViewState;
}

/** Connect two nodes (add edge + rewrite child/descendant paths). Undo removes edge + restores paths. */
export interface ConnectOp {
  type: "connect";
  edge: FewerEdge;
  prevPaths: { nodeId: string; path: string }[];
  nextPaths: { nodeId: string; path: string }[];
}

/** Delete edges / remove edges from a handle. Undo re-adds them and restores paths. */
export interface RemoveEdgesOp {
  type: "remove-edges";
  edges: FewerEdge[];
  /** Path rewrites caused by unparenting (child + descendants). Undo restores prevPath. */
  pathChanges?: { nodeId: string; prevPath: string; nextPath: string }[];
}

/** Node drag (single or multi-selection). Undo restores original positions. */
export interface MovePositionsOp {
  type: "move-positions";
  moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[];
}

/** Node resize. Undo restores original dimensions. */
export interface ResizeOp {
  type: "resize";
  changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[];
}

export interface CollapseBatchOp {
  type: "collapse-batch";
  changes: { nodeId: string; wasCollapsed: boolean; willCollapse: boolean }[];
}

/** Pure view-state change (hide/show, show-files, max-depth, auto-hide-threshold). */
export interface ViewStateOp {
  type: "view-state";
  before: ViewState;
  after: ViewState;
}

export type HistoryOp =
  | AddNodeOp
  | RemoveNodeOp
  | MoveNodeOp
  | RenameOp
  | BulkImportOp
  | ToggleCollapseOp
  | RemoveSubtreeOp
  | ConnectOp
  | RemoveEdgesOp
  | MovePositionsOp
  | ResizeOp
  | CollapseBatchOp
  | ViewStateOp;

/**
 * Separate store for FileSystem handles — these are live browser API objects
 * that are not serializable and bloat memory when stored on every node.
 * Using a WeakMap-like Map keyed by nodeId keeps them out of the main store.
 */
export const fsHandleStore = new Map<string, FileSystemHandle | null>();
