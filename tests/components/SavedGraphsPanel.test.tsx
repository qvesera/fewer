import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// Mock boundaries, not the panel's steps or the Zustand store.
let signedIn = false;
const toast = mock(() => {});
const onRequireAuth = mock(() => {});
const user = { id: "test-user", email: "ada@example.org" };
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: signedIn ? user : null, loading: false }),
}));
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const actualUseProfile = await import("@/hooks/use-profile");
mock.module("@/hooks/use-profile", () => ({
  ...actualUseProfile,
  useProfile: () => ({ first_name: "Ada", last_name: "Lovelace", username: "ada" }),
}));
// OS path resolution and the snapshot builder are store-side concerns with their
// own tests; the panel only needs a stable snapshot to send.
const SNAPSHOT = { nodes: [{ id: "n1", data: { label: "root" } }], edges: [] };
// bun's mock.module registry is process-wide: a partial factory also replaces the
// module for every later test file. Spread the real module and override only the
// functions this suite stubs (CustomNode imports two others from fileOps).
const actualFileOps = await import("@/lib/fewer/fileOps");
mock.module("@/lib/fewer/fileOps", () => ({
  ...actualFileOps,
  resolveRootLocalPath: async () => {},
}));
const actualSnapshot = await import("@/lib/fewer/snapshot");
mock.module("@/lib/fewer/snapshot", () => ({
  ...actualSnapshot,
  buildSnapshot: () => SNAPSHOT,
  applySnapshot: () => {},
}));
mock.module("@/components/fewer/VersionHistoryDialog", () => ({ VersionHistoryDialog: () => null }));

const { SavedGraphsPanel } = await import("@/components/fewer/SavedGraphsPanel");
const { useGraphStore } = await import("@/store/graphStore");
const initial = useGraphStore.getInitialState();

const requests: { url: string; init?: RequestInit }[] = [];
let graphs: unknown[] = [];
let saveStatus = 200;
let saveBody: Record<string, unknown> = { id: "g-new" };
let shareStatus = 200;
let shareBody: Record<string, unknown> = { id: "s1" };
const originalFetch = globalThis.fetch;

const savedRow = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  name: "G",
  data: SNAPSHOT,
  updated_at: new Date().toISOString(),
  ...over,
});

const oneNode = [{ id: "n1", position: { x: 0, y: 0 }, data: { label: "root", type: "folder" } }];

beforeEach(() => {
  signedIn = false;
  graphs = [];
  saveStatus = 200;
  saveBody = { id: "g-new" };
  shareStatus = 200;
  shareBody = { id: "s1" };
  toast.mockClear();
  onRequireAuth.mockClear();
  requests.length = 0;
  useGraphStore.setState({ ...initial, nodes: [], edges: [] }, true);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith("/api/share?")) return Response.json({}, { status: 404 });
    if (url === "/api/share" && init?.method === "POST") return Response.json(shareBody, { status: shareStatus });
    if (url === "/api/graphs" && init?.method === "POST") return Response.json(saveBody, { status: saveStatus });
    if (url === "/api/graphs") return Response.json({ graphs });
    if (url.startsWith("/api/graphs/") && init?.method === "DELETE") return Response.json({ ok: true });
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  useGraphStore.setState(initial, true);
});

const saveButton = () => screen.getByRole("button", { name: /^Save$/ });

async function openSaveDialog() {
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByLabelText("Name")).toBeTruthy());
}

async function openShareDialog() {
  await waitFor(() => expect(screen.getByTitle("Share")).toBeTruthy());
  fireEvent.click(screen.getByTitle("Share"));
  // The invite list only renders once invite mode is chosen.
  await waitFor(() => expect(screen.getByRole("button", { name: /Invite only/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /Invite only/ }));
  await waitFor(() => expect(screen.getByLabelText("Invited emails")).toBeTruthy());
}

describe("Saved graphs panel — save path", () => {
  test("a signed-out Save asks for auth instead of saving", async () => {
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    fireEvent.click(saveButton());
    expect(onRequireAuth).toHaveBeenCalledTimes(1);
    expect(requests.filter((r) => r.init?.method === "POST")).toHaveLength(0);
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  test("an empty canvas warns instead of opening the dialog", async () => {
    signedIn = true; useGraphStore.setState({ tier: "free" });
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    fireEvent.click(saveButton());
    expect(toast).toHaveBeenCalledWith({ title: "Nothing to save", description: "Add cards to your canvas first." });
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  test("save posts the trimmed name and the snapshot, then confirms", async () => {
    signedIn = true; useGraphStore.setState({ tier: "free" });
    useGraphStore.setState({ ...initial, nodes: oneNode, edges: [], tier: "free" }, true);
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    await openSaveDialog();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  My Graph  " } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Saved", description: '"My Graph" saved to your account.' }),
    );
    const post = requests.find((r) => r.url === "/api/graphs" && r.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ name: "My Graph", data: SNAPSHOT });
  });

  test("a failed save surfaces the API message and keeps the dialog open", async () => {
    signedIn = true; useGraphStore.setState({ tier: "free" });
    saveStatus = 500;
    saveBody = { error: "Too many graphs" };
    useGraphStore.setState({ ...initial, nodes: oneNode, edges: [], tier: "free" }, true);
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    await openSaveDialog();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My Graph" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Could not save",
        description: "Too many graphs",
        variant: "destructive",
      }),
    );
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});

describe("Saved graphs panel — list actions", () => {
  test("delete removes the row once the API confirms", async () => {
    signedIn = true; useGraphStore.setState({ tier: "free" });
    graphs = [savedRow()];
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    await waitFor(() => expect(screen.getByTitle("Delete")).toBeTruthy());
    fireEvent.click(screen.getByTitle("Delete"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Deleted", description: '"G" removed.' }));
    const del = requests.find((r) => r.init?.method === "DELETE");
    expect(del?.url).toBe("/api/graphs/g1");
  });
});

describe("Saved graphs panel — share path", () => {
  test("an invite share normalises the list and posts it", async () => {
    signedIn = true; useGraphStore.setState({ tier: "free" });
    graphs = [savedRow()];
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    await openShareDialog();
    fireEvent.change(screen.getByLabelText("Invited emails"), { target: { value: " A@X.com , b@x.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Invites sent", description: "Emailed 2 invitees a private link." }),
    );
    const post = requests.find((r) => r.url === "/api/share" && r.init?.method === "POST");
    const body = JSON.parse(String(post?.init?.body));
    expect(body.invited_emails).toEqual(["a@x.com", "b@x.com"]);
    expect(body.access).toBe("invite");
    expect(body.in_gallery).toBe(false);
  });

  test("a malformed invite address blocks the request", async () => {
    signedIn = true; useGraphStore.setState({ tier: "free" });
    graphs = [savedRow()];
    render(<SavedGraphsPanel onRequireAuth={onRequireAuth} />);
    await openShareDialog();
    fireEvent.change(screen.getByLabelText("Invited emails"), { target: { value: "a@x.com, nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Invalid email", description: '"nope" is not a valid email.', variant: "destructive" }),
      ),
    );
    expect(requests.filter((r) => r.url === "/api/share" && r.init?.method === "POST")).toHaveLength(0);
  });
});
