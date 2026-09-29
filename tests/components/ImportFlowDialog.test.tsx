import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportActionResult } from "@/lib/fewer/importFlow";

// Mock boundaries, not the dialog steps or the Zustand store.
const toast = mock(() => {});
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
const runArchiveImport = mock<() => Promise<ImportActionResult>>(async () => ({ ok: true, title: "Graph built from archive", description: "backup.zip: 1 entries" }));
mock.module("@/lib/fewer/importActionFolder", () => ({ runFolderImport }));
mock.module("@/lib/fewer/importActionFile", () => ({ runFileImport }));
mock.module("@/lib/fewer/importActionCloud", () => ({ runCloudImport }));
mock.module("@/lib/fewer/importActionArchive", () => ({ runArchiveImport }));

const { ImportFlowDialog } = await import("@/components/fewer/ImportFlowDialog");
const { useGraphStore } = await import("@/store/graphStore");
const { formatBytes } = await import("@/lib/fewer/stats");
const { DEFAULT_IMPORT_OPTIONS } = await import("@/lib/fewer/importOptions");
const initial = useGraphStore.getInitialState();

function renderDialog(props?: { open?: boolean; initialOrigin?: "folder" | "file" | "archive" | "url" | "cloud" }) {
  const onOpenChange = mock(() => {});
  render(
    <ImportFlowDialog open={props?.open ?? true} onOpenChange={onOpenChange} initialOrigin={props?.initialOrigin ?? "folder"} />,
  );
  return onOpenChange;
}

beforeEach(() => {
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
  test("signed-out grid shows the local-only origins", () => {
    renderDialog();
    expect(screen.getByRole("radio", { name: /^folder/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^file/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^archive/i })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /^url/i })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^cloud/i })).toBeNull();
  });

  test("signed-in grid shows all five origins", () => {
    useGraphStore.setState({ tier: "free" });
    renderDialog();
    expect(screen.getByRole("radio", { name: /^folder/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^file/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^archive/i })).toBeTruthy();
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

  test("archive origin gates step 1 on a chosen file and imports it", async () => {
    const interaction = userEvent.setup();
    const onOpenChange = renderDialog({ initialOrigin: "archive" });
    // No file yet: Continue stays disabled on the source step.
    expect(
      (screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const bytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([bytes], "backup.zip")] },
      });
    });
    expect(screen.getByText("backup.zip")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Continue/ }) as HTMLButtonElement).disabled,
    ).toBe(false);

    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    // Step 3's summary names the archive and its size as the source.
    expect(screen.getByText(`backup.zip (${formatBytes(22)})`)).toBeTruthy();
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(runArchiveImport).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("a failed archive import shows the inline error and stays open", async () => {
    const interaction = userEvent.setup();
    const onOpenChange = renderDialog({ initialOrigin: "archive" });
    runArchiveImport.mockResolvedValueOnce({
      ok: false,
      title: "Archive import failed",
      error: "Not a zip, tar, or .tar.gz archive.",
    });
    const bytes = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File([bytes], "bundle.7z")] },
      });
    });
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() =>
      expect(screen.getByText("Not a zip, tar, or .tar.gz archive.")).toBeTruthy(),
    );
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

  test("Look Inside Archives is hidden in basic mode", async () => {
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.queryByLabelText(/Look Inside Archives/i)).toBeNull();
  });

  test("Look Inside Archives is present in advanced mode, off by default", async () => {
    // advancedImportFormats is a tier capability (granted at "free").
    useGraphStore.setState({ tier: "free" });
    const interaction = userEvent.setup();
    renderDialog();
    await interaction.click(screen.getByRole("button", { name: /Continue/ }));

    const toggle = await screen.findByLabelText(/Look Inside Archives/i);
    expect(toggle.getAttribute("data-state")).toBe("unchecked");

    await interaction.click(toggle);
    expect(
      screen.getByLabelText(/Look Inside Archives/i).getAttribute("data-state"),
    ).toBe("checked");
  });

  test("basic mode clamps a saved expandArchives preference back off", async () => {
    // A value synced from the cloud must not leak into an import whose switch
    // the user cannot see or change.
    useGraphStore.setState({
      importOptions: { ...DEFAULT_IMPORT_OPTIONS, expandArchives: true },
    });
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: /Continue/ }));

    expect(useGraphStore.getState().importOptions.expandArchives).toBe(false);
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

