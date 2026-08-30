import { test, expect } from "bun:test";
import {
  pluralizeCount,
  countDescendants,
  computeAltKey,
  buildKeyContext,
  buildKeyboardRules,
  handleKeyboardShortcut,
  toStoreReader,
  type ShortcutCtx,
} from "./keyboardShortcuts";
import type { FewerEdge } from "./types";

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
  });
  expect(r.direction).toBe("LR"); expect(r.selectedNodeIds).toEqual(["n1"]);
});
test("toStoreReader defaults for missing fields", () => {
  const r = toStoreReader({});
  expect(r.nodes).toEqual([]); expect(r.hiddenIds).toEqual([]);
  expect(r.clipboard).toBeNull(); expect(r.localRootPath).toBeNull();
});
// ─── Test harness ─────────────────────────────────────────────────
function makeCtx(overrides?: Partial<ShortcutCtx>): { ctx: ShortcutCtx; a: Record<string, any> } {
  const a: Record<string, any> = {};
  const ctx: ShortcutCtx = {
    getState: () => toStoreReader({}),
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
    showAll: () => { a.showAll = true; },
    setShowFiles: (v) => { a.setShowFiles = v; },
    setExportOpen: (v) => { a.setExportOpen = v; },
    setShortcutsOpen: (v) => { a.setShortcutsOpen = v; },
    reset: () => { a.reset = true; },
    pasteFromClipboard: (id) => { a.pasteFromClipboard = id; },
    moveNode: (id) => { a.moveNode = id; },
    connectNodes: () => ({ ok: true }),
    removeEdgesFromHandle: (id, t) => { a.removeEdgesFromHandle = [id, t]; },
    deleteEdges: (ids) => { a.deleteEdges = ids; },
    duplicateNodeUnderParent: (id) => { a.duplicateNodeUnderParent = id; },
    setAuthOpen: (v) => { a.setAuthOpen = v; },
    relayout: () => { a.relayout = true; },
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
    user: null,
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
  const { ctx, a } = makeCtx({ user: null });
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
});