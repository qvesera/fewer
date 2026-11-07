import type { FewerEdge, FewerNode } from "./types";
import { layoutGraphSync } from "./layout";

/**
 * Deterministic perf fixtures (T-241): synthetic directory trees in the same
 * shape a real import emits, so benches and budget tests drive the real code
 * paths instead of hand-rolled stand-ins. No randomness — same options always
 * produce byte-identical graphs, so before/after numbers are comparable.
 *
 * Layout: a balanced-ish tree. Roots fan out at `rootFanout`, internal folders
 * fan out at `fanout`, and below `depth` every remaining directory budget is
 * spent on deep narrow chains — a real monorepo is shallow and wide, but the
 * deep tail exercises contour layout's depth workload too.
 *
 * Files are emitted on top of folders (`filesPerFolder` each); with
 * `filesPerFolder: 0` the tree is folder-only, which is the worst case for the
 * render path (every folder card lists its children).
 */
export interface PerfTreeOptions {
  /** Target number of directories (folders) in the tree. */
  folders: number;
  /** Children of the root folder. */
  rootFanout?: number;
  /** Children of every internal folder below the root. */
  fanout?: number;
  /** Files emitted per directory (0 = folders-only tree). */
  filesPerFolder?: number;
  /** Depth at which the remaining budget becomes deep narrow chains. */
  depth?: number;
  /** Root folder name. */
  rootName?: string;
}

const DEFAULT_FILE = { width: 220, height: 58 };
const DEFAULT_FOLDER = { width: 240, height: 200 };

function newId(kind: string, n: number): string {
  return `${kind}-${String(n).padStart(5, "0")}`;
}

/** Build a tree of `folders` directories (+ files). Positions are zero — call
 *  `layoutGraphSync` on the result when positions matter (minimap, relayout). */
export function perfTree(opts: PerfTreeOptions): { nodes: FewerNode[]; edges: FewerEdge[] } {
  const folders = Math.max(1, opts.folders);
  const rootFanout = opts.rootFanout ?? 8;
  const fanout = opts.fanout ?? 16;
  const filesPerFolder = opts.filesPerFolder ?? 0;
  const depth = opts.depth ?? 4;
  const rootName = opts.rootName ?? "root";

  const nodes: FewerNode[] = [];
  const edges: FewerEdge[] = [];
  let nextFile = 0;
  let nextFolder = 0;

  const root = {
    id: newId("dir", nextFolder++),
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: rootName, path: `/${rootName}`, type: "folder", depth: 0, isRoot: true },
    style: { ...DEFAULT_FOLDER },
  } as FewerNode;
  nodes.push(root);

  // Queue of folders that still need children, with their depth.
  const queue: { id: string; depth: number }[] = [{ id: root.id, depth: 0 }];
  let folderBudget = folders - 1;

  while (queue.length > 0 && folderBudget > 0) {
    const parent = queue.shift()!;
    const childrenLeft = Math.min(
      parent.depth === 0 ? rootFanout : fanout,
      folderBudget,
    );
    for (let i = 0; i < childrenLeft; i++) {
      const id = newId("dir", nextFolder++);
      const child: FewerNode = {
        id,
        type: "folder",
        position: { x: 0, y: 0 },
        data: { label: `d${id}`, path: `${parentDataPath(parent.id)}`, type: "folder", depth: parent.depth + 1 },
        style: { ...DEFAULT_FOLDER },
      } as FewerNode;
      nodes.push(child);
      edges.push({ id: `e-${parent.id}-${id}`, source: parent.id, target: id, type: "smoothstep" });
      queue.push({ id, depth: parent.depth + 1 });
      folderBudget--;
    }
    // Files on this folder.
    for (let i = 0; i < filesPerFolder && nextFile < 100_000; i++) {
      const id = newId("file", nextFile++);
      nodes.push({
        id,
        type: "file",
        position: { x: 0, y: 0 },
        data: { label: `f${id}.ts`, path: `${parentDataPath(parent.id)}/f${id}.ts`, type: "file", category: "code", size: 1200 },
        style: { ...DEFAULT_FILE },
      } as FewerNode);
      edges.push({ id: `e-${parent.id}-${id}`, source: parent.id, target: id, type: "smoothstep" });
    }
  }

  // Deep narrow chains for the leftover budget — exercised below `depth`.
  while (folderBudget > 0) {
    let parentId = root.id;
    for (let d = 0; d < depth && folderBudget > 0; d++) {
      const id = newId("dir", nextFolder++);
      const child: FewerNode = {
        id,
        type: "folder",
        position: { x: 0, y: 0 },
        data: { label: `chain${id}`, path: `/chain/${id}`, type: "folder", depth: d + 1 },
        style: { ...DEFAULT_FOLDER },
      } as FewerNode;
      nodes.push(child);
      edges.push({ id: `e-chain-${parentId}-${id}`, source: parentId, target: id, type: "smoothstep" });
      parentId = id;
      folderBudget--;
    }
  }

  return { nodes, edges };
}

function parentDataPath(id: string): string {
  // Best-effort path reconstruction for display; bench numbers don't depend on it.
  return `/${id}`;
}

/** `perfTree` with positions computed by the real contour layout, so bench
 *  stages that consume positions (minimap, relayout, culling) see the same
 *  node count and footprint as a real import. */
export function perfLayouted(opts: PerfTreeOptions): FewerNode[] {
  const { nodes, edges } = perfTree(opts);
  return layoutGraphSync(nodes, edges, "TB");
}
