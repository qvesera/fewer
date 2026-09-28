import { test, expect, describe } from "bun:test";
import {
  pluralizeCount,
  countDescendants,
  computeAltKey,
  buildKeyContext,
  buildKeyboardRules,
  handleKeyboardShortcut,
  readShortcutStateFields,
  shiftHOutcome,
  toStoreReader,
  type ShortcutCtx,
  type StoreReader,
} from "./keyboardShortcuts";
import type { FewerEdge } from "./types";
import { isAnyDialogOpen, useGraphStore } from "@/store/graphStore";

// Mock KeyboardEvent — bun test env lacks it.
class MockKeyboardEvent {
  key: string; code: string;
  ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean;
  target: EventTarget | null; defaultPrevented = false;
  constructor(_type: string, init: Record<string, any> = {}) {
    this.key = init.key ?? ""; this.code = init.code ?? init.key ?? "";
    this.ctrlKey = init.ctrlKey ?? false; this.metaKey = init.metaKey ?? false;
    this.altKey = init.altKey ?? false; this.shiftKey = init.shiftKey ?? false;
    this.target = init.target ?? null;
  }
  preventDefault() { this.defaultPrevented = true; }
}

// ─── pluralizeCount ───────────────────────────────────────────────
test("pluralizeCount singular", () => expect(pluralizeCount(1, "item")).toBe("1 item"));
test("pluralizeCount plural", () => expect(pluralizeCount(3, "item")).toBe("3 items"));
test("pluralizeCount custom plural", () => expect(pluralizeCount(2, "child", "children")).toBe("2 children"));

// ─── countDescendants ─────────────────────────────────────────────
test("countDescendants returns 0 for no edges", () => expect(countDescendants(["a"], [])).toBe(0));
test("countDescendants counts direct children", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
  ] as FewerEdge[];
  expect(countDescendants(["a"], edges)).toBe(2);
});
test("countDescendants counts recursive", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
    { id: "e3", source: "c", target: "d" },
  ] as FewerEdge[];
  expect(countDescendants(["a"], edges)).toBe(3);
});
test("countDescendants deduplicates", () => {
  const edges: FewerEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
    { id: "e3", source: "b", target: "d" },
    { id: "e4", source: "c", target: "d" },
  ] as FewerEdge[];
  expect(countDescendants(["a"], edges)).toBe(3);
});

// ─── computeAltKey ────────────────────────────────────────────────
test("computeAltKey returns null when alt not pressed", () => {
  expect(computeAltKey(new MockKeyboardEvent("keydown", { altKey: false, key: "n" }) as any, false)).toBeNull();
});
test("computeAltKey non-Mac uses e.key", () => {
  expect(computeAltKey(new MockKeyboardEvent("keydown", { altKey: true, key: "n" }) as any, false)).toBe("n");
});
test("computeAltKey Mac uses e.code", () => {
  expect(computeAltKey(new MockKeyboardEvent("keydown", { altKey: true, key: "œ", code: "KeyN" }) as any, true)).toBe("n");
});
test("computeAltKey Mac non-Key code falls back to e.key", () => {
  expect(computeAltKey(new MockKeyboardEvent("keydown", { altKey: true, key: "∆", code: "DigitJ" }) as any, true)).toBe("∆");
});

// ─── buildKeyContext ──────────────────────────────────────────────
test("buildKeyContext mod from ctrlKey", () => {
  expect(buildKeyContext(new MockKeyboardEvent("keydown", { ctrlKey: true, key: "z" }) as any).mod).toBe(true);
});
test("buildKeyContext mod from metaKey", () => {
  expect(buildKeyContext(new MockKeyboardEvent("keydown", { metaKey: true, key: "z" }) as any).mod).toBe(true);
});

