import { describe, expect, test } from "bun:test";
import type { FewerEdge, FewerNode } from "./types";
import { compareEdgePaintOrder, mergeSortedEdges, sortEdges } from "./importMerge";
import { childRowsOf, childCountOf, nodeByIdOf, resetCardChildSlots } from "./cardChildRows";

// T-219: the append path's two derived helpers. `mergeSortedEdges` must be
// EXACTLY `sortEdges` on the same input (painter order is user-visible), and
// `childRowsOf` must hand back the previous array when a card's children are
// unchanged — that referential stability is what lets a scan batch skip
// re-rendering cards whose subtree did not change.

function node(id: string, label: string, type: "folder" | "file"): FewerNode {
  return { id, type, position: { x: 0, y: 0 }, data: { label, path: `/${label}`, type } } as FewerNode;
}

function edge(source: string, target: string): FewerEdge {
  return { id: `e-${source}-${target}`, source, target, type: "default" } as FewerEdge;
}

const NODES: FewerNode[] = [
  node("root", "root", "folder"),
  node("zfolder", "zfolder", "folder"),
  node("afile", "afile.txt", "file"),
  node("mfile", "mfile.txt", "file"),
  node("afolder", "afolder", "folder"),
];
const NODE_MAP = new Map(NODES.map((n) => [n.id, n]));

describe("mergeSortedEdges ≡ sortEdges", () => {
  const cases: Array<{ name: string; edges: FewerEdge[]; incoming: FewerEdge[] }> = [
    {
      name: "empty incoming",
      // The merge contract: `existing` arrives ALREADY in painter order.
      edges: [edge("root", "afile"), edge("root", "zfolder")],
      incoming: [],
    },
    {
      name: "incoming interleaves by label/type",
      // Painter order is reverse-label: among folders "zfolder" precedes
      // "afolder", so that is the pre-sorted starting point.
      edges: [edge("root", "zfolder"), edge("root", "afolder")],
      incoming: [edge("root", "mfile"), edge("root", "afile")],
    },
    {
      name: "unknown targets sort as files with empty labels",
      edges: [edge("root", "zfolder")],
      incoming: [edge("ghost-root", "ghost-target")],
    },
  ];

  for (const { name, edges, incoming } of cases) {
    test(name, () => {
      const merged = mergeSortedEdges(edges, incoming, NODE_MAP);
      const sorted = sortEdges([...edges, ...incoming], NODES);
      expect(merged.map((e) => e.id)).toEqual(sorted.map((e) => e.id));
    });
  }

  test("merge is stable on ties: existing edges stay before equal incoming", () => {
    // Same target ⇒ equal comparator keys ⇒ sort must preserve concatenation
    // order, and the merge must too.
    const a = edge("root", "afile");
    const b = { ...edge("root", "afile"), id: "e-dup" } as FewerEdge;
    const existing = sortEdges([a], NODES);
    const merged = mergeSortedEdges(existing, [b], NODE_MAP);
    expect(merged.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(sortEdges([...existing, b], NODES).map((e) => e.id)).toEqual([a.id, b.id]);
  });

  test("merge returns the same array when nothing is incoming", () => {
    const existing = sortEdges([edge("root", "afile")], NODES);
    expect(mergeSortedEdges(existing, [], NODE_MAP)).toBe(existing);
  });
});

describe("compareEdgePaintOrder", () => {
  test("files sort before folders, then reverse label", () => {
    const cmp = compareEdgePaintOrder(NODE_MAP);
    const file = edge("root", "afile");
    const folder = edge("root", "afolder");
    expect(cmp(file, folder)).toBeLessThan(0); // files first
    // Reverse label among folders: "zfolder" sorts BEFORE "afolder".
    const z = edge("root", "zfolder");
    expect(cmp(z, folder)).toBeLessThan(0);
  });
});

describe("cardChildRows", () => {
  const ROOT = node("root", "src", "folder");
  const A = node("a", "alpha", "folder");
  const B = node("b", "beta", "file");
  const edgesOf = (extra: FewerEdge[] = []) => [
    ...extra,
    { id: "e-root-a", source: "root", target: "a", type: "default" } as FewerEdge,
    { id: "e-root-b", source: "root", target: "b", type: "default" } as FewerEdge,
  ];

  test("childRowsOf sorts folders first and is stable when content is unchanged", () => {
    resetCardChildSlots();
    const nodes1 = [ROOT, A, B];
    const edges1 = edgesOf();
    const rows1 = childRowsOf("root", nodes1, edges1);
    expect(rows1.map((r) => r.id)).toEqual(["a", "b"]); // folder first

    // Same content, NEW array identities (what a scan batch produces) — the
    // rows must keep their previous reference so selectors don't fire.
    const nodes2 = [ROOT, A, B];
    const edges2 = edgesOf();
    const rows2 = childRowsOf("root", nodes2, edges2);
    expect(rows2).toBe(rows1);
  });

  test("childRowsOf returns a NEW array when a child is added", () => {
    resetCardChildSlots();
    const nodes1 = [ROOT, A, B];
    const edges1 = edgesOf();
    const rows1 = childRowsOf("root", nodes1, edges1);

    const C = node("c", "gamma", "file");
    const nodes2 = [ROOT, A, B, C];
    const edges2 = edgesOf([{ id: "e-root-c", source: "root", target: "c", type: "default" } as FewerEdge]);
    const rows2 = childRowsOf("root", nodes2, edges2);
    expect(rows2).not.toBe(rows1);
    expect(rows2.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  test("childRowsOf returns a NEW array when a child node object changes", () => {
    resetCardChildSlots();
    const nodes1 = [ROOT, A, B];
    const rows1 = childRowsOf("root", nodes1, edgesOf());
    // Size/symlink refresh replaces the node object in place (append path) —
    // a stale row would render the old size.
    const A2 = { ...A, data: { ...A.data, size: 42 } };
    const rows2 = childRowsOf("root", [ROOT, A2, B], edgesOf());
    expect(rows2).not.toBe(rows1);
    expect(rows2.find((r) => r.id === "a")?.data.size).toBe(42);
  });

  test("childRowsOf for a parentless id returns [] and stays stable", () => {
    resetCardChildSlots();
    const nodes = [ROOT, A, B];
    const r1 = childRowsOf("nope", nodes, edgesOf());
    expect(r1).toEqual([]);
    expect(childRowsOf("nope", [ROOT, A, B], edgesOf())).toBe(r1);
  });

  test("childCountOf counts edges including dangling targets", () => {
    const edges = edgesOf([{ id: "e-root-ghost", source: "root", target: "ghost", type: "default" } as FewerEdge]);
    expect(childCountOf("root", edges)).toBe(3);
    expect(childCountOf("root", edges.slice(0, 2))).toBe(2);
    expect(childCountOf("missing", edges)).toBe(0);
  });

  test("nodeByIdOf finds a node by id", () => {
    const nodes = [ROOT, A, B];
    expect(nodeByIdOf(nodes, "b")?.data.label).toBe("beta");
    expect(nodeByIdOf(nodes, "ghost")).toBeUndefined();
  });
});
