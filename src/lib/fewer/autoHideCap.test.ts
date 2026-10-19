import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { computeLargeFolderHiddenIds } from "./importMerge";
import type { FewerEdge, FewerNode } from "./types";

// The auto-hide cap: a folder shows its FIRST `threshold` children (in the
// canvas sort order); everything past that index is hidden together with its
// subtree, the rule cascades into every visible folder, and manual reveals win
// on top of the cap (T-174).

function makeNode(
  id: string,
  label: string,
  parentId: string | null,
  opts: Partial<FewerNode["data"]> = {},
): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path: `/${label}`, type: "folder", parentId, ...opts },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeEdge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "smoothstep" } as FewerEdge;
}

/** Zero-padded labels so the A–Z sort order is exactly the numeric order. */
const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, "0")}`);

/** root → big → [k00..k04 files] + sub(folder → x00..x04 files). */
function seedGraph() {
  const bigKids = ids("k", 5);
  const subKids = ids("x", 5);
  const nodes: FewerNode[] = [
    makeNode("root", "root", null, { isRoot: true, depth: 0 }),
    makeNode("big", "big", "root", { depth: 1 }),
    ...bigKids.map((id) => makeNode(id, id, "big", { type: "file", depth: 2 })),
    makeNode("sub", "sub", "big", { depth: 2 }),
    ...subKids.map((id) => makeNode(id, id, "sub", { type: "file", depth: 3 })),
  ];
  const edges: FewerEdge[] = [
    makeEdge("root", "big"),
    ...bigKids.map((id) => makeEdge("big", id)),
    makeEdge("big", "sub"),
    ...subKids.map((id) => makeEdge("sub", id)),
  ];
  useGraphStore.setState({
    nodes,
    edges,
    hiddenIds: [],
    autoHiddenIds: [],
    independentlyHiddenIds: [],
    revealedRootIds: [],
    revealedFromHidden: [],
    selectedNodeIds: [],
    autoHideThreshold: 3,
    maxDisplayDepth: 0,
    showFiles: true,
    categoryFilter: [],
    categoryHiddenIds: [],
    viewSettings: {},
    activeLeafId: null,
    tags: [],
    past: [],
    future: [],
  });
}

const s = () => useGraphStore.getState();

describe("computeLargeFolderHiddenIds keeps the first N", () => {
  const folder = makeNode("f", "f", null, { isRoot: true });
  const kids = ids("c", 5);
  const nodes = [folder, ...kids.map((id) => makeNode(id, id, "f", { type: "file" }))];
  const edges = kids.map((id) => makeEdge("f", id));

  test("children past the limit are hidden, the first `threshold` stay", () => {
    expect(computeLargeFolderHiddenIds(nodes, edges, 3).sort()).toEqual(["c03", "c04"].sort());
    expect(computeLargeFolderHiddenIds(nodes, edges, 5)).toEqual([]);
  });

  test("the hidden ids are the last ones in the requested sort order", () => {
    // size asc: c04(5), c02(10), c03(12) | c01(20), c00(30) — the two biggest
    // fall past the limit of 3. Descending flips exactly which two hide.
    const sized = kids.map((id, i) =>
      makeNode(id, id, "f", { type: "file", size: [30, 20, 10, 12, 5][i] }),
    );
    const sizedNodes = [folder, ...sized];
    const asc = computeLargeFolderHiddenIds(sizedNodes, edges, 3, undefined, { sortKey: "size" });
    expect(asc.sort()).toEqual(["c00", "c01"].sort());
    const desc = computeLargeFolderHiddenIds(sizedNodes, edges, 3, undefined, { sortKey: "size", sortDir: "desc" });
    expect(desc.sort()).toEqual(["c02", "c04"].sort());
  });

  test("a revealed child stays visible and does not displace the first N", () => {
    const shown = computeLargeFolderHiddenIds(nodes, edges, 3, new Set(["c04"]));
    expect(shown.sort()).toEqual(["c03"].sort());
  });

  test("seeded (manually hidden) folders are skipped, not re-labelled auto-hides", () => {
    const seeded = computeLargeFolderHiddenIds(nodes, edges, 0, undefined, { hiddenSeed: new Set(["c00"]) });
    expect(seeded.sort()).toEqual(["c01", "c02", "c03", "c04"].sort());
  });
});

describe("the cap cascades", () => {
  beforeEach(seedGraph);

  test("import-time caps every level: big keeps 3, sub's subtree hides with it", () => {
    const { nodes, edges } = s();
    const hidden = new Set(computeLargeFolderHiddenIds(nodes, edges, 3));
    // big's children sort as k00..k04, sub — the last three are k03, k04 and
    // sub, and sub hides WITH its whole subtree.
    expect([...hidden].sort()).toEqual(["k03", "k04", "sub", ...ids("x", 5)].sort());
  });

  test("revealing a hidden folder shows it plus ITS first N children", () => {
    s().autoHideLargeFolders();
    s().revealInView(null, "sub"); // the canvas' hidden-folder row (non-subtree)

    expect(s().hiddenIds).not.toContain("sub");
    // First 3 of sub's children come up with it; the rest wait for the user.
    for (const id of ["x00", "x01", "x02"]) expect(s().hiddenIds).not.toContain(id);
    for (const id of ["x03", "x04"]) expect(s().hiddenIds).toContain(id);
    // big's own beyond-limit kids are untouched by that gesture.
    expect(s().hiddenIds).toContain("k03");

    // A later reconcile keeps the manual reveal.
    s().autoHideLargeFolders();
    expect(s().hiddenIds).not.toContain("sub");
    expect(s().hiddenIds).not.toContain("x00");
  });

  test("raising the limit reveals what now fits, everywhere", () => {
    s().autoHideLargeFolders();
    s().revealInView(null, "sub");
    s().setAutoHideThreshold(5);

    expect(s().hiddenIds).toEqual([]);
    expect(s().autoHiddenIds).toEqual([]);
  });

  test("changing the sort re-caps the same folders", () => {
    s().autoHideLargeFolders();
    // Descending name order: sub, k04, k03 | k02, k01, k00 — a different three
    // hidden under big, and the now-visible sub re-caps its own children as
    // x04, x03, x02 | x01, x00.
    s().setSortDir("desc");

    expect([...s().hiddenIds].sort()).toEqual(["k00", "k01", "k02", "x00", "x01"].sort());
    expect([...s().autoHiddenIds].sort()).toEqual([...s().hiddenIds].sort());
  });
});