// ─── toStoreReader ────────────────────────────────────────────────
test("toStoreReader extracts fields", () => {
  const r = toStoreReader({
    direction: "LR", selectedNodeIds: ["n1"], nodes: [{ id: "n1" }],
    edges: [], dataSource: "dir", clipboard: null, focusedNodeId: null,
    hiddenIds: [], mousePosition: { x: 1, y: 2 }, localRootPath: null,
    activeLeafId: "leaf1",
    // A real ViewSettings: the per-view hide layers the H rules read.
    viewSettings: { leaf1: { hideLayers: { individual: ["n1"], subtrees: {}, filesBulkActive: true, filesBulkExempt: [] } } },
  });
  expect(r.direction).toBe("LR"); expect(r.selectedNodeIds).toEqual(["n1"]);
  expect(r.activeLeafId).toBe("leaf1");
  expect(r.viewSettings.leaf1?.hideLayers?.individual).toEqual(["n1"]);
  expect(r.viewSettings.leaf1?.hideLayers?.filesBulkActive).toBe(true);
});
test("toStoreReader defaults for missing fields", () => {
  const r = toStoreReader({});
  expect(r.nodes).toEqual([]); expect(r.hiddenIds).toEqual([]);
  expect(r.clipboard).toBeNull(); expect(r.localRootPath).toBeNull();
  expect(r.activeLeafId).toBeNull(); expect(r.viewSettings).toEqual({});
});

// The crash this guards: the H rules read RAW store state in production
// (KeyboardShortcuts passes `getState: () => getStore()`), but the Shift+H
// branch read `st.showFilesByLeaf` — a field only this test adapter invented
// (`toStoreReader` aliased viewSettings to it), so the whole suite passed while
// the app threw "Cannot read properties of undefined" on every Shift+H after
// any canvas selection (which is what sets activeLeafId).
test("every field the rules read exists on the RAW store state", () => {
  const raw = useGraphStore.getInitialState() as unknown as Record<string, unknown>;
  expect(readShortcutStateFields().filter((f) => !(f in raw))).toEqual([]);
});

test("toStoreReader projects only fields the store actually has", () => {
  // A rename on either side of the adapter must not leave the reader reading a
  // name the store does not have — that is what let this ship.
  const raw = useGraphStore.getInitialState() as unknown as Record<string, unknown>;
  expect(Object.keys(toStoreReader(raw)).filter((k) => !(k in raw))).toEqual([]);
});

test("Shift+H against the RAW store state reveals the active leaf's cards", () => {
  // The production shape: ctx.getState() IS the store, not a reader projection.
  const file = (id: string) =>
    ({ id, position: { x: 0, y: 0 }, data: { label: id, path: `/${id}`, type: "file" } } as any);
  useGraphStore.setState({
    nodes: [file("f1"), file("f2"), file("f3")],
    hiddenIds: ["f2"],
    activeLeafId: "leaf1",
    viewSettings: {
      leaf1: { hideLayers: { individual: ["f1"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] } },
    },
  } as any);
  try {
    const { ctx, a } = makeCtx({ getState: () => withActions(useGraphStore.getState() as any, a) as any });
    // Would throw "Cannot read properties of undefined" before the fix.
    expect(() => fire(buildKeyboardRules(), ctx, { key: "h", shiftKey: true })).not.toThrow();
    expect(a.revealAllForLeaf).toBe("leaf1");
    expect(a.showAll).toBe(true);
    expect(a.setShowFiles).toBe(true);
    // 1 hidden globally + 1 hidden by the leaf's layer.
    expect(a.toast?.description).toBe("2 cards restored");
  } finally {
    useGraphStore.setState(useGraphStore.getInitialState(), true);
  }
});

describe("shiftHOutcome", () => {
  const folder = (id: string, depth = 1) =>
    ({ id, data: { label: id, type: "folder", depth } }) as any;
  const file = (id: string, depth = 2) =>
    ({ id, data: { label: id, type: "file", depth } }) as any;
  /** root -> target, the shape the helpers need. */
  const edge = (target: string) => ({ id: `e-${target}`, source: "root", target, type: "default" }) as any;
  const base = {
    nodes: [] as any[],
    edges: [] as any[],
    activeLeafId: null as string | null,
    viewSettings: {} as Record<string, any>,
    autoHideThreshold: 10,
    maxDisplayDepth: 0,
    revealedRootIds: [] as string[],
  };

  test("nothing hidden → nothing restored, nothing still hidden", () => {
    expect(shiftHOutcome({ ...base, hiddenIds: [] })).toEqual({ restored: 0, stillHidden: 0 });
  });

  test("manual hides are restored in full", () => {
    const nodes = [folder("root"), file("a"), file("b")];
    const edges = [edge("a"), edge("b")];
    expect(shiftHOutcome({ ...base, nodes, edges, hiddenIds: ["a", "b"] }))
      .toEqual({ restored: 2, stillHidden: 0 });
  });

  test("cards beyond the display-depth limit count as still hidden", () => {
    const nodes = [folder("root", 0), folder("mid", 3), file("deep", 9)];
    const edges = [edge("mid"), edge("deep")];
    expect(shiftHOutcome({ ...base, nodes, edges, hiddenIds: ["deep"], maxDisplayDepth: 6 }))
      .toEqual({ restored: 0, stillHidden: 1 });
  });

  test("a revealed-root exemption survives when the global set is already empty", () => {
    // showAll (which empties revealedRootIds) only runs when something is hidden
    // globally, so with an empty global set the exemptions still hold.
    const kids = Array.from({ length: 12 }, (_, i) => file(`n${i}`));
    const nodes = [folder("root"), folder("big"), ...kids];
    const edges = [edge("big"), ...kids.map((k) => edge(k.id))];
    expect(shiftHOutcome({ ...base, nodes, edges, hiddenIds: [], revealedRootIds: ["n0"] }))
      // The auto-hide would cover all 12; n0 is exempt, but nothing was hidden to
      // restore, so both numbers stay at zero.
      .toEqual({ restored: 0, stillHidden: 0 });
  });
});

