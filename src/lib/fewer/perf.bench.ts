#!/usr/bin/env bun
/**
 * Perf bench (T-241): per-stage timings at 5k / 20k / 50k directories, driving
 * the REAL code paths (layout, minimap painter, child-row derivation, lookups,
 * visibility filter, and a real `setGraph` open). Run:
 *
 *   bun run perf:bench
 *
 * Numbers are the baseline the CI budgets in perfBudgets.test.ts are derived
 * from — re-run after any optimization pass and tighten budgets accordingly.
 * Pure stages are hermetic (no store, no React); the setGraph stage touches
 * the shared store singleton, so run this alone, not inside `bun test`.
 */

import { performance } from "node:perf_hooks";
import { useGraphStore } from "@/store/graphStore";
import { layoutGraphSync } from "./layout";
import { filterVisibleNodes } from "@/hooks/use-canvas-visible-graph";
import { buildMinimapGeometry } from "./minimapPath";
import { capHiddenRows, HIDDEN_ROW_BUDGET } from "./hiddenGroups";
import { childRowsOf, nodeByIdOf, resetCardChildSlots } from "./cardChildRows";
import { sortedChildRows } from "./nodeDisplay";
import { perfLayouted, perfTree } from "./perfFixtures";
import type { FewerNode } from "./types";

const SIZES = [5_000, 20_000, 50_000];
const MOUNTED_CARDS = 125; // what the viewport holds after culling (T-239)
const WRITES = 500;

function ms(t0: number): number {
  return +(performance.now() - t0).toFixed(2);
}

function bench(label: string, fn: () => void): number {
  const t0 = performance.now();
  fn();
  const elapsed = ms(t0);
  console.log(`${label.padEnd(52)} ${elapsed.toFixed(2)} ms`);
  return elapsed;
}

console.log("perf bench (T-241) — sizes in directories\n");

// ── 1. full open path: setGraph + layout on the real store ─────────────────
console.log("1. open path (real store, setGraph + layout)");
for (const size of SIZES) {
  const { nodes, edges } = perfTree({ folders: size, filesPerFolder: 2 });
  bench(`  setGraph+layout ${size.toLocaleString()} dirs`, () => {
    useGraphStore.getState().setGraph(nodes, edges, false);
    layoutGraphSync(useGraphStore.getState().nodes, useGraphStore.getState().edges);
  });
}

// ── 2. child rows: cold vs warm slot, 20k folders ─────────────────────────
console.log("\n2. child rows — first call (cold) vs repeat call (warm), 20k folders");
const { nodes: nodes20k, edges: edges20k } = perfTree({ folders: 20_000, rootFanout: 8, fanout: 16 });
resetCardChildSlots();
const folderIds = nodes20k.filter((n) => n.data.type === "folder").map((n) => n.id).slice(0, MOUNTED_CARDS);
bench("  childRowsOf cold  × 125 cards", () => {
  resetCardChildSlots();
  for (const id of folderIds) childRowsOf(id, nodes20k, edges20k);
});
bench("  childRowsOf warm  × 125 cards (same arrays)", () => {
  for (const id of folderIds) childRowsOf(id, nodes20k, edges20k);
});
const nodes20kCopy = [...nodes20k];
const edges20kCopy = [...edges20k];
bench("  childRowsOf warm  × 125 cards (fresh arrays, same content)", () => {
  for (const id of folderIds) childRowsOf(id, nodes20kCopy, edges20kCopy);
});

// ── 3. height lookups: nodeByIdOf (index) vs linear find ──────────────────
console.log("\n3. manual-height lookup — 125 cards × 500 writes, 20k nodes");
const lookupIds = folderIds.slice(0, MOUNTED_CARDS);
const benchArr = nodes20k.map((n) => ({ ...n })); // one array identity, reused — mirrors `s.nodes` stable across non-node writes
bench("  nodes.find × 125 × 500 (old path)", () => {
  for (let w = 0; w < WRITES; w++) {
    for (const id of lookupIds) benchArr.find((n) => n.id === id);
  }
});
bench("  nodeByIdOf × 125 × 500 (indexed path)", () => {
  for (let w = 0; w < WRITES; w++) {
    for (const id of lookupIds) nodeByIdOf(benchArr, id);
  }
});

// ── 4. minimap geometry ───────────────────────────────────────────────────
console.log("\n4. minimap path painter — buildMinimapGeometry");
for (const size of SIZES) {
  const laid = perfLayouted({ folders: size });
  bench(`  minimap ${size.toLocaleString()} nodes`, () => {
    buildMinimapGeometry(laid);
  });
}
const laid100k = perfLayouted({ folders: 100_000 });
bench(`  minimap 100k nodes (stride thinning)`, () => {
  buildMinimapGeometry(laid100k);
});

// ── 5. visibility filter ──────────────────────────────────────────────────
console.log("\n5. filterVisibleNodes — 20k nodes, 5k hidden");
const hidden20k = nodes20k.slice(0, 5_000).map((n) => n.id);
bench("  filterVisibleNodes 20k / 5k hidden", () => {
  filterVisibleNodes(nodes20k, hidden20k);
});

// ── 6. hidden-cards row cap ───────────────────────────────────────────────
console.log("\n6. capHiddenRows — 100k hidden roots, budget 300");
const hiddenGroups = [
  {
    parentNode: { id: "ctx", data: { label: "ctx" } } as any,
    parentPath: "/ctx",
    hiddenCount: 100_000,
    roots: Array.from({ length: 100_000 }, (_, i) => ({ node: { id: `h-${i}` } as any, children: [] })),
  },
];
bench("  capHiddenRows 100k roots × budget 300", () => {
  capHiddenRows(hiddenGroups, HIDDEN_ROW_BUDGET);
});

// ── 7. parity check — childRowsOf warm equals sortedChildRows content ─────
console.log("\n7. parity check — childRowsOf warm equals sortedChildRows content");
const sample = nodes20k.filter((n) => n.data.type === "folder").slice(0, 10);
let mismatches = 0;
for (const n of sample) {
  const a = childRowsOf(n.id, nodes20k, edges20k);
  const b = sortedChildRows(n.id, nodes20k, edges20k);
  if (a.map((x) => x.id).join(",") !== b.map((x) => x.id).join(",")) mismatches++;
}
console.log(`  childRowsOf vs sortedChildRows on 10 folders: ${mismatches} mismatches`);
console.log("\nbench done.");
