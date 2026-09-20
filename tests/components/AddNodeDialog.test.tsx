/**
 * Characterization suite for AddNodeDialog — written BEFORE refactoring.
 * Tests all three modes (child/standalone/parent), duplicate warning,
 * keyboard handling, and exact toast strings.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { AddNodeDialog } = await import("@/components/fewer/AddNodeDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function seedStore() {
  act(() =>
    useGraphStore.setState({
      ...initial,
      nodes: [
        { id: "root", type: "folder", position: { x: 0, y: 0 }, data: { label: "root", path: "/root", type: "folder" } },
        { id: "existing", type: "folder", position: { x: 100, y: 100 }, data: { label: "existing", path: "/root/existing", type: "folder" } },
      ] as never,
      edges: [{ id: "e-root-existing", source: "root", target: "existing" }],
      selectedNodeIds: ["root"],
    }),
  );
}

beforeEach(() => {
  toast.mockClear();
  seedStore();
});
afterEach(cleanup);

function renderDialog(mode: "child" | "standalone" | "parent", extra: Record<string, any> = {}) {
  return render(<AddNodeDialog open onOpenChange={() => {}} mode={mode} {...extra} />);
}

describe("AddNodeDialog rendering", () => {
  test("child mode shows Add child card title", () => {
    renderDialog("child");
    expect(screen.getByText("Add child card")).toBeDefined();
  });

  test("standalone mode shows Add card title", () => {
    renderDialog("standalone");
    expect(screen.getByText("Add card")).toBeDefined();
  });

  test("parent mode shows Add parent card title", () => {
    renderDialog("parent");
    expect(screen.getByText("Add parent card")).toBeDefined();
  });

  test("parent mode shows folder-only message instead of type toggle", () => {
    renderDialog("parent");
    expect(screen.getByText("📁 Parent cards are always folders")).toBeDefined();
    expect(screen.queryByText("📁 Folder")).toBeNull();
  });

  test("child/standalone modes show folder and file type toggle buttons", () => {
    renderDialog("child");
    expect(screen.getByText("📁 Folder")).toBeDefined();
    expect(screen.getByText("📄 File")).toBeDefined();
  });
});

describe("AddNodeDialog duplicate detection", () => {
  test("child mode: typing existing sibling name shows duplicate warning", () => {
    renderDialog("child");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "existing" } });
    expect(screen.getByText(/already exists/)).toBeDefined();
  });

  test("child mode: typing unique name does NOT show warning", () => {
    renderDialog("child");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unique-name" } });
    expect(screen.queryByText(/already exists/)).toBeNull();
  });

  test("submit button is disabled when duplicate", () => {
    renderDialog("child");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "existing" } });
    const btn = screen.getByRole("button", { name: /Create/ });
    expect(btn).toHaveProperty("disabled", true);
  });
});

describe("AddNodeDialog submission", () => {
  test("child mode: create folder fires toast with correct strings", () => {
    const onOpenChange = mock(() => {});
    renderDialog("child", { onOpenChange });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "newfolder" } });
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Folder added",
        description: '"newfolder" added to folder',
      }),
    );
  });

  test("standalone mode: create file fires toast with correct strings", () => {
    const onOpenChange = mock(() => {});
    renderDialog("standalone", { onOpenChange });
    fireEvent.click(screen.getByText("📄 File"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "note.md" } });
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "File added",
        description: '"note.md" added to canvas',
      }),
    );
  });

  test("submit calls onOpenChange(false)", () => {
    const onOpenChange = mock(() => {});
    renderDialog("child", { onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AddNodeDialog keyboard", () => {
  test("Enter in child mode triggers submit", () => {
    const onOpenChange = mock(() => {});
    renderDialog("child", { onOpenChange });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(toast).toHaveBeenCalled();
  });

  test("ArrowRight switches to file type", () => {
    renderDialog("child");
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    // After switching to file, the submit button should say Create file
    expect(screen.getByRole("button", { name: "Create file" })).toBeDefined();
  });

  test("ArrowLeft switches to folder type", () => {
    renderDialog("child");
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "Create folder" })).toBeDefined();
  });
});
