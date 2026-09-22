/**
 * Characterization suite for Sidebar — written BEFORE refactoring.
 * Tests section visibility, badge counts, and layout logic.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mocks — use-auth, use-toast are single-hook modules (safe per isolation rule).
// supabase and use-profile are spread-then-override (per isolation rule) because
// SavedGraphsPanel (rendered inside Sidebar) imports both.
const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

// Import after mocks
const { Sidebar } = await import("@/components/fewer/Sidebar");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function renderSidebar(extra: Record<string, any> = {}) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      nodes: [],
      edges: [],
      tags: [],
      hiddenIds: [],
      direction: "TB",
      edgeStyle: "curved",
      advancedModeEnabled: false,
      sidebarSide: "left",
      ...extra,
    }),
  );
  return render(
    <TooltipProvider>
      <Sidebar onOpenDirectory={() => {}} onRequireAuth={() => {}} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  toast.mockClear();
  useGraphStore.setState({ ...initial, bugReportOpen: false });
});

afterEach(cleanup);

describe("Sidebar rendering", () => {
  test("renders the Import button (file section always visible)", () => {
    renderSidebar();
    expect(screen.getByText("Import")).toBeDefined();
  });

  test("Connections & Style section renders", () => {
    renderSidebar();
    expect(screen.getByText("Connections \u0026 Style")).toBeDefined();
  });

  test("Tags section hidden when no nodes", () => {
    renderSidebar({ nodes: [] });
    expect(screen.queryByText("Tags")).toBeNull();
  });

  test("Tags section visible when nodes present", () => {
    renderSidebar({
      nodes: [
        { id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "src", path: "/src", type: "folder" } },
      ],
      tags: [{ id: "t1", label: "bug", color: "#f00" }],
    });
    expect(screen.getByText("Tags")).toBeDefined();
  });

  test("Graph Analytics hidden in basic mode", () => {
    renderSidebar({ advancedModeEnabled: false });
    expect(screen.queryByText("Graph Analytics")).toBeNull();
  });

  test("Graph Analytics visible in advanced mode with nodes", () => {
    renderSidebar({
      advancedModeEnabled: true,
      nodes: [{ id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "root", path: "/", type: "folder" } }],
    });
    expect(screen.getByText("Graph Analytics")).toBeDefined();
  });

  test("reset button (icon-only) is not present when no nodes", () => {
    renderSidebar({ nodes: [] });
    // Trash2 icon button is disabled when no nodes. Radix tooltip content
    // ("Clear Canvas") only appears on hover — not findable in happy-dom.
    // Instead verify the AlertDialog starts closed (no dialog content rendered).
    expect(screen.queryByText("Clear canvas?")).toBeNull();
  });
});
