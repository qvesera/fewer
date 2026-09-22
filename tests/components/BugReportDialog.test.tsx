import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

// Mock toast
const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const originalFetch = globalThis.fetch;
const originalOpen = window.open;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let clipboardData = "";
let clipboardReject = false;
let clickCaptured = false;

function stubClipboard() {
  clipboardData = "";
  clipboardReject = false;
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: mock(async (text: string) => {
        if (clipboardReject) throw new Error("Clipboard not available");
        clipboardData = text;
      }),
    },
    configurable: true,
  });
}

function stubFetch() {
  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as any;
}

function stubDownload() {
  clickCaptured = false;
  URL.createObjectURL = mock(() => "blob:fake") as any;
  URL.revokeObjectURL = mock(() => {}) as any;
  // Capture a.click()
  const origCreateElement = document.createElement.bind(document);
  document.createElement = ((tag: string) => {
    const el = origCreateElement(tag);
    if (tag === "a") {
      const origClick = el.click.bind(el);
      el.click = () => { clickCaptured = true; origClick(); };
    }
    return el;
  }) as any;
}

// Import after mocks
const { BugReportDialog } = await import("@/components/fewer/BugReportDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function openDialog() {
  act(() => useGraphStore.setState({
    bugReportOpen: true,
    nodes: [
      { id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "src", path: "/src", type: "folder" } },
      { id: "n2", type: "file", position: { x: 0, y: 100 }, data: { label: "index.ts", path: "/src/index.ts", type: "file" } },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  }));
}

beforeEach(() => {
  toast.mockClear();
  stubClipboard();
  stubFetch();
  stubDownload();
  window.open = mock(() => {}) as any;
  process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = undefined;
  useGraphStore.setState({ ...initial, bugReportOpen: false, nodes: [], edges: [] });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.open = originalOpen;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("BugReportDialog", () => {
  test("renders nothing when closed", () => {
    const { container } = render(<BugReportDialog />);
    expect(container.innerHTML).toBe("");
  });

  test("renders diagnostics preview when open", () => {
    openDialog();
    render(<BugReportDialog />);
    expect(screen.getByText("Report a Bug")).toBeDefined();
    expect(screen.getByText("Auto-collected diagnostics")).toBeDefined();
    // Cards / Edges: nodes.length / edges.length (split across elements)
    expect(screen.getByText("Cards / Connections")).toBeDefined();
  });

  test("Submit to GitHub disabled until title typed", async () => {
    openDialog();
    render(<BugReportDialog />);
    const submitBtn = screen.getByText("Submit to GitHub");
    expect(submitBtn.closest("button")!.disabled).toBe(true);
    // Type title
    const titleInput = screen.getByPlaceholderText("e.g. Cards overlap when switching to LR layout");
    await import("@testing-library/user-event").then(async (m) => {
      const user = m.default.setup();
      await user.type(titleInput, "Test bug");
    });
    await waitFor(() => {
      expect(submitBtn.closest("button")!.disabled).toBe(false);
    });
    // Click opens window
    submitBtn.closest("button")!.click();
    await waitFor(() => {
      expect(window.open).toHaveBeenCalled();
    });
  });

  test("Copy URL toasts success", async () => {
    openDialog();
    render(<BugReportDialog />);
    // Type title to enable Copy URL
    const titleInput = screen.getByPlaceholderText("e.g. Cards overlap when switching to LR layout");
    await import("@testing-library/user-event").then(async (m) => {
      const user = m.default.setup();
      await user.type(titleInput, "My bug");
    });
    await waitFor(() => {
      expect(screen.getByText("Copy URL")).toBeDefined();
    });
    screen.getByText("Copy URL").closest("button")!.click();
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.title === "GitHub URL copied")).toBe(true);
    });
  });

  test("Copy JSON copies report to clipboard", async () => {
    openDialog();
    render(<BugReportDialog />);
    // Copy button (labeled "Copy" with icon)
    const copyButtons = screen.getAllByText("Copy");
    // The JSON copy button is the one without "URL"
    const copyBtn = copyButtons.find((el) => !el.textContent?.includes("URL"));
    expect(copyBtn).toBeDefined();
    copyBtn!.closest("button")!.click();
    await waitFor(() => {
      expect(clipboardData).toContain("\"bug\"");
      expect(clipboardData).toContain("title");
    });
  });

  test("Copy JSON shows destructive toast on clipboard failure", async () => {
    clipboardReject = true;
    openDialog();
    render(<BugReportDialog />);
    const copyButtons = screen.getAllByText("Copy");
    const copyBtn = copyButtons.find((el) => !el.textContent?.includes("URL"));
    copyBtn!.closest("button")!.click();
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.title === "Could not copy" && c.variant === "destructive")).toBe(true);
    });
  });

  test("Download creates blob anchor", async () => {
    openDialog();
    render(<BugReportDialog />);
    screen.getByText("Download").closest("button")!.click();
    await waitFor(() => {
      expect(clickCaptured).toBe(true);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  test("Email submit with no key shows destructive toast", async () => {
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = undefined;
    openDialog();
    render(<BugReportDialog />);
    // Type title
    const titleInput = screen.getByPlaceholderText("e.g. Cards overlap when switching to LR layout");
    await import("@testing-library/user-event").then(async (m) => {
      const user = m.default.setup();
      await user.type(titleInput, "Bug");
    });
    // Click Submit to GitHub to reveal Send via Email
    await waitFor(() => {
      screen.getByText("Submit to GitHub").closest("button")!.click();
    });
    await waitFor(() => {
      expect(screen.getByText("Send via Email")).toBeDefined();
    });
    screen.getByText("Send via Email").closest("button")!.click();
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.variant === "destructive")).toBe(true);
    });
  });

  test("Email submit with key POSTs and toasts success", async () => {
    process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY = "test-key-123";
    openDialog();
    render(<BugReportDialog />);
    const titleInput = screen.getByPlaceholderText("e.g. Cards overlap when switching to LR layout");
    await import("@testing-library/user-event").then(async (m) => {
      const user = m.default.setup();
      await user.type(titleInput, "Bug report");
    });
    await waitFor(() => {
      screen.getByText("Submit to GitHub").closest("button")!.click();
    });
    await waitFor(() => {
      screen.getByText("Send via Email").closest("button")!.click();
    });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.title === "Bug report sent!")).toBe(true);
    });
  });
});
