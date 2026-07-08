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

export interface GraphirNodeData {
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
  [key: string]: unknown;
}

export type GraphirNode = Node<GraphirNodeData, "folder" | "file">;
export type GraphirEdge = Edge<{ label?: string }, "default">;

export type LayoutDirection = "TB" | "LR" | "RL" | "BT";

export type EdgeStyle = "curved" | "angled" | "straight";

export interface GraphSnapshot {
  nodes: GraphirNode[];
  edges: GraphirEdge[];
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
}

/** Optional File System Access handle stored on each node/item */
export interface FSHandle {
  /** directory or file handle from the File System Access API */
  handle?: FileSystemHandle;
  /** relative path from the root */
  relativePath?: string;
}
