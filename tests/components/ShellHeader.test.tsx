import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShellHeader } from "@/components/fewer/ShellHeader";
import { useGraphStore } from "@/store/graphStore";

// The shell header drives the real store — no boundary mocks. It has no
// dialogs, auth or toasts surface beyond the standard toast hook's module
// store, so the DOM is the actual surface under test.
const initial = useGraphStore.getInitialState();

const node = (id: string, label: string, path: string, extra: Record<string, unknown> = {}) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label, path, type: "file", ...extra },
});

const NODES = [node("main", "main.ts", "src/main.ts", { extension: "ts", category: "code" })] as never;

beforeEach(() => {
  useGraphStore.setState({ ...initial }, true);
});

afterEach(() => {
  cleanup();
  useGraphStore.setState(initial, true);
});

describe("ShellHeader (T-198)", () => {
  test("renders the compact shell chrome: sidebar toggle, undo/redo/delete, search", () => {
    render(<ShellHeader />);
    expect(screen.getByLabelText("Toggle sidebar")).toBeDefined();
    expect(screen.getByLabelText("Undo")).toBeDefined();
    expect(screen.getByLabelText("Redo")).toBeDefined();
    expect(screen.getByLabelText("Delete selection")).toBeDefined();
    expect(screen.getByPlaceholderText("Search directory cards...")).toBeDefined();
  });

  test("no Export / Load Sample / Settings buttons — the native menu owns them", () => {
    render(<ShellHeader />);
    expect(screen.queryByText("Export")).toBeNull();
    expect(screen.queryByText("Load Sample")).toBeNull();
    expect(screen.queryByLabelText("Open settings")).toBeNull();
  });

  test("undo/redo/delete are disabled with nothing to act on", () => {
    render(<ShellHeader />);
    expect((screen.getByLabelText("Undo") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Redo") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Delete selection") as HTMLButtonElement).disabled).toBe(true);
  });

  test("delete removes the selected node from the store", () => {
    useGraphStore.setState({ nodes: NODES, selectedNodeIds: ["main"] });
    render(<ShellHeader />);
    const del = screen.getByLabelText("Delete selection") as HTMLButtonElement;
    expect(del.disabled).toBe(false);
    fireEvent.click(del);
    expect(useGraphStore.getState().nodes).toHaveLength(0);
    expect(useGraphStore.getState().selectedNodeIds).toHaveLength(0);
  });
});