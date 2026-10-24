import type { FewerEdge, FewerNode } from "./types";
import type { ScanBatch, ScanDirEntry } from "./progressiveScan";
import { buildBatchGraph, buildGraphFromBatches, buildRootNode, type BatchGraph } from "./progressiveGraph";

/**
 * Deterministic perf fixtures (T-209): synthetic directory trees in the same
 * shape the progressive scan emits, so benches and budget tests drive the REAL
 * store path (`buildGraphFromBatches` → `appendGraphBatch`) instead of a
 * hand-rolled stand-in. No randomness: two runs with the same options produce
 * byte-identical batches, so before/after numbers are comparable.
 *
 * Layout: a balanced-ish tree with a configurable fanout/depth mix — a small
 * fanout at the top (wide roots), larger fanouts deeper (a real monorepo is
 * shallow and wide), plus a tail of deep narrow chains so contour layout gets
 * both a breadth and a depth workload.
 */

export interface PerfTreeOptions {
  /** Target number of DIRECTORIES in the tree (files are added on top). */
  folders: number;
  /** Directories' fanout at depth 1 (children of the root). */
  rootFanout?: number;
  /** Files emitted per directory (0 = folders-only tree). */
  filesPerFolder?: number;
  /** Root folder name. */
  rootName?: string;
}

/** One synthetic directory: its relative path, depth, and child folder names. */
interface SyntheticDir {
  rel: string;
  depth: number;
  childDirs: string[];
  files: ScanDirEntry[];
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Build the synthetic directory list (breadth-first, so the batch order is
 * exactly the order `continueScan` would emit).
 */
function synthDirs(opts: Required<Pick<PerfTreeOptions, "folders" | "rootFanout" | "filesPerFolder">>): SyntheticDir[] {
  const { folders, rootFanout, filesPerFolder } = opts;
  const dirs: SyntheticDir[] = [];
  let made = 0;
  // Breadth-first queue of directories still to fill. The root is depth 0.
  const queue: Array<{ rel: string; depth: number }> = [{ rel: "", depth: 0 }];
  while (queue.length && made < folders) {
    const cur = queue.shift()!;
    // Wider fanout near the top, narrower deeper down (real trees are shallow).
    const fanout = cur.depth === 0 ? rootFanout : Math.max(2, Math.floor(rootFanout / (cur.depth + 1)));
    const childDirs: string[] = [];
    for (let i = 0; i < fanout && made < folders; i++) {
      const name = `d${pad(made + 1)}`;
      made++;
      childDirs.push(name);
      queue.push({ rel: cur.rel ? `${cur.rel}/${name}` : name, depth: cur.depth + 1 });
    }
    const files: ScanDirEntry[] = [];
    for (let i = 0; i < filesPerFolder; i++) {
      files.push({ name: `f${pad(i)}.txt`, type: "file", size: 1024 * (i + 1) });
    }
    dirs.push({ rel: cur.rel, depth: cur.depth, childDirs, files });
  }
  return dirs;
}

/**
 * Synthetic directories → scan batches, in the breadth-first order the walker
 * emits them (parent before child), so each batch's parent is already on the
 * canvas when `appendGraphBatch` runs.
 */
export function perfScanBatches(opts: PerfTreeOptions): { rootName: string; batches: ScanBatch[] } {
  const rootName = opts.rootName ?? "perf-root";
  const folders = Math.max(1, opts.folders);
  const rootFanout = opts.rootFanout ?? 8;
  const filesPerFolder = opts.filesPerFolder ?? 0;
  const dirs = synthDirs({ folders, rootFanout, filesPerFolder });
  const batches: ScanBatch[] = [];
  for (const d of dirs) {
    const entries: ScanDirEntry[] = [
      ...d.childDirs.map((name): ScanDirEntry => ({ name, type: "folder" })),
      ...d.files,
    ];
    if (entries.length) batches.push({ parentPath: d.rel, parentDepth: d.depth, entries });
  }
  return { rootName, batches };
}

/**
 * The full skeleton graph for a fixture (root + every batch), as
 * `openSkeletonWith` builds it.
 */
export function perfSkeletonGraph(opts: PerfTreeOptions): { rootName: string; graph: BatchGraph } {
  const { rootName, batches } = perfScanBatches(opts);
  return { rootName, graph: buildGraphFromBatches(rootName, batches, { includeFiles: (opts.filesPerFolder ?? 0) > 0 }) };
}

/**
 * A progressive split of a fixture: the first `skeletonBatches` batches as the
 * skeleton, the rest as background batches (each with the parent resolver a
 * real scan uses). Lets a bench drive `appendGraphBatch` with the same shapes
 * the shell produces.
 */
export function perfProgressiveSplit(
  opts: PerfTreeOptions,
  skeletonBatches: number,
): {
  rootName: string;
  skeleton: BatchGraph;
  background: BatchGraph[];
  rootId: string;
} {
  const { rootName, batches } = perfScanBatches(opts);
  const includeFiles = (opts.filesPerFolder ?? 0) > 0;
  const head = batches.slice(0, skeletonBatches);
  const tail = batches.slice(skeletonBatches);
  const skeleton = buildGraphFromBatches(rootName, head, { includeFiles });
  const rootId = skeleton.nodes.find((n) => n.data.isRoot)?.id ?? buildRootNode(rootName).id;
  // path → id, the same resolver `progressiveOpen.pathIdOf` maintains.
  const pathId = new Map<string, string>(skeleton.nodes.map((n) => [n.data.path, n.id]));
  const background: BatchGraph[] = [];
  for (const batch of tail) {
    const built = buildBatchGraph(
      rootName,
      batch,
      (rel) => pathId.get(rel ? `${rootName}/${rel}` : rootName),
      { includeFiles, rootId },
    );
    for (const n of built.nodes) pathId.set(n.data.path, n.id);
    background.push(built);
  }
  return { rootName, skeleton, background, rootId };
}

/** Convenience: a full node/edge pair for a fixture (e.g. layout benches). */
export function perfGraph(opts: PerfTreeOptions): { nodes: FewerNode[]; edges: FewerEdge[] } {
  const { graph } = perfSkeletonGraph(opts);
  return { nodes: graph.nodes, edges: graph.edges };
}