// The second half of the Shift+H story: the press ends with setShowFiles(true),
// which re-applies the large-folder auto-hide, so those cards are hidden again
// in the same keypress. The toast used to count them as restored.
describe("Shift+H with the auto-hide filter on", () => {
  /** root -> big -> [12 files]  (big exceeds the threshold of 10) */
  const folder = (id: string, label = id) =>
    ({ id, position: { x: 0, y: 0 }, data: { label, path: `/${label}`, type: "folder", depth: 1 } } as any);
  const file = (id: string) =>
    ({ id, position: { x: 0, y: 0 }, data: { label: id, path: `/${id}`, type: "file", depth: 2 } } as any);
  const kids = Array.from({ length: 12 }, (_, i) => file(`big-n${i}`));
  const graph = {
    nodes: [folder("root", "root"), folder("big"), ...kids],
    edges: [
      { id: "e1", source: "root", target: "big" } as any,
      ...kids.map((k, i) => ({ id: `e2-${i}`, source: "big", target: k.id } as any)),
    ],
  };
  const withFilterOn = (extra: Record<string, unknown>) => {
    useGraphStore.setState({
      ...graph,
      autoHideThreshold: 10,
      autoHiddenIds: kids.map((k) => k.id),
      revealedRootIds: [],
      activeLeafId: null,
      viewSettings: {},
      ...extra,
    } as any);
  };
  const run = () => {
    const { ctx, a } = makeCtx({ getState: () => withActions(useGraphStore.getState() as any, a) as any });
    fire(buildKeyboardRules(), ctx, { key: "h", shiftKey: true });
    return a;
  };

  test("cards the filter re-hides are not reported as restored", () => {
    withFilterOn({ hiddenIds: kids.map((k) => k.id) }); // all 12 hidden, by the filter
    try {
      const a = run();
      // The action still runs (showAll + setShowFiles), but nothing is claimed.
      expect(a.showAll).toBe(true);
      expect(a.setShowFiles).toBe(true);
      expect(a.toast?.title).toBe("Nothing to unhide");
      expect(a.toast?.description).toBe("12 cards stayed hidden — the auto-hide filter still applies");
    } finally {
      useGraphStore.setState(useGraphStore.getInitialState(), true);
    }
  });
  test("a manual hide next to filter-hidden cards is reported truthfully", () => {
    const manual = file("manual");
    withFilterOn({
      nodes: [...graph.nodes, manual],
      edges: [...graph.edges, { id: "e3", source: "root", target: "manual" } as any],
      // 12 by the filter + 1 by hand.
      hiddenIds: [...kids.map((k) => k.id), "manual"],
    });
    try {
      const a = run();
      expect(a.toast?.description).toBe("1 card restored · 12 cards kept hidden by the auto-hide filter");
    } finally {
      useGraphStore.setState(useGraphStore.getInitialState(), true);
    }
  });

  test("a card hidden globally AND by the leaf layer is counted once", () => {
    useGraphStore.setState({
      nodes: [folder("root", "root"), file("f1")],
      edges: [{ id: "e1", source: "root", target: "f1" } as any],
      autoHideThreshold: 10,
      revealedRootIds: [],
      hiddenIds: ["f1"],
      activeLeafId: "leaf1",
      viewSettings: { leaf1: { hideLayers: { individual: ["f1"], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] } } },
    } as any);
    try {
      const a = run();
      expect(a.revealAllForLeaf).toBe("leaf1");
      // Union of the two sets → 1, not the old sum of 2.
      expect(a.toast?.description).toBe("1 card restored");
    } finally {
      useGraphStore.setState(useGraphStore.getInitialState(), true);
    }
  });

  test("bulk-hidden files are counted minus the eye-revealed ones", () => {
    const files = ["f1", "f2", "f3", "f4"].map(file);
    useGraphStore.setState({
      nodes: [folder("root", "root"), ...files],
      edges: files.map((f, i) => ({ id: `e${i}`, source: "root", target: f.id } as any)),
      autoHideThreshold: 10,
      revealedRootIds: [],
      hiddenIds: [],
      activeLeafId: "leaf1",
      viewSettings: { leaf1: { hideLayers: { individual: [], subtrees: {}, filesBulkActive: true, filesBulkExempt: ["f4"] } } },
    } as any);
    try {
      const a = run();
      expect(a.toast?.description).toBe("3 cards restored");
    } finally {
      useGraphStore.setState(useGraphStore.getInitialState(), true);
    }
  });
});
// ─── Test harness ─────────────────────────────────────────────────

