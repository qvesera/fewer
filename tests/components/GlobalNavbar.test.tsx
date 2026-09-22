/**
 * GlobalNavbar account dropdown test.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toast = mock(() => {});
const signOut = mock(async () => ({ error: null }));
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "ada@example.com", user_metadata: {} }, session: { user: { id: "u1" } }, loading: false }),
}));
mock.module("@/lib/supabase", () => ({
  getBrowserSupabase: () => ({ auth: { signOut } }),
}));

const { GlobalNavbar } = await import("@/components/fewer/GlobalNavbar");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function renderNavbar() {
  act(() => useGraphStore.setState({ ...initial }));
  return render(<GlobalNavbar />);
}

beforeEach(() => {
  toast.mockClear();
  signOut.mockClear();
  useGraphStore.setState({ ...initial });
});

afterEach(cleanup);

describe("GlobalNavbar account dropdown", () => {
  test("avatar with initials renders in trigger", async () => {
    renderNavbar();
    const user = userEvent.setup();
    const trigger = screen.getByLabelText("Account menu");
    await user.click(trigger);
    expect(trigger.textContent).toContain("A"); // "ada@example.com" → "A"
  });

  test("dropdown shows account row, saved graphs, and sign out", async () => {
    renderNavbar();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Account menu"));
    expect(screen.getByText("Your saved graphs")).toBeDefined();
    expect(screen.getByText("Sign out")).toBeDefined();
  });

  test("sign out calls supabase.auth.signOut and shows toast", async () => {
    renderNavbar();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Account menu"));
    await user.click(screen.getByText("Sign out"));
    await new Promise((r) => setTimeout(r, 10));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ title: "Signed out" });
  });

  test("account row dispatches fewer-open-settings-account event", async () => {
    const events: string[] = [];
    window.addEventListener("fewer-open-settings-account", () => events.push("open"));
    renderNavbar();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Account menu"));
    // Click the identity/account settings row
    await user.click(screen.getByTestId("account-settings"));
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toContain("open");
    window.removeEventListener("fewer-open-settings-account", () => {});
  });

  test("billing row hidden when NEXT_PUBLIC_BILLING_ENABLED is not set", async () => {
    renderNavbar();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Account menu"));
    expect(screen.queryByText("Upgrade to Pro")).toBeNull();
    expect(screen.queryByText("Manage subscription")).toBeNull();
  });
});
