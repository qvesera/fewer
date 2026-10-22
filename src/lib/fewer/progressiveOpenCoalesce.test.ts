import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { cancelActiveScan, startBackgroundScanWith } from "./progressiveOpen";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { buildGraphFromBatches } from "./progressiveGraph";
import { clearScanStatus, getScanStatus } from "./scanStatus";
import type { ScanBatch, ScanDirEntry, ScanQueueItem } from "./progressiveScan";

// T-219: batch coalescing in the background scan. Directories are read
// individually but written to the store ONE append per FLUSH window, with
// parents resolving through the buffer (a child batch may be built before its
// parent batch has landed). These tests drive the real
// `startBackgroundScanWith` against an in-memory directory map and assert the
// coalesced output is byte-for-byte the tree the eager path would have built.

const OPTIONS = { ...DEFAULT_IMPORT_OPTIONS, includeFiles: false, expandArchives: false };

/** In-memory filesystem: abs path → entries. */
type DirMap = Record<string, ScanDirEntry[]>;

function makeIo(dirs: DirMap): { listAll: (abs: string) => Promise<ScanDirEntry[]> } {
  return {
    listAll: async (abs) => {
      const entries = dirs[abs];
      if (!entries) throw new Error(`ENOENT: ${abs}`);
      return entries;
    },
  };
}

/** Wait until `predicate` holds (the scan runs on real timers/IO microtasks). */
async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Root skeleton + queue, as `openSkeletonWith` would leave them. */
function seedSkeleton(rootName: string, batches: ScanBatch[], queue: ScanQueueItem[]): void {
  const graph = buildGraphFromBatches(rootName, batches, { includeFiles: false });
  useGraphStore.getState().setGraph(graph.nodes, graph.edges, false);
}

const ROOT = "proj";

describe("background scan coalescing (T-219)", () => {
  beforeEach(() => {
    cancelActiveScan();
    clearScanStatus();
  });

  test("batches flush through the buffer into one coherent tree", async () => {
    // proj/ → [src, docs]; src/ → [lib]; docs/ → []; lib/ → [core]
    // The lib/ and core/ batches arrive BEFORE proj/src lands in the store
    // (FLUSH_MS window), which is exactly what pendingPathId must resolve.
    const dirs: DirMap = {
      "/proj": [
        { name: "src", type: "folder" },
        { name: "docs", type: "folder" },
      ],
      "/proj/src": [{ name: "lib", type: "folder" }],
      "/proj/docs": [],
      "/proj/src/lib": [{ name: "core", type: "folder" }],
      "/proj/src/lib/core": [],
    };
    const rootBatches: ScanBatch[] = [{ parentPath: "", parentDepth: 0, entries: dirs["/proj"] }];
    seedSkeleton(ROOT, rootBatches, [
      { abs: "/proj/src", rel: "src", depth: 1 },
      { abs: "/proj/docs", rel: "docs", depth: 1 },
    ]);

    startBackgroundScanWith({
      rootAbs: "/proj",
      rootName: ROOT,
      options: OPTIONS,
      queue: [
        { abs: "/proj/src", rel: "src", depth: 1 },
        { abs: "/proj/docs", rel: "docs", depth: 1 },
      ],
      io: makeIo(dirs),
    });

    // Scan runs fast; the final scan-end flush is synchronous after the queue
    // drains — wait for the chip to go idle, then for the async tail.
    await waitFor(() => !getScanStatus().active);
    await waitFor(() => {
      const nodes = useGraphStore.getState().nodes;
      return nodes.some((n) => n.data.path === `${ROOT}/src/lib/core`);
    });

    const { nodes, edges } = useGraphStore.getState();
    const byPath = new Map<string, (typeof nodes)[number]>(
      nodes.map((n) => [n.data.path, n]),
    );
    const idOf = (p: string) => byPath.get(p)?.id;

    // Every directory exists exactly once — no duplicates across flush windows.
    expect(nodes.length).toBe(5); // root, src, docs, lib, core
    expect(new Set(nodes.map((n) => n.data.path)).size).toBe(nodes.length);

    // The tree is fully wired root → src → lib → core and root → docs.
    // A missed pendingPathId resolution would have attached lib/core to the
    // root instead (the T-212 orphan fallback).
    const parentOf = new Map(edges.map((e) => [e.target, e.source]));
    expect(parentOf.get(idOf(`${ROOT}/src/lib`)!)).toBe(idOf(`${ROOT}/src`));
    expect(parentOf.get(idOf(`${ROOT}/src/lib/core`)!)).toBe(idOf(`${ROOT}/src/lib`));
    expect(parentOf.get(idOf(`${ROOT}/docs`)!)).toBe(idOf(ROOT));
    expect(parentOf.get(idOf(`${ROOT}/src`)!)).toBe(idOf(ROOT));
    expect(edges.length).toBe(4);
  }, 15_000);

  test("cancelActiveScan flushes the buffer (folder stays as loaded so far)", async () => {
    // The first read completes (its batch lands in the BUFFER, not the store —
    // FLUSH_MS has not fired), then every deeper read hangs: the queue can
    // never drain, so the scan-end flush can never save us. The only way
    // `src/deep` reaches the store is cancelActiveScan's own flush — which is
    // exactly the chip's ✕ contract ("the folder stays as loaded so far").
    const hang = (): Promise<ScanDirEntry[]> => new Promise<ScanDirEntry[]>(() => {});
    const dirs: DirMap = {
      "/proj": [{ name: "src", type: "folder" }],
      "/proj/src": [{ name: "deep", type: "folder" }],
      "/proj/src/deep": [],
    };
    const rootBatches: ScanBatch[] = [{ parentPath: "", parentDepth: 0, entries: dirs["/proj"] }];
    seedSkeleton(ROOT, rootBatches, [{ abs: "/proj/src", rel: "src", depth: 1 }]);

    startBackgroundScanWith({
      rootAbs: "/proj",
      rootName: ROOT,
      options: OPTIONS,
      queue: [{ abs: "/proj/src", rel: "src", depth: 1 }],
      io: {
        listAll: async (abs) => (abs === "/proj/src" ? dirs[abs] : hang()),
      },
    });
    // The src batch is emitted (buffered) but must not be in the store yet —
    // proves the cancel below has real work to flush.
    await waitFor(() => getScanStatus().scanned >= 1);
    expect(useGraphStore.getState().nodes.map((n) => n.data.path)).not.toContain(`${ROOT}/src/deep`);

    cancelActiveScan();

    const paths = useGraphStore.getState().nodes.map((n) => n.data.path);
    expect(paths).toContain(`${ROOT}/src/deep`);
    // Chip cleared by the cancel itself (the scan-end tail early-returns on the
    // generation change and never reaches clearScanStatus).
    expect(getScanStatus().active).toBe(false);

    // Nothing lands AFTER the cancel: wait past one FLUSH window and re-check.
    await new Promise((r) => setTimeout(r, 300));
    const after = useGraphStore.getState().nodes.map((n) => n.data.path);
    expect(after.sort()).toEqual(paths.sort());
    expect(getScanStatus().active).toBe(false);
  }, 15_000);
});
