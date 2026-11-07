/**
 * Pane-aware breadcrumb bar (T-245): each split canvas must show its OWN
 * path — two bars fed different lenses render different chains — and a crumb
 * click must write the owning pane's selection, not the shared list (which
 * belongs to whichever leaf is active).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const { BreadcrumbBar } = await import("@/components/fewer/BreadcrumbBar");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function seedStore() {
  act(() =>
    useGraphStore.setState({
      ...initial,
      nodes: [
        { id: "root", type: "folder", position: { x: 0, y: 0 }, data: { label: "fewer", path: "/fewer", type: "folder" } },
        { id: "src", type: "folder", position: { x: 0, y: 100 }, data: { label: "src", path: "/fewer/src", type: "folder" } },
        { id: "app", type: "file", position: { x: 0, y: 200 }, data: { label: "App.tsx", path: "/fewer/src/App.tsx", type: "file" } },
      ] as never,
      edges: [
        { id: "e-root-src", source: "root", target: "src" },
        { id: "e-src-app", source: "src", target: "app" },
      ],
      selectedNodeIds: ["app"],
      leafSelections: { leafA: ["app"], leafB: ["src"] },
      activeLeafId: "leafA",
    }),
  );
}

beforeEach(seedStore);
afterEach(cleanup);

describe("BreadcrumbBar pane-awareness (T-245)", () => {
  test("two panes render their own chain, not the last-touched one", () => {
    render(
      <>
        <BreadcrumbBar selectedIds={["app"]} leafId="leafA" />
        <BreadcrumbBar selectedIds={["src"]} leafId="leafB" />
      </>,
    );

    const bars = screen.getAllByTestId("breadcrumb-bar");
    expect(bars).toHaveLength(2);

    // Pane A: fewer › src › App.tsx — three crumb buttons.
    expect(bars[0].querySelectorAll("button")).toHaveLength(3);
    expect(bars[0].textContent).toContain("App.tsx");

    // Pane B: fewer › src — the shared selection (App.tsx) must NOT leak in.
    expect(bars[1].querySelectorAll("button")).toHaveLength(2);
    expect(bars[1].textContent).not.toContain("App.tsx");
  });

  test("a crumb click writes the OWNING pane's selection and activates it", () => {
    render(<BreadcrumbBar selectedIds={["src"]} leafId="leafB" />);

    // Click the "fewer" (root) crumb in pane B.
    fireEvent.click(screen.getByRole("button", { name: "fewer" }));

    const s = useGraphStore.getState();
    expect(s.leafSelections.leafB).toEqual(["root"]);
    // Pane A keeps its own selection — the bug T-245 fixes.
    expect(s.leafSelections.leafA).toEqual(["app"]);
    // The shared list follows the pane that was interacted with.
    expect(s.activeLeafId).toBe("leafB");
    expect(s.selectedNodeIds).toEqual(["root"]);
    expect(s.focusedNodeId).toBe("root");
  });

  test("no leafId falls back to the shared selection (single-canvas)", () => {
    render(<BreadcrumbBar />);

    expect(screen.getByTestId("breadcrumb-bar").textContent).toContain("App.tsx");

    fireEvent.click(screen.getByRole("button", { name: "fewer" }));
    expect(useGraphStore.getState().selectedNodeIds).toEqual(["root"]);
  });
});
