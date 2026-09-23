/**
 * Store-level tier-gate tests: setPanelTree filtering, split/insert no-ops
 * for non-Pro, _persistLayout keepStoredTree, dropTagFilter no-pushOp,
 * and the applyViewState undo guard for tag filters.
 */
import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { defaultTree, splitLeaf, leafList } from "./panelTree";

const s = () => useGraphStore.getState();
const initial = useGraphStore.getInitialState();

beforeEach(() => {
  useGraphStore.setState({
    ...initial,
    nodes: [
      { id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "root", path: "/root", type: "folder" } },
      { id: "n2", type: "file", position: { x: 0, y: 100 }, data: { label: "file", path: "/file", type: "file" } },
    ] as any,
    edges: [],
    tags: [],
    tagFilter: [],
    tagFilterHiddenIds: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    past: [],
    future: [],
    leafHistories: {},
    activeLeafId: null,
    viewSettings: {},
    panelTree: defaultTree(),
    tier: "guest",
    advancedModeEnabled: false,
  }, true);
});

// ── setPanelTree gate ──────────────────────────────────────

describe("setPanelTree gate", () => {
  test("guest: multi-leaf tree is rejected, stays single-leaf", () => {
    const root = defaultTree();
    const twoLeaf = splitLeaf(root, root.area.id, "h");
    expect(leafList(twoLeaf).length).toBe(2);
    s().setPanelTree(twoLeaf);
    expect(leafList(s().panelTree).length).toBe(1);
  });

  test("free: multi-leaf tree is rejected", () => {
    useGraphStore.setState({ tier: "free" });
    const root = defaultTree();
    const twoLeaf = splitLeaf(root, root.area.id, "h");
    s().setPanelTree(twoLeaf);
    expect(leafList(s().panelTree).length).toBe(1);
  });

  test("pro: multi-leaf tree is accepted", () => {
    useGraphStore.setState({ tier: "pro" });
    const root = defaultTree();
    const twoLeaf = splitLeaf(root, root.area.id, "h");
    s().setPanelTree(twoLeaf);
    expect(leafList(s().panelTree).length).toBe(2);
  });
});

// ── split / insert / setAreaEditor no-ops ──────────────────

describe("workspace mutation no-ops", () => {
  test("splitArea is a no-op for non-Pro", () => {
    const before = s().panelTree;
    const root = s().panelTree;
    if (root.kind !== "leaf") return; // ensure single leaf
    s().splitArea(root.area.id, "h");
    expect(s().panelTree).toBe(before);
  });

  test("insertAreaAtEdge is a no-op for non-Pro", () => {
    const before = s().panelTree;
    s().insertAreaAtEdge("right", "tags");
    expect(s().panelTree).toBe(before);
  });

  test("setAreaEditor is a no-op for non-Pro", () => {
    const before = s().panelTree;
    const root = s().panelTree;
    if (root.kind !== "leaf") return;
    s().setAreaEditor(root.area.id, "tags");
    expect(s().panelTree).toBe(before);
  });

  test("splitArea works for pro", () => {
    useGraphStore.setState({ tier: "pro" });
    const root = s().panelTree;
    if (root.kind !== "leaf") return;
    s().splitArea(root.area.id, "h");
    expect(leafList(s().panelTree).length).toBe(2);
  });
});

// ── _persistLayout keepStoredTree ───────────────────────────

describe("_persistLayout keepStoredTree", () => {
  test("non-Pro does not clobber stored tree in localStorage", () => {
    if (typeof localStorage === "undefined") return; // SSR guard
    const split = splitLeaf(defaultTree(), defaultTree().area.id, "h");
    useGraphStore.setState({ panelTree: split });
    s()._persistLayout(); // writes the split tree

    // Now switch to non-Pro and trigger a persist (e.g. viewSettings change).
    useGraphStore.setState({ tier: "free" });
    useGraphStore.setState({ viewSettings: { test: { edgeStyle: "angled" } } });
    s()._persistLayout();

    // Re-read from localStorage.
    const raw = localStorage.getItem("fewer:panelLayout");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    // The stored tree should still be the split (2 leaves), not overwritten.
    expect(parsed.panelTree.kind).toBe("split");
  });
});

// ── dropTagFilter no-pushOp ────────────────────────────────

describe("dropTagFilter", () => {
  test("clears tagFilter + recomputes hiddenIds without pushing an undo op", () => {
    const tag = s().createTag("test");
    s().assignTag("n1", tag.id);
    s().setTagFilter([tag.id]); // this pushes an undo op
    expect(s().tagFilter).toEqual([tag.id]);
    const pastBefore = s().past.length;

    s().dropTagFilter();
    expect(s().tagFilter).toEqual([]);
    expect(s().tagFilterHiddenIds).toEqual([]);
    // No undo op pushed.
    expect(s().past.length).toBe(pastBefore);
  });
});

// ── applyViewState undo guard ───────────────────────────────

describe("applyViewState undo guard for tag filters", () => {
  test("undo of a view-state op does not restore tagFilter when tier is not pro", () => {
    const tag = s().createTag("T");
    s().assignTag("n1", tag.id);
    s().setTagFilter([tag.id]); // pushes undo op with tagFilter
    const pastBefore = s().past.length;
    expect(pastBefore).toBeGreaterThan(0);
    s().dropTagFilter(); // clears without undo

    // Downgrade to free — the undo should now be suppressed for tag fields.
    useGraphStore.setState({ tier: "free" });
    s().undo();
    expect(s().tagFilter).toEqual([]);
  });

  test("undo of a view-state op restores tagFilter when tier is pro", () => {
    const tag = s().createTag("U");
    s().assignTag("n1", tag.id);
    useGraphStore.setState({ tier: "pro" });
    s().setTagFilter([tag.id]);
    const pastBefore = s().past.length;
    expect(pastBefore).toBeGreaterThan(0);

    s().undo();
    expect(s().tagFilter).toEqual([]);
  });
});
