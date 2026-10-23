import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { cancelActiveScan, startBackgroundScanWith } from "./progressiveOpen";
import { DEFAULT_IMPORT_OPTIONS } from "./importOptions";
import { buildGraphFromBatches } from "./progressiveGraph";
import { clearScanStatus, getScanStatus } from "./scanStatus";
import type { PendingArchive, ScanBatch, ScanDirEntry, ScanQueueItem } from "./progressiveScan";

// T-221: the auto-hide cap is a SNAPSHOT taken by `setGraph` — `appendGraphBatch`
// only adds nodes/edges. Everything the background scan appends (every archive
// member, every folder's children below the skeleton) therefore escaped it and
// showed regardless of the Auto-hide Limit. These tests drive the real
// `startBackgroundScanWith` and assert the cap is re-derived when the fill lands.

const OPTIONS = { ...DEFAULT_IMPORT_OPTIONS, includeFiles: true, expandArchives: true };
const ROOT = "proj";

/** Six file entries this suite caps (names sort ascending as m1…m6). */
const MEMBERS: ScanDirEntry[] = ["m1", "m2", "m3", "m4", "m5", "m6"].map((name) => ({
  name: `${name}.txt`,
  type: "file" as const,
  size: 1,
}));

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Root skeleton as `openSkeletonWith` would leave it (batch order = parent first). */
function seedSkeleton(batches: ScanBatch[]): void {
  const graph = buildGraphFromBatches(ROOT, batches, { includeFiles: true });
  useGraphStore.getState().setGraph(graph.nodes, graph.edges, false);
}

/** Hidden/visible split of the appended m*.txt members, by path. */
function memberSplit(): { visible: string[]; hidden: string[] } {
  const { nodes, hiddenIds } = useGraphStore.getState();
  const hidden = new Set(hiddenIds as string[]);
  const visible: string[] = [];
  const hiddenPaths: string[] = [];
  for (const n of nodes) {
    const path = n.data.path;
    if (!path?.startsWith(`${ROOT}/`) || !/\/m\d+\.txt$/.test(path)) continue;
    (hidden.has(n.id) ? hiddenPaths : visible).push(path);
  }
  return { visible: visible.sort(), hidden: hiddenPaths.sort() };
}

describe("auto-hide cap after a background scan (T-221)", () => {
  beforeEach(() => {
    cancelActiveScan();
    clearScanStatus();
  });

  afterEach(() => {
    cancelActiveScan();
    clearScanStatus();
    // The store is module-global: never leak the small test threshold into
    // another suite.
    useGraphStore.getState().setAutoHideThreshold(10);
  });

  test("archive members expanded by the fill are capped", async () => {
    // Threshold 4 over 6 members: m1…m4 stay, m5/m6 hide. Before T-221 all six
    // showed — the cap had run on a skeleton where the archive was still empty.
    useGraphStore.getState().setAutoHideThreshold(4);
    seedSkeleton([{ parentPath: "", parentDepth: 0, entries: [{ name: "Logos.zip", type: "folder", isArchive: true }] }]);

    const archives: PendingArchive[] = [{ abs: "/proj/Logos.zip", rel: "Logos.zip", depth: 1 }];
    startBackgroundScanWith({
      rootAbs: "/proj",
      rootName: ROOT,
      options: OPTIONS,
      queue: [],
      archives,
      io: {
        listAll: async () => [],
        readArchiveMembers: async () => [
          { parentPath: "Logos.zip", parentDepth: 1, entries: MEMBERS },
        ],
      },
    });

    await waitFor(() => !getScanStatus().active);
    await waitFor(() => {
      const { visible, hidden } = memberSplit();
      return visible.length + hidden.length === 6;
    });

    const { visible, hidden } = memberSplit();
    expect(visible).toEqual([
      `${ROOT}/Logos.zip/m1.txt`,
      `${ROOT}/Logos.zip/m2.txt`,
      `${ROOT}/Logos.zip/m3.txt`,
      `${ROOT}/Logos.zip/m4.txt`,
    ]);
    expect(hidden).toEqual([`${ROOT}/Logos.zip/m5.txt`, `${ROOT}/Logos.zip/m6.txt`]);
    // Classified as AUTO hides, not manual ones: a later reconcile can re-derive
    // them and a reveal can undo them.
    const { nodes, hiddenIds, autoHiddenIds } = useGraphStore.getState();
    const auto = new Set(autoHiddenIds);
    const hiddenSet = new Set(hiddenIds as string[]);
    const hiddenNodes = nodes.filter((n) => hidden.includes(n.data.path ?? ""));
    expect(hiddenNodes).toHaveLength(2);
    for (const n of hiddenNodes) {
      expect(hiddenSet.has(n.id)).toBe(true);
      expect(auto.has(n.id)).toBe(true);
    }
  }, 15_000);

  test("deep folder children appended by the fill are capped too", async () => {
    // Same gap, no archive involved: a folder below the skeleton arrives with
    // six children after the cap already ran.
    useGraphStore.getState().setAutoHideThreshold(4);
    seedSkeleton([
      { parentPath: "", parentDepth: 0, entries: [{ name: "a", type: "folder" }] },
      { parentPath: "a", parentDepth: 1, entries: [{ name: "b", type: "folder" }] },
    ]);

    const queue: ScanQueueItem[] = [{ abs: "/proj/a/b", rel: "a/b", depth: 2 }];
    startBackgroundScanWith({
      rootAbs: "/proj",
      rootName: ROOT,
      options: OPTIONS,
      queue,
      io: { listAll: async (abs) => (abs === "/proj/a/b" ? MEMBERS : []) },
    });

    await waitFor(() => !getScanStatus().active);
    await waitFor(() => {
      const { visible, hidden } = memberSplit();
      return visible.length + hidden.length === 6;
    });

    const { hidden } = memberSplit();
    expect(hidden).toEqual([`${ROOT}/a/b/m5.txt`, `${ROOT}/a/b/m6.txt`]);
  }, 15_000);

  test("a folder under the limit gains no hides", async () => {
    // Regression guard: the new pass must not invent hides. Default threshold is
    // 10 and the fill appends three children.
    seedSkeleton([{ parentPath: "", parentDepth: 0, entries: [{ name: "a", type: "folder" }] }]);
    startBackgroundScanWith({
      rootAbs: "/proj",
      rootName: ROOT,
      options: OPTIONS,
      queue: [{ abs: "/proj/a", rel: "a", depth: 1 }],
      io: { listAll: async (abs) => (abs === "/proj/a" ? MEMBERS.slice(0, 3) : []) },
    });

    await waitFor(() => !getScanStatus().active);
    await waitFor(() => memberSplit().visible.length === 3);

    expect(useGraphStore.getState().hiddenIds).toEqual([]);
    expect(useGraphStore.getState().autoHiddenIds).toEqual([]);
  }, 15_000);
});
