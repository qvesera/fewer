/**
 * Characterization suite for ShareDialog.
 * Covers empty graph, hash-URL path, DB-backup path,
 * guest restriction, copy-to-clipboard, and close behavior.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { SHARE_HASH_THRESHOLD } from "@/lib/fewer/share";

const toast = mock(() => {});
mock.module("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

let signedIn = false;
mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: signedIn ? { id: "u1", email: "a@b.com" } : null,
    loading: false,
  }),
}));

const { ShareDialog } = await import("@/components/fewer/ShareDialog");
const { useGraphStore } = await import("@/store/graphStore");
const { encodeShareData } = await import("@/lib/fewer/share");
const initial = useGraphStore.getInitialState();

function makeNodes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: "folder" as const,
    position: { x: 0, y: i * 100 },
    data: { label: `card${i}`, path: `/card${i}`, type: "folder" as const },
  }));
}

function seedStore(extra: Record<string, any> = {}) {
  act(() =>
    useGraphStore.setState({
      ...initial,
      shareOpen: true,
      nodes: [],
      edges: [],
      tags: [],
      ...extra,
    }),
  );
}

function state() { return useGraphStore.getState(); }
function bodyText() { return document.body.textContent || ""; }
function clickButton(text: string) {
  const btn = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.trim().includes(text),
  );
  if (btn) fireEvent.click(btn);
  return btn;
}

beforeEach(() => {
  signedIn = false;
  toast.mockClear();
  document.body.innerHTML = "";
  seedStore();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("ShareDialog rendering", () => {
  test("renders Share Graph title", () => {
    render(<ShareDialog />);
    expect(bodyText()).toContain("Share Graph");
  });

  test("shows nothing to share when graph is empty", () => {
    render(<ShareDialog />);
    expect(bodyText()).toContain("Nothing to share");
  });

  test("shows Generate link button when graph is non-empty", () => {
    seedStore({ nodes: makeNodes(1), edges: [] });
    render(<ShareDialog />);
    expect(bodyText()).toContain("Generate link");
  });

  test("shows card and edge count when graph is non-empty", () => {
    seedStore({
      nodes: makeNodes(3),
      edges: [{ id: "e0", source: "n0", target: "n1" }],
    });
    render(<ShareDialog />);
    expect(bodyText()).toContain("3 cards");
    expect(bodyText()).toContain("1 edge");
  });
});

describe("ShareDialog hash URL path", () => {
  test("small graph produces hash URL in input", async () => {
    const nodes = makeNodes(2);
    const data = { nodes, edges: [], localRootPath: null };
    const encoded = encodeShareData(data);
    expect(encoded.length).toBeLessThanOrEqual(SHARE_HASH_THRESHOLD);
    seedStore({ nodes, edges: [] });
    render(<ShareDialog />);
    clickButton("Generate link");
    await waitFor(() => {
      const input = document.querySelector("input[readonly]") as HTMLInputElement | null;
      expect(input?.value).toContain("#");
    });
  });

  test("small graph does NOT hit /api/share", async () => {
    const fetchSpy = mock(() => Promise.resolve({ json: () => Promise.resolve({}) }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      seedStore({ nodes: makeNodes(2), edges: [] });
      render(<ShareDialog />);
      clickButton("Generate link");
      await waitFor(() => {
        expect(document.querySelector("input[readonly]")).toBeTruthy();
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

/**
 * Build nodes with random paths so LZString can't compress below threshold.
 * Random 64-char suffixes per node ≈ 50 nodes × ~80 chars JSON ≈ 4000+ chars
 * even after compression — well above SHARE_HASH_THRESHOLD (2000).
 */
function makeBigNodes(count: number) {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: "folder" as const,
    position: { x: 0, y: i * 100 },
    data: {
      label: `card${i}-${rand()}${rand()}${rand()}`,
      path: `/card${i}/${rand()}${rand()}${rand()}${rand()}`,
      type: "folder" as const,
    },
  }));
}

