/**
 * Characterization suite for GraphCanvas — the repo's highest-dependency
 * untested file (94 dependents). Covers CanvasOverlays, CanvasContextMenu,
 * and a GraphCanvas smoke render.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────
const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

// Import after mocks
const { GraphCanvas } = await import("@/components/fewer/GraphCanvas");
const { CanvasOverlays } = await import("@/components/fewer/CanvasOverlays");
const { CanvasContextMenu } = await import("@/components/fewer/CanvasContextMenu");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function seedStore(extra: Record<string, any> = {}) {
  act(() =>
    useGraphStore.setState({
      ...initial, nodes: [], edges: [], tags: [], hiddenIds: [],
      graphsExists: false, loading: false, ...extra,
    }),
  );
}

beforeEach(() => { toast.mockClear(); });
afterEach(cleanup);

const VS = {
  showFiles: true, minimapHidden: false, edgeStyle: "curved" as const,
  edgeAnimated: false, edgeAnimatedSelectedOnly: false,
  edgeStrokeStyle: "solid" as const, edgeWidth: 1,
  direction: "TB" as const, hiddenIds: [] as string[], collapsedFolderIds: [] as string[],
};

// ── CanvasOverlays ───────────────────────────────────────────────────────

describe("CanvasOverlays", () => {
  const EP = {
    loading: false, rfNodesCount: 0, graphsExists: false, vs: VS,
    leafId: undefined as string | undefined,
    onOpenImport: () => {}, onLoadSample: () => {},
    hiddenCount: 0, hiddenChipStyle: { backgroundColor: "#000", color: "#fff" },
  };

  test("shows 'No directory loaded' when no graph exists", () => {
    render(<CanvasOverlays {...EP} />);
    expect(screen.getByText("No directory loaded")).toBeDefined();
  });

  test("hides text when loading", () => {
    render(<CanvasOverlays {...EP} loading />);
    expect(screen.queryByText("No directory loaded")).toBeNull();
  });

  test("shows 'Everything is hidden' when graphs exist but no visible nodes", () => {
    render(<CanvasOverlays {...EP} rfNodesCount={0} graphsExists />);
    expect(screen.getByText("Everything is hidden")).toBeDefined();
  });

  test("shows plural hidden chip", () => {
    render(<CanvasOverlays {...EP} hiddenCount={3} />);
    expect(screen.getByText("3 cards hidden")).toBeDefined();
  });

  test("shows singular hidden chip", () => {
    render(<CanvasOverlays {...EP} hiddenCount={1} />);
    expect(screen.getByText("1 card hidden")).toBeDefined();
  });
});

// ── CanvasContextMenu ────────────────────────────────────────────────────

describe("CanvasContextMenu", () => {
  test("pane menu shows Select All, Organize, Clear Canvas", () => {
    seedStore();
    render(
      <CanvasContextMenu
        menu={{ x: 100, y: 100, kind: "pane" }} lastClickedEdgeId={null}
        vs={VS} leafId={undefined} advancedModeEnabled={false}
        hiddenCount={0} allNodes={[]} selectAll={() => {}} close={() => {}}
      />,
    );
    expect(screen.getByText("Select All")).toBeDefined();
    expect(screen.getByText("Organize")).toBeDefined();
    expect(screen.getByText("Clear Canvas")).toBeDefined();
  });

  test("pane menu shows Show Files when showFiles is false and leafId set", () => {
    seedStore();
    render(
      <CanvasContextMenu
        menu={{ x: 100, y: 100, kind: "pane" }} lastClickedEdgeId={null}
        vs={{ ...VS, showFiles: false }} leafId="primary"
        advancedModeEnabled={false} hiddenCount={0} allNodes={[]}
        selectAll={() => {}} close={() => {}}
      />,
    );
    expect(screen.getByText("Show Files")).toBeDefined();
  });

  test("edge menu shows Delete Edge", () => {
    seedStore();
    render(
      <CanvasContextMenu
        menu={{ x: 100, y: 100, kind: "edge" }} lastClickedEdgeId="e1"
        vs={VS} leafId={undefined} advancedModeEnabled={false}
        hiddenCount={0} allNodes={[]} selectAll={() => {}} close={() => {}}
      />,
    );
    expect(screen.getByText("Delete Edge")).toBeDefined();
  });

  test("Clear Canvas resets store nodes", () => {
    seedStore({ nodes: [{ id: "n1" }] });
    render(
      <CanvasContextMenu
        menu={{ x: 100, y: 100, kind: "pane" }} lastClickedEdgeId={null}
        vs={VS} leafId={undefined} advancedModeEnabled={false}
        hiddenCount={0} allNodes={[{ id: "n1" } as any]}
        selectAll={() => {}} close={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Clear Canvas"));
    expect(useGraphStore.getState().nodes).toEqual([]);
  });
});

// ── GraphCanvas smoke ────────────────────────────────────────────────────

describe("GraphCanvas smoke", () => {
  test("renders without crashing (empty graph)", () => {
    seedStore();
    const { container } = render(
      <GraphCanvas onOpenImport={() => {}} onLoadSample={() => {}} />,
    );
    expect(container).toBeDefined();
  });

  test("renders with seeded nodes", () => {
    seedStore({
      nodes: [
        { id: "n1", type: "folder", position: { x: 0, y: 0 },
          data: { label: "src", path: "/src", type: "folder", tagIds: [] } },
      ],
    });
    const { container } = render(
      <GraphCanvas onOpenImport={() => {}} onLoadSample={() => {}} />,
    );
    expect(container).toBeDefined();
  });
});
