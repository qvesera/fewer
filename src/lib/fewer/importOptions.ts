/**
 * Options for importing a directory from the file system.
 * These control how deep to scan, what to include, and how to filter.
 */
export interface ImportOptions {
  /** Maximum depth to recurse into subdirectories (1 = top level only, 0 = unlimited). */
  maxDepth: number;
  /** Include hidden files/folders (those starting with a dot). */
  includeHidden: boolean;
  /** Include common build/dependency directories (node_modules, .git, dist, build). */
  includeVendored: boolean;
  /** Skip folders that have no children (don't create nodes for empty directories). */
  skipEmptyFolders: boolean;
  /** Import files as nodes (not just folders). When false, only the directory structure is imported. */
  includeFiles: boolean;
  /** Only import files matching these extensions (empty = all files). e.g. ["ts", "tsx", "js"]. */
  extensions: string[];
  /** Whether file extensions should be case-sensitive. */
  caseSensitiveExtensions: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  maxDepth: 6,
  includeHidden: false,
  includeVendored: false,
  skipEmptyFolders: true,
  includeFiles: true,
  extensions: [],
  caseSensitiveExtensions: false,
};

/** Directories that are typically vendored/generated and skipped by default. */
export const VENDORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".cache",
  ".turbo",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  "vendor",
  "target",
  ".gradle",
  ".maven",
]);
