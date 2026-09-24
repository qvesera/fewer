import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock boundaries — auth, profile, toast, and fetch.
let signedIn = false;
let profileData = { first_name: "", last_name: "", username: "", plan: "free" as const };
const toast = mock(() => {});
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: signedIn ? { id: "test-user", email: "ada@example.org" } : null,
    loading: false,
  }),
}));
const actualUseProfile = await import("@/hooks/use-profile");
mock.module("@/hooks/use-profile", () => ({
  ...actualUseProfile,
  useProfile: () => profileData,
}));
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const originalFetch = globalThis.fetch;
let requests: { url: string; init?: RequestInit }[] = [];
let fetchResponses: Record<string, { status: number; body: unknown }> = {};

function stubFetch() {
  globalThis.fetch = Object.assign(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    requests.push({ url: u, init });
    const match = fetchResponses[u.split("?")[0]];
    return new Response(JSON.stringify(match?.body ?? {}), {
      status: match?.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }, { preconnect: () => {} }) as unknown as typeof globalThis.fetch;
}

const { ThemeEditorDialog } = await import("@/components/fewer/ThemeEditorDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function openDialog() {
  act(() => useGraphStore.setState({ themeEditorOpen: true }));
}
function signIn() {
  signedIn = true;
}

beforeEach(() => {
  signedIn = false;
  profileData = { first_name: "", last_name: "", username: "", plan: "free" };
  toast.mockClear();
  requests = [];
  fetchResponses = {};
  stubFetch();
  useGraphStore.setState({ ...initial, themeEditorOpen: false, customTheme: initial.customTheme });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("ThemeEditorDialog", () => {
  test("renders nothing when closed", () => {
    const { container } = render(<ThemeEditorDialog />);
    expect(container.innerHTML).toBe("");
  });

  test("renders the floating dialog when open", () => {
    openDialog();
    render(<ThemeEditorDialog />);
    expect(screen.getByText("Custom Theme")).toBeDefined();
  });

  test("minimize shows a dock pill and clicking it restores the dialog", async () => {
    const user = userEvent.setup();
    openDialog();
    render(<ThemeEditorDialog />);
    await user.click(screen.getByTitle("Minimize to dock"));
    expect(screen.getByText("Theme")).toBeDefined();
    await user.click(screen.getByText("Theme"));
    expect(screen.getByText("Custom Theme")).toBeDefined();
  });

  test("saving with an empty name shows a validation toast", async () => {
    signIn();
    openDialog();
    render(<ThemeEditorDialog />);
    await userEvent.setup().click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByText("Save to account")).toBeDefined();
    });
    await userEvent.setup().click(screen.getByText("Save to account"));
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.title === "Could not save theme")).toBe(true);
    });
  });

  test("saving with a valid name posts to /api/themes and shows success toast", async () => {
    signIn();
    fetchResponses["/api/themes"] = {
      status: 200,
      body: { theme: { id: "new-1", name: "Sunset", theme: {} } },
    };
    fetchResponses["/api/themes/share"] = { status: 200, body: { shares: [] } };
    openDialog();
    render(<ThemeEditorDialog />);
    await userEvent.setup().click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Theme name\u2026")).toBeDefined();
    });
    await userEvent.setup().type(screen.getByPlaceholderText("Theme name\u2026"), "Sunset");
    await userEvent.setup().click(screen.getByText("Save to account"));
    await waitFor(() => {
      expect(
        requests.some((r) => r.url === "/api/themes" && r.init?.method === "POST"),
      ).toBe(true);
    });
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.title === "Theme saved")).toBe(true);
    });
  });

  test("gallery profile gate fires the settings-account event when profile is incomplete", async () => {
    signIn();
    fetchResponses["/api/themes"] = {
      status: 200,
      body: { theme: { id: "new-1", name: "Test", theme: {} } },
    };
    fetchResponses["/api/themes/share"] = { status: 200, body: { shares: [] } };
    let accountEventFired = false;
    window.addEventListener("fewer-open-settings-account", () => {
      accountEventFired = true;
    });
    openDialog();
    render(<ThemeEditorDialog />);
    await userEvent.setup().click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Theme name\u2026")).toBeDefined();
    });
    await userEvent.setup().type(screen.getByPlaceholderText("Theme name\u2026"), "Gallery Theme");
    const checkbox = screen.getByRole("checkbox");
    await userEvent.setup().click(checkbox);
    await userEvent.setup().click(screen.getByText("Save & publish"));
    await waitFor(() => {
      expect(accountEventFired).toBe(true);
    });
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.title === "Profile required")).toBe(true);
    });
  });

  test("fetch error shows a destructive toast", async () => {
    signIn();
    fetchResponses["/api/themes"] = { status: 500, body: { error: "Server crashed" } };
    fetchResponses["/api/themes/share"] = { status: 200, body: { shares: [] } };
    openDialog();
    render(<ThemeEditorDialog />);
    await userEvent.setup().click(screen.getByText("Save"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Theme name\u2026")).toBeDefined();
    });
    await userEvent.setup().type(screen.getByPlaceholderText("Theme name\u2026"), "Bad Theme");
    await userEvent.setup().click(screen.getByText("Save to account"));
    await waitFor(() => {
      const calls = toast.mock.calls.flat();
      expect(calls.some((c: any) => c.variant === "destructive")).toBe(true);
    });
  });

  test("preset dropdown lists built-in presets when opened", async () => {
    openDialog();
    render(<ThemeEditorDialog />);
    await userEvent.setup().click(screen.getByText("Select a theme preset..."));
    await waitFor(() => {
      expect(screen.getByText("Catppuccin Mocha")).toBeDefined();
    });
  });
});
