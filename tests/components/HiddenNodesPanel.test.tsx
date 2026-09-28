import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The Hidden Cards panel now materialises only a hidden tree's ROOTS and loads a
 * row's children when it expands. These tests pin the wiring that makes that
 * safe: roots render from the group, the disclosure chevron appears for a row
 * that HAS hidden children (even though its children were never built), and
 * expanding it fetches them.
 */
const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { HiddenNodesPanel } = await import("@/components/fewer/HiddenNodesPanel");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

const node = (id: string, type: "folder" | "file", label: string, path: string) => ({
  id, type, position: { x: 0, y: 0 },
  data: { label, path, type, isRoot: false },
  style: { width: 200, height: 120 },
}) as any;
const edge = (source: string, target: string) =>
  ({ id: `e-${source}-${target}`, source, target, type: "smoothstep" }) as any;

// root -> docs -> [sub -> [deep], a.md]   (sub, deep and a hidden; docs visible)
const NODES = [
  node("root", "folder", "root", "/root"),
  node("docs", "folder", "docs", "/root/docs"),
  node("sub", "folder", "sub", "/root/docs/sub"),
  node("deep", "file", "deep.md", "/root/docs/sub/deep.md"),
  node("a", "file", "a.md", "/root/docs/a.md"),
];
const EDGES = [
  edge("root", "docs"),
  edge("docs", "sub"),
  edge("sub", "deep"),
  edge("docs", "a"),
];

function seed(hiddenIds: string[]) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      nodes: NODES,
      edges: EDGES,
      hiddenIds,
      dataSource: "url:test",
      localRootPath: null,
    }),
  );
}

beforeEach(() => toast.mockClear());
afterEach(() => cleanup());

describe("HiddenNodesPanel", () => {
  test("renders nothing when no card is hidden", () => {
    seed([]);
    const { container } = render(<HiddenNodesPanel />);
    expect(container.firstChild).toBeNull();
  });

  test("lists the hidden roots under their visible folder", () => {
    seed(["sub", "deep", "a"]);
    render(<HiddenNodesPanel />);
    // Group header: the context folder, and the "3 hidden" count.
    expect(screen.getByText("docs")).toBeTruthy();
    expect(screen.getByText("3 hidden")).toBeTruthy();
    // The root row is there; its unbuilt child is not.
    expect(screen.getByText("sub")).toBeTruthy();
    expect(screen.getByText("a.md")).toBeTruthy();
    expect(screen.queryByText("deep.md")).toBeNull();
  });

  test("a root with hidden children shows a disclosure and expands on click", () => {
    seed(["sub", "deep", "a"]);
    render(<HiddenNodesPanel />);
    // The chevron is an aria-labelled button — present only when the row HAS
    // hidden children, which is why the check cannot just read the built tree.
    const expand = screen.getByRole("button", { name: "Expand" });
    fireEvent.click(expand);
    expect(screen.getByText("deep.md")).toBeTruthy();
  });

  test("a leaf root has no disclosure and no children", () => {
    seed(["a"]);
    render(<HiddenNodesPanel />);
    expect(screen.getByText("a.md")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: "Expand" })).toHaveLength(0);
  });

  test("searching keeps a deep match's ancestor path (needs the built tree)", () => {
    seed(["sub", "deep", "a"]);
    render(<HiddenNodesPanel />);
    const input = screen.getByPlaceholderText("Search hidden cards...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "deep" } });
    // "sub" is not itself a match, but it is the only path to one, so it stays.
    // In roots-only mode filterHiddenTree would have dropped it (no children to
    // match), so this row is what proves the search path built the full tree.
    expect(screen.getByText("sub")).toBeTruthy();
    // A root that matches nothing is filtered out.
    expect(screen.queryByText("a.md")).toBeNull();
    // Rows still don't auto-expand, so the match is one click down.
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("deep.md")).toBeTruthy();
  });
});