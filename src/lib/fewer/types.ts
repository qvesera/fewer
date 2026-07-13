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
  /** Layout direction stored at layout time, used by the node component */
  layoutDirection?: "TB" | "LR" | "RL" | "BT";
  isHorizontal?: boolean;
  /** File System Access API handle for this node (if loaded from disk) */
  fsHandle?: FileSystemHandle | null;
  [key: string]: unknown;
}

export type FewerNode = Node<FewerNodeData, "folder" | "file">;
export type FewerEdge = Edge<{ label?: string }, "default">;

export type LayoutDirection = "TB" | "LR" | "RL" | "BT";

export type EdgeStyle = "curved" | "angled" | "straight";

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
}

/** A simplified serializable file-tree entry used to build the graph */
export interface TreeEntry {
  name: string;
  type: EntryType;
  size?: number;
  children?: TreeEntry[];
  /** File System Access handle (if loaded from disk) */
  fsHandle?: FileSystemHandle | null;
}

/** Optional File System Access handle stored on each node/item */
export interface FSHandle {
  /** directory or file handle from the File System Access API */
  handle?: FileSystemHandle;
  /** relative path from the root */
  relativePath?: string;
}

/**
 * Custom theme — CSS variable color overrides.
 * When themeMode === "custom", these values are injected as inline CSS variables
 * on document.documentElement.
 */
export interface CustomTheme {
  background: string;
  nodeBg: string;
  nodeBorder: string;
  headerBg: string;
  headerText: string;
  defaultText: string;
  subtleText: string;
  itemHover: string;
  handle: string;
  edge: string;
  icon: string;
  accent: string;
  // Folder-specific colors
  folderBg: string;
  folderBorder: string;
  folderHeaderBg: string;
  folderHeaderText: string;
  folderIcon: string;
  // File-specific colors
  fileBg: string;
  fileBorder: string;
  fileIcon: string;
}

export type ThemeMode = "light" | "dark" | "custom";

/** Default custom theme (warm orange + purple palette) */
export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  background: "#0b0b13",
  nodeBg: "rgba(249, 115, 22, 0.12)",
  nodeBorder: "rgba(249, 115, 22, 0.4)",
  headerBg: "rgba(249, 115, 22, 0.2)",
  headerText: "#f8fafc",
  defaultText: "#e2e8f0",
  subtleText: "#94a3b8",
  itemHover: "rgba(148, 163, 184, 0.12)",
  handle: "#475569",
  edge: "rgba(148, 163, 184, 0.55)",
  icon: "#a855f7",
  accent: "#a855f7",
  // Folder colors (orange by default)
  folderBg: "rgba(249, 115, 22, 0.1)",
  folderBorder: "rgba(249, 115, 22, 0.4)",
  folderHeaderBg: "rgba(249, 115, 22, 0.2)",
  folderHeaderText: "#fdba74",
  folderIcon: "#fb923c",
  // File colors (purple by default)
  fileBg: "rgba(168, 85, 247, 0.15)",
  fileBorder: "rgba(168, 85, 247, 0.4)",
  fileIcon: "#c084fc",
};

/**
 * Metadata for each color in the custom theme editor.
 * Maps theme keys to labels and CSS variable names.
 */
export const THEME_COLOR_META: {
  key: keyof CustomTheme;
  label: string;
  cssVar: string;
}[] = [
  { key: "background", label: "Background", cssVar: "--fewer-background" },
  { key: "defaultText", label: "Default Text", cssVar: "--fewer-text" },
  { key: "subtleText", label: "Subtle Text", cssVar: "--fewer-text-subtle" },
  { key: "itemHover", label: "Item Hover", cssVar: "--fewer-item-hover" },
  { key: "handle", label: "Handle", cssVar: "--fewer-handle" },
  { key: "edge", label: "Edge", cssVar: "--fewer-edge" },
  // Folder colors
  { key: "folderBg", label: "Folder BG", cssVar: "--fewer-folder-bg" },
  {
    key: "folderBorder",
    label: "Folder Border",
    cssVar: "--fewer-folder-border",
  },
  {
    key: "folderHeaderBg",
    label: "Folder Header BG",
    cssVar: "--fewer-folder-header-bg",
  },
  {
    key: "folderHeaderText",
    label: "Folder Header Text",
    cssVar: "--fewer-folder-header-text",
  },
  { key: "folderIcon", label: "Folder Icon", cssVar: "--fewer-folder-icon" },
  // File colors
  { key: "fileBg", label: "File BG", cssVar: "--fewer-file-bg" },
  { key: "fileBorder", label: "File Border", cssVar: "--fewer-file-border" },
  { key: "fileIcon", label: "File Icon", cssVar: "--fewer-file-icon" },
];
