import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock boundaries, not the dialog controls, inputs or Zustand actions.
let signedIn = false;
let mobile = false;
const user = { id: "test-user", email: "ada@example.org" };
const toast = mock(() => {});
mock.module("@/hooks/use-auth", () => ({ useAuth: () => ({ user: signedIn ? user : null, loading: false }) }));
mock.module("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile }));
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const originalFetch = globalThis.fetch;
const requests: { url: string; init?: RequestInit }[] = [];
let saveFails = false;
let deleteFails = false;
// Delete-account signs out via Supabase after scheduling; updateUser is the
// change-email path (not under test, but the dialog imports the client).
const signOut = mock(async () => ({ error: null }));
// bun's mock.module registry is process-wide: spread the real modules so later
// test files retain the full export shape (CustomNode imports fileOps; see
// layoutSlice.test.ts note for the rationale).
const actualSupabase = await import("@/lib/supabase");
mock.module("@/lib/supabase", () => ({
  ...actualSupabase,
  getBrowserSupabase: () => ({ auth: { signOut, updateUser: async () => ({ error: null }) } }),
}));
mock.module("@/components/fewer/WatchedIndexesPanel", () => ({ WatchedIndexesPanel: () => <div>Watched indexes</div> }));
const { SettingsDialog } = await import("@/components/fewer/SettingsDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

beforeEach(() => {
  signedIn = false;
  mobile = false;
  saveFails = false;
  deleteFails = false;
  toast.mockClear();
  signOut.mockClear();
  requests.length = 0;
  localStorage.clear();
  useGraphStore.setState({ ...initial, settingsOpen: true, advancedModeEnabled: false, themeMode: "dark", nodes: [], edges: [], tier: "guest" }, true);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "/api/account") return Response.json(deleteFails ? { error: "Too many requests" } : {}, { status: deleteFails ? 429 : 200 });
    if (url !== "/api/profile") throw new Error(`Unexpected fetch: ${url}`);
    if (init?.method === "PUT") return Response.json(saveFails ? { error: "Username taken" } : {}, { status: saveFails ? 409 : 200 });
    return Response.json({ profile: { first_name: "Ada", last_name: "Lovelace", username: "ada", plan: "free" }, counts: { savedGraphs: 1, watchedIndexes: 0 } });
  }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  useGraphStore.setState(initial, true);
  localStorage.clear();
});

