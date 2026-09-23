import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportActionResult } from "@/lib/fewer/importFlow";

// Mock boundaries, not the dialog steps or the Zustand store.
let signedIn = false;
const toast = mock(() => {});
const user = { id: "test-user", email: "ada@example.org" };
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: signedIn ? user : null, loading: false }),
}));
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const importUrl = mock(async () => true);
const getResult = mock(() => ({ error: null, truncated: false }));
mock.module("@/hooks/use-github-import", () => ({
  useImport: () => ({ importUrl, getResult }),
}));
const watchAdd = mock(async () => true);
mock.module("@/hooks/use-watch", () => ({ useWatch: () => ({ add: watchAdd }) }));
const runFolderImport = mock<() => Promise<ImportActionResult>>(async () => ({ ok: true, title: "Directory loaded", description: "root: 1 entries" }));
const runFileImport = mock<() => Promise<ImportActionResult>>(async () => ({ ok: true, title: "Graph built from file", description: "root: 1 entries" }));
const runCloudImport = mock<() => Promise<ImportActionResult>>(async () => ({ ok: true, title: "Imported from cloud", description: "cloud: 1 entries" }));
mock.module("@/lib/fewer/importActionFolder", () => ({ runFolderImport }));
mock.module("@/lib/fewer/importActionFile", () => ({ runFileImport }));
mock.module("@/lib/fewer/importActionCloud", () => ({ runCloudImport }));

const { ImportFlowDialog } = await import("@/components/fewer/ImportFlowDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function renderDialog(props?: { open?: boolean; initialOrigin?: "folder" | "file" | "url" | "cloud" }) {
  const onOpenChange = mock(() => {});
  render(
    <ImportFlowDialog open={props?.open ?? true} onOpenChange={onOpenChange} initialOrigin={props?.initialOrigin ?? "folder"} />,
  );
  return onOpenChange;
}

beforeEach(() => {
  signedIn = false;
  toast.mockClear();
  importUrl.mockClear();
  getResult.mockClear();
  getResult.mockReturnValue({ error: null, truncated: false });
  watchAdd.mockClear();
  runFolderImport.mockClear();
  runFileImport.mockClear();
  runCloudImport.mockClear();
  useGraphStore.setState({ ...initial, nodes: [], edges: [], advancedModeEnabled: false }, true);
});

afterEach(() => {
  cleanup();
  useGraphStore.setState(initial, true);
});


describe("ImportFlowDialog 3-step flow", () => {
  test("signed-out grid shows Folder and File only", () => {
    renderDialog();
    expect(screen.getByRole("radio", { name: /^folder/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^file/i })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /^url/i })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^cloud/i })).toBeNull();
  });

  test("signed-in grid shows all four origins", () => {
    useGraphStore.setState({ tier: "free" });
    renderDialog();
    expect(screen.getByRole("radio", { name: /^folder/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^file/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^url/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^cloud/i })).toBeTruthy();
  });

  test("step 1 Continue is gated on a ready file source", async () => {
    const interaction = userEvent.setup();
    renderDialog({ initialOrigin: "file" });
    expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    await interaction.type(screen.getByPlaceholderText(/root_project_folder/i), "root {{ child }}");
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(false),
    );
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    // Step 2 renders the Back + Continue row; Back is the definitive step-2 marker.
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeTruthy();
  });

  test("Back from step 2 preserves the typed file source", async () => {
    const interaction = userEvent.setup();
    renderDialog({ initialOrigin: "file" });
    await interaction.type(screen.getByPlaceholderText(/root_project_folder/i), "root {{ kept }}");
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
    await interaction.click(screen.getByRole("button", { name: /Back/ }));
    // Back to step 1 — the file textarea still holds the typed content.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("kept");
  });
});

describe("ImportFlowDialog state and step-3 import", () => {
  test("basic mode resets advanced options to defaults on open", () => {
    useGraphStore.setState({ advancedModeEnabled: false });
    const { rerender, unmount } = render(
      <ImportFlowDialog open={false} onOpenChange={() => {}} initialOrigin="folder" />,
    );
    useGraphStore.setState({
      importOptions: {
        ...useGraphStore.getState().importOptions,
        includeHidden: true,
        caseSensitiveExtensions: true,
      },
    });
    rerender(<ImportFlowDialog open={true} onOpenChange={() => {}} initialOrigin="folder" />);
    expect(useGraphStore.getState().importOptions.includeHidden).toBe(false);
    expect(useGraphStore.getState().importOptions.caseSensitiveExtensions).toBe(false);
    unmount();
  });

  test("step-3 folder summary shows No limit for unlimited depths", async () => {
    const interaction = userEvent.setup();
    useGraphStore.setState({
      importOptions: { ...useGraphStore.getState().importOptions, maxDepth: 0, displayMaxDepth: 0 },
    });
    renderDialog();
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    // Step 3 renders the Browse action button.
    expect(screen.getByRole("button", { name: /^(?:browse|import)$/i })).toBeTruthy();
    // Two "No limit" cells: scan depth + display depth summary rows.
    expect(screen.getAllByText("No limit").length).toBeGreaterThan(0);
  });

  test("folder import success toasts and closes the dialog", async () => {
    const interaction = userEvent.setup();
    const onOpenChange = renderDialog();
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    // Step-3 primary button label is origin-aware ("Browse" for folder), so match
    // on import intent rather than the literal "Import" word.
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(runFolderImport).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Directory loaded" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("folder picker cancel keeps step 3 with no error", async () => {
    const interaction = userEvent.setup();
    runFolderImport.mockResolvedValueOnce({ ok: false, cancelled: true, title: "Import cancelled" });
    renderDialog();
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(runFolderImport).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
  });

  test("failed file import shows the inline error and stays open", async () => {
    const interaction = userEvent.setup();
    const onOpenChange = renderDialog({ initialOrigin: "file" });
    runFileImport.mockResolvedValueOnce({ ok: false, title: "Import failed", error: "Bad script" });
    await interaction.type(screen.getByPlaceholderText(/root_project_folder/i), "root {{ child }}");
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(screen.getByText("Bad script")).toBeTruthy());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test("successful url import requests a watch before closing", async () => {
    const interaction = userEvent.setup();
    useGraphStore.setState({ tier: "free" });
    renderDialog({ initialOrigin: "url" });
    // URL source renders a single URL input (placeholder), not a tabbed row.
    const urlInput = screen.getByPlaceholderText(/https:\/\//i);
    await interaction.type(urlInput, "https://example.com/list/");
    // Watch toggle appears once the URL is non-empty and not a GitHub repo.
    // Scope to the first switch (URL source) — the hidden options panel has others.
    await fireEvent.click(screen.getAllByRole("switch")[0]);
    expect((screen.getAllByRole("switch")[0] as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(importUrl).toHaveBeenCalledWith("https://example.com/list/", expect.anything()));
    await waitFor(() =>
      expect(watchAdd).toHaveBeenCalledWith("https://example.com/list/"),
    );
  });

  test("Enter on step 2 advances to step 3", async () => {
    const interaction = userEvent.setup();
    renderDialog();
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    // Step 2 renders Back + Continue; step 3 renders Back + Browse/Import.
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    });
    // Continue should be gone once step 3 renders.
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^(?:browse|import)$/i })).toBeTruthy();
  });
});
