import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock boundaries, not the dialog controls, inputs or Zustand actions.
let signedIn = false;
let mobile = false;
const user = { id: "test-user", email: "ada@example.org" };
const toast = mock(() => {});
mock.module("@/hooks/use-auth", () => ({ useAuth: () => ({ user: signedIn ? user : null, loading: false }) }));
mock.module("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile }));
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
mock.module("@/lib/supabase", () => ({ getBrowserSupabase: () => { throw new Error("Unexpected Supabase call"); } }));
// Unrelated cloud/editor subsystems are not under test.
mock.module("@/components/fewer/index", () => ({ ThemeEditorDialog: () => null, Logo: () => null, CloudPanel: () => null }));
mock.module("@/components/fewer/WatchedIndexesPanel", () => ({ WatchedIndexesPanel: () => <div>Watched indexes</div> }));
const { SettingsDialog } = await import("@/components/fewer/SettingsDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();
const originalFetch = globalThis.fetch;
const requests: { url: string; init?: RequestInit }[] = [];
let saveFails = false;

beforeEach(() => {
  signedIn = false;
  mobile = false;
  saveFails = false;
  toast.mockClear();
  requests.length = 0;
  localStorage.clear();
  useGraphStore.setState({ ...initial, settingsOpen: true, advancedModeEnabled: false, themeMode: "dark", nodes: [], edges: [] }, true);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
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
