import { describe, expect, test, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { cancelActiveScan, startBackgroundScanWith } from "./progressiveOpen";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import { buildGraphFromBatches } from "./progressiveGraph";
import { clearScanStatus, getScanStatus } from "./scanStatus";
import { scanSkeleton, type ScanBatch, type ScanDirEntry } from "./progressiveScan";

// T-220: archives inside the SKELETON levels. The skeleton phase has no archive
// reader (reading a 64MB zip would undo the sub-second first paint) and files
// are never re-read by the queue walk, so before this fix a zip at depth 0–2
// stayed a plain leaf card forever — the reported bug ("import does not expand
// the zips") for a folder whose zips sit at its top level.
//
// The contract these tests pin down:
//   1. the skeleton emits archives as archive CONTAINERS (folder + isArchive)
//      and reports them in `archives`;
//   2. the background pass expands those FIRST, before walking the queue;
//   3. members wire under the archive card (never the root) — i.e. they resolve
//      through the same buffered-parent path as any other batch;
//   4. a scan without a reader leaves them as containers and changes nothing.

const ROOT = "zips";
const OPTIONS: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, expandArchives: true };

const DIRS: Record<string, ScanDirEntry[]> = {
  "/zips": [
    { name: "Logos.zip", type: "file", size: 100 },
    { name: "src", type: "folder" },
    { name: "readme.md", type: "file", size: 2 },
  ],
  "/zips/src": [
    { name: "deep.zip", type: "file", size: 40 },
    { name: "inner", type: "folder" },
  ],
  "/zips/src/inner": [{ name: "deeper", type: "folder" }],
  "/zips/src/inner/deeper": [],
};

const listAll = async (abs: string): Promise<ScanDirEntry[]> => {
  const entries = DIRS[abs];
  if (!entries) throw new Error(`ENOENT: ${abs}`);
  return entries;
};

/** Fake archive reader: member batches, parentPath = the archive's own path. */
function makeReader(read: string[]) {
  return async (_abs: string, rel: string, depth: number): Promise<ScanBatch[] | null> => {
    read.push(rel);
    if (rel === "Logos.zip") {
      return [
        { parentPath: rel, parentDepth: depth, entries: [{ name: "logo.svg", type: "file", size: 1 }] },
      ];
    }
    if (rel === "src/deep.zip") {
      return [
        { parentPath: rel, parentDepth: depth, entries: [{ name: "nested", type: "folder" }] },
        {
          parentPath: `${rel}/nested`,
          parentDepth: depth + 1,
          entries: [{ name: "x.txt", type: "file", size: 1 }],
        },
      ];
    }
    return null;
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("skeleton-depth archives (T-220)", () => {
  beforeEach(() => {
    cancelActiveScan();
    clearScanStatus();
  });

  test("the background pass expands the skeleton's archives first, under their card", async () => {
    const skeleton = await scanSkeleton("/zips", { options: OPTIONS, listAll }, 2);
    // Both archives were read by the skeleton, so both must be reported.
    expect(skeleton.archives.map((a) => a.rel)).toEqual(["Logos.zip", "src/deep.zip"]);

    const graph = buildGraphFromBatches(ROOT, skeleton.batches, { includeFiles: true });
    useGraphStore.getState().setGraph(graph.nodes, graph.edges, false);

    const read: string[] = [];
    startBackgroundScanWith({
      rootAbs: "/zips",
      rootName: ROOT,
      options: OPTIONS,
      queue: skeleton.queue,
      initialScanned: skeleton.scanned,
      archives: skeleton.archives,
      io: { listAll, readArchiveMembers: makeReader(read) },
    });

    await waitFor(() => !getScanStatus().active);
    await waitFor(() =>
      useGraphStore.getState().nodes.some((n) => n.data.path === `${ROOT}/src/deep.zip/nested/x.txt`),
    );

    // The reported archives are expanded before the queue walk; the deeper
    // folder queued by the skeleton is still visited.
    expect(read).toEqual(["Logos.zip", "src/deep.zip"]);
    const paths = useGraphStore.getState().nodes.map((n) => n.data.path);
    expect(paths).toContain(`${ROOT}/Logos.zip/logo.svg`);
    expect(paths).toContain(`${ROOT}/src/inner/deeper`);

    const { nodes, edges } = useGraphStore.getState();
    const byPath = new Map<string, (typeof nodes)[number]>(
      nodes.map((n) => [n.data.path ?? "", n]),
    );
    const zip = byPath.get(`${ROOT}/Logos.zip`)!;
    // The card is an archive container, not a leaf file…
    expect(zip.data.type).toBe("folder");
    expect(zip.data.isArchive).toBe(true);
    // …and its members hang off IT, not the root (the T-212 fallback would
    // have attached them to the root if the parent batch had not landed).
    const parentOf = new Map(edges.map((e) => [e.target, e.source]));
    expect(parentOf.get(byPath.get(`${ROOT}/Logos.zip/logo.svg`)!.id)).toBe(zip.id);
    expect(parentOf.get(byPath.get(`${ROOT}/src/deep.zip`)!.id)).toBe(
      byPath.get(`${ROOT}/src`)!.id,
    );
    const deepZip = byPath.get(`${ROOT}/src/deep.zip`)!;
    expect(deepZip.data.isArchive).toBe(true);
    expect(parentOf.get(byPath.get(`${ROOT}/src/deep.zip/nested/x.txt`)!.id)).toBe(
      byPath.get(`${ROOT}/src/deep.zip/nested`)!.id,
    );

    // The graph stayed ONE tree: every non-root node has exactly one parent.
    const hasParent = new Set(edges.map((e) => e.target));
    expect(edges).toHaveLength(nodes.length - 1);
    expect(nodes.filter((n) => !n.data.isRoot && !hasParent.has(n.id))).toHaveLength(0);
  }, 15_000);

  test("without a reader the archives stay containers and nothing is invented", async () => {
    // The web progressive path never opts into archives; a missing reader must
    // be a no-op rather than a crash or an empty expansion.
    const skeleton = await scanSkeleton("/zips", { options: OPTIONS, listAll }, 2);
    const graph = buildGraphFromBatches(ROOT, skeleton.batches, { includeFiles: true });
    useGraphStore.getState().setGraph(graph.nodes, graph.edges, false);

    startBackgroundScanWith({
      rootAbs: "/zips",
      rootName: ROOT,
      options: OPTIONS,
      queue: skeleton.queue,
      initialScanned: skeleton.scanned,
      archives: skeleton.archives,
      io: { listAll },
    });

    await waitFor(() => !getScanStatus().active);
    const paths = useGraphStore.getState().nodes.map((n) => n.data.path);
    expect(paths).toContain(`${ROOT}/Logos.zip`);
    expect(paths.some((p) => p?.startsWith(`${ROOT}/Logos.zip/`))).toBe(false);
  }, 15_000);
});
