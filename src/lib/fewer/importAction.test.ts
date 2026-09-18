import { beforeEach, describe, expect, mock, test } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import type { ImportActionResult, OriginSource } from "./importFlow";

/**
 * Only the three actions that touch file-system / network APIs are mocked;
 * runUrlImport runs for real so the URL seam (watch wiring, hook-error
 * override) is exercised as composed. None of those three modules is imported
 * by another src test, which matters because bun's mock.module registry is
 * process-wide and would otherwise replace a real binding for a later file.
 */
const runFolderImport = mock<() => Promise<ImportActionResult>>(async () => ({
  ok: true,
  title: "Directory loaded",
}));
const runFileImport = mock<
  (
    source: Extract<OriginSource, { origin: "file" }>,
    options: ImportOptions,
  ) => Promise<ImportActionResult>
>(async () => ({ ok: true, title: "Graph built from file" }));
const runCloudImport = mock<
  (
    source: Extract<OriginSource, { origin: "cloud" }>,
    options: ImportOptions,
  ) => Promise<ImportActionResult>
>(async () => ({ ok: true, title: "Imported from cloud" }));

mock.module("@/lib/fewer/importActionFolder", () => ({ runFolderImport }));
mock.module("@/lib/fewer/importActionFile", () => ({ runFileImport }));
mock.module("@/lib/fewer/importActionCloud", () => ({ runCloudImport }));

const { runImport } = await import("./importAction");

/**
 * Seed the real store instead of mocking it — runUrlImport reads the node count
 * and collectAutoHideNotes' thresholds straight off it, and a
 * mock.module("@/store/graphStore") would leak into every later test file.
 */
function seedStore({ nodeCount = 3, autoHideCount = 0 } = {}) {
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

function opts(n: Partial<ImportOptions> = {}): ImportOptions {
  return { ...DEFAULT_IMPORT_OPTIONS, ...n };
}

interface CtxOverrides {
  importUrl?: (url: string, options?: ImportOptions) => Promise<boolean>;
  urlError?: string | null;
  truncated?: boolean;
  watchUrl?: (url: string) => Promise<boolean>;
}

function ctx(n: CtxOverrides = {}) {
  const calls = { importUrl: 0, watch: 0, watchUrls: [] as string[] };
  const snapshot = { error: n.urlError ?? null, truncated: n.truncated ?? false };
  return {
    calls,
    importUrl:
      n.importUrl ??
      (async () => {
        calls.importUrl++;
        return true;
      }),
    getUrlResult: () => snapshot,
    watchUrl:
      n.watchUrl ??
      (async (url: string) => {
        calls.watch++;
        calls.watchUrls.push(url);
        return true;
      }),
  };
}

beforeEach(() => {
  seedStore();
  runFolderImport.mockClear();
  runFileImport.mockClear();
  runCloudImport.mockClear();
});

describe("runImport dispatch", () => {
  test("folder → runFolderImport with the options only", async () => {
    const o = opts({ includeHidden: true });
    const r = await runImport({ origin: "folder" }, o, ctx());
    expect(r.ok).toBe(true);
    expect(runFolderImport).toHaveBeenCalledTimes(1);
    expect(runFolderImport).toHaveBeenCalledWith(o);
    expect(runFileImport).not.toHaveBeenCalled();
    expect(runCloudImport).not.toHaveBeenCalled();
  });

  test("file → runFileImport with the source and options", async () => {
    const source = { origin: "file", content: "root {{ child }}", format: "tree" } as const;
    const o = opts();
    await runImport(source, o, ctx());
    expect(runFileImport).toHaveBeenCalledWith(source, o);
    expect(runFolderImport).not.toHaveBeenCalled();
  });

  test("cloud → runCloudImport with the source and options", async () => {
    const source = {
      origin: "cloud",
      connectionId: "c1",
      provider: "github",
      ref: "owner/repo",
      name: "repo",
    } as const;
    const o = opts();
    await runImport(source, o, ctx());
    expect(runCloudImport).toHaveBeenCalledWith(source, o);
  });

  test("cancelled result from a runner is passed through untouched", async () => {
    runFolderImport.mockResolvedValueOnce({
      ok: false,
      cancelled: true,
      title: "Import cancelled",
    });
    const r = await runImport({ origin: "folder" }, opts(), ctx());
    expect(r.cancelled).toBe(true);
    expect(r.title).toBe("Import cancelled");
  });
});

describe("runImport url origin", () => {
  const url = (n: Partial<{ url: string; watch: boolean }> = {}): OriginSource => ({
    origin: "url",
    url: n.url ?? "http://example.com/dir/",
    watch: n.watch ?? false,
  });

  test("no watch flag → no watch registered", async () => {
    const c = ctx();
    const r = await runImport(url(), opts(), c);
    expect(r.ok).toBe(true);
    expect(c.calls.watch).toBe(0);
  });

  test("watch flag → watch registered with the URL", async () => {
    const c = ctx();
    const r = await runImport(url({ watch: true }), opts(), c);
    expect(r.ok).toBe(true);
    expect(c.calls.watch).toBe(1);
    expect(c.calls.watchUrls).toEqual(["http://example.com/dir/"]);
  });

  test("github URL suppresses the watch even with a stale watch flag", async () => {
    const c = ctx();
    await runImport(url({ url: "https://github.com/user/repo", watch: true }), opts(), c);
    expect(c.calls.watch).toBe(0);
  });

  test("failed import surfaces the hook's own error over the generic one", async () => {
    const c = ctx({ importUrl: async () => false, urlError: "No public index at that URL" });
    const r = await runImport(url(), opts(), c);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("No public index at that URL");
  });

  test("failed import with no hook error keeps the generic message", async () => {
    const c = ctx({ importUrl: async () => false });
    const r = await runImport(url(), opts(), c);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Could not fetch or parse the URL.");
  });

  test("successful import is never overwritten by a stale hook error", async () => {
    const c = ctx({ urlError: "stale error from a previous run" });
    const r = await runImport(url(), opts(), c);
    expect(r.ok).toBe(true);
    expect(r.description).toBe("3 cards loaded.");
  });

  test("truncation is read from the hook snapshot", async () => {
    const c = ctx({ truncated: true });
    const r = await runImport(url(), opts(), c);
    expect(r.notes!.some((n) => n.title === "Crawl limit reached")).toBe(true);
  });

  test("options reach the hook", async () => {
    const seen: ImportOptions[] = [];
    const c = ctx({
      importUrl: async (_url, options) => {
        if (options) seen.push(options);
        return true;
      },
    });
    const o = opts({ maxDepth: 2 });
    await runImport(url(), o, c);
    expect(seen).toEqual([o]);
  });
});