describe("ShareDialog guest restriction", () => {
  test("encoded > threshold + guest → destructive toast", async () => {
    const bigNodes = makeBigNodes(60);
    const encoded = encodeShareData({ nodes: bigNodes, edges: [], localRootPath: null });
    expect(encoded.length).toBeGreaterThan(SHARE_HASH_THRESHOLD);
    signedIn = false;
    seedStore({ nodes: bigNodes, edges: [] });
    render(<ShareDialog />);
    clickButton("Generate link");
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Sign in to share this graph", variant: "destructive" }),
      );
    });
  });
});

describe("ShareDialog signed-in DB path", () => {
  test("encoded > threshold + signed-in → fetches /api/share", async () => {
    const bigNodes = makeBigNodes(60);
    const encoded = encodeShareData({ nodes: bigNodes, edges: [], localRootPath: null });
    expect(encoded.length).toBeGreaterThan(SHARE_HASH_THRESHOLD);
    const fetchSpy = mock(() => Promise.resolve({
      json: () => Promise.resolve({ id: "test-id-123" }),
    }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      signedIn = true;
      seedStore({ nodes: bigNodes, edges: [] });
      render(<ShareDialog />);
      clickButton("Generate link");
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/api/share", expect.anything());
      });
      const input = document.querySelector("input[readonly]") as HTMLInputElement | null;
      expect(input?.value).toContain("#s:test-id-123");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("fetch failure falls back to hash URL", async () => {
    const bigNodes = makeBigNodes(60);
    const encoded = encodeShareData({ nodes: bigNodes, edges: [], localRootPath: null });
    expect(encoded.length).toBeGreaterThan(SHARE_HASH_THRESHOLD);
    const fetchSpy = mock(() => Promise.reject(new Error("net")));
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      signedIn = true;
      seedStore({ nodes: bigNodes, edges: [] });
      render(<ShareDialog />);
      clickButton("Generate link");
      await waitFor(() => {
        const input = document.querySelector("input[readonly]") as HTMLInputElement | null;
        expect(input?.value).toContain("#");
        expect(input?.value).not.toContain("#s:");
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("ShareDialog clipboard", () => {
  test("copy writes to clipboard and shows Copied", async () => {
    seedStore({ nodes: makeNodes(1), edges: [] });
    render(<ShareDialog />);
    clickButton("Generate link");
    await waitFor(() => expect(document.querySelector("input[readonly]")).toBeTruthy());
    const writeSpy = mock(() => Promise.resolve());
    const origWrite = navigator.clipboard?.writeText;
    if (navigator.clipboard) navigator.clipboard.writeText = writeSpy;
    try {
      clickButton("Copy");
      await waitFor(() => {
        expect(writeSpy).toHaveBeenCalled();
        expect(bodyText()).toContain("Copied");
      });
    } finally {
      if (navigator.clipboard && origWrite) navigator.clipboard.writeText = origWrite;
    }
  });

  test("clipboard failure shows destructive toast", async () => {
    seedStore({ nodes: makeNodes(1), edges: [] });
    render(<ShareDialog />);
    clickButton("Generate link");
    await waitFor(() => expect(document.querySelector("input[readonly]")).toBeTruthy());
    const writeSpy = mock(() => Promise.reject(new Error("denied")));
    const origWrite = navigator.clipboard?.writeText;
    if (navigator.clipboard) navigator.clipboard.writeText = writeSpy;
    try {
      clickButton("Copy");
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Could not copy", variant: "destructive" }),
        );
      });
    } finally {
      if (navigator.clipboard && origWrite) navigator.clipboard.writeText = origWrite;
    }
  });
});

describe("ShareDialog close", () => {
  test("Close button sets shareOpen to false", () => {
    render(<ShareDialog />);
    clickButton("Close");
    expect(state().shareOpen).toBe(false);
  });
});
