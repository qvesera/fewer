import { describe, expect, test } from "bun:test";
import { mergeImportedGraph, sortEdges, computeImportedHideSets } from "./importMerge";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode, FewerEdge, FileCategory } from "./types";

const node = (id: string, type: "folder" | "file", selected = false): FewerNode => ({
  id, type, position: { x: 0, y: 0 }, selected, data: { label: id, path: id, type },
});
const edge = (id: string, target: string, zIndex = 0): FewerEdge => ({ id, source: "root", target, zIndex });

describe("import merge", () => {
  test("deselects existing nodes without mutation and preserves imported selection and identity", () => {
    const existing = node("root", "folder", true);
    const imported = node("new", "file", true);
    const nodes = [existing];
    const edges: FewerEdge[] = [];
    const addedEdge = edge("added", "new");
    const result = mergeImportedGraph(nodes, edges, [imported], [addedEdge]);
    expect(existing.selected).toBe(true);
    expect(result.nodes[0].selected).toBe(false);
    expect(result.nodes[0].data).toBe(existing.data);
    expect(result.nodes[1]).toBe(imported);
    expect(result.edges).toEqual([addedEdge]);
    expect(nodes).toEqual([existing]);
    expect(edges).toEqual([]);
  });
  test("retains painter order and stable ties, including missing targets", () => {
    const nodes = [node("folder", "folder"), node("a", "file"), node("z", "file")];
    const edges = [edge("folder", "folder"), edge("raised", "a", 10), edge("normal", "a"), edge("z", "z"), edge("missing", "missing"), edge("tie", "a")];
    expect(sortEdges(edges, nodes).map((e) => e.id)).toEqual(["z", "normal", "tie", "raised", "missing", "folder"]);
    expect(edges[0].id).toBe("folder");
  });
  test("empty merge stays empty", () => {
    expect(mergeImportedGraph([], [], [], [])).toEqual({ nodes: [], edges: [] });
  });
  test("duplicate action keeps selection, graph version and one undoable import", () => {
    const saved = useGraphStore.getState();
    try {
      useGraphStore.setState({ ...useGraphStore.getInitialState(), nodes: [node("root", "folder", true)], edges: [], selectedNodeIds: ["root"] });
      const before = useGraphStore.getState();
      before.duplicateNodeUnderParent("root");
      const after = useGraphStore.getState();
      expect(after.nodes).toHaveLength(2);
      expect(after.selectedNodeIds).toHaveLength(1);
      expect(after.selectedNodeIds[0]).not.toBe("root");
      expect(after.graphVersion).toBe(before.graphVersion + 1);
      after.undo();
      expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(["root"]);
    } finally {
      useGraphStore.setState(saved, true);
    }
    });
});