/** Store reader plus the store actions a shortcut calls directly (organize). */
function withActions(reader: StoreReader, a: Record<string, any>): StoreReader & { organize(leafId?: string | null): void } {
  return {
    ...reader,
    organize: (leafId) => { a.organize = leafId ?? null; a.organizeCalls = (a.organizeCalls ?? 0) + 1; },
  };
}

function makeCtx(overrides?: Partial<ShortcutCtx>): { ctx: ShortcutCtx; a: Record<string, any> } {
  const a: Record<string, any> = {};
  const ctx: ShortcutCtx = {
    getState: () => withActions(toStoreReader({}), a),
    undo: () => { a.undo = true; }, redo: () => { a.redo = true; },
    setSearchOpen: (v) => { a.setSearchOpen = v; },
    setDirection: (d) => { a.setDirection = d; },
    setSelectedNodeIds: (ids) => { a.setSelectedNodeIds = ids; },
    deleteNodes: (ids) => { a.deleteNodes = ids; },
    setRenamingId: (id, src) => { a.setRenamingId = [id, src]; },
    setClipboard: (m, ids) => { a.setClipboard = [m, ids]; },
    clearClipboard: () => { a.clearClipboard = true; },
    setFocusedNodeId: (id) => { a.setFocusedNodeId = id; },
    hideNodes: (ids) => { a.hideNodes = ids; },
    hideNodesForLeaf: (leafId, ids) => { a.hideNodesForLeaf = [leafId, ids]; },
    showAll: () => { a.showAll = true; },
    setShowFiles: (v) => { a.setShowFiles = v; },
    revealAllForLeaf: (leafId) => { a.revealAllForLeaf = leafId; },
    setExportOpen: (v) => { a.setExportOpen = v; },
    setShortcutsOpen: (v) => { a.setShortcutsOpen = v; },
    reset: () => { a.reset = true; },
    pasteFromClipboard: (id) => { a.pasteFromClipboard = id; },
    moveNode: (id) => { a.moveNode = id; },
    connectNodes: () => ({ ok: true }),
    removeEdgesFromHandle: (id, t) => { a.removeEdgesFromHandle = [id, t]; },
    unparentNodes: (ids) => { a.unparentNodes = ids; return ids.length; },
    deleteEdges: (ids) => { a.deleteEdges = ids; },
    duplicateNodeUnderParent: (id) => { a.duplicateNodeUnderParent = id; },
    setAuthOpen: (v) => { a.setAuthOpen = v; },
    isAnyDialogOpen: (s: any) => { a.isAnyDialogOpen = s; return false; },
    organize: (leafId) => { a.organize = leafId ?? null; a.organizeCalls = (a.organizeCalls ?? 0) + 1; },
    reactFlow: {
      setNodes: (fn: any) => { a.setNodes = fn; },
      fitView: (opts) => { a.fitView = opts; },
      setCenter: (x, y, o) => { a.setCenter = [x, y, o]; },
      getZoom: () => 1, zoomIn: (o) => { a.zoomIn = o; },
      zoomOut: (o) => { a.zoomOut = o; },
      setViewport: (v, o) => { a.setViewport = [v, o]; },
      getEdges: () => [],
    },
    toast: (o) => { a.toast = o; },
    localFs: { openInOs: false, openFileInOs: false, dragDropImport: false, dropToExpand: false, fsaDirectoryPicker: false },
    openNodeFile: async () => true, openFolderInExplorer: async () => true,
    ...overrides,
  };
  return { ctx, a };
}

