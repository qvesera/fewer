/**
 * Characterization suite for ShortcutsDialog.
 * Verifies group rendering, signed-in gating, feature-flag gating,
 * and modifier-key label switching (Mac vs non-Mac).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";

let signedIn = false;
let isMacVal = false;

mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: signedIn ? { id: "u1", email: "a@b.com" } : null,
    loading: false,
  }),
}));
mock.module("@/lib/fewer/platform", () => ({ isMac: () => isMacVal }));

const { ShortcutsDialog } = await import("@/components/fewer/ShortcutsDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function seedStore(open = true) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      shortcutsOpen: open,
      nodes: [],
      edges: [],
      tags: [],
    }),
  );
}
function state() {
  return useGraphStore.getState();
}
function bodyText() {
  return document.body.textContent || "";
}

beforeEach(() => {
  signedIn = false;
  isMacVal = false;
  document.body.innerHTML = "";
  seedStore();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("ShortcutsDialog rendering", () => {
  test("renders when shortcutsOpen is true", () => {
    render(<ShortcutsDialog />);
    expect(bodyText()).toContain("Keyboard Shortcuts");
  });

  test("renders nothing when shortcutsOpen is false", () => {
    seedStore(false);
    const { container } = render(<ShortcutsDialog />);
    expect(container.textContent).toBe("");
  });

  test("renders all four shortcut groups", () => {
    render(<ShortcutsDialog />);
    expect(bodyText()).toContain("General");
    expect(bodyText()).toContain("Selection & Cards");
    expect(bodyText()).toContain("Clipboard & History");
    expect(bodyText()).toContain("Navigation & View");
  });

  test("renders expected shortcuts in General group", () => {
    render(<ShortcutsDialog />);
    expect(bodyText()).toContain("Open search panel");
    expect(bodyText()).toContain("Fit graph to viewport");
    expect(bodyText()).toContain("Zoom in");
  });

  test("renders Copy shortcut in Clipboard group", () => {
    render(<ShortcutsDialog />);
    expect(bodyText()).toContain("Copy selected cards");
    expect(bodyText()).toContain("Paste cards");
    expect(bodyText()).toContain("Undo");
  });
});

describe("ShortcutsDialog signed-in gating", () => {
  test("signedInOnly shortcut visible when signed in", async () => {
    signedIn = true;
    render(<ShortcutsDialog />);
    await waitFor(() => {
      expect(bodyText()).toContain("Save current graph");
    });
  });

  test("signedInOnly shortcut hidden when signed out", () => {
    signedIn = false;
    render(<ShortcutsDialog />);
    expect(bodyText()).not.toContain("Save current graph");
  });
});

describe("ShortcutsDialog feature-flag gating", () => {
  test("feature-gated shortcuts are hidden when flags are off", () => {
    render(<ShortcutsDialog />);
    // LOCAL_FS_FEATURES.openInOs is false → Open in File Explorer should be hidden
    expect(bodyText()).not.toContain("Open in File Explorer");
  });
});

describe("ShortcutsDialog modifier labels", () => {
  test("non-Mac shows Ctrl label", () => {
    isMacVal = false;
    render(<ShortcutsDialog />);
    // Ctrl+I opens shortcuts — "Ctrl" label should appear
    expect(bodyText()).toContain("Ctrl");
  });

  test("Mac shows ⌘ label", () => {
    isMacVal = true;
    render(<ShortcutsDialog />);
    expect(bodyText()).toContain("⌘");
  });
});
