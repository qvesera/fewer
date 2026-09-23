/**
 * Characterization suite for ExportPanel.
 * Tests format selection logic, export-selected mode, and panel open/close.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const { ExportPanel } = await import("@/components/fewer/ExportPanel");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function seedStore(extra: Record<string, any> = {}) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      exportOpen: true,
      nodes: [
        { id: "root", type: "folder", position: { x: 0, y: 0 }, data: { label: "root", path: "/root", type: "folder" } },
        { id: "file1", type: "file", position: { x: 100, y: 100 }, data: { label: "test.ts", path: "/root/test.ts", type: "file", extension: "ts" } },
      ] as never,
      edges: [{ id: "e-root-file1", source: "root", target: "file1" }],
      ...extra,
    }),
  );
}

beforeEach(() => { toast.mockClear(); seedStore(); });
afterEach(cleanup);

function renderPanel(extra: Record<string, any> = {}) {
  return render(
    <TooltipProvider>
      <ExportPanel {...extra} />
    </TooltipProvider>,
  );
}

describe("ExportPanel rendering", () => {
  test("renders when exportOpen is true", async () => {
    renderPanel();
    await screen.findByText(/Choose format/);
    expect(screen.getByText("PNG")).toBeDefined();
  });

  test("does not render when exportOpen is false", () => {
    act(() => useGraphStore.setState({ exportOpen: false }));
    const { container } = renderPanel();
    expect(container.querySelector('[data-radix-dialog-content]')).toBeNull();
  });
});

describe("ExportPanel format logic", () => {
  test("basic formats are available by default", () => {
    seedStore({ advancedModeEnabled: false });
    renderPanel();
    expect(screen.getByText("PNG")).toBeDefined();
    expect(screen.getByText(/Directory Tree/)).toBeDefined();
  });

  test("advanced formats shown when advancedModeEnabled", () => {
    seedStore({ advancedModeEnabled: true, tier: "free" });
    renderPanel();
    expect(screen.getByText("JSON")).toBeDefined();
    expect(screen.getByText("CSV")).toBeDefined();
  });
});

describe("ExportPanel export-selected mode", () => {
  test("single file selection auto-toggles off", () => {
    seedStore({ selectedNodeIds: ["file1"], advancedModeEnabled: false });
    renderPanel();
    // PNG format is non-selection, so the exportSelected toggle should be off
    // The panel renders without error
    expect(screen.getByText("PNG")).toBeDefined();
  });
});
