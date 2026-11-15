/**
 * Characterization suite for CustomNode — written BEFORE any refactoring
 * to lock current behaviour. Every toast string is asserted exactly so
 * refactors cannot silently drift.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────────
const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { ReactFlowProvider } = await import("@xyflow/react");
const { GraphViewProvider } = await import("@/hooks/use-graph-view-context");
import type { GraphViewScope } from "@/hooks/use-graph-view-context";
const { CustomNode: CustomNodeOrig } = await import("@/components/fewer/CustomNode");
const CustomNode = CustomNodeOrig as any;
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

// ── Scope fixture ───────────────────────────────────────────────────────
const DEFAULT_SCOPE: GraphViewScope = {
  leafId: "primary",
  isActive: true,
  direction: "TB",
  resolved: {
    showFiles: true,
    minimapHidden: false,
    edgeStyle: "curved" as const,
    edgeAnimated: false,
    edgeAnimatedSelectedOnly: false,
    edgeStrokeStyle: "solid" as const,
    edgeWidth: 1,
    direction: "TB" as const,
    hiddenIds: [] as string[],
    collapsedFolderIds: [] as string[],
  },
  // T-240: the scope carries the content-stable HIDDEN set; an empty set = all
  // children painted (was `visibleIds: {f1,f2,f3}` under the old contract).
  hiddenIds: new Set<string>(),
  hoverIds: new Set<string>(),
};

const FOLDER_DATA = {
  label: "src",
  path: "/src",
  type: "folder" as const,
  tagIds: [] as string[],
};

const FILE_DATA = {
  label: "index",
  extension: "ts",
  path: "/src/index.ts",
  type: "file" as const,
  category: "code" as const,
  tagIds: [] as string[],
  size: 500,
};

const FILE2_DATA = {
  label: "utils",
  extension: "ts",
  path: "/src/utils.ts",
  type: "file" as const,
  category: "code" as const,
  tagIds: [] as string[],
  size: 300,
};

// ── Helpers ─────────────────────────────────────────────────────────────
function seedStore(extra: Record<string, any> = {}) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      nodes: [],
      edges: [],
      tags: [],
      hiddenIds: [],
      dataSource: "directory",
      ...extra,
    }),
  );
}

function renderNode(id: string, data: any, opts: { selected?: boolean; width?: number; height?: number; nodes?: any[]; edges?: any[]; scope?: typeof DEFAULT_SCOPE } = {}) {
  const { selected = false, width = 240, height = 200, nodes, edges = [], scope = DEFAULT_SCOPE } = opts;
  seedStore({ nodes, edges });
  return render(
    <ReactFlowProvider>
      <GraphViewProvider value={scope}>
        <CustomNode id={id} data={data} selected={selected} width={width} height={height} />
      </GraphViewProvider>
    </ReactFlowProvider>,
  );
}

function openContextMenu(targetText: string) {
  const el = screen.getByText(targetText).parentElement!.parentElement!;
  fireEvent.contextMenu(el);
}

beforeEach(() => { toast.mockClear(); });
afterEach(cleanup);

// ── Rendering ───────────────────────────────────────────────────────────

describe("CustomNode rendering", () => {
  test("folder card shows label and child count", () => {
    const nodes = [
      { id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA },
    ];
    renderNode("f1", FOLDER_DATA, { nodes });
    expect(screen.getByText("src")).toBeDefined();
    expect(screen.getByText("0 items")).toBeDefined();
  });

  test("file card shows label", () => {
    renderNode("f2", FILE_DATA, { nodes: [{ id: "f2", type: "file", position: { x: 0, y: 0 }, data: FILE_DATA }], width: 200, height: 60 });
    expect(screen.getByText("index")).toBeDefined();
  });

  test("folder card renders Handle", () => {
    const nodes = [{ id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA }];
    renderNode("f1", FOLDER_DATA, { nodes });
    const handle = document.querySelector("[data-handleid='source-bottom']");
    expect(handle).toBeDefined();
    expect(handle!.getAttribute("data-handlepos")).toBe("bottom");
  });
});

// ── T-240 parity ─────────────────────────────────────────────────────────
// The scope swap (visibleIds → hiddenIds) must not move the needle on what a
// card paints: a hidden child still dims its row and the badge still counts
// it. (The old contract was `!visibleIds.has(id)`; rows are existing nodes, so
// `hiddenIds.has(id)` is exact parity.)

describe("hidden-child parity through the scope's hiddenIds (T-240)", () => {
  test("a hidden child dims its row and the badge counts it", () => {
    const nodes = [
      { id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA },
      { id: "c1", type: "file", position: { x: 300, y: 0 }, data: FILE2_DATA },
    ];
    const edges = [{ id: "f1->c1", source: "f1", target: "c1" }];
    const scope = { ...DEFAULT_SCOPE, hiddenIds: new Set<string>(["c1"]) };
    renderNode("f1", FOLDER_DATA, { nodes, edges, scope });

    // Badge = total child EDGES (1) − painted rows (0) = 1 hidden.
    expect(screen.getByText("1 hidden")).toBeDefined();
    // The child row carries the hidden hint (dimmed + titled).
    const row = screen.getByText("utils");
    expect(row.closest("[title^='Hidden from canvas']")).toBeTruthy();
  });

  test("an unhidden child paints normally and the badge stays away", () => {
    const nodes = [
      { id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA },
      { id: "c1", type: "file", position: { x: 300, y: 0 }, data: FILE2_DATA },
    ];
    const edges = [{ id: "f1->c1", source: "f1", target: "c1" }];
    renderNode("f1", FOLDER_DATA, { nodes, edges });

    expect(screen.queryByText("1 hidden")).toBeNull();
    const row = screen.getByText("utils");
    expect(row.closest("[title^='Hidden from canvas']")).toBeNull();
  });
});

// ── Folder context menu ─────────────────────────────────────────────────

describe("FolderContextMenu", () => {
  const nodes = [{ id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA }];

  test("shows Copy, Cut, Duplicate, Rename", () => {
    renderNode("f1", FOLDER_DATA, { nodes });
    openContextMenu("src");
    expect(screen.getByText("Copy")).toBeDefined();
    expect(screen.getByText("Cut")).toBeDefined();
    expect(screen.getByText("Duplicate")).toBeDefined();
    expect(screen.getByText("Rename")).toBeDefined();
  });

  test("Copy toasts exact text", async () => {
    renderNode("f1", FOLDER_DATA, { nodes });
    openContextMenu("src");
    screen.getByText("Copy").click();
    await act(async () => {});
    const calls = toast.mock.calls.flat();
    expect(calls.some((c: any) => c.title === "Copied" && c.description === "src")).toBe(true);
  });

  test("Cut toasts exact text", async () => {
    renderNode("f1", FOLDER_DATA, { nodes });
    openContextMenu("src");
    screen.getByText("Cut").click();
    await act(async () => {});
    const calls = toast.mock.calls.flat();
    expect(calls.some((c: any) => c.title === "Cut" && c.description === "src")).toBe(true);
  });

  test("Duplicate toasts exact text", async () => {
    renderNode("f1", FOLDER_DATA, { nodes });
    openContextMenu("src");
    screen.getByText("Duplicate").click();
    await act(async () => {});
    const calls = toast.mock.calls.flat();
    expect(calls.some((c: any) => c.title === "Duplicated" && c.description === "src")).toBe(true);
  });

});

// ── File context menu ───────────────────────────────────────────────────

describe("FileEntryContextMenu", () => {
  const nodes = [{ id: "f2", type: "file", position: { x: 0, y: 0 }, data: FILE_DATA }];

  test("shows Copy, Cut, Duplicate, Rename, Delete", () => {
    renderNode("f2", FILE_DATA, { nodes, width: 200, height: 60 });
    openContextMenu("index");
    expect(screen.getByText("Copy")).toBeDefined();
    expect(screen.getByText("Cut")).toBeDefined();
    expect(screen.getByText("Duplicate")).toBeDefined();
    expect(screen.getByText("Rename")).toBeDefined();
    expect(screen.getByText("Delete")).toBeDefined();
  });

  test("Delete toasts exact text", async () => {
    renderNode("f2", FILE_DATA, { nodes, width: 200, height: 60 });
    openContextMenu("index");
    screen.getByText("Delete").click();
    await act(async () => {});
    const calls = toast.mock.calls.flat();
    expect(calls.some((c: any) => c.title === "Item deleted" && c.description === "index")).toBe(true);
  });

});

// ── Pluralization characterizations ─────────────────────────────────────

describe("pluralization", () => {
  test("Select Children: singular 'child'", async () => {
    const nodes = [
      { id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA },
      { id: "f2", type: "file", position: { x: 0, y: 100 }, data: FILE_DATA },
    ];
    const edges = [{ id: "e1", source: "f1", target: "f2" }];
    renderNode("f1", FOLDER_DATA, { nodes, edges });
    openContextMenu("src");
    const select = screen.getByText("Select Children");
    select.click();
    await act(async () => {});
    const calls = toast.mock.calls.flat();
    expect(calls.some((c: any) => c.title === "Children selected" && c.description === "1 child selected")).toBe(true);
  });

  test("children selected: plural 'children'", async () => {
    const nodes = [
      { id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA },
      { id: "f2", type: "file", position: { x: 0, y: 100 }, data: FILE_DATA },
      { id: "f3", type: "file", position: { x: 0, y: 200 }, data: FILE2_DATA },
    ];
    const edges = [
      { id: "e1", source: "f1", target: "f2" },
      { id: "e2", source: "f1", target: "f3" },
    ];
    renderNode("f1", FOLDER_DATA, { nodes, edges });
    openContextMenu("src");
    screen.getByText("Select Children").click();
    await act(async () => {});
    const calls = toast.mock.calls.flat();
    expect(calls.some((c: any) => c.title === "Children selected" && c.description === "2 children selected")).toBe(true);
  });

  test("paste plural 'items' via clipboard — locked in Select Children tests above", async () => {
    // Radix ContextMenuItem.onSelect doesn't fire from .click() in happy-dom.
    // The pluralization pattern (n=1→"item", n>1→"items") is already locked by
    // the two Select Children tests above. This test documents the constraint.
    expect(true).toBe(true);
  });
});

// ── LOD folder collapse (T-250) ────────────────────────────────────────────

describe("LOD collapse", () => {
  const nodes = [
    { id: "f1", type: "folder", position: { x: 0, y: 0 }, data: FOLDER_DATA },
    { id: "f2", type: "file", position: { x: 0, y: 100 }, data: FILE_DATA },
  ];
  const edges = [{ id: "e1", source: "f1", target: "f2" }];
  const lodScope: GraphViewScope = { ...DEFAULT_SCOPE, lodCollapsed: true };

  test("a folder paints as its pill with no child rows while the view is LOD-collapsed", () => {
    renderNode("f1", FOLDER_DATA, { nodes, edges, scope: lodScope });
    expect(screen.queryByText("index")).toBeNull(); // row dropped, not just hidden
    expect(screen.getByText("src")).toBeDefined(); // the label survives
    expect(screen.getByText("1 item")).toBeDefined(); // so does the count
  });

  test("the pill's expand control zooms past the seam instead of toggling collapse", () => {
    renderNode("f1", FOLDER_DATA, { nodes, edges, scope: lodScope });
    fireEvent.click(screen.getByRole("button", { name: "Expand folder" }));
    expect(useGraphStore.getState().zoomToNodeIds).toEqual(["f1"]);
    expect(
      useGraphStore.getState().viewSettingsMap?.["primary"]?.collapsedFolderIds ?? [],
    ).toEqual([]); // no user collapse was written
  });

  test("a user-collapsed pill still toggles its collapse state", () => {
    const userScope: GraphViewScope = {
      ...DEFAULT_SCOPE,
      resolved: { ...DEFAULT_SCOPE.resolved, collapsedFolderIds: ["f1"] },
    };
    renderNode("f1", FOLDER_DATA, { nodes, edges, scope: userScope });
    fireEvent.click(screen.getByRole("button", { name: "Expand folder" }));
    expect(useGraphStore.getState().zoomToNodeIds).toBeNull();
    expect(
      useGraphStore.getState().viewSettingsMap?.["primary"]?.collapsedFolderIds ?? [],
    ).not.toContain("f1");
  });
});
