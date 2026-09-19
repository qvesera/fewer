import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchPanel } from "@/components/fewer/SearchPanel";
import { useGraphStore } from "@/store/graphStore";

// The search panel drives the real store — no boundary mocks. It renders no
// dialogs, auth or toasts, so the DOM is the actual surface under test.
const initial = useGraphStore.getInitialState();

const node = (id: string, label: string, path: string, extra: Record<string, unknown> = {}) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label, path, type: "file", ...extra },
});

const NODES = [
  node("src", "src", "src", { type: "folder" }),
  node("main", "main.ts", "src/main.ts", { extension: "ts", category: "code" }),
  node("logo", "logo.png", "assets/logo.png", { extension: "png", category: "image" }),
] as never;

function open(over: Record<string, unknown> = {}) {
  useGraphStore.setState({ ...initial, searchOpen: true, nodes: NODES, ...over }, true);
  render(<SearchPanel />);
}

beforeEach(() => {
  useGraphStore.setState({ ...initial, searchOpen: false }, true);
});

afterEach(() => {
  cleanup();
  useGraphStore.setState(initial, true);
});

describe("SearchPanel — closed and empty states", () => {
  test("renders nothing while closed", () => {
    useGraphStore.setState({ ...initial, searchOpen: false, nodes: NODES }, true);
    render(<SearchPanel />);
    expect(screen.queryByPlaceholderText("Search files & directories...")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("with no query, no filter and no history it prompts to start typing", () => {
    open();
    expect(screen.getByRole("status").textContent).toContain("Start typing to search");
  });

  test("an unqueryable state with history lists recent searches and re-searches on click", () => {
    open({ searchHistory: ["readme", "config"] });
    expect(screen.getByText("Recent searches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /config/ }));
    expect(useGraphStore.getState().searchQuery).toBe("config");
  });

  test("Clear search history empties it", () => {
    open({ searchHistory: ["readme"] });
    fireEvent.click(screen.getByRole("button", { name: "Clear search history" }));
    expect(useGraphStore.getState().searchHistory).toEqual([]);
  });
});

describe("SearchPanel — results", () => {
  test("typing into the input filters the list", () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Search files & directories..."), {
      target: { value: "main" },
    });
    expect(useGraphStore.getState().searchQuery).toBe("main");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("main.ts");
  });

  test("the footer counts every match while the list caps at the limit", () => {
    open({ searchQuery: "o" });
    expect(screen.getByText(/\d+ found/).textContent).toContain("found");
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(50);
  });

  test("no matches says so instead of listing", () => {
    open({ searchQuery: "zzzz" });
    expect(screen.getByRole("status").textContent).toContain("No canvas matches found");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("a hidden match is labelled hidden", () => {
    open({ searchQuery: "logo", hiddenIds: ["logo"] });
    const option = screen.getByRole("option");
    expect(option.getAttribute("aria-label")).toContain("hidden");
    expect(option.textContent).toContain("hidden");
  });

  test("clicking a result selects it, focuses it and closes the panel", () => {
    open({ searchQuery: "main" });
    fireEvent.click(screen.getByRole("option"));
    const state = useGraphStore.getState();
    expect(state.selectedNodeIds).toEqual(["main"]);
    expect(state.focusedNodeId).toBe("main");
    expect(state.zoomToNode?.nodeId).toBe("main");
    expect(state.searchOpen).toBe(false);
  });
});

describe("SearchPanel — filters", () => {
  test("the category chip names the active filter and clears it", () => {
    open({ categoryFilter: ["code"] });
    expect(screen.getByText(/Code/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear category filter" }));
    expect(useGraphStore.getState().categoryFilter).toEqual([]);
  });

  test("tag chips reflect the filter and toggle it", () => {
    const tag = { id: "t1", label: "work", color: "#fff" };
    open({ tags: [tag], tagFilter: [] });
    const chip = screen.getByRole("button", { name: /work/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(useGraphStore.getState().tagFilter).toEqual(["t1"]);
  });

  test("an active tag filter can be cleared", () => {
    const tag = { id: "t1", label: "work", color: "#fff" };
    open({ tags: [tag], tagFilter: ["t1"] });
    fireEvent.click(screen.getByRole("button", { name: "Clear tag filter" }));
    expect(useGraphStore.getState().tagFilter).toEqual([]);
  });
});

describe("SearchPanel — keyboard", () => {
  const key = (k: string) => fireEvent.keyDown(window, { key: k });

  test("arrows move the active option and clamp at both ends", () => {
    // "s" matches all three fixtures, so the walk has room to move.
    open({ searchQuery: "s" });
    const options = () => screen.getAllByRole("option");
    expect(options()).toHaveLength(3);
    expect(options().every((o) => o.getAttribute("aria-selected") === "false")).toBe(true);

    key("ArrowDown");
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    key("ArrowDown");
    expect(options()[1].getAttribute("aria-selected")).toBe("true");

    // Past the last result it stays pinned there.
    key("ArrowDown");
    key("ArrowDown");
    expect(options()[2].getAttribute("aria-selected")).toBe("true");

    // Up walks back and never passes the first result.
    key("ArrowUp");
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    key("ArrowUp");
    key("ArrowUp");
    key("ArrowUp");
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
  });

  test("Enter opens the active result", () => {
    open({ searchQuery: "main" });
    key("ArrowDown");
    key("Enter");
    expect(useGraphStore.getState().selectedNodeIds).toEqual(["main"]);
    expect(useGraphStore.getState().searchOpen).toBe(false);
  });

  test("Enter with no active result commits the search and closes", () => {
    open({ searchQuery: "main" });
    key("Enter");
    expect(useGraphStore.getState().searchHistory).toContain("main");
    expect(useGraphStore.getState().searchOpen).toBe(false);
  });

  test("Escape closes the panel and clears the query", () => {
    open({ searchQuery: "main" });
    key("Escape");
    expect(useGraphStore.getState().searchOpen).toBe(false);
    expect(useGraphStore.getState().searchQuery).toBe("");
  });
});