function fire(rules: ReturnType<typeof buildKeyboardRules>, ctx: ShortcutCtx, init: Record<string, any>): boolean {
  const e = new MockKeyboardEvent("keydown", init) as any;
  return handleKeyboardShortcut(e, rules, ctx);
}
// ── Integration tests ─────────────────────────────────────────────
test("Ctrl+Z triggers undo", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "z" })).toBe(true);
  expect(a.undo).toBe(true);
});
test("Ctrl+Shift+Z triggers redo", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, shiftKey: true, key: "z" })).toBe(true);
  expect(a.redo).toBe(true);
});
test("Ctrl+Y triggers redo", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "y" })).toBe(true);
  expect(a.redo).toBe(true);
});
test("Ctrl+F opens search", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "f" })).toBe(true);
  expect(a.setSearchOpen).toBe(true);
});
test("H hides selected nodes", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["n1"], edges: [] }) });
  expect(fire(buildKeyboardRules(), ctx, { key: "h" })).toBe(true);
  expect(a.hideNodes).toEqual(["n1"]);
});
test("Shift+H shows all", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ hiddenIds: ["n1"] }) });
  expect(fire(buildKeyboardRules(), ctx, { key: "h", shiftKey: true })).toBe(true);
  expect(a.showAll).toBe(true);
});
test("Escape clears selection", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { key: "Escape" })).toBe(true);
  expect(a.setSelectedNodeIds).toEqual([]);
  expect(a.setFocusedNodeId).toBeNull();
});
test("Space fits view", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { code: "Space", key: " " })).toBe(true);
  expect(a.fitView).toBeDefined();
});
test("Ctrl+C copies selected", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["n1", "n2"] }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "c" })).toBe(true);
  expect(a.setClipboard).toEqual(["copy", ["n1", "n2"]]);
});
test("Ctrl+X cuts selected", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["n1"] }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "x" })).toBe(true);
  expect(a.setClipboard).toEqual(["cut", ["n1"]]);
  expect(a.moveNode).toBe("n1");
});
test("Alt+S with no user opens auth", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ tier: "guest" }) });
  expect(fire(buildKeyboardRules(), ctx, { altKey: true, key: "s" })).toBe(true);
  expect(a.setAuthOpen).toBe(true);
});
test("F2 triggers rename", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["n1"] }) });
  expect(fire(buildKeyboardRules(), ctx, { key: "F2" })).toBe(true);
  expect(a.setRenamingId).toEqual(["n1", "canvas"]);
});
test("Ctrl+D duplicates", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["n1", "n2"] }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "d" })).toBe(true);
  expect(a.duplicateNodeUnderParent).toBe("n2");
});
test("unhandled returns false", () => {
  expect(fire(buildKeyboardRules(), makeCtx().ctx, { key: "F13" })).toBe(false);
});
test("Ctrl+A selects all", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ nodes: [{ id: "n1" }, { id: "n2" }] }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "a" })).toBe(true);
  expect(a.setSelectedNodeIds).toEqual(["n1", "n2"]);
});
test("+ zooms in", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { key: "+" })).toBe(true);
  expect(a.zoomIn).toBeDefined();
});
test("0 resets zoom", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { key: "0" })).toBe(true);
  expect(a.setViewport).toBeDefined();
});

test("Delete with a selected edge invokes deleteEdges (unparent path)", () => {
  const { ctx, a } = makeCtx({
    reactFlow: { getEdges: () => [{ id: "e-p-c", selected: true }] } as any,
  });
  expect(fire(buildKeyboardRules(), ctx, { key: "Delete" })).toBe(true);
  expect(a.deleteEdges).toEqual(["e-p-c"]);
});

