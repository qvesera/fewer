import { test, describe, expect } from "bun:test";
import {
  getHiddenLayerGroups,
  filterHiddenGroups,
  ancestorChain,
  buildRingIds,
  hiddenChildrenOf,
  indexHiddenTreeChildren,
  type HiddenTreeNode,
} from "./hiddenGroups";
import type { FewerNode, FewerEdge } from "./types";

function makeNode(id: string, label: string, parentId?: string | null, opts: Partial<FewerNode["data"]> = {}): FewerNode {
  return {
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label, path: parentId ? `/${label}` : `/${label}`, type: "folder", parentId: parentId ?? null, ...opts },
    style: { width: 200, height: 120 },
  } as FewerNode;
}

function makeFile(id: string, label: string, parentId: string): FewerNode {
  return {
    id,
    type: "file",
    position: { x: 0, y: 0 },
    data: { label, path: `/${parentId}/${label}`, type: "file", parentId, category: "text" },
    style: { width: 140, height: 50 },
  } as FewerNode;
}

function makeEdge(id: string, source: string, target: string): FewerEdge {
  return { id, source, target, type: "smoothstep" } as FewerEdge;
}

describe("getHiddenLayerGroups", () => {
  test("groups individually hidden files under their visible parent folder", () => {
    // root -> [docs, src]; docs -> a.md, b.md ; src -> c.ts
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("docs", "docs", "root"),
      makeNode("src", "src", "root"),
      makeFile("a", "a.md", "docs"),
      makeFile("b", "b.md", "docs"),
      makeFile("c", "c.ts", "src"),
    ];
    const edges: FewerEdge[] = [
      makeEdge("e1", "root", "docs"),
      makeEdge("e2", "root", "src"),
      makeEdge("e3", "docs", "a"),
      makeEdge("e4", "docs", "b"),
      makeEdge("e5", "src", "c"),
    ];
    // Only the three files are hidden, not their folders.
    const groups = getHiddenLayerGroups(nodes, edges, ["a", "b", "c"]);

    expect(groups).toHaveLength(2);
    // A→Z by folder label: "docs" then "src"
    expect(groups[0].parentNode!.data.label).toBe("docs");
    expect(groups[0].hiddenCount).toBe(2);
    expect(groups[0].roots.map((r) => r.node.id).sort()).toEqual(["a", "b"]);
    expect(groups[1].parentNode!.data.label).toBe("src");
    expect(groups[1].hiddenCount).toBe(1);
    expect(groups[1].roots[0].node.id).toBe("c");
    // The parent folder is visible, so roots are not nested folders.
    expect(groups[0].roots[0].children).toHaveLength(0);
  });

  test("keeps an entirely-hidden subtree nested under its hidden folder root", () => {
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("outer", "outer", "root"),
      makeFile("f1", "f1.txt", "outer"),
    ];
    const edges: FewerEdge[] = [
      makeEdge("e1", "root", "outer"),
      makeEdge("e2", "outer", "f1"),
    ];
    // Hidden subtree: outer + f1.
    const groups = getHiddenLayerGroups(nodes, edges, ["outer", "f1"]);

    expect(groups).toHaveLength(1);
    // Cases where the hidden root's own parent is hidden → parent is a hidden one,
    // so nearest visible is "root". The hidden folder stays a root with nested child.
    expect(groups[0].parentNode!.data.label).toBe("root");
    expect(groups[0].hiddenCount).toBe(2);
    const outer = groups[0].roots[0];
    expect(outer.node.id).toBe("outer");
    expect(outer.children.map((c) => c.node.id)).toEqual(["f1"]);
  });

  test("stale hidden ids (deleted nodes) are ignored without throwing", () => {
    const nodes: FewerNode[] = [makeNode("root", "root", null, { isRoot: true })];
    const edges: FewerEdge[] = [];
    const groups = getHiddenLayerGroups(nodes, edges, ["ghost"]);
    expect(groups).toEqual([]);
  });
});

