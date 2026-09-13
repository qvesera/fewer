import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { runUrlImport } from "./importActionUrl";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import type { OriginSource } from "./importFlow";

/**
 * Seed the real store instead of mocking the modules.
 *
 * runUrlImport reads only two things from the store — the node count and
 * collectAutoHideNotes' autoHideCount/autoHideThreshold — and every other
 * collaborator is injected via ctx. A `mock.module("@/store/graphStore")`
 * here would leak into every later test file in bun's shared process and
 * replace their store binding with a stub that lacks setState/createTag
 * (observed breaking tagsStore and other store suites depending on file
 * evaluation order).
 */
function seedStore({ nodeCount = 3, autoHideCount = 0 }: { nodeCount?: number; autoHideCount?: number } = {}) {
  useGraphStore.setState({
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      type: "folder",
      position: { x: 0, y: 0 },
      data: { label: `n${i}`, path: `/n${i}`, type: "folder" },
    })) as never,
    edges: [],
    autoHideCount,
    autoHideThreshold: 5,
  });
}

beforeEach(() => seedStore());

function opts(n: Partial<ImportOptions> = {}): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...n };
}

function urlSource(n: Partial<{ url: string; watch: boolean }> = {}): Extract<OriginSource, { origin: "url" }> {
  return { origin: "url", url: n.url ?? "http://example.com/dir/", watch: n.watch ?? false } as Extract<OriginSource, { origin: "url" }>;
}

interface CtxOverrides {
  importUrl?: (url: string, options?: ImportOptions) => Promise<boolean>;
  getTruncated?: () => boolean;
  watchUrl?: (url: string) => Promise<boolean>;
}

function ctx(n: CtxOverrides = {}) {
  const calls = { importUrl: 0, watch: 0 };
  return {
    calls,
    importUrl: n.importUrl ?? (async () => { calls.importUrl++; return true; }),
    getTruncated: n.getTruncated ?? (() => false),
    watchUrl: n.watchUrl ?? (async () => { calls.watch++; return true; }),
  };
}

describe("runUrlImport", () => {
  test("empty URL → 'Nothing to import' without calling importUrl", async () => {
    const c = ctx();
    const r = await runUrlImport(urlSource({ url: "   " }), opts(), c);
    expect(r.ok).toBe(false);
    expect(r.title).toBe("Nothing to import");
    expect(r.error).toBe("Enter a URL first.");
    expect(c.calls.importUrl).toBe(0);
  });

  test("failed import → fixed error message", async () => {
    const c = ctx({ importUrl: async () => false });
    const r = await runUrlImport(urlSource(), opts(), c);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Could not fetch or parse the URL.");
  });

  test("success → card count description + auto-hide note", async () => {
    seedStore({ autoHideCount: 2 });
    const c = ctx();
    const r = await runUrlImport(urlSource(), opts(), c);
    expect(r.ok).toBe(true);
    expect(r.description).toBe("3 cards loaded.");
    expect(r.notes).toHaveLength(1);
    expect(r.notes![0]!.title).toBe("Large folders collapsed");
    expect(r.notes![0]!.description).toContain("2 items were auto-hidden");
  });

  test("success with nothing auto-hidden → no notes", async () => {
    const c = ctx();
    const r = await runUrlImport(urlSource(), opts(), c);
    expect(r.ok).toBe(true);
    expect(r.notes).toEqual([]);
  });

  test("truncation note prepended before auto-hide notes", async () => {
    seedStore({ autoHideCount: 2 });
    const c = ctx({ getTruncated: () => true });
    const r = await runUrlImport(urlSource(), opts(), c);
    expect(r.notes![0]!.title).toBe("Crawl limit reached");
    expect(r.notes).toHaveLength(2);
  });

  test("watch requested + non-github URL → watch registered with success note", async () => {
    const c = ctx();
    const r = await runUrlImport(urlSource({ url: "http://example.com/dir/", watch: true }), opts(), c);
    expect(c.calls.watch).toBe(1);
    expect(r.notes!.some((n) => n.title === "Watching for changes")).toBe(true);
  });

  test("watch setup failure → 'Could not watch' note", async () => {
    const c = ctx({ watchUrl: async () => false });
    const r = await runUrlImport(urlSource({ watch: true }), opts(), c);
    expect(r.notes!.some((n) => n.title === "Could not watch")).toBe(true);
  });

  test("github URL suppresses the watch even with a stale watch flag", async () => {
    const c = ctx();
    const r = await runUrlImport(urlSource({ url: "https://github.com/user/repo", watch: true }), opts(), c);
    expect(c.calls.watch).toBe(0);
    expect(r.notes!.some((n) => n.title.includes("watch"))).toBe(false);
  });

  test("thrown error → normalized failure result", async () => {
    const c = ctx({ importUrl: async () => { throw new Error("boom"); } });
    const r = await runUrlImport(urlSource(), opts(), c);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("boom");
  });
});