describe("imported hide sets", () => {
  // A folder with more than `threshold` children → all children auto-hidden.
  const bigFolder = (depth = 1): FewerNode => ({ id: "big", type: "folder", position: { x: 0, y: 0 }, data: { label: "big", path: "big", type: "folder", depth } });
  const child = (id: string, parentId: string): FewerNode => ({ id, type: "file", position: { x: 0, y: 0 }, data: { label: id, path: `${parentId}/${id}`, type: "file", category: "text", depth: 2 } });
  const children = (parentId: string, n: number): FewerNode[] => Array.from({ length: n }, (_, i) => child(`${parentId}-${i}`, parentId));
  const edgesOf = (parentId: string, n: number): FewerEdge[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e-${parentId}-${i}`, source: parentId, target: `${parentId}-${i}`, zIndex: 0 }));

  test("layers file hiding, auto-hide, depth and category with no mutation", () => {
    const nodes: FewerNode[] = [
      bigFolder(),
      ...children("big", 4), // threshold 3 → all 4 hidden by auto-hide
            { id: "deep", type: "file", position: { x: 0, y: 0 }, data: { label: "deep", path: "deep", type: "file", depth: 2, category: "text" } },
    ];
    const edges: FewerEdge[] = [
      ...edgesOf("big", 4),
      { id: "e-deep", source: "root", target: "deep", zIndex: 0 },
    ];
    const baseSnapshot = nodes.map((n) => ({ id: n.id, path: n.data.path }));

    const result = computeImportedHideSets(nodes, edges, ["deep"], true, 3, 6, ["code"] as FileCategory[]);

        // showFiles=true; base hide set = ["deep"]; auto-hide hides big's 4 children;
    // category "code" hides every text file (the 4 children + deep, deep already
    // in the base set); depth=6 hides nothing (max node depth is 2).
    expect(result.idsToHide.sort()).toEqual(["big-0", "big-1", "big-2", "big-3", "deep"].sort());
    expect(result.autoHideIds.sort()).toEqual(["big-0", "big-1", "big-2", "big-3"].sort());
    expect(result.catHiddenIds).toEqual(["big-0", "big-1", "big-2", "big-3", "deep"].sort());
    expect(result.autoHideCount).toBe(4); // all 4 auto-hidden are not in the base set

    // No input mutation.
    expect(nodes.map((n) => ({ id: n.id, path: n.data.path }))).toEqual(baseSnapshot);
    // Edges untouched.
    expect(edges).toHaveLength(5);
  });

  test("showFiles=false hides files on top of the rest", () => {
    const nodes: FewerNode[] = [bigFolder(), child("f1", "big"), child("f2", "big")];
    const edges: FewerEdge[] = [{ id: "e-f1", source: "big", target: "f1", zIndex: 0 }];
    const { idsToHide } = computeImportedHideSets(nodes, edges, [], false, 100, 0, []);
    expect(idsToHide.sort()).toEqual(["f1", "f2"].sort()); // files hidden, big folder visible
  });

    test("maxDepth=0 means unlimited — no depth hides", () => {
    const nodes: FewerNode[] = [
      { id: "root", type: "folder", position: { x: 0, y: 0 }, data: { label: "root", path: "root", type: "folder", depth: 0 } },
      { id: "l99", type: "file", position: { x: 0, y: 0 }, data: { label: "l99", path: "root/l99", type: "file", depth: 99, category: "text" } },
    ];
    const edges: FewerEdge[] = [{ id: "e-l99", source: "root", target: "l99", zIndex: 0 }];
    const { idsToHide, autoHideIds, catHiddenIds } = computeImportedHideSets(nodes, edges, [], true, 100, 0, []);
    expect(idsToHide).toEqual([]);
    expect(autoHideIds).toEqual([]);
    expect(catHiddenIds).toEqual([]);
  });
});

describe("paste integration", () => {
  // Regression: pasteFromClipboard previously mutated the source clipboard's
  // subtreeNodes in place when rewriting paths for the pasted root, leaking the
  // new paths back into the clipboard and corrupting a second paste. It must
  // leave the clipboard untouched and place the duplicate under a new parent.
  test("paste under a folder rewrites paths, selects a new root, and undoes", () => {
    const saved = useGraphStore.getState();
    try {
      const parent: FewerNode = { id: "parent", type: "folder", position: { x: 0, y: 0 }, selected: false, data: { label: "parent", path: "parent", type: "folder" } };
      const child: FewerNode = { id: "child", type: "file", position: { x: 10, y: 10 }, selected: false, data: { label: "child", path: "parent/child", type: "file", category: "text" } };
            const parentEdge: FewerEdge = { id: "e-parent-child", source: "parent", target: "child", type: "default", zIndex: 0 };

      useGraphStore.setState({ ...useGraphStore.getInitialState(), nodes: [parent, child], edges: [parentEdge], advancedModeEnabled: true, showFiles: true });
      const version = useGraphStore.getState().graphVersion;

      // Copy the child subtree, then paste it back into its own parent ("child copy"
      // — a sibling name clash forces the dedup label).
      useGraphStore.getState().setClipboard("copy", ["child"]);
      const clipBefore = JSON.stringify(useGraphStore.getState().clipboard);
      useGraphStore.getState().pasteFromClipboard("parent");

      const state = useGraphStore.getState();
      const copyNode = state.nodes.find((n) => n.data.label === "child copy");
      expect(copyNode).toBeTruthy();
      expect(copyNode!.data.path).toBe("parent/child copy"); // rewritten under parent
      expect(copyNode!.data.isRoot).toBe(false);
      // Original node path untouched.
      expect(state.nodes.find((n) => n.id === "child")?.data.path).toBe("parent/child");
      // Clipboard not mutated by paste.
      expect(JSON.stringify(state.clipboard)).toBe(clipBefore);
      // A new edge links the duplicate to the parent; graph version advanced.
      expect(state.edges.some((e) => e.source === "parent" && e.target === copyNode!.id)).toBe(true);
      expect(state.selectedNodeIds).toEqual([copyNode!.id]);
      expect(state.graphVersion).toBe(version + 1);

      // Undo restores the single-node state.
      useGraphStore.getState().undo();
      const after = useGraphStore.getState();
      expect(after.nodes.map((n) => n.id).sort()).toEqual(["child", "parent"].sort());
      expect(after.nodes.find((n) => n.id === "child")?.data.path).toBe("parent/child");
      expect(after.selectedNodeIds).toEqual([]);
    } finally {
      useGraphStore.setState(saved, true);
    }
  });
});
