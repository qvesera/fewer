/**
 * DockArea / DockAreaContent scroll container test.
 * Verifies non-graph leaf content is wrapped in a scroll container.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mocks — safe per isolation rule (single-hook modules).
mock.module("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock(() => {}) }),
}));

const { DockArea } = await import("@/components/fewer/DockArea");
const { useGraphStore } = await import("@/store/graphStore");
const { createArea } = await import("@/lib/fewer/panelTree");
const initial = useGraphStore.getInitialState();

function renderLeaf(editor: string, extra: Record<string, any> = {}) {
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
      tier: "pro",
      ...extra,
    }),
  );
  return render(
    <TooltipProvider>
      <DockArea area={createArea(editor as any)} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  useGraphStore.setState({ ...initial });
});

afterEach(cleanup);

describe("DockArea scroll container", () => {
  // Editors with no availability gate — always render content.
  for (const editor of ["layout", "edges", "file"]) {
    test(`${editor} leaf renders data-leaf-scroll with overflow-y-auto`, () => {
      const { container } = renderLeaf(editor);
      const el = container.querySelector("[data-leaf-scroll]");
      expect(el).not.toBeNull();
      expect(el!.className).toContain("overflow-y-auto");
      expect(el!.className).toContain("gm-scroll");
    });
  }

  test("tags leaf renders scroll container when nodes present", () => {
    const { container } = renderLeaf("tags", {
      nodes: [{ id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "src", path: "/src", type: "folder" } }],
      tags: [{ id: "t1", label: "bug", color: "#f00" }],
    });
    const el = container.querySelector("[data-leaf-scroll]");
    expect(el).not.toBeNull();
    expect(el!.className).toContain("overflow-y-auto");
  });

  test("analytics leaf renders scroll container in advanced mode with nodes", () => {
    const { container } = renderLeaf("analytics", {
      advancedModeEnabled: true,
      nodes: [{ id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "src", path: "/src", type: "folder" } }],
    });
    const el = container.querySelector("[data-leaf-scroll]");
    expect(el).not.toBeNull();
    expect(el!.className).toContain("overflow-y-auto");
  });

  test("hidden leaf renders scroll container when hidden nodes exist", () => {
    const { container } = renderLeaf("hidden", { hiddenIds: ["h1"] });
    const el = container.querySelector("[data-leaf-scroll]");
    expect(el).not.toBeNull();
    expect(el!.className).toContain("overflow-y-auto");
  });
});
