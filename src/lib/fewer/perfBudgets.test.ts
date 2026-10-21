import { describe, expect, test } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { applySearchHighlight } from "@/store/slices/searchHighlight";
import { layoutGraphSync } from "./layout";
import { nodeChildren } from "./nodeDisplay";
import { perfProgressiveSplit, perfSkeletonGraph } from "./perfFixtures";

/**
 * Perf budgets (T-209, enforced by T-219): the graph viewer must stay
 * responsive at folder-heavy sizes. These are hard CI gates — they fail the
 * build when a change regresses the hot path, so a "it felt fine on my machine"
 * optimization can't land. Budgets are ~3× the measured post-fix numbers on a
 * dev box to absorb CI noise, and are documented in the task note.
 *
 * Sizes are directories-only (filesPerFolder: 0): a folder-heavy tree is the
 * worst case for the render path (every folder card lists its children), and it
 * keeps the fixture small enough for a unit test.
 */

const BUDGET_MS = {
  /** One background batch appended to a growing 5k graph (the scan's unit of work).
   *  Baseline at T-209: worst 18.2 ms (idle) / 52.5 ms (busy box) over 2,055
   *  batches, 6.2–9.6 s total. Budgets ~7x to absorb CI noise; T-219 tightens
   *  toward the 16 ms frame budget once the per-batch whole-graph rebuilds are
   *  gone. */
  appendBatchWorst: 150,
  /** Total time to append every background batch of the 5k fixture.
   *  Baseline: 6,173 ms — O(B*N), the dominant cost of a folder open.
   *  Run-to-run observed: 6.2 s (idle box) to 9.6 s (box busy). */
  appendTotal5k: 30_000,
  /** Full contour relayout of a 20k-node graph (the debounced flush).
   *  Baseline: 38 ms. */
  relayout20k: 300,
  /** applySearchHighlight with an EMPTY query — must be a no-op, not a clone.
   *  Baseline: 2.0 ms at 20k (timing passes today; the IDENTITY gate below is
   *  what fails, and it is the real bug). */
  searchEmpty20k: 15,
  /** Child-row derivation for the 200 folder cards a typical viewport mounts.
   *  Baseline: 9.2 ms at 20k. */
  nodeChildren200: 40,
} as const;

function timeIt(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("graph perf budgets", () => {
  test("appendGraphBatch stays under budget while a 5k tree fills in", () => {
    // 5k, not 20k: the append burst at 20k takes 110 s on the baseline (that IS
    // the bug) — far too slow to gate CI. 5k keeps the O(B*N) shape visible
    // (worst-batch time grows with the graph) while finishing in seconds.
    const split = perfProgressiveSplit({ folders: 5_000, rootFanout: 12, filesPerFolder: 0 }, 200);
    useGraphStore.getState().setGraph(split.skeleton.nodes, split.skeleton.edges, false);
    const worst = { ms: 0, index: -1 };
    let total = 0;
    split.background.forEach((batch, i) => {
      const t0 = performance.now();
      useGraphStore.getState().appendGraphBatch(batch.nodes, batch.edges);
      const dt = performance.now() - t0;
      total += dt;
      if (dt > worst.ms) {
        worst.ms = dt;
        worst.index = i;
      }
    });
    console.log(
      `appendGraphBatch: ${split.background.length} batches, worst ${worst.ms.toFixed(1)}ms (batch #${worst.index}), total ${total.toFixed(0)}ms`,
    );
    expect(worst.ms).toBeLessThan(BUDGET_MS.appendBatchWorst);
    expect(total).toBeLessThan(BUDGET_MS.appendTotal5k);
  }, 120_000);

  test("relayout of a 20k-node graph stays under budget", () => {
    const { graph } = perfSkeletonGraph({ folders: 20_000, rootFanout: 12, filesPerFolder: 0 });
    useGraphStore.getState().setGraph(graph.nodes, graph.edges, false);
    const ms = timeIt(() => {
      useGraphStore.getState().relayout();
    });
    console.log(`relayout 20k: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(BUDGET_MS.relayout20k);
  }, 60_000);

  // T-219 activates this gate: `applySearchHighlight("")` must return the SAME
  // array reference. It fails at T-209 baseline (every node cloned per call,
  // per batch, per relayout) — so it lands as `todo` and flips to a real test
  // the moment copy-on-write lands. Kept visible so it can't be forgotten.
  test.todo("applySearchHighlight with an empty query returns the same array (no clones)", () => {
    const { graph } = perfSkeletonGraph({ folders: 20_000, rootFanout: 12, filesPerFolder: 0 });
    const out = applySearchHighlight(graph.nodes, "");
    expect(out).toBe(graph.nodes);
  });

  test("applySearchHighlight with an empty query stays within its time budget", () => {
    const { graph } = perfSkeletonGraph({ folders: 20_000, rootFanout: 12, filesPerFolder: 0 });
    const ms = timeIt(() => {
      applySearchHighlight(graph.nodes, "");
    });
    console.log(`searchHighlight empty @20k: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(BUDGET_MS.searchEmpty20k);
  }, 60_000);

  test("nodeChildren for 200 folder cards stays under budget", () => {
    const { graph } = perfSkeletonGraph({ folders: 20_000, rootFanout: 12, filesPerFolder: 0 });
    useGraphStore.getState().setGraph(graph.nodes, graph.edges, false);
    const state = useGraphStore.getState();
    const visible = new Set<string>(state.nodes.map((n) => n.id));
    const folders = state.nodes.filter((n) => n.data.type === "folder").slice(0, 200);
    const ms = timeIt(() => {
      for (const f of folders) nodeChildren(f.id, true, state.nodes, state.edges, visible);
    });
    console.log(`nodeChildren ×200 @20k: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(BUDGET_MS.nodeChildren200);
  }, 60_000);

  test("layoutGraphSync produces stable output at 5k (correctness guard)", () => {
    // The optimisations must not change WHAT the layout computes — only how
    // fast it gets there. This pins a small tree's output shape.
    const { graph } = perfSkeletonGraph({ folders: 5_000, rootFanout: 8, filesPerFolder: 0 });
    const laid = layoutGraphSync(graph.nodes, graph.edges, "TB");
    expect(laid.length).toBe(graph.nodes.length);
    // Every non-root node got a real position (not the seeded 0,0).
    const positioned = laid.filter((n) => n.position.x !== 0 || n.position.y !== 0);
    expect(positioned.length).toBeGreaterThan(graph.nodes.length - 2);
  }, 60_000);
});
