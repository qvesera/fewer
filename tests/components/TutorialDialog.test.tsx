/**
 * Characterization suite for TutorialDialog.
 * Tests state transitions through the store + portal renders.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const { TutorialDialog } = await import("@/components/fewer/TutorialDialog");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

function seedStore(extra: Record<string, any> = {}) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      tutorialBeginnerDone: [],
      tutorialDismissed: false,
      tutorialDemoStep: 0,
      nodes: [], edges: [], tags: [],
      ...extra,
    }),
  );
}
function state() { return useGraphStore.getState(); }
function bodyText() { return document.body.textContent || ""; }
function clickByText(text: string) {
  const btn = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim().includes(text),
  );
  if (btn) btn.click();
  return btn;
}

beforeEach(() => { toast.mockClear(); document.body.innerHTML = ""; seedStore(); });
afterEach(() => { cleanup(); document.body.innerHTML = ""; });

describe("TutorialDialog rendering", () => {
  test("renders welcome screen when not dismissed", async () => {
    render(<TutorialDialog />);
    await waitFor(() => {
      expect(bodyText()).toContain("Start Tutorial");
    });
  });

  test("dismissed + restartKey=0 → renders nothing", () => {
    seedStore({ tutorialDismissed: true });
    const { container } = render(<TutorialDialog />);
    expect(container.textContent).toBe("");
  });

  test("dismissed + restartKey > 0 → resets and renders", async () => {
    seedStore({ tutorialDismissed: true });
    render(<TutorialDialog restartKey={1} />);
    await waitFor(() => {
      expect(bodyText()).toContain("Start Tutorial");
    });
    expect(state().tutorialDismissed).toBe(false);
  });
});

describe("TutorialDialog actions", () => {
  test("Explore on my own → dismisses", async () => {
    render(<TutorialDialog />);
    await waitFor(() => expect(bodyText()).toContain("Start Tutorial"));
    clickByText("Explore on my own");
    expect(state().tutorialDismissed).toBe(true);
  });

  test("Start Tutorial → shows checklist, Skip tutorial visible", async () => {
    render(<TutorialDialog />);
    await waitFor(() => expect(bodyText()).toContain("Start Tutorial"));
    clickByText("Start Tutorial");
    await waitFor(() => {
      expect(bodyText()).toContain("Skip tutorial");
    });
  });

  test("Skip tutorial → dismisses", async () => {
    render(<TutorialDialog />);
    await waitFor(() => expect(bodyText()).toContain("Start Tutorial"));
    clickByText("Start Tutorial");
    await waitFor(() => expect(bodyText()).toContain("Skip tutorial"));
    clickByText("Skip tutorial");
    expect(state().tutorialDismissed).toBe(true);
  });

  test("restartKey > 0 resets tutorial state", () => {
    seedStore({ tutorialDismissed: true, tutorialBeginnerDone: ["step1"] });
    const { rerender } = render(<TutorialDialog restartKey={0} />);
    expect(state().tutorialDismissed).toBe(true);
    rerender(<TutorialDialog restartKey={1} />);
    expect(state().tutorialDismissed).toBe(false);
    expect(state().tutorialBeginnerDone).toEqual([]);
  });
});