describe("filterHiddenGroups", () => {
  test("folder label match keeps the whole group", () => {
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("docs", "docs", "root"),
      makeFile("a", "a.md", "docs"),
      makeFile("zebra", "zebra.txt", "docs"),
    ];
    const edges: FewerEdge[] = [makeEdge("e1", "root", "docs"), makeEdge("e2", "docs", "a"), makeEdge("e3", "docs", "zebra")];
    const groups = getHiddenLayerGroups(nodes, edges, ["a", "zebra"]);
    const filtered = filterHiddenGroups(groups, "docs");
    expect(filtered).toHaveLength(1);
    // Whole group retained.
    expect(filtered[0].roots).toHaveLength(2);
  });

  test("root label match keeps only that root", () => {
    const nodes: FewerNode[] = [
      makeNode("root", "root", null, { isRoot: true }),
      makeNode("docs", "docs", "root"),
      makeFile("a", "alpha.md", "docs"),
      makeFile("b", "beta.md", "docs"),
    ];
    const edges: FewerEdge[] = [makeEdge("e1", "root", "docs"), makeEdge("e2", "docs", "a"), makeEdge("e3", "docs", "b")];
    const groups = getHiddenLayerGroups(nodes, edges, ["a", "b"]);
    const filtered = filterHiddenGroups(groups, "alpha");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].roots.map((r) => r.node.id)).toEqual(["a"]);
  });
});

describe("getHiddenLayerGroups — roots vs all", () => {
  // root -> docs -> [sub -> [deep], a.md, b.md] ; root -> src -> c.ts
  const nodes: FewerNode[] = [
    makeNode("root", "root", null, { isRoot: true }),
    makeNode("docs", "docs", "root"),
    makeNode("sub", "sub", "docs"),
    makeFile("deep", "deep.md", "sub"),
    makeFile("a", "a.md", "docs"),
    makeFile("b", "b.md", "docs"),
    makeNode("src", "src", "root"),
    makeFile("c", "c.ts", "src"),
  ];
  const edges: FewerEdge[] = [
    makeEdge("e1", "root", "docs"),
    makeEdge("e2", "docs", "sub"),
    makeEdge("e3", "sub", "deep"),
    makeEdge("e4", "docs", "a"),
    makeEdge("e5", "docs", "b"),
    makeEdge("e6", "root", "src"),
    makeEdge("e7", "src", "c"),
  ];
  // Everything under docs is hidden, plus c.ts.
  const hidden = ["sub", "deep", "a", "b", "c"];

  const ids = (list: HiddenTreeNode[]): string[] => list.map((t) => t.node.id);
  const flatten = (list: HiddenTreeNode[]): string[] =>
    list.flatMap((t) => [t.node.id, ...flatten(t.children)]);

  test("groups, counts and roots are identical in both modes", () => {
    const rootsMode = getHiddenLayerGroups(nodes, edges, hidden, "roots");
    const allMode = getHiddenLayerGroups(nodes, edges, hidden, "all");
    expect(rootsMode.map((g) => g.parentNode?.id)).toEqual(allMode.map((g) => g.parentNode?.id));
    expect(rootsMode.map((g) => g.hiddenCount)).toEqual(allMode.map((g) => g.hiddenCount));
    expect(rootsMode.map((g) => ids(g.roots))).toEqual(allMode.map((g) => ids(g.roots)));
    // docs holds sub -> deep, a, b = 4; src holds c = 1.
    expect(rootsMode.map((g) => g.hiddenCount)).toEqual([4, 1]);
    expect(ids(rootsMode[0].roots)).toEqual(["sub", "a", "b"]);
  });

  test("roots mode materialises only the top level", () => {
    const groups = getHiddenLayerGroups(nodes, edges, hidden, "roots");
    expect(groups[0].roots.every((r) => r.children.length === 0)).toBe(true);
    expect(flatten(groups[0].roots)).not.toContain("deep");
  });

  test("all mode still nests the whole subtree (the search path)", () => {
    const groups = getHiddenLayerGroups(nodes, edges, hidden, "all");
    expect(flatten(groups[0].roots)).toContain("deep");
  });

  test("hiddenChildrenOf walks one level at a time, like the panel's rows", () => {
    const hiddenSet = new Set(hidden);
    const kids = hiddenChildrenOf("sub", nodes, edges, hiddenSet);
    expect(ids(kids)).toEqual(["deep"]);
    expect(kids[0].children).toEqual([]);
    // …and repeating it reaches the next level (rows expand independently).
    expect(ids(hiddenChildrenOf("docs", nodes, edges, hiddenSet))).toEqual(["sub", "a", "b"]);
    // A visible node has no hidden children of its own.
    expect(hiddenChildrenOf("root", nodes, edges, hiddenSet)).toEqual([]);
  });

  test("lazy expansion of the whole tree matches the built one", () => {
    const groups = getHiddenLayerGroups(nodes, edges, hidden, "all");
    const built = groups.map((g) => flatten(g.roots));
    const hiddenSet = new Set(hidden);
    // Walk from the roots, expanding each level the way a user clicking through
    // would, and compare with the pre-built tree.
    const walked: string[][] = [];
    const visit = (list: HiddenTreeNode[]) => {
      for (const t of list) {
        const kids = hiddenChildrenOf(t.node.id, nodes, edges, hiddenSet);
        if (kids.length === 0) continue;
        walked.push(ids(kids));
        visit(kids);
      }
    };
    visit(getHiddenLayerGroups(nodes, edges, hidden, "roots")[0].roots);
    expect(walked).toEqual([["deep"]]);
    expect(built[0]).toEqual(expect.arrayContaining(["sub", "deep", "a", "b"]));
  });

  test("indexHiddenTreeChildren indexes a built tree by its own node ids", () => {
    const groups = getHiddenLayerGroups(nodes, edges, hidden, "all");
    const byParent = indexHiddenTreeChildren(groups);
    // "sub" is a row, so it has children; "docs" is the group's visible context
    // folder — it has no row and therefore no entry.
    expect(ids(byParent.get("sub")!)).toEqual(["deep"]);
    expect(byParent.has("docs")).toBe(false);
    expect(byParent.has("deep")).toBe(false);
  });

  test("a cycle of hidden nodes yields no group, as before", () => {
    // parentMapOf is last-edge-wins, so here a's parent is b: every hidden id's
    // parent is hidden, no branch starts, and there is nothing revealable. The
    // recursive builder returned [] for the same input; a roots-less group would
    // render an empty header.
    const cycNodes = [makeNode("root", "root", null, { isRoot: true }), makeNode("a", "a", "root"), makeFile("b", "b.md", "a")];
    const cycEdges = [makeEdge("c1", "root", "a"), makeEdge("c2", "a", "b"), makeEdge("c3", "b", "a")];
    expect(getHiddenLayerGroups(cycNodes, cycEdges, ["a", "b"], "roots")).toEqual([]);
    expect(getHiddenLayerGroups(cycNodes, cycEdges, ["a", "b"], "all")).toEqual([]);
  });
});