async function openAccount() {
  signedIn = true;
  useGraphStore.setState({ tier: "free" });
  render(<SettingsDialog />);
  act(() => window.dispatchEvent(new Event("fewer-open-settings-account")));
  await waitFor(() => expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Ada"));
}

describe("Settings dialog interactions", () => {
  test("keyboard tabs and Escape close use real controls", async () => {
    const interaction = userEvent.setup();
    render(<SettingsDialog />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Account", "About", "Appearance", "Advanced", "Help"]);
    act(() => screen.getByRole("tab", { name: "Appearance" }).focus());
    await interaction.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Advanced" }).getAttribute("aria-selected")).toBe("true"));
    await interaction.keyboard("{Escape}");
    expect(useGraphStore.getState().settingsOpen).toBe(false);
  });

  test("mobile signed-out tabs hide Advanced; signed-in tabs include Cloud", () => {
    mobile = true;
    const mounted = render(<SettingsDialog />);
    expect(screen.queryByRole("tab", { name: "Advanced" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Cloud" })).toBeNull();
    signedIn = true;
    useGraphStore.setState({ tier: "free" });
    mounted.rerender(<SettingsDialog />);
    expect(screen.getByRole("tab", { name: "Cloud" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Watched" })).toBeTruthy();
  });

  test("theme buttons persist through real store actions", async () => {
    const interaction = userEvent.setup();
    render(<SettingsDialog />);
    for (const mode of ["light", "dark"]) {
      await interaction.click(screen.getByRole("button", { name: mode }));
      expect(useGraphStore.getState().themeMode).toBe(mode);
      expect(localStorage.getItem("fewer-theme")).toBe(mode);
    }
  });
});


describe("Account profile interactions", () => {
  test("account event loads profile; save normalizes fields and clears dirty state", async () => {
    await openAccount();
    expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ADA_NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("ada_new"));
    const put = requests.find((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body))).toEqual({ first_name: "Ada", last_name: "Lovelace", username: "ada_new" });
    expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(true);
    expect(toast).toHaveBeenCalledWith({ title: "Profile updated" });
  });

  test("invalid username reports error without sending PUT", async () => {
    await openAccount();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bad@name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(requests.filter((request) => request.init?.method === "PUT")).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save profile", variant: "destructive" }));
  });

  test("failed save retains edits and enables retry", async () => {
    await openAccount();
    saveFails = true;
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "another" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Username taken" })));
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("another");
    expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("unmount removes account-event listener", () => {
    const mounted = render(<SettingsDialog />);
    mounted.unmount();
    useGraphStore.setState({ settingsOpen: false });
    window.dispatchEvent(new Event("fewer-open-settings-account"));
    expect(useGraphStore.getState().settingsOpen).toBe(false);
  });
});

describe("Account danger zone", () => {
  test("confirmed deletion calls the API, signs out, and closes the dialog", async () => {
    await openAccount();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Deletion scheduled" })));
    const del = requests.find((request) => request.init?.method === "DELETE");
    expect(del?.url).toBe("/api/account");
    expect(signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useGraphStore.getState().settingsOpen).toBe(false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("cancelling the confirmation sends no request", async () => {
    await openAccount();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(requests.filter((request) => request.url === "/api/account")).toEqual([]);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(useGraphStore.getState().settingsOpen).toBe(true);
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Deletion scheduled" }));
  });

  test("failed deletion surfaces the server error and keeps the dialog open", async () => {
    deleteFails = true;
    await openAccount();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not delete account", description: "Too many requests", variant: "destructive" })));
    expect(signOut).not.toHaveBeenCalled();
    expect(useGraphStore.getState().settingsOpen).toBe(true);
    const retry = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete my account" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });
});

describe("Advanced tab controls", () => {
  async function openAdvanced(enabled = true) {
    signedIn = true;
    useGraphStore.setState({ advancedModeEnabled: enabled, tier: enabled ? "free" : "guest", maxDisplayDepth: 6, autoHideThreshold: 10, scrollAction: "pan" });
    const mounted = render(<SettingsDialog />);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Advanced" }));
    expect(screen.getByRole("tab", { name: "Advanced" }).getAttribute("aria-selected")).toBe("true");
    return mounted;
  }

  // Existing labels are visual, not associated with the Radix thumbs. Scope
  // each query to its control row; don't mistake another unnamed slider for it.
  function slider(label: string) {
    const row = screen.getByText(label, { selector: "label" }).closest(".space-y-2");
    if (!row) throw new Error(`Missing slider row: ${label}`);
    return within(row as HTMLElement).getByRole("slider");
  }

  test("advanced sliders commit through real store actions", async () => {
    await openAdvanced();
    fireEvent.keyDown(slider("Max Depth"), { key: "ArrowRight" });
    expect(useGraphStore.getState().maxDisplayDepth).toBe(7);
    fireEvent.keyDown(slider("Auto-hide Limit"), { key: "ArrowLeft" });
    expect(useGraphStore.getState().autoHideThreshold).toBe(9);
    fireEvent.keyDown(slider("Width"), { key: "ArrowRight" });
    expect(useGraphStore.getState().nodeWidth).toBe(initial.nodeWidth + 10);
  });

  test("scroll-to-zoom switch toggles the store action", async () => {
    await openAdvanced();
    // Query by name: the Advanced tab has more than one switch (Auto-relayout
    // lives in Layout Policy), and "the only switch" is not a contract.
    const control = screen.getByRole("switch", { name: "Scroll to Zoom" });
    fireEvent.click(control);
    expect(useGraphStore.getState().scrollAction).toBe("zoom");
    expect(control.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(control);
    expect(useGraphStore.getState().scrollAction).toBe("pan");
  });

  test("auto-relayout switch toggles the store flag", async () => {
    await openAdvanced();
    const control = screen.getByRole("switch", { name: "Auto-relayout" });
    expect(control.getAttribute("aria-checked")).toBe("true"); // default on
    fireEvent.click(control);
    expect(useGraphStore.getState().autoRelayout).toBe(false);
    expect(control.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(control);
    expect(useGraphStore.getState().autoRelayout).toBe(true);
  });

  test("mobile retains advanced layout controls but hides canvas navigation", async () => {
    mobile = true;
    await openAdvanced();
    expect(screen.getByText("Layout Policy")).toBeTruthy();
    expect(screen.queryByText("Canvas Navigation")).toBeNull();
    // Layout Policy keeps its own switch on mobile; only the desktop
    // Canvas Navigation card goes away.
    expect(screen.getByRole("switch", { name: "Auto-relayout" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Scroll to Zoom" })).toBeNull();
  });

  test("basic mode hides layout policy and card metrics, not desktop navigation", async () => {
    await openAdvanced(false);
    expect(screen.queryByText("Layout Policy")).toBeNull();
    expect(screen.queryByText("Card Metrics")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByText("Canvas Navigation")).toBeTruthy();
  });
});