/** Step 1 → 2 → 3, leaving the dialog on the summary with the import button. */
async function gotoStep3(interaction: ReturnType<typeof userEvent.setup>) {
  await interaction.click(screen.getByRole("button", { name: /Continue/ }));
  await interaction.click(screen.getByRole("button", { name: /Continue/ }));
}

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("ImportFlowDialog import progress", () => {
  test("a determinate phase shows the percentage and aria-valuenow", async () => {
    const interaction = userEvent.setup();
    // Report progress from inside the action, then stay pending.
    runFolderImport.mockImplementationOnce(async (_options, _dropped, onProgress) => {
      onProgress?.({ phase: "Reading folder", processed: 250, total: 1000 });
      await new Promise(() => {});
      return { ok: true, title: "never" };
    });

    renderDialog();
    await gotoStep3(interaction);
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: /import progress/i })).toBeTruthy(),
    );
    expect(screen.getByText("Reading folder")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: /import progress/i }).getAttribute("aria-valuenow"),
    ).toBe("25");
  });

  test("a phase without a total stays indeterminate (no percentage)", async () => {
    const interaction = userEvent.setup();
    runFolderImport.mockImplementationOnce(async (_options, _dropped, onProgress) => {
      onProgress?.({ phase: "Finishing up" });
      await new Promise(() => {});
      return { ok: true, title: "never" };
    });

    renderDialog();
    await gotoStep3(interaction);
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));

    await waitFor(() => expect(screen.getByText("Finishing up")).toBeTruthy());
    const bar = screen.getByRole("progressbar", { name: /import progress/i });
    // Radix omits aria-valuenow when value is undefined — that IS the ARIA
    // contract for an indeterminate progressbar.
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  test("the bar and phase disappear once the import finishes", async () => {
    const interaction = userEvent.setup();
    runFolderImport.mockImplementationOnce(async (_options, _dropped, onProgress) => {
      onProgress?.({ phase: "Reading folder", processed: 5, total: 10 });
      return { ok: true, title: "Directory loaded", description: "root: 1 entries" };
    });

    renderDialog();
    await gotoStep3(interaction);
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).toBeNull(),
    );
  });
});

describe("ImportFlowDialog closing mid-import", () => {
  test("the dialog closes while an import is in flight and drops the late result", async () => {
    const interaction = userEvent.setup();
    const run = deferred<ImportActionResult>();
    runFolderImport.mockImplementationOnce(async () => run.promise);

    const onOpenChange = renderDialog();
    await gotoStep3(interaction);
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeTruthy());

    // Close mid-import: this used to be refused outright, which wedged the app
    // whenever a picker cancelled and left the promise pending forever.
    await interaction.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // The orphaned run resolves after the close — it must stay inert.
    await act(async () => {
      run.resolve({ ok: true, title: "Directory loaded", description: "root: 1 entries" });
      await run.promise;
    });
    expect(toast).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(true);
  });

  test("late progress from an orphaned run never reappears", async () => {
    const interaction = userEvent.setup();
    const run = deferred<ImportActionResult>();
    runFolderImport.mockImplementationOnce(
      async (_options, _dropped, onProgress) => {
        const settled = await run.promise;
        // Fires AFTER the dialog was closed: the run token must swallow it.
        onProgress?.({ phase: "Building graph", processed: 1, total: 2 });
        return settled;
      },
    );

    renderDialog();
    await gotoStep3(interaction);
    await interaction.click(screen.getByRole("button", { name: /^(?:browse|import)$/i }));
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeTruthy());

    await interaction.click(screen.getByRole("button", { name: /^close$/i }));
    // Closing clears the spinner and the bar immediately.
    expect(screen.queryByRole("progressbar")).toBeNull();

    await act(async () => {
      run.resolve({ ok: true, title: "Directory loaded" });
      await run.promise;
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("Building graph")).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });
});
