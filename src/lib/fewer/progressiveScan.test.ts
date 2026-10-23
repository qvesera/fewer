import { describe, expect, test } from "bun:test";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import {
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_MS,
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

describe("archives across the phases (T-202/T-220)", () => {
  const ARCHIVE_FS: Record<string, ScanDirEntry[]> = {
    "/r": [
      { name: "src", type: "folder" },
      { name: "Logos.zip", type: "file", size: 100 },
      { name: "notes.txt", type: "file", size: 3 },
    ],
    "/r/src": [{ name: "inner.zip", type: "file", size: 50 }],
  };
  const ARCHIVE_OPTS: ImportOptions = { ...OPTS, expandArchives: true };

  function archiveEngine(onBatch: (b: ScanBatch) => void, options = ARCHIVE_OPTS) {
    return { options, listAll: async (abs: string) => ARCHIVE_FS[abs] ?? [], onBatch };
  }

  test("the skeleton promotes archives to containers and reports them unexpanded", async () => {
    // The skeleton has no archive reader on purpose (sub-second first paint),
    // so a zip is emitted as an archive CONTAINER and handed to `archives` —
    // files are never re-read by the queue walk, so nothing else could expand
    // it (the T-220 bug: root-level zips stayed plain file cards forever).
    const result = await scanSkeleton("/r", archiveEngine(() => {}), DEFAULT_SKELETON_DEPTH);
    expect(result.archives).toEqual([
      { abs: "/r/Logos.zip", rel: "Logos.zip", depth: 1 },
      { abs: "/r/src/inner.zip", rel: "src/inner.zip", depth: 2 },
    ]);
    const rootBatch = result.batches.find((b) => b.parentPath === "")!;
    expect(rootBatch.entries.find((e) => e.name === "Logos.zip")).toMatchObject({
      type: "folder",
      isArchive: true,
    });
    // Non-archive files keep their leaf shape.
    expect(rootBatch.entries.find((e) => e.name === "notes.txt")).toMatchObject({ type: "file" });
    // Nothing was expanded — no batch hangs off either archive.
    expect(result.batches.some((b) => b.parentPath.endsWith(".zip"))).toBe(false);
  });

  test("with a reader attached, the same entries expand inline and report nothing", async () => {
    const read: string[] = [];
    const cfg = {
      ...archiveEngine(() => {}),
      readArchiveMembers: async (_abs: string, rel: string, depth: number) => {
        read.push(`${rel}@${depth}`);
        return [{ parentPath: rel, parentDepth: depth, entries: [{ name: "logo.svg", type: "file" as const }] }];
      },
    };
    const result = await scanSkeleton("/r", cfg, DEFAULT_SKELETON_DEPTH);
    expect(read).toEqual(["Logos.zip@1", "src/inner.zip@2"]);
    expect(result.archives).toEqual([]);
    const memberBatch = result.batches.find((b) => b.parentPath === "Logos.zip")!;
    expect(memberBatch.parentDepth).toBe(1);
    expect(memberBatch.entries.map((e) => e.name)).toEqual(["logo.svg"]);
  });

  test("expandArchives off leaves archives as untouched file entries", async () => {
    const result = await scanSkeleton("/r", archiveEngine(() => {}, OPTS), DEFAULT_SKELETON_DEPTH);
    expect(result.archives).toEqual([]);
    const rootBatch = result.batches.find((b) => b.parentPath === "")!;
    expect(rootBatch.entries.find((e) => e.name === "Logos.zip")).toMatchObject({ type: "file" });
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
    expect(result.reason).toBe("budget"); // resumable — the chip offers Resume
    expect(result.unscanned.length).toBe(1);
    expect(DEFAULT_MAX_NODES).toBe(25_000);
    expect(DEFAULT_MAX_MS).toBe(30_000); // T-215: slow disks get 30s, not 8s
  });

  test("abort stops the walk immediately", async () => {
    const controller = new AbortController();
    controller.abort();
    const queue: ScanQueueItem[] = [{ abs: "/r/a/a1/sub", rel: "a/a1/sub", depth: 3 }];
    const cfg = { ...engine(() => {}), signal: controller.signal };
    const result = await continueScan(queue, cfg);
    expect(result.stopped).toBe(true);
    expect(result.reason).toBe("aborted"); // user stopped it — no badges, no chip
    expect(result.unscanned).toEqual(["a/a1/sub"]);
  });
});