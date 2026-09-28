import { test, expect, describe } from "bun:test";
import type { FewerEdge, FewerNode } from "./types";
import { childrenIndexOf, nodeIndexOf, parentIndexOf } from "./graphIndex";
import { childrenMapOf, getDescendants, parentMapOf } from "./validation";
import { walkSubtreeReveal } from "@/store/slices/graph/reveal";
import { nodeChildren, sortedChildRows, folderChildCount } from "./nodeDisplay";

const edge = (source: string, target: string): FewerEdge =>
  ({ id: `e-${source}-${target}`, source, target, type: "default" }) as FewerEdge;
const node = (id: string, type: "folder" | "file" = "file", label = id): FewerNode =>
  ({ id, position: { x: 0, y: 0 }, style: {}, data: { type, label } }) as unknown as FewerNode;

/** Wrap an edge list so a test can count how many times it gets iterated. */
function countingEdges(edges: FewerEdge[]): { edges: FewerEdge[]; steps: () => number } {
  let steps = 0;
  return {
    edges: {
      [Symbol.iterator]: function* () {
        for (const e of edges) { steps++; yield e; }
      },
      length: edges.length,
    } as unknown as FewerEdge[],
    steps: () => steps,
  };
}

/** The pre-index reference scans. Every index-backed helper must agree with
 *  these on the awkward graphs an import can produce: cycles, dangling edges,
 *  fan-in and duplicate edges. */
const refChildIds = (parentId: string, edges: FewerEdge[]): string[] =>
  edges.filter((e) => e.source === parentId).map((e) => e.target);
const refDescendants = (rootId: string, edges: FewerEdge[]): string[] => {
  const out: string[] = [];
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const c of refChildIds(queue.shift()!, edges)) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      queue.push(c);
    }
  }
  return out;
};

const GRAPHS: { name: string; edges: FewerEdge[] }[] = [
  { name: "empty", edges: [] },
  { name: "chain", edges: [edge("a", "b"), edge("b", "c"), edge("c", "d")] },
  { name: "tree", edges: [edge("root", "a"), edge("root", "b"), edge("a", "a1"), edge("a", "a2"), edge("b", "b1")] },
  { name: "self-loop", edges: [edge("a", "a"), edge("a", "b")] },
  { name: "cycle", edges: [edge("a", "b"), edge("b", "a"), edge("b", "c")] },
  { name: "fan-in (multi-parent)", edges: [edge("p1", "x"), edge("p2", "x"), edge("x", "y")] },
  { name: "dangling", edges: [edge("a", "ghost"), edge("a", "b")] },
  { name: "duplicate edges", edges: [edge("a", "b"), edge("a", "b"), edge("b", "c")] },
  { name: "self-parent chain", edges: [edge("a", "a"), edge("a", "b"), edge("b", "b")] },
];

describe("childrenIndexOf", () => {
  for (const { name, edges } of GRAPHS) {
    test(`matches the scan it replaced (${name})`, () => {
      const index = childrenIndexOf(edges);
      const sources = new Set(edges.map((e) => e.source));
      expect(new Set(index.keys())).toEqual(sources);
      for (const source of sources) {
        expect(index.get(source)).toEqual(refChildIds(source, edges));
      }
    });
  }

  test("caches by array identity and rebuilds for a new array", () => {
    const edges = [edge("a", "b")];
    expect(childrenIndexOf(edges)).toBe(childrenIndexOf(edges));
    expect(childrenIndexOf(edges)).not.toBe(childrenIndexOf([...edges]));
  });

  test("a source with no outgoing edge has no entry", () => {
    expect(childrenIndexOf([edge("a", "b")]).has("b")).toBe(false);
  });
});

describe("parentIndexOf", () => {
  for (const { name, edges } of GRAPHS) {
    test(`matches the scan it replaced (${name})`, () => {
      const ref = new Map<string, string>();
      for (const e of edges) ref.set(e.target, e.source);
      expect(parentIndexOf(edges)).toEqual(ref);
    });
  }

  test("caches by array identity", () => {
    const edges = [edge("a", "b")];
    expect(parentIndexOf(edges)).toBe(parentIndexOf(edges));
  });
});

describe("nodeIndexOf", () => {
  test("maps id to node, last wins on a duplicate id", () => {
    const first = node("dup"), second = node("dup");
    expect(nodeIndexOf([node("a"), first, second]).get("dup")).toBe(second);
  });

  test("caches by array identity", () => {
    const nodes = [node("a")];
    expect(nodeIndexOf(nodes)).toBe(nodeIndexOf(nodes));
  });
});

