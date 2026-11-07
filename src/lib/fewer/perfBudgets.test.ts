import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { resetCardChildSlots } from "./cardChildRows";
import { layoutGraphSync } from "./layout";
import { filterVisibleNodes } from "@/hooks/use-canvas-visible-graph";
import { buildMinimapGeometry } from "./minimapPath";
import { capHiddenRows, HIDDEN_ROW_BUDGET } from "./hiddenGroups";
import { childRowsOf, nodeByIdOf } from "./cardChildRows";
import { perfTree, perfLayouted } from "./perfFixtures";
import type { FewerNode } from "./types";

const initial = useGraphStore.getInitialState();

beforeEach(() => {
  resetCardChildSlots();
  useGraphStore.setState({ ...initial });
});
afterEach(() => {
  resetCardChildSlots();
  useGraphStore.setState({ ...initial });
});

/*
 * Perf budgets (T-241). Numbers are ~5-8x the measured post-fix values on a
 * dev box (see `bun run perf:bench` output), wide enough to absorb CI noise,
 * tight enough that regressing the hot path fails the build:
 *
 *   - removing the card-child slot map makes warm child rows ~8ms (> 5ms)
   *   - dropping the slot identity gate makes fresh-array warm calls rebuild (> 30ms)
   *   - reintroducing whole-array sorting per card multiplies child-row cost
   *   - replacing buildMinimapGeometry with per-node MiniMap elements would
     push 20k from ~12ms to seconds and 100k beyond memory
   *   - dropping nodeIndexOf pushes manual-height lookup back above budget
 *
 * Budgets are deliberately loose; they exist to catch regressions, not to
 * measure precisely. Re-run `bun run perf:bench` after any optimization pass
 * and tighten them.
 */

const BUDGET = {
  openSetGraphLayout20k: 1500, // measured ~229ms
  childRowsWarmSameArrays125: 5, // measured ~0.18ms
  childRowsWarmFreshArrays125: 30, // measured ~5.75ms (content-compare slot hit)
  nodeByIdOf125x500: 100, // measured ~4ms on one array identity
  minimap20k: 100, // measured ~12ms
  minimap100k: 400, // measured ~38ms (stride keeps it flat)
  capHiddenRows100k: 100, // measured <1ms
  filterVisibleNodes20k: 100, // measured ~3ms
} as const;

describe("perf budgets (T-241)", () => {
  test("open path: setGraph + layout of a 20k-dir graph stays under budget", () => {
    const { nodes, edges } = perfTree({ folders: 20_000, filesPerFolder: 2 });
    const t0 = performance.now();
    useGraphStore.getState().setGraph(nodes, edges, false);
    layoutGraphSync(useGraphStore.getState().nodes, useGraphStore.getState().edges);
    expect(performance.now() - t0).toBeLessThan(BUDGET.openSetGraphLayout20k);
  });

  test("child rows: warm slot hit on the same arrays stays cheap", () => {
    const { nodes, edges } = perfTree({ folders: 20_000, rootFanout: 8, fanout: 16 });
    const folderIds = nodes
      .filter((n) => n.data.type === "folder")
      .map((n) => n.id)
      .slice(0, 125);
    resetCardChildSlots();
    for (const id of folderIds) childRowsOf(id, nodes, edges); // prime
    const t0 = performance.now();
    for (const id of folderIds) childRowsOf(id, nodes, edges); // warm: same arrays
    expect(performance.now() - t0).toBeLessThan(BUDGET.childRowsWarmSameArrays125);
  });

  test("child rows: slot identity gate survives fresh arrays with same content", () => {
    const { nodes, edges } = perfTree({ folders: 1_000 });
    const id = nodes[0]!.id;
    resetCardChildSlots();
    const first = childRowsOf(id, nodes, edges);
    const second = childRowsOf(id, [...nodes], [...edges]); // same content, new identity
    expect(second).toBe(first); // the slot gate: no rebuild, same ref
  });

  test("nodeByIdOf on one array identity stays under budget", () => {
    const { nodes } = perfTree({ folders: 20_000 });
    const ids = nodes.filter((n) => n.data.type === "folder").map((n) => n.id).slice(0, 125);
    const t0 = performance.now();
    for (let w = 0; w < 500; w++) for (const id of ids) nodeByIdOf(nodes, id);
    expect(performance.now() - t0).toBeLessThan(BUDGET.nodeByIdOf125x500);
  });

  test("minimap geometry stays sub-linear at 100k nodes", () => {
    const laid20k = perfLayouted({ folders: 20_000 });
    const t0 = performance.now();
    buildMinimapGeometry(laid20k);
    expect(performance.now() - t0).toBeLessThan(BUDGET.minimap20k);

    const laid100k = perfLayouted({ folders: 100_000 });
    const t1 = performance.now();
    buildMinimapGeometry(laid100k);
    expect(performance.now() - t1).toBeLessThan(BUDGET.minimap100k);
  });

  test("capHiddenRows paints at most the budget and accounts for the rest", () => {
    const groups: { parentNode: any; parentPath: string; hiddenCount: number; roots: any[] }[] = [
      {
        parentNode: { id: "ctx", data: { label: "ctx" } },
        parentPath: "/ctx",
        hiddenCount: 100_000,
        roots: Array.from({ length: 100_000 }, (_, i) => ({
          node: { id: `h-${i}` } as FewerNode,
          children: [],
        })),
      },
    ];
    const t0 = performance.now();
    const capped = capHiddenRows(groups, HIDDEN_ROW_BUDGET);
    expect(performance.now() - t0).toBeLessThan(BUDGET.capHiddenRows100k);
    expect(capped.shown).toBe(HIDDEN_ROW_BUDGET);
    expect(capped.omitted).toBe(100_001 - HIDDEN_ROW_BUDGET);
  });

  test("filterVisibleNodes stays under budget at 20k nodes / 5k hidden", () => {
    const { nodes } = perfTree({ folders: 20_000 });
    const hidden = nodes.slice(0, 5_000).map((n) => n.id);
    const t0 = performance.now();
    filterVisibleNodes(nodes, hidden);
    expect(performance.now() - t0).toBeLessThan(BUDGET.filterVisibleNodes20k);
  });
});
