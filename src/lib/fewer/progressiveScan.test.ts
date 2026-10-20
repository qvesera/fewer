import { describe, expect, test } from "bun:test";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import {
  DEFAULT_MAX_NODES,
  DEFAULT_SKELETON_DEPTH,
  continueScan,
  scanSkeleton,
  type ScanBatch,
  type ScanDirEntry,
  type ScanQueueItem,
} from "./progressiveScan";

// The walker is injected-listing (T-205), so the fixture is just a map of
// absolute path → entries. The tree: /r has a/ b/ node_modules/; a has a1/;
// b has b1/; depth-3 folders stay queued after the skeleton.

const OPTS: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS };

const FS: Record<string, ScanDirEntry[]> = {
  "/r": [
    { name: "a", type: "folder" },
    { name: "b", type: "folder" },
    { name: "node_modules", type: "folder" },
    { name: "readme.md", type: "file", size: 10 },
  ],
  "/r/a": [{ name: "a1", type: "folder" }],
  "/r/b": [{ name: "b1", type: "folder" }],
  "/r/a/a1": [
    { name: "deep.txt", type: "file", size: 1 },
    { name: "sub", type: "folder" },
  ],
  "/r/b/b1": [{ name: "deep2.txt", type: "file", size: 1 }],
  "/r/a/a1/sub": [{ name: "deepest.txt", type: "file", size: 1 }],
};

function engine(onBatch: (b: ScanBatch) => void, options: ImportOptions = OPTS) {
  return {
    options,
    listAll: async (abs: string) => FS[abs] ?? [],
    onBatch,
  };
}

describe("scanSkeleton", () => {
  test("emits the first levels, leaves deeper folders queued", async () => {
    // scanSkeleton collects the batches itself; the engine's onBatch is ignored.
    const result = await scanSkeleton("/r", engine(() => {}), DEFAULT_SKELETON_DEPTH);
    const parents = result.batches.map((b) => b.parentPath).sort();
    // depth 0, 1 and 2 are read (a, b, a/a1, b/b1); node_modules filtered.
    expect(parents).toEqual(["", "a", "a/a1", "b", "b/b1"]);
    expect(result.scanned).toBeGreaterThan(0);
    // Depth-3 contents were never read — nothing with parentPath a/a1/sub.
    expect(parents.some((p) => p.startsWith("a/a1/") || p.startsWith("b/b1/"))).toBe(false);
    // The queue carries the depth-3 folders for the background pass.
    const queued = result.queue.map((q) => q.rel).sort();
    expect(queued).toEqual(["a/a1/sub"]);
    expect(result.queue[0]!.depth).toBe(3);
  });

  test("skip list and extension filters apply per directory", async () => {
    const first = await scanSkeleton("/r", engine(() => {}), DEFAULT_SKELETON_DEPTH);
    const rootBatch = first.batches.find((b) => b.parentPath === "")!;
    expect(rootBatch.entries.some((e) => e.name === "node_modules")).toBe(false);

    const extOpts: ImportOptions = { ...OPTS, extensions: ["md"] };
    const extResult = await scanSkeleton("/r", engine(() => {}, extOpts), DEFAULT_SKELETON_DEPTH);
    const extRoot = extResult.batches.find((b) => b.parentPath === "")!;
    expect(extRoot.entries.some((e) => e.name === "readme.md")).toBe(true);
  });
});

describe("continueScan", () => {
  test("drains the remaining queue and reports no unscanned folders", async () => {
    const skeleton = await scanSkeleton("/r", engine(() => {}), DEFAULT_SKELETON_DEPTH);
    const batches: ScanBatch[] = [];
    const result = await continueScan(skeleton.queue, engine((b) => batches.push(b)));
    expect(result.stopped).toBe(false);
    expect(result.unscanned).toEqual([]);
    expect(batches.some((b) => b.parentPath === "a/a1/sub")).toBe(true);
  });

  test("node budget stops the walk and reports what it never reached", async () => {
    const queue: ScanQueueItem[] = [
      { abs: "/r/a/a1/sub", rel: "a/a1/sub", depth: 3 },
      { abs: "/r/b/b1", rel: "b/b1", depth: 3 },
    ];
    const result = await continueScan(queue, engine(() => {}), { maxNodes: 1 });
    expect(result.stopped).toBe(true);
    expect(result.unscanned.length).toBe(1);
    expect(DEFAULT_MAX_NODES).toBe(25_000);
  });

  test("abort stops the walk immediately", async () => {
    const controller = new AbortController();
    controller.abort();
    const queue: ScanQueueItem[] = [{ abs: "/r/a/a1/sub", rel: "a/a1/sub", depth: 3 }];
    const cfg = { ...engine(() => {}), signal: controller.signal };
    const result = await continueScan(queue, cfg);
    expect(result.stopped).toBe(true);
    expect(result.unscanned).toEqual(["a/a1/sub"]);
  });
});