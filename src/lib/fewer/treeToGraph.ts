import { v4 as uuid } from "uuid";
import type { FewerNode, FewerEdge, TreeEntry } from "./types";
import { categorizeByExtension, getFileExtension } from "./categorize";
import type { ImportOptions } from "./importOptions";
import { VENDORED_DIRS } from "./importOptions";

interface BuildOptions {
  /** Bump this when you need to regenerate IDs without remounting. */
  idPrefix?: string;
  /** When true, files are rendered as nodes on canvas. When false, files are hidden nodes but still children of folders. */
  includeFiles?: boolean;
}

/**
 * Convert a hierarchical TreeEntry into a flat list of React Flow nodes + edges
 * representing the parent/child relationships.
 */
export function treeToGraph(
  root: TreeEntry,
  options: BuildOptions = {}
): { nodes: FewerNode[]; edges: FewerEdge[]; hiddenFileIds: string[] } {
  const nodes: FewerNode[] = [];
  const edges: FewerEdge[] = [];
  const prefix = options.idPrefix ?? "n";

  function walk(entry: TreeEntry, parentId: string | null, depth: number, pathPrefix: string) {
    const id = `${prefix}-${uuid().slice(0, 8)}`;
    const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    const extension = entry.type === "file" ? getFileExtension(entry.name) : "";
    const label = extension ? entry.name.slice(0, -(extension.length + 1)) : entry.name;
    const category = entry.type === "file" ? categorizeByExtension(extension) : undefined;

    // When includeFiles is false, add file IDs to hiddenIds for proper hiding
    // without breaking layout
    if (entry.type === "file" && options.includeFiles === false) {
      hiddenFileIds.push(id);
    }

    nodes.push({
      id,
      type: entry.type,
      position: { x: 0, y: 0 }, // layout fills these in
      data: {
        label,
        path: fullPath,
        type: entry.type,
        extension,
        category,
        size: entry.size ?? 0,
        depth,
        isRoot: parentId === null,
        fsHandle: entry.fsHandle ?? null,
      },
    });

    if (parentId) {
      edges.push({
        id: `e-${parentId}-${id}`,
        source: parentId,
        target: id,
        type: "default",
      });
    }

    if (entry.children) {
      const sorted = [...entry.children].sort((a, b) => a.name.localeCompare(b.name));
      for (const child of sorted) {
        walk(child, id, depth + 1, fullPath);
      }
    }
  }

  const hiddenFileIds: string[] = [];
  walk(root, null, 0, "");
  return { nodes, edges, hiddenFileIds };
}

/**
 * Check if a file name matches the extension filter.
 */
function matchesExtension(name: string, extensions: string[], caseSensitive: boolean): boolean {
  if (extensions.length === 0) return true;
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  if (caseSensitive) return extensions.includes(ext);
  return extensions.some((e) => e.toLowerCase() === ext.toLowerCase());
}

/**
 * Filter a TreeEntry based on ImportOptions.
 * Returns null if the entry should be excluded entirely.
 * Returns a copy with filtered children.
 */
/**
 * Chunked tree-to-graph conversion with progress callback.
 * Yields nodes in batches to keep the UI responsive during large imports.
 * For 10K+ node trees, this prevents blocking the main thread.
 */
export async function chunkTreeToGraph(
  root: TreeEntry,
  options: BuildOptions = {},
  onProgress?: (progress: { processed: number; total: number; phase: string }) => void,
): Promise<{ nodes: FewerNode[]; edges: FewerEdge[]; hiddenFileIds: string[] }> {
  const nodes: FewerNode[] = [];
  const edges: FewerEdge[] = [];
  const prefix = options.idPrefix ?? "n";
  const hiddenFileIds: string[] = [];

  // First pass: count total entries
  let total = 0;
  function count(entry: TreeEntry) {
    total++;
    if (entry.children) for (const child of entry.children) count(child);
  }
  count(root);

  onProgress?.({ processed: 0, total, phase: "building-tree" });
  const batchSize = 500;
  let processed = 0;

  function walk(entry: TreeEntry, parentId: string | null, depth: number, pathPrefix: string) {
    const id = `${prefix}-${uuid().slice(0, 8)}`;
    const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    const extension = entry.type === "file" ? getFileExtension(entry.name) : "";
    const label = extension ? entry.name.slice(0, -(extension.length + 1)) : entry.name;
    const category = entry.type === "file" ? categorizeByExtension(extension) : undefined;

    if (entry.type === "file" && options.includeFiles === false) {
      hiddenFileIds.push(id);
    }

    nodes.push({
      id,
      type: entry.type,
      position: { x: 0, y: 0 },
      data: { label, path: fullPath, type: entry.type, extension, category, size: entry.size ?? 0, depth, isRoot: parentId === null, fsHandle: entry.fsHandle ?? null },
    });

    if (parentId) {
      edges.push({ id: `e-${parentId}-${id}`, source: parentId, target: id, type: "default" });
    }

    processed++;
    if (processed % batchSize === 0) {
      onProgress?.({ processed, total, phase: "building-tree" });
    }

    if (entry.children) {
      const sorted = [...entry.children].sort((a, b) => a.name.localeCompare(b.name));
      for (const child of sorted) {
        walk(child, id, depth + 1, fullPath);
      }
    }
  }

  walk(root, null, 0, "");
  onProgress?.({ processed: total, total, phase: "building-tree" });
  return { nodes, edges, hiddenFileIds };
}

export function filterTree(
  entry: TreeEntry,
  options: ImportOptions,
  currentDepth = 0,
): TreeEntry | null {
  const name = entry.name;

  // Filter hidden files
  if (!options.includeHidden && name.startsWith(".")) return null;

  // Filter vendored directories
  if (!options.includeVendored && entry.type === "folder" && VENDORED_DIRS.has(name)) return null;

  // Depth limit (0 = unlimited)
  if (options.maxDepth > 0 && currentDepth >= options.maxDepth && entry.type === "folder") return null;

  // Filter by extension (files only)
  if (entry.type === "file" && !matchesExtension(name, options.extensions, options.caseSensitiveExtensions)) return null;

  // Recursively filter children
  if (entry.children) {
    const filteredChildren = entry.children
      .map((child) => filterTree(child, options, currentDepth + 1))
      .filter((c): c is TreeEntry => c !== null);

    // If this is a folder and all children were filtered out
    if (entry.type === "folder" && options.skipEmptyFolders && filteredChildren.length === 0) return null;

    return { ...entry, children: filteredChildren.length > 0 ? filteredChildren : undefined };
  }

  return entry;
}