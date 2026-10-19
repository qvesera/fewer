/**
 * TagMenu is the ONE tag-assignment UI: it serves a single card and a whole
 * multi-selection alike. The mixed ("indeterminate") checkbox state is the only
 * thing batch tagging adds on top of the individual workflow, so it — and the
 * click rule behind it (mixed fills the gap, all clears) — is what gets pinned
 * down here.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const toast = mock(() => {});
// Same mock pattern as CustomNode.test.tsx: nothing in the repo imports
// `toast`/`reducer` directly, only the `useToast` hook.
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { ContextMenu, ContextMenuContent, ContextMenuTrigger } = await import("@/components/ui/context-menu");
const { TagMenu } = await import("@/components/fewer/TagMenu");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

const TAG = { id: "t1", label: "Review", color: "#f87171" };

function node(id: string, tagIds: string[]) {
  return {
    id,
    type: "file",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type: "file", tagIds },
  } as never;
}

/** Seed the registry + nodes, then open the submenu for `ids`. */
function openTagMenu(ids: string[], nodes: unknown[]) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      nodes,
      tags: [TAG],
      past: [],
      future: [],
    }),
  );
  render(
    <ContextMenu>
      <ContextMenuTrigger>right here</ContextMenuTrigger>
      <ContextMenuContent>
        <TagMenu ids={ids} />
      </ContextMenuContent>
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText("right here"));
  // The sub trigger opens the submenu synchronously on click (hover uses a
  // 100ms timer, which would force every test to be async).
  fireEvent.click(screen.getByText("Tags"));
  return screen.getByRole("menuitemcheckbox", { name: "Review" });
}

function tagIdsOf(id: string): string[] {
  return useGraphStore.getState().nodes.find((n) => n.id === id)?.data.tagIds ?? [];
}

beforeEach(() => toast.mockClear());
afterEach(cleanup);

describe("TagMenu (single card AND multi-selection)", () => {
  test("none carried → unchecked; clicking assigns to every id in one undo step", () => {
    const item = openTagMenu(["n1", "n2"], [node("n1", []), node("n2", [])]);
    expect(item.getAttribute("data-state")).toBe("unchecked");

    const pastBefore = useGraphStore.getState().past.length;
    act(() => fireEvent.click(item));

    expect(tagIdsOf("n1")).toEqual(["t1"]);
    expect(tagIdsOf("n2")).toEqual(["t1"]);
    expect(useGraphStore.getState().past).toHaveLength(pastBefore + 1);
  });

  test("mixed selection → indeterminate; clicking FILLS the gap (assign to all)", () => {
    const item = openTagMenu(["n1", "n2"], [node("n1", ["t1"]), node("n2", [])]);
    expect(item.getAttribute("data-state")).toBe("indeterminate");

    act(() => fireEvent.click(item));

    expect(tagIdsOf("n1")).toEqual(["t1"]);
    expect(tagIdsOf("n2")).toEqual(["t1"]);
  });

  test("all carried → checked; clicking clears the tag from every id at once", () => {
    const item = openTagMenu(["n1", "n2"], [node("n1", ["t1"]), node("n2", ["t1"])]);
    expect(item.getAttribute("data-state")).toBe("checked");

    const pastBefore = useGraphStore.getState().past.length;
    act(() => fireEvent.click(item));

    expect(tagIdsOf("n1")).toEqual([]);
    expect(tagIdsOf("n2")).toEqual([]);
    expect(useGraphStore.getState().past).toHaveLength(pastBefore + 1);
  });

  test("single card behaves exactly like the batch path (no toast for one card)", () => {
    const item = openTagMenu(["n1"], [node("n1", [])]);
    expect(item.getAttribute("data-state")).toBe("unchecked");

    act(() => fireEvent.click(item));

    expect(tagIdsOf("n1")).toEqual(["t1"]);
    expect(toast).not.toHaveBeenCalled();
  });

  test("+ New tag from a multi-selection assigns it to every card and toasts", () => {
    openTagMenu(["n1", "n2"], [node("n1", []), node("n2", [])]);
    act(() => fireEvent.click(screen.getByText("New tag")));

    const input = screen.getByPlaceholderText("Tag name");
    act(() => fireEvent.change(input, { target: { value: "Urgent" } }));
    act(() => fireEvent.keyDown(input, { key: "Enter" }));

    const created = useGraphStore.getState().tags.find((t) => t.label === "Urgent");
    expect(created).toBeDefined();
    expect(tagIdsOf("n1")).toEqual([created!.id]);
    expect(tagIdsOf("n2")).toEqual([created!.id]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tag assigned" }),
    );
  });
});