describe("childrenMapOf / parentMapOf are the cached accessors", () => {
  test("both delegate to the index", () => {
    const edges = [edge("a", "b"), edge("a", "c"), edge("b", "c")];
    expect(childrenMapOf(edges)).toBe(childrenIndexOf(edges));
    expect(parentMapOf(edges)).toBe(parentIndexOf(edges));
  });
});
describe("getDescendants", () => {
  // The regression this exists for: the old walk re-filtered the edge list for
  // every node it dequeued, so a folder with many descendants cost
  // O(descendants × edges) — 1.7s on an 18k-edge graph, which is what
  // "Hide Children" freezes on. One pass, pinned by counting iterations.
  test("visits each edge once no matter how wide the subtree is", () => {
    const edges: FewerEdge[] = [edge("root", "f0")];
    for (let i = 0; i < 200; i++) {
      edges.push(edge(`f${i}`, `leaf-${i}`));
      edges.push(edge("root", `f${i + 1}`));
    }
    const counted = countingEdges(edges);
    // 201 folders (f0..f200) + 200 leaves.
    expect(getDescendants("root", counted.edges).length).toBe(401);
    expect(counted.steps()).toBeLessThanOrEqual(edges.length);
  });

  for (const { name, edges } of GRAPHS) {
    for (const root of ["a", "b", "c", "root", "p1", "x", "nobody"]) {
      test(`matches the reference walk (${name} from ${root})`, () => {
        expect(getDescendants(root, edges)).toEqual(refDescendants(root, edges));
      });
    }
  }
});

describe("nodeDisplay helpers agree with the scans they replaced", () => {
  const nodes = [
    node("root", "folder"), node("zeta", "file"), node("Alpha", "file"),
    node("sub", "folder"), node("sub-file", "file"),
  ];
  const edges = [
    edge("root", "zeta"), edge("root", "Alpha"), edge("root", "sub"),
    edge("root", "dangling"), edge("sub", "sub-file"), edge("sub", "sub"),
  ];
  const visible = new Set(["root", "zeta", "Alpha", "sub"]);

  test("sortedChildRows: folders first, then A→Z, dangling ids dropped", () => {
    expect(sortedChildRows("root", nodes, edges).map((n) => n.id)).toEqual(["sub", "Alpha", "zeta"]);
  });

  test("sortedChildRows is empty for a leafless or unknown id", () => {
    expect(sortedChildRows("zeta", nodes, edges)).toEqual([]);
    expect(sortedChildRows("nobody", nodes, edges)).toEqual([]);
  });

  test("childCount counts edges (incl. dangling), hiddenChildCount the hidden ones", () => {
    // root has 4 outgoing edges, one of them dangling; of those four ids only
    // `dangling` is outside the visible set.
    const r = nodeChildren("root", true, nodes, edges, visible);
    expect(r.childCount).toBe(4);
    expect(r.hiddenChildCount).toBe(1);
    expect(r.children.map((n) => n.id)).toEqual(["sub", "Alpha", "zeta"]);
  });

  test("a file card has no children at all", () => {
    expect(nodeChildren("zeta", false, nodes, edges, visible)).toEqual({
      children: [], childCount: 0, hiddenChildCount: 0,
    });
  });

  test("folderChildCount counts edges, and only for folders", () => {
    expect(folderChildCount("root", true, edges)).toBe(4);
    expect(folderChildCount("zeta", true, edges)).toBe(0);
    expect(folderChildCount("root", false, edges)).toBe(0);
  });
});

describe("walkSubtreeReveal", () => {
  const edges = [
    edge("root", "a"), edge("a", "b"), edge("b", "c"),
    edge("root", "d"), edge("d", "e"),
  ];

  test("reveals hidden descendants, stopping at a visible card", () => {
    // b is visible, so c stays hidden. The seed is always included (the
    // singular showSubtree seeds the clicked card even when it is visible).
    const toShow = walkSubtreeReveal(edges, new Set(["a", "c", "d", "e"]), new Set(), ["root"]);
    expect([...toShow].sort()).toEqual(["a", "d", "e", "root"]);
  });

  test("stops at a card the user hid directly, with its whole subtree", () => {
    const toShow = walkSubtreeReveal(edges, new Set(["a", "b", "c"]), new Set(["b"]), ["root"]);
    expect([...toShow].sort()).toEqual(["a", "root"]);
  });

  test("seeds the requested roots even when nothing else is hidden", () => {
    expect([...walkSubtreeReveal(edges, new Set(), new Set(), ["b"])]).toEqual(["b"]);
  });

  test("is a single pass over the edge list, whatever the width", () => {
    const wide: FewerEdge[] = [edge("root", "f0")];
    for (let i = 0; i < 300; i++) {
      wide.push(edge(`f${i}`, `leaf-${i}`));
      wide.push(edge("root", `f${i + 1}`));
    }
    const hidden = new Set(wide.map((e) => e.target));
    const counted = countingEdges(wide);
    // 301 seeded folders (root + f0..f300) + 300 leaves revealed.
    expect(walkSubtreeReveal(counted.edges, hidden, new Set(), ["root"]).size).toBe(602);
    expect(counted.steps()).toBeLessThanOrEqual(wide.length);
  });
});