test("Delete with no selection does nothing", () => {
  const { ctx, a } = makeCtx({ reactFlow: { getEdges: () => [] } as any });
  expect(fire(buildKeyboardRules(), ctx, { key: "Delete" })).toBe(true);
  expect(a.deleteEdges).toBeUndefined();
  expect(a.deleteNodes).toBeUndefined();
  expect(a.toast).toBeUndefined();
});

test("Delete with selected nodes toasts", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["n1"] }) });
  expect(fire(buildKeyboardRules(), ctx, { key: "Delete" })).toBe(true);
  expect(a.deleteNodes).toEqual(["n1"]);
  expect(a.toast).toBeDefined();
});

test("Alt+R organizes the active view and toasts only when nodes exist", () => {
  const { ctx, a } = makeCtx();
  expect(fire(buildKeyboardRules(), ctx, { altKey: true, key: "r" })).toBe(true);
  expect(a.organizeCalls).toBe(1);
  expect(a.organize).toBeNull(); // no active leaf -> shared layout
  expect(a.toast).toBeUndefined();

  const { ctx: c2, a: b } = makeCtx({ getState: () => withActions(toStoreReader({ nodes: [{ id: "n1" }], activeLeafId: "leaf-1" } as any), b) });
  expect(fire(buildKeyboardRules(), c2, { altKey: true, key: "r" })).toBe(true);
  expect(b.organize).toBe("leaf-1");
  expect(b.toast).toBeDefined();
});

test("Alt+P parent stays silent when all edges fail", () => {
  const { ctx, a } = makeCtx({
    getState: () => toStoreReader({ selectedNodeIds: ["n1", "n2", "n3"], nodes: [{ id: "n3", data: { type: "folder" } }] }),
    connectNodes: () => ({ ok: false, reason: "blocked" }),
  });
    expect(fire(buildKeyboardRules(), ctx, { altKey: true, key: "p" })).toBe(true);
  expect(a.toast).toBeUndefined();
});

test("Alt+P parent toasts partial success", () => {
  let calls = 0;
  const { ctx, a } = makeCtx({
    getState: () => toStoreReader({ selectedNodeIds: ["n1", "n2", "n3"], nodes: [{ id: "n3", data: { type: "folder" } }] }),
    connectNodes: () => { calls++; return { ok: calls === 1, reason: undefined }; },
  });
  expect(fire(buildKeyboardRules(), ctx, { altKey: true, key: "p" })).toBe(true);
  expect(calls).toBe(2);
  expect(a.toast).toBeDefined();
});

test("Alt+Shift+P unparent routes the whole selection through unparentNodes", () => {
  const { ctx, a } = makeCtx({
    getState: () => toStoreReader({ selectedNodeIds: ["n1", "n2"] }),
  });
  expect(fire(buildKeyboardRules(), ctx, { altKey: true, shiftKey: true, key: "p" })).toBe(true);
  expect(a.unparentNodes).toEqual(["n1", "n2"]);
  expect(a.removeEdgesFromHandle).toBeUndefined();
});

test("Alt+Shift+P unparent stays silent on a no-op", () => {
  const { ctx, a } = makeCtx({
    getState: () => toStoreReader({ selectedNodeIds: ["root", "child"] }),
    unparentNodes: () => 0,
  });
  expect(fire(buildKeyboardRules(), ctx, { altKey: true, shiftKey: true, key: "p" })).toBe(true);
  expect(a.toast).toBeUndefined();
});

test("Ctrl+D duplicate stays silent for stale selection", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ selectedNodeIds: ["ghost"] }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "d" })).toBe(true);
  expect(a.duplicateNodeUnderParent).toBe("ghost");
  expect(a.toast).toBeUndefined();
});

test("Ctrl+V paste stays silent for stale clipboard", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ clipboard: { mode: "copy", nodeIds: ["ghost"] } }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "v" })).toBe(true);
  expect(a.pasteFromClipboard).toBeUndefined();
  expect(a.toast).toBeUndefined();
});

test("Ctrl+V paste toasts real clipboard content", () => {
  const { ctx, a } = makeCtx({ getState: () => toStoreReader({ clipboard: { mode: "copy", nodeIds: ["n1"] }, nodes: [{ id: "n1" }] }) });
  expect(fire(buildKeyboardRules(), ctx, { ctrlKey: true, key: "v" })).toBe(true);
  expect(a.toast).toBeDefined();
});

// ─── Dialog blocking ───────────────────────────────────────────────────