describe("ancestorChain", () => {
  test("walks parent links to the root", () => {
    const edges: FewerEdge[] = [
      makeEdge("e1", "root", "outer"),
      makeEdge("e2", "outer", "inner"),
    ];
    expect(ancestorChain("inner", edges)).toEqual(["outer", "root"]);
    expect(ancestorChain("outer", edges)).toEqual(["root"]);
    expect(ancestorChain("root", edges)).toEqual([]);
  });
});

describe("buildRingIds", () => {
  const edges: FewerEdge[] = [
    makeEdge("e1", "root", "docs"),
    makeEdge("e2", "docs", "a"),
  ];

  test("rings the node plus its full ancestor chain", () => {
    expect(buildRingIds("a", edges)).toEqual(["a", "docs", "root"]);
    expect(buildRingIds("docs", edges)).toEqual(["docs", "root"]);
    expect(buildRingIds("root", edges)).toEqual(["root"]);
  });

  test("null/undefined node id rings nothing (standalone group header)", () => {
    expect(buildRingIds(null, edges)).toEqual([]);
    expect(buildRingIds(undefined, edges)).toEqual([]);
  });

  test("group hover rings the context folder, its ancestors and the group's hidden roots", () => {
    // Hidden folder subtree: outer -> [f1, f2 -> deep]
    const nodes: FewerNode[] = [
      makeNode("outer", "outer", "root"),
      makeFile("f1", "f1.txt", "outer"),
      makeFile("f2", "f2.txt", "outer"),
    ];
    const tree = {
      node: nodes[0],
      children: [
        { node: nodes[1], children: [] },
        { node: nodes[2], children: [{ node: makeFile("deep", "deep.md", "f2"), children: [] }] },
      ],
    };
    const ids = buildRingIds("docs", edges, [tree]);
    expect(ids).toEqual(["docs", "root", "outer"]);
    // "deep" is NOT in the ring, and that is the point: its parent ("f2") is
    // hidden, so no visible folder card renders a row for it — the descent this
    // replaced pushed thousands of ids through the store to colour nothing.
    expect(ids).not.toContain("deep");
    expect(ids).not.toContain("f1");
  });

  test("ring size is bounded by depth, not by subtree size", () => {
    // One hidden root with 1,003 hidden descendants: the descent this replaced
    // emitted all of them; the ring is the context folder plus the single root.
    const root = {
      node: makeNode("big", "big", "docs"),
      children: Array.from({ length: 1000 }, (_, i) => ({
        node: makeFile(`d${i}`, `d${i}.txt`, "big"),
        children: [] as HiddenTreeNode[],
      })),
    };
    const ids = buildRingIds("docs", edges, [root]);
    expect(ids).toEqual(["docs", "root", "big"]);
  });

  test("no subtree roots → just node + ancestors", () => {
    expect(buildRingIds("a", edges, [])).toEqual(["a", "docs", "root"]);
  });
});
