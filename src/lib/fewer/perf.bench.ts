/**
 * Perf bench (T-209): drive the REAL store path with synthetic trees and
 * print per-stage timings at 5k / 20k / 50k directories. Run:
 *
 *   bun run src/lib/fewer/perf.bench.ts
 *
 * Numbers are recorded in the task note before/after each optimization pass
 * (T-219) so every claim is measured, not assumed. Node-only trees (no files)
 * keep the fixture small on disk while still exercising the layout, index and
 * append paths that dominate a folder-heavy view.
 */
import { useGraphStore } from "@/store/graphStore";
import { applySearchHighlight } from "@/store/slices/searchHighlight";
import { layoutGraphSync } from "./layout";
import { nodeChildren } from "./nodeDisplay";
import { childrenIndexOf, parentIndexOf, nodeIndexOf } from "./graphIndex";
import { sortEdges } from "./importMerge";
import { perfGraph, perfProgressiveSplit, perfSkeletonGraph } from "./perfFixtures";

const SIZES = [
  { label: "5k", folders: 5_000 },
  { label: "20k", folders: 20_000 },
  { label: "50k", folders: 50_000 },
] as const;

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function log(stage: string, label: string, value: number, extra = ""): void {
  console.log(`${label.padEnd(6)} ${stage.padEnd(28)} ${value.toFixed(1).padStart(9)} ms ${extra}`);
}

for (const { label, folders } of SIZES) {
  const opts = { folders, rootFanout: 12, filesPerFolder: 0 } as const;

  // ---- Stage 1: skeleton build (walk batches → node/edge arrays) ----
  let skeletonNodes = 0;
  const tSkeleton = ms(() => {
    const { graph } = perfSkeletonGraph(opts);
    skeletonNodes = graph.nodes.length;
  });
  log("skeleton build", label, tSkeleton, `(${skeletonNodes} nodes)`);

  // ---- Stage 2: setGraph (the initial import) ----
  const { nodes, edges } = perfGraph(opts);
  const tSet = ms(() => {
    useGraphStore.getState().setGraph(nodes, edges, false);
  });
  log("setGraph", label, tSet);

  // ---- Stage 3: index builds (identity-cached) ----
  const tIdx = ms(() => {
    childrenIndexOf(useGraphStore.getState().edges);
    parentIndexOf(useGraphStore.getState().edges);
    nodeIndexOf(useGraphStore.getState().nodes);
  });
  log("graphIndex build", label, tIdx);

  // ---- Stage 4: applySearchHighlight, empty and non-empty query ----
  const curNodes = useGraphStore.getState().nodes;
  const tEmpty = ms(() => {
    applySearchHighlight(curNodes, "");
  });
  log("searchHighlight empty", label, tEmpty);
  const tQuery = ms(() => {
    applySearchHighlight(curNodes, "d01");
  });
  log("searchHighlight 'd01'", label, tQuery);

  // ---- Stage 5: relayout (full contour pass) ----
  const tLayout = ms(() => {
    useGraphStore.getState().relayout();
  });
  log("relayout", label, tLayout);

  // ---- Stage 6: sortEdges over the full graph ----
  const tSort = ms(() => {
    sortEdges(useGraphStore.getState().edges, useGraphStore.getState().nodes);
  });
  log("sortEdges", label, tSort);

  // ---- Stage 7: nodeChildren for the first 200 mounted folder cards ----
  const state = useGraphStore.getState();
  const visible = new Set<string>(state.nodes.map((n) => n.id));
  const foldersSlice = state.nodes.filter((n) => n.data.type === "folder").slice(0, 200);
  const tChildren = ms(() => {
    for (const f of foldersSlice) nodeChildren(f.id, true, state.nodes, state.edges, visible);
  });
  log("nodeChildren ×200", label, tChildren);

  // ---- Stage 8: progressive append — every background batch onto the skeleton ----
  // Fresh graph: skeleton only, then append batches one at a time (the shell
  // path). This is the stage the user actually FEELS during a folder open: a
  // real scan appends every batch the budget reaches, so the bench does too.
  const split = perfProgressiveSplit(opts, 200);
  useGraphStore.getState().setGraph(split.skeleton.nodes, split.skeleton.edges, false);
  const batches = split.background;
  let appended = 0;
  const tAppend = ms(() => {
    for (const b of batches) {
      const r = useGraphStore.getState().appendGraphBatch(b.nodes, b.edges);
      appended += r.added;
    }
  });
  log(
    `appendGraphBatch ×${batches.length}`,
    label,
    tAppend,
    `(${appended} added, avg ${(tAppend / Math.max(1, batches.length)).toFixed(1)} ms/batch)`,
  );

  // ---- Stage 9: relayout AFTER the append burst (the debounced flush) ----
  const tLayoutAfter = ms(() => {
    useGraphStore.getState().relayout();
  });
  log("relayout after append", label, tLayoutAfter);
}
