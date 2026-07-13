import { v4 as uuid } from "uuid";
import type { FewerNode, FewerEdge, TreeEntry } from "./types";
import { categorizeByExtension, getFileExtension } from "./categorize";

interface BuildOptions {
  /** Bump this when you need to regenerate IDs without remounting. */
  idPrefix?: string;
}

/**
 * Convert a hierarchical TreeEntry into a flat list of React Flow nodes + edges
 * representing the parent/child relationships.
 */
export function treeToGraph(
  root: TreeEntry,
  options: BuildOptions = {}
): { nodes: FewerNode[]; edges: FewerEdge[] } {
  const nodes: FewerNode[] = [];
  const edges: FewerEdge[] = [];
  const prefix = options.idPrefix ?? "n";

  function walk(entry: TreeEntry, parentId: string | null, depth: number, pathPrefix: string) {
    const id = `${prefix}-${uuid().slice(0, 8)}`;
    const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    const extension = entry.type === "file" ? getFileExtension(entry.name) : "";
    const category = entry.type === "file" ? categorizeByExtension(extension) : undefined;

    nodes.push({
      id,
      type: entry.type,
      position: { x: 0, y: 0 }, // layout fills these in
      data: {
        label: entry.name,
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
      for (const child of entry.children) {
        walk(child, id, depth + 1, fullPath);
      }
    }
  }

  walk(root, null, 0, "");
  return { nodes, edges };
}
