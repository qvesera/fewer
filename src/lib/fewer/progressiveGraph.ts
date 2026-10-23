import { v4 as uuid } from "uuid";
import { categorizeByExtension, getFileExtension } from "./categorize";
import type { FewerEdge, FewerNode, SymlinkInfo } from "./types";
import type { ScanBatch } from "./progressiveScan";

/**
 * Scan batches → graph nodes (T-205/206). Mirrors chunkTreeToGraph's node
 * shape (label/path/category/depth) so a progressively loaded folder is
 * indistinguishable from a fully loaded one — only the id space and the
 * timing differ.
 */

export function buildRootNode(rootName: string): FewerNode {
  const id = `p-${uuid().slice(0, 8)}`;
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: {
      label: rootName,
      path: rootName,
      type: "folder",
      depth: 0,
      isRoot: true,
    },
  };
}

export interface BatchGraph {
  nodes: FewerNode[];
  edges: FewerEdge[];
}

/**
 * One scan batch → nodes/edges. `parentIdOf` resolves the batch's parent
 * folder by its RELATIVE path ("" = root, which MUST wire to the root node —
 * T-212: forgetting that orphaned every top-level folder). When a parent can't
 * be resolved, `rootId` attaches the batch to the root instead of leaving it
 * floating: the canvas is always one tree.
 *
 * When `includeFiles` is false, file entries are dropped entirely — the
 * background append path has no hide-set pass, so emitting them would leak
 * them onto the canvas.
 */
export function buildBatchGraph(
  rootName: string,
  batch: ScanBatch,
  parentIdOf: (relPath: string) => string | undefined,
  opts: { includeFiles: boolean; rootId?: string },
): BatchGraph {
  const parentFullPath = batch.parentPath ? `${rootName}/${batch.parentPath}` : rootName;
  const parentNodeId = parentIdOf(batch.parentPath) ?? opts.rootId;
  const nodes: FewerNode[] = [];
  const edges: FewerEdge[] = [];
  for (const e of batch.entries) {
    if (e.type === "file" && !opts.includeFiles) continue;
    const id = `p-${uuid().slice(0, 8)}`;
    const fullPath = `${parentFullPath}/${e.name}`;
    const extension = e.type === "file" ? getFileExtension(e.name) : "";
    const label = extension ? e.name.slice(0, -(extension.length + 1)) : e.name;
    const category = e.type === "file" ? categorizeByExtension(extension) : undefined;
    const symlink: SymlinkInfo | undefined = e.symlink
      ? { target: e.symlink.target, resolvedPath: "", insideTree: true, broken: e.symlink.broken }
      : undefined;
    nodes.push({
      id,
      type: e.type,
      position: { x: 0, y: 0 },
      data: {
        label,
        path: fullPath,
        type: e.type,
        extension,
        category,
        size: e.size ?? 0,
        depth: batch.parentDepth + 1,
        isRoot: false,
        ...(e.isArchive ? { isArchive: true } : {}),
        ...(symlink ? { symlink } : {}),
      },
    });
    if (parentNodeId) {
      edges.push({ id: `e-${parentNodeId}-${id}`, source: parentNodeId, target: id, type: "default" });
    }
  }
  return { nodes, edges };
}

/** Skeleton: root node + every collected batch, wired parent-before-child. */
export function buildGraphFromBatches(
  rootName: string,
  batches: ScanBatch[],
  opts: { includeFiles: boolean },
): BatchGraph {
  const root = buildRootNode(rootName);
  const pathId = new Map<string, string>([[rootName, root.id]]);
  const nodes: FewerNode[] = [root];
  const edges: FewerEdge[] = [];
  for (const batch of batches) {
    const built = buildBatchGraph(
      rootName,
      batch,
      (rel) => pathId.get(rel ? `${rootName}/${rel}` : rootName),
      { ...opts, rootId: root.id },
    );
    for (const n of built.nodes) pathId.set(n.data.path, n.id);
    nodes.push(...built.nodes);
    edges.push(...built.edges);
  }
  return { nodes, edges };
}

/**
 * Defensive repair (T-212): return edges that attach every parentless non-root
 * node to the root, so a graph can never render as floating top-level cards.
 * Runs at the end of a scan; a graph that is already a tree gets an empty list.
 */
export function connectOrphansToRoot(nodes: FewerNode[], edges: FewerEdge[], rootId: string): FewerEdge[] {
  const hasParent = new Set(edges.map((e) => e.target));
  const edgeKeys = new Set(edges.map((e) => e.id));
  const extra: FewerEdge[] = [];
  for (const n of nodes) {
    if (n.id === rootId || hasParent.has(n.id) || n.type === "groupPill") continue;
    const id = `e-${rootId}-${n.id}`;
    if (edgeKeys.has(id)) continue;
    edgeKeys.add(id);
    extra.push({ id, source: rootId, target: n.id, type: "default" });
    hasParent.add(n.id);
  }
  return extra;
}